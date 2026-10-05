/**
 * Read-only production inspection.
 *
 *   npm run inventory:inspect
 *
 * Records the two things the pre-migration checklist asks for — current legacy
 * inventory totals, and the real catalogue hierarchy — without writing
 * anything.
 *
 * STRICTLY READ-ONLY, and structurally so:
 *
 *   * It does not import db.ts. That module's ensureSchema() APPLIES PENDING
 *     MIGRATIONS, and loadDatabase() historically reseeded the whole CMS on a
 *     read error. Importing either here would mean an "inspection" could
 *     migrate or overwrite production. A bare pg Pool cannot.
 *   * Every statement below is a SELECT. There is no INSERT, UPDATE, DELETE or
 *     DDL anywhere in this file.
 */

import { Pool } from 'pg';
import fs from 'fs';
import { PATHS } from '../config/paths';

function readProductionUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const envFile = fs.readFileSync(PATHS.envFile, 'utf8');
  const match = envFile.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
  if (!match) throw new Error('DATABASE_URL not found');
  return match[1].trim();
}

const mask = (url: string) => url.replace(/:[^:@/]+@/, ':***@');

async function main(): Promise<void> {
  const url = readProductionUrl();
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    // Short, so a hung connection fails fast rather than appearing to work.
    connectionTimeoutMillis: 15000,
  });

  console.log('\nProduction inspection (READ-ONLY)');
  console.log('='.repeat(72));
  console.log(`  target  ${mask(url)}`);
  console.log('='.repeat(72));

  // --- is migration 012 already applied? -------------------------------
  const applied = await pool.query(
    `SELECT version FROM schema_migrations ORDER BY version`
  );
  const versions = applied.rows.map((r) => r.version);
  const has012 = versions.some((v: string) => v.startsWith('012'));
  console.log(`\n[migrations] ${versions.length} applied, latest: ${versions[versions.length - 1] || 'none'}`);
  console.log(`[migrations] 012_sql_inventory: ${has012 ? 'ALREADY APPLIED' : 'NOT APPLIED'}`);

  const invTables = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('inventory','inventory_reservations','inventory_transactions')`
  );
  console.log(`[migrations] inventory tables present: ${invTables.rows.length}/3`);

  // --- catalogue hierarchy ---------------------------------------------
  // Counted in SQL over the stored JSONB, mirroring exactly the levels the
  // migration backfills: a level only counts when it defines its own stock
  // number, because one that does not falls back outward and must not get a
  // row of its own.
  const hierarchy = await pool.query(`
    WITH p AS (
      SELECT prod FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS prod
      WHERE s.id = 'main'
    )
    SELECT
      (SELECT COUNT(*) FROM p)::int AS products,
      (SELECT COUNT(*) FROM p WHERE prod ? 'shades'
         AND jsonb_array_length(COALESCE(prod->'shades','[]'::jsonb)) > 0)::int AS products_with_shades,
      (SELECT COALESCE(SUM(jsonb_array_length(COALESCE(prod->'shades','[]'::jsonb))),0) FROM p)::int AS total_shades,
      (SELECT COUNT(*) FROM p, LATERAL jsonb_array_elements(COALESCE(prod->'shades','[]'::jsonb)) sh
         WHERE sh ? 'stock' AND jsonb_typeof(sh->'stock') = 'number')::int AS shade_level_stock,
      (SELECT COUNT(*) FROM p, LATERAL jsonb_array_elements(COALESCE(prod->'shades','[]'::jsonb)) sh,
              LATERAL jsonb_array_elements(COALESCE(sh->'sizes','[]'::jsonb)) sz
         WHERE sz ? 'stock' AND jsonb_typeof(sz->'stock') = 'number')::int AS shade_size_stock,
      (SELECT COUNT(*) FROM p, LATERAL jsonb_each(COALESCE(prod->'sizePricing','{}'::jsonb)) sp
         WHERE sp.value ? 'stock' AND jsonb_typeof(sp.value->'stock') = 'number')::int AS sizepricing_stock
  `);
  const h = hierarchy.rows[0];

  console.log('\n[catalogue] real production hierarchy');
  console.log(`      products                        ${h.products}`);
  console.log(`      products with shades            ${h.products_with_shades}`);
  console.log(`      shades (total)                  ${h.total_shades}`);
  console.log('      --- levels that define their own stock, i.e. inventory rows ---');
  console.log(`      product-level units             ${h.products}`);
  console.log(`      shade-level units               ${h.shade_level_stock}`);
  console.log(`      shade+size units                ${h.shade_size_stock}`);
  console.log(`      sizePricing units               ${h.sizepricing_stock}`);
  console.log(
    `      EXPECTED inventory rows         ${h.products + h.shade_level_stock + h.shade_size_stock + h.sizepricing_stock}`
  );

  // --- legacy inventory totals ------------------------------------------
  const totals = await pool.query(`
    WITH legacy AS (
      SELECT COALESCE((prod->>'stock')::int, 0) AS qty
      FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS prod
      WHERE s.id = 'main'
      UNION ALL
      SELECT COALESCE((sh->>'stock')::int, 0)
      FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS prod,
           LATERAL jsonb_array_elements(COALESCE(prod->'shades','[]'::jsonb)) sh
      WHERE s.id = 'main' AND sh ? 'stock' AND jsonb_typeof(sh->'stock') = 'number'
      UNION ALL
      SELECT COALESCE((sz->>'stock')::int, 0)
      FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS prod,
           LATERAL jsonb_array_elements(COALESCE(prod->'shades','[]'::jsonb)) sh,
           LATERAL jsonb_array_elements(COALESCE(sh->'sizes','[]'::jsonb)) sz
      WHERE s.id = 'main' AND sz ? 'stock' AND jsonb_typeof(sz->'stock') = 'number'
      UNION ALL
      SELECT COALESCE((sp.value->>'stock')::int, 0)
      FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS prod,
           LATERAL jsonb_each(COALESCE(prod->'sizePricing','{}'::jsonb)) sp
      WHERE s.id = 'main' AND sp.value ? 'stock' AND jsonb_typeof(sp.value->'stock') = 'number'
    )
    SELECT COUNT(*)::int AS units, COALESCE(SUM(qty),0)::int AS total_stock FROM legacy
  `);
  const t = totals.rows[0];
  console.log('\n[inventory] current legacy totals');
  console.log(`      stock-bearing units             ${t.units}`);
  console.log(`      total legacy stock              ${t.total_stock}`);

  // --- what the reserved/sold backfill will derive ----------------------
  const inFlight = await pool.query(`
    SELECT COALESCE(SUM(oi.quantity),0)::int AS qty
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status NOT IN ('DELIVERED','CANCELLED','RETURNED','RTO')
      AND o.stock_committed = true AND o.stock_restored = false
  `);
  const delivered = await pool.query(`
    SELECT COALESCE(SUM(oi.quantity),0)::int AS qty
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'DELIVERED'
  `);
  console.log(`      will backfill as reserved       ${inFlight.rows[0].qty}`);
  console.log(`      will backfill as sold           ${delivered.rows[0].qty}`);

  // --- flag mismatches (reported, never decided) ------------------------
  const cms = await pool.query(`SELECT data FROM cms_state WHERE id = 'main'`);
  const products: any[] = cms.rows[0]?.data?.products || [];
  const { hasSellableStock, enumerateStockUnits } = await import('@glamirk/shared/utils/productVariant');
  const flagged = products.filter((p) => p.inStock === false && hasSellableStock(p));

  console.log(`\n[flags] products marked out-of-stock but holding sellable units: ${flagged.length}`);
  for (const p of flagged.slice(0, 25)) {
    const units = enumerateStockUnits(p)
      .filter((u: any) => u.stock > 0)
      .map((u: any) => `${u.variantId || '-'}/${u.sizeLabel || '-'}=${u.stock}`)
      .join(', ');
    console.log(`      ${String(p.id).padEnd(36)} ${p.name}`);
    console.log(`        pool=${p.stock}  units: ${units}`);
  }

  // --- scale, for context ------------------------------------------------
  const scale = await pool.query(`
    SELECT (SELECT COUNT(*) FROM orders)::int    AS orders,
           (SELECT COUNT(*) FROM customers)::int AS customers,
           (SELECT COUNT(*) FROM order_items)::int AS order_items
  `);
  const s = scale.rows[0];
  console.log(`\n[scale] orders ${s.orders} · order_items ${s.order_items} · customers ${s.customers}`);

  const cmsHash = await pool.query(`SELECT md5(data::text) AS h FROM cms_state WHERE id = 'main'`);
  console.log(`\n[baseline] cms_state md5  ${cmsHash.rows[0].h}`);
  console.log('           Record this. It must be identical after the migration.');

  console.log('');
  console.log('='.repeat(72));
  console.log('  Inspection complete. Nothing was written.');
  console.log('='.repeat(72) + '\n');

  await pool.end();
}

main().catch(async (err) => {
  console.error('\nInspection failed:', err?.message || err);
  process.exit(1);
});
