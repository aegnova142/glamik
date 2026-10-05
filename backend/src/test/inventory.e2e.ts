/**
 * SQL inventory integration + concurrency checks.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55435/glamirk_test \
 *   INVENTORY_SQL_MODE=true npx tsx src/test/inventory.e2e.ts
 *
 * The concurrency sections are the point of this file. They fire genuinely
 * simultaneous transactions at the same inventory row and assert that exactly
 * the available quantity sells — the property that row-level locking exists to
 * provide and that the old JSONB read-modify-write could not guarantee across
 * processes.
 */

// Same production-database guard as the checkout harness: this writes stock.
const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error(
    '\nREFUSING TO RUN.\n\nDATABASE_URL must point at a local database whose name contains "test".\n' +
      `Got: ${url ? url.replace(/:[^:@/]+@/, ':***@') : '(unset)'}\n`
  );
  process.exit(1);
}
// SQL inventory must be authoritative for these assertions to mean anything.
process.env.INVENTORY_SQL_MODE = 'true';

import { pool, ensureSchema, loadDatabase, saveDatabase } from '../db/db';
import {
  isProductSellable,
  hasSellableStock,
  enumerateStockUnits,
} from '@glamirk/shared/utils/productVariant';
import { commitOrderStock } from '../services/fulfillment.service';
import {
  reserveStockForOrder,
  releaseOrderReservations,
  commitOrderReservations,
  restockReturnedOrder,
  releaseExpiredReservations,
  adjustInventory,
  getAvailableStock,
  getProductInventory,
  getInventoryTransactions,
  sqlInventoryEnabled,
} from '../services/inventory.service';

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

const USER = 'inv-user-1';
const USER2 = 'inv-user-2';
const PRODUCT = 'inv-product';
const SHADE = 'inv-shade';

/** Rebuilds a known-good starting state. */
async function reset(stock: number, shadeStock?: number): Promise<void> {
  await ensureSchema();
  await pool.query('DELETE FROM inventory_transactions');
  await pool.query('DELETE FROM inventory_reservations');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM order_status_history');
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM customers');

  await pool.query(
    `INSERT INTO customers (id, name, email, password_hash)
     VALUES ($1,'Inv One','i1@test.local','x'), ($2,'Inv Two','i2@test.local','x')`,
    [USER, USER2]
  );

  const db = await loadDatabase();
  const seeded = {
      id: PRODUCT,
      name: 'Concurrency Test Product',
      price: 100,
      stock,
      images: { primary: 'a.jpg', secondary: 'b.jpg' },
      benefits: [],
      category: 'Lips',
      shades: shadeStock === undefined ? undefined : [{ id: SHADE, name: 'Test Shade', stock: shadeStock }],
  } as any;
  // Derived the same way production now derives it. Seeding `stock > 0` here
  // would reintroduce the exact bug under test: a pool of 0 with a stocked
  // shade would start out flagged unsellable.
  db.products = [{ ...seeded, inStock: hasSellableStock(seeded) }];
  await saveDatabase(db);

  await pool.query(
    `INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
     VALUES ('inv-pool', $1, NULL, NULL, $2)`,
    [PRODUCT, stock]
  );
  if (shadeStock !== undefined) {
    await pool.query(
      `INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
       VALUES ('inv-shade-row', $1, $2, NULL, $3)`,
      [PRODUCT, SHADE, shadeStock]
    );
  }
}

async function makeOrder(id: string, quantity: number, variantId: string | null = null, userId = USER): Promise<void> {
  await pool.query(
    `INSERT INTO orders (id, user_id, order_number, status, subtotal, discount, shipping, total,
                         shipping_address, payment_method, payment_status, stock_committed)
     VALUES ($1,$2,$3,'PENDING_PAYMENT',100,0,0,100,'{}'::jsonb,'upi','PENDING',false)`,
    [id, userId, 'GLM' + id.slice(-6)]
  );
  await pool.query(
    `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, quantity, price)
     VALUES ($1,$2,$3,$4,'Concurrency Test Product',$5,100)`,
    ['oi-' + id, id, PRODUCT, variantId, quantity]
  );
}

async function unitRow(variantId: string | null = null): Promise<any> {
  const res = await pool.query(
    `SELECT * FROM inventory WHERE product_id = $1 AND variant_id IS NOT DISTINCT FROM $2 AND size_label IS NULL`,
    [PRODUCT, variantId]
  );
  return res.rows[0];
}

