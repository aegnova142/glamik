// ==========================================
// EMAIL ADDRESS VERIFICATION — SIX-DIGIT CODE
//
// Proves that a customer can read mail at the address on their profile. It is
// NOT a way to sign in: nothing here mints a session, and these functions are
// only reachable from routes behind requireCustomer. Sign-in remains phone +
// Firebase OTP, or email + password.
//
// That distinction is the whole security argument. A code that can only
// confirm an address you already own is worth far less to an attacker than one
// that opens an account, so this does not inherit the blast radius of a
// passwordless login — and a slow or lost email degrades a profile badge
// rather than locking anyone out.
//
// The code is stored the same way the phone OTP is: a keyed HMAC, never the
// digits. A database dump therefore yields nothing usable, and the comparison
// is constant-time.
//
// NO MIGRATION. The two columns this uses — email_verification_token and
// email_verification_expiry — already existed for the emailed-link flow this
// replaces, and held a secret of exactly this kind. The attempt counter rides
// alongside the hash in that same column rather than adding a third: the
// column is private to this flow, and a schema change on a live customers
// table is a bigger risk than an encoded value.
// ==========================================

import crypto from 'crypto';
import { pool, JWT_SECRET } from '../db/db';

/** Matches the phone OTP, so the two screens can share one set of boxes. */
export const EMAIL_CODE_LENGTH = 6;

function intFromEnv(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const emailCodePolicy = {
  /** Longer than the phone window: email is slower than SMS, and a code that
   * expires while the mail is still in transit is a support ticket. */
  get expirySeconds(): number {
    return intFromEnv('EMAIL_CODE_EXPIRY_SECONDS', 10 * 60);
  },
  /** Failed guesses before the code dies. A six-digit space needs this cap to
   * be small or it can simply be walked. */
  get maxAttempts(): number {
    return intFromEnv('EMAIL_CODE_MAX_ATTEMPTS', 5);
  },
  /** Minimum gap between sends — what the countdown on the screen counts. */
  get resendCooldownSeconds(): number {
    return intFromEnv('EMAIL_CODE_RESEND_COOLDOWN_SECONDS', 60);
  },
};

/** crypto.randomInt, not Math.random: this value is a credential. */
function generateCode(): string {
  return String(crypto.randomInt(0, 10 ** EMAIL_CODE_LENGTH)).padStart(EMAIL_CODE_LENGTH, '0');
}

/**
 * Keyed so a stolen database row is worthless without the server secret, and
 * bound to the customer id so a row lifted from one account cannot be replayed
 * against another. Same construction and same secret as the phone OTP.
 */
function hashCode(customerId: string, email: string, code: string): string {
  const secret = process.env.OTP_HASH_SECRET || JWT_SECRET;
  return crypto.createHmac('sha256', secret).update(`${customerId}:${email}:${code}`).digest('hex');
}

function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * What lives in email_verification_token.
 *
 * `v` guards against reading a value written by the old link flow as if it
 * were one of these: a 64-char hex token parses as neither, so it is treated
 * as absent and the customer simply requests a code.
 */
interface StoredChallenge {
  v: 1;
  /** HMAC of the code. */
  h: string;
  /** Failed guesses so far. */
  a: number;
  /** The address the code was sent to — changing the email kills the code. */
  e: string;
  /** Epoch ms when a resend becomes allowed. */
  r: number;
}

function encode(c: StoredChallenge): string {
  return JSON.stringify(c);
}

function decode(raw: unknown): StoredChallenge | null {
  if (typeof raw !== 'string' || !raw.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1 || typeof parsed.h !== 'string' || typeof parsed.e !== 'string') return null;
    return { v: 1, h: parsed.h, a: Number(parsed.a) || 0, e: parsed.e, r: Number(parsed.r) || 0 };
  } catch {
    return null;
  }
}

export type IssueEmailCodeResult =
  | { status: 'issued'; code: string; email: string; expiresAt: Date; resendAvailableAt: Date }
  | { status: 'no_email' }
  | { status: 'already_verified' }
  | { status: 'cooldown'; retryAfterSeconds: number };

