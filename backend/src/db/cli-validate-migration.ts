/**
 * Pre-production validation for migration 012.
 *
 *   DATABASE_URL="<neon branch connection string>" npm run inventory:validate
 *
 * Runs the whole pre-cutover checklist against a restored snapshot in one
 * command, so the decision to migrate production rests on a single reproducible
 * run rather than a sequence of manual steps someone might do differently.
 *
 * It performs every step the brief asks for:
 *
 *   1. refuses to run against production
 *   2. fingerprints cms_state before anything happens
 *   3. applies migration 012
 *   4. re-fingerprints, proving legacy JSONB was not touched
 *   5. runs verification twice and compares the two byte for byte
 *   6. reports MATCH / MISMATCH / MISSING_IN_SQL / MISSING_IN_LEGACY
 *   7. compares legacy vs SQL totals for available, reserved and sold
 *   8. censuses the real catalogue shapes that were migrated
 *   9. reports flag-mismatch products WITHOUT deciding anything about them
 *
 * It never writes to cms_state and never deletes anything.
 */

import crypto from 'crypto';
import fs from 'fs';
import { pool, ensureSchema } from './db';
import { PATHS } from '../config/paths';
import { env } from '../config/env';

// ==========================================
// PRODUCTION GUARD
//
// This applies a migration, so it must never point at production. The check
// compares the target against the DATABASE_URL recorded in the repo-root .env
// — which on this project IS production — and refuses an exact match.
//
// A Neon branch has a different endpoint host from its parent, so a genuine
// branch string passes while the production string cannot.
// ==========================================

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function assertNotProduction(target: string): void {
  // Read .env directly rather than through env.databaseUrl: by the time this
  // runs, DATABASE_URL in the process has already been overridden by whoever
  // invoked the command, so the in-process value is the target, not the
  // baseline being compared against.
  let configured = '';
  try {
    const envFile = fs.readFileSync(PATHS.envFile, 'utf8');
    const match = envFile.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
    configured = match ? match[1].trim() : '';
  } catch {
    // No .env to compare against — the explicit confirmation below still applies.
  }

  const targetHost = hostOf(target);
  const configuredHost = hostOf(configured);

  if (configured && target === configured) {
    console.error(
      '\nREFUSING TO RUN.\n\n' +
        'DATABASE_URL is identical to the one in .env, which on this project is PRODUCTION.\n' +
        'Create a Neon branch and pass its connection string instead:\n\n' +
        '    neon branches create --name migration-012-validation\n' +
        '    neon connection-string migration-012-validation\n'
    );
    process.exit(1);
  }

  if (configuredHost && targetHost === configuredHost) {
    console.error(
      '\nREFUSING TO RUN.\n\n' +
        `The target host (${targetHost}) is the same endpoint as the one in .env.\n` +
        'A Neon branch has its own endpoint host, so this is almost certainly production.\n'
    );
    process.exit(1);
  }

  if (!process.argv.includes('--confirm-not-production')) {
    console.error(
      '\nThis applies migration 012 to:\n\n' +
        `    ${target.replace(/:[^:@/]+@/, ':***@')}\n\n` +
        'Confirm this is a throwaway snapshot or a Neon branch, NOT production:\n\n' +
        '    npm run inventory:validate -- --confirm-not-production\n'
    );
    process.exit(1);
  }
}

// ==========================================

const line = (c = '=') => console.log(c.repeat(72));

async function cmsFingerprint(): Promise<{ md5: string | null; products: number; bytes: number }> {
  const res = await pool.query(
    `SELECT md5(data::text) AS md5,
            jsonb_array_length(COALESCE(data->'products','[]'::jsonb)) AS products,
            length(data::text) AS bytes
     FROM cms_state WHERE id = 'main'`
  );
  const row = res.rows[0];
  return {
    md5: row?.md5 || null,
    products: Number(row?.products) || 0,
    bytes: Number(row?.bytes) || 0,
  };
}

/** The verification figures, gathered as data so two runs can be compared
 * structurally rather than by scraping printed text. */
