/**
 * Inventory migration operator tool.
 *
 *   npm run inventory:verify   compare legacy JSONB against SQL inventory
 *   npm run inventory:resync   re-copy JSONB stock into SQL (pre-cutover only)
 *   npm run inventory:rollback copy SQL stock back into the JSONB document
 *
 * Read-only by default. `verify` never writes; the two write commands refuse
 * to run without an explicit --confirm, because both overwrite real stock
 * numbers and "I meant to type verify" is a predictable mistake.
 */

import { pool, ensureSchema, loadDatabase, saveDatabase } from './db';
import { env } from '../config/env';
import { maskConnectionString } from '../config/databaseTarget';
import { hasSellableStock, enumerateStockUnits } from '@glamirk/shared/utils/productVariant';
// The invariants live in the service so this tool and the running server
// check exactly the same things.
import { runInventoryHealthChecks } from '../services/inventory.service';

const command = process.argv[2];
const confirmed = process.argv.includes('--confirm');

/**
 * The target, safe to print.
 *
 * Uses the shared masker rather than a local regex: the previous one replaced
 * only the password, leaving the database username in every line of output
 * these commands produce. That output gets pasted into tickets and chat logs,
 * so it masks the whole credential pair and keeps just the host — enough to
 * confirm you are pointed at the right database, and nothing more.
 */
function maskedTarget(): string {
  return maskConnectionString(process.env.DATABASE_URL || '');
}

// ------------------------------------------
// verify
// ------------------------------------------

/**
 * Compares the two systems unit by unit and reports every disagreement.
 *
 * This is the gate on turning INVENTORY_SQL_MODE on. The comparison runs in
 * the database (the inventory_migration_check view) rather than in application
 * code, so it reads exactly what is stored rather than what the application
 * believes is stored.
 */
async function verify(): Promise<number> {
  const summary = await pool.query(
    'SELECT verdict, COUNT(*)::int AS count FROM inventory_migration_check GROUP BY verdict ORDER BY verdict'
  );

  const counts: Record<string, number> = {};
  for (const row of summary.rows) counts[row.verdict] = row.count;

  const totals = await pool.query(`
    SELECT
      COALESCE(SUM(legacy_stock), 0)::int    AS legacy_total,
      COALESCE(SUM(sql_available), 0)::int   AS sql_available_total,
      COALESCE(SUM(sql_reserved), 0)::int    AS sql_reserved_total,
      COALESCE(SUM(sql_sold), 0)::int        AS sql_sold_total
    FROM inventory_migration_check
  `);
  const t = totals.rows[0];

  console.log('\nInventory migration verification');
  console.log('='.repeat(64));
  console.log(`  target                 ${maskedTarget()}`);
  console.log(`  INVENTORY_SQL_MODE     ${env.inventory.sqlMode ? 'ON (SQL authoritative)' : 'off (JSONB authoritative)'}`);
  console.log(`  mirroring legacy       ${env.inventory.mirrorLegacy ? 'yes' : 'NO — rollback not available'}`);
  console.log('-'.repeat(64));
  console.log(`  MATCH                  ${counts.MATCH || 0}`);
  console.log(`  MISMATCH               ${counts.MISMATCH || 0}`);
  console.log(`  MISSING_IN_SQL         ${counts.MISSING_IN_SQL || 0}`);
  console.log(`  MISSING_IN_LEGACY      ${counts.MISSING_IN_LEGACY || 0}`);
  console.log('-'.repeat(64));
  console.log(`  legacy stock total     ${t.legacy_total}`);
  console.log(`  SQL available total    ${t.sql_available_total}`);
  console.log(`  SQL reserved total     ${t.sql_reserved_total}`);
  console.log(`  SQL sold total         ${t.sql_sold_total}`);

  const problems = (counts.MISMATCH || 0) + (counts.MISSING_IN_SQL || 0);
  if (problems > 0) {
    const rows = await pool.query(
      `SELECT product_id, variant_id, size_label, legacy_stock, sql_available, difference, verdict
       FROM inventory_migration_check WHERE verdict <> 'MATCH' ORDER BY product_id LIMIT 50`
    );
    console.log('\nUnits that disagree (first 50):');
    for (const r of rows.rows) {
      console.log(
        `  ${r.verdict.padEnd(18)} ${r.product_id}/${r.variant_id || '-'}/${r.size_label || '-'}  ` +
          `legacy=${r.legacy_stock ?? 'n/a'} sql=${r.sql_available ?? 'n/a'} diff=${r.difference}`
      );
    }
  }

  // Products whose inStock flag disagrees with their actual sellable units.
  //
  // Reported, never repaired automatically. The flag is also the admin's
  // manual "hide this" switch, so a product flagged out-of-stock while its
  // shades still have units is either the old pool-drain bug or a deliberate
  // decision — and this tool cannot tell which. Silently un-hiding a product
  // an admin chose to hide would be exactly the kind of unannounced change
  // this migration is supposed to avoid.
  const flagged = await findFlagMismatches();
  if (flagged.length > 0) {
    console.log(`\n${flagged.length} product(s) flagged out of stock but holding sellable units:`);
    for (const row of flagged.slice(0, 20)) {
      console.log(`  ${row.id.padEnd(32)} ${row.name}`);
      console.log(`    pool=${row.poolStock}  sellable units: ${row.units}`);
    }
    console.log('\n  These are hidden from the shop and refused at checkout.');
    console.log('  If that is the old pool-drain bug rather than a deliberate hide:');
    console.log('      npm run inventory:repair-flags -- --confirm\n');
  }

  // MISSING_IN_LEGACY is not a failure: it is what an admin creating a new
  // per-shade stock level in SQL mode looks like, and the legacy document
  // simply has no entry for it yet.
  const safe = problems === 0;
  console.log('='.repeat(64));
  console.log(safe ? '  RESULT: systems agree — safe to switch\n' : '  RESULT: systems DISAGREE — do not switch\n');
  return safe ? 0 : 1;
}

