import express, { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getMailTransporter } from '../services/mailer';
import { pool, loadDatabase, saveDatabase, withStockLock, evaluateOffers, InternalCMSDatabaseSchema } from '../db/db';
import { requireCustomer, AuthenticatedCustomerRequest } from '../middleware/requireCustomer';
import { rateLimit } from '../middleware/rateLimit';
import { signCustomerToken, bumpTokenVersion, invalidateAccountCache } from '../auth/tokens';
import { createSession, deleteSession, deleteAllSessions } from '../auth/sessions';
import { clientIp } from '../utils/request';
// Sellability, price and stock are all resolved by the shared helpers so the
// storefront, the admin and this server answer "what does this cost, how many
// are there, can it be bought" identically.
import {
  hasSellableStock,
  isProductSellable,
  isShadeSelectable,
  getActiveSizeOptions,
  getCurrentPrice as resolveCurrentPrice,
  getCurrentStock as resolveCurrentStock,
  resolveVariantThumbnail,
} from '@glamirk/shared/utils/productVariant';
import {
  normalizePhone,
  maskPhone,
  legacyPhoneSuffix,
  DEFAULT_COUNTRY_CODE,
  SUPPORTED_COUNTRY_CODES,
} from '../utils/phone';
import { issueOtp, verifyOtp, otpPolicy } from '../services/otp.service';
import { channelConfigured, OtpChannel, firebaseOtpSelected } from '../services/messaging.service';
import { verifyFirebasePhoneToken } from '../services/firebaseAuth.service';
import { grantSignupBonus, grantReviewPoints, recordCouponRedemption } from '../services/rewards.service';
import { channelConfigured, OtpChannel } from '../services/messaging.service';
import { grantSignupBonus, recordCouponRedemption } from '../services/rewards.service';
import { resolveAvailableStock } from '../services/inventory.service';
import {
  getPaymentGateway,
  onlinePaymentsAvailable,
  publishableKeyId,
  verifyPaymentSignature,
  toMinorUnits,
  fromMinorUnits,
} from '../services/payment.service';
import {
  markOrderPaid,
  markOrderPaymentFailed,
  restoreOrderStock,
  createShipmentForOrder,
  cancelShipmentForOrder,
  refundOrderPayment,
  shipmentsEnabled,
} from '../services/fulfillment.service';
import {
  Product,
  Shade,
  ServerCartItem,
  Order,
  OrderItem,
  PaymentDetails,
  CODRules,
  DEFAULT_PROMO_NOTIFICATION_MESSAGES,
  applyPromoMessageTemplate,
  ReviewMedia,
  REVIEW_MEDIA_MAX_ITEMS,
  OrderStatus,
} from '@glamirk/shared/types';

/**
 * What the browser needs to open the gateway's hosted checkout.
 *
 * Carries the publishable key id and the gateway's own order handle — never
 * the key secret, and never an amount the client could alter and have
 * honoured: the gateway enforces the amount it was given at order creation.
 */
interface CheckoutPaymentHandoff {
  provider: string;
  gatewayOrderId: string;
  keyId: string | null;
  amountMinor: number;
  currency: string;
  /** True when the mock adapter is in force, so a dev build can skip the real
   * Razorpay script instead of failing to load it. */
  isMock: boolean;
}
import {
  CANCELLABLE_STATUSES,
  buildOrderFromRow,
  buildOrdersFromRows,
  insertOrderStatusHistory,
  mapReturnRequestRow,
} from '../services/orders.service';
import {
  isVerifiedPurchase,
  mapReviewRow,
  pickReviewDetails,
  recomputeProductRating,
  destroyReviewMedia,
  orphanedReviewMedia,
} from '../services/reviews.service';
// mapNotificationRow stays: the customer notification list endpoint reads
// rows the engine writes, through the same shared mapper.
import { mapNotificationRow, notifyAdminReviewSubmitted } from '../services/notifications.service';
import { notifyOrderStatus } from '../services/orderNotifications.service';
import { enqueueNotification } from '../services/notificationEngine.service';
import '../services/notificationChannels.service';
import { sendAdminNewOrderEmail } from '../services/email.service';

const router = express.Router();

// Null when SMTP isn't configured, in which case callers fall back to their
// own dev-mode behavior instead of trying to send mail. Shared with
// email.service.ts so there is a single gate on opening an SMTP connection —
// see mailer.ts.

// ==========================================
// CUSTOMER AUTH
//
// Identity is resolved by middleware/requireCustomer, tokens are minted by
// auth/tokens and devices tracked by auth/sessions — one implementation
// shared with the account router, so the two can never drift.
// ==========================================

// Credential endpoints are the ones worth throttling: everything else behind
// requireCustomer already needs a valid token to reach.
const loginLimiter = rateLimit({
  scope: 'customer-login',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});
const registerLimiter = rateLimit({ scope: 'customer-register', windowMs: 60 * 60 * 1000, max: 10 });
const resetLimiter = rateLimit({
  scope: 'customer-reset',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Please try again later.',
});

/** Shape handed back to the client on every successful authentication. */
function toSessionUser(row: any) {
  return {
    id: row.id,
    name: row.name,
    // Absent on mobile + OTP accounts that haven't added one.
    email: row.email || undefined,
    phone: row.phone || undefined,
    createdAt: row.created_at,
    avatarUrl: row.avatar_url || undefined,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
  };
}

// Phone numbers are stored as entered (e.g. "+91 9876543210") but people sign
// in with whatever they remember typing, so both sides are reduced to digits
// and compared on the last 10 — the significant part of an Indian mobile
// number regardless of country-code formatting.
function phoneDigits(value: string): string {
  return String(value).replace(/\D/g, '');
}

function looksLikePhone(identifier: string): boolean {
  return !identifier.includes('@') && phoneDigits(identifier).length >= 6;
}

async function findCustomerByIdentifier(identifier: string): Promise<any | null> {
  const trimmed = String(identifier).trim();
  if (!trimmed) return null;

  if (!looksLikePhone(trimmed)) {
    const byEmail = await pool.query('SELECT * FROM customers WHERE email = $1', [trimmed.toLowerCase()]);
    return byEmail.rows[0] || null;
  }

  const digits = phoneDigits(trimmed);
  const suffix = digits.slice(-10);
  const byPhone = await pool.query(
    `SELECT * FROM customers
     WHERE phone IS NOT NULL
       AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
     ORDER BY created_at ASC`,
    [suffix]
  );
  // A number shared across two accounts is ambiguous — refuse rather than
  // silently signing someone into whichever row happened to come first.
  if (byPhone.rows.length > 1) return null;
  return byPhone.rows[0] || null;
}

router.post('/auth/register', registerLimiter, async (req: Request, res: Response) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await pool.query('SELECT id, deleted_at FROM customers WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
  }

  const id = 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
  const trimmedName = String(name).trim();
  const [firstName, ...restName] = trimmedName.split(/\s+/);

  await pool.query(
    'INSERT INTO customers (id, name, first_name, last_name, email, phone, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, trimmedName, firstName || trimmedName, restName.join(' ') || null, normalizedEmail, phone || null, passwordHash]
  );

  await grantSignupBonus(id);

  const sessionId = await createSession(id, req);
  const token = signCustomerToken(id, normalizedEmail, 0, sessionId);
  const created = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
  res.json({ token, user: toSessionUser(created.rows[0]) });
});

router.post('/auth/login', loginLimiter, async (req: Request, res: Response) => {
  // `identifier` is the new field (email OR mobile); `email` is still accepted
  // so any existing client keeps working unchanged.
  const { email, identifier, password } = req.body || {};
  const rawIdentifier = String(identifier || email || '').trim();
  if (!rawIdentifier || !password) {
    return res.status(400).json({ error: 'Email or mobile number and password are required.' });
  }

  const row = await findCustomerByIdentifier(rawIdentifier);
  // One message for "no such account" and "wrong password" alike, so this
  // endpoint can't be used to enumerate which emails are registered.
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials. Please check your details and try again.' });
  }
  if (row.deleted_at) {
    return res.status(403).json({ error: 'This account has been closed. Please contact support if this is unexpected.' });
  }

  const sessionId = await createSession(row.id, req);
  const token = signCustomerToken(row.id, row.email, Number(row.token_version) || 0, sessionId);
  res.json({ token, user: toSessionUser(row) });
});

// Ends the current device's session. The token is also invalidated whenever
// the account's token_version moves (see /account/settings/logout-all) — this
// endpoint only retires the one device the request came from.
router.post('/auth/logout', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  if (req.customer!.sessionId) {
    await deleteSession(req.customer!.id, req.customer!.sessionId);
  }
  res.json({ success: true });
});

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

