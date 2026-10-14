import { pool } from '../db/db';
import { Product, ProductType, ProductTypeWithUsage } from '@glamirk/shared/types';
import {
  countProductsByType,
  slugifyTypeName,
  validateTypeName,
  validateTypeDescription,
} from '@glamirk/shared/utils/productType';

// ==========================================================================
// PRODUCT TYPES
//
// The admin-defined type list, backed by the normalized `product_types` table
// (migration 021) rather than the cms_state document — because
// case-insensitive uniqueness has to be enforced somewhere two concurrent
// admins cannot both win, and that is a unique index.
//
// Everything here is keyed by the immutable id. A rename updates one column
// and nothing else in the system moves; that is what lets Shop's filter be
// driven by admin data without reinstating the bug taxonomy.ts describes,
// where renaming a name-keyed category made its products disappear.
// ==========================================================================

// Sections used to be a fixed trio here. They are rows now (migration 022),
// so the check moved to productSection.service — imported lazily inside the
// functions that need it, because that module imports this one for its type
// counts and a top-level import either way would be a cycle.
type Section = string;

/** Postgres error code for a unique-violation. */
const UNIQUE_VIOLATION = '23505';
/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = '42P01';

function mapRow(row: any): ProductType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    category: (row.category as Section) ?? null,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

// --------------------------------------------------------------------------
// Cache
//
// The storefront reads this list on every /api/cms/content call — which is
// every page load — and it changes only when an admin edits it. Mirrors the
// cachedDb idiom in db.ts deliberately rather than inventing a second caching
// style: one module-level reference, dropped by every mutation in this file.
//
// Scope is this process, like cachedDb. A second instance keeps its own copy
// until its own next mutation, which is the same consistency the CMS document
// already has and is acceptable for a list that changes a few times a month.
// --------------------------------------------------------------------------
let cachedTypes: ProductType[] | null = null;

/** Drops the cache so the next read re-queries. Exported for tests and for
 *  any path that writes to product_types outside this module. */
export function invalidateProductTypeCache(): void {
  cachedTypes = null;
}

/**
 * Every type, active and inactive, in display order.
 *
 * Inactive ones are included on purpose: a product referencing a deactivated
 * type must still resolve to it (so it is not orphaned), and only the
 * storefront's `selectableTypes` filter decides what a shopper is offered.
 */
export async function listProductTypes(): Promise<ProductType[]> {
  if (cachedTypes) return cachedTypes;
  try {
    const result = await pool.query(
      `SELECT id, name, slug, description, category, is_active, sort_order, created_at, updated_at
         FROM product_types
        ORDER BY sort_order, name`
    );
    cachedTypes = result.rows.map(mapRow);
    return cachedTypes;
  } catch (err: any) {
    // The storefront reads this on every page load. A database that has not
    // run migration 021 — or has had it rolled back — should list no types,
    // not fail the whole catalog payload. Shop falls back to the legacy
    // category/subCategory filter path, which is exactly what it did before
    // types existed.
    //
    // NOT cached: see the matching note in productSection.service.
    if (err?.code === UNDEFINED_TABLE) return [];
    throw err;
  }
}

/**
 * Types with the number of products referencing each.
 *
 * The count comes from the in-memory catalog in ONE pass (countProductsByType),
 * not a query per type — products live in the cms_state document, so there is
 * no join to make here, and a filter() per type would be O(types × products).
 */
export async function listProductTypesWithUsage(products: Product[]): Promise<ProductTypeWithUsage[]> {
  const types = await listProductTypes();
  const counts = countProductsByType(products, types);
  return types.map((t) => ({ ...t, productCount: counts.get(t.id) ?? 0 }));
}

export async function getProductType(id: string): Promise<ProductType | undefined> {
  const types = await listProductTypes();
  return types.find((t) => t.id === id);
}

export interface TypeMutationResult {
  ok: boolean;
  error?: string;
  status?: number;
  type?: ProductType;
}

async function validateSection(raw: unknown): Promise<{ ok: boolean; value?: Section | null; error?: string }> {
  const { validateSectionNameForType } = await import('./productSection.service');
  return validateSectionNameForType(raw);
}

/**
 * Creates a type.
 *
 * The duplicate check is made twice on purpose: a readable message from the
 * pre-check, and the unique index as the thing that is actually authoritative
 * under concurrency. Only the second one can be trusted, so the insert's
 * 23505 is caught and turned into the same message rather than a 500.
 */
export async function createProductType(input: {
  name: unknown;
  description?: unknown;
  category?: unknown;
  isActive?: unknown;
}): Promise<TypeMutationResult> {
  const nameCheck = validateTypeName(input.name);
  if (!nameCheck.ok) return { ok: false, error: nameCheck.error, status: 400 };

  const descCheck = validateTypeDescription(input.description);
  if (!descCheck.ok) return { ok: false, error: descCheck.error, status: 400 };

  const sectionCheck = await validateSection(input.category);
  if (!sectionCheck.ok) return { ok: false, error: sectionCheck.error, status: 400 };

  const name = nameCheck.name!;
  const slug = nameCheck.slug!;
  const existing = await listProductTypes();
  const clash = existing.find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
  if (clash) {
    return { ok: false, error: `A product type named "${clash.name}" already exists.`, status: 409 };
  }

  const id = `ptype-${slug}`;
  const nextOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder), 0) + 1;

  try {
    const result = await pool.query(
      `INSERT INTO product_types (id, name, slug, description, category, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, slug, description, category, is_active, sort_order, created_at, updated_at`,
      [id, name, slug, descCheck.name ?? '', sectionCheck.value, input.isActive !== false, nextOrder]
    );
    invalidateProductTypeCache();
    return { ok: true, type: mapRow(result.rows[0]) };
  } catch (err: any) {
    if (err?.code === UNIQUE_VIOLATION) {
      // Another request won the race between the check above and this insert,
      // or two different names slugified to the same id.
      return { ok: false, error: `A product type named "${name}" already exists.`, status: 409 };
    }
    throw err;
  }
}

