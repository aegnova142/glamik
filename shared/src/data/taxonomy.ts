/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SUPERSEDED for Shop filtering — see shared/src/utils/productType.ts.
 *
 * This was the closed category → subcategory mapping that drove Shop's filter
 * and the admin's sub-category <select>. Both now read the admin-defined
 * `product_types` table (migration 021) instead, so a new type is created in
 * the admin and appears on Shop with no code change.
 *
 * WHY THE ORIGINAL RESTRICTION EXISTED, AND WHY IT NO LONGER APPLIES.
 *
 * This file used to carry a warning that deriving Shop's filter from
 * admin-editable data made products silently vanish when a category was
 * renamed or a value drifted ("Eyes " with a trailing space). That diagnosis
 * was correct, but the cause was keying on the NAME. Product types are keyed
 * by an immutable id: a product references `ptype-lips`, so renaming that type
 * to "Lip Colour" changes a label and orphans nothing. Legacy products with no
 * typeId are matched on a case- and whitespace-normalised name, which absorbs
 * exactly the drift that used to hide them.
 *
 * KEPT, NOT DELETED. `Product.category` is still the closed
 * 'Makeup' | 'Skin' | 'Nails' enum and PRODUCT_CATEGORIES still names it.
 * Removing the subcategory map outright would break any consumer still
 * importing it, and it remains the seed list a fresh install's types are
 * backfilled from.
 */
export const PRODUCT_TAXONOMY: Record<'Makeup' | 'Skin' | 'Nails', string[]> = {
  Makeup: ['Lips', 'Eyes', 'Face'],
  Skin: ['Cleansing', 'Skincare Essentials'],
  Nails: ['Nail Products', 'Nail Care'],
};

export const PRODUCT_CATEGORIES = Object.keys(PRODUCT_TAXONOMY) as Array<keyof typeof PRODUCT_TAXONOMY>;
