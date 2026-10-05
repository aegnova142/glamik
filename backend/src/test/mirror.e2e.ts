/**
 * Bidirectional inventory mirroring.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55448/mirror_test \
 *     npx tsx src/test/mirror.e2e.ts
 *
 * SQL_MODE decides which store is AUTHORITATIVE. MIRROR decides whether BOTH
 * stores are written. Conflating the two was the defect: SQL was only ever
 * written when it was authoritative, so with SQL_MODE=false the SQL side
 * received nothing — new orders deducted legacy only, cancellations left
 * reservations ACTIVE, and the stores drifted on ordinary trading.
 *
 * Each case below runs the real application paths (commitOrderStock /
 * restoreOrderStock / applyShippingStatus) and compares both stores after.
 *
 * ATOMICITY NOTE: legacy lives in the cms_state JSONB row and SQL inventory in
 * its own tables. Both are in the same Postgres database, but the writes go
 * through different code paths with their own transactions, so they are not
 * one atomic unit. They are instead serialised inside withStockLock (an
 * in-process mutex plus a pg advisory lock), so no two mutations interleave. A
 * process crash between the two writes would leave them inconsistent; that is
 * what inventory:verify detects and inventory:resync corrects.
 */

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

import { pool, loadDatabase, saveDatabase, ensureSchema } from '../db/db';
import { commitOrderStock, restoreOrderStock, applyShippingStatus } from '../services/fulfillment.service';
import { runInventoryHealthChecks, inventoryWriteTargets } from '../services/inventory.service';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

/** The flags are read through getters on every call, so a test can switch
 * modes simply by setting the environment. */
function setMode(sqlMode: boolean, mirror: boolean): void {
  process.env.INVENTORY_SQL_MODE = String(sqlMode);
  process.env.INVENTORY_MIRROR_LEGACY = String(mirror);
}

const PRODUCT = 'mirror-product';
const START_STOCK = 20;

async function reset(): Promise<void> {
  await ensureSchema();
  await pool.query('DELETE FROM inventory_transactions');
  await pool.query('DELETE FROM inventory_reservations');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM order_status_history');
  await pool.query('DELETE FROM shipments');
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM customers');

  const db = await loadDatabase();
  db.products = [
    {
      id: PRODUCT,
      name: 'Mirror Product',
      price: 100,
      stock: START_STOCK,
      inStock: true,
      images: { primary: 'a', secondary: 'b' },
      benefits: [],
    } as any,
  ];
  await saveDatabase(db);

  await pool.query(`INSERT INTO customers (id,name,email,password_hash) VALUES ('c1','T','t@t.local','x')`);
  await pool.query(
    `INSERT INTO inventory (id,product_id,variant_id,size_label,available_stock,reserved_stock,sold_stock)
     VALUES ('inv1',$1,NULL,NULL,$2,0,0)`,
    [PRODUCT, START_STOCK]
  );
}

async function makeOrder(id: string, qty: number, status = 'PLACED'): Promise<void> {
  await pool.query(
    `INSERT INTO orders (id,user_id,order_number,status,subtotal,discount,shipping,total,
                         shipping_address,payment_method,payment_status,stock_committed,stock_restored)
     VALUES ($1,'c1',$2,$3,100,0,0,100,'{}'::jsonb,'cod','COD_PENDING',false,false)`,
    [id, 'GLM-' + id, status]
  );
  await pool.query(
    `INSERT INTO order_items (id,order_id,product_id,product_name,quantity,price)
     VALUES ($1,$2,$3,'Mirror Product',$4,100)`,
    ['oi-' + id, id, PRODUCT, qty]
  );
}

async function state(): Promise<{ legacy: number; available: number; reserved: number; sold: number; active: number }> {
  const db = await loadDatabase();
  const legacy = (db.products as any[]).reduce((n, p) => n + (Number(p.stock) || 0), 0);
  const i = await pool.query(
    `SELECT COALESCE(SUM(available_stock),0)::int a, COALESCE(SUM(reserved_stock),0)::int r,
            COALESCE(SUM(sold_stock),0)::int s FROM inventory`
  );
  const res = await pool.query(
    `SELECT COALESCE(SUM(quantity),0)::int q FROM inventory_reservations WHERE status='ACTIVE'`
  );
  return { legacy: legacy, available: i.rows[0].a, reserved: i.rows[0].r, sold: i.rows[0].s, active: res.rows[0].q };
}