/**
 * Products marked out of stock that nonetheless have a buyable unit.
 *
 * Reads cms_state directly rather than through loadDatabase().
 *
 * That is not a style preference. loadDatabase() reinitialises the entire CMS
 * document — `saveDatabase(getInitialDatabase())` — if anything at all throws
 * while reading it, including a shape it does not expect. Calling it from a
 * command documented as read-only means a verification run against production
 * could silently replace the whole catalogue with seed data. It did exactly
 * that during testing, which is how this was found. A plain SELECT cannot.
 */
async function findFlagMismatches(): Promise<
  { id: string; name: string; poolStock: number; units: string }[]
> {
  // Filtered in SQL to the out-of-stock-flagged products only, rather than
  // pulling the whole document across. `SELECT data FROM cms_state` transfers
  // the entire catalogue (~72KB on production) and repeatedly blew the pool's
  // 15s query_timeout, which made this command — the cutover gate — fail on a
  // throttled endpoint. Almost always this returns zero rows.
  const res = await pool.query<{ product: any }>(
    `SELECT p AS product
     FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS p
     WHERE s.id = 'main' AND (p->>'inStock') = 'false'`
  );
  const products: any[] = res.rows.map((r) => r.product);
  const out: { id: string; name: string; poolStock: number; units: string }[] = [];

  for (const product of products) {
    // The SQL above already restricted this to inStock=false; the quantity
    // question still needs the shared resolver, which understands the
    // shade/size fallback hierarchy.
    if (!hasSellableStock(product)) continue;
    const units = enumerateStockUnits(product)
      .filter((u) => u.stock > 0)
      .map((u) => `${u.variantId || '-'}/${u.sizeLabel || '-'}=${u.stock}`)
      .join(', ');
    out.push({ id: product.id, name: product.name, poolStock: Number(product.stock) || 0, units });
  }
  return out;
}

/**
 * Clears the out-of-stock flag on products that actually have sellable units.
 *
 * Opt-in and confirm-gated, because it can un-hide a product an admin
 * deliberately hid. It only ever makes something *more* available and can
 * never cause an oversell — the per-unit stock check still gates every sale —
 * but it is a visible business change and is treated as one.
 */
