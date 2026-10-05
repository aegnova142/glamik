import express, { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { pool, loadDatabase } from '../db/db';
import { requireCustomer, AuthenticatedCustomerRequest } from '../middleware/requireCustomer';
import { rateLimit } from '../middleware/rateLimit';
import { signCustomerToken, bumpTokenVersion, invalidateAccountCache } from '../auth/tokens';
import { createSession, deleteSession, deleteAllSessions } from '../auth/sessions';
import { buildOrderFromRow } from '../services/orders.service';
import { buildOrderTracking } from '../services/shipping.service';
import { getRewardsSummary, getRewardPoints, getAccountCoupons, countAvailableCoupons } from '../services/rewards.service';
import { sendAccountEmail } from '../services/email.service';
import {
  AccountOverview,
  CustomerProfile,
  CustomerSession,
  DEFAULT_NOTIFICATION_PREFERENCES,
  Gender,
  GENDER_OPTIONS,
  GlamProfile,
  NOTIFICATION_TOPIC_META,
  NotificationChannel,
  NotificationPreferences,
  NotificationTopic,
  OrderStatus,
  PaymentMethodType,
  PaymentRecord,
  PaymentsSummary,
  Product,
  RefundRecord,
  ReturnStatus,
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_MEDIA_MAX_ITEMS,
  REVIEW_VIDEO_MAX_BYTES,
  ReviewMedia,
  ShadeHistoryEntry,
  SupportTicket,
  SUPPORT_TICKET_TOPICS,
  TryOnHistoryEntry,
  TryOnMode,
} from '@glamirk/shared/types';

// ==========================================
// CUSTOMER ACCOUNT
//
// Every route here is behind requireCustomer and scopes its queries by
// req.customer!.id. No endpoint accepts a user id from the client — the
// authenticated session is the only source of identity, so there is no
// parameter an attacker could swap to read someone else's data.
// ==========================================

const router = express.Router();

cloudinary.config();

// Avatars are photos, not media-library assets: images only, and small.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Profile photos must be a JPEG, PNG or WebP image.'));
    }
  },
});

// Review media: photos and short clips attached to a written review. Larger
// ceiling than an avatar because a video is allowed, and the per-type limit
// is enforced below once the real type is known.
const reviewMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REVIEW_VIDEO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Review media must be a JPEG, PNG or WebP image, or an MP4, MOV or WebM video.'));
    }
  },
});

/** Magic-byte check. mimetype and filename both come from the client and can
 * say anything; this reads what the bytes actually are before the file is
 * ever stored or served back. */
function isRealImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return jpeg || png || webp;
}

/** Same idea as isRealImageBuffer, for the video formats reviews accept.
 * MP4/MOV share the ISO base-media container ('ftyp' at offset 4); WebM is a
 * Matroska EBML stream. */
function isRealVideoBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const isoBmff = buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  const webm = buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return isoBmff || webm;
}

function uploadReviewMediaToCloudinary(
  buffer: Buffer,
  kind: 'image' | 'video'
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    // Videos are transcoded server-side by Cloudinary, so they get a longer
    // ceiling than the 30s an avatar needs.
    const timeoutMs = kind === 'video' ? 120000 : 30000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Cloudinary upload timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'glamirk-beauty/reviews',
        // Pinned to the type the bytes were actually verified as — never
        // 'auto', which would let an unexpected format land as a raw asset.
        resource_type: kind,
        // No fixed public_id: unlike an avatar (one per customer, overwritten)
        // a review can carry several items and they must not clobber each
        // other. Cloudinary assigns a unique id.
        transformation:
          kind === 'image'
            ? [{ width: 1280, height: 1280, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
            : [{ width: 720, height: 1280, crop: 'limit', quality: 'auto' }],
      },
      (err, result) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        if (err || !result) return reject(err || new Error('Cloudinary upload failed'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

function uploadAvatarToCloudinary(buffer: Buffer, userId: string): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Cloudinary upload timed out after 30s'));
    }, 30000);
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'glamirk-beauty/avatars',
        // resource_type is pinned to 'image' (not 'auto') so nothing that
        // slipped past the checks above can land as an executable/raw asset.
        resource_type: 'image',
        public_id: `avatar-${userId}`,
        overwrite: true,
        transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }],
      },
      (err, result) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        if (err || !result) return reject(err || new Error('Cloudinary upload failed'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/** Formats a Postgres DATE as YYYY-MM-DD.
 *
 * node-postgres parses a DATE column into a JS Date at *local* midnight, so
 * calling .toISOString() on it shifts the day backwards in any timezone east
 * of UTC — a date of birth saved as 1996-04-12 would read back as 1996-04-11
 * in IST. Reading the local calendar components avoids the round trip through
 * UTC entirely. A plain string (what some drivers return) passes through. */
function formatDateOnly(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function mapProfileRow(row: any): CustomerProfile {
  return {
    id: row.id,
    name: row.name,
    firstName: row.first_name || undefined,
    lastName: row.last_name || undefined,
    email: row.email,
    phone: row.phone || undefined,
    avatarUrl: row.avatar_url || undefined,
    dateOfBirth: formatDateOnly(row.date_of_birth),
    gender: row.gender || undefined,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
    createdAt: new Date(row.created_at).toISOString(),
    deletionRequestedAt: row.deletion_requested_at ? new Date(row.deletion_requested_at).toISOString() : undefined,
  };
}

async function loadProfile(userId: string): Promise<CustomerProfile | null> {
  const res = await pool.query('SELECT * FROM customers WHERE id = $1', [userId]);
  return res.rows[0] ? mapProfileRow(res.rows[0]) : null;
}

// ==========================================
// PROFILE
// ==========================================

router.get('/account/profile', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const profile = await loadProfile(req.customer!.id);
  if (!profile) return res.status(404).json({ error: 'Account not found.' });
  res.json({ profile });
});

router.put('/account/profile', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { firstName, lastName, phone, dateOfBirth, gender } = req.body || {};

  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  if (!first) return res.status(400).json({ error: 'First name is required.' });
  if (first.length > 60 || last.length > 60) return res.status(400).json({ error: 'Please enter a shorter name.' });

  const rawPhone = String(phone || '').trim();
  let normalizedPhone: string | null = null;
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    const significant = digits.length > 10 ? digits.slice(-10) : digits;
    if (significant.length !== 10 || !/^[6-9]/.test(significant)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
    }
    normalizedPhone = rawPhone;
  }

  let dob: string | null = null;
  if (dateOfBirth) {
    const raw = String(dateOfBirth).trim();
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Please enter a valid date of birth.' });
    }
    if (parsed.getTime() > Date.now()) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
    }
    // An <input type="date"> already sends exactly the calendar date the user
    // picked; passing it through untouched avoids a pointless round trip
    // through UTC that can shift the day either way depending on timezone.
    dob = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : parsed.toISOString().slice(0, 10);
  }

  // Validated against the same list the column's CHECK constraint allows, so
  // a bad value is a 400 rather than a 500 from the database. Empty clears it.
  let normalizedGender: Gender | null = null;
  if (gender) {
    const candidate = String(gender).trim();
    if (!GENDER_OPTIONS.some((o) => o.value === candidate)) {
      return res.status(400).json({ error: 'Please choose a valid option for gender.' });
    }
    normalizedGender = candidate as Gender;
  }

  // Changing the number invalidates any previous verification of it.
  const currentRes = await pool.query('SELECT phone, phone_verified FROM customers WHERE id = $1', [req.customer!.id]);
  const phoneChanged = (currentRes.rows[0]?.phone || null) !== normalizedPhone;

  // `name` stays the canonical display name every other query already reads,
  // so it's recomposed here rather than left to drift from first/last.
  const fullName = [first, last].filter(Boolean).join(' ');

  await pool.query(
    `UPDATE customers SET first_name = $1, last_name = $2, name = $3, phone = $4, date_of_birth = $5,
       gender = $6,
       phone_verified = CASE WHEN $7 THEN false ELSE phone_verified END
     WHERE id = $8`,
    [first, last || null, fullName, normalizedPhone, dob, normalizedGender, phoneChanged, req.customer!.id]
  );

  res.json({ profile: await loadProfile(req.customer!.id) });
});

