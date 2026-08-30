import { pool, loadDatabase, saveDatabase } from './db';
import { Review } from '../src/types';

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
export async function recomputeProductRating(productId: string): Promise<void> {
  const res = await pool.query('SELECT rating FROM reviews WHERE product_id = $1', [productId]);
  const ratings = res.rows.map((r) => Number(r.rating));
  const reviewCount = ratings.length;
  const average = reviewCount > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / reviewCount) * 10) / 10 : 0;

  const db = await loadDatabase();
  const idx = db.products.findIndex((p) => p.id === productId);
  if (idx === -1) return;
  db.products[idx] = { ...db.products[idx], rating: average, reviewCount };
  await saveDatabase(db);
}

export function mapReviewRow(row: any, productName?: string): Review {
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
  };
}
