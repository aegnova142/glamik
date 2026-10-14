import { pool } from '../db/db';
import { Product, ProductSection, ProductSectionWithUsage, ProductType } from '@glamirk/shared/types';
import {
  countProductsBySection,
  countTypesBySection,
  validateSectionName,
  validateSectionDescription,
} from '@glamirk/shared/utils/productSection';
import { slugifyTypeName } from '@glamirk/shared/utils/productType';
import { listProductTypes, invalidateProductTypeCache } from './productType.service';

// ==========================================================================
// PRODUCT SECTIONS
//
// The level above product types. Same rules, same shape, same guarantees —
// see productType.service.ts, which this deliberately mirrors rather than
// improvising a second set of behaviours for an object of the same kind.
//
// The one behavioural difference is what blocks a delete: a type is blocked by
// products, a section is blocked by products OR by types nesting under it.
// ==========================================================================

const UNIQUE_VIOLATION = '23505';
/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = '42P01';

/**
 * True when the failure is "this table has not been created yet".
 *
 * Which happens for one window in a normal deploy: the code ships before
 * migration 022 has run. The storefront's content endpoint reads sections on
 * every page load, so without this the whole catalog payload would fail for
 * that window rather than simply listing no sections — turning an ordering
 * detail into an outage.
 */
function isMissingTable(err: any): boolean {
  return err?.code === UNDEFINED_TABLE;
}

function mapRow(row: any): ProductSection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

let cachedSections: ProductSection[] | null = null;

export function invalidateProductSectionCache(): void {
  cachedSections = null;
}

export async function listProductSections(): Promise<ProductSection[]> {
  if (cachedSections) return cachedSections;
  try {
    const result = await pool.query(
      `SELECT id, name, slug, description, is_active, sort_order, created_at, updated_at
         FROM product_sections
        ORDER BY sort_order, name`
    );
    cachedSections = result.rows.map(mapRow);
    return cachedSections;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    // Deliberately NOT cached.
    //
    // Caching the empty fallback would make the gap permanent: the migration
    // could run a minute later and this process would still serve no sections
    // until someone restarted it. Returning uncached means the first call
    // after the table appears picks it up, and the cost until then is one
    // cheap failed query per content fetch.
    return [];
  }
}

export async function listProductSectionsWithUsage(
  products: Product[]
): Promise<ProductSectionWithUsage[]> {
  const sections = await listProductSections();
  const types = await listProductTypes();
  const productCounts = countProductsBySection(products, sections);
  const typeCounts = countTypesBySection(types, sections);
  return sections.map((s) => ({
    ...s,
    productCount: productCounts.get(s.id) ?? 0,
    typeCount: typeCounts.get(s.id) ?? 0,
  }));
}

export async function getProductSection(id: string): Promise<ProductSection | undefined> {
  const sections = await listProductSections();
  return sections.find((s) => s.id === id);
}

/**
 * Creates a section for any product category that does not have one yet.
 *
 * Migration 022 backfills from the catalog as it stands WHEN THE MIGRATION
 * RUNS — which on a fresh install is before there is a catalog at all:
 * migrations run against an empty cms_state, and `npm run seed` then writes
 * products whose categories have no section row. The admin's category picker
 * would be empty on a brand-new install, and assigning a type to "Makeup"
 * would be refused as a section that does not exist.
 *
 * So the migration handles existing databases and this handles every other
 * ordering. Idempotent (ON CONFLICT DO NOTHING) and keyed on the same
 * slug-derived id the migration uses, so the two can never produce a
 * duplicate or disagree about a name.
 *
 * Returns how many it had to create — zero on every normal boot.
 */