router.post(
  '/account/profile/avatar',
  requireCustomer,
  avatarUpload.single('file'),
  async (req: AuthenticatedCustomerRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });
    if (!isRealImageBuffer(req.file.buffer)) {
      return res.status(400).json({ error: 'That file is not a valid JPEG, PNG or WebP image.' });
    }

    let uploaded: { url: string; publicId: string };
    try {
      uploaded = await uploadAvatarToCloudinary(req.file.buffer, req.customer!.id);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      return res.status(502).json({ error: 'Could not upload your photo right now. Please try again.' });
    }

    // Cloudinary caches aggressively on a fixed public_id, so the version
    // segment in the returned URL is what makes a replacement actually show.
    await pool.query('UPDATE customers SET avatar_url = $1 WHERE id = $2', [uploaded.url, req.customer!.id]);
    res.json({ profile: await loadProfile(req.customer!.id) });
  }
);

router.delete('/account/profile/avatar', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  try {
    await cloudinary.uploader.destroy(`glamirk-beauty/avatars/avatar-${req.customer!.id}`, { resource_type: 'image' });
  } catch (err) {
    // Storage cleanup is best-effort — the profile must still lose the photo.
    console.error('Failed to remove avatar from storage:', err);
  }
  await pool.query('UPDATE customers SET avatar_url = NULL WHERE id = $1', [req.customer!.id]);
  res.json({ profile: await loadProfile(req.customer!.id) });
});

// ==========================================
// EMAIL / PHONE VERIFICATION
// ==========================================

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const verificationLimiter = rateLimit({
  scope: 'account-verify',
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: 'Too many verification requests. Please try again later.',
});

router.post(
  '/account/profile/send-email-verification',
  requireCustomer,
  verificationLimiter,
  async (req: AuthenticatedCustomerRequest, res: Response) => {
    const userRes = await pool.query('SELECT email, name, email_verified FROM customers WHERE id = $1', [req.customer!.id]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.email_verified) return res.json({ success: true, alreadyVerified: true });

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'UPDATE customers SET email_verification_token = $1, email_verification_expiry = $2 WHERE id = $3',
      [token, new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS), req.customer!.id]
    );

    const configuredAppUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null;
    const appUrl = configuredAppUrl || `${req.protocol}://${req.get('host')}`;
    const link = `${appUrl}/account/profile?verifyEmail=${token}`;

    const sent = await sendAccountEmail({
      toEmail: user.email,
      subject: 'Confirm your Glamirk email address',
      heading: 'Confirm your email',
      message: `Hello ${user.name || 'there'}, please confirm this is your email address so we can send you order updates. This link expires in 24 hours.`,
      ctaLabel: 'CONFIRM EMAIL',
      ctaUrl: link,
    });

    // With no SMTP configured the token comes back in the response so the
    // flow still completes end to end — the same fallback the existing
    // forgot-password route already uses.
    res.json({ success: true, emailSent: sent, verificationToken: sent ? undefined : token });
  }
);

router.post('/account/profile/verify-email', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'A verification token is required.' });

  const result = await pool.query(
    'SELECT id, email_verification_expiry FROM customers WHERE id = $1 AND email_verification_token = $2',
    [req.customer!.id, token]
  );
  const row = result.rows[0];
  if (!row || !row.email_verification_expiry || new Date(row.email_verification_expiry).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This verification link is invalid or has expired. Please request a new one.' });
  }

  await pool.query(
    'UPDATE customers SET email_verified = true, email_verification_token = NULL, email_verification_expiry = NULL WHERE id = $1',
    [req.customer!.id]
  );
  res.json({ profile: await loadProfile(req.customer!.id) });
});

// Mobile verification needs an SMS gateway, and Glamirk has none configured.
// This endpoint says so plainly rather than pretending to send a code — the
// UI reads `available: false` and explains the state instead of showing an
// OTP box that could never work.
router.post('/account/profile/send-phone-verification', requireCustomer, async (_req: AuthenticatedCustomerRequest, res: Response) => {
  res.status(503).json({
    available: false,
    error: 'Mobile verification is not available yet — an SMS provider has not been connected to this store.',
  });
});

// ==========================================
// SECURITY — password, sessions, deletion
// ==========================================