router.post('/auth/forgot-password', resetLimiter, async (req: Request, res: Response) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const result = await pool.query('SELECT id, deleted_at FROM customers WHERE email = $1', [normalizedEmail]);
  const row = result.rows[0];
  if (!row || row.deleted_at) {
    return res.status(404).json({ error: 'No account found with that email address.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await pool.query('UPDATE customers SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [
    token,
    expiry,
    row.id,
  ]);

  const transporter = getMailTransporter();
  if (!transporter) {
    // No SMTP configured — return the token directly so the client-side flow
    // still works end-to-end without email delivery.
    return res.json({ success: true, resetToken: token, expiresInMinutes: 15 });
  }

  const configuredAppUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null;
  const appUrl = configuredAppUrl || `${req.protocol}://${req.get('host')}`;
  const resetLink = `${appUrl}/?resetToken=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Glamirk Beauty <no-reply@glamirk.com>',
      to: normalizedEmail,
      subject: 'Reset your Glamirk password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#121212;">Reset your password</h2>
          <p style="color:#6B6B6B;">We received a request to reset your Glamirk Beauty account password. This link expires in 15 minutes.</p>
          <p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#C9972B;color:#0B0B0B;text-decoration:none;font-weight:bold;border-radius:8px;">Reset Password</a></p>
          <p style="color:#6B6B6B;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    res.json({ success: true, expiresInMinutes: 15 });
  } catch (err) {
    console.error('Failed to send reset email:', err);
    // Email failed to send (bad credentials, provider down, etc.) — still let
    // the user finish the flow instead of leaving them stuck.
    res.json({ success: true, resetToken: token, expiresInMinutes: 15 });
  }
});

router.post('/auth/reset-password', resetLimiter, async (req: Request, res: Response) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const result = await pool.query(
    'SELECT id, reset_token_expiry FROM customers WHERE reset_token = $1',
    [token]
  );
  const row = result.rows[0];
  if (!row || !row.reset_token_expiry || new Date(row.reset_token_expiry).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
  await pool.query(
    'UPDATE customers SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
    [passwordHash, row.id]
  );

  // Whoever requested this reset may not be the person whose old sessions are
  // still live — resetting a password must therefore kill every existing
  // token, not just issue an additional one alongside them.
  const tokenVersion = await bumpTokenVersion(row.id);
  await deleteAllSessions(row.id);

  // Sign the user straight back in — a freshly reset password shouldn't
  // require immediately typing it again on a second screen.
  const updated = await pool.query('SELECT * FROM customers WHERE id = $1', [row.id]);
  const user = updated.rows[0];
  const sessionId = await createSession(user.id, req);
  const jwtToken = signCustomerToken(user.id, user.email, tokenVersion, sessionId);

  res.json({ success: true, token: jwtToken, user: toSessionUser(user) });
});

// ==========================================
// MOBILE + OTP SIGN-IN
//
// The primary way customers sign in. Two steps, both stateless from the
// client's point of view: request a code for a number, then present that
// number and the code back. Nothing about validity is decided on the client —
// see services/otp.service.ts, which owns expiry, single-use, the attempt cap
// and the throttles.
//
// This shares the customer session machinery with every other sign-in path
// above (signCustomerToken + createSession), so an OTP session is the same
// kind of session as a password one and revocation works identically. It has
// no bearing whatsoever on admin authentication, which lives in
// admin.routes.ts against a different user store and a different role claim.
// ==========================================

/** Digits in the code. Mirrored to the client so the OTP boxes and the
 * server agree without either hard-coding it twice. */
const OTP_LENGTH = 6;

// Per-IP burst guards, sitting in front of the fine-grained per-number limits
// in the OTP service. Two layers on purpose: the per-number quota stops one
// number being hammered, and these stop one machine walking through many
// numbers.
//
// Configurable rather than literals because the right ceiling depends on the
// deployment — a store behind a corporate proxy or a mobile carrier NAT sees
// far more legitimate traffic from a single address than one behind a CDN.
// Generous by default: the per-number quota is the real defence here, and an
// IP limit tight enough to matter on its own would also lock out a shared
// office or a college hostel.
const IP_BURST_WINDOW_MS = Number(process.env.OTP_IP_BURST_WINDOW_MINUTES || 15) * 60 * 1000;

const otpRequestLimiter = rateLimit({
  scope: 'customer-otp-request',
  windowMs: IP_BURST_WINDOW_MS,
  max: Number(process.env.OTP_REQUEST_BURST_PER_IP || 30),
  message: 'Too many OTP requests. Please wait a few minutes and try again.',
});
const otpVerifyLimiter = rateLimit({
  scope: 'customer-otp-verify',
  windowMs: IP_BURST_WINDOW_MS,
  max: Number(process.env.OTP_VERIFY_BURST_PER_IP || 50),
  message: 'Too many verification attempts. Please wait a few minutes and try again.',
});

/** Lets the sign-in screen offer only channels that can actually deliver,
 * rather than showing WhatsApp and failing after the customer picks it. */
router.get('/auth/otp/channels', async (_req: Request, res: Response) => {
  res.json({
    sms: channelConfigured('sms'),
    // Always false: WhatsApp carries order updates, never sign-in codes. The
    // field stays so the sign-in screen's existing check keeps working.
    whatsapp: false,
    countryCodes: SUPPORTED_COUNTRY_CODES,
    otpLength: OTP_LENGTH,
    expiresInSeconds: otpPolicy.expirySeconds,
    resendCooldownSeconds: otpPolicy.resendCooldownSeconds,
  });
});

router.post('/auth/otp/request', otpRequestLimiter, async (req: Request, res: Response) => {
  const { phone, countryCode, method } = req.body || {};

  const normalized = normalizePhone(phone, countryCode || DEFAULT_COUNTRY_CODE);
  if (!normalized) {
    return res.status(400).json({ error: 'Please enter a valid mobile number.' });
  }

  // The country the number actually resolved to must be one this store
  // serves. normalizePhone has a generic branch for dial codes it does not
  // know in detail, so without this a client could ask for a code to any
  // country simply by sending a different countryCode — the sign-in screen
  // only offers +91, but nothing stops a direct POST.
  //
  // Checked against the resolved value rather than the submitted one, so a
  // mismatched pair cannot slip through either. The same guard already
  // protects /auth/otp/firebase/verify.
  if (!SUPPORTED_COUNTRY_CODES.includes(normalized.countryCode as any)) {
    return res.status(400).json({ error: 'This mobile number is not supported.' });
  }

  // SMS is the only OTP channel. A client asking for anything else — a stale
  // bundle offering the old WhatsApp option — gets SMS rather than an error,
  // because the channel it asked for no longer exists on any code path.
  const deliveryMethod: OtpChannel = 'sms';

  const result = await issueOtp({
    phoneE164: normalized.e164,
    method: deliveryMethod,
    ip: clientIp(req),
  });

  if (result.status !== 'sent') {
    switch (result.status) {
      case 'cooldown':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        return res.status(429).json({
          error: `Please wait ${result.retryAfterSeconds} second${result.retryAfterSeconds === 1 ? '' : 's'} before requesting another OTP.`,
          retryAfterSeconds: result.retryAfterSeconds,
        });
      case 'daily_quota':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        // Says what happened and nothing about how it is counted, which
        // number it applies to, or whether that number has an account.
        return res.status(429).json({
          error: 'Daily OTP limit reached. Please try again later.',
          retryAfterSeconds: result.retryAfterSeconds,
          dailyLimitReached: true,
        });
      case 'ip_quota':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        return res.status(429).json({
          error: 'Too many OTP requests from this device. Please try again in a little while.',
          retryAfterSeconds: result.retryAfterSeconds,
        });
      case 'provider_is_client_side':
        // Firebase mode. 409 rather than 503: nothing is broken or missing —
        // the client is calling an endpoint this deployment does not use, and
        // the fix is to call the Firebase route instead. Flagged explicitly so
        // a stale frontend bundle fails loudly rather than appearing to send.
        return res.status(409).json({
          error: 'OTP sign-in is handled by the app on this device. Please reload the page and try again.',
          method: deliveryMethod,
          clientSideProvider: 'firebase',
        });
      case 'channel_unconfigured':
        // Deliberately switched off or never credentialled — not a blip. The
        // wording must not invite a retry that is guaranteed to fail the same
        // way; "try again" belongs to delivery_failed below, and telling a
        // customer to keep retrying something permanently unavailable is how
        // a support queue fills up with tickets nobody can action.
        //
        // Says nothing about the phone number, so it cannot be used to probe
        // which numbers are registered.
        return res.status(503).json({
          error: 'OTP sign-in is currently unavailable. Please try again later or contact support.',
          method: deliveryMethod,
          channelAvailable: false,
        });
      case 'delivery_failed':
        // Credentials exist and the provider was reached but refused or timed
        // out. Transient as far as the customer is concerned, so this one DOES
        // ask them to try again. Never reported as a success.
        return res.status(503).json({
          error: "We couldn't send the OTP right now. Please try again.",
          method: deliveryMethod,
          channelAvailable: true,
        });
    }
  }

  // Deliberately no indication of whether this number has an account: the
  // response is byte-for-byte the same shape for sign-up and sign-in, and the
  // status code is the same too, so this endpoint cannot be used to test
  // which numbers are registered.
  res.json({
    success: true,
    challengeId: result.challengeId,
    method: deliveryMethod,
    maskedPhone: maskPhone(normalized.e164),
    // Absolute instants, so the client's countdown survives a page refresh
    // and can never drift away from what the backend will enforce.
    expiresAt: result.expiresAt.toISOString(),
    resendAvailableAt: result.resendAvailableAt.toISOString(),
    otpLength: OTP_LENGTH,
  });
});

/**
 * Finds the account a verified number belongs to.
 *
 * Two lookups, because phone_e164 only exists from migration 008 onward:
 * the canonical column first, then the last-10-digits match against the
 * free-text `phone` column that the password login has always used. The
 * second is what keeps a customer who registered before this feature — with
 * their orders, cart, wishlist and addresses — signing into the account they
 * already have instead of getting a fresh empty one.
 */
async function findCustomerByVerifiedPhone(e164: string): Promise<any | null> {
  const exact = await pool.query('SELECT * FROM customers WHERE phone_e164 = $1 AND deleted_at IS NULL', [e164]);
  if (exact.rows[0]) return exact.rows[0];

  const legacy = await pool.query(
    `SELECT * FROM customers
      WHERE deleted_at IS NULL
        AND phone_e164 IS NULL
        AND phone IS NOT NULL
        AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
      ORDER BY created_at ASC`,
    [legacyPhoneSuffix(e164)]
  );
  // The password login refuses when two accounts share a number, because a
  // password alone can't say which person is at the keyboard. Here the OTP
  // has already proved control of the number, so refusing would only lock out
  // someone who demonstrably owns it — the oldest account wins, and the
  // choice is at least deterministic rather than whichever row sorted first.
  return legacy.rows[0] || null;
}

/**
 * Turns a PROVED phone number into a signed-in session.
 *
 * The caller owns the proof — a verified OTP challenge, or a Firebase ID token
 * whose signature checked out — and everything after that point is identical,
 * so it lives here once. A session is therefore indistinguishable downstream
 * whichever route minted it: same account resolution, same signup bonus, same
 * token_version and revocation behaviour, same /auth/me.
 *
 * This deliberately performs NO verification of its own. Passing a number that
 * was not proved would sign someone into that account, so the only callers may
 * be routes that have just established control of it.
 */
async function establishPhoneSession(
  verifiedE164: string,
  req: Request
): Promise<{ token: string; user: any; isNewAccount: boolean }> {
  const parsedVerified = normalizePhone(verifiedE164);
  // Display form for the free-text `phone` column the profile screen shows.
  const displayPhone = parsedVerified
    ? `${parsedVerified.countryCode} ${parsedVerified.national}`
    : verifiedE164;

  let row = await findCustomerByVerifiedPhone(verifiedE164);
  // Not const: losing the create race below means this sign-in did not create
  // the account after all, and the response must not claim it did.
  let isNewAccount = !row;

  if (row) {
    // Pin the canonical number to the row the first time this account signs
    // in by phone, so later sign-ins take the indexed exact-match path.
    // Guarded on IS NULL and tolerant of the unique index rejecting it: if
    // another row claimed the number in between, the sign-in still succeeds
    // against the account we already resolved.
    if (!row.phone_e164) {
      try {
        await pool.query('UPDATE customers SET phone_e164 = $1 WHERE id = $2 AND phone_e164 IS NULL', [
          verifiedE164,
          row.id,
        ]);
      } catch (err) {
        console.error('Could not claim phone_e164 for existing customer:', (err as Error).message);
      }
    }
    // The number has just been proved, and `phone` may be empty on an account
    // that registered by email alone.
    await pool.query(
      'UPDATE customers SET phone_verified = true, phone = COALESCE(phone, $1) WHERE id = $2',
      [displayPhone, row.id]
    );
  } else {
    const id = 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    // password_hash is NOT NULL and this account has no password — a random,
    // never-shared hash satisfies the column without creating a credential
    // anyone could guess.
    const passwordHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), bcrypt.genSaltSync(10));
    // No name is collected during phone sign-in; the customer sets a real one
    // in their profile. email stays NULL rather than being faked, so order
    // mail is never addressed to an invented address.
    const placeholderName = 'Glamirk Customer';

    // Two requests carrying the same proven number can be in flight at once —
    // a double tap on verify, or a client retrying a slow request. Both find
    // no account and both try to create one.
    //
    // The unique index on phone_e164 means the database will never store two
    // rows, but an unguarded INSERT turns that protection into a 500 for
    // whichever request loses: a customer who proved their number and got an
    // error page. Letting the loser fall through to the existing row makes the
    // retry succeed, which is what makes this endpoint safe to retry at all.
    //
    // Caught by error code rather than ON CONFLICT because the index is
    // PARTIAL (phone_e164 IS NOT NULL AND deleted_at IS NULL). Inferring it
    // would mean repeating that predicate here, which silently stops matching
    // the day the index changes; the error code does not.
    let created: any = null;
    try {
      const res = await pool.query(
        `INSERT INTO customers (id, name, first_name, phone, phone_e164, phone_verified, password_hash)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         RETURNING *`,
        [id, placeholderName, placeholderName, displayPhone, verifiedE164, passwordHash]
      );
      created = res.rows[0];
    } catch (err) {
      // Only the phone race. A unique violation on anything else is a real
      // defect and must not be swallowed into a successful sign-in.
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code !== '23505' || !String(pgErr.constraint || '').includes('phone_e164')) throw err;
    }

    if (created) {
      // We created it, so we own the bonus. grantSignupBonus is idempotent per
      // customer anyway (ON CONFLICT on user_id/type/reference), so the loser
      // skipping it is belt and braces rather than the only protection.
      await grantSignupBonus(id);
      row = created;
    } else {
      // Lost the race. The winner's row is there now; resolve it exactly as
      // the lookup above would have, and sign in against it.
      row = await findCustomerByVerifiedPhone(verifiedE164);
      if (!row) {
        // Conflicted on phone_e164 yet not findable by it — not reachable
        // through this path, but failing loudly beats minting a session for an
        // account we could not identify.
        throw new Error('phone_e164 conflicted but the owning account could not be resolved');
      }
      isNewAccount = false;
    }
  }

  // Re-read so the session reflects the updates just applied — including the
  // signup bonus, which writes to the row through its own query.
  const fresh = await pool.query('SELECT * FROM customers WHERE id = $1', [row.id]);
  row = fresh.rows[0];

  const sessionId = await createSession(row.id, req);
  const token = signCustomerToken(row.id, row.email, Number(row.token_version) || 0, sessionId);
  return { token, user: toSessionUser(row), isNewAccount };
}

router.post('/auth/otp/verify', otpVerifyLimiter, async (req: Request, res: Response) => {
  const { challengeId, code } = req.body || {};

  // Firebase mode: there is no challenge on this side to verify against, so
  // refuse before touching the database. Without this the lookup would simply
  // miss and report "no longer valid", which reads like an expired code and
  // would send a developer hunting the wrong bug.
  if (firebaseOtpSelected()) {
    return res.status(409).json({
      error: 'OTP sign-in is handled by the app on this device. Please reload the page and try again.',
      clientSideProvider: 'firebase',
    });
  }

  if (!challengeId) {
    return res.status(400).json({ error: 'This sign-in attempt has expired. Please request a new OTP.', mustResend: true });
  }
  if (!code) {
    return res.status(400).json({ error: 'Please enter the OTP.' });
  }

  // Only the challenge and the typed code are accepted. The phone number and
  // the delivery channel come back out of verifyOtp, read from the stored
  // row — a client cannot nominate which account it is signing into, nor
  // claim a channel it never received on.
  const verification = await verifyOtp(String(challengeId), code);
  if (verification.status !== 'verified') {
    switch (verification.status) {
      case 'expired':
        return res.status(400).json({ error: 'This OTP has expired. Please request a new OTP.', expired: true });
      case 'too_many_attempts':
        return res
          .status(429)
          .json({ error: 'Too many incorrect attempts. Please request a new OTP.', mustResend: true });
      case 'no_active_code':
        return res
          .status(400)
          .json({ error: 'This OTP is no longer valid. Please request a new OTP.', mustResend: true });
      case 'incorrect':
        return res.status(401).json({
          error: 'Incorrect OTP. Please try again.',
          attemptsRemaining: verification.attemptsRemaining,
        });
    }
  }

  // Keys off the number stored with the challenge, which is the one the code
  // was actually delivered to — never anything the client sent.
  const { token, user, isNewAccount } = await establishPhoneSession(verification.phoneE164, req);
  res.json({ token, user, isNewAccount });
});

// ==========================================
// FIREBASE PHONE AUTH — SESSION EXCHANGE
//
// The alternative sign-in for accounts without DLT registration. Google sends
// the SMS and checks the code; the browser then hands us the resulting ID
// token and this route decides whether it is proof of a verified number.
//
// It issues nothing of its own: once the phone is established it runs the SAME
// account lookup, bonus grant, session and JWT logic the OTP route above uses,
// so a Firebase session is indistinguishable from an OTP one everywhere
// downstream — same revocation, same token_version, same /auth/me.
//
// Shares otpVerifyLimiter with the OTP route on purpose: the per-number quota
// lives in customer_otp_codes and does not apply here (Google owns the sends),
// so the per-IP ceiling is the one throttle this path still has.
// ==========================================
router.post('/auth/otp/firebase/verify', otpVerifyLimiter, async (req: Request, res: Response) => {
  if (!firebaseOtpSelected()) {
    return res.status(409).json({ error: 'Firebase sign-in is not enabled on this deployment.' });
  }

  const { idToken, phone, countryCode } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ error: 'Verification failed. Please try again.' });
  }

  const verification = await verifyFirebasePhoneToken(idToken);
  if (verification.status !== 'verified') {
    // One wording for every rejection reason. The distinctions matter to the
    // operator in the log, not to the customer, and spelling them out would
    // tell an attacker which of their forgeries got closest.
    if (verification.status !== 'no_phone') {
      console.error(`[firebase-auth] rejected (${verification.status})`);
    } else {
      console.error('[firebase-auth] rejected: token carried no phone_number');
    }
    const status = verification.status === 'unconfigured' ? 503 : 401;
    return res.status(status).json({ error: 'Verification failed. Please request a new code.' });
  }

  // Identity comes ONLY from the signed token. Re-validated through the same
  // normaliser the OTP path uses, so an unsupported country cannot enter here
  // by a side door even though Firebase was asked to restrict to India.
  const normalized = normalizePhone(verification.phoneRaw);
  if (!normalized || !SUPPORTED_COUNTRY_CODES.includes(normalized.countryCode as any)) {
    console.error('[firebase-auth] verified number is not a supported mobile');
    return res.status(400).json({ error: 'This mobile number is not supported.' });
  }

  // If the browser told us which number it was signing in as, it must agree
  // with the token. The claim is never the source of truth — it is only used
  // to catch a mismatch, which would mean the client and the token disagree
  // about who is signing in.
  if (phone) {
    const claimed = normalizePhone(phone, countryCode || DEFAULT_COUNTRY_CODE);
    if (!claimed || claimed.e164 !== normalized.e164) {
      console.error('[firebase-auth] claimed number does not match the verified token');
      return res.status(400).json({ error: 'Verification failed. Please request a new code.' });
    }
  }

  // The number comes from the signed token, re-normalised above — never from
  // the `phone` the client sent, which was only used to catch a mismatch.
  const { token, user, isNewAccount } = await establishPhoneSession(normalized.e164, req);
  res.json({ token, user, isNewAccount });
});

// ==========================================
// CHANGING THE VERIFIED MOBILE NUMBER
//
// The number IS the identity: it is what findCustomerByVerifiedPhone keys on
// and what signs the customer in. So this is not a profile edit — it moves the
// account to a different credential, and it only happens on the same proof
// sign-in requires: a Firebase ID token for the new number.
//
// Requires an existing session as well, so changing the number needs both the
// old account and control of the new handset. A stolen phone alone cannot take
// an account over, and a stolen session alone cannot move it somewhere the
// thief can receive codes.
//
// The free-text `phone` column is deliberately left alone — that is a courier
// contact number and is not proof of anything.
// ==========================================
router.post(
  '/auth/otp/firebase/change-phone',
  requireCustomer,
  otpVerifyLimiter,
  async (req: AuthenticatedCustomerRequest, res: Response) => {
    // 503, not 409. On this route a 409 already means "that number belongs to
    // someone else" — a conflict the customer fixes by entering a different
    // number. A deployment with Firebase switched off is the opposite: nothing
    // the customer types will help, and it may well be fixed by the time they
    // retry. Reusing 409 here made the UI tell them their number was taken when
    // the real cause was server configuration. Matches the 'unconfigured'
    // branch below, which already answers 503.
    if (!firebaseOtpSelected()) {
      return res.status(503).json({ error: 'Firebase sign-in is not enabled on this deployment.' });
    }

    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'Verification failed. Please try again.' });
    }

    const verification = await verifyFirebasePhoneToken(idToken);
    if (verification.status !== 'verified') {
      // One wording for every rejection reason, as on the sign-in route: the
      // distinctions matter to the operator in the log, not to the customer.
      console.error(`[firebase-auth] change-phone rejected (${verification.status})`);
      const status = verification.status === 'unconfigured' ? 503 : 401;
      return res.status(status).json({ error: 'Verification failed. Please request a new code.' });
    }

    // Identity comes ONLY from the signed token, re-validated through the same
    // normaliser and country allow-list the sign-in path uses.
    const normalized = normalizePhone(verification.phoneRaw);
    if (!normalized || !SUPPORTED_COUNTRY_CODES.includes(normalized.countryCode as any)) {
      return res.status(400).json({ error: 'This mobile number is not supported.' });
    }
    const newE164 = normalized.e164;

    const current = await pool.query('SELECT phone_e164 FROM customers WHERE id = $1', [req.customer!.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Account not found.' });

    // Idempotent: verifying the number the account already has is a no-op
    // success, so a retry after a dropped response cannot fail confusingly.
    if (current.rows[0].phone_e164 === newE164) {
      const unchanged = await pool.query('SELECT * FROM customers WHERE id = $1', [req.customer!.id]);
      return res.json({ success: true, unchanged: true, user: toSessionUser(unchanged.rows[0]) });
    }

    // Guarded before the write so the common case is a clear 409 — and caught
    // again below, because the check and the write are not atomic.
    const owner = await pool.query('SELECT id FROM customers WHERE phone_e164 = $1 AND id <> $2', [
      newE164,
      req.customer!.id,
    ]);
    if (owner.rows.length) {
      return res.status(409).json({ error: 'That mobile number is already in use on another account.' });
    }

    const displayPhone = `${normalized.countryCode} ${normalized.national}`;

    try {
      // One statement, so the number and its verified flag can never disagree.
      await pool.query(
        `UPDATE customers
            SET phone_e164 = $1, phone_verified = true, phone = COALESCE(phone, $2)
          WHERE id = $3`,
        [newE164, displayPhone, req.customer!.id]
      );
    } catch (err) {
      // The partial unique index is the real authority; another request may
      // have claimed the number between the check above and this write.
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23505' && String(pgErr.constraint || '').includes('phone_e164')) {
        return res.status(409).json({ error: 'That mobile number is already in use on another account.' });
      }
      throw err;
    }

    // The credential moved, so every other device must sign in again — on the
    // new number. The device that made the change keeps working: it just
    // proved control, and signing it out would strand the customer mid-flow.
    const tokenVersion = await bumpTokenVersion(req.customer!.id);
    await deleteAllSessions(req.customer!.id, req.customer!.sessionId);
    invalidateAccountCache(req.customer!.id);

    const sessionId = req.customer!.sessionId || (await createSession(req.customer!.id, req));
    const fresh = await pool.query('SELECT * FROM customers WHERE id = $1', [req.customer!.id]);
    const row = fresh.rows[0];
    // bumpTokenVersion invalidated the caller's old token too; this replaces it.
    const token = signCustomerToken(row.id, row.email, tokenVersion, sessionId);

    res.json({ success: true, token, user: toSessionUser(row) });
  }
);

router.get('/auth/me', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.customer!.id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: toSessionUser(row) });
});

// ==========================================
// ADDRESSES — always scoped to the authenticated customer
// ==========================================

function mapAddressRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    phone: row.phone,
    email: row.email || undefined,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2 || undefined,
    area: row.area || undefined,
    landmark: row.landmark || undefined,
    city: row.city,
    state: row.state,
    pinCode: row.pin_code,
    isDefault: row.is_default,
    isBillingDefault: row.is_billing_default,
  };
}

// 'Studio' is still accepted so addresses saved before Home/Work/Other was
// introduced can be edited without being forced onto a new label.
const ADDRESS_TYPES = ['Home', 'Work', 'Other', 'Studio'];

/** Server-side validation for an address payload. The client validates too,
 * but a request can come from anything, so this is the version that counts.
 * Returns `{ ok: false, error }` or `{ ok: true, value }` — declared as one
 * open shape rather than a discriminated union because this project compiles
 * without `strict`, where narrowing on a literal-boolean discriminant is not
 * reliable. */
function validateAddressPayload(body: any): { ok: boolean; error?: string; value?: any } {
  const name = String(body?.name || '').trim();
  const phone = String(body?.phone || '').trim();
  const addressLine1 = String(body?.addressLine1 || '').trim();
  const city = String(body?.city || '').trim();
  const state = String(body?.state || '').trim();
  const pinCode = String(body?.pinCode || '').trim();

  if (!name || !phone || !addressLine1 || !city || !state || !pinCode) {
    return { ok: false, error: 'Please fill in all required address fields.' };
  }
  if (name.length > 120) return { ok: false, error: 'Please enter a shorter name.' };

  // Indian mobile numbers: 10 significant digits beginning 6-9, with an
  // optional country code in front.
  const digits = phone.replace(/\D/g, '');
  const significant = digits.length > 10 ? digits.slice(-10) : digits;
  if (significant.length !== 10 || !/^[6-9]/.test(significant)) {
    return { ok: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
  }
  if (!/^[1-9]\d{5}$/.test(pinCode)) {
    return { ok: false, error: 'Please enter a valid 6-digit PIN code.' };
  }

  const email = String(body?.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  const type = ADDRESS_TYPES.includes(body?.type) ? body.type : 'Home';

  return {
    ok: true,
    value: {
      name,
      type,
      phone,
      email: email || null,
      addressLine1,
      addressLine2: String(body?.addressLine2 || '').trim() || null,
      area: String(body?.area || '').trim() || null,
      landmark: String(body?.landmark || '').trim() || null,
      city,
      state,
      pinCode,
      isDefault: !!body?.isDefault,
      isBillingDefault: !!body?.isBillingDefault,
    },
  };
}

const MAX_ADDRESSES_PER_CUSTOMER = 20;

router.get('/addresses', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC',
    [req.customer!.id]
  );
  res.json({ addresses: result.rows.map(mapAddressRow) });
});

/**
 * Clears the other default flags for this customer so a new default can be
 * set, on a caller-supplied client.
 *
 * Takes a client rather than using the pool directly because migration 010
 * added partial unique indexes enforcing one default of each kind per
 * customer. Clearing and setting through two separate pool connections could
 * interleave with a concurrent save and hit that constraint; both statements
 * now run inside one transaction in the handlers below, which is also what
 * stops the two-defaults state the migration had to repair in the first
 * place.
 */
async function clearOtherDefaultAddresses(
  client: PoolClient,
  userId: string,
  column: 'is_default' | 'is_billing_default',
  keepId?: string
): Promise<void> {
  // Column name is not interpolated from user input — it is one of the two
  // literals in the parameter type above.
  await client.query(
    `UPDATE customer_addresses SET ${column} = false WHERE user_id = $1 AND id IS DISTINCT FROM $2`,
    [userId, keepId || null]
  );
}

router.post('/addresses', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const validated = validateAddressPayload(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const a = validated.value;

  const countRes = await pool.query('SELECT COUNT(*)::int AS n FROM customer_addresses WHERE user_id = $1', [req.customer!.id]);
  if ((countRes.rows[0]?.n || 0) >= MAX_ADDRESSES_PER_CUSTOMER) {
    return res.status(400).json({ error: `You can save up to ${MAX_ADDRESSES_PER_CUSTOMER} addresses. Please remove one first.` });
  }
  // The very first address a customer saves becomes their default even if
  // they didn't tick the box — otherwise checkout has nothing preselected.
  const isFirst = (countRes.rows[0]?.n || 0) === 0;
  const makeDefault = a.isDefault || isFirst;
  // The first address saved becomes the billing default too, for the same
  // reason it becomes the shipping default: checkout needs something
  // preselected rather than an empty billing field.
  const makeBillingDefault = a.isBillingDefault || isFirst;

  const id = 'addr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (makeDefault) await clearOtherDefaultAddresses(client, req.customer!.id, 'is_default');
    if (makeBillingDefault) await clearOtherDefaultAddresses(client, req.customer!.id, 'is_billing_default');
    await client.query(
      `INSERT INTO customer_addresses
        (id, user_id, name, type, phone, email, address_line1, address_line2, area, landmark, city, state, pin_code, is_default, is_billing_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, req.customer!.id, a.name, a.type, a.phone, a.email, a.addressLine1, a.addressLine2, a.area, a.landmark, a.city, a.state, a.pinCode, makeDefault, makeBillingDefault]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  const result = await pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC', [req.customer!.id]);
  res.json({ addresses: result.rows.map(mapAddressRow), newAddressId: id });
});

router.put('/addresses/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const validated = validateAddressPayload(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const a = validated.value;

  // Ownership is re-checked against the authenticated customer here and in
  // the UPDATE's own WHERE clause — an id belonging to someone else is a 404,
  // never a successful edit.
  const ownerCheck = await pool.query('SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  if (ownerCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Address not found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (a.isDefault) await clearOtherDefaultAddresses(client, req.customer!.id, 'is_default', req.params.id);
    if (a.isBillingDefault) {
      await clearOtherDefaultAddresses(client, req.customer!.id, 'is_billing_default', req.params.id);
    }
    await client.query(
      `UPDATE customer_addresses SET
        name = $1, type = $2, phone = $3, email = $4, address_line1 = $5, address_line2 = $6,
        area = $7, landmark = $8, city = $9, state = $10, pin_code = $11, is_default = $12,
        is_billing_default = $13
       WHERE id = $14 AND user_id = $15`,
      [a.name, a.type, a.phone, a.email, a.addressLine1, a.addressLine2, a.area, a.landmark, a.city, a.state, a.pinCode, a.isDefault, a.isBillingDefault, req.params.id, req.customer!.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  const result = await pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC', [req.customer!.id]);
  res.json({ addresses: result.rows.map(mapAddressRow) });
});

router.delete('/addresses/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.customer!.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Address not found.' });
  }
  const remaining = await pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC', [req.customer!.id]);
  res.json({ addresses: remaining.rows.map(mapAddressRow) });
});

