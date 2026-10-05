import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, JWT_SECRET } from '../db/db';
import { sendOtpMessage, OtpChannel } from './messaging.service';

// ==========================================
// OTP ISSUE AND VERIFICATION
//
// Everything that decides whether a code is acceptable lives here, and every
// one of those decisions is made against the database row rather than
// anything the client sent. The countdown on the sign-in screen is a
// convenience; `expires_at` is the rule.
//
// A request returns a CHALLENGE ID — the row's primary key, which is
// cryptographically random — and verification is done against that challenge
// rather than against "whatever the newest code for this phone number is".
// The phone number and the delivery channel are then read from the row, so a
// client cannot influence which account it is verifying against or claim a
// channel it did not actually receive on.
//
// The route layer (customer.routes.ts) owns HTTP concerns and customer-facing
// wording. This module owns the code itself: generating it, storing only its
// keyed hash, counting attempts, and throttling.
// ==========================================

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Every limit in one place, read per access so a value can be changed with a
 * restart and no rebuild. Nothing below is duplicated as a literal anywhere
 * else in the codebase.
 */
export const otpPolicy = {
  /** How long a code stays valid. Enforced against the stored `expires_at`,
   * never against a client-side timer. */
  get expirySeconds(): number {
    return intFromEnv('OTP_EXPIRY_SECONDS', 60);
  },
  /** Failed guesses allowed against one issued code before it dies. */
  get maxAttempts(): number {
    return intFromEnv('OTP_MAX_ATTEMPTS', 5);
  },
  /** Minimum gap between two sends to the same number — what "Resend OTP"
   * counts down to. Matches the expiry by default, so the natural flow is
   * send → 60s validity → expires → resend becomes available. */
  get resendCooldownSeconds(): number {
    return intFromEnv('OTP_RESEND_COOLDOWN_SECONDS', 60);
  },
  /** Requests per number per ROLLING 24 hours — counted from each request's
   * own timestamp, not reset at midnight. Shared across SMS and WhatsApp:
   * the count is per number, so switching channel cannot buy a fresh budget. */
  get maxPerPhonePer24h(): number {
    return intFromEnv('OTP_MAX_PER_PHONE_PER_24H', 5);
  },
  /** Ceiling per IP per hour. Higher than the per-number limit because a
   * household, office or mobile carrier NAT legitimately shares one address —
   * IP is a supporting signal here, not the primary defence. */
  get maxPerIpPerHour(): number {
    return intFromEnv('OTP_MAX_PER_IP_PER_HOUR', 30);
  },
};

/** Six digits: what customers expect, and short enough to retype from a
 * notification without switching apps. The attempt cap — not the length — is
 * what makes guessing impractical. */
const OTP_LENGTH = 6;

const DAY_SECONDS = 24 * 60 * 60;

// ------------------------------------------
// Code generation and hashing
// ------------------------------------------

/** crypto.randomInt, not Math.random: this value is a credential. */
function generateCode(): string {
  const max = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, '0');
}

/**
 * The challenge identifier, which doubles as the row's primary key.
 *
 * 24 random bytes rather than the timestamp-plus-a-little-entropy scheme used
 * for other ids in this codebase: this one is handed to the browser and comes
 * back as part of an authentication step, so it must not be guessable or
 * enumerable from a neighbouring request.
 */
function generateChallengeId(): string {
  return 'otp_' + crypto.randomBytes(24).toString('base64url');
}

/**
 * Keyed hash of the code.
 *
 * A bare SHA-256 of a six-digit code is reversible by anyone who can read the
 * table — the whole keyspace is a million entries. Keying it with a
 * server-side secret means the stored value is worthless without that secret.
 * The challenge id goes into the message too, so a row lifted from one
 * challenge cannot be replayed against another.
 *
 * Falls back to JWT_SECRET so this works without new configuration; set
 * OTP_HASH_SECRET to rotate OTP hashing independently of session signing.
 * (Rotating either only invalidates codes at most a minute old, so there is
 * nothing to migrate.)
 */
