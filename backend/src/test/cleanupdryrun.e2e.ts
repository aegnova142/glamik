/**
 * Dry run: what does cancelling an order actually do while SQL inventory is
 * switched OFF but the SQL tables are already populated (migrations 012/013)?
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55446/dryrun_test \
 *     npx tsx src/test/cleanupdryrun.e2e.ts
 *
 * Run before cancelling anything on production, because the answer determines
 * whether a cleanup is safe. Production is currently in exactly this state:
 * 012 and 013 applied, reservations populated, INVENTORY_SQL_MODE=false,
 * INVENTORY_MIRROR_LEGACY=true.
 *
 * Nothing here touches production — it reconstructs the state locally and
 * exercises the real application cancellation path against it.
 */

// Pinned before any import — mailer.ts will not open an SMTP connection under
// NODE_ENV=test. See checkout.e2e.ts for why that matters.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}
// Production's current configuration, reproduced exactly.
process.env.INVENTORY_SQL_MODE = 'false';
process.env.INVENTORY_MIRROR_LEGACY = 'true';

import { pool, loadDatabase, saveDatabase, ensureSchema } from '../db/db';
import { restoreOrderStock } from '../services/fulfillment.service';
import { runInventoryHealthChecks } from '../services/inventory.service';

let passed = 0;
let failed = 0;
const notes: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

async function legacyStock(): Promise<number> {
  const db = await loadDatabase();
  return (db.products as any[]).reduce((n, p) => n + (Number(p.stock) || 0), 0);
}

async function sqlCounters(): Promise<{ available: number; reserved: number; sold: number; active: number }> {
  const i = await pool.query(
    `SELECT COALESCE(SUM(available_stock),0)::int a, COALESCE(SUM(reserved_stock),0)::int r,
            COALESCE(SUM(sold_stock),0)::int s FROM inventory`
  );
  const res = await pool.query(
    `SELECT COALESCE(SUM(quantity),0)::int q FROM inventory_reservations WHERE status='ACTIVE'`
  );
  return { available: i.rows[0].a, reserved: i.rows[0].r, sold: i.rows[0].s, active: res.rows[0].q };
}