// ==========================================
// SHARED HELPERS
// ==========================================

function findProduct(products: Product[], productId: string): Product | undefined {
  return products.find((p) => p.id === productId);
}

function findShade(product: Product, variantId: string | null): Shade | undefined {
  if (!variantId || !product.shades) return undefined;
  return product.shades.find((s) => s.id === variantId);
}

function requiresVariant(product: Product): boolean {
  return !!product.shades && product.shades.length > 0;
}

// Price and stock resolution is NOT re-implemented here. The size → shade →
// product fallback chain used to exist twice, once in the shared module the
// storefront and admin read from and once as a local copy in this file, and
// two copies of a pricing rule is one rule away from a checkout that charges
// something the product page never showed. These wrappers exist only to adapt
// the types at the boundary: a SQL column reads back as null, the shared
// signatures take undefined.
function requiresSize(product: Product, shade: Shade | undefined): boolean {
  return getActiveSizeOptions(product, shade).length > 0;
}

function isValidSize(product: Product, shade: Shade | undefined, size: string | null): boolean {
  if (!size) return true;
  const options = getActiveSizeOptions(product, shade);
  return options.length === 0 || options.some((o) => o.label === size);
}

function getCurrentPrice(product: Product, shade: Shade | undefined, size: string | null): number {
  return resolveCurrentPrice(product, shade, size ?? undefined);
}

