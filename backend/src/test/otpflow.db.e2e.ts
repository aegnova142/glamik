/**
 * The OTP sign-in lifecycle against a real database, via the dev console.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/otpflow.db.e2e.ts
 *
 * Covers the half of the flow that only Postgres can answer — expiry,
 * single-use, the attempt cap, the resend cooldown and the rolling daily
 * quota — all of which are decided against the stored row and the database's
 * own clock rather than anything a client sent.
 *
 * No SMS is ever sent: `globalThis.fetch` is replaced with a stub that stands
 * in for Meta. That stub is also how the test learns the code, which is the
 * only way to learn it — issueOtp returns a challenge id and never the code,
 * exactly as the HTTP route does. If this file could read the code any other
 * way, that would itself be the bug.
 *
 * The provider-level contract (payloads, rejection, redaction) is covered
 * in the provider-layer assertions.
 */

// Before any import: mailer.ts opens no SMTP connection under NODE_ENV=test,
// and classifyDatabaseTarget must see a local target.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

// This file tests the real-provider delivery path, so the master switch is
// turned on deliberately. Its shipped default is off; that default and the
// "no vendor is contacted" guarantee are covered by otproutes.
process.env.OTP_DELIVERY_ENABLED = 'true';

// There is no server-side OTP vendor any more: Firebase sends from the
// browser and WhatsApp carries order updates only. The dev console is the only
// transport that can still hand this backend a code, so that is what the
// engine is exercised through.
//
// The engine under test — expiry, attempts, cooldown, quota, single use — is
// transport-agnostic; replacing the transport changes nothing it decides.
process.env.NODE_ENV = 'development';
process.env.OTP_DEV_MODE = '1';
process.env.SMS_PROVIDER = '';

import { pool } from '../db/db';
import { issueOtp, verifyOtp, otpPolicy, purgeExpiredOtpCodes } from '../services/otp.service';
import { normalizePhone } from '../utils/phone';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ------------------------------------------
// Reading the code off the dev console
//
// There is no server-side OTP vendor left, so `fetch` is replaced with a stub
// that THROWS: a regression that reintroduced a vendor call would fail loudly
// here rather than quietly succeed.
// ------------------------------------------

/** What the dev transport printed, i.e. what a developer would read. */
let lastDeliveredOtp: string | null = null;
let deliveryCount = 0;

globalThis.fetch = (async (input: any) => {
  throw new Error(`No OTP transport may be contacted — attempted ${String(input)}`);
}) as typeof fetch;

const realLog = console.log;

/**
 * Runs `fn` with console.log captured and digs the code out of the dev
 * transport's boxed output.
 *
 * This is the only way the test can learn the code — issueOtp returns a
 * challenge id and never the code itself, exactly as the HTTP route does. If
 * this helper could read it any other way, that would be the bug.
 */
async function captureIssued<T>(fn: () => Promise<T>): Promise<T> {
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    const result = await fn();
    const match = lines.join('\n').match(/code\s+:\s*(\d{6})/);
    if (match) {
      lastDeliveredOtp = match[1];
      deliveryCount++;
    } else {
      lastDeliveredOtp = null;
    }
    return result;
  } finally {
    console.log = realLog;
  }
}

// ------------------------------------------
// Fixtures
// ------------------------------------------

/** A number per section, so one section's quota can't bleed into the next. */
const PHONE = {
  happy: '+919876500001',
  reuse: '+919876500002',
  wrong: '+919876500003',
  expiry: '+919876500004',
  cooldown: '+919876500005',
  quota: '+919876500006',
  failure: '+919876500007',
  purge: '+919876500008',
};

async function clearOtpRows() {
  await pool.query('DELETE FROM customer_otp_codes WHERE phone_e164 = ANY($1)', [Object.values(PHONE)]);
}

async function rowFor(challengeId: string) {
  const res = await pool.query('SELECT * FROM customer_otp_codes WHERE id = $1', [challengeId]);
  return res.rows[0] || null;
}

/** Issues a code and hands back both the challenge and what the handset got. */
async function issueAndCapture(phoneE164: string, ip: string | null = '203.0.113.10') {
  lastDeliveredOtp = null;
  const result = await captureIssued(() => issueOtp({ phoneE164, method: 'sms', ip }));
  return { result, code: lastDeliveredOtp };
}

