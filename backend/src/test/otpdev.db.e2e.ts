/**
 * The development-only OTP console bypass.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/otpdev.db.e2e.ts
 *
 * Two things are being proved here, and the second matters more than the
 * first:
 *
 *   1. That the bypass works — a code reaches the console, and the ordinary
 *      sign-in rules (expiry, single-use, attempt cap, resend cooldown) are
 *      still enforced around it, because only the transport was replaced.
 *
 *   2. That it CANNOT be switched on outside local development. An auth
 *      bypass is only as good as its gate, so the gate is enumerated across
 *      every NODE_ENV and flag spelling, and the production case is asserted
 *      behaviourally — no print, and the real provider is still called —
 *      rather than just by asking the predicate.
 *
 * No SMS is ever sent: the real-provider path is mocked.
 */

// Before any import: mailer.ts opens no SMTP connection under NODE_ENV=test,
// and classifyDatabaseTarget must see a local target.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

import { pool } from '../db/db';
import { issueOtp, verifyOtp, otpPolicy } from '../services/otp.service';
import { sendOtpMessage, channelConfigured, devOtpEnabled, devOtpRequestedButRefused } from '../services/messaging.service';

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
// Harness
// ------------------------------------------

const realLog = console.log;

/** Runs `fn` with console.log captured, so the dev transport's output can be
 * inspected — and, in the production cases, proved absent. */
async function captureStdout<T>(fn: () => Promise<T> | T): Promise<{ result: T; printed: string }> {
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    const result = await fn();
    return { result, printed: lines.join('\n') };
  } finally {
    console.log = realLog;
  }
}

/** Pulls the six-digit code out of the dev transport's boxed output, the same
 * way a developer reads it off their terminal. */
function otpFromConsole(printed: string): string | null {
  const match = printed.match(/code\s+:\s*(\d{6})/);
  return match ? match[1] : null;
}

/** Stands in for Meta so the production-safety cases can prove a REAL send
 * was attempted without any network traffic. */