function getCurrentStock(product: Product, shade: Shade | undefined, size: string | null): number {
  return resolveCurrentStock(product, shade, size ?? undefined);
}

// ==========================================
// WISHLIST — userId + productId is UNIQUE (enforced at DB level)
// ==========================================

router.get('/wishlist', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const result = await pool.query('SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC', [req.customer!.id]);
  const items = result.rows
    .map((r) => findProduct(db.products, r.product_id))
    .filter((p): p is Product => !!p);
  res.json({ items });
});

router.post('/wishlist/toggle/:productId', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId } = req.params;
  const db = await loadDatabase();
  if (!findProduct(db.products, productId)) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const existing = await pool.query('SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.customer!.id, productId]);

  if (existing.rows.length > 0) {
    await pool.query('DELETE FROM wishlist_items WHERE id = $1', [existing.rows[0].id]);
    return res.json({ inWishlist: false, productId });
  }

  const id = 'wl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  try {
    await pool.query('INSERT INTO wishlist_items (id, user_id, product_id) VALUES ($1, $2, $3)', [id, req.customer!.id, productId]);
  } catch (err: any) {
    // Unique violation race (double-click) — treat as already-added, not an error
    if (err.code !== '23505') throw err;
  }
  res.json({ inWishlist: true, productId });
});

// ==========================================
// CART — userId + productId + variantId is UNIQUE
// Price is NEVER trusted from the client — always looked up live from the product catalog.
// ==========================================

function mapCartRow(row: any, db: Awaited<ReturnType<typeof loadDatabase>>): ServerCartItem {
  const product = findProduct(db.products, row.product_id);
  const shade = product ? findShade(product, row.variant_id) : undefined;
  // Sellability is a question about the units a customer can actually pick,
  // not about the product-level pool. A line whose shade has since been paused
  // is in the same position as one whose product went out of stock: still in
  // the bag, no longer buyable, and shown as such rather than silently priced
  // into the subtotal.
  const shadePaused = !!product && !!shade && !isShadeSelectable(product, shade.id);
  const unavailable = !product || !isProductSellable(product) || shadePaused;
  const unitPrice = product ? getCurrentPrice(product, shade, row.selected_size) : 0;
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    selectedSize: row.selected_size,
    quantity: row.quantity,
    product: product as Product,
    selectedShade: shade,
    lineTotal: unavailable ? 0 : unitPrice * row.quantity,
    unavailable,
    maxAvailable: product ? getCurrentStock(product, shade, row.selected_size) : 0,
  };
}

async function hydrateCart(userId: string): Promise<ServerCartItem[]> {
  const db = await loadDatabase();
  const result = await pool.query(
    'SELECT id, product_id, variant_id, selected_size, quantity FROM cart_items WHERE user_id = $1 AND saved = false ORDER BY created_at ASC',
    [userId]
  );
  return result.rows.map((row) => mapCartRow(row, db));
}

async function hydrateSavedItems(userId: string): Promise<ServerCartItem[]> {
  const db = await loadDatabase();
  const result = await pool.query(
    'SELECT id, product_id, variant_id, selected_size, quantity FROM cart_items WHERE user_id = $1 AND saved = true ORDER BY created_at DESC',
    [userId]
  );
  return result.rows.map((row) => mapCartRow(row, db));
}

router.get('/cart', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const items = await hydrateCart(req.customer!.id);
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  res.json({ items, subtotal, itemCount: items.reduce((n, i) => n + i.quantity, 0) });
});

router.get('/cart/saved', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const items = await hydrateSavedItems(req.customer!.id);
  res.json({ items });
});

router.post('/cart/items', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId, variantId, quantity, size } = req.body || {};
  const requestedQty = Math.max(1, parseInt(quantity, 10) || 1);

  const db = await loadDatabase();
  const product = findProduct(db.products, productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (!isProductSellable(product)) {
    return res.status(400).json({ error: `${product.name} is currently out of stock.` });
  }

  const normalizedVariantId = variantId || null;
  if (requiresVariant(product) && !normalizedVariantId) {
    return res.status(400).json({ error: `Please select a shade for ${product.name} before adding to bag.` });
  }
  const selectedShade = normalizedVariantId ? findShade(product, normalizedVariantId) : undefined;
  if (normalizedVariantId && !selectedShade) {
    return res.status(400).json({ error: 'Selected shade is not available for this product.' });
  }
  // A paused shade is not on the storefront and its stock is not counted as
  // sellable, so it must not be addable either — otherwise a stale tab or a
  // replayed request could buy a variant the admin has taken down. The rule
  // is the shared one the swatch row renders from, including its fallback for
  // a product with every shade paused, so a swatch that IS shown is always
  // addable.
  if (selectedShade && !isShadeSelectable(product, selectedShade.id)) {
    return res.status(400).json({ error: `${selectedShade.name} is no longer available for ${product.name}.` });
  }

  const normalizedSize: string | null = size || null;
  if (requiresSize(product, selectedShade) && !normalizedSize) {
    return res.status(400).json({ error: `Please select a size for ${product.name} before adding to bag.` });
  }
  if (normalizedSize && !isValidSize(product, selectedShade, normalizedSize)) {
    return res.status(400).json({ error: 'Selected size is not available for this product.' });
  }
  const currentStock = await resolveAvailableStock(
    { productId: product.id, variantId: normalizedVariantId, sizeLabel: normalizedSize },
    getCurrentStock(product, selectedShade, normalizedSize)
  );

  const existing = await pool.query(
    'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3 AND selected_size IS NOT DISTINCT FROM $4',
    [req.customer!.id, productId, normalizedVariantId, normalizedSize]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const newQty = row.quantity + requestedQty;
    if (newQty > currentStock) {
      return res.status(400).json({
        error: `Only ${currentStock} of ${product.name} available. You already have ${row.quantity} in your bag.`,
        maxAvailable: currentStock,
      });
    }
    // Reactivates a previously "saved for later" row too — Add to Cart always
    // means the item is active in the bag, regardless of its prior state.
    await pool.query('UPDATE cart_items SET quantity = $1, saved = false, updated_at = now() WHERE id = $2', [newQty, row.id]);
  } else {
    if (requestedQty > currentStock) {
      return res.status(400).json({
        error: `Only ${currentStock} of ${product.name} available.`,
        maxAvailable: currentStock,
      });
    }
    const id = 'cart-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await pool.query(
      'INSERT INTO cart_items (id, user_id, product_id, variant_id, selected_size, quantity) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.customer!.id, productId, normalizedVariantId, normalizedSize, requestedQty]
    );
  }

  const items = await hydrateCart(req.customer!.id);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0) });
});

router.put('/cart/items/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { quantity } = req.body || {};
  const requestedQty = parseInt(quantity, 10);

  if (!requestedQty || requestedQty < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1. Use remove to delete the item instead.' });
  }

  const ownerCheck = await pool.query('SELECT product_id, variant_id, selected_size FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  if (ownerCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }

  const db = await loadDatabase();
  const product = findProduct(db.products, ownerCheck.rows[0].product_id);
  if (!product) return res.status(404).json({ error: 'Product no longer available.' });
  const shade = findShade(product, ownerCheck.rows[0].variant_id);
  const currentStock = getCurrentStock(product, shade, ownerCheck.rows[0].selected_size);

  if (requestedQty > currentStock) {
    return res.status(400).json({
      error: `Maximum available quantity reached. Only ${currentStock} of ${product.name} in stock.`,
      maxAvailable: currentStock,
    });
  }

  await pool.query('UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2', [requestedQty, req.params.id]);

  const items = await hydrateCart(req.customer!.id);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0) });
});

router.delete('/cart/items/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.customer!.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }
  const items = await hydrateCart(req.customer!.id);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0) });
});

// Moves an active cart line into "saved for later" — it stays owned by the
// customer but drops out of the cart subtotal/checkout until moved back.
router.post('/cart/items/:id/save', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'UPDATE cart_items SET saved = true, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.customer!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }
  const [items, savedItems] = await Promise.all([hydrateCart(req.customer!.id), hydrateSavedItems(req.customer!.id)]);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0), savedItems });
});

router.post('/cart/items/:id/unsave', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'UPDATE cart_items SET saved = false, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.customer!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }
  const [items, savedItems] = await Promise.all([hydrateCart(req.customer!.id), hydrateSavedItems(req.customer!.id)]);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0), savedItems });
});

// ==========================================
// CHECKOUT — re-verifies stock + price server-side inside a lock,
// atomically deducts stock, creates the order, and clears the cart.
// ==========================================

