/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, Shade, SizeOption } from '../types';

export interface GalleryImage {
  url: string;
  alt: string;
}

/** The gallery for the currently selected variant: variant images if the
 * variant has any (primary first, then by sortOrder), else the product's
 * own image set. Keeps old products/variants without a per-shade gallery
 * working unchanged. */
export function resolveVariantGallery(product: Product, shade: Shade | undefined): GalleryImage[] {
  const variantImages = shade?.images?.filter((img) => img.url) ?? [];
  if (variantImages.length > 0) {
    return [...variantImages]
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.sortOrder - b.sortOrder)
      .map((img) => ({ url: img.url, alt: img.alt || `${product.name} — ${shade?.name || ''}`.trim() }));
  }
  return [
    product.images.primary,
    product.images.secondary,
    product.images.detail,
    product.images.texture,
    product.images.lifestyle,
    product.images.swatch,
  ]
    .filter((url): url is string => !!url)
    .map((url) => ({ url, alt: product.name }));
}

/** A stable key that changes exactly when the gallery should reset to its
 * first image — i.e. whenever the product or the selected variant changes. */
export function variantGalleryResetKey(product: Product, shade: Shade | undefined): string {
  return `${product.id}:${shade?.id ?? 'default'}`;
}

export function getVariantPrice(product: Product, shade: Shade | undefined): number {
  return shade?.price ?? product.price;
}

export function getVariantCompareAtPrice(product: Product, shade: Shade | undefined): number | undefined {
  return shade?.compareAtPrice ?? product.originalPrice;
}

export function getVariantStock(product: Product, shade: Shade | undefined): number {
  return shade?.stock ?? product.stock;
}

/** The size options in effect for the current selection:
 * - a selected shade with its own `sizes` → those (e.g. "Heritage Maroon"
 *   only comes in 50g, "Ceremonial Scarlet" comes in 30g and 50g)
 * - no shade selected, but the product has its own sizes (e.g. the
 *   cleanser jars, which have no shades at all) → those, normalized into
 *   the same SizeOption shape
 * - otherwise → empty: this product/shade has no size dimension, its own
 *   price/stock apply directly
 *
 * Paused sizes are excluded, matching what enumerateStockUnits already does
 * when it decides what can be bought. Those two answers have to agree: a size
 * that is offered on the page but counts for nothing in the stock enumeration
 * is a size a customer can select and then be refused at checkout. `isActive`
 * is undefined on every size saved before the flag was editable, and
 * `!== false` keeps all of those selectable exactly as before. */
export function getActiveSizeOptions(product: Product, shade: Shade | undefined): SizeOption[] {
  if (shade) return (shade.sizes || []).filter((s) => s.isActive !== false);
  if (product.sizes && product.sizes.length > 0) {
    return product.sizes.map((label) => ({
      id: label,
      label,
      price: product.sizePricing?.[label]?.price ?? product.price,
      compareAtPrice: product.sizePricing?.[label]?.compareAtPrice,
      stock: product.sizePricing?.[label]?.stock,
    }));
  }
  return [];
}

export function findSizeOption(product: Product, shade: Shade | undefined, sizeLabel: string | undefined): SizeOption | undefined {
  if (!sizeLabel) return undefined;
  return getActiveSizeOptions(product, shade).find((o) => o.label === sizeLabel);
}

/** Single entry point for "what does this product cost right now" —
 * resolves through the size dimension when one applies to the current
 * shade/product, else through the shade's own price, else the product's
 * base price. */
export function getCurrentPrice(product: Product, shade: Shade | undefined, sizeLabel: string | undefined): number {
  const sizeOption = findSizeOption(product, shade, sizeLabel);
  if (sizeOption) return sizeOption.price;
  return getVariantPrice(product, shade);
}

export function getCurrentCompareAtPrice(
  product: Product,
  shade: Shade | undefined,
  sizeLabel: string | undefined
): number | undefined {
  const sizeOption = findSizeOption(product, shade, sizeLabel);
  if (sizeOption) return sizeOption.compareAtPrice;
  return getVariantCompareAtPrice(product, shade);
}

export function getCurrentStock(product: Product, shade: Shade | undefined, sizeLabel: string | undefined): number {
  const sizeOption = findSizeOption(product, shade, sizeLabel);
  if (sizeOption) return sizeOption.stock ?? getVariantStock(product, shade);
  return getVariantStock(product, shade);
}