async function verificationSnapshot(): Promise<Record<string, number>> {
  const [verdicts, totals] = await Promise.all([
    pool.query('SELECT verdict, COUNT(*)::int AS n FROM inventory_migration_check GROUP BY verdict'),
    pool.query(`
      SELECT COALESCE(SUM(legacy_stock),0)::int  AS legacy_total,
             COALESCE(SUM(sql_available),0)::int AS sql_available,
             COALESCE(SUM(sql_reserved),0)::int  AS sql_reserved,
             COALESCE(SUM(sql_sold),0)::int      AS sql_sold
      FROM inventory_migration_check
    `),
  ]);

  const out: Record<string, number> = {
    MATCH: 0,
    MISMATCH: 0,
    MISSING_IN_SQL: 0,
    MISSING_IN_LEGACY: 0,
    ...totals.rows[0],
  };
  for (const row of verdicts.rows) out[row.verdict] = row.n;
  return out;
}

/** What shapes the real catalogue actually contains, so the run can be judged
 * against the data rather than against an assumption about it. */
async function catalogueCensus(): Promise<Record<string, number>> {
  const res = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE variant_id IS NULL AND size_label IS NULL)::int         AS product_level,
      COUNT(*) FILTER (WHERE variant_id IS NOT NULL AND size_label IS NULL)::int     AS shade_level,
      COUNT(*) FILTER (WHERE variant_id IS NOT NULL AND size_label IS NOT NULL)::int AS shade_size_level,
      COUNT(*) FILTER (WHERE variant_id IS NULL AND size_label IS NOT NULL)::int     AS product_size_level,
      COUNT(*)::int                                                                   AS total_units,
      COUNT(DISTINCT product_id)::int                                                 AS distinct_products
    FROM inventory
  `);
  return res.rows[0];
}

/** Products flagged out of stock that still hold sellable units. Reported
 * only — this tool makes no business decision about them. */
async function flagMismatches(): Promise<{ id: string; name: string; pool: number; units: string }[]> {
  const res = await pool.query(`SELECT data FROM cms_state WHERE id = 'main'`);
  const products: any[] = res.rows[0]?.data?.products || [];
  const { hasSellableStock, enumerateStockUnits } = await import('@glamirk/shared/utils/productVariant');

  return products
    .filter((p) => p.inStock === false && hasSellableStock(p))
    .map((p) => ({
      id: p.id,
      name: p.name,
      pool: Number(p.stock) || 0,
      units: enumerateStockUnits(p)
        .filter((u: any) => u.stock > 0)
        .map((u: any) => `${u.variantId || '-'}/${u.sizeLabel || '-'}=${u.stock}`)
        .join(', '),
    }));
}

async function main(): Promise<void> {
  const target = process.env.DATABASE_URL || '';
  assertNotProduction(target);

  console.log('\nMigration 012 pre-production validation');
  line();
  console.log(`  target        ${target.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`  SQL mode      ${env.inventory.sqlMode ? 'ON' : 'off'}`);
  console.log(`  mirror legacy ${env.inventory.mirrorLegacy ? 'yes' : 'NO'}`);
  line();

  // --- 1. fingerprint before -------------------------------------------
  const before = await cmsFingerprint();
  if (!before.md5) {
    console.error('\nNo cms_state row found. This does not look like a restored snapshot.\n');
    await pool.end();
    process.exit(1);
  }
  console.log('\n[1] cms_state BEFORE migration');
  console.log(`      md5       ${before.md5}`);
  console.log(`      products  ${before.products}`);
  console.log(`      size      ${before.bytes} bytes`);

  // --- 2. apply migrations ---------------------------------------------
  console.log('\n[2] applying pending migrations');
  await ensureSchema();

  // --- 3. fingerprint after --------------------------------------------
  const after = await cmsFingerprint();
  console.log('\n[3] cms_state AFTER migration');
  console.log(`      md5       ${after.md5}`);
  console.log(`      products  ${after.products}`);
  const untouched = before.md5 === after.md5 && before.products === after.products;
  console.log(`      verdict   ${untouched ? 'UNCHANGED — legacy JSONB not touched' : '*** MODIFIED ***'}`);

  // --- 4. verification, twice ------------------------------------------
  console.log('\n[4] verification run 1');
  const run1 = await verificationSnapshot();
  console.log('[5] verification run 2');
  const run2 = await verificationSnapshot();

  const h1 = crypto.createHash('sha256').update(JSON.stringify(run1)).digest('hex');
  const h2 = crypto.createHash('sha256').update(JSON.stringify(run2)).digest('hex');
  const identical = h1 === h2;

  line('-');
  console.log(`  MATCH                ${run1.MATCH}`);
  console.log(`  MISMATCH             ${run1.MISMATCH}`);
  console.log(`  MISSING_IN_SQL       ${run1.MISSING_IN_SQL}`);
  console.log(`  MISSING_IN_LEGACY    ${run1.MISSING_IN_LEGACY}`);
  line('-');
  console.log(`  legacy stock total   ${run1.legacy_total}`);
  console.log(`  SQL available total  ${run1.sql_available}`);
  console.log(`  SQL reserved total   ${run1.sql_reserved}`);
  console.log(`  SQL sold total       ${run1.sql_sold}`);
  line('-');
  console.log(`  run 1 sha256         ${h1}`);
  console.log(`  run 2 sha256         ${h2}`);
  console.log(`  verdict              ${identical ? 'IDENTICAL' : '*** RUNS DIFFER ***'}`);

  // --- 5. catalogue shapes ---------------------------------------------
  const census = await catalogueCensus();
  console.log('\n[6] real catalogue shapes migrated');
  console.log(`      distinct products     ${census.distinct_products}`);
  console.log(`      product-level units   ${census.product_level}`);
  console.log(`      shade-level units     ${census.shade_level}`);
  console.log(`      shade+size units      ${census.shade_size_level}`);
  console.log(`      product-size units    ${census.product_size_level}`);
  console.log(`      total inventory rows  ${census.total_units}`);

  // --- 6. mismatching units --------------------------------------------
  if (run1.MISMATCH > 0 || run1.MISSING_IN_SQL > 0) {
    const rows = await pool.query(
      `SELECT product_id, variant_id, size_label, legacy_stock, sql_available, difference, verdict
       FROM inventory_migration_check WHERE verdict NOT IN ('MATCH','MISSING_IN_LEGACY')
       ORDER BY product_id LIMIT 50`
    );
    console.log('\n[7] units that disagree (first 50)');
    for (const r of rows.rows) {
      console.log(
        `      ${r.verdict.padEnd(18)} ${r.product_id}/${r.variant_id || '-'}/${r.size_label || '-'} ` +
          `legacy=${r.legacy_stock ?? 'n/a'} sql=${r.sql_available ?? 'n/a'} diff=${r.difference}`
      );
    }
  }

  // --- 7. flag mismatches, reported only -------------------------------
  const flagged = await flagMismatches();
  console.log(`\n[8] products flagged out-of-stock but holding sellable units: ${flagged.length}`);
  for (const row of flagged.slice(0, 25)) {
    console.log(`      ${row.id.padEnd(36)} ${row.name}`);
    console.log(`        pool=${row.pool}  units: ${row.units}`);
  }
  if (flagged.length > 0) {
    console.log('\n      NOT repaired. Each is either the old pool-drain bug or a deliberate');
    console.log('      hide, and this tool cannot tell which. Decide per product, then:');
    console.log('          npm run inventory:repair-flags -- --confirm');
  }

  // --- verdict ----------------------------------------------------------
  const green =
    untouched &&
    identical &&
    run1.MISMATCH === 0 &&
    run1.MISSING_IN_SQL === 0 &&
    run1.MISSING_IN_LEGACY === 0;

  console.log('');
  line();
  if (green) {
    console.log('  RESULT: all checks green — production migration may be considered');
  } else {
    console.log('  RESULT: NOT GREEN — do not migrate production');
    if (!untouched) console.log('          - cms_state was modified by the migration');
    if (!identical) console.log('          - the two verification runs disagree');
    if (run1.MISMATCH) console.log(`          - ${run1.MISMATCH} unit(s) mismatch`);
    if (run1.MISSING_IN_SQL) console.log(`          - ${run1.MISSING_IN_SQL} unit(s) missing in SQL`);
    if (run1.MISSING_IN_LEGACY) console.log(`          - ${run1.MISSING_IN_LEGACY} unit(s) missing in legacy`);
  }
  line();
  console.log('');

  await pool.end();
  process.exit(green ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nValidation failed:', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
