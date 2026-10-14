// Product types: validation, resolution, counts, filtering and the legacy
// bridge that keeps pre-types products working.
//
// Pure-function coverage — no database. The parts that DO need Postgres
// (case-insensitive uniqueness, the migration backfill) are exercised by
// producttypes.db.e2e.ts, which runs against a throwaway test database.
//
// Run: npm run test:producttypes --workspace @glamirk/backend
import assert from 'node:assert/strict';
import type { Product, ProductType } from '@glamirk/shared/types';
import {
  slugifyTypeName,
  normalizeTypeName,
  validateTypeName,
  validateTypeDescription,
  indexTypesById,
  indexTypesByName,
  resolveProductType,
  productMatchesType,
  countProductsByType,
  selectableTypes,
  findTypeBySlug,
  TYPE_NAME_MAX_LENGTH,
} from '@glamirk/shared/utils/productType';

let passed = 0;
function check(label: string, condition: boolean) {
  assert.ok(condition, label);
  passed++;
}

const type = (id: string, name: string, over: Partial<ProductType> = {}): ProductType => ({
  id,
  name,
  slug: slugifyTypeName(name),
  description: '',
  category: 'Makeup',
  isActive: true,
  sortOrder: 0,
  ...over,
});

const product = (id: string, subCategory: string, typeId?: string): Product =>
  ({ id, subCategory, typeId } as Product);

// ==========================================
// SLUGS — must match migration 021's SQL expression
// ==========================================
check('lowercases and hyphenates', slugifyTypeName('Lip Care') === 'lip-care');
check('collapses runs of punctuation', slugifyTypeName('Lip   &   Cheek') === 'lip-cheek');
check('trims leading/trailing hyphens', slugifyTypeName('  !Lipstick!  ') === 'lipstick');
check('strips accents to hyphens rather than dropping them silently', slugifyTypeName('Crème') === 'cr-me');
check('punctuation-only yields empty, which validation rejects', slugifyTypeName('!!!') === '');

check('name comparison ignores case', normalizeTypeName(' Lip Care ') === normalizeTypeName('LIP CARE'));

// ==========================================
// VALIDATION
// ==========================================
check('a name is required', !validateTypeName('').ok);
check('whitespace is not a name', !validateTypeName('   ').ok);
check('a non-string is rejected', !validateTypeName(42 as unknown).ok);
check('a punctuation-only name is rejected (it has no addressable slug)', !validateTypeName('---').ok);
check('an over-long name is rejected', !validateTypeName('x'.repeat(TYPE_NAME_MAX_LENGTH + 1)).ok);
check('a normal name is accepted', validateTypeName('Lip Care').ok);
check('and is returned trimmed', validateTypeName('  Lip Care  ').name === 'Lip Care');
check('with its slug', validateTypeName('Lip Care').slug === 'lip-care');
check('a missing description is fine', validateTypeDescription(undefined).ok);
check('an over-long description is rejected', !validateTypeDescription('x'.repeat(501)).ok);

// ==========================================
// RESOLUTION — typeId first, subCategory as the legacy bridge
// ==========================================
{
  const types = [type('t-lips', 'Lips'), type('t-care', 'Lip Care')];
  const byId = indexTypesById(types);
  const byName = indexTypesByName(types);

  check(
    'a typeId resolves directly',
    resolveProductType(product('p1', 'anything', 't-care'), byId, byName)?.id === 't-care'
  );
  check(
    'a product with no typeId falls back to its subCategory name',
    resolveProductType(product('p2', 'Lips'), byId, byName)?.id === 't-lips'
  );
  check(
    'the legacy match ignores case and surrounding space — the exact drift that used to hide products',
    resolveProductType(product('p3', '  lIpS  '), byId, byName)?.id === 't-lips'
  );
  check(
    'a dangling typeId degrades to the legacy match rather than resolving to nothing',
    resolveProductType(product('p4', 'Lips', 't-deleted'), byId, byName)?.id === 't-lips'
  );
  check(
    'an unknown subCategory resolves to no type',
    resolveProductType(product('p5', 'Fragrance'), byId, byName) === undefined
  );
  check('an empty subCategory resolves to no type', resolveProductType(product('p6', ''), byId, byName) === undefined);

  // The property the whole design rests on.
  const renamed = [type('t-lips', 'Lip Colour'), types[1]];
  check(
    'RENAMING A TYPE DOES NOT ORPHAN A PRODUCT THAT REFERENCES IT BY ID',
    resolveProductType(
      product('p7', 'Lips', 't-lips'),
      indexTypesById(renamed),
      indexTypesByName(renamed)
    )?.id === 't-lips'
  );

  check('matching against no filter admits everything', productMatchesType(undefined, null));
  check('matching is by id', productMatchesType(types[0], 't-lips'));
  check('and rejects a different id', !productMatchesType(types[0], 't-care'));
}