async function repairFlags(): Promise<number> {
  const mismatches = await findFlagMismatches();
  if (mismatches.length === 0) {
    console.log('\nNo products need repair: every out-of-stock flag matches its sellable units.\n');
    return 0;
  }

  if (!confirmed) {
    console.log(`\n${mismatches.length} product(s) would have their out-of-stock flag cleared:\n`);
    for (const row of mismatches) {
      console.log(`  ${row.id.padEnd(32)} ${row.name}  (${row.units})`);
    }
    console.log('\nThis un-hides them in the shop. If any was hidden deliberately, fix that one');
    console.log('in the admin panel first. Re-run with --confirm to proceed.\n');
    return 1;
  }

  const ids = new Set(mismatches.map((m) => m.id));
  const db = await loadDatabase();
  db.products = db.products.map((p) => (ids.has(p.id) ? { ...p, inStock: true } : p));
  await saveDatabase(db);

  console.log(`\nRepaired ${ids.size} product(s). They are buyable again.\n`);
  return 0;
}

// ------------------------------------------
// mirror-check
// ------------------------------------------

/**
 * Proves that ONE order wrote to both inventory stores.
 *
 * `verify` compares legacy and SQL in aggregate, which is the right check
 * before a cutover but the wrong one after a deploy: two stores can agree in
 * total while a specific order wrote to only one of them, because an equal and
 * opposite error elsewhere hides it. That is precisely the failure mode the
 * mirror fix addressed — cancelling an order moved legacy and left SQL
 * untouched — and an aggregate total would not have caught it on day one.
 *
 * So this walks a single order's lines and asks, per line:
 *
 *   - did SQL record a reservation (or a sale) of exactly the ordered quantity?
 *   - is there an inventory_transactions row attributing the movement to it?
 *   - does the legacy document agree with SQL for that same unit?
 *
 * Read-only. Never writes, never repairs.
 *
 * Usage:
 *   tsx src/db/cli-inventory.ts mirror-check            (newest order)
 *   tsx src/db/cli-inventory.ts mirror-check GLM1234567 (a specific one)
 */