router.post(
  '/account/change-password',
  requireCustomer,
  rateLimit({ scope: 'account-password', windowMs: 60 * 60 * 1000, max: 10 }),
  async (req: AuthenticatedCustomerRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Your current and new passwords are both required.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Your new password must be at least 8 characters.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Your new password must be different from your current one.' });
    }

    const userRes = await pool.query('SELECT password_hash, email FROM customers WHERE id = $1', [req.customer!.id]);
    const user = userRes.rows[0];
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Your current password is incorrect.' });
    }

    await pool.query('UPDATE customers SET password_hash = $1 WHERE id = $2', [
      bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10)),
      req.customer!.id,
    ]);

    // Changing a password signs out every other device — that is the whole
    // point of changing it. The device that made the change gets a freshly
    // signed token so it isn't logged out of the screen it's standing on.
    const tokenVersion = await bumpTokenVersion(req.customer!.id);
    await deleteAllSessions(req.customer!.id, req.customer!.sessionId);
    const sessionId = req.customer!.sessionId || (await createSession(req.customer!.id, req));
    const token = signCustomerToken(req.customer!.id, user.email, tokenVersion, sessionId);

    res.json({ success: true, token });
  }
);

function describeDevice(userAgent?: string | null): string {
  const ua = String(userAgent || '');
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
    ? 'Opera'
    : /Chrome\//.test(ua)
    ? 'Chrome'
    : /Safari\//.test(ua)
    ? 'Safari'
    : /Firefox\//.test(ua)
    ? 'Firefox'
    : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(ua)
    ? 'iOS'
    : /Mac OS X/.test(ua)
    ? 'macOS'
    : /Linux/.test(ua)
    ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

router.get('/account/sessions', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM customer_sessions WHERE user_id = $1 ORDER BY last_seen_at DESC', [
    req.customer!.id,
  ]);
  const sessions: CustomerSession[] = result.rows.map((row) => ({
    id: row.id,
    userAgent: describeDevice(row.user_agent),
    ipAddress: row.ip_address || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    isCurrent: row.id === req.customer!.sessionId,
  }));
  res.json({ sessions });
});

router.delete('/account/sessions/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  // Retiring one device's row doesn't move token_version (that would sign
  // everyone out), so this is a tidy-up of the device list rather than a
  // revocation. "Log out of all devices" below is the real revocation.
  await deleteSession(req.customer!.id, req.params.id);
  res.json({ success: true });
});

router.post('/account/sessions/logout-all', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const userRes = await pool.query('SELECT email FROM customers WHERE id = $1', [req.customer!.id]);
  const email = userRes.rows[0]?.email;

  const tokenVersion = await bumpTokenVersion(req.customer!.id);
  await deleteAllSessions(req.customer!.id);
  const sessionId = await createSession(req.customer!.id, req);
  const token = signCustomerToken(req.customer!.id, email, tokenVersion, sessionId);

  res.json({ success: true, token });
});

const ACCOUNT_DELETION_GRACE_DAYS = 7;

router.post('/account/delete', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { password, confirmation } = req.body || {};
  // Two independent confirmations: typing the word, and proving it's really
  // this person at the keyboard. Neither alone is enough.
  if (String(confirmation || '').trim().toUpperCase() !== 'DELETE') {
    return res.status(400).json({ error: 'Please type DELETE to confirm you want to close your account.' });
  }

  const userRes = await pool.query('SELECT password_hash FROM customers WHERE id = $1', [req.customer!.id]);
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (!password || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Please enter your current password to confirm.' });
  }

  // Scheduled rather than immediate: the account keeps working through the
  // grace window so an accidental or coerced deletion can be undone by the
  // owner without needing support.
  await pool.query('UPDATE customers SET deletion_requested_at = now() WHERE id = $1', [req.customer!.id]);
  invalidateAccountCache(req.customer!.id);

  res.json({
    success: true,
    scheduledFor: new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    profile: await loadProfile(req.customer!.id),
  });
});

router.post('/account/delete/cancel', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('UPDATE customers SET deletion_requested_at = NULL WHERE id = $1', [req.customer!.id]);
  invalidateAccountCache(req.customer!.id);
  res.json({ success: true, profile: await loadProfile(req.customer!.id) });
});

/** Closes accounts whose grace window has elapsed. The row itself is kept —
 * orders reference it and must stay intact for accounting — but the account
 * is locked out, personal details are cleared, and every session is dropped. */
export async function processScheduledAccountDeletions(): Promise<number> {
  const due = await pool.query(
    `SELECT id FROM customers
     WHERE deletion_requested_at IS NOT NULL
       AND deleted_at IS NULL
       AND deletion_requested_at < now() - ($1 || ' days')::interval`,
    [String(ACCOUNT_DELETION_GRACE_DAYS)]
  );

  for (const row of due.rows) {
    await pool.query(
      `UPDATE customers SET
         deleted_at = now(),
         token_version = token_version + 1,
         name = 'Closed Account',
         first_name = NULL,
         last_name = NULL,
         phone = NULL,
         avatar_url = NULL,
         date_of_birth = NULL,
         email = 'deleted-' || id || '@glamirk.invalid',
         reset_token = NULL,
         reset_token_expiry = NULL,
         email_verification_token = NULL
       WHERE id = $1`,
      [row.id]
    );
    await pool.query('DELETE FROM customer_sessions WHERE user_id = $1', [row.id]);
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [row.id]);
    invalidateAccountCache(row.id);
  }

  if (due.rows.length > 0) {
    console.log(`Closed ${due.rows.length} account(s) past their deletion grace window.`);
  }
  return due.rows.length;
}

// ==========================================
// GLAM (BEAUTY) PROFILE
// ==========================================

