// ==========================================
// SITEMAP
//
// Generated per request from the CMS rather than committed as a static file.
// A storefront's indexable surface is mostly products and journal articles,
// both of which admins add and edit daily; a checked-in sitemap.xml would be
// wrong within a day of being written and would then quietly stay wrong.
//
// loadDatabase() reads from the in-process CMS cache (see db.ts), so this
// costs no query on the hot path. The response is cached for an hour anyway,
// because crawlers are the only caller and none of them need the minute.
// ==========================================

import { Router, Request, Response } from 'express';
import { loadDatabase } from '../db/db';

const router = Router();

/**
 * The canonical origin every URL in the sitemap is built from.
 *
 * A sitemap may only list URLs on its own host — a crawler discards entries
 * that point elsewhere — so this must match the host the file is served from,
 * including scheme and any www prefix.
 */
const SITE_URL = (process.env.SITE_URL || 'https://glamirk.com').replace(/\/+$/, '');

/**
 * Pages that exist regardless of what is in the CMS.
 *
 * Deliberately excludes everything robots.txt disallows (cart, checkout,
 * account, wishlist, my-glam, the order views) — listing a disallowed URL in
 * a sitemap is a direct contradiction and Search Console reports it as one.
 */
const STATIC_PATHS = [
  '/',
  '/shop',
  '/about',
  '/new-launch',
  '/journal',
  '/beauty-guides',
  '/social-commerce',
  '/shop-the-look',
  '/find-my-shade',
  '/try-on',
  '/support',
];

/** Mirrors LEGAL_POLICIES in frontend/src/utils/routing.ts. */
const LEGAL_POLICIES = ['privacy', 'terms', 'shipping', 'returns', 'cookies'];

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Returns an ISO date for <lastmod>, or undefined if the value is not a date.
 *
 * Seed and hand-edited records carry some empty and some malformed dates, and
 * an unparseable <lastmod> invalidates the entry that contains it. Dropping
 * the element is always safe — it is optional.
 */
function lastmod(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function urlEntry(path: string, modified?: string): string {
  const loc = escapeXml(SITE_URL + path);
  return modified
    ? `  <url><loc>${loc}</loc><lastmod>${modified}</lastmod></url>`
    : `  <url><loc>${loc}</loc></url>`;
}

router.get('/sitemap.xml', async (_req: Request, res: Response) => {
  try {
    const db = await loadDatabase();

    const entries: string[] = [
      ...STATIC_PATHS.map((p) => urlEntry(p)),
      ...LEGAL_POLICIES.map((p) => urlEntry(`/legal/${p}`)),
    ];

    // Products have no draft state — every one in the CMS is live on the
    // storefront, out of stock included. An out-of-stock product keeps its
    // page and should keep its listing.
    for (const product of db.products || []) {
      if (!product?.id) continue;
      entries.push(urlEntry(`/product/${encodeURIComponent(product.id)}`));
    }

    // status is optional and absent on articles written before the field
    // existed; those are published, same as the storefront treats them.
    for (const article of db.journalArticles || []) {
      if (!article?.id) continue;
      if (article.status && article.status !== 'published') continue;
      entries.push(urlEntry(`/article/${encodeURIComponent(article.id)}`, lastmod(article.date)));
    }

    // CMS-authored pages render at /:slug via the dynamic-page route. System
    // pages are the CMS's own records for routes already listed above, so
    // including them would duplicate entries.
    for (const page of db.pages || []) {
      if (!page?.slug || page.isSystemPage) continue;
      if (page.status !== 'published') continue;
      entries.push(urlEntry(`/${encodeURIComponent(page.slug)}`, lastmod(page.updatedAt)));
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

    res.type('application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[sitemap] could not build the sitemap:', err);
    // 500 rather than an empty urlset: an empty sitemap is a valid document
    // that tells a crawler the site has no pages, which would be a far worse
    // thing to serve than an error it will simply retry.
    res.status(500).type('text/plain').send('Sitemap temporarily unavailable.');
  }
});

export default router;