async function mirrorCheck(orderNumber?: string): Promise<number> {
  const orderRes = orderNumber
    ? await pool.query(
        `SELECT id, order_number, status, payment_method, payment_status, shipping_status,
                stock_committed, stock_restored, created_at
         FROM orders WHERE order_number = $1`,
        [orderNumber]
      )
    : await pool.query(
        `SELECT id, order_number, status, payment_method, payment_status, shipping_status,
                stock_committed, stock_restored, created_at
         FROM orders ORDER BY created_at DESC LIMIT 1`
      );

  const order = orderRes.rows[0];
  if (!order) {
    console.log(orderNumber ? `\nNo order ${orderNumber}.\n` : '\nThere are no orders yet.\n');
    return 1;
  }

  console.log('\nInventory mirror check — one order');
  console.log('='.repeat(72));
  console.log(`  target  ${maskedTarget()}`);
  console.log('='.repeat(72));
  console.log(`  order           ${order.order_number}  (${order.id})`);
  console.log(`  placed          ${new Date(order.created_at).toISOString()}`);
  console.log(`  status          ${order.status} · ${order.payment_method}/${order.payment_status} · ${order.shipping_status || '-'}`);
  console.log(`  stock flags     committed ${order.stock_committed} · restored ${order.stock_restored}`);

  // An order placed before SQL inventory existed cannot be expected to have
  // written to it. Migration 012 created the tables and backfilled them from
  // the catalogue as it stood at that moment; it did not reconstruct history.
  // Reporting such an order as a mirror failure would be noise, and worse,
  // would train whoever runs this to ignore a real failure later.
  const sqlEpochRes = await pool.query<{ applied_at: Date }>(
    `SELECT applied_at FROM schema_migrations WHERE version LIKE '012%' LIMIT 1`
  );
  const sqlEpoch = sqlEpochRes.rows[0]?.applied_at || null;
  const predatesSql = sqlEpoch !== null && new Date(order.created_at) < new Date(sqlEpoch);
  if (predatesSql) {
    console.log(`\n  NOTE: this order predates SQL inventory (012 applied ${new Date(sqlEpoch).toISOString()}).`);
    console.log('        Missing SQL rows below are historical, not mirror failures.');
    console.log('        Run this against an order placed after the mirror deploy instead.');
  }

  // order_items calls the size `selected_size`; inventory calls the same thing
  // `size_label`. Aliased here so the comparison below reads in one vocabulary.
  const items = await pool.query(
    `SELECT product_id, product_name, variant_id, selected_size AS size_label, quantity
     FROM order_items WHERE order_id = $1 ORDER BY product_id`,
    [order.id]
  );
  if (items.rows.length === 0) {
    console.log('\n  This order has no line items.\n');
    return 1;
  }

  // Legacy stock for the products on this order, read with a plain SELECT —
  // never loadDatabase(), for the reason documented on findFlagMismatches().
  const productIds = [...new Set(items.rows.map((i) => i.product_id))];
  const legacyRes = await pool.query<{ product: any }>(
    `SELECT p AS product
     FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS p
     WHERE s.id = 'main' AND (p->>'id') = ANY($1::text[])`,
    [productIds]
  );
  const legacyById = new Map<string, any>(legacyRes.rows.map((r) => [r.product.id, r.product]));

  let problems = 0;
  let warnings = 0;
  const note = (ok: boolean, text: string) => {
    if (!ok) problems++;
    console.log(`      ${ok ? 'OK  ' : 'FAIL'}  ${text}`);
  };
  /** A condition that is known, tracked elsewhere, and not a mirror defect —
   * a historical order, or a product deleted from the catalogue after the
   * fact. Reported, but it does not fail the run. */
  const warn = (text: string) => {
    warnings++;
    console.log(`      WARN  ${text}`);
  };

  console.log(`\n  ${items.rows.length} line(s):`);
  for (const item of items.rows) {
    const unit = `${item.variant_id || '-'}/${item.size_label || '-'}`;
    console.log(`\n    ${item.product_name}  [${item.product_id} ${unit}] ×${item.quantity}`);

    const invRes = await pool.query(
      `SELECT id, available_stock, reserved_stock, sold_stock
       FROM inventory
       WHERE product_id = $1
         AND COALESCE(variant_id, '') = COALESCE($2, '')
         AND COALESCE(size_label, '') = COALESCE($3, '')`,
      [item.product_id, item.variant_id, item.size_label]
    );
    const inv = invRes.rows[0];
    if (!inv) {
      // Two benign reasons for a missing row, and one real one.
      const stillInCatalogue = legacyById.has(item.product_id);
      if (predatesSql) {
        warn('no SQL inventory row — order predates SQL inventory');
      } else if (!stillInCatalogue) {
        // Same condition the health check reports as a WARNING; it is tracked
        // there and does not belong in this command's verdict too.
        warn('no SQL inventory row — product has been deleted from the catalogue');
      } else {
        note(false, 'no SQL inventory row for this unit, yet the product is still in the catalogue');
      }
      continue;
    }
    console.log(`      SQL   available ${inv.available_stock} · reserved ${inv.reserved_stock} · sold ${inv.sold_stock}`);

    const resv = await pool.query(
      `SELECT status, quantity FROM inventory_reservations
       WHERE order_id = $1 AND inventory_id = $2 ORDER BY created_at`,
      [order.id, inv.id]
    );
    const active = resv.rows.filter((r) => r.status === 'ACTIVE');
    const activeQty = active.reduce((n, r) => n + Number(r.quantity), 0);
    const consumed = resv.rows.filter((r) => r.status === 'CONSUMED');
    const released = resv.rows.filter((r) => r.status === 'RELEASED');
    console.log(
      `      reservations  ACTIVE ${activeQty} · CONSUMED ${consumed.length} · RELEASED ${released.length}`
    );

    // What SQL *should* show depends on where the order is in its lifecycle.
    // These are the same three states the fulfilment service moves between.
    const isRestored = order.stock_restored === true;
    const isDelivered = order.shipping_status === 'DELIVERED' || order.status === 'DELIVERED';

    if (isRestored) {
      note(activeQty === 0, `cancelled/returned order holds no ACTIVE reservation (holds ${activeQty})`);
      note(released.length > 0 || resv.rows.length === 0, 'the reservation was released rather than abandoned');
    } else if (isDelivered) {
      note(activeQty === 0, `delivered order holds no ACTIVE reservation (holds ${activeQty})`);
      note(consumed.length > 0, 'the reservation was consumed into sold stock');
    } else if (order.stock_committed) {
      // The live case: an in-flight order must be holding exactly its quantity.
      note(
        activeQty === Number(item.quantity),
        `in-flight order holds an ACTIVE reservation of ${item.quantity} (holds ${activeQty})`
      );
    } else {
      console.log('      --    stock not committed yet; nothing should be reserved');
      note(activeQty === 0, `uncommitted order holds no reservation (holds ${activeQty})`);
    }

    const txns = await pool.query(
      `SELECT operation, quantity FROM inventory_transactions
       WHERE order_id = $1 AND inventory_id = $2 ORDER BY created_at`,
      [order.id, inv.id]
    );
    console.log(
      `      transactions  ${txns.rows.length === 0 ? '(none)' : txns.rows.map((t) => `${t.operation}×${t.quantity}`).join(', ')}`
    );
    if (order.stock_committed) {
      note(txns.rows.length > 0, 'the SQL movement is attributed to this order in inventory_transactions');
      // Idempotency: one movement per operation, never two for one order.
      const dupes = txns.rows
        .map((t) => t.operation)
        .filter((op, i, all) => all.indexOf(op) !== i);
      note(dupes.length === 0, `no duplicate transaction records${dupes.length ? ` (repeated: ${[...new Set(dupes)].join(', ')})` : ''}`);
    }

    // The mirror question itself: does the legacy document agree with SQL for
    // this exact unit?
    const product = legacyById.get(item.product_id);
    if (!product) {
      warn('product is no longer in the legacy catalogue, so the stores cannot be compared');
      continue;
    }
    const legacyUnit = enumerateStockUnits(product).find(
      (u) => (u.variantId || '') === (item.variant_id || '') && (u.sizeLabel || '') === (item.size_label || '')
    );
    const legacyStock = legacyUnit ? Number(legacyUnit.stock) : Number(product.stock) || 0;
    console.log(`      legacy  stock ${legacyStock}`);
    // Phrased as a comparison rather than a claim, so the line reads correctly
    // under both the OK and the FAIL prefix.
    note(
      legacyStock === Number(inv.available_stock),
      `legacy ${legacyStock} vs SQL available ${inv.available_stock}` +
        (legacyStock === Number(inv.available_stock) ? ' — agree' : ` — DRIFT of ${legacyStock - Number(inv.available_stock)}`)
    );
  }

  // The aggregate picture too, so one command answers both questions.
  const totals = await pool.query(
    `SELECT COALESCE(SUM(available_stock),0)::int a, COALESCE(SUM(reserved_stock),0)::int r,
            COALESCE(SUM(sold_stock),0)::int s FROM inventory`
  );
  console.log(
    `\n  overall SQL totals  available ${totals.rows[0].a} · reserved ${totals.rows[0].r} · sold ${totals.rows[0].s}`
  );

  console.log('='.repeat(72));
  if (problems > 0) {
    console.log(`  RESULT: ${problems} problem(s) — see the FAIL lines above\n`);
    return 1;
  }
  if (predatesSql) {
    console.log(`  RESULT: inconclusive — this order predates SQL inventory (${warnings} warning(s)).`);
    console.log('          The mirror can only be proven by an order placed after the deploy.\n');
    return 2;
  }
  if (warnings > 0) {
    console.log(`  RESULT: no mirror failure, but ${warnings} line(s) could not be compared — see WARN above\n`);
    return 0;
  }
  console.log('  RESULT: both stores recorded this order — mirror is working\n');
  return 0;
}