function mapGlamProfileRow(row: any): GlamProfile {
  return {
    skinTone: row.skin_tone || undefined,
    undertone: row.undertone || undefined,
    skinType: row.skin_type || undefined,
    primaryConcern: row.primary_concern || undefined,
    finishPreference: row.finish_preference || undefined,
    stylePreference: row.style_preference || undefined,
    occasion: row.occasion || undefined,
    makeupPreferences: row.makeup_preferences || [],
    beautyInterests: row.beauty_interests || [],
    preferredLooks: row.preferred_looks || [],
    preferredShadeIds: row.preferred_shade_ids || [],
    notes: row.notes || undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

/** Caps a client-supplied string list so a crafted request can't stuff
 * unbounded JSON into the row. */
function sanitizeStringList(value: any, maxItems = 25, maxLength = 80): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((v) => v.slice(0, maxLength));
}

function sanitizeText(value: any, maxLength = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

router.get('/account/glam-profile', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM beauty_profiles WHERE user_id = $1', [req.customer!.id]);
  res.json({ glamProfile: result.rows[0] ? mapGlamProfileRow(result.rows[0]) : null });
});

router.put('/account/glam-profile', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const b = req.body || {};
  await pool.query(
    `INSERT INTO beauty_profiles
      (user_id, skin_tone, undertone, skin_type, primary_concern, finish_preference, style_preference, occasion,
       makeup_preferences, beauty_interests, preferred_looks, preferred_shade_ids, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, now())
     ON CONFLICT (user_id) DO UPDATE SET
       skin_tone = EXCLUDED.skin_tone,
       undertone = EXCLUDED.undertone,
       skin_type = EXCLUDED.skin_type,
       primary_concern = EXCLUDED.primary_concern,
       finish_preference = EXCLUDED.finish_preference,
       style_preference = EXCLUDED.style_preference,
       occasion = EXCLUDED.occasion,
       makeup_preferences = EXCLUDED.makeup_preferences,
       beauty_interests = EXCLUDED.beauty_interests,
       preferred_looks = EXCLUDED.preferred_looks,
       preferred_shade_ids = EXCLUDED.preferred_shade_ids,
       notes = EXCLUDED.notes,
       updated_at = now()`,
    [
      req.customer!.id,
      sanitizeText(b.skinTone, 40),
      sanitizeText(b.undertone, 40),
      sanitizeText(b.skinType, 40),
      sanitizeText(b.primaryConcern, 120),
      sanitizeText(b.finishPreference, 40),
      sanitizeText(b.stylePreference, 40),
      sanitizeText(b.occasion, 60),
      JSON.stringify(sanitizeStringList(b.makeupPreferences)),
      JSON.stringify(sanitizeStringList(b.beautyInterests)),
      JSON.stringify(sanitizeStringList(b.preferredLooks)),
      JSON.stringify(sanitizeStringList(b.preferredShadeIds)),
      sanitizeText(b.notes, 500),
    ]
  );

  const result = await pool.query('SELECT * FROM beauty_profiles WHERE user_id = $1', [req.customer!.id]);
  res.json({ glamProfile: mapGlamProfileRow(result.rows[0]) });
});

// ==========================================
// SHADE AI HISTORY
// ==========================================

function mapShadeHistoryRow(row: any): ShadeHistoryEntry {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    skinTone: row.skin_tone || undefined,
    undertone: row.undertone || undefined,
    occasion: row.occasion || undefined,
    finishPreference: row.finish_preference || undefined,
    stylePreference: row.style_preference || undefined,
    answers: row.answers || {},
    recommendedProductId: row.recommended_product_id || undefined,
    recommendedShadeId: row.recommended_shade_id || undefined,
    recommendedShadeName: row.recommended_shade_name || undefined,
    recommendedShadeHex: row.recommended_shade_hex || undefined,
    matchReason: row.match_reason || undefined,
    recommendedProductIds: row.recommended_product_ids || [],
  };
}

router.get('/account/shade-history', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM shade_ai_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [
    req.customer!.id,
  ]);
  res.json({ history: result.rows.map(mapShadeHistoryRow) });
});

router.post('/account/shade-history', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const b = req.body || {};
  const id = 'shade-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const answers =
    b.answers && typeof b.answers === 'object' && !Array.isArray(b.answers)
      ? Object.fromEntries(
          Object.entries(b.answers)
            .slice(0, 30)
            .map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)])
        )
      : {};

  await pool.query(
    `INSERT INTO shade_ai_history
      (id, user_id, skin_tone, undertone, occasion, finish_preference, style_preference, answers,
       recommended_product_id, recommended_shade_id, recommended_shade_name, recommended_shade_hex,
       match_reason, recommended_product_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14::jsonb)`,
    [
      id,
      req.customer!.id,
      sanitizeText(b.skinTone, 40),
      sanitizeText(b.undertone, 40),
      sanitizeText(b.occasion, 60),
      sanitizeText(b.finishPreference, 40),
      sanitizeText(b.stylePreference, 40),
      JSON.stringify(answers),
      sanitizeText(b.recommendedProductId, 120),
      sanitizeText(b.recommendedShadeId, 120),
      sanitizeText(b.recommendedShadeName, 120),
      sanitizeText(b.recommendedShadeHex, 20),
      sanitizeText(b.matchReason, 400),
      JSON.stringify(sanitizeStringList(b.recommendedProductIds, 20, 120)),
    ]
  );

  const created = await pool.query('SELECT * FROM shade_ai_history WHERE id = $1', [id]);
  res.json({ entry: mapShadeHistoryRow(created.rows[0]) });
});

router.delete('/account/shade-history/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('DELETE FROM shade_ai_history WHERE id = $1 AND user_id = $2 RETURNING id', [
    req.params.id,
    req.customer!.id,
  ]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'That shade result was not found.' });
  res.json({ success: true });
});

// ==========================================
// NOTIFICATION PREFERENCES
// ==========================================

const VALID_CHANNELS: NotificationChannel[] = ['inApp', 'email', 'sms', 'whatsapp', 'push'];
const VALID_TOPICS = NOTIFICATION_TOPIC_META.map((t) => t.id);
const REQUIRED_TOPICS = NOTIFICATION_TOPIC_META.filter((t) => t.required).map((t) => t.id);

/** Stored preferences are merged over the defaults rather than replacing
 * them, so a topic added to the app later gets its default for every existing
 * customer instead of silently reading as "off". */
function mergePreferences(stored: any): NotificationPreferences {
  const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES } as NotificationPreferences;
  if (!stored || typeof stored !== 'object') return merged;
  for (const topic of VALID_TOPICS) {
    const entry = stored[topic];
    if (!entry || typeof entry !== 'object') continue;
    const channels = Array.isArray(entry.channels)
      ? entry.channels.filter((c: any): c is NotificationChannel => VALID_CHANNELS.includes(c))
      : merged[topic].channels;
    merged[topic] = {
      enabled: REQUIRED_TOPICS.includes(topic) ? true : !!entry.enabled,
      channels,
    };
  }
  return merged;
}

