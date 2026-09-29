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
 *   price/stock apply directly */
export function getActiveSizeOptions(product: Product, shade: Shade | undefined): SizeOption[] {
  if (shade) return shade.sizes || [];
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

/** First selectable shade — prefers active shades, but falls back to the
 * plain first shade if none are marked active (legacy data with no
 * isActive field, or an admin who paused every shade by mistake). */
export function getDefaultShade(product: Product): Shade | undefined {
  if (!product.shades || product.shades.length === 0) return undefined;
  return product.shades.find((s) => s.isActive !== false) ?? product.shades[0];
}

export function isVariantInStock(product: Product, shade: Shade | undefined): boolean {
  if (shade?.stock !== undefined) return shade.stock > 0;
  return product.inStock !== false && product.stock > 0;
}
