/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Product sections: resolution, matching and counting.
 *
 * The level above product types, and deliberately the same shape. The slug,
 * name-normalisation and validation primitives are IMPORTED from
 * productType.ts rather than re-stated here — a section named "Lip Care" and a
 * type named "Lip Care" must slugify identically, and two copies of that rule
 * is how they would stop doing so.
 */

import { Product, ProductSection, ProductType } from '../types';
import {
  normalizeTypeName,
  slugifyTypeName,
  validateTypeName,
  validateTypeDescription,
  TypeValidationResult,
} from './productType';

/** Sections and types share one slug rule — see the note above. */
export const slugifySectionName = slugifyTypeName;
export const normalizeSectionName = normalizeTypeName;

export function validateSectionName(raw: unknown): TypeValidationResult {
  const result = validateTypeName(raw);
  // Same constraints, section-specific wording — an admin reading "Type name
  // is required" while editing a section would reasonably wonder which field
  // it meant.
  if (!result.ok && result.error) {
    return { ...result, error: result.error.replace(/^Type name/, 'Section name') };
  }
  return result;
}

export const validateSectionDescription = validateTypeDescription;

export function indexSectionsById(sections: ProductSection[]): Map<string, ProductSection> {
  return new Map(sections.map((s) => [s.id, s]));
}

export function indexSectionsByName(sections: ProductSection[]): Map<string, ProductSection> {
  const byName = new Map<string, ProductSection>();
  for (const s of sections) byName.set(normalizeSectionName(s.name), s);
  return byName;
}

/**
 * The section a product belongs to.
 *
 * Same resolution order as resolveProductType, for the same reasons:
 *
 *   1. product.sectionId  — survives renaming.
 *   2. product.category   — matched against section NAMES, case- and
 *                           whitespace-insensitively. The legacy bridge every
 *                           pre-022 product resolves through.
 *   3. undefined          — genuinely unsectioned.
 *
 * A sectionId pointing at a deleted section falls through to the name match
 * rather than resolving to nothing.
 */
export function resolveProductSection(
  product: Pick<Product, 'sectionId' | 'category'>,
  byId: Map<string, ProductSection>,
  byName: Map<string, ProductSection>
): ProductSection | undefined {
  if (product.sectionId) {
    const direct = byId.get(product.sectionId);
    if (direct) return direct;
  }
  if (product.category) {
    return byName.get(normalizeSectionName(product.category));
  }
  return undefined;
}

/** Products per section, in one pass. Same shape as countProductsByType. */
export function countProductsBySection(
  products: Pick<Product, 'sectionId' | 'category'>[],
  sections: ProductSection[]
): Map<string, number> {
  const byId = indexSectionsById(sections);
  const byName = indexSectionsByName(sections);
  const counts = new Map<string, number>();
  for (const section of sections) counts.set(section.id, 0);
  for (const product of products) {
    const resolved = resolveProductSection(product, byId, byName);
    if (resolved) counts.set(resolved.id, (counts.get(resolved.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Types nesting under each section.
 *
 * `ProductType.category` holds a section NAME, so this matches on the
 * normalised name. It is what makes "you cannot delete a section that still
 * has types under it" answerable without a second query per section.
 */
export function countTypesBySection(
  types: ProductType[],
  sections: ProductSection[]
): Map<string, number> {
  const byName = indexSectionsByName(sections);
  const counts = new Map<string, number>();
  for (const section of sections) counts.set(section.id, 0);
  for (const type of types) {
    if (!type.category) continue;
    const section = byName.get(normalizeSectionName(type.category));
    if (section) counts.set(section.id, (counts.get(section.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Sections offered in the admin's dropdowns.
 *
 * Unlike selectableTypes, an EMPTY section is still offered: a section with no
 * products yet is exactly what an admin has just created and is about to
 * assign something to. Only inactive ones are withheld.
 */
export function selectableSections(sections: ProductSection[]): ProductSection[] {
  return sections
    .filter((s) => s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function findSectionBySlug(
  sections: ProductSection[],
  slug: string | null | undefined
): ProductSection | undefined {
  if (!slug) return undefined;
  const wanted = slug.trim().toLowerCase();
  return sections.find((s) => s.slug === wanted);
}
