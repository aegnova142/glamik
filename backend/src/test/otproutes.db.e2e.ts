/**
 * The OTP sign-in ROUTES, driven over real HTTP.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/otproutes.db.e2e.ts
 *
 * The service-level suites (otpflow, otpdev, msg91) prove the rules. This one
 * proves the HTTP contract on top of them, because that is where several
 * things live that calling the services directly would skip entirely:
 *
 *   * the customer SESSION — a verified code has to produce a usable JWT and
 *     an account row, and reusing that code must not produce a second one;
 *   * the exact response bodies the storefront reads (`challengeId`,
 *     `expiresAt`, `maskedPhone`, `attemptsRemaining`, `channelAvailable`);
 *   * the wording and status code returned when delivery is switched off,
 *     which must be a clear refusal rather than a cheerful "we sent it".
 *
 * No provider is ever contacted: `globalThis.fetch` is replaced with a stub
 * that counts calls and fails the test if it is ever reached while delivery
 * is off.
 */

process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

// The per-IP burst guards sit in front of the per-number rules. Every request
// below comes from one address, so the shipped ceilings would start returning
// 429s partway through and the later assertions would be testing the limiter
// instead of the thing they name. Raised rather than disabled: the per-number
// cooldown and quota — the real defences — are left at their defaults and are
// asserted on directly.
process.env.OTP_REQUEST_BURST_PER_IP = '500';
process.env.OTP_VERIFY_BURST_PER_IP = '500';

import assert from 'node:assert/strict';
import express from 'express';
import { createServer, Server } from 'http';
import { pool } from '../db/db';
import customerRouter from '../routes/customer.routes';

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
// Provider stub — counts calls, sends nothing
// ------------------------------------------