async function run(): Promise<void> {
  check('SQL inventory mode is active for this run', sqlInventoryEnabled());

  // ========================================
  section('Basic reserve / release / commit');
  // ========================================

  await reset(10);
  await makeOrder('o-1', 3);
  const r1 = await reserveStockForOrder({ orderId: 'o-1', userId: USER, lines: [{ productId: PRODUCT, quantity: 3 }] });
  check('reservation succeeds', r1.ok, r1.error);

  let unit = await unitRow();
  check('available decreased by the reserved amount', Number(unit.available_stock) === 7, unit.available_stock);
  check('reserved increased', Number(unit.reserved_stock) === 3, unit.reserved_stock);
  check('sold untouched by a reservation', Number(unit.sold_stock) === 0);
  check('available + reserved preserves the total', Number(unit.available_stock) + Number(unit.reserved_stock) === 10);

  const txs = await getInventoryTransactions(PRODUCT);
  check('a transaction row was written', txs.length >= 1);
  check('transaction records the previous quantity', txs[0].previousAvailable === 10, String(txs[0].previousAvailable));
  check('transaction records the new quantity', txs[0].newAvailable === 7, String(txs[0].newAvailable));
  check('transaction references the order', txs[0].orderId === 'o-1');
  check('transaction names the operation', txs[0].operation === 'RESERVE');

  await releaseOrderReservations({ orderId: 'o-1', reason: 'test release' });
  unit = await unitRow();
  check('release returns stock to available', Number(unit.available_stock) === 10, unit.available_stock);
  check('release clears reserved', Number(unit.reserved_stock) === 0);

  const releasedAgain = await releaseOrderReservations({ orderId: 'o-1', reason: 'duplicate release' });
  check('releasing twice is a no-op', releasedAgain.released === 0);
  unit = await unitRow();
  check('double release does not inflate stock', Number(unit.available_stock) === 10, unit.available_stock);

  // ========================================
  section('Delivery converts reserved into sold');
  // ========================================

  await reset(10);
  await makeOrder('o-2', 2);
  await reserveStockForOrder({ orderId: 'o-2', userId: USER, lines: [{ productId: PRODUCT, quantity: 2 }] });
  await commitOrderReservations({ orderId: 'o-2' });
  unit = await unitRow();
  check('delivery moves reserved into sold', Number(unit.sold_stock) === 2, unit.sold_stock);
  check('delivery clears reserved', Number(unit.reserved_stock) === 0);
  check('delivery does not change available', Number(unit.available_stock) === 8, unit.available_stock);

  const committedAgain = await commitOrderReservations({ orderId: 'o-2' });
  check('committing twice is a no-op', committedAgain.committed === 0);
  unit = await unitRow();
  check('double commit does not inflate sold', Number(unit.sold_stock) === 2, unit.sold_stock);

  // ========================================
  section('Return / RTO restores from the correct counter');
  // ========================================

  await restockReturnedOrder({ orderId: 'o-2', reason: 'customer return' });
  unit = await unitRow();
  check('return moves sold back to available', Number(unit.available_stock) === 10, unit.available_stock);
  check('return clears sold', Number(unit.sold_stock) === 0, unit.sold_stock);
  check('return leaves reserved at zero', Number(unit.reserved_stock) === 0);

  // An undelivered order returns from reserved, not from sold — taking it from
  // the wrong counter would invent stock.
  await reset(10);
  await makeOrder('o-3', 4);
  await reserveStockForOrder({ orderId: 'o-3', userId: USER, lines: [{ productId: PRODUCT, quantity: 4 }] });
  await restockReturnedOrder({ orderId: 'o-3', reason: 'RTO before delivery' });
  unit = await unitRow();
  check('RTO before delivery restores from reserved', Number(unit.available_stock) === 10, unit.available_stock);
  check('RTO before delivery does not go negative on sold', Number(unit.sold_stock) === 0, unit.sold_stock);

  // ========================================
  section('Over-reservation is refused');
  // ========================================

  await reset(5);
  await makeOrder('o-4', 6);
  const tooMany = await reserveStockForOrder({
    orderId: 'o-4',
    userId: USER,
    lines: [{ productId: PRODUCT, quantity: 6 }],
  });
  check('reserving more than available is refused', !tooMany.ok);
  check('refusal reports how many are actually left', tooMany.availableStock === 5, String(tooMany.availableStock));
  unit = await unitRow();
  check('a refused reservation changes nothing', Number(unit.available_stock) === 5, unit.available_stock);
  check('a refused reservation reserves nothing', Number(unit.reserved_stock) === 0);

  // ========================================
  section('Invalid quantities');
  // ========================================

  await reset(10);
  await makeOrder('o-5', 1);
  for (const bad of [0, -1, 1.5, NaN]) {
    const res = await reserveStockForOrder({
      orderId: 'o-5',
      userId: USER,
      lines: [{ productId: PRODUCT, quantity: bad as number }],
    });
    check(`quantity ${bad} is rejected`, !res.ok);
  }
  unit = await unitRow();
  check('invalid quantities left stock untouched', Number(unit.available_stock) === 10);

  // ========================================
  section('CONCURRENCY — 10 buyers, 10 units, 1 each');
  // ========================================

  await reset(10);
  const ten = Array.from({ length: 10 }, (_, i) => `o-c10-${i}`);
  for (const id of ten) await makeOrder(id, 1);

  const tenResults = await Promise.all(
    ten.map((id) => reserveStockForOrder({ orderId: id, userId: USER, lines: [{ productId: PRODUCT, quantity: 1 }] }))
  );
  const tenOk = tenResults.filter((r) => r.ok).length;
  unit = await unitRow();
  check('exactly 10 of 10 succeed when 10 units exist', tenOk === 10, `succeeded=${tenOk}`);
  check('available lands on exactly zero', Number(unit.available_stock) === 0, unit.available_stock);
  check('reserved equals what was sold', Number(unit.reserved_stock) === 10, unit.reserved_stock);
  check('stock never went negative', Number(unit.available_stock) >= 0);

  // ========================================
  section('CONCURRENCY — 100 buyers, 10 units');
  // ========================================

  await reset(10);
  const hundred = Array.from({ length: 100 }, (_, i) => `o-c100-${i}`);
  for (const id of hundred) await makeOrder(id, 1);

  const started = Date.now();
  const hundredResults = await Promise.all(
    hundred.map((id) =>
      reserveStockForOrder({ orderId: id, userId: USER, lines: [{ productId: PRODUCT, quantity: 1 }] })
    )
  );
  const elapsed = Date.now() - started;

  const won = hundredResults.filter((r) => r.ok).length;
  const lost = hundredResults.filter((r) => !r.ok).length;
  unit = await unitRow();

  check('exactly 10 of 100 succeed', won === 10, `succeeded=${won}`);
  check('the other 90 are cleanly refused', lost === 90, `refused=${lost}`);
  check('available lands on exactly zero', Number(unit.available_stock) === 0, unit.available_stock);
  check('no overselling', Number(unit.reserved_stock) === 10, unit.reserved_stock);
  check('stock never went negative', Number(unit.available_stock) >= 0);

  const reservationCount = await pool.query(
    `SELECT COUNT(*)::int n FROM inventory_reservations WHERE status = 'ACTIVE'`
  );
  check('exactly 10 active reservations exist', reservationCount.rows[0].n === 10, String(reservationCount.rows[0].n));

  const txCount = await pool.query(`SELECT COUNT(*)::int n FROM inventory_transactions WHERE operation = 'RESERVE'`);
  check('one transaction row per successful reservation', txCount.rows[0].n === 10, String(txCount.rows[0].n));
  console.log(`        (100 concurrent attempts resolved in ${elapsed}ms)`);

  // ========================================
  section('CONCURRENCY — duplicate reservation for one order');
  // ========================================

  await reset(10);
  await makeOrder('o-dup', 2);
  const dupResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      reserveStockForOrder({ orderId: 'o-dup', userId: USER, lines: [{ productId: PRODUCT, quantity: 2 }] })
    )
  );
  const dupOk = dupResults.filter((r) => r.ok).length;
  const dupReservations = await pool.query(
    `SELECT COUNT(*)::int n FROM inventory_reservations WHERE order_id = 'o-dup' AND status = 'ACTIVE'`
  );
  check('the unique index allows only one active reservation per unit', dupReservations.rows[0].n === 1, String(dupReservations.rows[0].n));
  unit = await unitRow();
  // Each attempt that got through the lock deducted; the unique index stops a
  // second reservation ROW, so the surviving reservation is the one that can
  // be released. Anything beyond one deduction would be a duplicate charge on
  // inventory and is what this asserts against.
  check('duplicate attempts do not multiply the deduction', Number(unit.reserved_stock) === 2, unit.reserved_stock);
  check('available reflects exactly one deduction', Number(unit.available_stock) === 8, unit.available_stock);
  console.log(`        (${dupOk} of 5 duplicate attempts reported success)`);

  // ========================================
  section('CONCURRENCY — mixed quantities against a small pool');
  // ========================================

  await reset(7);
  const mixed = [3, 3, 3, 2, 2, 1, 1];
  const mixedIds = mixed.map((_, i) => `o-mix-${i}`);
  for (let i = 0; i < mixed.length; i++) await makeOrder(mixedIds[i], mixed[i]);

  const mixedResults = await Promise.all(
    mixedIds.map((id, i) =>
      reserveStockForOrder({ orderId: id, userId: USER, lines: [{ productId: PRODUCT, quantity: mixed[i] }] })
    )
  );
  unit = await unitRow();
  const soldUnits = mixedResults.reduce((sum, r, i) => sum + (r.ok ? mixed[i] : 0), 0);
  check('units reserved never exceed the pool', soldUnits <= 7, `reserved=${soldUnits}`);
  check('reserved counter matches what succeeded', Number(unit.reserved_stock) === soldUnits, unit.reserved_stock);
  check('available plus reserved still totals the pool', Number(unit.available_stock) + Number(unit.reserved_stock) === 7);
  check('available never negative under mixed load', Number(unit.available_stock) >= 0);

  // ========================================
  section('Hierarchy — shade-level stock gates the sale');
  // ========================================

  await reset(100, 4);
  await makeOrder('o-shade', 3, SHADE);
  const shadeRes = await reserveStockForOrder({
    orderId: 'o-shade',
    userId: USER,
    lines: [{ productId: PRODUCT, variantId: SHADE, quantity: 3 }],
  });
  check('a shaded line reserves against its shade', shadeRes.ok, shadeRes.error);

  const shadeUnit = await unitRow(SHADE);
  const poolUnit = await unitRow(null);
  check('shade available decreased', Number(shadeUnit.available_stock) === 1, shadeUnit.available_stock);
  check('product pool also decreased (legacy cascade preserved)', Number(poolUnit.available_stock) === 97, poolUnit.available_stock);

  await makeOrder('o-shade-2', 2, SHADE);
  const overShade = await reserveStockForOrder({
    orderId: 'o-shade-2',
    userId: USER,
    lines: [{ productId: PRODUCT, variantId: SHADE, quantity: 2 }],
  });
  check('shade stock gates the sale, not the larger pool', !overShade.ok);
  check('refusal reports the shade count', overShade.availableStock === 1, String(overShade.availableStock));

  // ========================================
  section('Reservation expiry');
  // ========================================

  await reset(10);
  await makeOrder('o-exp', 4);
  await reserveStockForOrder({
    orderId: 'o-exp',
    userId: USER,
    lines: [{ productId: PRODUCT, quantity: 4 }],
    expiresAt: new Date(Date.now() - 60_000),
  });
  unit = await unitRow();
  check('an expiring reservation still holds stock until swept', Number(unit.available_stock) === 6, unit.available_stock);

  const releasedCount = await releaseExpiredReservations();
  check('the sweep releases an expired reservation', releasedCount >= 1, String(releasedCount));
  unit = await unitRow();
  check('expired stock returns to available', Number(unit.available_stock) === 10, unit.available_stock);
  check('expired stock clears reserved', Number(unit.reserved_stock) === 0);

  // A live reservation must survive the sweep.
  await reset(10);
  await makeOrder('o-live', 2);
  await reserveStockForOrder({
    orderId: 'o-live',
    userId: USER,
    lines: [{ productId: PRODUCT, quantity: 2 }],
    expiresAt: new Date(Date.now() + 600_000),
  });
  await releaseExpiredReservations();
  unit = await unitRow();
  check('an unexpired reservation survives the sweep', Number(unit.reserved_stock) === 2, unit.reserved_stock);

  // ========================================
  section('Admin adjustment');
  // ========================================

  await reset(10);
  const adj = await adjustInventory({
    productId: PRODUCT,
    availableStock: 42,
    lowStockThreshold: 7,
    actor: 'admin-1',
    reason: 'Stocktake',
  });
  check('admin adjustment succeeds', adj.ok, adj.error);
  unit = await unitRow();
  check('adjustment sets the absolute value', Number(unit.available_stock) === 42, unit.available_stock);
  check('adjustment sets the threshold', Number(unit.low_stock_threshold) === 7);

  const adjTx = (await getInventoryTransactions(PRODUCT)).find((t) => t.operation === 'ADJUST');
  check('adjustment is recorded in the log', !!adjTx);
  check('adjustment records who made it', adjTx?.actor === 'admin-1', adjTx?.actor);
  check('adjustment records the before value', adjTx?.previousAvailable === 10, String(adjTx?.previousAvailable));

  for (const bad of [-1, 2.5]) {
    const res = await adjustInventory({
      productId: PRODUCT,
      availableStock: bad,
      actor: 'admin-1',
      reason: 'bad',
    });
    check(`adjustment to ${bad} is rejected`, !res.ok);
  }

  // ========================================
  section('Reads');
  // ========================================

  await reset(10, 4);
  check('available for a plain line', (await getAvailableStock({ productId: PRODUCT })) === 10);
  check('available for a shaded line reads the shade', (await getAvailableStock({ productId: PRODUCT, variantId: SHADE })) === 4);
  check(
    'an unknown shade falls back to the product pool',
    (await getAvailableStock({ productId: PRODUCT, variantId: 'no-such-shade' })) === 10
  );
  check('an unknown product reports zero', (await getAvailableStock({ productId: 'nope' })) === 0);
  check('product inventory lists every level', (await getProductInventory(PRODUCT)).length === 2);

  // ========================================
  section('GATING — product / shade / size authority');
  //
  // The regression this guards: for a product whose shades carry their own
  // stock, the product-level number behaves as a shared pool that also drains.
  // It could therefore reach zero while every shade still had units, and the
  // old derivation (`inStock = pool > 0`) then marked the whole product out of
  // stock — hiding it from the shop and refusing the entire basket at
  // checkout, with stock sitting on the shelf.
  // ========================================

  // --- product level: no shades, no sizes ---
  const plain = {
    id: 'p-plain',
    name: 'Plain',
    stock: 4,
    inStock: true,
    images: { primary: 'a', secondary: 'b' },
    benefits: [],
  } as any;
  check('plain product with stock is sellable', isProductSellable(plain));
  check('plain product enumerates one unit', enumerateStockUnits(plain).length === 1);
  check('plain product unit carries the product stock', enumerateStockUnits(plain)[0].stock === 4);
  check('plain product at zero is not sellable', !isProductSellable({ ...plain, stock: 0 }));

  // --- shade level: the pool is drained but shades have stock ---
  const drainedPool = {
    ...plain,
    id: 'p-drained',
    stock: 0,
    shades: [
      { id: 's1', name: 'One', stock: 3 },
      { id: 's2', name: 'Two', stock: 0 },
    ],
  } as any;
  check('a drained pool does NOT make a shaded product unsellable', isProductSellable(drainedPool));
  check('drained pool still reports sellable stock', hasSellableStock(drainedPool));
  check('shaded product enumerates one unit per shade', enumerateStockUnits(drainedPool).length === 2);
  check(
    'each shade unit carries its own stock',
    enumerateStockUnits(drainedPool).find((u) => u.variantId === 's1')?.stock === 3
  );

  // Every shade empty — now it genuinely is unsellable, pool or no pool.
  const allShadesEmpty = { ...drainedPool, stock: 50, shades: [{ id: 's1', name: 'One', stock: 0 }] } as any;
  check('a product whose every shade is empty is not sellable', !isProductSellable(allShadesEmpty));
  check('a large pool cannot rescue empty shades', !hasSellableStock(allShadesEmpty));

  // A shade with no stock key falls back to the pool, as the read chain does.
  const fallbackShade = { ...plain, id: 'p-fb', stock: 6, shades: [{ id: 's1', name: 'One' }] } as any;
  check('a shade without its own stock falls back to the pool', enumerateStockUnits(fallbackShade)[0].stock === 6);
  check('fallback shade product is sellable from the pool', isProductSellable(fallbackShade));
  check(
    'fallback shade product is unsellable when the pool is empty',
    !isProductSellable({ ...fallbackShade, stock: 0 })
  );

  // Inactive shades must not prop up availability — they cannot be selected.
  const inactiveShade = {
    ...plain,
    id: 'p-inactive',
    stock: 0,
    shades: [{ id: 's1', name: 'Hidden', stock: 9, isActive: false }],
  } as any;
  check('an inactive shade does not make a product sellable', !isProductSellable(inactiveShade));

  // --- size level ---
  const shadeWithSizes = {
    ...plain,
    id: 'p-sizes',
    stock: 0,
    shades: [
      {
        id: 's1',
        name: 'One',
        stock: 0,
        sizes: [
          { id: '30g', label: '30g', price: 10, stock: 0 },
          { id: '50g', label: '50g', price: 20, stock: 2 },
        ],
      },
    ],
  } as any;
  check('a size with stock keeps the product sellable', isProductSellable(shadeWithSizes));
  check('sizes enumerate one unit each', enumerateStockUnits(shadeWithSizes).length === 2);
  check(
    'the stocked size reports its own number',
    enumerateStockUnits(shadeWithSizes).find((u) => u.sizeLabel === '50g')?.stock === 2
  );
  check(
    'all sizes empty means not sellable',
    !isProductSellable({
      ...shadeWithSizes,
      shades: [{ id: 's1', name: 'One', stock: 0, sizes: [{ id: '30g', label: '30g', price: 10, stock: 0 }] }],
    } as any)
  );

  // Product-level sizePricing, for products with no shades at all.
  const sizePricingProduct = {
    ...plain,
    id: 'p-sp',
    stock: 0,
    sizes: ['S', 'M'],
    sizePricing: { S: { price: 10, stock: 0 }, M: { price: 20, stock: 5 } },
  } as any;
  check('a stocked sizePricing entry keeps the product sellable', isProductSellable(sizePricingProduct));
  check('sizePricing enumerates one unit per size', enumerateStockUnits(sizePricingProduct).length === 2);

  // --- the admin kill-switch still wins ---
  check(
    'an admin out-of-stock flag still blocks a fully stocked product',
    !isProductSellable({ ...drainedPool, inStock: false })
  );
  check(
    'but the quantity question is answered independently',
    hasSellableStock({ ...drainedPool, inStock: false })
  );

  // --- end to end: the drained-pool product can still be bought ---
  await reset(0, 5); // pool 0, shade 5
  await makeOrder('o-gate', 2, SHADE);
  // Through commitOrderStock, not the inventory service directly: that is the
  // path production uses, and it is what also writes the legacy mirror.
  const gateRes = await commitOrderStock('o-gate');
  check('a drained-pool product can still be reserved from its shade', gateRes);
  const gateShade = await unitRow(SHADE);
  const gatePool = await unitRow(null);
  check('the shade was decremented', Number(gateShade.available_stock) === 3, gateShade.available_stock);
  check('the empty pool stayed at zero rather than going negative', Number(gatePool.available_stock) === 0);

  const dbAfter = await loadDatabase();
  const productAfter = dbAfter.products.find((p) => p.id === PRODUCT)!;
  check('legacy mirror keeps the product marked in stock', productAfter.inStock === true, String(productAfter.inStock));
  check('legacy mirror agrees it is sellable', isProductSellable(productAfter));

  // ========================================
  section('Rollback leaves state consistent');
  // ========================================

  await reset(5);
  await makeOrder('o-rb', 3);
  // Two lines where the second is impossible: the whole reservation must roll
  // back, leaving the first line's deduction undone.
  const partial = await reserveStockForOrder({
    orderId: 'o-rb',
    userId: USER,
    lines: [
      { productId: PRODUCT, quantity: 3 },
      { productId: PRODUCT, variantId: 'ghost-shade', quantity: 99 },
    ],
  });
  unit = await unitRow();
  check('a basket that cannot be fully reserved reserves nothing', Number(unit.available_stock) === 5, unit.available_stock);
  check('partial failure leaves no reservation', Number(unit.reserved_stock) === 0, unit.reserved_stock);
  check('partial failure is reported', !partial.ok);

  const orphanReservations = await pool.query(
    `SELECT COUNT(*)::int n FROM inventory_reservations WHERE order_id = 'o-rb'`
  );
  check('rollback left no orphan reservation rows', orphanReservations.rows[0].n === 0, String(orphanReservations.rows[0].n));

  // ------------------------------------------

  await pool.end();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('='.repeat(60));
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`${'='.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nHarness crashed:', err);
  process.exit(1);
});