router.get('/account/notification-preferences', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT preferences FROM notification_preferences WHERE user_id = $1', [req.customer!.id]);
  res.json({ preferences: mergePreferences(result.rows[0]?.preferences) });
});

router.put('/account/notification-preferences', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  // Unknown topics and channels are dropped, and transactional topics are
  // forced back on — a client can't switch off order updates for an order it
  // placed, and can't invent a delivery channel the store doesn't support.
  const cleaned = mergePreferences(req.body?.preferences);

  await pool.query(
    `INSERT INTO notification_preferences (user_id, preferences, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = now()`,
    [req.customer!.id, JSON.stringify(cleaned)]
  );

  res.json({ preferences: cleaned });
});

// ==========================================
// RECENTLY VIEWED
// ==========================================

const RECENTLY_VIEWED_LIMIT = 24;

router.get('/account/recently-viewed', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const result = await pool.query(
    'SELECT product_id, viewed_at FROM recently_viewed WHERE user_id = $1 ORDER BY viewed_at DESC LIMIT $2',
    [req.customer!.id, RECENTLY_VIEWED_LIMIT]
  );
  // A product the admin has since deleted simply drops out of the list rather
  // than rendering as a broken card.
  const items = result.rows
    .map((row) => {
      const product = db.products.find((p: Product) => p.id === row.product_id);
      return product ? { product, viewedAt: new Date(row.viewed_at).toISOString() } : null;
    })
    .filter(Boolean);
  res.json({ items });
});

router.post('/account/recently-viewed', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  // Accepts one id or a batch — the batch form is what merges a guest's
  // device-local history into their account at login.
  const ids: string[] = Array.isArray(req.body?.productIds)
    ? sanitizeStringList(req.body.productIds, RECENTLY_VIEWED_LIMIT, 120)
    : req.body?.productId
    ? [String(req.body.productId).slice(0, 120)]
    : [];
  if (ids.length === 0) return res.status(400).json({ error: 'A product id is required.' });

  const db = await loadDatabase();
  const known = ids.filter((id) => db.products.some((p: Product) => p.id === id));
  if (known.length === 0) return res.status(404).json({ error: 'Product not found.' });

  for (const productId of known) {
    const id = 'rv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await pool.query(
      `INSERT INTO recently_viewed (id, user_id, product_id, viewed_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, product_id) DO UPDATE SET viewed_at = now()`,
      [id, req.customer!.id, productId]
    );
  }

  // Trim to the newest N so the table can't grow without bound per customer.
  await pool.query(
    `DELETE FROM recently_viewed
     WHERE user_id = $1 AND product_id NOT IN (
       SELECT product_id FROM recently_viewed WHERE user_id = $1 ORDER BY viewed_at DESC LIMIT $2
     )`,
    [req.customer!.id, RECENTLY_VIEWED_LIMIT]
  );

  res.json({ success: true, recorded: known.length });
});

router.delete('/account/recently-viewed', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('DELETE FROM recently_viewed WHERE user_id = $1', [req.customer!.id]);
  res.json({ success: true });
});

// Removing one product rather than the whole history. Scoped by user_id as
// well as product_id, so the id in the URL can only ever delete the caller's
// own row — there is nothing to enumerate here.
router.delete(
  '/account/recently-viewed/:productId',
  requireCustomer,
  async (req: AuthenticatedCustomerRequest, res: Response) => {
    await pool.query('DELETE FROM recently_viewed WHERE user_id = $1 AND product_id = $2', [
      req.customer!.id,
      req.params.productId,
    ]);
    // Deliberately not a 404 when the row is already gone: the end state the
    // caller asked for is the end state they have, and a double-click on
    // "remove" shouldn't surface an error.
    res.json({ success: true });
  }
);

// ==========================================
// REWARDS & COUPONS
// ==========================================

router.get('/account/rewards', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  res.json({ rewards: await getRewardsSummary(req.customer!.id) });
});

router.get('/account/coupons', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  res.json({ coupons: await getAccountCoupons(req.customer!.id) });
});

// ==========================================
// DASHBOARD OVERVIEW
// ==========================================