async function run(): Promise<void> {
  await ensureSchema();

  // --- reconstruct production's shape -----------------------------------
  await pool.query('DELETE FROM inventory_transactions');
  await pool.query('DELETE FROM inventory_reservations');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM order_status_history');
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM customers');

  const db = await loadDatabase();
  db.products = [{ id: 'p1', name: 'Test Product', price: 100, stock: 20, inStock: true,
                   images: { primary: 'a', secondary: 'b' }, benefits: [] } as any];
  await saveDatabase(db);

  await pool.query(`INSERT INTO customers (id,name,email,password_hash) VALUES ('c1','T','t@t.local','x')`);
  await pool.query(
    `INSERT INTO orders (id,user_id,order_number,status,subtotal,discount,shipping,total,
                         shipping_address,payment_method,payment_status,stock_committed,stock_restored)
     VALUES ('o1','c1','GLM-TEST','PLACED',100,0,0,100,'{}'::jsonb,'card','PAID',true,false)`
  );
  await pool.query(
    `INSERT INTO order_items (id,order_id,product_id,product_name,quantity,price)
     VALUES ('oi1','o1','p1','Test Product',3,100)`
  );
  // Inventory as 012 left it, plus the reservation 013 created.
  await pool.query(
    `INSERT INTO inventory (id,product_id,variant_id,size_label,available_stock,reserved_stock,sold_stock)
     VALUES ('inv1','p1',NULL,NULL,20,3,0)`
  );
  await pool.query(
    `INSERT INTO inventory_reservations (id,inventory_id,order_id,user_id,product_id,quantity,status)
     VALUES ('r1','inv1','o1','c1','p1',3,'ACTIVE')`
  );

  const beforeLegacy = await legacyStock();
  const before = await sqlCounters();

  section('Starting state — mirrors production');
  console.log(`  legacy JSONB stock   ${beforeLegacy}`);
  console.log(`  SQL available        ${before.available}`);
  console.log(`  SQL reserved         ${before.reserved}`);
  console.log(`  ACTIVE reservations  ${before.active}`);
  check('legacy and SQL available agree at the start', beforeLegacy === before.available);
  check('reserved matches active reservations at the start', before.reserved === before.active);

  // --- the real application cancellation path ----------------------------
  section('Cancelling one order through the application flow (SQL mode OFF)');
  await pool.query(
    `UPDATE orders SET status='CANCELLED', cancelled_at=now(), cancellation_reason='test cleanup' WHERE id='o1'`
  );
  await restoreOrderStock('o1', 'test cleanup');

  const afterLegacy = await legacyStock();
  const after = await sqlCounters();

  console.log(`\n  legacy JSONB stock   ${beforeLegacy} -> ${afterLegacy}`);
  console.log(`  SQL available        ${before.available} -> ${after.available}`);
  console.log(`  SQL reserved         ${before.reserved} -> ${after.reserved}`);
  console.log(`  ACTIVE reservations  ${before.active} -> ${after.active}`);

  // --- what actually happened --------------------------------------------
  section('Consequences');

  const legacyRestocked = afterLegacy === beforeLegacy + 3;
  const sqlUntouched = after.available === before.available && after.reserved === before.reserved;

  check('legacy JSONB was restocked (+3)', legacyRestocked, `${beforeLegacy} -> ${afterLegacy}`);
  if (sqlUntouched) {
    notes.push('SQL inventory was NOT updated — the reservation stayed ACTIVE and reserved_stock did not move.');
  }
  console.log(`  SQL side updated?    ${sqlUntouched ? 'NO' : 'yes'}`);

  const drift = afterLegacy - after.available;
  console.log(`  legacy vs SQL drift  ${drift}`);

  const orphans = await pool.query(
    `SELECT COUNT(*)::int n FROM inventory_reservations r JOIN orders o ON o.id=r.order_id
     WHERE r.status='ACTIVE' AND o.status IN ('CANCELLED','RETURNED','RTO')`
  );
  console.log(`  ACTIVE reservations on CANCELLED orders: ${orphans.rows[0].n}`);

  const report = await runInventoryHealthChecks();
  console.log(`  health problems now: ${report.problems.length}`);
  for (const p of report.problems.slice(0, 5)) console.log(`    [${p.severity}] ${p.check}: ${p.detail}`);

  // These are the user's stated expected outcomes. Asserting them here shows
  // plainly whether the existing flow can deliver them in this configuration.
  section('Against the expected outcomes for a production cleanup');
  check('EXPECTED: no legacy/SQL mismatch', drift === 0, `drift of ${drift} unit(s)`);
  check('EXPECTED: no orphan reservations', orphans.rows[0].n === 0, `${orphans.rows[0].n} orphan(s)`);
  check('EXPECTED: reserved_stock decreases by the released quantity', after.reserved === before.reserved - 3,
        `reserved stayed at ${after.reserved}`);

  // ======================================================================
  section('Inverse case — a NEW order placed while SQL mode is off');
  // ======================================================================
  //
  // Same question from the other direction: if cancellation only writes
  // legacy, does order creation also only write legacy? If so the two systems
  // drift on ordinary trading, not just on cleanup — which decides how close
  // to cutover a resync has to run.

  await pool.query(
    `INSERT INTO orders (id,user_id,order_number,status,subtotal,discount,shipping,total,
                         shipping_address,payment_method,payment_status,stock_committed,stock_restored)
     VALUES ('o2','c1','GLM-NEW','PLACED',100,0,0,100,'{}'::jsonb,'cod','COD_PENDING',false,false)`
  );
  await pool.query(
    `INSERT INTO order_items (id,order_id,product_id,product_name,quantity,price)
     VALUES ('oi2','o2','p1','Test Product',4,100)`
  );

  const beforeNewLegacy = await legacyStock();
  const beforeNew = await sqlCounters();

  const { commitOrderStock } = await import('../services/fulfillment.service');
  await commitOrderStock('o2');

  const afterNewLegacy = await legacyStock();
  const afterNew = await sqlCounters();

  console.log(`  legacy JSONB stock   ${beforeNewLegacy} -> ${afterNewLegacy}`);
  console.log(`  SQL available        ${beforeNew.available} -> ${afterNew.available}`);
  console.log(`  SQL reserved         ${beforeNew.reserved} -> ${afterNew.reserved}`);
  console.log(`  ACTIVE reservations  ${beforeNew.active} -> ${afterNew.active}`);

  check('a new order deducts legacy stock', afterNewLegacy === beforeNewLegacy - 4, `${beforeNewLegacy} -> ${afterNewLegacy}`);
  const newOrderDriftsToo = afterNew.available === beforeNew.available;
  if (newOrderDriftsToo) {
    notes.push(
      'A NEW order also writes only to legacy while SQL mode is off — so the two systems drift on ordinary trading, not just on cleanup.'
    );
  }
  console.log(`  SQL side updated?    ${newOrderDriftsToo ? 'NO — drifts on every new order' : 'yes'}`);

  await pool.end();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  for (const n of notes) console.log(`  NOTE: ${n}`);
  console.log(`${'='.repeat(64)}\n`);
  // Exit 0 regardless: this is a diagnostic, and a "failure" here is the
  // finding, not a broken test.
  process.exit(0);
}

run().catch((err) => {
  console.error('\nDry run crashed:', err);
  process.exit(1);
});