// Formats the full order into a wa.me deep link so the customer's own
// WhatsApp opens with the message pre-filled to the admin's number — no
// WhatsApp Business API/credentials required. Returns null if the admin
// hasn't configured a number in Global Store Settings yet.
function buildWhatsAppOrderLink(params: {
  adminNumber: string | undefined | null;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: any;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
}): string | null {
  const digitsOnly = (params.adminNumber || '').replace(/\D/g, '');
  if (!digitsOnly) return null;

  const addressLines = params.address
    ? [
        params.address.addressLine1,
        params.address.addressLine2,
        `${params.address.city || ''}, ${params.address.state || ''} - ${params.address.pinCode || ''}`,
      ]
        .filter(Boolean)
        .join(', ')
    : 'Not provided';

  const itemLines = params.items
    .map((it, i) => {
      const variant = it.shade ? ` (${it.shade.name})` : it.size ? ` (${it.size})` : '';
      return `${i + 1}. ${it.productName}${variant} x${it.quantity} — ₹${it.price * it.quantity}`;
    })
    .join('\n');

  const lines = [
    '🛍️ *New Order Received*',
    '',
    `*Order ID:* #${params.orderNumber}`,
    `*Date:* ${params.createdAt}`,
    '',
    `*Customer:* ${params.customerName}`,
    `*Phone:* ${params.customerPhone}`,
    `*Email:* ${params.customerEmail}`,
    `*Delivery Address:* ${addressLines}`,
    '',
    '*Items:*',
    itemLines,
    '',
    `*Subtotal:* ₹${params.subtotal}`,
    `*Discount:* -₹${params.discount}`,
    `*Shipping:* ₹${params.shipping}`,
    `*Total:* ₹${params.total}`,
    '',
    `*Payment Method:* ${params.paymentMethod.toUpperCase()}`,
    `*Payment Status:* ${params.paymentStatus}`,
  ];

  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(lines.join('\n'))}`;
}

// Discount is always computed server-side against the live, currently-active
// offer list — never trusted from the client. Shared by checkout and the
// standalone /coupons/validate endpoint so the two can never disagree.
// Resolves the admin-configured override for one message slot, falling back
// to the smart system default (which is itself scenario-specific) when
// notifications are disabled for this offer or the field was left blank.
function resolvePromoMessage(
  offer: { notificationSettings?: { enabled: boolean; errorMessage?: string; eligibilityWarningMessage?: string } } | undefined,
  slot: 'errorMessage' | 'eligibilityWarningMessage',
  systemDefault: string,
  vars: { code?: string; minOrder?: number; subtotal?: number }
): string {
  const custom = offer?.notificationSettings?.enabled ? offer.notificationSettings[slot] : undefined;
  return applyPromoMessageTemplate(custom || systemDefault, vars);
}

function computeCouponDiscount(
  db: InternalCMSDatabaseSchema,
  couponCode: string | undefined | null,
  subtotal: number
): { discount: number; appliedCouponCode: string | null; offer?: ReturnType<typeof evaluateOffers>[number]; error?: string } {
  if (!couponCode) return { discount: 0, appliedCouponCode: null };

  // Looked up by code across ALL offers regardless of status (not just
  // 'active') so a scheduled/expired/inactive match can still surface its
  // own admin-configured error message instead of a generic "not found".
  // Offer creation has no coupon-code uniqueness check, so multiple offers
  // can share a code — an active match always wins over a stale one so an
  // old expired/archived duplicate can never shadow a currently-live offer.
  const liveOffers = evaluateOffers(db.offers || []);
  const upperCode = String(couponCode).toUpperCase();
  const codeMatches = liveOffers.filter((o) => o.couponCode && o.couponCode.toUpperCase() === upperCode);
  const codeMatch = codeMatches.find((o) => o.status === 'active') || codeMatches[0];

  if (!codeMatch || codeMatch.status !== 'active') {
    const systemDefault = !codeMatch
      ? DEFAULT_PROMO_NOTIFICATION_MESSAGES.errorMessage
      : codeMatch.status === 'scheduled'
      ? 'This promotion is not available yet.'
      : codeMatch.status === 'expired'
      ? 'This promotion has expired.'
      : 'This promotion is currently unavailable.';
    return {
      discount: 0,
      appliedCouponCode: null,
      error: resolvePromoMessage(codeMatch, 'errorMessage', systemDefault, { code: couponCode }),
    };
  }

  const offer = codeMatch;
  if (subtotal < (offer.minOrderValue || 0)) {
    return {
      discount: 0,
      appliedCouponCode: null,
      error: resolvePromoMessage(
        offer,
        'eligibilityWarningMessage',
        `This code requires a minimum order value of ₹${offer.minOrderValue}.`,
        { code: offer.couponCode, minOrder: offer.minOrderValue, subtotal }
      ),
    };
  }

  let discount = 0;
  if (offer.discountType === 'percentage') {
    discount = Math.round((subtotal * offer.discountValue) / 100);
  } else if (offer.discountType === 'flat') {
    discount = offer.discountValue;
  }
  discount = Math.min(discount, subtotal);
  return { discount, appliedCouponCode: offer.couponCode!, offer };
}

/**
 * Payment methods this route will accept.
 *
 * 'online' is what the storefront actually sends — the per-instrument tiles
 * were retired when Razorpay's hosted sheet took over collecting the
 * instrument, and it asks the customer for UPI/card/netbanking/wallet itself.
 * Its absence here was silently rejecting every online checkout with
 * "Please select a valid payment method" before the gateway was ever reached.
 *
 * The four instrument names are kept, not pruned: older frontend bundles still
 * in a customer's cache send them, historical orders carry them in
 * payment_method, and the admin order filter lists them. All of them mean the
 * same thing to this route — `isOnline` below is the only distinction that
 * matters, and it is simply "not COD".
 */
const PAYMENT_METHODS = ['cod', 'online', 'upi', 'card', 'netbanking', 'wallet'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Whether a shopper may choose anything other than Cash on Delivery.
 *
 * Now answered by the payment service rather than a constant: it is true only
 * when PAYMENTS_LIVE_MODE is on *and* real Razorpay credentials are present
 * (or, outside production, when PAYMENTS_MOCK_CHECKOUT opts in to the mock).
 * A production deploy that is missing either one keeps serving the exact
 * COD-only checkout that exists today rather than offering a payment option
 * that would settle nothing.
 */
function onlinePaymentsEnabled(): boolean {
  return onlinePaymentsAvailable();
}

// The frontend already only ever offers COD, but a request can be sent by
// anything — never trust a client-supplied payment method or an
// unvalidated "COD is fine" assumption. This is the single place that
// decides whether COD may complete a given order.
function checkCodEligibility(
  codRules: CODRules | undefined,
  total: number,
  shippingAddress: { pinCode?: string } | undefined,
  productIds: string[]
): { eligible: true } | { eligible: false; reason: string } {
  const rules = codRules || {
    minOrderAmount: 0,
    maxOrderAmount: 0,
    serviceablePinCodes: [],
    blockedPinCodes: [],
    codDisabledProductIds: [],
  };

  if (rules.minOrderAmount > 0 && total < rules.minOrderAmount) {
    return { eligible: false, reason: `COD requires a minimum order value of ₹${rules.minOrderAmount}.` };
  }
  if (rules.maxOrderAmount > 0 && total > rules.maxOrderAmount) {
    return { eligible: false, reason: `COD is not available for orders above ₹${rules.maxOrderAmount}.` };
  }

  const pinCode = String(shippingAddress?.pinCode || '').trim();
  if (rules.blockedPinCodes?.includes(pinCode)) {
    return { eligible: false, reason: `COD is not available for pin code ${pinCode}.` };
  }
  if (rules.serviceablePinCodes?.length > 0 && !rules.serviceablePinCodes.includes(pinCode)) {
    return { eligible: false, reason: `COD is not serviceable at pin code ${pinCode}.` };
  }

  if (rules.codDisabledProductIds?.length > 0 && productIds.some((id) => rules.codDisabledProductIds.includes(id))) {
    return { eligible: false, reason: 'One or more items in your bag require online payment and are not eligible for Cash on Delivery.' };
  }

  return { eligible: true };
}

// Public (no auth — a shopper checking a product page may not be signed in
// yet) pincode-serviceability check, used by the "Check Delivery
// Availability" widget on the product page. Only checks the
// pincode-related COD rules, not min/max order amount (which depends on the
// eventual cart total, unknown here) — this is the same
// serviceablePinCodes/blockedPinCodes data checkCodEligibility() enforces
// for real at checkout, so this widget can no longer promise COD is
// available somewhere the admin has actually blocked it.
router.get('/cod-eligibility', async (req: Request, res: Response) => {
  const pincode = String(req.query.pincode || '').trim();
  if (!/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ error: 'Please provide a valid 6-digit PIN code.' });
  }

  const db = await loadDatabase();
  const rules = db.globalSettings?.codRules;
  const blocked = rules?.blockedPinCodes?.includes(pincode) || false;
  const restrictedToList = (rules?.serviceablePinCodes?.length || 0) > 0;
  const notInServiceableList = restrictedToList && !rules!.serviceablePinCodes.includes(pincode);
  const serviceable = !blocked && !notInServiceableList;

  res.json({ pincode, serviceable });
});

/**
 * The payment block recorded on a newly created order.
 *
 * No card details are ever accepted here any more. Under Razorpay the
 * instrument is entered on the gateway's own hosted checkout and never
 * touches this server — which is both the only PCI-sane arrangement and the
 * reason the old upiId/cardNumber/bankName request fields are no longer read.
 * They are still accepted in the request body and ignored, so an older
 * frontend build cannot break by sending them.
 */
function buildInitialPaymentDetails(paymentMethod: PaymentMethod): PaymentDetails {
  return {
    method: paymentMethod,
    // COD owes nothing until the courier collects; an online order is pending
    // until the gateway says otherwise. Neither is ever 'PAID' at creation.
    status: paymentMethod === 'cod' ? 'COD_PENDING' : 'PENDING',
  };
}

router.post('/coupons/validate', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { couponCode, subtotal } = req.body || {};
  if (!String(couponCode || '').trim()) {
    return res.status(400).json({ error: 'Please enter a coupon code.' });
  }

  const db = await loadDatabase();
  const result = computeCouponDiscount(db, couponCode, Number(subtotal) || 0);
  if (!result.appliedCouponCode || !result.offer) {
    return res.status(400).json({ error: result.error || 'Invalid coupon code.' });
  }

  const offer = result.offer;
  res.json({
    coupon: {
      code: offer.couponCode,
      title: offer.publicTitle || offer.name,
      description: offer.description,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      minOrderValue: offer.minOrderValue || undefined,
      tag: offer.tag,
      notificationSettings: offer.notificationSettings,
    },
    discount: result.discount,
  });
});

router.post('/checkout', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  // upiId/cardNumber/bankName/walletProvider may still arrive from an older
  // frontend build. They are deliberately not destructured or read: the
  // instrument is now collected on the gateway's own hosted checkout and must
  // never touch this server.
  const {
    shippingAddress, idempotencyKey, customerName, customerPhone, customerEmail, couponCode,
  } = req.body || {};
  const paymentMethod: (typeof PAYMENT_METHODS)[number] = req.body?.paymentMethod || 'cod';
  const userId = req.customer!.id;
  const placedNote = 'Order placed successfully';
  const resolvedName = customerName || shippingAddress?.name || '';
  const resolvedPhone = customerPhone || shippingAddress?.phone || '';
  const resolvedEmail = customerEmail || shippingAddress?.email || '';

  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Please select a valid payment method.' });
  }
  // Never trust a client-supplied payment method. A direct API call asking for
  // an online method while the gateway is not configured is refused here
  // rather than being allowed to create an order that can never be paid.
  const isOnline = paymentMethod !== 'cod';
  if (isOnline && !onlinePaymentsEnabled()) {
    return res.status(400).json({ error: 'Only Cash on Delivery is available at this time.' });
  }

  try {
    // A pure replay of an already-processed attempt needs neither the stock
    // lock nor a re-simulated payment — just hand back what was built last time.
    if (idempotencyKey) {
      const existingOrder = await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
      if (existingOrder.rows.length > 0) {
        const existingDb = await loadDatabase();
        const order = await buildOrderFromRow(existingOrder.rows[0], existingDb);
        return res.json({ order, alreadyProcessed: true });
      }
    }

    const paymentDetails = buildInitialPaymentDetails(paymentMethod);

    const result = await withStockLock(async () => {
      // Re-check idempotency now that we hold the lock — guards the rare
      // case where two requests carrying the same key raced past the
      // unlocked pre-check above (the DB's UNIQUE constraint on
      // idempotency_key would also catch this on insert, but this avoids
      // surfacing that as a generic 500).
      if (idempotencyKey) {
        const existingOrder = await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
        if (existingOrder.rows.length > 0) {
          const existingDb = await loadDatabase();
          const order = await buildOrderFromRow(existingOrder.rows[0], existingDb);
          return { alreadyProcessed: true, order };
        }
      }

      const cartRes = await pool.query(
        'SELECT id, product_id, variant_id, selected_size, quantity FROM cart_items WHERE user_id = $1 AND saved = false ORDER BY created_at ASC',
        [userId]
      );
      if (cartRes.rows.length === 0) {
        return { error: 'Your shopping bag is empty.', status: 400 };
      }

      const db = await loadDatabase();

      // Re-verify every line against the live product catalog (never trust cached client state).
      for (const row of cartRes.rows) {
        const product = findProduct(db.products, row.product_id);
        if (!product || !isProductSellable(product)) {
          return { error: `${product?.name || 'An item'} in your bag is no longer available.`, status: 409 };
        }
        const shade = findShade(product, row.variant_id);
        if (shade && !isShadeSelectable(product, shade.id)) {
          return {
            error: `${shade.name} (${product.name}) is no longer available. Please remove it from your bag to continue.`,
            status: 409,
          };
        }
        // Reads from SQL inventory when it is authoritative, otherwise from
        // the JSONB document — same check either way, so the flag cannot make
        // checkout validate against one system while deducting from another.
        const currentStock = await resolveAvailableStock(
          { productId: row.product_id, variantId: row.variant_id, sizeLabel: row.selected_size },
          getCurrentStock(product, shade, row.selected_size)
        );
        if (row.quantity > currentStock) {
          return {
            error: `Only ${currentStock} of ${product.name} are currently available. Please update the quantity in your bag.`,
            status: 409,
          };
        }
      }

      // All valid — compute totals from live DB prices and build order items.
      // Stock is not touched yet: COD eligibility depends on the final total,
      // computed below, and must be checked before anything is deducted.
      const orderItems: OrderItem[] = [];
      let subtotal = 0;
      for (const row of cartRes.rows) {
        const product = findProduct(db.products, row.product_id)!;
        const shade = findShade(product, row.variant_id);
        const unitPrice = getCurrentPrice(product, shade, row.selected_size);
        // Shared with every storefront surface that renders this line, so the
        // image frozen onto the order is the one the customer was looking at
        // in their bag. Replaces a local copy of this rule that skipped the
        // empty-url filter and the sortOrder tiebreak.
        const variantPrimaryImage = resolveVariantThumbnail(product, shade);
        const lineTotal = unitPrice * row.quantity;
        subtotal += lineTotal;
        orderItems.push({
          productId: product.id,
          productName: product.name,
          productImage: variantPrimaryImage,
          shade,
          size: row.selected_size || undefined,
          price: unitPrice,
          quantity: row.quantity,
        });
      }

      const { discount, appliedCouponCode } = computeCouponDiscount(db, couponCode, subtotal);

      const shipping = subtotal - discount >= 999 ? 0 : 99;
      const total = Math.max(0, subtotal - discount + shipping);

      if (paymentMethod === 'cod') {
        const codCheck = checkCodEligibility(
          db.globalSettings?.codRules,
          total,
          shippingAddress,
          orderItems.map((item) => item.productId)
        );
        if (codCheck.eligible === false) {
          console.warn('COD checkout refused:', codCheck.reason);
          return { error: 'Cash on Delivery is not available for this order.', status: 400 };
        }
      }

      // Eligibility confirmed — now safe to deduct stock. Product-level stock
      // is always decremented (unchanged behavior for variant-less products
      // and the existing "is this product in stock at all" checks). A
      // variant that tracks its own stock also gets decremented so its
      // individual count stays accurate.
      for (const row of cartRes.rows) {
        const idx = db.products.findIndex((p) => p.id === row.product_id);
        const nextStock = db.products[idx].stock - row.quantity;
        let nextShades = db.products[idx].shades;
        if (row.variant_id && nextShades) {
          nextShades = nextShades.map((s) => {
            if (s.id !== row.variant_id) return s;
            // A shade with its own size list decrements the specific size
            // that was bought; a shade without one decrements its own stock.
            if (row.selected_size && s.sizes && s.sizes.length > 0) {
              return {
                ...s,
                sizes: s.sizes.map((sz) =>
                  sz.label === row.selected_size && sz.stock !== undefined
                    ? { ...sz, stock: Math.max(0, sz.stock - row.quantity) }
                    : sz
                ),
              };
            }
            return s.stock !== undefined ? { ...s, stock: Math.max(0, s.stock - row.quantity) } : s;
          });
        }
        // Product-level sizePricing only applies to shade-less products
        // (the shade's own sizes above already covered the shaded case).
        let nextSizePricing = db.products[idx].sizePricing;
        if (!row.variant_id && row.selected_size && nextSizePricing?.[row.selected_size]?.stock !== undefined) {
          const entry = nextSizePricing[row.selected_size];
          nextSizePricing = { ...nextSizePricing, [row.selected_size]: { ...entry, stock: Math.max(0, entry.stock! - row.quantity) } };
        }
        const nextProduct = {
          ...db.products[idx],
          stock: nextStock,
          shades: nextShades,
          sizePricing: nextSizePricing,
        };
        // Availability comes from every sellable unit, not the product pool
        // alone — see hasSellableStock. A shaded product whose pool drains
        // must stay buyable while its shades have stock.
        db.products[idx] = { ...nextProduct, inStock: hasSellableStock(nextProduct) };
      }

      // Persist the stock deduction. loadDatabase() hands back the shared
      // in-process cache by reference, so the mutations above are already
      // visible to every other request in this process — but without this
      // write they never reach Postgres, and a restart would silently undo
      // every checkout's stock deduction while restocks (which do save)
      // stay applied, drifting stock upward over time.
      await saveDatabase(db);

      const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const orderNumber = 'GLM' + Date.now().toString().slice(-8);

      // An online order starts at PENDING_PAYMENT and only advances once the
      // gateway confirms. COD keeps the exact status it has always been
      // created with, so nothing about the existing COD flow changes.
      const initialStatus: OrderStatus = isOnline ? 'PENDING_PAYMENT' : 'PLACED';

      await pool.query(
        `INSERT INTO orders
          (id, user_id, order_number, status, subtotal, discount, shipping, total, shipping_address, idempotency_key, customer_name, customer_phone, customer_email, coupon_code, payment_method, payment_status, payment_details, shipping_status, stock_committed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          orderId, userId, orderNumber, initialStatus, subtotal, discount, shipping, total,
          shippingAddress ? JSON.stringify(shippingAddress) : null, idempotencyKey || null,
          resolvedName, resolvedPhone, resolvedEmail, appliedCouponCode, paymentMethod, paymentDetails.status,
          JSON.stringify(paymentDetails),
          'NOT_SHIPPED',
          // Stock was deducted a few lines above, for both payment methods.
          //
          // Reserving at order creation rather than at payment confirmation is
          // deliberate: it is the only way two shoppers racing for the last
          // unit cannot both reach a successful payment. The cost is that an
          // abandoned online checkout holds stock until its payment window
          // lapses, which expirePendingPaymentOrders() below reclaims.
          true,
        ]
      );

      for (const item of orderItems) {
        const itemId = 'oi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        await pool.query(
          'INSERT INTO order_items (id, order_id, product_id, variant_id, selected_size, product_name, quantity, price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [itemId, orderId, item.productId, item.shade?.id || null, item.size || null, item.productName, item.quantity, item.price]
        );
      }

      // Logged so the account's Rewards screen can show which codes have
      // actually been spent rather than offering a used one back again.
      if (appliedCouponCode) {
        await recordCouponRedemption(userId, appliedCouponCode, orderId, discount);
      }

      await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND saved = false', [userId]);

      // The gateway order is created server-side from the server's own total.
      // The browser is told which gateway order to pay and how much, but it
      // cannot influence either — a tampered amount in the request body was
      // never read, and the gateway will reject a payment whose amount does
      // not match the order it was created against.
      let checkoutPayment: CheckoutPaymentHandoff | undefined;
      if (isOnline) {
        const gateway = getPaymentGateway();
        const amountMinor = toMinorUnits(total);
        const created = await gateway.createOrder({
          amountMinor,
          currency: 'INR',
          receipt: orderNumber,
          notes: { orderId, orderNumber, userId },
        });

        if (!created.ok || !created.order) {
          // The order row and its stock reservation already exist, so they are
          // released here rather than left stranded: the customer never got a
          // payment screen, so there is nothing to reconcile later.
          return {
            error: 'We could not start the payment. Please try again in a moment.',
            status: 502,
            releaseOrderId: orderId,
          };
        }

        const paymentRowId = 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        await pool.query(
          `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, amount_minor, currency, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
          [paymentRowId, orderId, userId, gateway.name, created.order.id, amountMinor, 'INR']
        );

        await pool.query(
          `UPDATE orders SET payment_details = jsonb_set(payment_details, '{gatewayOrderId}', to_jsonb($2::text))
           WHERE id = $1`,
          [orderId, created.order.id]
        );
        paymentDetails.gatewayOrderId = created.order.id;

        checkoutPayment = {
          provider: gateway.name,
          gatewayOrderId: created.order.id,
          keyId: publishableKeyId(),
          amountMinor,
          currency: 'INR',
          isMock: gateway.isMock,
        };
      }

      const createdAt = new Date().toISOString();
      const timelineNote = isOnline ? 'Awaiting payment confirmation' : placedNote;
      const order: Order = {
        id: orderId,
        orderNumber,
        createdAt,
        status: initialStatus,
        items: orderItems,
        subtotal,
        discount,
        shipping,
        tax: 0,
        total,
        deliveryAddress: shippingAddress,
        payment: paymentDetails,
        paymentStatus: paymentDetails.status,
        shippingStatus: 'NOT_SHIPPED',
        amountPaid: 0,
        amountRefunded: 0,
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        timeline: [
          { status: initialStatus, timestamp: createdAt, note: timelineNote, completed: true },
        ],
      };

      const whatsappUrl = buildWhatsAppOrderLink({
        adminNumber: db.globalSettings?.whatsappOrderNumber,
        orderNumber,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        customerEmail: resolvedEmail,
        address: shippingAddress,
        items: orderItems,
        subtotal,
        discount,
        shipping,
        total,
        paymentMethod: paymentMethod.toUpperCase(),
        paymentStatus: paymentDetails.status,
        createdAt: new Date(createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      });

      return { order, whatsappUrl, checkoutPayment };
    });

    if ('error' in result) {
      // The gateway refused to open a payment after the order row and its
      // stock reservation were already written. Both are released here so a
      // failed "start payment" never silently holds inventory.
      if (result.releaseOrderId) {
        await restoreOrderStock(result.releaseOrderId).catch((err) =>
          console.error('Failed to release stock for abandoned order:', err)
        );
        await pool
          .query(
            `UPDATE orders SET status = 'CANCELLED', payment_status = 'FAILED', cancelled_at = now(),
                    cancellation_reason = 'Payment could not be started'
             WHERE id = $1`,
            [result.releaseOrderId]
          )
          .catch(() => undefined);
      }
      return res.status(result.status || 400).json({ error: result.error });
    }
    if ('alreadyProcessed' in result) {
      return res.json({ order: result.order, alreadyProcessed: true });
    }

    // Post-order side effects — none of these are read by the response and
    // none depend on each other, so they run concurrently after the lock has
    // already been released rather than serializing every other checkout
    // behind a status-history write, two notification inserts, and two SMTP
    // round-trips. Wrapped in its own try/catch: the order is already
    // committed at this point, so a notification/email hiccup must never
    // turn into a false "Checkout failed" response for an order that
    // actually succeeded.
    //
    // An online order that has not been paid yet gets only its status-history
    // row: telling a customer "your order is confirmed" before the gateway
    // has taken their money would be a lie, and alerting the store to an
    // order that may never be paid is noise.
    const createdStatus = result.order.status;
    const isAwaitingPayment = createdStatus === 'PENDING_PAYMENT';

    // The STORE is told about every persisted order, both payment methods.
    //
    // This previously fired only for COD, inside the !isAwaitingPayment
    // branch below, on the reasoning that an unpaid order might evaporate and
    // alerting on it was noise. The cost of that was worse: once online
    // payments went live, a prepaid order that WAS paid produced no new-order
    // alert at all, because by then checkout had already decided to stay
    // quiet. The store simply never learned about online sales.
    //
    // Reported now with the payment state said plainly — an AWAITING PAYMENT
    // alert that says "do not dispatch" is useful; silence is not. The
    // separate ORDER_PAID notification still fires on verification.
    try {
      await enqueueNotification({
        orderId: result.order.id,
        eventType: 'ADMIN_NEW_ORDER',
        // One per order, so a retried checkout cannot alert twice.
        dedupeKey: `${result.order.id}:ADMIN_NEW_ORDER`,
        payload: {
          orderId: result.order.id,
          orderNumber: result.order.orderNumber,
          customerName: resolvedName,
          paymentMethod,
          paymentStatus: result.order.paymentStatus,
          total: result.order.total,
          items: (result.order.items || []).map((i) => ({ name: i.productName, quantity: i.quantity })),
        },
      });
    } catch (err) {
      // The order is placed and its payment state is unaffected; an alerting
      // failure must not fail the customer's checkout.
      console.error('[checkout] admin new-order notification could not be enqueued:', err);
    }

    try {
      const db = await loadDatabase();
      await Promise.all([
        insertOrderStatusHistory(result.order.id, createdStatus, isAwaitingPayment ? 'Awaiting payment confirmation' : placedNote),
        // Still gated on isAwaitingPayment: telling a customer "your order is
        // confirmed" before the gateway has taken their money would be a lie.
        // The prepaid customer hears from us at verification instead, via
        // markOrderPaid → CONFIRMED, or from PAYMENT_FAILED if it does not go
        // through. The STORE is told either way, by the ADMIN_NEW_ORDER event
        // enqueued above.
        ...(isAwaitingPayment
          ? []
          : [
              notifyOrderStatus(result.order.id, createdStatus, { includeItems: true }),
              // Retained deliberately. This is a plain email to the store's
              // own contactEmail from CMS settings — a different recipient
              // and a different purpose from the ADMIN_NEW_ORDER event, which
              // drives the in-panel notification bell. Folding it into the
              // engine would mean inventing an admin-email channel, which is
              // its own change.
              sendAdminNewOrderEmail({
                toEmail: db.globalSettings?.contactEmail,
                orderNumber: result.order.orderNumber,
                customerName: resolvedName,
                total: result.order.total,
              }),
            ]),
      ]);
    } catch (sideEffectErr) {
      console.error('Order placed successfully, but a post-order notification/email step failed:', sideEffectErr);
    }

    // A COD order is final the moment it is placed, so its shipment can be
    // booked immediately. Deliberately not awaited: a courier outage must not
    // fail a checkout that has already succeeded, and the retry path in
    // createShipmentForOrder picks up anything that did not stick.
    if (!isAwaitingPayment && shipmentsEnabled()) {
      void createShipmentForOrder(result.order.id).catch((err) =>
        console.error('Shipment creation failed for new order:', err)
      );
    }

    res.json({ order: result.order, whatsappUrl: result.whatsappUrl, payment: result.checkoutPayment });
  } catch (err) {
    console.error('Checkout failed:', err);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

// ==========================================
// PAYMENT CONFIRMATION
// ==========================================

/**
 * What payment methods this deployment can actually take.
 *
 * Public (a shopper reaches checkout before any of this matters) and
 * deliberately thin: it returns the publishable key id, which Razorpay's own
 * browser checkout requires and which is public by design, and nothing else.
 * The key secret and webhook secret are never exposed here or anywhere else.
 *
 * The storefront reads this instead of hardcoding a flag, so switching
 * PAYMENTS_LIVE_MODE on is a server-side change that needs no redeploy of the
 * frontend bundle.
 */
router.get('/payments/config', async (_req: Request, res: Response) => {
  const available = onlinePaymentsEnabled();
  res.json({
    onlinePaymentsEnabled: available,
    provider: available ? getPaymentGateway().name : null,
    keyId: available ? publishableKeyId() : null,
    isMock: available ? getPaymentGateway().isMock : false,
  });
});

/**
 * Confirms an online payment from the browser handshake.
 *
 * This is the fast path — the webhook is the authoritative one and will arrive
 * independently, but a customer should not stare at a spinner waiting for it.
 * Both routes converge on markOrderPaid(), which is idempotent, so whichever
 * lands first wins and the other is a no-op.
 *
 * Nothing here is taken on trust:
 *
 *   * The order must belong to the authenticated customer.
 *   * The signature must verify against the key secret, which proves the
 *     gateway produced this (order_id, payment_id) pair.
 *   * The amount is read back from the gateway, not from the request, and is
 *     checked against what the order actually costs — a verified signature for
 *     a ₹1 payment must not settle a ₹5,000 order.
 *
 * Rate limited because every call costs an outbound gateway lookup, so a retry
 * loop or a stuck client would spend Razorpay's rate budget rather than ours.
 * The ceiling is well above a genuine checkout — a customer confirms once,
 * twice if they retry a declined card — and the signature is a SHA-256 HMAC,
 * so this throttles load rather than defending the secret.
 */
const paymentVerifyLimiter = rateLimit({
  scope: 'payment-verify',
  windowMs: 10 * 60 * 1000,
  max: 30,
  message:
    'Too many payment confirmation attempts. Please wait a moment — your order will update automatically if the payment went through.',
});

router.post('/payments/verify', requireCustomer, paymentVerifyLimiter, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ error: 'Incomplete payment confirmation.' });
  }

  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, req.customer!.id]);
  const order = orderRes.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  // Already settled by the webhook that beat us here. Reported as success —
  // the customer's payment did go through, which is what they are asking.
  if (order.payment_status === 'PAID') {
    const db = await loadDatabase();
    return res.json({ success: true, order: await buildOrderFromRow(order, db), alreadyConfirmed: true });
  }

  const paymentRes = await pool.query(
    'SELECT * FROM payments WHERE order_id = $1 AND provider_order_id = $2',
    [orderId, razorpayOrderId]
  );
  const paymentRow = paymentRes.rows[0];
  if (!paymentRow) {
    return res.status(400).json({ error: 'This payment does not belong to that order.' });
  }

  if (!verifyPaymentSignature({
    gatewayOrderId: String(razorpayOrderId),
    gatewayPaymentId: String(razorpayPaymentId),
    signature: String(razorpaySignature),
  })) {
    // A bad signature is either a bug or an attempt to mark an order paid for
    // free. Logged with the order reference but never with the secret or the
    // signature itself.
    console.warn(`[payments] signature verification failed for order ${orderId}`);
    await pool.query(
      `UPDATE payments SET status = 'FAILED', error_code = 'SIGNATURE_MISMATCH',
              error_description = 'Signature verification failed', updated_at = now()
       WHERE id = $1`,
      [paymentRow.id]
    );
    return res.status(400).json({ error: 'We could not verify this payment. Please contact support.' });
  }

  // Signature proves authenticity; the gateway lookup proves the payment was
  // actually captured and for how much. A signature alone does not mean money
  // moved — it only means these two ids were issued together.
  const gateway = getPaymentGateway();
  const fetched = await gateway.fetchPayment(String(razorpayPaymentId));
  if (!fetched.ok || !fetched.payment) {
    return res.status(502).json({ error: 'We could not reach the payment gateway. Your order will update automatically once confirmed.' });
  }

  const payment = fetched.payment;
  if (payment.status !== 'PAID') {
    await recordPaymentAttempt({ paymentRowId: paymentRow.id, payment, signature: String(razorpaySignature) });

    // PENDING is not a decline. mapRazorpayStatus returns it for 'authorized',
    // 'created' and 'pending' — a UPI collect request the customer has not
    // approved yet, or an authorisation awaiting capture. Cancelling the order
    // here would charge a customer whose payment captures a moment later
    // against an order that no longer exists. Left PENDING_PAYMENT instead, so
    // the webhook settles it and the expiry sweep reclaims it if it never does.
    if (payment.status === 'PENDING') {
      return res.status(202).json({
        pending: true,
        error: 'Your payment is still being confirmed. We will update this order as soon as it completes.',
      });
    }

    await markOrderPaymentFailed({ orderId, status: 'FAILED', reason: payment.errorDescription || 'Payment not captured' });
    // Stock was reserved at order creation (see the INSERT in /checkout), and
    // markOrderPaymentFailed has just moved the order to CANCELLED/FAILED —
    // past the window expirePendingPaymentOrders() looks at. Without this
    // release the reservation would never be reclaimed by anything. Matches
    // what the payment.failed webhook and the customer-cancel route already do.
    await restoreOrderStock(orderId);
    return res.status(402).json({ error: payment.errorDescription || 'Your payment was not completed.' });
  }

  if (Number(payment.amountMinor) !== Number(paymentRow.amount_minor)) {
    console.error(
      `[payments] amount mismatch on order ${orderId}: gateway ${payment.amountMinor}, expected ${paymentRow.amount_minor}`
    );
    await recordPaymentAttempt({ paymentRowId: paymentRow.id, payment, signature: String(razorpaySignature) });
    return res.status(400).json({ error: 'The amount paid does not match this order. Please contact support.' });
  }

  await recordPaymentAttempt({ paymentRowId: paymentRow.id, payment, signature: String(razorpaySignature) });
  await markOrderPaid({
    orderId,
    amountPaid: fromMinorUnits(payment.amountMinor),
    gatewayPaymentId: payment.id,
    method: payment.method,
  });

  const db = await loadDatabase();
  const updated = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  res.json({ success: true, order: await buildOrderFromRow(updated.rows[0], db) });
});

/** Writes the gateway's verdict onto the ledger row. Shared by the verify
 * route and the webhook so both record an attempt identically. */
async function recordPaymentAttempt(input: {
  paymentRowId: string;
  payment: { id: string; status: string; method?: string; errorCode?: string; errorDescription?: string; raw?: unknown };
  signature?: string;
}): Promise<void> {
  await pool.query(
    `UPDATE payments SET provider_payment_id = $2, status = $3, method = $4,
            error_code = $5, error_description = $6, gateway_response = $7::jsonb,
            provider_signature = COALESCE($8, provider_signature), updated_at = now()
     WHERE id = $1`,
    [
      input.paymentRowId,
      input.payment.id,
      input.payment.status,
      input.payment.method || null,
      input.payment.errorCode || null,
      input.payment.errorDescription || null,
      JSON.stringify(input.payment.raw || {}),
      input.signature || null,
    ]
  );
}

/**
 * Lets the confirmation screen poll while a webhook settles.
 *
 * Needed because a customer can close the gateway tab before the browser
 * handshake fires — their money is taken and only the webhook knows. Scoped to
 * the authenticated customer's own orders.
 */
router.get('/payments/:orderId/status', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'SELECT status, payment_status, amount_paid FROM orders WHERE id = $1 AND user_id = $2',
    [req.params.orderId, req.customer!.id]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });
  res.json({
    orderStatus: row.status,
    paymentStatus: row.payment_status,
    amountPaid: Number(row.amount_paid) || 0,
  });
});

/**
 * Records that the customer abandoned the gateway checkout.
 *
 * Advisory only — it never marks an order paid or unpaid on the customer's
 * say-so. All it does is release a reservation early instead of waiting for
 * the expiry sweep, and it refuses to act if the gateway has meanwhile
 * confirmed the payment.
 */
/**
 * Re-opens payment on an order the customer never completed.
 *
 * Why a FRESH gateway order rather than reusing the old one: the payment
 * adapter exposes createOrder, fetchPayment and refund — there is no
 * fetchOrder, so there is no way to ask Razorpay whether the previous order is
 * still payable. Reusing a handle whose state we cannot see would be guessing,
 * and guessing wrong means handing the customer a checkout that silently
 * fails. A new order costs nothing; the abandoned one simply expires at
 * Razorpay. The unique index on (provider, provider_order_id) is satisfied by
 * construction because the new handle is new.
 *
 * Stock is NOT re-reserved. It was taken at order creation for both payment
 * methods and is still held — `stock_committed = true AND stock_restored =
 * false` is part of the eligibility check precisely so a retry cannot deduct a
 * second time. A retry that found the reservation already released is refused,
 * because the units may have been sold to someone else in the meantime.
 *
 * markOrderPaid remains the single writer of PAID and is idempotent, so even
 * if both the old and new gateway orders were somehow paid, the order is
 * confirmed once.
 */
router.post('/payments/:orderId/retry', requireCustomer, paymentVerifyLimiter, async (req: AuthenticatedCustomerRequest, res: Response) => {
  if (!onlinePaymentsEnabled()) {
    return res.status(400).json({ error: 'Online payments are not available at the moment.' });
  }

  const orderRes = await pool.query(
    `SELECT id, order_number, user_id, total, status, payment_status, payment_method,
            stock_committed, stock_restored
     FROM orders WHERE id = $1 AND user_id = $2`,
    [req.params.orderId, req.customer!.id]
  );
  const order = orderRes.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  // Eligibility, each clause load-bearing:
  //   PENDING_PAYMENT + PENDING  the order is genuinely awaiting money. A PAID
  //                              order must never be re-opened, and a
  //                              CANCELLED/EXPIRED one is finished.
  //   not COD                    there is nothing to pay online.
  //   stock still reserved       see above; without this a retry on a released
  //                              order could oversell.
  if (order.payment_method === 'cod') {
    return res.status(400).json({ error: 'This is a Cash on Delivery order — there is nothing to pay online.' });
  }
  if (order.payment_status === 'PAID') {
    return res.status(409).json({ error: 'This order has already been paid.' });
  }
  if (order.status !== 'PENDING_PAYMENT' || order.payment_status !== 'PENDING') {
    return res.status(409).json({ error: 'This order is no longer awaiting payment. Please place a new order.' });
  }
  if (!order.stock_committed || order.stock_restored) {
    return res.status(409).json({
      error: 'The items on this order are no longer held for you. Please place a new order.',
    });
  }

  // Priced from the ORDER, not from the cart — the cart was emptied at
  // checkout, and the customer agreed to this total. Nothing in the request
  // body influences it.
  const amountMinor = toMinorUnits(Number(order.total));

  const gateway = getPaymentGateway();
  const created = await gateway.createOrder({
    amountMinor,
    currency: 'INR',
    receipt: order.order_number,
    notes: { orderId: order.id, orderNumber: order.order_number, userId: order.user_id, retry: 'true' },
  });
  if (!created.ok || !created.order) {
    // Nothing is released here, unlike checkout: the order and its reservation
    // predate this request and are still legitimately the customer's. They
    // expire on their own if the retry is abandoned too.
    return res.status(502).json({ error: 'We could not start the payment. Please try again in a moment.' });
  }

  // A NEW ledger row, not an update of the old one. Each gateway order gets
  // its own row so /payments/verify can match the exact (order, gatewayOrder)
  // pair the browser returns, and so a late webhook for the abandoned attempt
  // still resolves to the right row instead of being credited to this one.
  const paymentRowId = 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, amount_minor, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'INR', 'PENDING')`,
    [paymentRowId, order.id, order.user_id, gateway.name, created.order.id, amountMinor]
  );

  await pool.query(
    `UPDATE orders SET payment_details = jsonb_set(payment_details, '{gatewayOrderId}', to_jsonb($2::text))
     WHERE id = $1`,
    [order.id, created.order.id]
  );

  await insertOrderStatusHistory(order.id, 'PENDING_PAYMENT', 'Payment retried by customer');

  res.json({
    payment: {
      provider: gateway.name,
      gatewayOrderId: created.order.id,
      keyId: publishableKeyId(),
      amountMinor,
      currency: 'INR',
      isMock: gateway.isMock,
    },
  });
});

