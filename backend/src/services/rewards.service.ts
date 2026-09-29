import { pool, loadDatabase, evaluateOffers } from '../db/db';
import {
  AccountCoupon,
  LoyaltyTier,
  RewardTransaction,
  RewardsSummary,
} from '@glamirk/shared/types';

// ==========================================
// GLAM REWARDS
//
// The balance is never a stored, mutable number — it is always SUM(points)
// over reward_transactions. Every credit carries a `reference` that is UNIQUE
// per (user, type), so replaying the same event (a double-clicked review, an
// order status re-applied by an admin) can only ever insert the row once.
// ==========================================

export const SIGNUP_BONUS_POINTS = 100;
export const REVIEW_POINTS = 50;
/** ₹100 spent = 10 points, i.e. one point per ₹10 of a delivered order. */
export const POINTS_PER_RUPEE = 0.1;

const TIER_THRESHOLDS: { tier: LoyaltyTier; minSpend: number }[] = [
  { tier: 'PRIVÉ', minSpend: 25000 },
  { tier: 'SIGNATURE', minSpend: 5000 },
  { tier: 'MEMBER', minSpend: 0 },
];

function resolveTier(lifetimeSpend: number): { tier: LoyaltyTier; nextTierThreshold: number } {
  const tier = TIER_THRESHOLDS.find((t) => lifetimeSpend >= t.minSpend)!.tier;
  // Already at the top tier — there's no further threshold to chase, so the
  // "next" one is reported as the tier's own floor and pointsToNextTier is 0.
  if (tier === 'PRIVÉ') return { tier, nextTierThreshold: 25000 };
  const next = tier === 'MEMBER' ? 5000 : 25000;
  return { tier, nextTierThreshold: next };
}

async function insertRewardTransaction(params: {
  userId: string;
  points: number;
  type: RewardTransaction['type'];
  description: string;
  orderId?: string | null;
  reference: string;
}): Promise<void> {
  const id = 'rwd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    `INSERT INTO reward_transactions (id, user_id, points, type, description, order_id, reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, type, reference) DO NOTHING`,
    [id, params.userId, Math.round(params.points), params.type, params.description, params.orderId || null, params.reference]
  );
}

export async function grantSignupBonus(userId: string): Promise<void> {
  await insertRewardTransaction({
    userId,
    points: SIGNUP_BONUS_POINTS,
    type: 'SIGNUP',
    description: 'Welcome to Glamirk — account created',
    reference: 'signup',
  });
}

/** Credited when an order actually reaches DELIVERED, not when it is placed —
 * so points can't be farmed by placing and cancelling orders. */
export async function grantOrderPoints(userId: string, orderId: string, orderNumber: string, total: number): Promise<void> {
  const points = Math.floor(Number(total) * POINTS_PER_RUPEE);
  if (points <= 0) return;
  await insertRewardTransaction({
    userId,
    points,
    type: 'ORDER',
    description: `Order #${orderNumber} delivered`,
    orderId,
    reference: orderId,
  });
}

export async function grantReviewPoints(userId: string, productId: string, productName: string): Promise<void> {
  await insertRewardTransaction({
    userId,
    points: REVIEW_POINTS,
    type: 'REVIEW',
    description: `Verified review on ${productName}`,
    reference: `review:${productId}`,
  });
}

function mapRewardRow(row: any): RewardTransaction {
  return {
    id: row.id,
    points: Number(row.points),
    type: row.type,
    description: row.description,
    orderId: row.order_id || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getRewardsSummary(userId: string): Promise<RewardsSummary> {
  const [txRes, spendRes] = await Promise.all([
    pool.query('SELECT * FROM reward_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]),
    // Lifetime spend counts delivered orders only — the same bar points use,
    // so a customer's tier can never be inflated by orders that were
    // cancelled or never arrived.
    pool.query(`SELECT COALESCE(SUM(total), 0) AS spend FROM orders WHERE user_id = $1 AND status = 'DELIVERED'`, [userId]),
  ]);

  const transactions = txRes.rows.map(mapRewardRow);
  const points = transactions.reduce((sum, t) => sum + t.points, 0);
  const lifetimeSpend = Math.round(Number(spendRes.rows[0]?.spend) || 0);
  const { tier, nextTierThreshold } = resolveTier(lifetimeSpend);

  return {
    points,
    tier,
    lifetimeSpend,
    nextTierThreshold,
    pointsToNextTier: Math.max(0, nextTierThreshold - lifetimeSpend),
  transactions,
  };
}

/** Balance only — used by the dashboard summary, which doesn't need the ledger. */
export async function getRewardPoints(userId: string): Promise<number> {
  const res = await pool.query('SELECT COALESCE(SUM(points), 0) AS points FROM reward_transactions WHERE user_id = $1', [userId]);
  return Number(res.rows[0]?.points) || 0;
}

// ==========================================
// COUPONS
// ==========================================

export async function recordCouponRedemption(
  userId: string,
  couponCode: string,
  orderId: string,
  discount: number
): Promise<void> {
  const id = 'cpr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    'INSERT INTO coupon_redemptions (id, user_id, coupon_code, order_id, discount) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, couponCode, orderId, discount]
  );
}

/** Every coupon code the store has published, bucketed for this customer.
 * Discount values here are for display only — checkout always recomputes the
 * discount server-side from the live offer list (computeCouponDiscount in
 * commerce.ts), so nothing returned by this endpoint can be used to claim a
 * larger discount than the offer actually grants. */
export async function getAccountCoupons(userId: string): Promise<AccountCoupon[]> {
  const db = await loadDatabase();
  const offers = evaluateOffers(db.offers || []).filter((o) => o.couponCode && o.status !== 'draft' && o.status !== 'archived');

  const redemptionsRes = await pool.query(
    'SELECT coupon_code, order_id, redeemed_at FROM coupon_redemptions WHERE user_id = $1 ORDER BY redeemed_at DESC',
    [userId]
  );
  const redemptionByCode = new Map<string, { orderId: string | null; redeemedAt: string }>();
  for (const row of redemptionsRes.rows) {
    const key = String(row.coupon_code).toUpperCase();
    if (!redemptionByCode.has(key)) {
      redemptionByCode.set(key, { orderId: row.order_id, redeemedAt: new Date(row.redeemed_at).toISOString() });
    }
  }

  return offers.map((offer) => {
    const code = offer.couponCode!;
    const redemption = redemptionByCode.get(code.toUpperCase());

    let availability: AccountCoupon['availability'] = 'available';
    let ineligibleReason: string | undefined;

    if (redemption) {
      availability = 'used';
    } else if (offer.status === 'expired') {
      availability = 'expired';
    } else if (offer.status === 'scheduled') {
      availability = 'ineligible';
      ineligibleReason = offer.startDate
        ? `Starts ${new Date(offer.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : 'Not available yet';
    } else if (offer.status !== 'active') {
      availability = 'ineligible';
      ineligibleReason = 'Currently unavailable';
    }

    return {
      code,
      title: offer.publicTitle || offer.name,
      description: offer.description || '',
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      minOrderValue: offer.minOrderValue || undefined,
      tag: offer.tag,
      notificationSettings: offer.notificationSettings,
      availability,
      startDate: offer.startDate,
      endDate: offer.endDate,
      usedOn: redemption?.redeemedAt,
      usedOrderId: redemption?.orderId || undefined,
      ineligibleReason,
    };
  });
}

export async function countAvailableCoupons(userId: string): Promise<number> {
  const coupons = await getAccountCoupons(userId);
  return coupons.filter((c) => c.availability === 'available').length;
}
