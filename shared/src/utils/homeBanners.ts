import type { CMSCategory, CMSHomeBanner, CMSHomeBannerConfig, Product } from '../types';

export const DEFAULT_HOME_BANNER_INTERVAL_MS = 5000;
export const MAX_HOME_BANNERS = 10;

const TARGET_TYPES = ['product', 'category', 'url', 'none'] as const;

/** Internal path ("/shop", not "//evil.com") or an http(s) URL. Anything else
 * — javascript:, data:, a bare word — is refused, because this value becomes
 * an href on the homepage. */
export function isSafeBannerUrl(url: string): boolean {
  const u = url.trim();
  if (u.startsWith('/')) return !u.startsWith('//') && !u.startsWith('/\\');
  return /^https?:\/\/[^\s/]+/i.test(u);
}

const isValidDate = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s));

/** Active, has a desktop image, and inside its schedule window (if any). */
export function isHomeBannerLive(banner: CMSHomeBanner, now: Date = new Date()): boolean {
  if (banner.isActive === false || !banner.desktopImage) return false;
  const t = now.getTime();
  if (banner.startDate && Date.parse(banner.startDate) > t) return false;
  if (banner.endDate && Date.parse(banner.endDate) < t) return false;
  return true;
}

/** Storefront href for a banner, or null when it should not be a link (no
 * destination, or the product/category it pointed at no longer exists). */
export function homeBannerHref(
  banner: CMSHomeBanner,
  products: Pick<Product, 'id'>[],
  categories: Pick<CMSCategory, 'id' | 'name'>[]
): string | null {
  switch (banner.targetType) {
    case 'product': {
      const p = products.find((x) => x.id === banner.targetId);
      return p ? `/product/${encodeURIComponent(p.id)}` : null;
    }
    case 'category': {
      // The shop filters on product.category, which holds the category name.
      const c = categories.find((x) => x.id === banner.targetId);
      return c ? `/shop?category=${encodeURIComponent(c.name)}` : null;
    }
    case 'url':
      return banner.targetUrl && isSafeBannerUrl(banner.targetUrl) ? banner.targetUrl.trim() : null;
    default:
      return null;
  }
}

/** Server-side validation of an admin save. Returns a list of problems; empty
 * means the payload is safe to store. */
export function validateHomeBannerConfig(input: unknown): string[] {
  const errors: string[] = [];
  const cfg = input as CMSHomeBannerConfig;
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.banners)) return ['Invalid banner payload'];
  if (cfg.banners.length > MAX_HOME_BANNERS) errors.push(`At most ${MAX_HOME_BANNERS} banners are allowed`);
  if (cfg.intervalMs !== undefined && (typeof cfg.intervalMs !== 'number' || cfg.intervalMs < 2000 || cfg.intervalMs > 15000)) {
    errors.push('Slide interval must be between 2 and 15 seconds');
  }
  const ids = new Set<string>();
  cfg.banners.forEach((b, i) => {
    const label = `Banner ${i + 1}${b?.name ? ` ("${b.name}")` : ''}`;
    if (!b || typeof b !== 'object') return void errors.push(`${label}: invalid`);
    if (!b.id || typeof b.id !== 'string' || ids.has(b.id)) errors.push(`${label}: missing or duplicate id`);
    ids.add(b.id);
    if (!b.name || typeof b.name !== 'string' || !b.name.trim()) errors.push(`${label}: name is required`);
    for (const field of ['desktopImage', 'mobileImage'] as const) {
      const v = b[field];
      if (v && (typeof v !== 'string' || !/^https?:\/\//i.test(v))) errors.push(`${label}: ${field} is not a usable image URL`);
    }
    if (!b.desktopImage) errors.push(`${label}: desktop image is required`);
    if (!(TARGET_TYPES as readonly string[]).includes(b.targetType)) errors.push(`${label}: unknown destination type`);
    if ((b.targetType === 'product' || b.targetType === 'category') && !b.targetId) {
      errors.push(`${label}: choose a ${b.targetType}`);
    }
    if (b.targetType === 'url' && (!b.targetUrl || !isSafeBannerUrl(b.targetUrl))) {
      errors.push(`${label}: link must start with / or https://`);
    }
    if (b.startDate && !isValidDate(b.startDate)) errors.push(`${label}: invalid start date`);
    if (b.endDate && !isValidDate(b.endDate)) errors.push(`${label}: invalid end date`);
    if (isValidDate(b.startDate) && isValidDate(b.endDate) && Date.parse(b.startDate!) > Date.parse(b.endDate!)) {
      errors.push(`${label}: end date is before start date`);
    }
  });
  return errors;
}