router.get('/account/overview', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const userId = req.customer!.id;

  const [
    ordersRes,
    wishlistRes,
    notificationsRes,
    reviewableRes,
    recentlyViewedRes,
    ticketsRes,
    refundsRes,
    points,
    availableCoupons,
  ] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED', 'CANCELLED'))::int AS active
       FROM orders WHERE user_id = $1`,
      [userId]
    ),
    pool.query('SELECT COUNT(*)::int AS n FROM wishlist_items WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = false', [userId]),
    // Delivered products with no review from this customer yet.
    pool.query(
      `SELECT COUNT(DISTINCT oi.product_id)::int AS n
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN reviews r ON r.product_id = oi.product_id AND r.customer_id = $1
       WHERE o.user_id = $1 AND o.status = 'DELIVERED' AND r.id IS NULL`,
      [userId]
    ),
    pool.query('SELECT COUNT(*)::int AS n FROM recently_viewed WHERE user_id = $1', [userId]),
    pool.query("SELECT COUNT(*)::int AS n FROM support_tickets WHERE user_id = $1 AND status <> 'CLOSED'", [userId]),
    // A return is "pending" until the money has actually gone back.
    pool.query("SELECT COUNT(*)::int AS n FROM return_requests WHERE customer_id = $1 AND status <> 'REFUNDED'", [userId]),
    getRewardPoints(userId),
    countAvailableCoupons(userId),
  ]);

  const overview: AccountOverview = {
    totalOrders: ordersRes.rows[0]?.total || 0,
    activeOrders: ordersRes.rows[0]?.active || 0,
    wishlistCount: wishlistRes.rows[0]?.n || 0,
    rewardPoints: points,
    availableCoupons,
    unreadNotifications: notificationsRes.rows[0]?.n || 0,
    pendingReviews: reviewableRes.rows[0]?.n || 0,
    recentlyViewedCount: recentlyViewedRes.rows[0]?.n || 0,
    openSupportTickets: ticketsRes.rows[0]?.n || 0,
    pendingRefunds: refundsRes.rows[0]?.n || 0,
  };

  res.json({ overview });
});

// ==========================================
// ORDER TRACKING & INVOICE
// ==========================================

router.get('/account/orders/:id/tracking', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const db = await loadDatabase();
  const order = await buildOrderFromRow(row, db);

  const tracking = await buildOrderTracking({
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    timeline: order.timeline,
    estimatedDelivery: order.estimatedDelivery,
    trackingNumber: row.tracking_number,
    courierPartner: row.courier_partner,
    courierTrackingUrl: row.courier_tracking_url,
  });

  res.json({ tracking });
});

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Returns a self-contained, printable invoice document. The client fetches it
// with the auth header and opens the result, so the invoice is never
// reachable by URL alone — a guessed order id gets a 404 here like anywhere
// else, because the query is scoped to the authenticated customer.
router.get('/account/orders/:id/invoice', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const db = await loadDatabase();
  const order = await buildOrderFromRow(row, db);
  const settings = db.globalSettings || ({} as any);
  const addr = order.deliveryAddress as any;

  const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const placedOn = new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.productName)}</strong>
            ${item.shade ? `<div class="muted">Shade: ${escapeHtml(item.shade.name)}</div>` : ''}
            ${item.size ? `<div class="muted">Size: ${escapeHtml(item.size)}</div>` : ''}
          </td>
          <td class="num">${item.quantity}</td>
          <td class="num">${money(item.price)}</td>
          <td class="num">${money(item.price * item.quantity)}</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${escapeHtml(order.orderNumber)} — Glamirk Beauty</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #121212; background: #FAF9F6; margin: 0; padding: 32px; }
  .sheet { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #E8D5A8; padding: 40px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 1px solid #E8D5A8; padding-bottom: 24px; }
  .brand { font-size: 24px; letter-spacing: .18em; font-weight: 700; }
  .kicker { font-size: 10px; letter-spacing: .24em; text-transform: uppercase; color: #C9972B; font-weight: 700; }
  .muted { color: #6B6B6B; font-size: 12px; }
  h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin: 32px 0 10px; color: #6B6B6B; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #6B6B6B; border-bottom: 1px solid #E8D5A8; padding: 8px 0; }
  td { padding: 12px 0; border-bottom: 1px solid #F1EBDD; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 280px; margin-top: 16px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
  .totals .grand { border-top: 1px solid #121212; margin-top: 8px; padding-top: 10px; font-weight: 700; font-size: 15px; }
  footer { margin-top: 36px; border-top: 1px solid #E8D5A8; padding-top: 16px; font-size: 11px; color: #6B6B6B; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: 0; padding: 0; } .no-print { display: none; } }
  .no-print { text-align: center; margin-bottom: 20px; }
  .no-print button { background: #0B0B0B; color: #fff; border: 0; padding: 12px 28px; letter-spacing: .14em; font-size: 11px; text-transform: uppercase; cursor: pointer; }
</style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="sheet">
    <header>
      <div>
        <div class="kicker">Tax Invoice</div>
        <div class="brand">GLAMIRK</div>
        <div class="muted">${escapeHtml(settings.siteName || 'Glamirk Beauty Private Limited')}</div>
        ${settings.contactEmail ? `<div class="muted">${escapeHtml(settings.contactEmail)}</div>` : ''}
        ${settings.contactPhone ? `<div class="muted">${escapeHtml(settings.contactPhone)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="kicker">Invoice</div>
        <div style="font-size:18px;font-weight:700">#${escapeHtml(order.orderNumber)}</div>
        <div class="muted">${escapeHtml(placedOn)}</div>
        <div class="muted">Status: ${escapeHtml(order.status.replace(/_/g, ' '))}</div>
      </div>
    </header>

    <h2>Billed &amp; shipped to</h2>
    <div style="font-size:13px;line-height:1.7">
      <strong>${escapeHtml(addr?.name || row.customer_name || '')}</strong><br />
      ${escapeHtml(addr?.addressLine1 || '')}${addr?.addressLine2 ? `, ${escapeHtml(addr.addressLine2)}` : ''}<br />
      ${addr?.area ? `${escapeHtml(addr.area)}<br />` : ''}
      ${escapeHtml(addr?.city || '')}, ${escapeHtml(addr?.state || '')} — ${escapeHtml(addr?.pinCode || '')}<br />
      ${escapeHtml(addr?.phone || row.customer_phone || '')}
    </div>

    <h2>Items</h2>
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      ${order.discount > 0 ? `<div><span>Discount${row.coupon_code ? ` (${escapeHtml(row.coupon_code)})` : ''}</span><span>-${money(order.discount)}</span></div>` : ''}
      <div><span>Shipping</span><span>${order.shipping > 0 ? money(order.shipping) : 'Free'}</span></div>
      <div class="grand"><span>Total</span><span>${money(order.total)}</span></div>
    </div>

    <footer>
      Payment method: ${escapeHtml(String(order.payment?.method || 'cod').toUpperCase())} · Payment status: ${escapeHtml(order.payment?.status || '')}<br />
      Prices are inclusive of all applicable taxes. This is a computer-generated invoice and does not require a signature.
    </footer>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="glamirk-invoice-${order.orderNumber}.html"`);
  res.send(html);
});

// ==========================================
// HELP CENTER
// ==========================================

function mapTicketRow(row: any): SupportTicket {
  return {
    id: row.id,
    orderId: row.order_id || undefined,
    orderNumber: row.order_number || undefined,
    topic: row.topic,
    subject: row.subject,
    message: row.message,
    status: row.status,
    adminResponse: row.admin_response || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

router.get('/account/support-tickets', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    `SELECT t.*, o.order_number FROM support_tickets t
     LEFT JOIN orders o ON o.id = t.order_id
     WHERE t.user_id = $1 ORDER BY t.created_at DESC LIMIT 50`,
    [req.customer!.id]
  );
  res.json({ tickets: result.rows.map(mapTicketRow) });
});

router.post(
  '/account/support-tickets',
  requireCustomer,
  rateLimit({ scope: 'account-support', windowMs: 60 * 60 * 1000, max: 20 }),
  async (req: AuthenticatedCustomerRequest, res: Response) => {
    const { orderId, topic, message } = req.body || {};

    const cleanTopic = String(topic || '').trim();
    if (!(SUPPORT_TICKET_TOPICS as readonly string[]).includes(cleanTopic)) {
      return res.status(400).json({ error: 'Please choose what you need help with.' });
    }
    const cleanMessage = String(message || '').trim();
    if (cleanMessage.length < 10) {
      return res.status(400).json({ error: 'Please describe the issue in a little more detail (at least 10 characters).' });
    }
    if (cleanMessage.length > 2000) {
      return res.status(400).json({ error: 'Please keep your message under 2000 characters.' });
    }

    // An order can only be attached if it actually belongs to this customer —
    // otherwise a crafted request could link a ticket to a stranger's order
    // and surface its number back in the ticket list.
    let linkedOrderId: string | null = null;
    let orderNumber: string | null = null;
    if (orderId) {
      const orderRes = await pool.query('SELECT id, order_number FROM orders WHERE id = $1 AND user_id = $2', [
        orderId,
        req.customer!.id,
      ]);
      if (orderRes.rows.length === 0) {
        return res.status(404).json({ error: 'That order was not found in your account.' });
      }
      linkedOrderId = orderRes.rows[0].id;
      orderNumber = orderRes.rows[0].order_number;
    }

    const subject = orderNumber ? `${cleanTopic} — Order #${orderNumber}` : cleanTopic;
    const id = 'tkt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    await pool.query(
      'INSERT INTO support_tickets (id, user_id, order_id, topic, subject, message) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.customer!.id, linkedOrderId, cleanTopic, subject, cleanMessage]
    );

    const db = await loadDatabase();
    const custRes = await pool.query('SELECT name, email FROM customers WHERE id = $1', [req.customer!.id]);
    // Best-effort notification to the store; the ticket is already saved, so a
    // mail failure must not fail the request.
    await sendAccountEmail({
      toEmail: db.globalSettings?.contactEmail,
      subject: `New support request — ${subject}`,
      heading: 'New Support Request',
      message: `${escapeHtml(custRes.rows[0]?.name || 'A customer')} (${escapeHtml(
        custRes.rows[0]?.email || ''
      )}) raised: <br/><br/>${escapeHtml(cleanMessage)}`,
    });

    const created = await pool.query(
      `SELECT t.*, o.order_number FROM support_tickets t
       LEFT JOIN orders o ON o.id = t.order_id WHERE t.id = $1`,
      [id]
    );
    res.json({ ticket: mapTicketRow(created.rows[0]) });
  }
);

