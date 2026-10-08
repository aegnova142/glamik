// Self-check for the homepage banner carousel rules: validation, schedule, links.
// Run: npm run test:homebanners --workspace @glamirk/backend
import assert from 'node:assert/strict';
import { homeBannerHref, isHomeBannerLive, isSafeBannerUrl, validateHomeBannerConfig } from '@glamirk/shared/utils/homeBanners';
import type { CMSHomeBanner } from '@glamirk/shared/types';

const img = 'https://res.cloudinary.com/x/image/upload/v1/a.webp';
const base: CMSHomeBanner = { id: 'a', name: 'A', desktopImage: img, targetType: 'none' };

// Links: internal paths and http(s) only.
for (const ok of ['/shop', '/campaign/diwali?x=1', 'https://glamirk.com/x']) assert.ok(isSafeBannerUrl(ok), ok);
for (const bad of ['javascript:alert(1)', '//evil.com', '/\\evil.com', 'data:text/html,x', 'shop', '']) assert.ok(!isSafeBannerUrl(bad), bad);

// Validation.
assert.deepEqual(validateHomeBannerConfig({ banners: [base] }), []);
assert.ok(validateHomeBannerConfig({ banners: [{ ...base, desktopImage: '' }] }).length);
assert.ok(validateHomeBannerConfig({ banners: [{ ...base, targetType: 'url', targetUrl: 'javascript:x' }] }).length);
assert.ok(validateHomeBannerConfig({ banners: [{ ...base, targetType: 'product' }] }).length);
assert.ok(validateHomeBannerConfig({ banners: [base, base] }).length, 'duplicate ids');
assert.ok(validateHomeBannerConfig({ banners: [{ ...base, startDate: '2026-10-20T00:00:00Z', endDate: '2026-10-10T00:00:00Z' }] }).length);
assert.ok(validateHomeBannerConfig(null).length);

// Live window.
const now = new Date('2026-10-15T00:00:00Z');
assert.ok(isHomeBannerLive(base, now));
assert.ok(!isHomeBannerLive({ ...base, isActive: false }, now));
assert.ok(!isHomeBannerLive({ ...base, startDate: '2026-10-16T00:00:00Z' }, now));
assert.ok(!isHomeBannerLive({ ...base, endDate: '2026-10-14T00:00:00Z' }, now));
assert.ok(isHomeBannerLive({ ...base, startDate: '2026-10-10T00:00:00Z', endDate: '2026-10-20T00:00:00Z' }, now));

// Href resolution against the live catalogue.
const products = [{ id: 'p1' }];
const categories = [{ id: 'c1', name: 'Makeup' }];
assert.equal(homeBannerHref({ ...base, targetType: 'product', targetId: 'p1' }, products, categories), '/product/p1');
assert.equal(homeBannerHref({ ...base, targetType: 'product', targetId: 'gone' }, products, categories), null);
assert.equal(homeBannerHref({ ...base, targetType: 'category', targetId: 'c1' }, products, categories), '/shop?category=Makeup');
assert.equal(homeBannerHref({ ...base, targetType: 'url', targetUrl: '//evil.com' }, products, categories), null);
assert.equal(homeBannerHref(base, products, categories), null);

console.log('homebanners: all checks passed');
