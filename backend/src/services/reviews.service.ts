import { v2 as cloudinary } from 'cloudinary';
import { pool, loadDatabase, saveDatabase, broadcastEvent } from '../db/db';
import { mapNotificationRow } from './notifications.service';
import { Review, ReviewMedia } from '@glamirk/shared/types';

// Reads CLOUDINARY_URL from the environment, same as the account router.
cloudinary.config();

/**
 * Deletes review media from Cloudinary that is no longer referenced.
 *
 * Called when a review is deleted, and when an edit drops an attachment —
 * without it, every removed photo would linger in paid storage forever, still
 * fetchable by anyone who had the URL.
 *
 * Best-effort by design: the database is already the source of truth for what
 * a review shows, so a storage hiccup must not fail the customer's request.
 * Legacy photo_url entries have no publicId (it was never recorded) and are
 * skipped rather than guessed at.
 */
export async function destroyReviewMedia(media: ReviewMedia[] | null | undefined): Promise<void> {
  for (const item of media || []) {
    if (!item?.publicId) continue;
    try {
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.type === 'video' ? 'video' : 'image',
      });
    } catch (err) {
      console.error('Could not remove review media from Cloudinary:', item.publicId, err);
    }
  }
}

/** The media entries present in `before` but absent from `after`, matched on
 * publicId — i.e. what an edit actually detached and should clean up. */
export function orphanedReviewMedia(before: ReviewMedia[], after: ReviewMedia[]): ReviewMedia[] {
  const keptIds = new Set(after.map((m) => m.publicId).filter(Boolean));
  return before.filter((m) => m.publicId && !keptIds.has(m.publicId));
}

// A customer has "verified purchase" on a product if any of their DELIVERED
// orders contains it — checked fresh on every review write rather than
// trusted from the client.
export async function isVerifiedPurchase(customerId: string, productId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 AND o.status = 'DELIVERED' AND oi.product_id = $2
     LIMIT 1`,
    [customerId, productId]
  );
  return res.rows.length > 0;
}

// Recomputes and persists a product's aggregate rating/reviewCount from the
// live reviews table. Products live in the cms_state JSONB blob, not a SQL
// row, so this goes through the same load-mutate-save path as every other
// product mutation (see server/routes.ts admin product routes).
// Only approved reviews count: a pending or rejected rating must not move the
// stars shown on product cards.
export async function recomputeProductRating(productId: string): Promise<void> {
  const res = await pool.query("SELECT rating FROM reviews WHERE product_id = $1 AND status = 'approved'", [productId]);
  const ratings = res.rows.map((r) => Number(r.rating));
  const reviewCount = ratings.length;
  const average = reviewCount > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / reviewCount) * 10) / 10 : 0;

  const db = await loadDatabase();
  const idx = db.products.findIndex((p) => p.id === productId);
  if (idx === -1) return;
  db.products[idx] = { ...db.products[idx], rating: average, reviewCount };
  await saveDatabase(db);
}

/**
 * The review's media list, with the legacy single photo folded in.
 *
 * Reviews written before multi-media support stored one image in photo_url
 * and nothing in media. Rather than backfilling (which would have to invent a
 * Cloudinary public_id that was never recorded), that image is surfaced here
 * as the first entry with no publicId — so every renderer can just read
 * `media` and old reviews keep showing their photo. photo_url itself is never
 * written again.
 */
function buildReviewMedia(row: any): ReviewMedia[] {
  const stored: ReviewMedia[] = Array.isArray(row.media) ? row.media : [];
  if (!row.photo_url) return stored;
  // Guard against double-rendering if a legacy photo was ever also copied
  // into media by hand.
  if (stored.some((m) => m.url === row.photo_url)) return stored;
  return [{ type: 'image', url: row.photo_url }, ...stored];
}

/** "Priya Sharma" -> "Priya S." for public listings, so storefront visitors
 * never receive a reviewer's full surname. */
export function publicReviewerName(name: unknown): string {
  const [first = '', ...rest] = String(name || '').trim().split(/\s+/);
  const last = rest.pop();
  return last ? `${first} ${last[0].toUpperCase()}.` : first || 'Glamirk customer';
}

export function mapReviewRow(row: any, productName?: string): Review {
  const media = buildReviewMedia(row);
  return {
    id: row.id,
    productId: row.product_id,
    productName: productName || '',
    rating: Number(row.rating),
    customerName: row.customer_name,
    date: new Date(row.created_at).toISOString(),
    title: row.title || '',
    comment: row.comment,
    isVerifiedPurchase: row.is_verified_purchase,
    photoUrl: row.photo_url || undefined,
    media,
    status: row.status,
    moderationNote: row.moderation_note || undefined,
    shadeName: row.shade_name || undefined,
    skinTone: row.skin_tone || undefined,
    undertone: row.undertone || undefined,
    helpfulCount: row.helpful_count !== undefined ? Number(row.helpful_count) : undefined,
  };
}

/** Tells the author their review went live or was turned down. In-app only,
 * written straight to the bell's table: it is not an order event, so the
 * order-keyed notification outbox does not fit. Best-effort, like every
 * notification — moderation must not fail because of it. */
export async function notifyReviewModerated(
  customerId: string,
  productName: string,
  status: 'approved' | 'rejected',
  note: string | null
): Promise<void> {
  const title = status === 'approved' ? 'Your review is live' : 'Your review was not published';
  const body =
    status === 'approved'
      ? `Thank you! Your review of ${productName} is now visible to other shoppers.`
      : `Your review of ${productName} wasn't published${note ? `: ${note}` : '.'} You can edit it and submit again from My Reviews.`;
  try {
    const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const inserted = await pool.query(
      `INSERT INTO notifications (id, user_id, type, title, body) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, customerId, status === 'approved' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED', title, body]
    );
    broadcastEvent('NEW_NOTIFICATION', 'customer', { userId: customerId, notification: mapNotificationRow(inserted.rows[0]) });
  } catch (err) {
    console.error('[reviews] could not notify review author:', err);
  }
}

/** `SELECT r.*` plus its helpful-vote count, for any public listing. */
export const REVIEW_WITH_HELPFUL_SQL = `SELECT r.*,
  (SELECT COUNT(*) FROM review_helpful_votes v WHERE v.review_id = r.id)::int AS helpful_count
  FROM reviews r`;
