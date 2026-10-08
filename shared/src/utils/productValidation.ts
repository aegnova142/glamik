/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ==========================================
// VARIANT VALIDATION — ONE RULEBOOK, BOTH SIDES
//
// The admin form and POST/PUT /admin/products used to carry their own copies
// of these checks. Two copies of a rule is one rule and one near-miss: the
// server's duplicate-SKU message named no shade, the client's compare-at check
// did not exist at all, and nothing anywhere rejected a malformed hex. This
// module is the single rulebook; the form calls it to show the error inline
// before saving, and the route calls it because a request need not have come
// from that form.
//
// TWO PRINCIPLES RUN THROUGH EVERY RULE BELOW:
//
//   1. AN OMITTED FIELD IS NOT AN ERROR. Empty shade price means "inherit the
//      product price"; empty stock means "resolve by the normal chain"; no
//      sizes means "this shade sells at one price". Those are the documented
//      defaults that every product saved before these fields existed relies
//      on, so validation must stay silent about them. Only a field someone has
//      actually filled in WRONGLY is rejected.
//
//   2. AN ERROR NAMES ITS LOCATION. "Duplicate SKU" sends an admin hunting
//      through four shades and their sizes; "Shade 'Heritage Maroon' and size
//      '30g' of 'Ceremonial Scarlet' both use SKU GLM-WB-30" sends them to the
//      two fields involved.
// ==========================================

import type { Product, Shade, SizeOption } from '../types';
import { isUsableImageUrl } from './shadeMatch';

// 3-digit shorthand is accepted alongside the 6-digit form the picker writes.
// Both are valid CSS and both render; rejecting #FFF would block an admin from
// re-saving a product over a colour that was never actually broken.
const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const isBadNumber = (value: unknown): boolean =>
  typeof value !== 'number' || !isFinite(value) || value < 0;

/** Where a SKU was found, for the duplicate message. */
interface SkuSite {
  sku: string;
  where: string;
}

function shadeLabel(shade: Shade, index: number): string {
  return shade.name?.trim() ? `"${shade.name.trim()}"` : `#${index + 1}`;
}

function validateSize(
  size: SizeOption,
  shade: Shade,
  shadeName: string
): string | null {
  if (!size.label || !size.label.trim()) {
    return `A size on variant ${shadeName} needs a label.`;
  }
  const label = size.label.trim();
  if (isBadNumber(size.price)) {
    return `Size "${label}" on variant ${shadeName} has an invalid price.`;
  }
  if (size.stock !== undefined && isBadNumber(size.stock)) {
    return `Size "${label}" on variant ${shadeName} has an invalid stock quantity.`;
  }
  if (size.compareAtPrice !== undefined) {
    if (isBadNumber(size.compareAtPrice)) {
      return `Size "${label}" on variant ${shadeName} has an invalid compare-at price.`;
    }
    // A compare-at below the selling price is the one pricing mistake that
    // looks fine in the form and wrong on the page — it would advertise a
    // negative saving. Equal is allowed and simply shows no discount.
    if (size.compareAtPrice < size.price) {
      return `Size "${label}" on variant ${shadeName} has a compare-at price (₹${size.compareAtPrice}) below its selling price (₹${size.price}). Compare-at must be the higher, pre-discount price.`;
    }
  }
  return null;
}

/**
 * Every variant rule, in one pass. Returns null when the product is saveable.
 *
 * Deliberately returns the FIRST problem rather than a list: the admin form
 * shows one message next to the Save button, and a list of eight would be read
 * as eight separate failures rather than one form to fix.
 */