/**
 * Renames / re-describes / activates a type.
 *
 * The SLUG IS NOT REGENERATED on rename. It is a URL identity — links and
 * bookmarks point at ?type=lip-care — and silently repointing it would break
 * every one of them the moment someone fixed a typo in a name. The id and slug
 * are the stable pair; the name is the label.
 */
export async function updateProductType(
  id: string,
  input: { name?: unknown; description?: unknown; category?: unknown; isActive?: unknown },
  products: Product[] = []
): Promise<TypeMutationResult & { productsTouched?: number }> {
  const current = await getProductType(id);
  if (!current) return { ok: false, error: 'Product type not found.', status: 404 };

  let name = current.name;
  if (input.name !== undefined) {
    const nameCheck = validateTypeName(input.name);
    if (!nameCheck.ok) return { ok: false, error: nameCheck.error, status: 400 };
    name = nameCheck.name!;
    const existing = await listProductTypes();
    const clash = existing.find(
      (t) => t.id !== id && t.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) {
      return { ok: false, error: `A product type named "${clash.name}" already exists.`, status: 409 };
    }
  }

  let description = current.description;
  if (input.description !== undefined) {
    const descCheck = validateTypeDescription(input.description);
    if (!descCheck.ok) return { ok: false, error: descCheck.error, status: 400 };
    description = descCheck.name ?? '';
  }

  let category = current.category;
  if (input.category !== undefined) {
    const sectionCheck = await validateSection(input.category);
    if (!sectionCheck.ok) return { ok: false, error: sectionCheck.error, status: 400 };
    category = sectionCheck.value ?? null;
  }

  const isActive = input.isActive === undefined ? current.isActive : input.isActive !== false;

  try {
    const result = await pool.query(
      `UPDATE product_types
          SET name = $2, description = $3, category = $4, is_active = $5, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, slug, description, category, is_active, sort_order, created_at, updated_at`,
      [id, name, description, category, isActive]
    );
    invalidateProductTypeCache();
    const saved = mapRow(result.rows[0]);

    // --------------------------------------------------------------
    // Pin the products this rename would otherwise strand.
    //
    // A product referencing the type by id is safe by construction — that is
    // the entire point of id-keying. A LEGACY product has no typeId and is
    // matched by comparing its subCategory to the type's name, so the instant
    // the name changes it stops resolving and vanishes from the filter: the
    // exact bug taxonomy.ts describes.
    //
    // This is the last moment that inference is available — after the rename,
    // nothing records that those products meant this type. So they are pinned
    // to the id here and their subCategory is brought up to the new name.
    //
    // Deliberately inside the service rather than in the route: it is an
    // invariant of renaming, not of one HTTP handler, and a second caller that
    // forgot it would silently reintroduce the orphaning.
    // --------------------------------------------------------------
    let productsTouched = 0;
    if (current.name !== saved.name) {
      const previousName = current.name.trim().toLowerCase();
      for (const product of products) {
        const byId = product.typeId === saved.id;
        const byLegacyName = !product.typeId && (product.subCategory || '').trim().toLowerCase() === previousName;
        if (byId || byLegacyName) {
          product.typeId = saved.id;
          product.subCategory = saved.name;
          productsTouched++;
        }
      }
    }

    return { ok: true, type: saved, productsTouched };
  } catch (err: any) {
    if (err?.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `A product type named "${name}" already exists.`, status: 409 };
    }
    throw err;
  }
}

/**
 * Deletes a type, refusing while products still reference it.
 *
 * Deletion is the only operation here that can orphan, so it is the only one
 * that is blocked outright. The caller is told the count and pointed at the
 * two safe alternatives — deactivate, or reassign — rather than being offered
 * a force flag, because there is no version of "delete this and leave N
 * products pointing at nothing" that is the right outcome.
 */
export async function deleteProductType(
  id: string,
  products: Product[]
): Promise<TypeMutationResult & { productCount?: number }> {
  const current = await getProductType(id);
  if (!current) return { ok: false, error: 'Product type not found.', status: 404 };

  const counts = countProductsByType(products, await listProductTypes());
  const inUse = counts.get(id) ?? 0;
  if (inUse > 0) {
    return {
      ok: false,
      status: 409,
      productCount: inUse,
      error:
        `"${current.name}" is still assigned to ${inUse} product${inUse === 1 ? '' : 's'}. ` +
        'Reassign them to another type first, or deactivate this type instead — ' +
        'deactivating hides it from Shop while keeping those products working.',
    };
  }

  await pool.query('DELETE FROM product_types WHERE id = $1', [id]);
  invalidateProductTypeCache();
  return { ok: true, type: current };
}

/**
 * Resolves a type id supplied by a client, for product save.
 *
 * Returns the type so the caller can write BOTH typeId and the matching
 * subCategory onto the product. Keeping subCategory in step is what lets every
 * existing ?subCategory= link, saved filter and legacy consumer go on working
 * against a product that now carries a typeId.
 */
export async function resolveTypeForProductSave(
  typeId: unknown
): Promise<{ ok: boolean; error?: string; type?: ProductType }> {
  if (typeId === undefined || typeId === null || typeId === '') return { ok: true };
  if (typeof typeId !== 'string') return { ok: false, error: 'Product type must be an id.' };
  const type = await getProductType(typeId);
  if (!type) return { ok: false, error: 'Selected product type no longer exists.' };
  return { ok: true, type };
}

export { slugifyTypeName };