function hashCode(challengeId: string, code: string): string {
  const secret = process.env.OTP_HASH_SECRET || JWT_SECRET;
  return crypto.createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ------------------------------------------
// Per-number serialisation
// ------------------------------------------

/**
 * Advisory-lock key for a phone number.
 *
 * Derived in JS rather than with Postgres' `hashtext()` so the value doesn't
 * depend on an internal function whose hashing is not a documented contract.
 * Collisions between two different numbers are harmless — they would only
 * serialise two unrelated requests for a few milliseconds.
 */
function advisoryLockKey(phoneE164: string): string {
  const digest = crypto.createHash('sha256').update(phoneE164).digest();
  // Signed 64-bit, which is what pg_advisory_xact_lock(bigint) expects.
  return BigInt.asIntN(64, digest.readBigUInt64BE(0)).toString();
}

/**
 * Runs `fn` with an exclusive lock on this phone number, inside a transaction.
 *
 * Without this, two requests arriving together both read "4 of 5 used" and
 * both insert, taking the customer to 6 — the check and the insert are
 * separate statements, and READ COMMITTED does not stop the second reader
 * from missing the first writer's uncommitted row. The lock is transaction
 * scoped, so it is released by COMMIT/ROLLBACK and cannot leak if this throws.
 *
 * Deliberately holds nothing but database work: the provider call happens
 * after this returns, because keeping a pooled connection and a lock open
 * across a ten-second HTTP timeout would serialise the whole endpoint.
 */
async function withPhoneLock<T>(phoneE164: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [advisoryLockKey(phoneE164)]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ------------------------------------------
// Issuing
// ------------------------------------------

/**
 * String-tagged rather than `ok: boolean` — this project compiles without
 * `strict`, where a literal-boolean discriminant doesn't narrow. Same reason
 * validateAddressPayload in customer.routes.ts avoids the pattern.
 */
export type IssueResult =
  | {
      status: 'sent';
      /** Opaque handle the client sends back to verify. Never the code. */
      challengeId: string;
      /** Absolute instant the backend stops accepting this code. The client
       * renders its countdown from this rather than starting a timer at 60
       * seconds, so a slow network or a page refresh can't leave the two
       * disagreeing. */
      expiresAt: Date;
      resendAvailableAt: Date;
    }
  | { status: 'cooldown'; retryAfterSeconds: number }
  | { status: 'daily_quota'; retryAfterSeconds: number }
  | { status: 'ip_quota'; retryAfterSeconds: number }
  | { status: 'channel_unconfigured'; method: OtpChannel }
  | { status: 'delivery_failed'; method: OtpChannel };

export interface IssueOptions {
  phoneE164: string;
  method: OtpChannel;
  ip: string | null;
}

export async function issueOtp({ phoneE164, method, ip }: IssueOptions): Promise<IssueResult> {
  // IP is checked outside the per-number lock: it's a different key, and a
  // single attacker rotating numbers would otherwise never contend on it.
  if (ip) {
    const ipCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM customer_otp_codes WHERE request_ip = $1 AND created_at > now() - interval '1 hour'",
      [ip]
    );
    if (Number(ipCount.rows[0]?.count || 0) >= otpPolicy.maxPerIpPerHour) {
      return { status: 'ip_quota', retryAfterSeconds: 3600 };
    }
  }

  const expirySeconds = otpPolicy.expirySeconds;
  const cooldownSeconds = otpPolicy.resendCooldownSeconds;
  const code = generateCode();
  const challengeId = generateChallengeId();

  type Prepared =
    | { status: 'prepared'; expiresAt: Date; resendAvailableAt: Date }
    | { status: 'cooldown'; retryAfterSeconds: number }
    | { status: 'daily_quota'; retryAfterSeconds: number };

  // Everything that reads-then-writes the quota happens under the lock, so
  // two simultaneous requests can never both pass the same check.
  const prepared = await withPhoneLock<Prepared>(phoneE164, async (client) => {
    const recent = await client.query<{ created_at: Date }>(
      'SELECT created_at FROM customer_otp_codes WHERE phone_e164 = $1 ORDER BY created_at DESC LIMIT 1',
      [phoneE164]
    );
    if (recent.rows[0]) {
      const elapsed = (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;
      if (elapsed < cooldownSeconds) {
        return { status: 'cooldown', retryAfterSeconds: Math.ceil(cooldownSeconds - elapsed) };
      }
    }

    // Rolling window: each request stops counting once it is itself older
    // than 24 hours, rather than the whole allowance resetting at midnight.
    const used = await client.query<{ count: string; oldest: Date | null }>(
      `SELECT count(*)::int AS count, min(created_at) AS oldest
         FROM customer_otp_codes
        WHERE phone_e164 = $1 AND created_at > now() - make_interval(secs => $2)`,
      [phoneE164, DAY_SECONDS]
    );
    const usedCount = Number(used.rows[0]?.count || 0);
    if (usedCount >= otpPolicy.maxPerPhonePer24h) {
      // The allowance frees up when the OLDEST counted request ages out, so
      // that is the honest "try again in…" rather than a flat 24 hours.
      const oldest = used.rows[0]?.oldest ? new Date(used.rows[0].oldest).getTime() : Date.now();
      const freesUpIn = Math.max(1, Math.ceil((oldest + DAY_SECONDS * 1000 - Date.now()) / 1000));
      return { status: 'daily_quota', retryAfterSeconds: freesUpIn };
    }

    // Any code still live for this number dies now. Without this, a customer
    // who taps Resend would have two working codes, and an attacker guessing
    // against the number would get two independent attempt budgets.
    await client.query(
      'UPDATE customer_otp_codes SET invalidated_at = now() WHERE phone_e164 = $1 AND consumed_at IS NULL AND invalidated_at IS NULL',
      [phoneE164]
    );

    const inserted = await client.query<{ expires_at: Date; created_at: Date }>(
      `INSERT INTO customer_otp_codes (id, phone_e164, code_hash, delivery_method, expires_at, request_ip)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5), $6)
       RETURNING expires_at, created_at`,
      [challengeId, phoneE164, hashCode(challengeId, code), method, expirySeconds, ip]
    );

    // Both instants come from the database clock, which is the same clock
    // `now()` is compared against at verification time.
    const row = inserted.rows[0];
    return {
      status: 'prepared',
      expiresAt: new Date(row.expires_at),
      resendAvailableAt: new Date(new Date(row.created_at).getTime() + cooldownSeconds * 1000),
    };
  });

  if (prepared.status !== 'prepared') return prepared;

  // Provider call is outside the lock and outside the transaction.
  const delivery = await sendOtpMessage({
    phone: phoneE164,
    otp: code,
    method,
    expiresInSeconds: expirySeconds,
  });

  if (delivery.status !== 'sent') {
    // The code never reached anyone, so it is retired immediately — and the
    // row is removed rather than just invalidated so a provider outage
    // doesn't burn one of the customer's five daily requests or hold them in
    // cooldown for a message they never got. Removal also guarantees no
    // usable code is left behind, which invalidation alone would not make
    // obvious to anyone reading the table.
    await pool.query('DELETE FROM customer_otp_codes WHERE id = $1', [challengeId]);
    return delivery.status === 'unconfigured'
      ? { status: 'channel_unconfigured', method }
      : { status: 'delivery_failed', method };
  }

  return {
    status: 'sent',
    challengeId,
    expiresAt: prepared.expiresAt,
    resendAvailableAt: prepared.resendAvailableAt,
  };
}

// ------------------------------------------
// Verification
// ------------------------------------------

export type VerifyResult =
  | { status: 'verified'; phoneE164: string; method: OtpChannel }
  /** No live challenge — unknown id, already used, or superseded by a resend. */
  | { status: 'no_active_code' }
  | { status: 'expired' }
  | { status: 'too_many_attempts' }
  | { status: 'incorrect'; attemptsRemaining: number };

interface OtpRow {
  id: string;
  phone_e164: string;
  code_hash: string;
  delivery_method: OtpChannel;
  expired: boolean;
  attempts: number;
  consumed_at: Date | null;
  invalidated_at: Date | null;
}

/**
 * Checks a code against a challenge and, on success, consumes it.
 *
 * The caller passes only the challenge id and what the customer typed. The
 * phone number and delivery channel come back OUT of this function, read from
 * the stored row — they are never accepted from the client, so a caller
 * cannot point a valid code at a different account or misreport which channel
 * delivered it.
 *
 * Expiry, single-use and the attempt cap are all decided here against the
 * stored row using the database's own clock.
 */
export async function verifyOtp(challengeId: string, submittedCode: string): Promise<VerifyResult> {
  const code = String(submittedCode || '').replace(/\D/g, '');
  const id = String(challengeId || '');
  if (!id) return { status: 'no_active_code' };

  const maxAttempts = otpPolicy.maxAttempts;

  const res = await pool.query<OtpRow>(
    `SELECT id, phone_e164, code_hash, delivery_method, attempts, consumed_at, invalidated_at,
            (expires_at <= now()) AS expired
       FROM customer_otp_codes
      WHERE id = $1`,
    [id]
  );
  const row = res.rows[0];
  if (!row || row.consumed_at || row.invalidated_at) return { status: 'no_active_code' };

  if (row.expired) {
    await pool.query('UPDATE customer_otp_codes SET invalidated_at = now() WHERE id = $1 AND invalidated_at IS NULL', [
      row.id,
    ]);
    return { status: 'expired' };
  }

  if (row.attempts >= maxAttempts) {
    await pool.query('UPDATE customer_otp_codes SET invalidated_at = now() WHERE id = $1 AND invalidated_at IS NULL', [
      row.id,
    ]);
    return { status: 'too_many_attempts' };
  }

  // A malformed submission is still a guess — it counts, otherwise the
  // attempt cap could be sidestepped by padding every try with a letter.
  if (code.length !== OTP_LENGTH || !hashesEqual(row.code_hash, hashCode(row.id, code))) {
    const updated = await pool.query<{ attempts: number }>(
      'UPDATE customer_otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
      [row.id]
    );
    const attempts = Number(updated.rows[0]?.attempts || row.attempts + 1);
    if (attempts >= maxAttempts) {
      await pool.query('UPDATE customer_otp_codes SET invalidated_at = now() WHERE id = $1 AND invalidated_at IS NULL', [
        row.id,
      ]);
      return { status: 'too_many_attempts' };
    }
    return { status: 'incorrect', attemptsRemaining: maxAttempts - attempts };
  }

  // One statement decides the outcome: it re-checks expiry, single-use and
  // invalidation against the database's clock and state, so two requests
  // racing with the same correct code produce exactly one winner and one
  // 'no_active_code' rather than two sessions.
  const consumed = await pool.query<{ phone_e164: string; delivery_method: OtpChannel }>(
    `UPDATE customer_otp_codes
        SET consumed_at = now()
      WHERE id = $1
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
        AND expires_at > now()
      RETURNING phone_e164, delivery_method`,
    [row.id]
  );
  const won = consumed.rows[0];
  if (!won) return { status: 'no_active_code' };

  return { status: 'verified', phoneE164: won.phone_e164, method: won.delivery_method };
}

// ------------------------------------------
// Housekeeping
// ------------------------------------------

/**
 * Drops OTP rows old enough to be useless to both sides.
 *
 * The retention floor is the rolling quota window: a row younger than 24
 * hours still counts against the customer's five daily requests, so deleting
 * it would hand out free allowance. Two days gives that a margin and leaves
 * enough history to answer "why couldn't I log in yesterday". Called from the
 * same daily timer as the account-deletion sweep in server.ts.
 */
export async function purgeExpiredOtpCodes(): Promise<number> {
  const res = await pool.query("DELETE FROM customer_otp_codes WHERE created_at < now() - interval '2 days'");
  return res.rowCount || 0;
}