router.post('/payments/:orderId/cancel', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    `SELECT id, payment_status FROM orders WHERE id = $1 AND user_id = $2 AND status = 'PENDING_PAYMENT'`,
    [req.params.orderId, req.customer!.id]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'No pending payment found for that order.' });
  if (row.payment_status === 'PAID') {
    return res.status(409).json({ error: 'This payment has already been completed.' });
  }

  await markOrderPaymentFailed({ orderId: row.id, status: 'CANCELLED', reason: 'Payment cancelled by customer' });
  await restoreOrderStock(row.id);
  res.json({ success: true });
});

// ==========================================
// ORDER HISTORY — reconstructed from the persisted orders/order_items rows,
// never from client-side sample data.
// ==========================================

router.get('/orders', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const ordersRes = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.customer!.id]);
  const orders: Order[] = await buildOrdersFromRows(ordersRes.rows, db);
  res.json({ orders });
});

router.get('/orders/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const db = await loadDatabase();
  const order = await buildOrderFromRow(row, db);
  res.json({ order });
});

router.post('/orders/:id/cancel', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { reason } = req.body || {};
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });
  if (!CANCELLABLE_STATUSES.includes(row.status)) {
    return res.status(400).json({ error: `This order can no longer be cancelled (current status: ${row.status}).` });
  }

  // The status check above reads a snapshot taken before the UPDATE, so it
  // can't be trusted alone — two concurrent cancel attempts (a double-click,
  // or a customer and admin cancelling at once) would both pass it. The
  // conditional UPDATE re-verifies the status hasn't changed; only the request
  // that actually flips it proceeds.
  const updateRes = await pool.query(
    `UPDATE orders SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = $3
     WHERE id = $1 AND status = $2 RETURNING id`,
    [row.id, row.status, reason ? String(reason).slice(0, 500) : 'Cancelled by customer']
  );
  if (updateRes.rows.length === 0) {
    return res.status(409).json({ error: 'This order was already updated. Please refresh and try again.' });
  }

  // Restocking now goes through restoreOrderStock rather than calling
  // restockOrderItems directly: it carries the stock_restored guard, so an
  // order cancelled here and then refunded by a webhook is credited back
  // exactly once rather than twice.
  await restoreOrderStock(row.id);

  // A prepaid order that is cancelled owes the customer their money back.
  // Attempted immediately but never allowed to fail the cancellation — the
  // order is already cancelled, and a gateway hiccup must not leave the
  // customer with an uncancelled order *and* no refund.
  if (row.payment_status === 'PAID' && Number(row.amount_paid) > 0) {
    void refundOrderPayment(row.id, Number(row.amount_paid), 'Order cancelled by customer').catch((err) =>
      console.error(`Refund failed for cancelled order ${row.id}:`, err)
    );
  }

  // Likewise the courier booking, if one was already made.
  void cancelShipmentForOrder(row.id).catch((err) =>
    console.error(`Could not cancel shipment for order ${row.id}:`, err)
  );

  // Independent writes/sends — none read each other's result, so they run
  // concurrently instead of serializing behind an SMTP round-trip.
  await Promise.all([
    insertOrderStatusHistory(row.id, 'CANCELLED', reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer'),
    notifyOrderStatus(row, 'CANCELLED'),
  ]);

  const db = await loadDatabase();
  const updatedRes = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  const order = await buildOrderFromRow(updatedRes.rows[0], db);
  res.json({ order });
});