async function run(): Promise<void> {
  // ======================================================================
  section('The write matrix');
  // ======================================================================

  setMode(false, true);
  let t = inventoryWriteTargets();
  check('SQL_MODE=false + MIRROR=true writes both', t.sql && t.legacy, JSON.stringify(t));
  check('...with legacy authoritative', t.sqlAuthoritative === false);

  setMode(true, true);
  t = inventoryWriteTargets();
  check('SQL_MODE=true + MIRROR=true writes both', t.sql && t.legacy, JSON.stringify(t));
  check('...with SQL authoritative', t.sqlAuthoritative === true);

  setMode(true, false);
  t = inventoryWriteTargets();
  check('SQL_MODE=true + MIRROR=false writes SQL only', t.sql && !t.legacy, JSON.stringify(t));

  setMode(false, false);
  t = inventoryWriteTargets();
  check('SQL_MODE=false + MIRROR=false writes legacy only', !t.sql && t.legacy, JSON.stringify(t));

  // ======================================================================
  section('REGRESSION — SQL_MODE=false + MIRROR=true: reserve then cancel');
  //
  // The exact scenario that was broken. Cancelling restocked legacy and left
  // the SQL reservation ACTIVE, drifting the stores and stranding stock.
  // ======================================================================

  setMode(false, true);
  await reset();
  await makeOrder('o1', 3);

  check('starting stores agree', (await state()).legacy === (await state()).available);

  await commitOrderStock('o1');
  let s = await state();
  console.log(`      after reserve: legacy ${s.legacy} · available ${s.available} · reserved ${s.reserved} · active ${s.active}`);
  check('legacy deducted', s.legacy === START_STOCK - 3, String(s.legacy));
  check('SQL available deducted', s.available === START_STOCK - 3, String(s.available));
  check('SQL reserved increased', s.reserved === 3, String(s.reserved));
  check('an ACTIVE reservation was created', s.active === 3, String(s.active));
  check('stores agree after reserve', s.legacy === s.available);

  await pool.query(`UPDATE orders SET status='CANCELLED', cancelled_at=now() WHERE id='o1'`);
  await restoreOrderStock('o1', 'test cancel');
  s = await state();
  console.log(`      after cancel:  legacy ${s.legacy} · available ${s.available} · reserved ${s.reserved} · active ${s.active}`);
  check('legacy restored', s.legacy === START_STOCK, String(s.legacy));
  check('SQL available restored', s.available === START_STOCK, String(s.available));
  check('SQL reserved returned to zero', s.reserved === 0, String(s.reserved));
  check('no ACTIVE reservation remains', s.active === 0, String(s.active));
  check('stores agree after cancel — NO DRIFT', s.legacy === s.available);

  const health1 = await runInventoryHealthChecks();
  check(
    'no orphan reservation on the terminal order',
    !health1.problems.some((p) => p.check === 'finished order still holding stock'),
    health1.problems.map((p) => p.check).join(' | ')
  );

  // ======================================================================
  section('SQL-authoritative + MIRROR=true: reserve then cancel');
  // ======================================================================

  setMode(true, true);
  await reset();
  await makeOrder('o2', 5);
  await commitOrderStock('o2');
  s = await state();
  check('legacy deducted', s.legacy === START_STOCK - 5, String(s.legacy));
  check('SQL available deducted', s.available === START_STOCK - 5, String(s.available));
  check('stores agree', s.legacy === s.available);

  await pool.query(`UPDATE orders SET status='CANCELLED' WHERE id='o2'`);
  await restoreOrderStock('o2', 'test cancel');
  s = await state();
  check('both stores restored', s.legacy === START_STOCK && s.available === START_STOCK, `${s.legacy}/${s.available}`);
  check('no ACTIVE reservation remains', s.active === 0);

  // ======================================================================
  section('MIRROR=false preserves the existing authoritative behaviour');
  // ======================================================================

  setMode(false, false);
  await reset();
  await makeOrder('o3', 4);
  await commitOrderStock('o3');
  s = await state();
  check('legacy-only: legacy deducted', s.legacy === START_STOCK - 4, String(s.legacy));
  check('legacy-only: SQL untouched', s.available === START_STOCK && s.reserved === 0, `${s.available}/${s.reserved}`);

  setMode(true, false);
  await reset();
  await makeOrder('o4', 4);
  await commitOrderStock('o4');
  s = await state();
  check('SQL-only: SQL deducted', s.available === START_STOCK - 4, String(s.available));
  check('SQL-only: legacy untouched', s.legacy === START_STOCK, String(s.legacy));

  // ======================================================================
  section('COMMIT / DELIVERY with SQL_MODE=false + MIRROR=true');
  // ======================================================================

  setMode(false, true);
  await reset();
  await makeOrder('o5', 6);
  await commitOrderStock('o5');
  await pool.query(
    `INSERT INTO shipments (id,order_id,provider,status,awb_code,is_cod)
     VALUES ('shp5','o5','mock','IN_TRANSIT','AWB5',true)`
  );
  await applyShippingStatus({ orderId: 'o5', status: 'DELIVERED', awbCode: 'AWB5' });
  s = await state();
  console.log(`      after delivery: legacy ${s.legacy} · available ${s.available} · reserved ${s.reserved} · sold ${s.sold}`);
  check('reserved consumed on delivery', s.reserved === 0, String(s.reserved));
  check('sold increased on delivery', s.sold === 6, String(s.sold));
  check('available unchanged by delivery', s.available === START_STOCK - 6, String(s.available));
  check('legacy unchanged by delivery (it has no sold concept)', s.legacy === START_STOCK - 6, String(s.legacy));
  check('no ACTIVE reservation remains after delivery', s.active === 0);

  const health2 = await runInventoryHealthChecks();
  check(
    'delivered order holds no reservation',
    !health2.problems.some((p) => p.check === 'finished order still holding stock'),
    health2.problems.map((p) => p.check).join(' | ')
  );

  // ======================================================================
  section('IDEMPOTENCY — repeated reserve / cancel / commit');
  // ======================================================================

  setMode(false, true);
  await reset();
  await makeOrder('o6', 3);

  const first = await commitOrderStock('o6');
  const second = await commitOrderStock('o6');
  s = await state();
  check('a second reserve is refused', first === true && second === false);
  check('repeated reserve does not double-deduct legacy', s.legacy === START_STOCK - 3, String(s.legacy));
  check('repeated reserve does not double-deduct SQL', s.available === START_STOCK - 3, String(s.available));
  check('exactly one reservation exists', s.active === 3, String(s.active));

  await pool.query(`UPDATE orders SET status='CANCELLED' WHERE id='o6'`);
  const rel1 = await restoreOrderStock('o6', 'cancel');
  const rel2 = await restoreOrderStock('o6', 'cancel again');
  s = await state();
  check('a second cancel is refused', rel1 === true && rel2 === false);
  check('repeated cancel does not double-restock legacy', s.legacy === START_STOCK, String(s.legacy));
  check('repeated cancel does not double-restock SQL', s.available === START_STOCK, String(s.available));
  check('reserved not driven negative', s.reserved === 0, String(s.reserved));

  // Repeated delivery must not double-consume.
  await reset();
  await makeOrder('o7', 2);
  await commitOrderStock('o7');
  await applyShippingStatus({ orderId: 'o7', status: 'DELIVERED' });
  await applyShippingStatus({ orderId: 'o7', status: 'DELIVERED' });
  s = await state();
  check('repeated delivery does not double-consume', s.sold === 2, String(s.sold));
  check('reserved stays at zero', s.reserved === 0, String(s.reserved));

  const txDupes = await pool.query(`
    SELECT COUNT(*)::int n FROM (
      SELECT inventory_id, order_id, operation, COUNT(*) c
      FROM inventory_transactions WHERE order_id IS NOT NULL
      GROUP BY inventory_id, order_id, operation HAVING COUNT(*) > 1
    ) d`);
  check('no duplicate transaction records', txDupes.rows[0].n === 0, String(txDupes.rows[0].n));

  // ======================================================================
  section('CONCURRENCY — mirroring must not break the stock guarantee');
  // ======================================================================

  setMode(true, true); // SQL authoritative, so SQL genuinely gates
  await reset();
  const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);
  for (const id of ids) await makeOrder(id, 1);

  const results = await Promise.all(ids.map((id) => commitOrderStock(id)));
  const won = results.filter(Boolean).length;
  s = await state();
  check('exactly the available quantity sold', won === START_STOCK, `${won} of 30 succeeded`);
  check('SQL available lands on zero', s.available === 0, String(s.available));
  check('SQL never negative', s.available >= 0 && s.reserved >= 0);
  check('reserved equals what was sold', s.reserved === START_STOCK, String(s.reserved));
  check('legacy agrees with SQL after concurrent load', s.legacy === s.available, `${s.legacy}/${s.available}`);

  // ======================================================================
  section('TERMINAL-ORDER INVARIANT across every mode');
  // ======================================================================

  for (const [sqlMode, mirror] of [[false, true], [true, true]] as [boolean, boolean][]) {
    setMode(sqlMode, mirror);
    await reset();
    await makeOrder(`t${sqlMode}`, 2);
    await commitOrderStock(`t${sqlMode}`);
    await pool.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`, [`t${sqlMode}`]);
    await restoreOrderStock(`t${sqlMode}`, 'cancel');
    const report = await runInventoryHealthChecks();
    const orphans = report.problems.filter((p) => p.check === 'finished order still holding stock');
    check(
      `SQL_MODE=${sqlMode} MIRROR=${mirror}: terminal order retains no ACTIVE reservation`,
      orphans.length === 0,
      orphans.map((o) => o.detail).join(' | ')
    );
  }

  await pool.end();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('='.repeat(64));
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`${'='.repeat(64)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nHarness crashed:', err);
  process.exit(1);
});