export async function ensureSectionsForCatalog(products: Product[]): Promise<number> {
  const existing = new Set((await listProductSections()).map((s) => s.name.trim().toLowerCase()));

  // Deduplicate by normalized name first, so two spellings in the catalog do
  // not race each other into the unique index.
  const missing = new Map<string, string>();
  for (const product of products) {
    const name = (product.category || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existing.has(key) || missing.has(key)) continue;
    const slug = slugifyTypeName(name);
    if (slug) missing.set(key, name);
  }
  if (missing.size === 0) return 0;

  let order = (await listProductSections()).reduce((max, s) => Math.max(max, s.sortOrder), 0);
  try {
    for (const name of missing.values()) {
      order++;
      await pool.query(
        `INSERT INTO product_sections (id, name, slug, is_active, sort_order)
         VALUES ($1, $2, $3, TRUE, $4) ON CONFLICT DO NOTHING`,
        [`psec-${slugifyTypeName(name)}`, name, slugifyTypeName(name), order]
      );
    }
  } catch (err) {
    // Booting before migration 022 has run is an ordering detail, not a fault
    // worth a stack trace on every start. Nothing to reconcile INTO yet.
    if (isMissingTable(err)) return 0;
    throw err;
  }
  invalidateProductSectionCache();
  return missing.size;
}

export interface SectionMutationResult {
  ok: boolean;
  error?: string;
  status?: number;
  section?: ProductSection;
  productsTouched?: number;
  typesTouched?: number;
}

export async function createProductSection(input: {
  name: unknown;
  description?: unknown;
  isActive?: unknown;
}): Promise<SectionMutationResult> {
  const nameCheck = validateSectionName(input.name);
  if (!nameCheck.ok) return { ok: false, error: nameCheck.error, status: 400 };

  const descCheck = validateSectionDescription(input.description);
  if (!descCheck.ok) return { ok: false, error: descCheck.error, status: 400 };

  const name = nameCheck.name!;
  const slug = nameCheck.slug!;
  const existing = await listProductSections();
  const clash = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  if (clash) return { ok: false, error: `A section named "${clash.name}" already exists.`, status: 409 };

  const id = `psec-${slug}`;
  const nextOrder = existing.reduce((max, s) => Math.max(max, s.sortOrder), 0) + 1;

  try {
    const result = await pool.query(
      `INSERT INTO product_sections (id, name, slug, description, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, slug, description, is_active, sort_order, created_at, updated_at`,
      [id, name, slug, descCheck.name ?? '', input.isActive !== false, nextOrder]
    );
    invalidateProductSectionCache();
    return { ok: true, section: mapRow(result.rows[0]) };
  } catch (err: any) {
    if (err?.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `A section named "${name}" already exists.`, status: 409 };
    }
    throw err;
  }
}

/**
 * Renames / re-describes / activates a section.
 *
 * A rename has to carry TWO legacy name references, not one:
 *
 *   * products, whose `category` holds the section name
 *   * product TYPES, whose `category` column holds it too
 *
 * Both are rewritten here for the same reason the type rename rewrites
 * products: after the rename nothing records that they meant this section.
 * The slug is not regenerated — it is a URL identity.
 */
