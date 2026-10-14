/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Product types: resolution, matching and validation.
 *
 * ONE module, read by the storefront filter, the admin form and the server
 * route. That is deliberate — the bug this whole feature has to avoid is the
 * one shared/src/data/taxonomy.ts documents: Shop's filter and the admin's
 * notion of a valid category drifted apart, and products silently stopped
 * appearing. Two copies of "does this product belong to this type" is how that
 * happens again, so there is exactly one.
 */

import { Product, ProductType } from '../types';

/**
 * URL-safe form of a type name.
 *
 * MUST stay identical to the expression migration 021 uses for its backfill —
 * a row created by the migration and a row created through the admin have to
 * produce the same slug for the same name, or the unique index turns a rename
 * into a confusing constraint error.
 */
export function slugifyTypeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The comparison key for "is this the same type name". Case- and
 *  whitespace-insensitive, matching the LOWER(name) unique index. */
export function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase();
}

export const TYPE_NAME_MAX_LENGTH = 60;
export const TYPE_DESCRIPTION_MAX_LENGTH = 500;

export interface TypeValidationResult {
  ok: boolean;
  error?: string;
  /** The cleaned name, present when ok. */
  name?: string;
  slug?: string;
}

/**
 * Validates a type name against everything that is not uniqueness.
 *
 * Uniqueness is deliberately NOT checked here: it is a property of the whole
 * table at one instant, which only the database can decide without a race. The
 * route checks for a friendly message and relies on the unique index to be
 * right.
 */
export function validateTypeName(rawName: unknown): TypeValidationResult {
  if (typeof rawName !== 'string') return { ok: false, error: 'Type name is required.' };
  const name = rawName.trim();
  if (!name) return { ok: false, error: 'Type name is required.' };
  if (name.length > TYPE_NAME_MAX_LENGTH) {
    return { ok: false, error: `Type name must be ${TYPE_NAME_MAX_LENGTH} characters or fewer.` };
  }
  const slug = slugifyTypeName(name);
  // A name of only punctuation ("---", "!!!") slugifies to nothing, and a type
  // with no slug cannot be addressed in a URL. Rejected with the reason rather
  // than saved as something unreachable.
  if (!slug) {
    return { ok: false, error: 'Type name must contain at least one letter or number.' };
  }
  return { ok: true, name, slug };
}

export function validateTypeDescription(raw: unknown): TypeValidationResult {
  if (raw === undefined || raw === null) return { ok: true, name: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'Description must be text.' };
  const description = raw.trim();
  if (description.length > TYPE_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, error: `Description must be ${TYPE_DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: description };
}

/** Index a type list by id — O(1) lookups instead of a find() per product,
 *  which is what turns a catalog render from quadratic into linear. */
export function indexTypesById(types: ProductType[]): Map<string, ProductType> {
  return new Map(types.map((t) => [t.id, t]));
}

/** Index by normalized name, for the legacy subCategory bridge. */
export function indexTypesByName(types: ProductType[]): Map<string, ProductType> {
  const byName = new Map<string, ProductType>();
  for (const t of types) byName.set(normalizeTypeName(t.name), t);
  return byName;
}

/**
 * The type a product belongs to.
 *
 * Resolution order, most explicit first:
 *
 *   1. product.typeId        — set by the admin form; survives renaming.
 *   2. product.subCategory   — matched against type NAMES, case-insensitively.
 *                              This is the legacy bridge: every product saved
 *                              before types existed resolves through it, which
 *                              is why no product had to be rewritten.
 *   3. undefined             — genuinely untyped.
 *
 * A typeId pointing at a type that no longer exists deliberately falls through
 * to the subCategory match rather than resolving to nothing, so deleting a type
 * out from under a product degrades to legacy behaviour instead of hiding it.
 */
export function resolveProductType(
  product: Pick<Product, 'typeId' | 'subCategory'>,
  byId: Map<string, ProductType>,
  byName: Map<string, ProductType>
): ProductType | undefined {
  if (product.typeId) {
    const direct = byId.get(product.typeId);
    if (direct) return direct;
  }
  if (product.subCategory) {
    return byName.get(normalizeTypeName(product.subCategory));
  }
  return undefined;
}

/**
 * Does this product belong to the type identified by `typeId`?
 *
 * Takes the resolved type rather than re-resolving, so a caller filtering a
 * whole catalog resolves once per product rather than once per product per
 * filter check.
 */
export function productMatchesType(resolved: ProductType | undefined, typeId: string | null): boolean {
  if (!typeId) return true;
  return resolved?.id === typeId;
}

/**
 * Products per type, for the filter's counts.
 *
 * One pass over the catalog building a Map, rather than a filter() per type —
 * with T types and P products the obvious version is O(T·P) and this is O(P).
 * At catalog scale either works; this one does not need revisiting when the
 * catalog grows, and the counts are rendered on every Shop keystroke.
 */
export function countProductsByType(
  products: Pick<Product, 'typeId' | 'subCategory'>[],
  types: ProductType[]
): Map<string, number> {
  const byId = indexTypesById(types);
  const byName = indexTypesByName(types);
  const counts = new Map<string, number>();
  for (const type of types) counts.set(type.id, 0);
  for (const product of products) {
    const resolved = resolveProductType(product, byId, byName);
    if (resolved) counts.set(resolved.id, (counts.get(resolved.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Types a shopper is offered, in display order.
 *
 * Inactive types are withheld, and so are active ones with nothing in them —
 * a filter row that always yields "no products" is a dead end rather than a
 * choice. An inactive type still RESOLVES for the products that reference it
 * (see resolveProductType); it is only absent from this list, which is what
 * makes deactivating safe rather than orphaning.
 */
export function selectableTypes(
  types: ProductType[],
  counts: Map<string, number>
): ProductType[] {
  return types
    .filter((t) => t.isActive && (counts.get(t.id) ?? 0) > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Find a type by slug — how a ?type= URL parameter resolves back to an id. */
export function findTypeBySlug(types: ProductType[], slug: string | null | undefined): ProductType | undefined {
  if (!slug) return undefined;
  const wanted = slug.trim().toLowerCase();
  return types.find((t) => t.slug === wanted);
}
