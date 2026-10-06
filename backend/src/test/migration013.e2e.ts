/**
 * Migration 013 — reservation backfill.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55441/m013_test \
 *     npx tsx src/test/migration013.e2e.ts
 *
 * The migration's own assertion proves the numbers reconcile. This proves the
 * thing that actually matters: that the backfilled rows make the order state
 * machine work again.
 *
 * Before 013, an in-flight order had reserved_stock behind it but no
 * reservation rows — so cancelling released nothing and the stock was stranded
 * in `reserved` forever, and delivering committed nothing so it never became
 * `sold`. Those two behaviours are what these tests exercise.
 */

// Pinned before any import — mailer.ts will not open an SMTP connection under
// NODE_ENV=test. See checkout.e2e.ts for why that matters.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}
process.env.INVENTORY_SQL_MODE = 'true';

import { pool } from '../db/db';
import {
  releaseOrderReservations,
  commitOrderReservations,
  runInventoryHealthChecks,
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

async function unit(productId: string): Promise<any> {
  const res = await pool.query('SELECT * FROM inventory WHERE product_id = $1', [productId]);
  return res.rows[0];
}

async function run(): Promise<void> {
  // ========================================
  section('Backfill shape');
  // ========================================

  const reservations = await pool.query(
    `SELECT o.order_number, r.product_id, r.quantity, r.status, r.expires_at
     FROM inventory_reservations r JOIN orders o ON o.id = r.order_id
     ORDER BY o.order_number`
  );
  const byOrder = new Map(reservations.rows.map((r) => [r.order_number, r]));

  check('a reservation exists for each in-flight order', reservations.rows.length === 4, String(reservations.rows.length));
  check('every backfilled reservation is ACTIVE', reservations.rows.every((r) => r.status === 'ACTIVE'));
  check('none carry an expiry', reservations.rows.every((r) => r.expires_at === null));

  // Two lines of one order resolving to the same inventory row must become a
  // single reservation — the partial unique index permits only one ACTIVE per
  // (order, inventory row), so inserting them separately would have failed.
  check('two lines on the same unit collapse into one reservation', byOrder.get('GLM-DUP')?.quantity === 10, String(byOrder.get('GLM-DUP')?.quantity));

  check('delivered orders got no reservation', !byOrder.has('GLM-DEL'));
  check('cancelled orders got no reservation', !byOrder.has('GLM-CAN'));
  check('RTO orders got no reservation', !byOrder.has('GLM-RTO'));
  check('an order for a deleted product got no reservation', !byOrder.has('GLM-GONE'));

  // ========================================
  section('Counters untouched');
  // ========================================

  const lipstick = await unit('lipstick');
  check('available_stock unchanged', Number(lipstick.available_stock) === 60, lipstick.available_stock);
  check('reserved_stock unchanged', Number(lipstick.reserved_stock) === 15, lipstick.reserved_stock);
  check('sold_stock unchanged', Number(lipstick.sold_stock) === 7, lipstick.sold_stock);

  const reconcile = await pool.query(`
    SELECT i.product_id, i.reserved_stock, COALESCE(SUM(r.quantity),0)::int AS active
    FROM inventory i LEFT JOIN inventory_reservations r ON r.inventory_id = i.id AND r.status='ACTIVE'
    GROUP BY i.id, i.product_id, i.reserved_stock
  `);
  check(
    'every unit reconciles with its reservations',
    reconcile.rows.every((r) => Number(r.reserved_stock) === Number(r.active)),
    reconcile.rows.map((r) => `${r.product_id}:${r.reserved_stock}/${r.active}`).join(' ')
  );

  // ========================================
  section('Health after the backfill');
  // ========================================

  const report = await runInventoryHealthChecks();
  const critical = report.problems.filter((p) => p.severity === 'critical');
  const warnings = report.problems.filter((p) => p.severity === 'warning');

  check('no critical health problems remain', critical.length === 0, critical.map((p) => p.detail).join(' | '));
  check(
    'the deleted-product order is reported as a warning, not a failure',
    warnings.some((p) => p.check === 'in-flight line for a deleted product'),
    warnings.map((p) => p.check).join(' | ')
  );
  check(
    'it names the order and product so it is never silently dropped',
    warnings.some((p) => p.detail.includes('GLM-GONE') && p.detail.includes('deleted-product'))
  );

  // ========================================
  section('The state machine works again — this is the point of 013');
  //
  // Health is asserted ABOVE, before these mutations. Releasing and committing
  // below deliberately bypasses restoreOrderStock(), which in production also
  // moves the order to a terminal status and sets stock_restored — so after
  // these calls the orders are intentionally in a state the health check is
  // right to flag. That is the harness taking a shortcut, not a defect.
  // ========================================

  // Cancelling an in-flight order must now return its stock to sale. Before
  // 013 this released nothing and the units were stranded.
  const beforeCancel = await unit('sindoor');
  const released = await releaseOrderReservations({ orderId: 'o-if2', reason: 'test cancellation' });
  const afterCancel = await unit('sindoor');

  check('cancelling releases the reservation', released.released === 1, String(released.released));
  check(
    'cancelled stock returns to available',
    Number(afterCancel.available_stock) === Number(beforeCancel.available_stock) + 3,
    `${beforeCancel.available_stock} -> ${afterCancel.available_stock}`
  );
  check('cancelled stock leaves reserved', Number(afterCancel.reserved_stock) === 0, afterCancel.reserved_stock);
  check(
    'no stock was invented or lost',
    Number(afterCancel.available_stock) + Number(afterCancel.reserved_stock) ===
      Number(beforeCancel.available_stock) + Number(beforeCancel.reserved_stock)
  );

  // Delivering must now convert the hold into a sale.
  const beforeDeliver = await unit('cleanser');
  const committed = await commitOrderReservations({ orderId: 'o-if3' });
  const afterDeliver = await unit('cleanser');

  check('delivering commits the reservation', committed.committed === 1, String(committed.committed));
  check(
    'delivered stock becomes sold',
    Number(afterDeliver.sold_stock) === Number(beforeDeliver.sold_stock) + 2,
    `${beforeDeliver.sold_stock} -> ${afterDeliver.sold_stock}`
  );
  check('delivered stock leaves reserved', Number(afterDeliver.reserved_stock) === 0, afterDeliver.reserved_stock);
  check(
    'delivery does not change available',
    Number(afterDeliver.available_stock) === Number(beforeDeliver.available_stock)
  );

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
