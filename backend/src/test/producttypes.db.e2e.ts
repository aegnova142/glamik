/**
 * Product types against a real database.
 *
 *   DATABASE_URL=postgres://glamirk:glamirk@localhost:5432/glamirk_test \
 *     npx tsx src/test/producttypes.db.e2e.ts
 *
 * Covers the parts that only Postgres can answer:
 *
 *   * migration 021's backfill — does every pre-existing subCategory become a
 *     type, and are two spellings of one name collapsed rather than colliding?
 *   * the case-insensitive unique index — is "lip care" refused after
 *     "Lip Care", including when application code does not notice?
 *   * the lifecycle — rename, pause, reassign, and the refusal to delete a
 *     type that still has products on it.
 */

// Before any import: mailer.ts opens no SMTP connection under NODE_ENV=test,
// and classifyDatabaseTarget must see a local target.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

import { pool, loadDatabase, saveDatabase } from '../db/db';
import { runMigrations } from '../db/migrate';
import {
  listProductTypes,
  listProductTypesWithUsage,
  createProductType,
  updateProductType,
  deleteProductType,
  resolveTypeForProductSave,
  invalidateProductTypeCache,
} from '../services/productType.service';
import type { Product } from '@glamirk/shared/types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const asProduct = (id: string, subCategory: string, typeId?: string): Product =>
  ({ id, subCategory, typeId } as Product);