// ------------------------------------------
// health
// ------------------------------------------

/**
 * Post-cutover invariant check.
 *
 * `verify` answers "do legacy and SQL agree", which stops meaning anything the
 * day INVENTORY_MIRROR_LEGACY is turned off. This answers the question that
 * stays relevant forever: "is SQL inventory internally consistent?"
 *
 * Each check below is an invariant the system is supposed to maintain on its
 * own. A violation is a bug, not a configuration difference — which is why
 * this reports rather than repairs: silently correcting a counter would hide
 * the defect that moved it.
 *
 * Read-only. Safe to run against production on a schedule.
 */
async function health(): Promise<number> {
  const report = await runInventoryHealthChecks();

  console.log('\nSQL inventory health');
  console.log('='.repeat(72));
  console.log(`  target  ${maskedTarget()}`);
  console.log('='.repeat(72));

  // One line per invariant, named so a failure says what broke rather than
  // just that something did.
  const byCheck = (name: string) => report.problems.filter((p) => p.check === name).length;
  const row = (label: string, failures: number, unit = 'PROBLEM') =>
    console.log(`  ${label.padEnd(44)} ${failures === 0 ? 'OK' : `${failures} ${unit}`}`);

  row('reserved_stock matches active reservations', byCheck('reserved_stock drift'), 'MISMATCH');
  row('no negative counters', byCheck('negative counters'), 'FAILED');
  row('no long-expired reservations', byCheck('stale reservations'), 'STALE');
  row('in-flight orders hold a reservation', byCheck('order holds stock with no reservation'), 'MISSING');
  row('delivered orders converted to sold', byCheck('delivered order still reserving'), 'PENDING');
  row('inventory rows match the catalogue', report.orphanedProducts.length, 'ORPHANED');

  const t = report.totals;
  console.log('-'.repeat(72));
  console.log(
    `  units ${t.units} · available ${t.available} · reserved ${t.reserved} · sold ${t.sold} · low-stock ${t.lowStock}`
  );

  if (report.orphanedProducts.length > 0) {
    console.log('\nInventory for products no longer in the catalogue (informational):');
    report.orphanedProducts.slice(0, 20).forEach((id) => console.log(`  ${id}`));
  }

  if (report.problems.length > 0) {
    console.log('\nProblems found:');
    for (const p of report.problems.slice(0, 50)) {
      console.log(`  [${p.severity.toUpperCase()}] [${p.check}] ${p.detail}`);
    }
    console.log('\nThese are internal inconsistencies, not configuration differences.');
    console.log('Nothing has been changed — investigate before correcting anything by hand.');
  }

  console.log('');
  console.log('='.repeat(72));
  console.log(
    report.problems.length === 0
      ? '  RESULT: inventory is internally consistent'
      : `  RESULT: ${report.problems.length} problem(s) found`
  );
  console.log('='.repeat(72) + '\n');
  return report.problems.length === 0 ? 0 : 1;
}