/**
 * The shades a customer is actually offered.
 *
 * Paused shades are hidden — UNLESS that would empty the selector, in which
 * case all of them are shown. That fallback is not a nicety: a product whose
 * shades are every one of them paused still renders a product page, and a
 * swatch row with nothing in it is a dead end rather than an explanation.
 *
 * This is the one definition of "selectable". The storefront selector renders
 * from it and the cart endpoint admits from it, so a swatch that is on the
 * page can always be bought and one that is not can never be — the two used to
 * be separate judgements and could disagree.
 */
export function selectableShades(product: Product): Shade[] {
  const shades = product.shades || [];
  const active = shades.filter((s) => s.isActive !== false);
  return active.length > 0 ? active : shades;
}

/** Is this specific shade one a customer may pick right now? See above for
 * why an all-paused product still admits every shade. */
export function isShadeSelectable(product: Product, shadeId: string): boolean {
  return selectableShades(product).some((s) => s.id === shadeId);
}

/** First selectable shade — prefers active shades, but falls back to the
 * plain first shade if none are marked active (legacy data with no
 * isActive field, or an admin who paused every shade by mistake). */
export function getDefaultShade(product: Product): Shade | undefined {
  if (!product.shades || product.shades.length === 0) return undefined;
  return product.shades.find((s) => s.isActive !== false) ?? product.shades[0];
}

/**
 * Which size should be selected after switching to `shade`.
 *
 * Keeps the customer's current choice when the new shade also offers that
 * label — switching from one 50g shade to another 50g shade should not quietly
 * drop them back to 30g — and falls back to the new shade's first size when it
 * does not. Returns undefined when the new selection has no size dimension at
 * all, so a stale label can never survive onto a shade that has no sizes.
 */
export function resolveSizeSelection(
  product: Product,
  shade: Shade | undefined,
  previousLabel: string | undefined
): string | undefined {
  const options = getActiveSizeOptions(product, shade);
  if (options.length === 0) {
    // Shade-less products keep their own product-level default.
    return shade ? undefined : product.selectedSize || (product.sizes ? product.sizes[0] : undefined);
  }
  if (previousLabel && options.some((o) => o.label === previousLabel)) return previousLabel;
  return options[0].label;
}

/** The SKU identifying exactly what is being bought: the size's own when it
 * has one, else the shade's. Mirrors the price/stock chain so all three
 * resolve at the same level. */
export function getCurrentSku(
  product: Product,
  shade: Shade | undefined,
  sizeLabel: string | undefined
): string | undefined {
  const sizeOption = findSizeOption(product, shade, sizeLabel);
  const sku = sizeOption?.sku?.trim() || shade?.sku?.trim();
  return sku || undefined;
}

/**
 * At or below this many units, a shopper is told how few are left.
 *
 * One number for the whole storefront. It matches the `low_stock_threshold`
 * default in migration 012 so the admin's "low stock" badge and the shopper's
 * "only N left" appear at the same moment rather than at two different ones.
 * (A per-unit threshold set in the Inventory panel governs the admin's own
 * reporting; this is the storefront's display rule.)
 */
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

export function stockStatus(stock: number | undefined): StockStatus {
  if (typeof stock !== 'number') return 'in-stock';
  if (stock <= 0) return 'out-of-stock';
  return stock <= LOW_STOCK_THRESHOLD ? 'low-stock' : 'in-stock';
}

// ---------------------------------------------------------------------------
// Discount
//
// DERIVED, NEVER STORED. There is no manual discount field anywhere in the
// product model and this does not add one: a stored percentage is a second
// copy of a fact the two prices already state, and the moment someone edits a
// price without editing the copy the page advertises a saving that the till
// does not give. Compare-at minus selling price is the only input.
//
// This is strictly the product's own markdown. Coupons are a separate
// mechanism applied to the order total at checkout (computeCouponDiscount) and
// the two are never combined into one number here.
// ---------------------------------------------------------------------------

/**
 * Whole-percent saving, or null when there is nothing honest to show.
 *
 * Null — not zero, not a negative — for every degenerate relationship: no
 * compare-at, a compare-at equal to the price (no saving), and a compare-at
 * BELOW the price, which is a data error rather than a -25% discount. Callers
 * render nothing on null, so a bad pair can never surface as a wrong badge.
 */