let realProviderCalls = 0;
globalThis.fetch = (async () => {
  realProviderCalls++;
  return new Response(JSON.stringify({ type: 'success', request_id: 'mock' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

/**
 * Real delivery is enabled for most of this file so that "the bypass is off"
 * can be proved the strong way — by watching a REAL provider call happen
 * instead. The section on the master switch turns it back off explicitly.
 */
process.env.OTP_DELIVERY_ENABLED = 'true';

function setMode(nodeEnv: string | undefined, devFlag: string | undefined) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (devFlag === undefined) delete process.env.OTP_DEV_MODE;
  else process.env.OTP_DEV_MODE = devFlag;
}

const message = (over: Record<string, unknown> = {}) => ({
  phone: '+919876543210',
  otp: '123456',
  // 'sms' is the only OTP channel there is. No server-side vendor backs it —
  // Firebase sends the code from the browser — so this suite is about the dev
  // bypass versus silence, not versus a real vendor.
  method: 'sms' as const,
  expiresInSeconds: 60,
  ...over,
});

const PHONE = {
  happy: '+919876510001',
  wrong: '+919876510002',
  expiry: '+919876510003',
  cooldown: '+919876510004',
};

async function clearOtpRows() {
  await pool.query('DELETE FROM customer_otp_codes WHERE phone_e164 = ANY($1)', [Object.values(PHONE)]);
}

async function rowFor(challengeId: string) {
  const res = await pool.query('SELECT * FROM customer_otp_codes WHERE id = $1', [challengeId]);
  return res.rows[0] || null;
}

/** Issues a code in dev mode and reads it back off the console. */
async function issueAndReadConsole(phoneE164: string, ip: string | null = '203.0.113.20') {
  const { result, printed } = await captureStdout(() => issueOtp({ phoneE164, method: 'sms', ip }));
  return { result, code: otpFromConsole(printed), printed };
}

async function elapseCooldown(phoneE164: string) {
  await pool.query(
    "UPDATE customer_otp_codes SET created_at = created_at - interval '2 minutes' WHERE phone_e164 = $1",
    [phoneE164]
  );
}

async function main() {
  await clearOtpRows();

  // ==========================================
  // 1. THE GATE
  // ==========================================
  section('1. The gate — both conditions required');

  for (const flag of ['1', 'true', 'TRUE', 'yes', 'on']) {
    setMode('development', flag);
    check(`development + OTP_DEV_MODE=${flag} enables it`, devOtpEnabled() === true);
  }

  for (const flag of ['0', 'false', 'no', 'off', '', undefined]) {
    setMode('development', flag);
    check(`development + OTP_DEV_MODE=${JSON.stringify(flag)} leaves it OFF`, devOtpEnabled() === false);
  }

  // The half of the gate that actually protects customers.
  for (const nodeEnv of ['production', 'test', 'staging', 'Development', undefined]) {
    setMode(nodeEnv, '1');
    check(
      `NODE_ENV=${JSON.stringify(nodeEnv)} + OTP_DEV_MODE=1 is REFUSED`,
      devOtpEnabled() === false
    );
    check(`...and is reported as refused at boot`, devOtpRequestedButRefused() === true);
  }

  setMode('development', '1');
  check('an enabled bypass is not reported as refused', devOtpRequestedButRefused() === false);
  setMode('development', undefined);
  check('a bypass nobody asked for is not reported as refused', devOtpRequestedButRefused() === false);

  // ==========================================
  // 2. PRODUCTION SAFETY, PROVED BY BEHAVIOUR
  // ==========================================
  section('2. Production safety — the bypass is inert, not merely unreported');

  // There is no server-side OTP vendor any more, so "the bypass is off" can no
  // longer be proved by watching a real send happen. What replaces it is
  // stronger in the way that matters: in production the code must not be
  // printed AND nothing may be sent — the channel simply reports unconfigured.
  {
    setMode('production', '1');
    process.env.SMS_PROVIDER = '';

    realProviderCalls = 0;
    const { result, printed } = await captureStdout(() => sendOtpMessage(message()));

    check('in production the code is NEVER printed', !printed.includes('123456'));
    check('nothing resembling the dev banner is printed', !printed.includes('DEVELOPMENT OTP'));
    check('nothing is sent — the channel reports unconfigured', result.status === 'unconfigured');
    check('and it is never attributed to the console transport', result.status !== 'sent');
    check('no vendor is contacted', realProviderCalls === 0);
  }

  {
    // The misconfiguration this gate exists for: NODE_ENV forgotten entirely.
    setMode(undefined, '1');
    realProviderCalls = 0;
    const { result, printed } = await captureStdout(() => sendOtpMessage(message()));
    check('with NODE_ENV unset the bypass stays off — it fails closed', !printed.includes('123456'));
    check('and nothing is sent in its place', result.status === 'unconfigured');
    check('with no vendor contacted', realProviderCalls === 0);
  }

  {
    // Firebase selected: the backend must refuse rather than pretend, because
    // Google both sends the code and checks it.
    setMode('production', '1');
    process.env.SMS_PROVIDER = 'firebase';
    realProviderCalls = 0;
    const { result, printed } = await captureStdout(() => sendOtpMessage(message()));
    check('firebase mode refuses a backend send', result.status === 'error');
    check('and still does not print the code', !printed.includes('123456'));
    check('and makes no provider call', realProviderCalls === 0);
    process.env.SMS_PROVIDER = '';
  }

  // ==========================================
  // 3. THE BYPASS ITSELF
  // ==========================================
  section('3. Dev mode delivers to the console');

  {
    setMode('development', '1');
    realProviderCalls = 0;
    const { result, printed } = await captureStdout(() => sendOtpMessage(message()));

    check('reports sent', result.status === 'sent');
    check('attributed to the console transport', result.status === 'sent' && result.provider === 'dev-console');
    check('no provider is contacted', realProviderCalls === 0);
    check('the code is printed', printed.includes('123456'));
    check('along with the number it is for', printed.includes('+919876543210'));
    check('and it is obvious no SMS went out', printed.includes('no SMS was sent'));
  }

  {
    // Dev mode must not depend on credentials existing at all — and since the
    // WhatsApp credentials now belong to order notifications, not to OTP,
    // removing them must make no difference to sign-in either way.
    setMode('development', '1');
    const saved = {
      token: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    };
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    check('SMS is offered with no credentials whatsoever', channelConfigured('sms') === true);

    const { result, printed } = await captureStdout(() => sendOtpMessage(message()));
    check('and a send still succeeds', result.status === 'sent');
    check('printing the code', printed.includes('123456'));
    check('attributed to the console, not a vendor', result.status === 'sent' && result.provider === 'dev-console');

    if (saved.token) process.env.WHATSAPP_ACCESS_TOKEN = saved.token;
    if (saved.phoneId) process.env.WHATSAPP_PHONE_NUMBER_ID = saved.phoneId;
  }

  {
    // Turning the flag off must restore normal behaviour in the same process:
    // the console stops printing, and nothing silently takes its place.
    setMode('development', undefined);

    realProviderCalls = 0;
    const { result, printed } = await captureStdout(() => sendOtpMessage(message()));
    check('and the code is no longer printed', !printed.includes('123456'));
    check('with no vendor standing in for the console', realProviderCalls === 0);
    check('the send reports unconfigured rather than success', result.status === 'unconfigured');
  }

  // ==========================================
  // 3b. DEV MODE AND THE MASTER SWITCH
  //
  // The configuration this project actually runs in right now: real delivery
  // switched off everywhere, with the console bypass as the only way to sign
  // in locally. These two gates have to be independent — if the kill switch
  // also silenced the console transport there would be no way to test sign-in
  // at all without turning a vendor back on.
  // ==========================================
  section('3b. Dev mode works while real delivery is switched off');

  {
    setMode('development', '1');
    delete process.env.OTP_DELIVERY_ENABLED;

    realProviderCalls = 0;
    const { result, printed } = await captureStdout(() => sendOtpMessage(message()));

    check('the console transport still delivers with the switch off', result.status === 'sent');
    check('attributed to the console, not a vendor', result.status === 'sent' && result.provider === 'dev-console');
    check('the code is printed', printed.includes('123456'));
    check('and no provider is contacted', realProviderCalls === 0);
    check('the sign-in screen offers SMS', channelConfigured('sms') === true);

    // And with the bypass off as well, everything is closed.
    setMode('development', undefined);
    realProviderCalls = 0;
    const closed = await captureStdout(() => sendOtpMessage(message()));
    check('with BOTH switches off, nothing is sent', closed.result.status === 'unconfigured');
    check('no provider is contacted', realProviderCalls === 0);
    check('nothing is printed', !closed.printed.includes('123456'));
    check('and no channel is offered', channelConfigured('sms') === false && channelConfigured('sms') === false);

    process.env.OTP_DELIVERY_ENABLED = 'true';
  }

  // ==========================================
  // 4. THE RULES STILL APPLY — nothing was bypassed but delivery
  // ==========================================
  section('4. Valid OTP, and a code that cannot be reused');

  setMode('development', '1');
  await clearOtpRows();
  {
    const { result, code } = await issueAndReadConsole(PHONE.happy);
    const challengeId = result.status === 'sent' ? result.challengeId : '';

    check('a challenge is issued', result.status === 'sent');
    check('a six-digit code reached the console', !!code && /^\d{6}$/.test(code));
    check('the API result still never carries the code', !!code && !JSON.stringify(result).includes(code));

    const row = await rowFor(challengeId);
    check('the code is still stored only as a keyed hash', !!row && !!code && row.code_hash !== code);
    check('a full-length HMAC, exactly as in production', !!row && /^[0-9a-f]{64}$/.test(row.code_hash));

    const ok = await verifyOtp(challengeId, code!);
    check('the printed code verifies', ok.status === 'verified');
    check('against the number it was issued for', ok.status === 'verified' && ok.phoneE164 === PHONE.happy);

    const again = await verifyOtp(challengeId, code!);
    check('and cannot be used a second time', again.status === 'no_active_code');
  }

  section('5. Invalid OTP and the attempt cap');

  await clearOtpRows();
  {
    const { result, code } = await issueAndReadConsole(PHONE.wrong);
    const challengeId = result.status === 'sent' ? result.challengeId : '';
    const wrong = code === '000000' ? '111111' : '000000';
    const maxAttempts = otpPolicy.maxAttempts;

    const first = await verifyOtp(challengeId, wrong);
    check('a wrong code is rejected in dev mode too', first.status === 'incorrect');
    check(
      'with the attempt counter intact',
      first.status === 'incorrect' && first.attemptsRemaining === maxAttempts - 1
    );

    let last = first;
    for (let i = 1; i < maxAttempts; i++) last = await verifyOtp(challengeId, wrong);
    check('the cap still trips', last.status === 'too_many_attempts');
    check('and the correct code is dead afterwards', (await verifyOtp(challengeId, code!)).status !== 'verified');
  }

  section('6. Expiry');

  await clearOtpRows();
  {
    const { result, code } = await issueAndReadConsole(PHONE.expiry);
    const challengeId = result.status === 'sent' ? result.challengeId : '';

    await pool.query("UPDATE customer_otp_codes SET expires_at = now() - interval '1 second' WHERE id = $1", [
      challengeId,
    ]);

    const expired = await verifyOtp(challengeId, code!);
    check('a printed code still expires on schedule', expired.status === 'expired');
    check('and cannot be revived', (await verifyOtp(challengeId, code!)).status === 'no_active_code');
  }

  section('7. Resend cooldown');

  await clearOtpRows();
  {
    const first = await issueAndReadConsole(PHONE.cooldown);
    check('the first send goes out', first.result.status === 'sent');

    const immediate = await captureStdout(() =>
      issueOtp({ phoneE164: PHONE.cooldown, method: 'sms', ip: '203.0.113.20' })
    );
    check('an immediate resend is refused in dev mode too', immediate.result.status === 'cooldown');
    check(
      'with a real countdown',
      immediate.result.status === 'cooldown' &&
        immediate.result.retryAfterSeconds > 0 &&
        immediate.result.retryAfterSeconds <= 60
    );
    check('and nothing is printed for a send that did not happen', !/code\s+:/.test(immediate.printed));

    await elapseCooldown(PHONE.cooldown);
    const afterWait = await issueAndReadConsole(PHONE.cooldown);
    check('once the cooldown elapses a new code is issued', afterWait.result.status === 'sent');
    check('and printed', !!afterWait.code);

    const firstId = first.result.status === 'sent' ? first.result.challengeId : '';
    check('the superseded code is dead', (await verifyOtp(firstId, first.code!)).status === 'no_active_code');
  }

  await clearOtpRows();
  setMode('test', undefined);
}

main()
  .then(async () => {
    console.log = realLog;
    await pool.end();
    if (failed > 0) {
      console.log(`\n${failed} FAILED, ${passed} passed\n`);
      for (const f of failures) console.log(`  - ${f}`);
      process.exit(1);
    }
    console.log(`\nAll ${passed} dev-OTP checks passed.\n`);
  })
  .catch(async (err) => {
    console.log = realLog;
    console.error('\nTest run crashed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