async function main() {
  // ----------------------------------------------------------------
  // Seed a catalog that looks like one saved before types existed, then run
  // the migrations over it so the backfill has something to find.
  // ----------------------------------------------------------------
  // Build the real schema first — cms_state and everything 012 depends on are
  // created by the migrations themselves, so hand-rolling that table here
  // would only disagree with them about its shape.
  await runMigrations(pool);

  // Now make the catalog look like one saved before types existed...
  await pool.query(
    `INSERT INTO cms_state (id, data) VALUES ('main', $1)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
    [
      JSON.stringify({
        products: [
          { id: 'p-lips-1', subCategory: 'Lips', category: 'Makeup' },
          { id: 'p-lips-2', subCategory: 'Lips', category: 'Makeup' },
          // Same type, different spelling — the drift taxonomy.ts warned about.
          { id: 'p-lips-3', subCategory: ' lips ', category: 'Makeup' },
          { id: 'p-clean', subCategory: 'Cleansing', category: 'Skin' },
          { id: 'p-blank', subCategory: '', category: 'Makeup' },
        ],
      }),
    ]
  );

  // ...and replay 021 against it. Dropping the table and its ledger row is
  // what a database that has never seen this migration looks like, which is
  // the only state in which the backfill's behaviour can actually be observed.
  // 022 is replayed alongside 021 because it backfills SECTIONS from the same
  // catalog, and a type's section is validated against those rows — without
  // them, assigning a type to "Makeup" is correctly refused as a section that
  // does not exist, and the assertions below would be testing that instead.
  await pool.query('DROP TABLE IF EXISTS product_types');
  await pool.query('DROP TABLE IF EXISTS product_sections');
  await pool.query(
    `DELETE FROM schema_migrations WHERE version IN ('021_product_types.sql', '022_product_sections.sql')`
  );
  await runMigrations(pool);
  invalidateProductTypeCache();

  section('MIGRATION 021 — backfill from the existing catalog');
  const backfilled = await listProductTypes();
  const names = backfilled.map((t) => t.name).sort();
  check('every distinct subCategory became a type', names.includes('Lips') && names.includes('Cleansing'));
  check(
    'and the capitalised spelling won over the whitespace-padded one',
    backfilled.find((t) => t.slug === 'lips')?.name === 'Lips'
  );
  check(
    'two spellings of one name collapsed to a single type',
    backfilled.filter((t) => t.name.trim().toLowerCase() === 'lips').length === 1
  );
  check('an empty subCategory produced no type', !backfilled.some((t) => !t.name.trim()));
  check('slugs are derived the same way the app derives them', backfilled.some((t) => t.slug === 'lips'));
  check('the section came across', backfilled.find((t) => t.slug === 'lips')?.category === 'Makeup');
  check('backfilled types are active', backfilled.every((t) => t.isActive));

  section('MIGRATION 021 — re-running is a no-op');
  const countBefore = backfilled.length;
  await runMigrations(pool);
  invalidateProductTypeCache();
  check('applying twice does not duplicate rows', (await listProductTypes()).length === countBefore);

  section('UNIQUENESS — enforced by the database, not by a check');
  const created = await createProductType({ name: 'Lip Care', category: 'Makeup' });
  check('a new type is created', created.ok && created.type?.name === 'Lip Care');
  check('its slug is derived', created.type?.slug === 'lip-care');

  const dupExact = await createProductType({ name: 'Lip Care' });
  check('an exact duplicate is refused', !dupExact.ok && dupExact.status === 409);

  const dupCase = await createProductType({ name: 'lip care' });
  check('a case-variant duplicate is refused', !dupCase.ok && dupCase.status === 409);

  const dupSpace = await createProductType({ name: '  LIP CARE  ' });
  check('a whitespace/case variant is refused', !dupSpace.ok && dupSpace.status === 409);

  // The index is the real guarantee — prove it independently of the pre-check.
  let indexRejected = false;
  try {
    await pool.query(
      `INSERT INTO product_types (id, name, slug) VALUES ('ptype-x', 'LIP CARE', 'lip-care-x')`
    );
  } catch (err: any) {
    indexRejected = err?.code === '23505';
  }
  check('the unique index itself refuses a case-variant, with no app code involved', indexRejected);

  section('VALIDATION');
  check('an empty name is refused', !(await createProductType({ name: '' })).ok);
  check('a punctuation-only name is refused', !(await createProductType({ name: '!!!' })).ok);
  check('an unknown section is refused', !(await createProductType({ name: 'Zz', category: 'Fragrance' })).ok);
  check('no section is allowed', (await createProductType({ name: 'Unsectioned' })).ok);

  section('PRODUCT ASSIGNMENT — server-side id validation');
  check('an unknown type id is refused', !(await resolveTypeForProductSave('ptype-nope')).ok);
  check('a known type id resolves', (await resolveTypeForProductSave('ptype-lip-care')).type?.name === 'Lip Care');
  check('an absent id is allowed (the product is simply untyped)', (await resolveTypeForProductSave(undefined)).ok);
  check('a non-string id is refused', !(await resolveTypeForProductSave(42)).ok);

  section('USAGE COUNTS');
  const db = await loadDatabase();
  const withUsage = await listProductTypesWithUsage(db.products);
  const lipsUsage = withUsage.find((t) => t.slug === 'lips');
  check('legacy products are counted against their backfilled type', (lipsUsage?.productCount ?? 0) === 3);
  check('an unused type counts zero', withUsage.find((t) => t.slug === 'lip-care')?.productCount === 0);

  section('RENAME — the product must not be orphaned');
  const renamed = await updateProductType('ptype-lips', { name: 'Lip Colour' }, db.products);
  check('the rename succeeds', renamed.ok && renamed.type?.name === 'Lip Colour');
  check('the slug is NOT regenerated — it is a URL identity', renamed.type?.slug === 'lips');
  check('the three legacy products were pinned to the id', renamed.productsTouched === 3);
  check(
    'and their subCategory was brought up to the new name',
    db.products.filter((p) => p.typeId === 'ptype-lips' && p.subCategory === 'Lip Colour').length === 3
  );
  check(
    'so they still count against the type after the rename — NOT orphaned',
    (await listProductTypesWithUsage(db.products)).find((t) => t.id === 'ptype-lips')?.productCount === 3
  );
  check(
    'a product referencing it by id resolves regardless of the name',
    (await listProductTypesWithUsage([asProduct('x1', 'anything', 'ptype-lips')])).find(
      (t) => t.id === 'ptype-lips'
    )?.productCount === 1
  );
  check('renaming to an existing name is refused', !(await updateProductType('ptype-lips', { name: 'Lip Care' })).ok);
  check('a type can keep its own name on an unrelated edit', (await updateProductType('ptype-lips', { description: 'x' })).ok);

  section('PAUSE — withheld from Shop, still assigned');
  const paused = await updateProductType('ptype-lip-care', { isActive: false });
  check('it can be paused', paused.ok && paused.type?.isActive === false);
  check(
    'a paused type is still returned by the service, so its products resolve',
    (await listProductTypes()).some((t) => t.id === 'ptype-lip-care')
  );
  check('and can be reactivated', (await updateProductType('ptype-lip-care', { isActive: true })).ok!);

  section('DELETE — refused while products reference it');
  const blocked = await deleteProductType('ptype-lips', db.products);
  check('deleting an in-use type is refused', !blocked.ok && blocked.status === 409);
  check('the refusal reports how many products block it', blocked.productCount === 3);
  check('the message points at the safe alternatives', /deactivate|[Rr]eassign/.test(blocked.error || ''));
  check('and the type still exists', (await listProductTypes()).some((t) => t.id === 'ptype-lips'));

  const unused = await deleteProductType('ptype-unsectioned', db.products);
  check('an unused type deletes cleanly', unused.ok);
  check('and is gone', !(await listProductTypes()).some((t) => t.id === 'ptype-unsectioned'));
  check('deleting a missing type is a 404', (await deleteProductType('ptype-ghost', db.products)).status === 404);

  section('CACHE — invalidated by every mutation');
  const before = (await listProductTypes()).length;
  await createProductType({ name: 'Cache Probe' });
  check('a create is visible immediately on the next read', (await listProductTypes()).length === before + 1);
  await updateProductType('ptype-cache-probe', { name: 'Cache Probe Renamed' });
  check(
    'a rename is visible immediately',
    (await listProductTypes()).some((t) => t.name === 'Cache Probe Renamed')
  );
  await deleteProductType('ptype-cache-probe', []);
  check('a delete is visible immediately', (await listProductTypes()).length === before);

  // Leave the database as we found it for the next suite.
  await saveDatabase(db);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failures:\n  - ' + failures.join('\n  - '));
    process.exitCode = 1;
  }
  await pool.end();
}

main().catch((err) => {
  console.error('producttypes.db suite crashed:', err);
  process.exit(1);
});