// ==========================================
// COUNTS AND THE SELECTABLE LIST
// ==========================================
{
  const types = [
    type('t-lips', 'Lips', { sortOrder: 1 }),
    type('t-care', 'Lip Care', { sortOrder: 2 }),
    type('t-paused', 'Sindoor', { sortOrder: 3, isActive: false }),
    type('t-empty', 'Fragrance', { sortOrder: 4 }),
  ];
  const products = [
    product('a', 'Lips'),
    product('b', 'Lips'),
    product('c', 'ignored', 't-care'),
    product('d', 'Sindoor'),
    product('e', 'Unmapped'),
  ];
  const counts = countProductsByType(products, types);

  check('counts the legacy-matched products', counts.get('t-lips') === 2);
  check('counts the id-matched product', counts.get('t-care') === 1);
  check('counts a paused type too — it is assigned, just not offered', counts.get('t-paused') === 1);
  check('a type with nothing in it counts zero, not undefined', counts.get('t-empty') === 0);
  check('an unmapped product contributes to no type', [...counts.values()].reduce((a, b) => a + b, 0) === 4);

  const selectable = selectableTypes(types, counts);
  check('paused types are not offered to shoppers', !selectable.some((t) => t.id === 't-paused'));
  check('empty types are not offered — the row would be a dead end', !selectable.some((t) => t.id === 't-empty'));
  check('what remains is the active, non-empty set', selectable.map((t) => t.id).join(',') === 't-lips,t-care');
  check(
    'ordered by sortOrder',
    selectableTypes(
      [type('b', 'B', { sortOrder: 2 }), type('a', 'A', { sortOrder: 1 })],
      new Map([['a', 1], ['b', 1]])
    )
      .map((t) => t.name)
      .join(',') === 'A,B'
  );

  check('slug lookup finds a type', findTypeBySlug(types, 'lip-care')?.id === 't-care');
  check('slug lookup is case-insensitive', findTypeBySlug(types, 'LIP-CARE')?.id === 't-care');
  check('an unknown slug finds nothing', findTypeBySlug(types, 'nope') === undefined);
  check('a null slug finds nothing', findTypeBySlug(types, null) === undefined);
}

// ==========================================
// LEGACY CATALOG — nothing disappears when types are introduced
// ==========================================
{
  // Exactly the shape of a product saved before this feature existed: a
  // subCategory, no typeId.
  const legacy = [
    product('l1', 'Lips'),
    product('l2', 'Cleansing'),
    product('l3', 'Nail Care'),
  ];
  // Types as migration 021 backfills them — one per distinct subCategory.
  const backfilled = ['Lips', 'Cleansing', 'Nail Care'].map((n) => type(`ptype-${slugifyTypeName(n)}`, n));
  const counts = countProductsByType(legacy, backfilled);

  check(
    'every legacy product lands on exactly one backfilled type',
    [...counts.values()].reduce((a, b) => a + b, 0) === legacy.length
  );
  check(
    'and every backfilled type is offered',
    selectableTypes(backfilled, counts).length === backfilled.length
  );

  const byId = indexTypesById(backfilled);
  const byName = indexTypesByName(backfilled);
  check(
    'filtering by a backfilled type returns the legacy product',
    legacy.filter((p) => productMatchesType(resolveProductType(p, byId, byName), 'ptype-lips')).length === 1
  );
}

console.log(`producttypes: ${passed} passed, 0 failed`);