// ==========================================
// REVIEW MEDIA
// ==========================================

/**
 * Uploads one photo or clip for a review and returns its URL.
 *
 * Deliberately decoupled from writing the review itself: the composer uploads
 * as the customer picks files and then submits the resulting URLs with the
 * review text, so a slow video upload doesn't hold the whole form hostage and
 * a failed upload doesn't lose what they typed.
 *
 * Rate-limited because this is an authenticated write to paid storage.
 */
router.post(
  '/account/reviews/media',
  requireCustomer,
  rateLimit({ scope: 'review-media', windowMs: 60 * 60 * 1000, max: 40 }),
  reviewMediaUpload.single('file'),
  async (req: AuthenticatedCustomerRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });

    const declaredVideo = req.file.mimetype.startsWith('video/');

    // What the bytes actually are decides how it is stored — not the
    // mimetype, which the client controls. A file claiming to be an image
    // while carrying video bytes (or neither) is rejected outright.
    const kind: 'image' | 'video' | null = isRealImageBuffer(req.file.buffer)
      ? 'image'
      : isRealVideoBuffer(req.file.buffer)
      ? 'video'
      : null;

    if (!kind) {
      return res.status(400).json({ error: 'That file is not a readable image or video.' });
    }
    if (declaredVideo !== (kind === 'video')) {
      return res.status(400).json({ error: 'That file does not match the type it claims to be.' });
    }

    // multer's limit is the video ceiling (the larger of the two), so images
    // are re-checked against their own smaller limit now the type is known.
    const maxBytes = kind === 'video' ? REVIEW_VIDEO_MAX_BYTES : REVIEW_IMAGE_MAX_BYTES;
    if (req.file.size > maxBytes) {
      return res.status(400).json({
        error: `${kind === 'video' ? 'Videos' : 'Photos'} must be under ${Math.round(maxBytes / (1024 * 1024))}MB.`,
      });
    }

    let uploaded: { url: string; publicId: string };
    try {
      uploaded = await uploadReviewMediaToCloudinary(req.file.buffer, kind);
    } catch (err) {
      console.error('Review media upload failed:', err);
      return res.status(502).json({ error: 'Could not upload that file right now. Please try again.' });
    }

    const media: ReviewMedia = { type: kind, url: uploaded.url, publicId: uploaded.publicId };
    res.json({ media });
  }
);

// ==========================================
// PAYMENTS & REFUNDS
//
// A read-only view over the customer's own orders and return requests.
//
// There is deliberately no saved-payment-method or wallet endpoint here.
// Razorpay is integrated for taking payments, but Glamirk does not vault
// instruments: the gateway's hosted checkout holds the card/UPI handle and we
// never receive a reusable token. There is likewise no store-credit ledger to
// report a balance from. Inventing either would mean showing a customer a
// number that no system is actually keeping, so this stays a truthful view of
// payments and refunds that genuinely happened. Saved instruments belong here
// if and when Razorpay tokenisation is enabled on the account.
// ==========================================

/** The masked instrument shown next to a payment. payment_details is written
 * by checkout and already stores only a card's last four digits — this never
 * has full card data available to leak, and does not go looking for any. */
function instrumentLabel(method: PaymentMethodType, details: any): string | undefined {
  if (!details || typeof details !== 'object') return undefined;
  switch (method) {
    case 'card':
      return details.cardLast4 ? `•••• ${String(details.cardLast4).slice(-4)}` : undefined;
    case 'upi':
      return details.upiId || undefined;
    case 'netbanking':
      return details.bankName || undefined;
    case 'wallet':
      return details.walletProvider || undefined;
    default:
      return undefined;
  }
}