/**
 * Creates a code and stores only its hash. The plaintext is returned once, for
 * the caller to put in an email — it is never logged and never stored.
 */
export async function issueEmailCode(customerId: string): Promise<IssueEmailCodeResult> {
  const res = await pool.query(
    'SELECT email, email_verified, email_verification_token FROM customers WHERE id = $1',
    [customerId]
  );
  const row = res.rows[0];
  if (!row?.email) return { status: 'no_email' };
  if (row.email_verified) return { status: 'already_verified' };

  // Throttle before issuing, so a held-down button cannot invalidate the code
  // the customer is in the middle of typing.
  const existing = decode(row.email_verification_token);
  if (existing && existing.e === row.email && existing.r > Date.now()) {
    return { status: 'cooldown', retryAfterSeconds: Math.ceil((existing.r - Date.now()) / 1000) };
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + emailCodePolicy.expirySeconds * 1000);
  const resendAvailableAt = new Date(Date.now() + emailCodePolicy.resendCooldownSeconds * 1000);

  await pool.query(
    'UPDATE customers SET email_verification_token = $1, email_verification_expiry = $2 WHERE id = $3',
    [
      encode({ v: 1, h: hashCode(customerId, row.email, code), a: 0, e: row.email, r: resendAvailableAt.getTime() }),
      expiresAt,
      customerId,
    ]
  );

  return { status: 'issued', code, email: row.email, expiresAt, resendAvailableAt };
}

export type VerifyEmailCodeResult =
  | { status: 'verified' }
  | { status: 'no_challenge' }
  | { status: 'expired' }
  | { status: 'address_changed' }
  | { status: 'incorrect'; attemptsRemaining: number }
  | { status: 'too_many_attempts' };

/**
 * Checks a code and, on success, marks the address verified and clears the
 * challenge so it cannot be replayed.
 *
 * Expiry is judged against the stored timestamp, never a client-supplied one,
 * and a wrong guess costs an attempt whether or not the code had already
 * expired — otherwise the error itself leaks which codes are live.
 */
export async function verifyEmailCode(customerId: string, code: unknown): Promise<VerifyEmailCodeResult> {
  const supplied = typeof code === 'string' ? code.trim() : '';

  const res = await pool.query(
    'SELECT email, email_verification_token, email_verification_expiry FROM customers WHERE id = $1',
    [customerId]
  );
  const row = res.rows[0];
  const challenge = decode(row?.email_verification_token);
  if (!row || !challenge) return { status: 'no_challenge' };

  // The address was edited after the code went out, so the code proves nothing
  // about the address now on the account.
  if (challenge.e !== row.email) {
    await clearChallenge(customerId);
    return { status: 'address_changed' };
  }

  if (!row.email_verification_expiry || new Date(row.email_verification_expiry).getTime() < Date.now()) {
    await clearChallenge(customerId);
    return { status: 'expired' };
  }

  if (challenge.a >= emailCodePolicy.maxAttempts) {
    await clearChallenge(customerId);
    return { status: 'too_many_attempts' };
  }

  if (!supplied || !hashesEqual(challenge.h, hashCode(customerId, row.email, supplied))) {
    const attempts = challenge.a + 1;
    const remaining = Math.max(0, emailCodePolicy.maxAttempts - attempts);
    if (remaining === 0) {
      await clearChallenge(customerId);
      return { status: 'too_many_attempts' };
    }
    await pool.query('UPDATE customers SET email_verification_token = $1 WHERE id = $2', [
      encode({ ...challenge, a: attempts }),
      customerId,
    ]);
    return { status: 'incorrect', attemptsRemaining: remaining };
  }

  await pool.query(
    `UPDATE customers
        SET email_verified = true, email_verification_token = NULL, email_verification_expiry = NULL
      WHERE id = $1`,
    [customerId]
  );
  return { status: 'verified' };
}

async function clearChallenge(customerId: string): Promise<void> {
  await pool.query(
    'UPDATE customers SET email_verification_token = NULL, email_verification_expiry = NULL WHERE id = $1',
    [customerId]
  );
}