export function getDiscountPercent(
  price: number | undefined,
  compareAtPrice: number | undefined
): number | null {
  if (typeof price !== 'number' || typeof compareAtPrice !== 'number') return null;
  if (!isFinite(price) || !isFinite(compareAtPrice)) return null;
  if (compareAtPrice <= 0 || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/** The saving on exactly what is selected right now, resolved through the same
 * size → shade → product chain as the price itself. */
export function getCurrentDiscountPercent(
  product: Product,
  shade: Shade | undefined,
  sizeLabel: string | undefined
): number | null {
  return getDiscountPercent(
    getCurrentPrice(product, shade, sizeLabel),
    getCurrentCompareAtPrice(product, shade, sizeLabel)
  );
}

// ---------------------------------------------------------------------------
// Duplication
//
// These live here rather than inside the admin component because what they
// strip matters more than what they copy, and that is a rule worth asserting
// in a test rather than trusting to a click-through.
// ---------------------------------------------------------------------------

/** Mints ids that cannot collide with an existing one. */
const freshId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * A copy of `shade` that is a NEW variant rather than a second reference to
 * the same one.
 *
 * Three things must not survive the copy:
 *
 *   id    — cart lines, order items and inventory rows are all addressed by
 *           it. Two shades sharing an id means an order that cannot say which
 *           of them was shipped, and an inventory row that two variants drain.
 *   sku   — a duplicated code is a warehouse picking the wrong jar. It is
 *           cleared rather than suffixed, because a real SKU comes from the
 *           business, not from a string we invented.
 *   size  — ids, for the same reason as the shade id; and size SKUs, for the
 *           same reason as the shade SKU.
 *
 * Image URLs ARE carried over. The Cloudinary asset is deliberately shared
 * rather than re-uploaded: it is the same photograph, and duplicating the
 * binary would mean two assets to replace whenever the picture changes. Only
 * the image rows get new ids.
 */
export function duplicateShade(shade: Shade): Shade {
  const copy: Shade = JSON.parse(JSON.stringify(shade));
  return {
    ...copy,
    id: freshId('shade'),
    name: `${shade.name} (Copy)`,
    sku: undefined,
    images: (copy.images || []).map((img) => ({ ...img, id: freshId('vimg') })),
    sizes: (copy.sizes || []).map((size) => ({ ...size, id: freshId('size'), sku: undefined })),
  };
}

/**
 * A copy of one size within a shade.
 *
 * The label is made unique against its siblings because a duplicate label
 * would be rejected on save, and because the label IS how a customer picks
 * between two sizes — two "50g" options are not a choice. The SKU is cleared
 * for the same reason it is on a duplicated shade.
 */
export function duplicateSize(sizes: SizeOption[], sizeId: string): SizeOption[] {
  const at = sizes.findIndex((s) => s.id === sizeId);
  if (at === -1) return sizes;

  const source = sizes[at];
  const taken = sizes.map((s) => s.label.trim().toLowerCase());
  let label = `${source.label} Copy`;
  let n = 2;
  while (taken.includes(label.trim().toLowerCase())) label = `${source.label} Copy ${n++}`;

  const next = [...sizes];
  next.splice(at + 1, 0, { ...source, id: freshId('size'), label, sku: undefined });
  return next;
}

// ---------------------------------------------------------------------------
// Admin summaries
// ---------------------------------------------------------------------------

/** Everything a collapsed shade card states, derived rather than stored. */
export interface ShadeSummary {
  /** Lowest price any sellable unit of this shade goes out at. */
  startingPrice: number;
  /** The compare-at belonging to the unit that set `startingPrice` — not the
   * lowest compare-at, which could come from a different size and imply a
   * saving neither unit actually offers. Undefined when that unit has none. */
  startingCompareAtPrice?: number;
  /** The saving on that same unit, derived from the pair above. Null when
   * there is no honest markdown to state. */
  startingDiscountPercent: number | null;
  /** True when that price came from the product, not from this shade. */
  inheritsPrice: boolean;
  /** Units across the shade's sizes, or the shade's own stock when it has none. */
  totalStock: number;
  /** True when no level of this shade defines stock — it is riding the product pool. */
  inheritsStock: boolean;
  imageCount: number;
  sizeCount: number;
  status: StockStatus;
  /** Admin-facing gaps. Advisory only: none of these block a save. */
  warnings: string[];
  /** No warnings — the shade is fully configured. */
  ready: boolean;
}

export function summarizeShade(product: Product, shade: Shade): ShadeSummary {
  const sizes = getActiveSizeOptions(product, shade);
  const prices = sizes.length > 0 ? sizes.map((s) => s.price) : [getVariantPrice(product, shade)];
  const startingPrice = Math.min(...prices);

  // The compare-at is taken from whichever unit set the starting price, so the
  // two numbers always describe the same jar. Picking the lowest price from
  // one size and the highest compare-at from another would advertise a saving
  // that no single purchase can actually produce.
  const cheapestSize = sizes.length > 0 ? sizes.find((s) => s.price === startingPrice) : undefined;
  const startingCompareAtPrice =
    sizes.length > 0 ? cheapestSize?.compareAtPrice : getVariantCompareAtPrice(product, shade);

  // Stock reads exactly as getCurrentStock resolves it, summed over the units
  // enumerateStockUnits says are sellable — so the card cannot claim stock the
  // checkout would refuse, or vice versa.
  const units = enumerateStockUnits(product).filter((u) => u.variantId === shade.id);
  const totalStock = units.length > 0 ? units.reduce((sum, u) => sum + u.stock, 0) : getVariantStock(product, shade);
  const inheritsStock = shade.stock === undefined && sizes.every((s) => s.stock === undefined);

  const warnings: string[] = [];
  if (!shade.sku?.trim() && !sizes.some((s) => s.sku?.trim())) warnings.push('Missing SKU');
  if ((shade.images || []).length === 0) warnings.push('No image — falls back to product images');
  if (shade.price === undefined && sizes.length === 0) warnings.push('No price override — inherits product price');
  if (sizes.length === 0) warnings.push('No size configured');

  return {
    startingPrice,
    startingCompareAtPrice,
    startingDiscountPercent: getDiscountPercent(startingPrice, startingCompareAtPrice),
    inheritsPrice: shade.price === undefined && sizes.length === 0,
    totalStock,
    inheritsStock,
    imageCount: (shade.images || []).length,
    sizeCount: sizes.length,
    status: stockStatus(totalStock),
    warnings,
    ready: warnings.length === 0,
  };
}

export function isVariantInStock(product: Product, shade: Shade | undefined): boolean {
  if (shade?.stock !== undefined) return shade.stock > 0;
  return product.inStock !== false && product.stock > 0;
}

/** One independently buyable combination, with the stock number that actually
 * gates it after the fallback chain has been applied. */
export interface StockUnit {
  variantId?: string;
  sizeLabel?: string;
  stock: number;
}

/**
 * Every combination a customer can actually put in their bag, with its gating
 * stock.
 *
 * This is the authoritative definition of "what is the sellable unit", and it
 * resolves exactly the way getCurrentStock does — most specific level that
 * defines a number, falling back outward. A product with shades is sold as
 * shades; a shade with sizes is sold as sizes; a product with neither is sold
 * as itself.
 *
 * Inactive shades and sizes are excluded: they cannot be selected, so their
 * stock cannot be bought and must not make a product look available.
 */
export function enumerateStockUnits(product: Product): StockUnit[] {
  const shades = (product.shades || []).filter((s) => s.isActive !== false);

  if (shades.length > 0) {
    const units: StockUnit[] = [];
    for (const shade of shades) {
      const sizes = (shade.sizes || []).filter((s) => s.isActive !== false);
      if (sizes.length > 0) {
        for (const size of sizes) {
          units.push({
            variantId: shade.id,
            sizeLabel: size.label,
            stock: size.stock ?? shade.stock ?? product.stock,
          });
        }
      } else {
        units.push({ variantId: shade.id, stock: shade.stock ?? product.stock });
      }
    }
    return units;
  }

  const productSizes = getActiveSizeOptions(product, undefined).filter((s) => s.isActive !== false);
  if (productSizes.length > 0) {
    return productSizes.map((size) => ({ sizeLabel: size.label, stock: size.stock ?? product.stock }));
  }

  return [{ stock: product.stock }];
}

/**
 * Does any sellable unit of this product have stock?
 *
 * Quantity only — the admin's inStock switch is deliberately not consulted, so
 * this can be used to *derive* that flag without circularity.
 *
 * This exists because `product.stock > 0` is the wrong question for a product
 * whose shades carry their own stock. The product-level number behaves as a
 * shared pool that also drains, so it can reach zero while every shade still
 * has units on the shelf — and the old derivation then marked the whole
 * product out of stock, hiding it from the shop and refusing the entire
 * basket at checkout. The shade is what gates the sale, so the shade is what
 * decides availability.
 */
export function hasSellableStock(product: Product): boolean {
  return enumerateStockUnits(product).some((unit) => unit.stock > 0);
}

/**
 * Can a customer buy anything from this product right now?
 *
 * Both conditions must hold: an admin has not switched it off, and something
 * is actually in stock. `inStock` is treated as the admin's intent here; the
 * quantity question is answered by hasSellableStock above.
 */
export function isProductSellable(product: Product): boolean {
  return product.inStock !== false && hasSellableStock(product);
}