export function validateProductVariants(product: Partial<Product>): string | null {
  const shades = product.shades || [];
  const seenShadeIds = new Set<string>();
  const skuSites: SkuSite[] = [];

  for (let i = 0; i < shades.length; i++) {
    const shade = shades[i];
    const name = shadeLabel(shade, i);

    if (!shade.name || !shade.name.trim()) {
      return `Variant ${name} needs a name before saving.`;
    }

    // A duplicate id is the most damaging thing in this file and the least
    // visible: cart lines, order items and inventory rows all address a shade
    // by it, so two shades sharing one id means a customer can be sold the
    // first and shipped the second, with no way to tell afterwards which was
    // meant. Duplicating a shade in the UI mints a fresh id; this catches a
    // hand-edited or replayed payload that did not.
    if (!shade.id || !shade.id.trim()) {
      return `Variant ${name} is missing its internal id.`;
    }
    if (seenShadeIds.has(shade.id)) {
      return `Two variants on this product share the internal id "${shade.id}". Each variant needs its own — duplicate the shade instead of copying it.`;
    }
    seenShadeIds.add(shade.id);

    if (shade.hex !== undefined && shade.hex !== '' && !HEX_PATTERN.test(shade.hex)) {
      return `Variant ${name} has an invalid colour "${shade.hex}". Use a 6-digit hex code such as #C9972B.`;
    }

    if (shade.price !== undefined && isBadNumber(shade.price)) {
      return `Variant ${name} has an invalid price.`;
    }
    if (shade.stock !== undefined && isBadNumber(shade.stock)) {
      return `Variant ${name} has an invalid stock quantity.`;
    }
    if (shade.compareAtPrice !== undefined) {
      if (isBadNumber(shade.compareAtPrice)) {
        return `Variant ${name} has an invalid compare-at price.`;
      }
      // Compared against whatever this shade actually sells at — its own
      // override when it has one, the product price when it inherits.
      const sellingPrice = shade.price ?? product.price;
      if (typeof sellingPrice === 'number' && shade.compareAtPrice < sellingPrice) {
        return `Variant ${name} has a compare-at price (₹${shade.compareAtPrice}) below its selling price (₹${sellingPrice}). Compare-at must be the higher, pre-discount price.`;
      }
    }

    for (const img of shade.images || []) {
      // An empty slot is "not configured yet", not an error — the same line
      // findBrokenShadeImageUrls draws, and the same one resolveVariantGallery
      // already acts on by filtering such rows out. Only a URL someone has put
      // something unusable into is rejected.
      if (img.url && img.url.trim() && !isUsableImageUrl(img.url)) {
        return `Variant ${name} has an image with an unusable URL ("${img.url}"). Upload the image or paste a full https:// link.`;
      }
    }

    if (shade.sku && shade.sku.trim()) {
      skuSites.push({ sku: shade.sku.trim().toUpperCase(), where: `variant ${name}` });
    }

    const sizes = shade.sizes || [];
    if (sizes.length > 0) {
      const labels: string[] = [];
      for (const size of sizes) {
        const sizeError = validateSize(size, shade, name);
        if (sizeError) return sizeError;
        labels.push(size.label.trim().toLowerCase());
        if (size.sku && size.sku.trim()) {
          skuSites.push({
            sku: size.sku.trim().toUpperCase(),
            where: `size "${size.label.trim()}" of variant ${name}`,
          });
        }
      }
      const duplicateLabel = labels.find((l, idx) => labels.indexOf(l) !== idx);
      if (duplicateLabel) {
        return `Variant ${name} has two sizes labelled "${duplicateLabel}". Size labels must be unique within a variant.`;
      }
    }
  }

  // SKUs are compared case-insensitively and across BOTH levels: glm-wb-30 and
  // GLM-WB-30 are the same code to a warehouse, and a shade SKU colliding with
  // another shade's size SKU is the same mis-pick as two shades colliding.
  for (let i = 0; i < skuSites.length; i++) {
    for (let j = i + 1; j < skuSites.length; j++) {
      if (skuSites[i].sku === skuSites[j].sku) {
        return `SKU "${skuSites[i].sku}" is used by ${skuSites[i].where} and ${skuSites[j].where}. SKUs must be unique within a product.`;
      }
    }
  }

  if (product.sizePricing) {
    for (const [label, entry] of Object.entries(product.sizePricing)) {
      if (isBadNumber(entry.price)) return `Size "${label}" has an invalid price.`;
      if (entry.stock !== undefined && isBadNumber(entry.stock)) {
        return `Size "${label}" has an invalid stock quantity.`;
      }
      if (entry.compareAtPrice !== undefined) {
        if (isBadNumber(entry.compareAtPrice)) return `Size "${label}" has an invalid compare-at price.`;
        if (entry.compareAtPrice < entry.price) {
          return `Size "${label}" has a compare-at price (₹${entry.compareAtPrice}) below its selling price (₹${entry.price}).`;
        }
      }
    }
  }

  if (
    product.originalPrice !== undefined &&
    typeof product.price === 'number' &&
    typeof product.originalPrice === 'number' &&
    isFinite(product.originalPrice) &&
    product.originalPrice > 0 &&
    product.originalPrice < product.price
  ) {
    return `This product's compare-at price (₹${product.originalPrice}) is below its selling price (₹${product.price}). Compare-at must be the higher, pre-discount price.`;
  }

  return null;
}