/**
 * Reorder — puts everything from a past order back in the bag.
 *
 * Partial success is the normal case, not an edge case: months later some
 * items will be delisted, out of stock, or missing the exact shade. Rather
 * than failing the whole request or silently adding a subset, this adds
 * whatever is still buyable and names what it couldn't, so the customer finds
 * out from the response instead of from a short bag.
 *
 * Quantities are clamped to current stock for the same reason — adding 5 of
 * something with 2 left would only fail later at checkout.
 */
router.post('/orders/:id/reorder', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const orderRes = await pool.query('SELECT id FROM orders WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.customer!.id,
  ]);
  if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

  const itemsRes = await pool.query(
    'SELECT product_id, variant_id, selected_size, quantity, product_name FROM order_items WHERE order_id = $1',
    [req.params.id]
  );

  const db = await loadDatabase();
  const added: string[] = [];
  const unavailable: { productName: string; reason: string }[] = [];

  for (const item of itemsRes.rows) {
    const product = findProduct(db.products, item.product_id);
    const name = product?.name || item.product_name;

    if (!product) {
      unavailable.push({ productName: name, reason: 'no longer available' });
      continue;
    }
    if (!isProductSellable(product)) {
      unavailable.push({ productName: name, reason: 'out of stock' });
      continue;
    }

    // A shade that has since been retired can't be silently swapped for a
    // different one — that would put something in the bag the customer never
    // chose.
    const shade = item.variant_id ? findShade(product, item.variant_id) : undefined;
    if (item.variant_id && !shade) {
      unavailable.push({ productName: name, reason: 'that shade is no longer sold' });
      continue;
    }
    // Same for a shade that still exists but has been paused — reported as
    // unavailable rather than quietly re-added and then refused at checkout.
    if (shade && !isShadeSelectable(product, shade.id)) {
      unavailable.push({ productName: name, reason: `${shade.name} is no longer sold` });
      continue;
    }

    const size = item.selected_size || null;
    if (size && !isValidSize(product, shade, size)) {
      unavailable.push({ productName: name, reason: 'that size is no longer sold' });
      continue;
    }

    const stock = getCurrentStock(product, shade, size);
    if (stock < 1) {
      unavailable.push({ productName: name, reason: 'out of stock' });
      continue;
    }

    const existing = await pool.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3 AND selected_size IS NOT DISTINCT FROM $4',
      [req.customer!.id, product.id, item.variant_id || null, size]
    );

    const desired = Math.max(1, Number(item.quantity) || 1);
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const newQty = Math.min(row.quantity + desired, stock);
      await pool.query('UPDATE cart_items SET quantity = $1, saved = false, updated_at = now() WHERE id = $2', [
        newQty,
        row.id,
      ]);
    } else {
      const id = 'cart-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      await pool.query(
        'INSERT INTO cart_items (id, user_id, product_id, variant_id, selected_size, quantity) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, req.customer!.id, product.id, item.variant_id || null, size, Math.min(desired, stock)]
      );
    }
    added.push(name);
  }

  const items = await hydrateCart(req.customer!.id);
  res.json({
    items,
    subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
    addedCount: added.length,
    unavailable,
  });
});