router.get('/account/payments', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const userId = req.customer!.id;

  const [ordersRes, refundsRes] = await Promise.all([
    pool.query(
      `SELECT id, order_number, created_at, total, payment_method, payment_status, payment_details, status
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId]
    ),
    // The refund amount is the actual line total from the original order, not
    // a guess: a return of 2 units should report what those 2 units cost.
    // Joined through order_items on (order_id, product_id), which is how the
    // return was recorded in the first place.
    pool.query(
      `SELECT r.id, r.order_id, r.product_id, r.product_name, r.product_image, r.status,
              r.created_at, r.updated_at,
              o.order_number, o.payment_method,
              COALESCE(oi.price * oi.quantity, 0) AS amount
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN order_items oi ON oi.order_id = r.order_id AND oi.product_id = r.product_id
       WHERE r.customer_id = $1
       ORDER BY r.created_at DESC LIMIT 100`,
      [userId]
    ),
  ]);

  const payments: PaymentRecord[] = ordersRes.rows.map((row) => {
    const method = (row.payment_method || 'cod') as PaymentMethodType;
    const details = row.payment_details || {};
    return {
      orderId: row.id,
      orderNumber: row.order_number,
      placedAt: new Date(row.created_at).toISOString(),
      amount: Number(row.total) || 0,
      method,
      status: row.payment_status === 'PAID' ? 'PAID' : 'COD_PENDING',
      instrumentLabel: instrumentLabel(method, details),
      paidAt: details.paidAt ? new Date(details.paidAt).toISOString() : undefined,
      orderStatus: row.status as OrderStatus,
    };
  });

  const refunds: RefundRecord[] = refundsRes.rows.map((row) => ({
    returnId: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    productName: row.product_name,
    productImage: row.product_image || undefined,
    amount: Number(row.amount) || 0,
    status: row.status as ReturnStatus,
    requestedAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    method: (row.payment_method || 'cod') as PaymentMethodType,
  }));

  // Only money actually collected counts as paid. A COD order that hasn't
  // been delivered yet is owed, not received, so it is reported separately
  // instead of being folded into a total that would overstate what the
  // customer has spent.
  const totalPaid = payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0);
  const pendingCod = payments
    .filter((p) => p.status === 'COD_PENDING' && p.orderStatus !== 'CANCELLED' && p.orderStatus !== 'DELIVERED')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalRefunded = refunds.filter((r) => r.status === 'REFUNDED').reduce((sum, r) => sum + r.amount, 0);

  const summary: PaymentsSummary = { payments, refunds, totalPaid, totalRefunded, pendingCod };
  res.json({ payments: summary });
});

// ==========================================
// VIRTUAL TRY-ON HISTORY
// ==========================================

const TRY_ON_HISTORY_LIMIT = 40;
const TRY_ON_MODES: TryOnMode[] = ['live', 'model', 'upload'];

router.get('/account/try-on-history', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const result = await pool.query(
    `SELECT * FROM try_on_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [req.customer!.id, TRY_ON_HISTORY_LIMIT]
  );

  // Unlike recently-viewed (where a delisted product is simply dropped), a
  // delisted product is kept here and flagged unavailable: the entry is a
  // record of something the customer did, and silently erasing it would make
  // their own history look wrong. The UI disables the actions instead.
  const entries: TryOnHistoryEntry[] = result.rows.map((row) => {
    const product = db.products.find((p: Product) => p.id === row.product_id);
    // Prefer the shade's own swatch over the generic product shot — the entry
    // is about the shade that was tried, so a lipstick tried in three shades
    // shouldn't render as the same picture three times. Same resolution order
    // checkout uses for order items.
    const shade = row.shade_id ? (product?.shades || []).find((s) => s.id === row.shade_id) : undefined;
    const shadeImage = shade?.images?.find((img) => img.isPrimary)?.url || shade?.images?.[0]?.url;
    return {
      id: row.id,
      productId: row.product_id,
      productName: product?.name || row.product_name,
      productImage: shadeImage || product?.images?.primary || undefined,
      shadeId: row.shade_id || undefined,
      shadeName: row.shade_name || undefined,
      shadeHex: row.shade_hex || undefined,
      mode: (TRY_ON_MODES.includes(row.mode) ? row.mode : 'model') as TryOnMode,
      triedAt: new Date(row.created_at).toISOString(),
      isAvailable: !!product,
    };
  });

  res.json({ entries });
});

router.post('/account/try-on-history', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId, shadeId, mode } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'A product id is required.' });

  // The product and shade are resolved from the catalogue rather than trusted
  // from the request: a client cannot write an arbitrary product name, shade
  // name or hex into its own history and have it render back as if real.
  const db = await loadDatabase();
  const product = db.products.find((p: Product) => p.id === String(productId));
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const shade = shadeId ? (product.shades || []).find((s) => s.id === String(shadeId)) : undefined;
  if (shadeId && !shade) return res.status(404).json({ error: 'Shade not found for this product.' });

  const cleanMode: TryOnMode = TRY_ON_MODES.includes(mode) ? mode : 'model';
  const id = 'try-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  // Re-trying a shade refreshes the existing row instead of adding another,
  // which is what makes the list read as a set of shades tried rather than an
  // event log. Targets the COALESCE index from migration 010 so a product
  // tried without a shade dedupes too.
  await pool.query(
    `INSERT INTO try_on_history (id, user_id, product_id, product_name, shade_id, shade_name, shade_hex, mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, product_id, COALESCE(shade_id, '')) DO UPDATE SET
       created_at = now(), mode = EXCLUDED.mode, product_name = EXCLUDED.product_name,
       shade_name = EXCLUDED.shade_name, shade_hex = EXCLUDED.shade_hex`,
    [id, req.customer!.id, product.id, product.name, shade?.id || null, shade?.name || null, shade?.hex || null, cleanMode]
  );

  // Bounded per customer, same as recently_viewed.
  await pool.query(
    `DELETE FROM try_on_history
     WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM try_on_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
     )`,
    [req.customer!.id, TRY_ON_HISTORY_LIMIT]
  );

  res.json({ success: true });
});

router.delete('/account/try-on-history/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('DELETE FROM try_on_history WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  res.json({ success: true });
});

router.delete('/account/try-on-history', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('DELETE FROM try_on_history WHERE user_id = $1', [req.customer!.id]);
  res.json({ success: true });
});

export default router;
