// Product sections: resolution, counts, and the legacy bridge that keeps
// pre-022 products working.
//
// Pure-function coverage — no database. Uniqueness, the migration backfill and
// the rename cascade are exercised by productsections.db.e2e.ts.
//
// Run: npm run test:productsections --workspace @glamirk/backend
import assert from 'node:assert/strict';
import type { Product, ProductSection, ProductType } from '@glamirk/shared/types';
import {
  slugifySectionName,
  normalizeSectionName,
  validateSectionName,
  indexSectionsById,
  indexSectionsByName,
  resolveProductSection,
  countProductsBySection,
  countTypesBySection,
  selectableSections,
  findSectionBySlug,
} from '@glamirk/shared/utils/productSection';
import { slugifyTypeName } from '@glamirk/shared/utils/productType';

let passed = 0;
function check(label: string, condition: boolean) {
  assert.ok(condition, label);
  passed++;
}

const section = (id: string, name: string, over: Partial<ProductSection> = {}): ProductSection => ({
  id,
  name,
  slug: slugifySectionName(name),
  description: '',
  isActive: true,
  sortOrder: 0,
  ...over,
});

const product = (id: string, category: string, sectionId?: string): Product =>
  ({ id, category, sectionId } as Product);

const type = (id: string, name: string, category: string | null): ProductType =>
  ({ id, name, slug: slugifyTypeName(name), description: '', category, isActive: true, sortOrder: 0 });

// ==========================================
// SLUGS — must match productType's, and migration 022's SQL
// ==========================================
check('sections and types slugify identically', slugifySectionName('Lip Care') === slugifyTypeName('Lip Care'));
check('spaces become hyphens', slugifySectionName('Hair Care') === 'hair-care');
check('punctuation-only yields empty', slugifySectionName('***') === '');
check('name comparison ignores case and padding', normalizeSectionName('  MAKEUP ') === normalizeSectionName('makeup'));

// ==========================================
// VALIDATION
// ==========================================
check('a name is required', !validateSectionName('').ok);
check('a punctuation-only name is rejected', !validateSectionName('???').ok);
check('the message says "Section", not "Type"', /Section name/.test(validateSectionName('').error || ''));
check('a normal name is accepted', validateSectionName('Fragrance').ok);
check('and is trimmed', validateSectionName('  Fragrance  ').name === 'Fragrance');

// ==========================================
// RESOLUTION — sectionId first, category as the legacy bridge
// ==========================================
{
  const sections = [section('psec-makeup', 'Makeup'), section('psec-skin', 'Skin')];
  const byId = indexSectionsById(sections);
  const byName = indexSectionsByName(sections);

  check('a sectionId resolves directly', resolveProductSection(product('p1', 'whatever', 'psec-skin'), byId, byName)?.id === 'psec-skin');
  check('a legacy product resolves by its category name', resolveProductSection(product('p2', 'Makeup'), byId, byName)?.id === 'psec-makeup');
  check('the legacy match ignores case and padding', resolveProductSection(product('p3', '  mAkEuP '), byId, byName)?.id === 'psec-makeup');
  check(
    'a dangling sectionId degrades to the legacy match rather than nothing',
    resolveProductSection(product('p4', 'Skin', 'psec-deleted'), byId, byName)?.id === 'psec-skin'
  );
  check('an unknown category resolves to no section', resolveProductSection(product('p5', 'Nails'), byId, byName) === undefined);

  const renamed = [section('psec-makeup', 'Colour'), sections[1]];
  check(
    'RENAMING A SECTION DOES NOT ORPHAN A PRODUCT THAT REFERENCES IT BY ID',
    resolveProductSection(
      product('p6', 'Makeup', 'psec-makeup'),
      indexSectionsById(renamed),
      indexSectionsByName(renamed)
    )?.id === 'psec-makeup'
  );
}

// ==========================================
// COUNTS — products AND the types nesting under each section
// ==========================================
{
  const sections = [
    section('psec-makeup', 'Makeup', { sortOrder: 1 }),
    section('psec-skin', 'Skin', { sortOrder: 2 }),
    section('psec-paused', 'Nails', { sortOrder: 3, isActive: false }),
    section('psec-empty', 'Fragrance', { sortOrder: 4 }),
  ];
  const products = [
    product('a', 'Makeup'),
    product('b', 'ignored', 'psec-makeup'),
    product('c', 'Skin'),
    product('d', 'Unmapped'),
  ];
  const types = [
    type('t1', 'Lips', 'Makeup'),
    type('t2', 'Eyes', 'Makeup'),
    type('t3', 'Cleansing', 'Skin'),
    type('t4', 'Orphan', 'Nowhere'),
    type('t5', 'Unassigned', null),
  ];

  const productCounts = countProductsBySection(products, sections);
  check('products counted by id and by legacy name', productCounts.get('psec-makeup') === 2);
  check('and for the other section', productCounts.get('psec-skin') === 1);
  check('an empty section counts zero, not undefined', productCounts.get('psec-empty') === 0);
  check('an unmapped product counts nowhere', [...productCounts.values()].reduce((a, b) => a + b, 0) === 3);

  const typeCounts = countTypesBySection(types, sections);
  check('types counted by section name', typeCounts.get('psec-makeup') === 2);
  check('and for the other section', typeCounts.get('psec-skin') === 1);
  check('a type pointing at no section counts nowhere', typeCounts.get('psec-empty') === 0);
  check('a type pointing at a nonexistent section counts nowhere', [...typeCounts.values()].reduce((a, b) => a + b, 0) === 3);

  const selectable = selectableSections(sections);
  check('paused sections are not offered', !selectable.some((s) => s.id === 'psec-paused'));
  check(
    'but EMPTY ones are — a section just created is exactly what you are about to assign to',
    selectable.some((s) => s.id === 'psec-empty')
  );
  check('ordered by sortOrder', selectable.map((s) => s.name).join(',') === 'Makeup,Skin,Fragrance');

  check('slug lookup works', findSectionBySlug(sections, 'makeup')?.id === 'psec-makeup');
  check('slug lookup is case-insensitive', findSectionBySlug(sections, 'MAKEUP')?.id === 'psec-makeup');
  check('an unknown slug finds nothing', findSectionBySlug(sections, 'nope') === undefined);
}

// ==========================================
// LEGACY CATALOG — nothing disappears when sections are introduced
// ==========================================
{
  const legacy = [product('l1', 'Makeup'), product('l2', 'Skin'), product('l3', 'Nails')];
  // Sections as migration 022 backfills them — one per distinct category.
  const backfilled = ['Makeup', 'Skin', 'Nails'].map((n) => section(`psec-${slugifySectionName(n)}`, n));
  const counts = countProductsBySection(legacy, backfilled);
  check(
    'every legacy product lands on exactly one backfilled section',
    [...counts.values()].reduce((a, b) => a + b, 0) === legacy.length
  );
  check('and every backfilled section is offered', selectableSections(backfilled).length === 3);
}

console.log(`productsections: ${passed} passed, 0 failed`);