// ==========================================
// REVIEWS — one review per (product, customer); resubmitting edits it in
// place rather than creating a duplicate.
// ==========================================

router.get('/reviews', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const result = await pool.query('SELECT * FROM reviews WHERE customer_id = $1 ORDER BY created_at DESC', [req.customer!.id]);
  const reviews = result.rows.map((row) => mapReviewRow(row, findProduct(db.products, row.product_id)?.name));
  res.json({ reviews });
});

/**
 * Accepts the media list a review was submitted with.
 *
 * The URLs arrive from the client, so they are not taken on trust: each one
 * must be an HTTPS Cloudinary URL inside this store's own review folder.
 * Without that check a crafted request could point a review's "photo" at any
 * address on the internet, and the storefront would render it to every
 * shopper on that product page.
 */
function sanitizeReviewMedia(input: unknown): ReviewMedia[] | { error: string } {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return { error: 'Review media must be a list.' };
  if (input.length > REVIEW_MEDIA_MAX_ITEMS) {
    return { error: `You can attach up to ${REVIEW_MEDIA_MAX_ITEMS} photos or videos.` };
  }

  const cleaned: ReviewMedia[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { error: 'Review media is malformed.' };
    const { type, url, publicId } = raw as Record<string, unknown>;
    if (type !== 'image' && type !== 'video') return { error: 'Review media is malformed.' };
    if (typeof url !== 'string') return { error: 'Review media is malformed.' };

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { error: 'Review media is malformed.' };
    }
    const isOwnCloudinaryAsset =
      parsed.protocol === 'https:' &&
      parsed.hostname === 'res.cloudinary.com' &&
      parsed.pathname.includes('/glamirk-beauty/reviews/');
    if (!isOwnCloudinaryAsset) {
      return { error: 'Review media must be uploaded through Glamirk.' };
    }

    cleaned.push({
      type,
      url: parsed.toString(),
      publicId: typeof publicId === 'string' ? publicId.slice(0, 300) : undefined,
    });
  }
  return cleaned;
}

router.post('/reviews', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId, rating, title, comment } = req.body || {};
  // A star rating alone is a complete review; the text is optional.
  if (!productId || !rating) {
    return res.status(400).json({ error: 'Please choose a star rating.' });
  }
  const commentText = String(comment || '').trim().slice(0, 1000);

  const media = sanitizeReviewMedia(req.body?.media);
  if (!Array.isArray(media)) return res.status(400).json({ error: media.error });

  const db = await loadDatabase();
  const product = findProduct(db.products, productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const { shadeName, skinTone, undertone } = pickReviewDetails(product, req.body);

  // Our team may already have published this customer's off-site feedback for
  // one of their orders; a second review of the same purchase would double-count.
  const adminEntered = await pool.query(
    `SELECT 1 FROM reviews r JOIN orders o ON o.id = r.order_id
     WHERE r.source = 'admin' AND r.product_id = $1 AND o.user_id = $2 LIMIT 1`,
    [productId, req.customer!.id]
  );
  if (adminEntered.rows[0]) {
    return res.status(409).json({ error: 'Your feedback on this product is already published — thank you!' });
  }

  const numericRating = Math.max(1, Math.min(5, Math.round(Number(rating))));
  const custRes = await pool.query('SELECT name FROM customers WHERE id = $1', [req.customer!.id]);
  const customerName = custRes.rows[0]?.name || 'Glamirk Customer';
  const verified = await isVerifiedPurchase(req.customer!.id, productId);

  // This endpoint doubles as the edit path (ON CONFLICT below), so any media
  // the customer detached while editing has to be read before the overwrite —
  // afterwards there is nothing left pointing at the orphaned assets.
  const priorRes = await pool.query('SELECT media FROM reviews WHERE product_id = $1 AND customer_id = $2', [
    productId,
    req.customer!.id,
  ]);
  const isEdit = priorRes.rows.length > 0;
  const priorMedia: ReviewMedia[] = Array.isArray(priorRes.rows[0]?.media) ? priorRes.rows[0].media : [];

  // Every write — new or edited — goes back to 'pending': an approved review
  // can't be swapped for unreviewed text by editing it.
  const id = 'rev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    `INSERT INTO reviews (id, product_id, customer_id, customer_name, rating, title, comment, is_verified_purchase, media,
                          shade_name, skin_tone, undertone, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, 'pending')
     ON CONFLICT (product_id, customer_id) DO UPDATE SET
       rating = EXCLUDED.rating, title = EXCLUDED.title, comment = EXCLUDED.comment,
       is_verified_purchase = EXCLUDED.is_verified_purchase, media = EXCLUDED.media,
       shade_name = EXCLUDED.shade_name, skin_tone = EXCLUDED.skin_tone, undertone = EXCLUDED.undertone,
       status = 'pending', moderation_note = NULL, moderated_at = NULL, created_at = now()`,
    [
      id,
      productId,
      req.customer!.id,
      customerName,
      numericRating,
      String(title || '').trim().slice(0, 100) || null,
      commentText,
      verified,
      JSON.stringify(media),
      shadeName,
      skinTone,
      undertone,
    ]
  );

  // An edit pulls a previously approved rating out of the average until it is
  // re-approved. Reward points are granted on approval (admin route), not here.
  await recomputeProductRating(productId);

  await destroyReviewMedia(orphanedReviewMedia(priorMedia, media));

  await notifyAdminReviewSubmitted(product.name, numericRating, isEdit);

  const saved = await pool.query('SELECT * FROM reviews WHERE product_id = $1 AND customer_id = $2', [productId, req.customer!.id]);
  res.json({ review: mapReviewRow(saved.rows[0], product.name) });
});

// Helpful votes. A vote is a toggle; only approved reviews can be voted on,
// and never your own.
router.get('/reviews/helpful', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT review_id FROM review_helpful_votes WHERE customer_id = $1', [req.customer!.id]);
  res.json({ reviewIds: result.rows.map((r) => r.review_id) });
});

router.post('/reviews/:id/helpful', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const review = await pool.query("SELECT customer_id FROM reviews WHERE id = $1 AND status = 'approved'", [req.params.id]);
  if (review.rows.length === 0) return res.status(404).json({ error: 'Review not found.' });
  if (review.rows[0].customer_id === req.customer!.id) {
    return res.status(400).json({ error: "You can't vote on your own review." });
  }
  const removed = await pool.query('DELETE FROM review_helpful_votes WHERE review_id = $1 AND customer_id = $2', [
    req.params.id,
    req.customer!.id,
  ]);
  if (removed.rowCount === 0) {
    await pool.query('INSERT INTO review_helpful_votes (review_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      req.params.id,
      req.customer!.id,
    ]);
  }
  const count = await pool.query('SELECT COUNT(*)::int AS n FROM review_helpful_votes WHERE review_id = $1', [req.params.id]);
  res.json({ helpful: removed.rowCount === 0, helpfulCount: count.rows[0].n });
});

// Products this customer has received and may therefore review, each paired
// with their existing review if they've already written one. Purchase
// eligibility is derived from their own DELIVERED orders — a client can't
// nominate a product it didn't buy.
router.get('/reviews/eligible', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const result = await pool.query(
    `SELECT DISTINCT ON (oi.product_id)
        oi.product_id, oi.product_name, o.id AS order_id, o.order_number, o.created_at
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 AND o.status = 'DELIVERED'
     ORDER BY oi.product_id, o.created_at DESC`,
    [req.customer!.id]
  );

  const reviewsRes = await pool.query('SELECT * FROM reviews WHERE customer_id = $1', [req.customer!.id]);
  const reviewByProduct = new Map<string, any>(reviewsRes.rows.map((r) => [r.product_id, r]));

  const products = result.rows.map((row) => {
    const product = findProduct(db.products, row.product_id);
    const existing = reviewByProduct.get(row.product_id);
    return {
      productId: row.product_id,
      productName: product?.name || row.product_name,
      productImage: product?.images?.primary || '',
      orderId: row.order_id,
      orderNumber: row.order_number,
      deliveredAt: new Date(row.created_at).toISOString(),
      existingReview: existing ? mapReviewRow(existing, product?.name || row.product_name) : undefined,
    };
  });

  res.json({ products });
});

router.delete('/reviews/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'DELETE FROM reviews WHERE id = $1 AND customer_id = $2 RETURNING product_id, media',
    [req.params.id, req.customer!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Review not found.' });
  }
  // The product's aggregate rating has to be rebuilt from what's left, or a
  // deleted 1-star would keep dragging the average down forever.
  await recomputeProductRating(result.rows[0].product_id);
  // Deleting the row is what the customer asked for; dropping the photos it
  // pointed at is the rest of honouring that, so they don't stay publicly
  // fetchable after the review is gone.
  await destroyReviewMedia(result.rows[0].media);
  res.json({ success: true });
});

// ==========================================
// RETURNS — only from DELIVERED orders; one active request per (order, product).
// ==========================================

router.get('/returns', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    `SELECT r.*, o.order_number FROM return_requests r
     JOIN orders o ON o.id = r.order_id
     WHERE r.customer_id = $1 ORDER BY r.created_at DESC`,
    [req.customer!.id]
  );
  res.json({ returns: result.rows.map(mapReturnRequestRow) });
});

router.post('/orders/:orderId/returns', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId, reason, comment } = req.body || {};
  if (!productId || !String(reason || '').trim()) {
    return res.status(400).json({ error: 'Please select a product and a return reason.' });
  }

  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.orderId, req.customer!.id]);
  const order = orderRes.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status !== 'DELIVERED') {
    return res.status(400).json({ error: 'Returns can only be requested for delivered orders.' });
  }

  const itemRes = await pool.query('SELECT * FROM order_items WHERE order_id = $1 AND product_id = $2', [order.id, productId]);
  const item = itemRes.rows[0];
  if (!item) return res.status(404).json({ error: 'This product was not part of this order.' });

  const existing = await pool.query('SELECT id FROM return_requests WHERE order_id = $1 AND product_id = $2', [order.id, productId]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'A return request for this item has already been submitted.' });
  }

  const db = await loadDatabase();
  const product = findProduct(db.products, productId);

  const id = 'ret-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    `INSERT INTO return_requests (id, order_id, customer_id, product_id, product_name, product_image, reason, comment, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUBMITTED')`,
    [id, order.id, req.customer!.id, productId, item.product_name, product?.images?.primary || '', reason, comment || null]
  );

  const created = await pool.query(
    `SELECT r.*, o.order_number FROM return_requests r JOIN orders o ON o.id = r.order_id WHERE r.id = $1`,
    [id]
  );
  res.json({ return: mapReturnRequestRow(created.rows[0]) });
});

// ==========================================
// NOTIFICATIONS
// ==========================================

router.get('/notifications', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.customer!.id]);
  res.json({ notifications: result.rows.map(mapNotificationRow) });
});

router.post('/notifications/:id/read', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  res.json({ success: true });
});

router.post('/notifications/read-all', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.customer!.id]);
  res.json({ success: true });
});

export default router;