let providerCalls = 0;
globalThis.fetch = (async () => {
  providerCalls++;
  return new Response(JSON.stringify({ type: 'success', request_id: 'mock' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

// ------------------------------------------
// Console capture — how a developer reads the dev-mode code
// ------------------------------------------

const realLog = console.log;
let consoleSink: string[] = [];
let capturing = false;

console.log = (...args: unknown[]) => {
  if (capturing) consoleSink.push(args.map(String).join(' '));
  else realLog(...args);
};

function startCapture() {
  consoleSink = [];
  capturing = true;
}
function stopCapture(): string {
  capturing = false;
  return consoleSink.join('\n');
}

function otpFromConsole(printed: string): string | null {
  const m = printed.match(/code\s+:\s*(\d{6})/);
  return m ? m[1] : null;
}

// ------------------------------------------
// Test server
// ------------------------------------------

let server: Server;
let baseUrl = '';

async function startServer() {
  const app = express();
  app.use(express.json());
  // Mounted exactly as server.ts does.
  app.use('/api/customer', customerRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
}

interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
}

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse> {
  // Uses Node's http directly rather than the stubbed global fetch.
  const http = await import('http');
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed: any = {};
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = { raw: data };
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: new Headers(res.headers as any) });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const PHONE = {
  session: '9123911001',
  existing: '9123911002',
  wrong: '9123911003',
  expiry: '9123911004',
  cooldown: '9123911005',
  disabled: '9123911006',
};

async function clearRows() {
  const e164 = Object.values(PHONE).map((p) => `+91${p}`);
  await pool.query('DELETE FROM customer_otp_codes WHERE phone_e164 = ANY($1)', [e164]);
  await pool.query('DELETE FROM customer_sessions WHERE customer_id IN (SELECT id FROM customers WHERE phone_e164 = ANY($1))', [e164]).catch(() => undefined);
  await pool.query('DELETE FROM customers WHERE phone_e164 = ANY($1)', [e164]);
}

/** Requests a code in dev mode and reads it off the captured console. */
async function requestOtp(phone: string): Promise<{ res: ApiResponse; code: string | null }> {
  startCapture();
  const res = await api('POST', '/api/customer/auth/otp/request', { phone, countryCode: '+91' });
  const printed = stopCapture();
  return { res, code: otpFromConsole(printed) };
}

async function main() {
  await startServer();
  await clearRows();

  // ==========================================
  // 1. DELIVERY SWITCHED OFF — the shipped state
  // ==========================================
  section('1. Delivery switched off: a clear refusal, and no vendor contacted');

  {
    delete process.env.OTP_DELIVERY_ENABLED;
    delete process.env.OTP_DEV_MODE;
    process.env.SMS_PROVIDER = 'msg91';
    process.env.MSG91_AUTH_KEY = 'test-authkey-NOT-A-REAL-CREDENTIAL';
    process.env.MSG91_OTP_TEMPLATE_ID = 'test-template-id';
    providerCalls = 0;

    const channels = await api('GET', '/api/customer/auth/otp/channels');
    check('channels responds 200', channels.status === 200);
    check('SMS is reported unavailable', channels.body.sms === false);
    check('WhatsApp is reported unavailable', channels.body.whatsapp === false);
    check('the policy the client renders is still published', channels.body.otpLength === 6);
    check('including the expiry', typeof channels.body.expiresInSeconds === 'number');
    check('and the supported country codes', Array.isArray(channels.body.countryCodes));

    const req = await api('POST', '/api/customer/auth/otp/request', { phone: PHONE.disabled, countryCode: '+91' });
    check('a request is refused with 503', req.status === 503);
    check('it does NOT claim success', req.body.success !== true);
    check('no challengeId is handed out', req.body.challengeId === undefined);
    check('the channel is reported unavailable', req.body.channelAvailable === false);
    check('the error names the real situation', /currently unavailable/i.test(req.body.error || ''));
    check(
      'and does not invite a pointless retry',
      !/please try again\.?$/i.test((req.body.error || '').trim())
    );
    check('NO provider was contacted', providerCalls === 0);

    const rows = await pool.query('SELECT count(*)::int AS n FROM customer_otp_codes WHERE phone_e164 = $1', [
      `+91${PHONE.disabled}`,
    ]);
    check('and no code row is left behind', rows.rows[0].n === 0);
  }

  {
    // Even fully credentialled, the switch wins — proved over HTTP.
    providerCalls = 0;
    for (let i = 0; i < 3; i++) {
      await api('POST', '/api/customer/auth/otp/request', { phone: PHONE.disabled, countryCode: '+91' });
    }
    check('repeated attempts still contact nobody', providerCalls === 0);
  }

  // ==========================================
  // 1b. PRODUCTION WITH THE DEV FLAG SET AND DELIVERY OFF
  //
  // The combination a real misconfiguration would produce: a production
  // server that still carries OTP_DEV_MODE=1 from a copied .env, with
  // delivery switched off and MSG91 credentials present.
  //
  // Both halves of this were already covered separately — section 1 proves
  // "delivery off → 503, no vendor" under NODE_ENV=test, and otpdev proves
  // "production ignores OTP_DEV_MODE" with delivery ON. Neither pinned down
  // the pair, so the guarantee rested on reading the source rather than on
  // anything executed. This section runs the actual pair.
  //
  // This block configures its OWN provider credentials rather than inheriting
  // section 1's. Inheriting meant that if section 1 were ever reordered or
  // trimmed, this section would still PASS — but for the wrong reason,
  // refusing because MSG91 looked unconfigured rather than because the kill
  // switch stopped it. The assertions would have lost their teeth without
  // anything going red.
  //
  // Every variable it touches is captured first and restored in `finally`, so
  // a failed request or DB assertion cannot leave NODE_ENV='production' behind
  // for the sections after it, all of which assume 'test'. Nothing here
  // escapes the process.
  // ==========================================
  section('1b. Production + OTP_DEV_MODE=1 + delivery off');

  {
    // Same placeholders section 1 uses. Obviously not credentials, and the
    // mocked fetch means they are never sent anywhere regardless.
    const PLACEHOLDER_AUTH_KEY = 'test-authkey-NOT-A-REAL-CREDENTIAL';
    const PLACEHOLDER_TEMPLATE_ID = 'test-template-id';

    const TOUCHED = [
      'NODE_ENV',
      'OTP_DEV_MODE',
      'OTP_DELIVERY_ENABLED',
      'SMS_PROVIDER',
      'MSG91_AUTH_KEY',
      'MSG91_OTP_TEMPLATE_ID',
    ];

    // Captured before anything is changed. `undefined` means "was absent",
    // which has to be restored as absent rather than as an empty string — an
    // empty NODE_ENV is not the same thing as an unset one.
    const saved: Record<string, string | undefined> = {};
    for (const key of TOUCHED) saved[key] = process.env[key];

    try {
      // Fully credentialled production, delivery off, dev flag left on — the
      // exact shape of a production .env copied from a developer machine.
      process.env.NODE_ENV = 'production';
      process.env.OTP_DEV_MODE = '1';
      delete process.env.OTP_DELIVERY_ENABLED;
      process.env.SMS_PROVIDER = 'msg91';
      process.env.MSG91_AUTH_KEY = PLACEHOLDER_AUTH_KEY;
      process.env.MSG91_OTP_TEMPLATE_ID = PLACEHOLDER_TEMPLATE_ID;
      providerCalls = 0;

      // Stated as an assertion rather than a comment: if this ever stops
      // holding, the refusal below would prove nothing about the kill switch,
      // because an unconfigured provider refuses too.
      check(
        '[prod] the provider is fully credentialled, so nothing passes by being unconfigured',
        !!process.env.SMS_PROVIDER && !!process.env.MSG91_AUTH_KEY && !!process.env.MSG91_OTP_TEMPLATE_ID
      );

      const before = await pool.query('SELECT count(*)::int AS n FROM customer_otp_codes WHERE phone_e164 = $1', [
        `+91${PHONE.disabled}`,
      ]);

      startCapture();
      const req = await api('POST', '/api/customer/auth/otp/request', {
        phone: PHONE.disabled,
        countryCode: '+91',
      });
      const printed = stopCapture();

      // 1 — the console bypass stays shut
      check('[prod] no dev banner is printed', !printed.includes('DEVELOPMENT OTP'));
      check('[prod] no six-digit code is printed', !/code\s+:\s*\d{6}/.test(printed));
      check('[prod] nothing at all is printed for this request', printed.trim() === '');

      // 2 + 3 — the HTTP contract
      check('[prod] the request is refused with 503', req.status === 503);
      check('[prod] it does NOT claim success', req.body.success !== true);
      check('[prod] no challengeId is issued', req.body.challengeId === undefined);
      check('[prod] no token is issued', req.body.token === undefined);
      check('[prod] the channel is reported unavailable', req.body.channelAvailable === false);
      check('[prod] the error reports the channel as unavailable', /currently unavailable/i.test(req.body.error || ''));

      // 4 — no vendor contacted, despite complete credentials
      check('[prod] provider call count is zero', providerCalls === 0);

      // 5 — nothing persisted
      const after = await pool.query('SELECT count(*)::int AS n FROM customer_otp_codes WHERE phone_e164 = $1', [
        `+91${PHONE.disabled}`,
      ]);
      check('[prod] no OTP challenge row is created', after.rows[0].n === before.rows[0].n);
      check('[prod] and none exists at all for this number', after.rows[0].n === 0);
    } finally {
      // Released first: if anything above threw between startCapture() and
      // stopCapture(), console.log would stay swallowed for the rest of the
      // run and every remaining PASS/FAIL line would silently vanish.
      if (capturing) stopCapture();

      for (const key of TOUCHED) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  // ==========================================
  // 2. NO VERIFICATION BYPASS EXISTS
  // ==========================================
  section('2. No hardcoded code, no bypass');

  {
    // There is no challenge at all for this number, so nothing should verify.
    for (const guess of ['000000', '123456', '111111', '999999', '0000', '']) {
      const res = await api('POST', '/api/customer/auth/otp/verify', {
        challengeId: 'otp_no-such-challenge',
        code: guess,
      });
      check(`"${guess}" does not authenticate against an unknown challenge`, res.status >= 400);
      check(`...and issues no token`, res.body.token === undefined);
    }

    const noChallenge = await api('POST', '/api/customer/auth/otp/verify', { code: '123456' });
    check('verifying with no challengeId is refused', noChallenge.status === 400);
    check('and issues no token', noChallenge.body.token === undefined);
  }

  // ==========================================
  // 3. DEV MODE — the supported way to test locally
  // ==========================================
  section('3. Dev mode over HTTP: session creation');

  process.env.NODE_ENV = 'development';
  process.env.OTP_DEV_MODE = '1';
  // Left OFF deliberately: the console transport must work without it.
  delete process.env.OTP_DELIVERY_ENABLED;

  await clearRows();
  {
    providerCalls = 0;
    const channels = await api('GET', '/api/customer/auth/otp/channels');
    check('SMS becomes available in dev mode', channels.body.sms === true);

    const { res, code } = await requestOtp(PHONE.session);
    check('the request succeeds', res.status === 200 && res.body.success === true);
    check('a challengeId is returned', typeof res.body.challengeId === 'string');
    check('the number is masked in the response', res.body.maskedPhone === '+91 ******1001');
    check('absolute expiry is returned for the client countdown', typeof res.body.expiresAt === 'string');
    check('as is the resend instant', typeof res.body.resendAvailableAt === 'string');
    check('the code reached the console', !!code && /^\d{6}$/.test(code));
    check('the code is NOT in the API response', !!code && !JSON.stringify(res.body).includes(code));
    check('no provider was contacted', providerCalls === 0);

    // --- the session ---
    const verify = await api('POST', '/api/customer/auth/otp/verify', {
      challengeId: res.body.challengeId,
      code,
    });
    check('verification succeeds', verify.status === 200);
    check('a JWT is issued', typeof verify.body.token === 'string' && verify.body.token.split('.').length === 3);
    check('the account is flagged new', verify.body.isNewAccount === true);
    check('a user object comes back', !!verify.body.user?.id);
    check('with the verified number on it', verify.body.user?.phone === `+91 ${PHONE.session}`);
    check('marked phone-verified', verify.body.user?.phoneVerified === true);
    check('the token is not the code', !JSON.stringify(verify.body).includes(code!));

    // The row and session really exist, not just the response.
    const customer = await pool.query('SELECT * FROM customers WHERE phone_e164 = $1', [`+91${PHONE.session}`]);
    check('a customer row was created', customer.rows.length === 1);
    check('with phone_verified set', customer.rows[0].phone_verified === true);
    check('and a password hash placeholder, never an empty credential', !!customer.rows[0].password_hash);

    // --- the session is usable ---
    const me = await api('GET', '/api/customer/auth/me', undefined, {
      Authorization: `Bearer ${verify.body.token}`,
    });
    check('the issued session authenticates /auth/me', me.status === 200);
    check('and resolves to the same customer', me.body.user?.id === verify.body.user.id);

    // --- single use, at the HTTP layer ---
    const reuse = await api('POST', '/api/customer/auth/otp/verify', {
      challengeId: res.body.challengeId,
      code,
    });
    check('the code cannot be replayed for a second session', reuse.status >= 400);
    check('and no second token is issued', reuse.body.token === undefined);

    const customersAfter = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [
      `+91${PHONE.session}`,
    ]);
    check('and no duplicate account was created', customersAfter.rows[0].n === 1);
  }

  // ==========================================
  // 4. AN EXISTING ACCOUNT IS REUSED, NOT DUPLICATED
  // ==========================================
  section('4. Signing in again returns the same account');

  {
    const first = await requestOtp(PHONE.existing);
    const firstVerify = await api('POST', '/api/customer/auth/otp/verify', {
      challengeId: first.res.body.challengeId,
      code: first.code,
    });
    check('first sign-in creates the account', firstVerify.body.isNewAccount === true);
    const customerId = firstVerify.body.user.id;

    await pool.query("UPDATE customer_otp_codes SET created_at = created_at - interval '2 minutes' WHERE phone_e164 = $1", [
      `+91${PHONE.existing}`,
    ]);

    const second = await requestOtp(PHONE.existing);
    const secondVerify = await api('POST', '/api/customer/auth/otp/verify', {
      challengeId: second.res.body.challengeId,
      code: second.code,
    });
    check('second sign-in succeeds', secondVerify.status === 200);
    check('and is NOT reported as a new account', secondVerify.body.isNewAccount === false);
    check('returning the same customer', secondVerify.body.user.id === customerId);

    const count = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [
      `+91${PHONE.existing}`,
    ]);
    check('with no duplicate row', count.rows[0].n === 1);
  }

  // ==========================================
  // 5. INVALID INPUT AND THE ATTEMPT CAP
  // ==========================================
  section('5. Invalid OTP, invalid number, attempt cap');

  {
    for (const bad of ['12345', '5123456789', 'abcdefghij', '', '00000']) {
      const res = await api('POST', '/api/customer/auth/otp/request', { phone: bad, countryCode: '+91' });
      check(`"${bad}" is rejected as a mobile number`, res.status === 400);
      check(`...with no challenge issued`, res.body.challengeId === undefined);
    }

    const { res, code } = await requestOtp(PHONE.wrong);
    const challengeId = res.body.challengeId;
    const wrong = code === '000000' ? '111111' : '000000';

    const first = await api('POST', '/api/customer/auth/otp/verify', { challengeId, code: wrong });
    check('a wrong code returns 401', first.status === 401);
    check('with the remaining attempts for the UI', first.body.attemptsRemaining === 4);
    check('and no token', first.body.token === undefined);

    const missingCode = await api('POST', '/api/customer/auth/otp/verify', { challengeId });
    check('an empty code is refused', missingCode.status === 400);

    let last = first;
    for (let i = 1; i < 5; i++) {
      last = await api('POST', '/api/customer/auth/otp/verify', { challengeId, code: wrong });
    }
    check('the cap returns 429', last.status === 429);
    check('and tells the client to resend', last.body.mustResend === true);

    const afterCap = await api('POST', '/api/customer/auth/otp/verify', { challengeId, code });
    check('the correct code is dead after the cap', afterCap.status >= 400);
    check('and issues no session', afterCap.body.token === undefined);
  }

  // ==========================================
  // 6. EXPIRY AND COOLDOWN OVER HTTP
  // ==========================================
  section('6. Expiry and resend cooldown');

  {
    const { res, code } = await requestOtp(PHONE.expiry);
    await pool.query("UPDATE customer_otp_codes SET expires_at = now() - interval '1 second' WHERE id = $1", [
      res.body.challengeId,
    ]);
    const expired = await api('POST', '/api/customer/auth/otp/verify', {
      challengeId: res.body.challengeId,
      code,
    });
    check('an expired code returns 400', expired.status === 400);
    check('flagged as expired for the client', expired.body.expired === true);
    check('and issues no session', expired.body.token === undefined);
  }

  {
    const first = await requestOtp(PHONE.cooldown);
    check('the first request succeeds', first.res.status === 200);

    const immediate = await api('POST', '/api/customer/auth/otp/request', {
      phone: PHONE.cooldown,
      countryCode: '+91',
    });
    check('an immediate resend returns 429', immediate.status === 429);
    check('with Retry-After set', Number(immediate.headers.get('retry-after')) > 0);
    check('and retryAfterSeconds in the body', immediate.body.retryAfterSeconds > 0);
    check('and no new challenge', immediate.body.challengeId === undefined);
  }

  await clearRows();
  process.env.NODE_ENV = 'test';
  delete process.env.OTP_DEV_MODE;
}

main()
  .then(async () => {
    capturing = false;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
    if (failed > 0) {
      realLog(`\n${failed} FAILED, ${passed} passed\n`);
      for (const f of failures) realLog(`  - ${f}`);
      process.exit(1);
    }
    realLog(`\nAll ${passed} OTP route checks passed.\n`);
    assert.ok(passed > 0);
  })
  .catch(async (err) => {
    capturing = false;
    console.error('\nTest run crashed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
