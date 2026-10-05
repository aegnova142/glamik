/**
 * cms_state data-loss protection.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55436/glamirk_test \
 *     npx tsx src/test/cmsstate.e2e.ts
 *
 * Guards the defect where a failed *read* of the CMS document caused a
 * destructive *write*: loadDatabase() wrapped the SELECT and every
 * normalisation step in one catch that fell through to
 * `saveDatabase(getInitialDatabase())`. A transient connection reset, or a
 * document missing `globalSettings`, silently replaced the entire catalogue,
 * every price, offer and page of CMS copy with seed data.
 *
 * Each case below puts the database into a state that used to trigger that,
 * and asserts the stored document is byte-identical afterwards.
 */

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error(
    '\nREFUSING TO RUN.\n\nDATABASE_URL must point at a local database whose name contains "test".\n' +
      `Got: ${url ? url.replace(/:[^:@/]+@/, ':***@') : '(unset)'}\n`
  );
  process.exit(1);
}

import { pool, ensureSchema, loadDatabase, saveDatabase, __resetCmsCacheForTests } from '../db/db';

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

/** Fingerprint of the stored document, for before/after comparison. */
async function storedHash(): Promise<string | null> {
  const res = await pool.query(`SELECT md5(data::text) AS h FROM cms_state WHERE id = 'main'`);
  return res.rows[0]?.h || null;
}

async function storedProductCount(): Promise<number> {
  const res = await pool.query(
    `SELECT jsonb_array_length(COALESCE(data->'products','[]'::jsonb)) AS n FROM cms_state WHERE id = 'main'`
  );
  return Number(res.rows[0]?.n) || 0;
}

/** Writes a document straight to SQL, bypassing saveDatabase's guards, so a
 * deliberately malformed state can be set up. */
async function writeRawDocument(doc: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO cms_state (id, data, updated_at) VALUES ('main', $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()`,
    [JSON.stringify(doc)]
  );
  __resetCmsCacheForTests();
}

/** A realistic stored document — the thing that must never be destroyed. */
function realisticDocument(): any {
  return {
    products: [
      { id: 'prod-1', name: 'Real Product One', price: 1200, stock: 8, inStock: true },
      { id: 'prod-2', name: 'Real Product Two', price: 2400, stock: 3, inStock: true },
    ],
    globalSettings: { contactEmail: 'hello@glamirk.com', codRules: { minOrderAmount: 0 } },
    heroContent: { title: 'Real hero' },
    offers: [{ id: 'off-1', code: 'REAL10', status: 'active' }],
  };
}

async function run(): Promise<void> {
  await ensureSchema();

  // ========================================
  section('A malformed document is never replaced');
  // ========================================

  // Missing globalSettings — the exact shape that threw
  // `Cannot read properties of undefined (reading 'codRules')` and reseeded.
  const noSettings = { products: [{ id: 'p-x', name: 'Only Product', price: 100, stock: 5, inStock: true }] };
  await writeRawDocument(noSettings);
  const beforeNoSettings = await storedHash();

  let loaded: any = null;
  let threw = false;
  try {
    loaded = await loadDatabase();
  } catch {
    threw = true;
  }

  const afterNoSettings = await storedHash();
  check('a document without globalSettings does not throw', !threw);
  check('it is normalised rather than rejected', !!loaded?.globalSettings);
  check('the real product survives', loaded?.products?.[0]?.id === 'p-x', loaded?.products?.[0]?.id);
  check(
    'the stored document was NOT overwritten',
    beforeNoSettings === afterNoSettings,
    `${beforeNoSettings} -> ${afterNoSettings}`
  );
  check('the catalogue was not replaced with seed data', (await storedProductCount()) === 1);

  // A document whose products key is not an array at all.
  await writeRawDocument({ products: 'not-an-array', globalSettings: {} });
  const beforeBadProducts = await storedHash();
  try {
    await loadDatabase();
  } catch {
    /* either outcome is acceptable; the write is what matters */
  }
  check('a non-array products key does not overwrite the row', beforeBadProducts === (await storedHash()));

  // ========================================
  section('A read failure never causes a write');
  // ========================================

  await writeRawDocument(realisticDocument());
  const beforeReadFailure = await storedHash();
  const realCount = await storedProductCount();

  // Simulate a transient connection failure on the SELECT — the Neon reset
  // case. The old code caught this and reseeded; the new code re-throws.
  const originalQuery = pool.query.bind(pool);
  let injected = false;
  (pool as any).query = async (...args: any[]) => {
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
    if (!injected && sql.includes('SELECT data FROM cms_state')) {
      injected = true;
      throw new Error('simulated connection reset');
    }
    return originalQuery(...(args as [any]));
  };

  let readThrew = false;
  try {
    await loadDatabase();
  } catch {
    readThrew = true;
  }
  (pool as any).query = originalQuery;

  check('a failed read surfaces as an error rather than succeeding silently', readThrew);
  check(
    'a failed read leaves the stored document untouched',
    beforeReadFailure === (await storedHash()),
    `${beforeReadFailure} -> ${await storedHash()}`
  );
  check('the catalogue still has its real products', (await storedProductCount()) === realCount);

  // And it recovers cleanly on the next attempt.
  __resetCmsCacheForTests();
  const recovered = await loadDatabase();
  check('the next read after a transient failure succeeds', recovered.products.length === realCount);
  check('recovered document still holds the real data', recovered.products[0].id === 'prod-1');

  // ========================================
  section('saveDatabase refuses a catalogue-destroying write');
  // ========================================

  await writeRawDocument(realisticDocument());
  const beforeEmptySave = await storedHash();

  let emptyRejected = false;
  try {
    await saveDatabase({ ...realisticDocument(), products: [] } as any);
  } catch {
    emptyRejected = true;
  }
  check('saving an empty catalogue over a populated one is refused', emptyRejected);
  check('the populated catalogue survives the attempt', beforeEmptySave === (await storedHash()));

  let missingRejected = false;
  try {
    await saveDatabase({ globalSettings: {} } as any);
  } catch {
    missingRejected = true;
  }
  check('saving a document with no products array is refused', missingRejected);
  check('that attempt also left the row untouched', beforeEmptySave === (await storedHash()));

  // A legitimate edit must still go through.
  __resetCmsCacheForTests();
  const doc = await loadDatabase();
  doc.products = [...doc.products, { id: 'prod-3', name: 'Added', price: 500, stock: 1, inStock: true } as any];
  await saveDatabase(doc);
  check('a genuine edit still saves', (await storedProductCount()) === realCount + 1);

  // ========================================
  section('Seeding only happens on a genuinely empty database');
  // ========================================

  await pool.query(`DELETE FROM cms_state WHERE id = 'main'`);
  __resetCmsCacheForTests();

  const seeded = await loadDatabase();
  check('an empty database is seeded', seeded.products.length > 0, String(seeded.products.length));
  check('the seed was actually persisted', (await storedProductCount()) > 0);

  // Seeding again must not clobber what is now there.
  const afterSeedHash = await storedHash();
  __resetCmsCacheForTests();
  await loadDatabase();
  check('a second load does not reseed over the seeded data', afterSeedHash === (await storedHash()));

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