export async function updateProductSection(
  id: string,
  input: { name?: unknown; description?: unknown; isActive?: unknown },
  products: Product[] = []
): Promise<SectionMutationResult> {
  const current = await getProductSection(id);
  if (!current) return { ok: false, error: 'Section not found.', status: 404 };

  let name = current.name;
  if (input.name !== undefined) {
    const nameCheck = validateSectionName(input.name);
    if (!nameCheck.ok) return { ok: false, error: nameCheck.error, status: 400 };
    name = nameCheck.name!;
    const existing = await listProductSections();
    const clash = existing.find(
      (s) => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) return { ok: false, error: `A section named "${clash.name}" already exists.`, status: 409 };
  }

  let description = current.description;
  if (input.description !== undefined) {
    const descCheck = validateSectionDescription(input.description);
    if (!descCheck.ok) return { ok: false, error: descCheck.error, status: 400 };
    description = descCheck.name ?? '';
  }

  const isActive = input.isActive === undefined ? current.isActive : input.isActive !== false;

  try {
    const result = await pool.query(
      `UPDATE product_sections
          SET name = $2, description = $3, is_active = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, slug, description, is_active, sort_order, created_at, updated_at`,
      [id, name, description, isActive]
    );
    invalidateProductSectionCache();
    const saved = mapRow(result.rows[0]);

    let productsTouched = 0;
    let typesTouched = 0;
    if (current.name !== saved.name) {
      const previousName = current.name.trim().toLowerCase();

      for (const product of products) {
        const byId = product.sectionId === saved.id;
        const byLegacyName = !product.sectionId && (product.category || '').trim().toLowerCase() === previousName;
        if (byId || byLegacyName) {
          product.sectionId = saved.id;
          product.category = saved.name;
          productsTouched++;
        }
      }

      // Types reference a section by name only — there is no section_id column
      // on product_types — so this UPDATE is the whole of their migration.
      const typeUpdate = await pool.query(
        `UPDATE product_types SET category = $1, updated_at = NOW()
          WHERE LOWER(TRIM(category)) = $2`,
        [saved.name, previousName]
      );
      typesTouched = typeUpdate.rowCount ?? 0;
      if (typesTouched > 0) invalidateProductTypeCache();
    }

    return { ok: true, section: saved, productsTouched, typesTouched };
  } catch (err: any) {
    if (err?.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `A section named "${name}" already exists.`, status: 409 };
    }
    throw err;
  }
}

/**
 * Deletes a section, refusing while anything still points at it.
 *
 * Blocked by products OR by types — a section with no products but three types
 * under it is still load-bearing, and deleting it would leave those types
 * pointing at a name nothing resolves.
 */
export async function deleteProductSection(
  id: string,
  products: Product[]
): Promise<SectionMutationResult & { productCount?: number; typeCount?: number }> {
  const current = await getProductSection(id);
  if (!current) return { ok: false, error: 'Section not found.', status: 404 };

  const sections = await listProductSections();
  const types: ProductType[] = await listProductTypes();
  const productCount = countProductsBySection(products, sections).get(id) ?? 0;
  const typeCount = countTypesBySection(types, sections).get(id) ?? 0;

  if (productCount > 0 || typeCount > 0) {
    const blockers: string[] = [];
    if (productCount > 0) blockers.push(`${productCount} product${productCount === 1 ? '' : 's'}`);
    if (typeCount > 0) blockers.push(`${typeCount} product type${typeCount === 1 ? '' : 's'}`);
    return {
      ok: false,
      status: 409,
      productCount,
      typeCount,
      error:
        `"${current.name}" still has ${blockers.join(' and ')} assigned to it. ` +
        'Move them to another section first, or deactivate this one instead — ' +
        'deactivating hides it from the pickers while keeping everything working.',
    };
  }

  await pool.query('DELETE FROM product_sections WHERE id = $1', [id]);
  invalidateProductSectionCache();
  return { ok: true, section: current };
}

/**
 * Resolves a client-supplied sectionId for product save.
 *
 * Returns the section so the caller can write BOTH `sectionId` and the
 * matching `category` name, keeping the legacy field in step.
 */
export async function resolveSectionForProductSave(
  sectionId: unknown
): Promise<{ ok: boolean; error?: string; section?: ProductSection }> {
  if (sectionId === undefined || sectionId === null || sectionId === '') return { ok: true };
  if (typeof sectionId !== 'string') return { ok: false, error: 'Section must be an id.' };
  const section = await getProductSection(sectionId);
  if (!section) return { ok: false, error: 'Selected section no longer exists.' };
  return { ok: true, section };
}

/**
 * Validates a section NAME supplied for a product type.
 *
 * Types reference a section by name, so this replaces the hardcoded
 * Makeup/Skin/Nails list the type service used to check against.
 */
export async function validateSectionNameForType(
  raw: unknown
): Promise<{ ok: boolean; error?: string; value?: string | null }> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Section must be a name.' };
  const wanted = raw.trim().toLowerCase();
  const match = (await listProductSections()).find((s) => s.name.trim().toLowerCase() === wanted);
  if (!match) return { ok: false, error: `"${raw}" is not an existing section.` };
  return { ok: true, value: match.name };
}