// ------------------------------------------
// resync
// ------------------------------------------

/**
 * Re-copies JSONB stock into SQL inventory.
 *
 * For the pre-cutover window only: while the JSONB is still authoritative,
 * admin product edits change it without touching SQL, so the two drift. This
 * brings SQL back in line.
 *
 * Refuses to run once SQL is authoritative — at that point SQL holds the truth
 * and copying the JSONB over it would discard real sales.
 */
async function resync(): Promise<number> {
  if (env.inventory.sqlMode) {
    console.error(
      '\nREFUSING: INVENTORY_SQL_MODE is on, so SQL inventory is the source of truth.\n' +
        'Copying the legacy document over it would overwrite real stock movements.\n' +
        'Turn the flag off first if you genuinely intend to reset SQL from legacy.\n'
    );
    return 1;
  }
  if (!confirmed) {
    console.error('\nThis overwrites SQL inventory available_stock from the legacy document.\nRe-run with --confirm.\n');
    return 1;
  }

  const db = await loadDatabase();
  let updated = 0;
  let created = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const product of db.products) {
      // Same four levels the migration backfills, and the same rule: a level
      // only gets a row when it defines its own number.
      const units: { variantId: string | null; sizeLabel: string | null; stock: number }[] = [
        { variantId: null, sizeLabel: null, stock: Math.max(0, Number(product.stock) || 0) },
      ];

      for (const shade of product.shades || []) {
        if (typeof shade.stock === 'number') {
          units.push({ variantId: shade.id, sizeLabel: null, stock: Math.max(0, shade.stock) });
        }
        for (const size of shade.sizes || []) {
          if (typeof size.stock === 'number') {
            units.push({ variantId: shade.id, sizeLabel: size.label, stock: Math.max(0, size.stock) });
          }
        }
      }
      for (const [label, entry] of Object.entries(product.sizePricing || {})) {
        if (typeof entry?.stock === 'number') {
          units.push({ variantId: null, sizeLabel: label, stock: Math.max(0, entry.stock) });
        }
      }

      for (const unit of units) {
        const existing = await client.query(
          `SELECT id, available_stock FROM inventory
           WHERE product_id = $1 AND variant_id IS NOT DISTINCT FROM $2 AND size_label IS NOT DISTINCT FROM $3
           FOR UPDATE`,
          [product.id, unit.variantId, unit.sizeLabel]
        );

        if (existing.rows.length === 0) {
          const id = 'inv-resync-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
          await client.query(
            `INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
             VALUES ($1,$2,$3,$4,$5)`,
            [id, product.id, unit.variantId, unit.sizeLabel, unit.stock]
          );
          await client.query(
            `INSERT INTO inventory_transactions
               (id, inventory_id, product_id, variant_id, size_label, operation, quantity,
                previous_available, new_available, previous_reserved, new_reserved,
                previous_sold, new_sold, actor, reason)
             VALUES ($1,$2,$3,$4,$5,'MIGRATE',$6,0,$6,0,0,0,0,'system','Resynced from legacy JSONB')`,
            ['invtx-resync-' + id, id, product.id, unit.variantId, unit.sizeLabel, unit.stock]
          );
          created++;
          continue;
        }

        const row = existing.rows[0];
        if (Number(row.available_stock) === unit.stock) continue;

        await client.query('UPDATE inventory SET available_stock = $2, updated_at = now() WHERE id = $1', [
          row.id,
          unit.stock,
        ]);
        await client.query(
          `INSERT INTO inventory_transactions
             (id, inventory_id, product_id, variant_id, size_label, operation, quantity,
              previous_available, new_available, previous_reserved, new_reserved,
              previous_sold, new_sold, actor, reason)
           SELECT $1,$2,$3,$4,$5,'ADJUST',$6,$7,$8,reserved_stock,reserved_stock,sold_stock,sold_stock,
                  'system','Resynced from legacy JSONB'
           FROM inventory WHERE id = $2`,
          [
            'invtx-resync-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            row.id,
            product.id,
            unit.variantId,
            unit.sizeLabel,
            unit.stock - Number(row.available_stock),
            Number(row.available_stock),
            unit.stock,
          ]
        );
        updated++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  console.log(`\nResync complete: ${created} unit(s) created, ${updated} updated.\n`);
  return 0;
}

// ------------------------------------------
// rollback
// ------------------------------------------

/**
 * Copies SQL available_stock back into the legacy JSONB document.
 *
 * Only needed if INVENTORY_MIRROR_LEGACY was turned off and the JSONB has gone
 * stale. While mirroring is on — the default — the document is already current
 * and rolling back is just a matter of setting INVENTORY_SQL_MODE=false.
 *
 * Writes available_stock, not available+reserved: reserved units belong to
 * live orders and are not for sale, which is exactly what the legacy number
 * meant.
 */
async function rollback(): Promise<number> {
  if (!confirmed) {
    console.error(
      '\nThis overwrites legacy JSONB stock from SQL inventory.\n' +
        'If INVENTORY_MIRROR_LEGACY was left on (the default) you almost certainly do not need this —\n' +
        'setting INVENTORY_SQL_MODE=false is a complete rollback on its own.\n' +
        'Re-run with --confirm if you are sure.\n'
    );
    return 1;
  }

  const rows = await pool.query('SELECT product_id, variant_id, size_label, available_stock FROM inventory');
  const byProduct = new Map<string, typeof rows.rows>();
  for (const row of rows.rows) {
    const list = byProduct.get(row.product_id) || [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }

  const db = await loadDatabase();
  let touched = 0;

  db.products = db.products.map((product) => {
    const units = byProduct.get(product.id);
    if (!units) return product;

    let next = { ...product };

    const poolRow = units.find((u) => !u.variant_id && !u.size_label);
    if (poolRow) {
      const stock = Number(poolRow.available_stock);
      next = { ...next, stock, inStock: stock > 0 };
      touched++;
    }

    if (next.shades) {
      next = {
        ...next,
        shades: next.shades.map((shade) => {
          let nextShade = { ...shade };
          const shadeRow = units.find((u) => u.variant_id === shade.id && !u.size_label);
          // Only written back where the shade already carried its own number:
          // adding one where there was none would change which value gates a
          // sale, which is precisely what a rollback must not do.
          if (shadeRow && typeof shade.stock === 'number') {
            nextShade = { ...nextShade, stock: Number(shadeRow.available_stock) };
            touched++;
          }
          if (nextShade.sizes) {
            nextShade = {
              ...nextShade,
              sizes: nextShade.sizes.map((size) => {
                const sizeRow = units.find((u) => u.variant_id === shade.id && u.size_label === size.label);
                if (sizeRow && typeof size.stock === 'number') {
                  touched++;
                  return { ...size, stock: Number(sizeRow.available_stock) };
                }
                return size;
              }),
            };
          }
          return nextShade;
        }),
      };
    }

    if (next.sizePricing) {
      const nextPricing = { ...next.sizePricing };
      for (const [label, entry] of Object.entries(nextPricing)) {
        const sizeRow = units.find((u) => !u.variant_id && u.size_label === label);
        if (sizeRow && typeof entry?.stock === 'number') {
          nextPricing[label] = { ...entry, stock: Number(sizeRow.available_stock) };
          touched++;
        }
      }
      next = { ...next, sizePricing: nextPricing };
    }

    return next;
  });

  await saveDatabase(db);
  console.log(`\nRollback complete: ${touched} stock value(s) written back into the legacy document.\n`);
  console.log('Set INVENTORY_SQL_MODE=false and restart to serve from legacy again.\n');
  return 0;
}

// ------------------------------------------

async function main(): Promise<void> {
  // ensureSchema() APPLIES PENDING MIGRATIONS. That is correct for the write
  // commands, which need the tables they are about to mutate — but running it
  // for `verify` would mean that merely checking whether it is safe to migrate
  // silently performs the migration. The whole point of verifying first is to
  // decide, not to act.
  //
  // So `verify` only confirms that migration 012 has already been applied, and
  // says so plainly if it has not.
  if (command === 'verify' || command === 'health' || command === 'mirror-check') {
    const viewExists = await pool.query(
      `SELECT 1 FROM information_schema.views WHERE table_name = 'inventory_migration_check'`
    );
    if (viewExists.rows.length === 0) {
      console.log('\nMigration 012 has not been applied to this database yet.');
      console.log('There is nothing to verify: SQL inventory does not exist here.');
      console.log('Apply it with `npm run migrate`, then run this again.\n');
      await pool.end();
      process.exit(1);
    }
  } else {
    await ensureSchema();
  }

  let code = 0;
  switch (command) {
    case 'verify':
      code = await verify();
      break;
    case 'resync':
      code = await resync();
      break;
    case 'rollback':
      code = await rollback();
      break;
    case 'repair-flags':
      code = await repairFlags();
      break;
    case 'health':
      code = await health();
      break;
    case 'mirror-check':
      // Third argument is an optional order number; anything starting with
      // `--` is a flag, not an order.
      code = await mirrorCheck(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : undefined);
      break;
    default:
      console.log('\nUsage: tsx src/db/cli-inventory.ts <verify|health|mirror-check [orderNumber]|resync|rollback|repair-flags> [--confirm]\n');
      code = 1;
  }

  await pool.end();
  process.exit(code);
}

main().catch((err) => {
  console.error('\nInventory tool failed:', err);
  process.exit(1);
});
