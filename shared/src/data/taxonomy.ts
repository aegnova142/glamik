/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Canonical category → subcategory taxonomy for product filtering.
 *
 * This is deliberately a fixed, code-level mapping rather than
 * admin-editable data: `Product.category` is already a closed enum
 * ('Makeup' | 'Skin' | 'Nails', enforced by the admin's Category
 * <select>), and this list is what keeps subcategory values equally
 * closed. The separate Admin → Categories & Taxonomy screen manages
 * `CMSCategory` records for the homepage category-grid display (name,
 * image, description, order) — a presentation concern with free-text
 * names the admin can rename freely. Deriving Shop's filter from that
 * data would make filtering depend on marketing copy, which is exactly
 * what caused products to silently vanish from filters when a category
 * got renamed or a subcategory field drifted (e.g. "Eyes " with a
 * trailing space, or a value that was never added here at all).
 *
 * Adding a new subcategory for future products means adding one string
 * here — not touching any component logic.
 */
export const PRODUCT_TAXONOMY: Record<'Makeup' | 'Skin' | 'Nails', string[]> = {
  Makeup: ['Lips', 'Eyes', 'Face'],
  Skin: ['Cleansing', 'Skincare Essentials'],
  Nails: ['Nail Products', 'Nail Care'],
};

export const PRODUCT_CATEGORIES = Object.keys(PRODUCT_TAXONOMY) as Array<keyof typeof PRODUCT_TAXONOMY>;