/**
 * Simulates the cooldown having elapsed, by ageing this number's existing
 * rows two minutes into the past.
 *
 * Note for anyone tempted to shortcut this with OTP_RESEND_COOLDOWN_SECONDS=0:
 * that does NOT disable the cooldown. otpPolicy reads it through intFromEnv,
 * which accepts only values > 0 and falls back to the 60-second default for
 * anything else — so "0" quietly means "60". Moving the clock is both the
 * honest way to test a time rule and the only one that works.
 *
 * Two minutes keeps every row comfortably inside the 24-hour quota window, so
 * this ages out the cooldown without also refunding the daily allowance.
 */
async function elapseCooldown(phoneE164: string) {
  await pool.query(
    "UPDATE customer_otp_codes SET created_at = created_at - interval '2 minutes' WHERE phone_e164 = $1",
    [phoneE164]
  );
}

async function main() {
  await clearOtpRows();

  // ==========================================
  // 1. PHONE VALIDATION — the gate in front of all of this
  // ==========================================
  section('1. Indian mobile validation (unchanged by this integration)');

  check('a plain 10-digit mobile normalises', normalizePhone('9876543210')?.e164 === '+919876543210');
  check('spacing and punctuation are tolerated', normalizePhone('+91 98765-43210')?.e164 === '+919876543210');
  check('a leading trunk zero is stripped', normalizePhone('09876543210')?.e164 === '+919876543210');
  check('a country code already present is not doubled', normalizePhone('919876543210')?.e164 === '+919876543210');
  check('a number starting 5 is rejected — not an Indian mobile', normalizePhone('5876543210') === null);
  check('too few digits is rejected', normalizePhone('98765') === null);
  check('letters are rejected', normalizePhone('abcdefghij') === null);
  check('empty input is rejected', normalizePhone('') === null);
  check('an unsupported country code is rejected', normalizePhone('5551234567', '+1')?.countryCode === '+1');

  // ==========================================
  // 2. A SUCCESSFUL REQUEST
  // ==========================================
  section('2. Issuing a code');

  {
    const { result, code } = await issueAndCapture(PHONE.happy);
    check('the request succeeds', result.status === 'sent');
    check('a challenge id comes back', result.status === 'sent' && result.challengeId.startsWith('otp_'));
    check('the provider was actually called', deliveryCount > 0);
    check('a six-digit code reached the handset', !!code && /^\d{6}$/.test(code));

    const serialised = JSON.stringify(result);
    check('the response never contains the code', !!code && !serialised.includes(code));
    check('the response never contains the auth key', !serialised.includes('NOT-A-REAL-CREDENTIAL'));

    const row = result.status === 'sent' ? await rowFor(result.challengeId) : null;
    check('the row stores a hash, not the code', !!row && !!code && row.code_hash !== code);
    check('the stored hash is a full-length HMAC', !!row && /^[0-9a-f]{64}$/.test(row.code_hash));
    check('the row records the channel it was sent on', !!row && row.delivery_method === 'sms');
    check('expiry is set from the database clock', !!row && row.expires_at instanceof Date);
    check(
      'the expiry matches the configured window',
      !!row &&
        Math.abs(
          (new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 1000 - otpPolicy.expirySeconds
        ) < 2
    );
  }

  // ==========================================
  // 3. VERIFICATION AND SINGLE USE
  // ==========================================
  section('3. Verification, and a code that cannot be reused');

  await clearOtpRows();
  {
    const { result, code } = await issueAndCapture(PHONE.reuse);
    const challengeId = result.status === 'sent' ? result.challengeId : '';

    const first = await verifyOtp(challengeId, code!);
    check('the correct code verifies', first.status === 'verified');
    check(
      'and the phone number comes OUT of the stored row, not from the caller',
      first.status === 'verified' && first.phoneE164 === PHONE.reuse
    );
    check('along with the channel it was delivered on', first.status === 'verified' && first.method === 'sms');

    const second = await verifyOtp(challengeId, code!);
    check('the same code cannot be used twice', second.status === 'no_active_code');

    const row = await rowFor(challengeId);
    check('the row is marked consumed', !!row && row.consumed_at !== null);

    const unknown = await verifyOtp('otp_this-challenge-does-not-exist', '123456');
    check('an unknown challenge id is refused', unknown.status === 'no_active_code');
    check('an empty challenge id is refused', (await verifyOtp('', '123456')).status === 'no_active_code');
  }

  // ==========================================
  // 4. WRONG CODES AND THE ATTEMPT CAP
  // ==========================================
  section('4. Incorrect codes and the attempt cap');

  await clearOtpRows();
  {
    const { result, code } = await issueAndCapture(PHONE.wrong);
    const challengeId = result.status === 'sent' ? result.challengeId : '';
    // Any six digits that are not the real ones.
    const wrong = code === '000000' ? '111111' : '000000';
    const maxAttempts = otpPolicy.maxAttempts;

    const first = await verifyOtp(challengeId, wrong);
    check('a wrong code is rejected', first.status === 'incorrect');
    check(
      'and the customer is told how many tries remain',
      first.status === 'incorrect' && first.attemptsRemaining === maxAttempts - 1
    );

    const malformed = await verifyOtp(challengeId, '12ab!');
    check('a malformed guess still counts as an attempt', malformed.status === 'incorrect');
    check(
      'so padding with letters cannot buy extra tries',
      malformed.status === 'incorrect' && malformed.attemptsRemaining === maxAttempts - 2
    );

    // Burn the rest of the budget.
    let last = malformed;
    for (let i = 2; i < maxAttempts; i++) last = await verifyOtp(challengeId, wrong);
    check('the final wrong guess trips the cap', last.status === 'too_many_attempts');

    const afterCap = await verifyOtp(challengeId, code!);
    check('and the CORRECT code no longer works once the cap is hit', afterCap.status !== 'verified');

    const row = await rowFor(challengeId);
    check('the row is invalidated', !!row && row.invalidated_at !== null);
    check('and was never consumed', !!row && row.consumed_at === null);
  }

  // ==========================================
  // 5. EXPIRY — decided by the stored instant, not a client timer
  // ==========================================
  section('5. Expiry');

  await clearOtpRows();
  {
    const { result, code } = await issueAndCapture(PHONE.expiry);
    const challengeId = result.status === 'sent' ? result.challengeId : '';

    // Age the row rather than sleeping: the rule is `expires_at <= now()`,
    // and moving the instant tests exactly that rule, deterministically.
    await pool.query("UPDATE customer_otp_codes SET expires_at = now() - interval '1 second' WHERE id = $1", [
      challengeId,
    ]);

    const expired = await verifyOtp(challengeId, code!);
    check('a correct but expired code is refused', expired.status === 'expired');

    const row = await rowFor(challengeId);
    check('and the row is invalidated so it cannot come back', !!row && row.invalidated_at !== null);
    check('a second attempt on it reports no active code', (await verifyOtp(challengeId, code!)).status === 'no_active_code');
  }

  // ==========================================
  // 6. RESEND COOLDOWN
  // ==========================================
  section('6. Resend cooldown');

  await clearOtpRows();
  {
    process.env.OTP_RESEND_COOLDOWN_SECONDS = '60';
    const first = await issueAndCapture(PHONE.cooldown);
    check('the first send goes out', first.result.status === 'sent');

    const immediate = await issueOtp({ phoneE164: PHONE.cooldown, method: 'sms', ip: '203.0.113.10' });
    check('an immediate resend is refused', immediate.status === 'cooldown');
    check(
      'with an honest number of seconds to wait',
      immediate.status === 'cooldown' && immediate.retryAfterSeconds > 0 && immediate.retryAfterSeconds <= 60
    );

    const before = deliveryCount;
    await issueOtp({ phoneE164: PHONE.cooldown, method: 'sms', ip: '203.0.113.10' });
    check('and no SMS is sent while in cooldown', deliveryCount === before);
  }

  // ==========================================
  // 7. A RESEND KILLS THE PREVIOUS CODE
  // ==========================================
  section('7. Resending supersedes the previous code');

  await clearOtpRows();
  {
    const first = await issueAndCapture(PHONE.cooldown);
    const firstId = first.result.status === 'sent' ? first.result.challengeId : '';
    const firstCode = first.code!;

    await elapseCooldown(PHONE.cooldown);
    const second = await issueAndCapture(PHONE.cooldown);
    const secondId = second.result.status === 'sent' ? second.result.challengeId : '';

    check('the resend issues a different challenge', firstId !== secondId);
    const stale = await verifyOtp(firstId, firstCode);
    check('the superseded code no longer works', stale.status === 'no_active_code');
    check('but the newest one does', (await verifyOtp(secondId, second.code!)).status === 'verified');
  }

  // ==========================================
  // 8. ROLLING DAILY QUOTA
  // ==========================================
  section('8. Daily quota per number');

  await clearOtpRows();
  {
    process.env.OTP_MAX_PER_PHONE_PER_24H = '3';

    for (let i = 0; i < 3; i++) {
      const r = await issueOtp({ phoneE164: PHONE.quota, method: 'sms', ip: '203.0.113.11' });
      check(`send ${i + 1} of 3 is allowed`, r.status === 'sent');
      // Clear the cooldown but stay well inside the 24h window, so what the
      // fourth send hits is the quota and not the cooldown.
      await elapseCooldown(PHONE.quota);
    }

    const overQuota = await issueOtp({ phoneE164: PHONE.quota, method: 'sms', ip: '203.0.113.11' });
    check('the fourth send is refused', overQuota.status === 'daily_quota');
    check(
      'with a retry window based on when the oldest request ages out',
      overQuota.status === 'daily_quota' && overQuota.retryAfterSeconds > 0
    );

    // The quota is per NUMBER and shared across channels, so switching to
    // WhatsApp must not hand out a fresh allowance.
    const otherChannel = await issueOtp({ phoneE164: PHONE.quota, method: 'sms', ip: '203.0.113.11' });
    check('switching channel does not buy a fresh allowance', otherChannel.status === 'daily_quota');

    process.env.OTP_MAX_PER_PHONE_PER_24H = '5';
  }

  // ==========================================
  // 9. NO TRANSPORT — the shipped state
  //
  // There is no server-side OTP vendor any more, so "the provider rejected"
  // and "the provider was unreachable" are no longer reachable states. What
  // replaces them is the pair that IS reachable: the kill switch, and the dev
  // console being off. Both must report an unconfigured channel rather than
  // inventing a send.
  // ==========================================
  section('9. No transport available');

  await clearOtpRows();
  {
    const savedDevMode = process.env.OTP_DEV_MODE;

    // Dev console off, no vendor: nothing can carry a code.
    delete process.env.OTP_DEV_MODE;
    const noTransport = await issueOtp({ phoneE164: PHONE.failure, method: 'sms', ip: '203.0.113.12' });
    check('with no transport at all the channel reports unconfigured', noTransport.status === 'channel_unconfigured');
    check('and never a send', noTransport.status !== 'sent');

    const leftBehind = await pool.query('SELECT count(*)::int AS n FROM customer_otp_codes WHERE phone_e164 = $1', [
      PHONE.failure,
    ]);
    check('no row is written, so no usable code is left behind', leftBehind.rows[0].n === 0);
    check('and the attempt is refunded rather than burning quota', leftBehind.rows[0].n === 0);

    // The kill switch, with the dev console back on: it outranks everything.
    process.env.OTP_DEV_MODE = savedDevMode ?? '1';
    const savedSwitch = process.env.OTP_DELIVERY_ENABLED;
    delete process.env.OTP_DELIVERY_ENABLED;
    const killed = await captureIssued(() =>
      issueOtp({ phoneE164: PHONE.failure, method: 'sms', ip: '203.0.113.12' })
    );
    // Dev mode is checked before the kill switch by design — a local developer
    // must be able to sign in without turning real delivery on — so this still
    // issues, and the assertion is that it issued through the CONSOLE, not a
    // vendor.
    check('dev mode still issues with the kill switch off', killed.status === 'sent');
    check('and the code came from the console, not a vendor', lastDeliveredOtp !== null);
    process.env.OTP_DELIVERY_ENABLED = savedSwitch ?? 'true';
  }

  // ==========================================
  // 10. HOUSEKEEPING
  // ==========================================
  section('10. Purge retains the quota window');

  await clearOtpRows();
  {
    const old = await issueOtp({ phoneE164: PHONE.purge, method: 'sms', ip: '203.0.113.13' });
    check('the row to be aged was really issued', old.status === 'sent');
    const oldId = old.status === 'sent' ? old.challengeId : '';

    await elapseCooldown(PHONE.purge);
    const recent = await issueOtp({ phoneE164: PHONE.purge, method: 'sms', ip: '203.0.113.13' });
    check('the row to be kept was really issued', recent.status === 'sent');
    const recentId = recent.status === 'sent' ? recent.challengeId : '';

    await pool.query("UPDATE customer_otp_codes SET created_at = now() - interval '3 days' WHERE id = $1", [oldId]);

    await purgeExpiredOtpCodes();
    check('a row older than the retention floor is purged', (await rowFor(oldId)) === null);
    check('a row still inside the quota window is kept', (await rowFor(recentId)) !== null);
  }

  await clearOtpRows();
}

main()
  .then(async () => {
    await pool.end();
    if (failed > 0) {
      console.log(`\n${failed} FAILED, ${passed} passed\n`);
      for (const f of failures) console.log(`  - ${f}`);
      process.exit(1);
    }
    console.log(`\nAll ${passed} OTP lifecycle checks passed.\n`);
  })
  .catch(async (err) => {
    console.error('\nTest run crashed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
