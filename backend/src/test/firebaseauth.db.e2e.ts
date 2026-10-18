/**
 * Firebase Phone Auth — token verification and session exchange.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/firebaseauth.db.e2e.ts
 *
 * firebase-admin is mocked at the module boundary, so nothing here reaches
 * Google. The point is not to re-test Google's JWT verification — it is to
 * test the four checks THIS codebase layers on top of it, and that a session
 * is only ever minted when all four pass:
 *
 *   1. verifyIdToken accepted the signature, audience and expiry
 *   2. firebase.sign_in_provider === 'phone'
 *   3. auth_time is within the freshness bound (replay protection)
 *   4. a phone_number claim exists, is supported, and matches any claim the
 *      browser made
 *
 * Also covers the provider flag: with another provider selected the Firebase route is
 * closed, and with firebase selected the backend's own issue/verify endpoints
 * refuse instead of pretending to send.
 */

process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

process.env.FIREBASE_PROJECT_ID = 'glamirk-test-project';

import assert from 'node:assert/strict';
import express from 'express';
import { createServer, Server } from 'http';

// ------------------------------------------
// Stub verifier, injected through the service's test seam
//
// firebaseAuth.service.ts reaches firebase-admin through a dynamic import(),
// which under tsx is a real ESM import and so cannot be intercepted by the CJS
// module loader. __setFirebaseAuthForTests replaces the dependency outright
// instead, so no SDK, credential or network is ever involved.
// ------------------------------------------

/** What the next verifyIdToken call should do. */
let tokenBehaviour: { kind: 'resolve'; decoded: any } | { kind: 'reject'; error: Error } = {
  kind: 'reject',
  error: new Error('not configured'),
};
let verifyCalls = 0;

const authStub = {
  verifyIdToken: async (_token: string) => {
    verifyCalls++;
    if (tokenBehaviour.kind === 'reject') throw tokenBehaviour.error;
    return tokenBehaviour.decoded;
  },
};

import { pool } from '../db/db';
import customerRouter from '../routes/customer.routes';
import accountRouter from '../routes/account.routes';
import {
  verifyFirebasePhoneToken,
  firebaseAuthPolicy,
  describeFirebaseReadiness,
  __setFirebaseAuthForTests,
  __setFirebaseAppInitForTests,
  __ensureFirebaseAppForTests,
} from '../services/firebaseAuth.service';
import { channelConfigured } from '../services/messaging.service';
import { issueOtp } from '../services/otp.service';

// Inject the stub verifier: no SDK, no credential, no network.
__setFirebaseAuthForTests(authStub);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}

// ------------------------------------------
// Fixtures
// ------------------------------------------

const PHONE_E164 = '+919876590001';
/**
 * A product to put in the cart, resolved from whatever the catalogue actually
 * holds rather than hardcoded. Sibling suites rewrite cms_state, so naming a
 * seeded id makes this suite pass or fail depending on what ran before it.
 */
async function cartCandidates(): Promise<Array<{ productId: string; variantId?: string }>> {
  const res = await pool.query(
    `SELECT p->>'id' AS id, p->'shades'->0->>'id' AS shade
       FROM cms_state, jsonb_array_elements(data->'products') p
      WHERE cms_state.id = 'main'`
  );
  return res.rows.filter((r: any) => r.id).map((r: any) => ({ productId: r.id, variantId: r.shade || undefined }));
}
const PHONE_NATIONAL = '9876590001';
/** Obviously not a real token — the mock never parses it. */
/** Bearer header, so the change-phone section does not repeat it ten times. */
const authHeader = (token: string) => ({ Authorization: 'Bearer ' + token });

const FAKE_TOKEN = 'fake.id.token-NOT-A-REAL-CREDENTIAL';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function phoneToken(over: Record<string, unknown> = {}) {
  return {
    uid: 'firebase-uid-test',
    phone_number: PHONE_E164,
    auth_time: nowSeconds(),
    firebase: { sign_in_provider: 'phone' },
    ...over,
  };
}

function resolveWith(decoded: any) {
  tokenBehaviour = { kind: 'resolve', decoded };
}
function rejectWith(message: string) {
  tokenBehaviour = { kind: 'reject', error: new Error(message) };
}

// ------------------------------------------
// Test server
// ------------------------------------------

let server: Server;
let baseUrl = '';

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/customer', customerRouter);
  // Mounted the same way server.ts does, so /account/* is reachable here.
  app.use('/api/customer', accountRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
}

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const http = await import('http');
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
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
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Numbers used only by the change-phone section. */
const PHONE_NEW = '+919123966101';
const PHONE_TAKEN = '+919123966102';

async function clearChangePhoneRows() {
  const nums = [PHONE_NEW, PHONE_TAKEN];
  await pool
    .query(
      'DELETE FROM customer_sessions WHERE customer_id IN (SELECT id FROM customers WHERE phone_e164 = ANY($1))',
      [nums]
    )
    .catch(() => undefined);
  await pool.query('DELETE FROM customers WHERE phone_e164 = ANY($1)', [nums]);
}

async function clearRows() {
  await pool
    .query('DELETE FROM customer_sessions WHERE customer_id IN (SELECT id FROM customers WHERE phone_e164 = $1)', [
      PHONE_E164,
    ])
    .catch(() => undefined);
  await pool.query('DELETE FROM customers WHERE phone_e164 = $1', [PHONE_E164]);
  await pool.query('DELETE FROM customer_otp_codes WHERE phone_e164 = $1', [PHONE_E164]);
}

async function main() {
  await startServer();
  await clearRows();

  // ==========================================
  section('1. Token verification — the four checks');

  {
    process.env.SMS_PROVIDER = 'firebase';

    resolveWith(phoneToken());
    const ok = await verifyFirebasePhoneToken(FAKE_TOKEN);
    check('a fresh phone token verifies', ok.status === 'verified');
    check('and yields the number from the token', ok.status === 'verified' && ok.phoneRaw === PHONE_E164);

    rejectWith('Firebase ID token has invalid signature');
    check('an invalid signature is rejected', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'invalid');

    rejectWith('Firebase ID token has expired');
    check('an expired token is rejected', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'invalid');

    check('an empty token is rejected without calling the SDK', (await verifyFirebasePhoneToken('')).status === 'invalid');
    check('a non-string token is rejected', (await verifyFirebasePhoneToken(undefined)).status === 'invalid');

    // A genuine Firebase token from another sign-in method must not buy a
    // phone session.
    resolveWith(phoneToken({ firebase: { sign_in_provider: 'google.com' } }));
    check('a google.com token is refused', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'wrong_provider');
    resolveWith(phoneToken({ firebase: { sign_in_provider: 'password' } }));
    check('a password token is refused', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'wrong_provider');
    resolveWith(phoneToken({ firebase: undefined }));
    check('a token with no provider block is refused', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'wrong_provider');

    // Replay protection.
    resolveWith(phoneToken({ auth_time: nowSeconds() - (firebaseAuthPolicy.maxAuthAgeSeconds + 30) }));
    const stale = await verifyFirebasePhoneToken(FAKE_TOKEN);
    check('a verification older than the freshness bound is refused', stale.status === 'stale');

    resolveWith(phoneToken({ auth_time: nowSeconds() - (firebaseAuthPolicy.maxAuthAgeSeconds - 30) }));
    check('one just inside the bound is accepted', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'verified');

    resolveWith(phoneToken({ auth_time: undefined }));
    check('a token with no auth_time is refused', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'invalid');

    // Clock skew: a token from slightly in the future is tolerated, far-future
    // is not.
    resolveWith(phoneToken({ auth_time: nowSeconds() + 20 }));
    check('mild clock skew is tolerated', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'verified');
    resolveWith(phoneToken({ auth_time: nowSeconds() + 600 }));
    check('a far-future auth_time is refused', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'stale');

    // No identity.
    resolveWith(phoneToken({ phone_number: undefined }));
    check('a token with no phone_number is refused', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'no_phone');
    resolveWith(phoneToken({ phone_number: '' }));
    check('an empty phone_number is refused', (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'no_phone');
  }

  {
    const saved = process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;
    resolveWith(phoneToken());
    const before = verifyCalls;
    check(
      'with FIREBASE_PROJECT_ID unset, verification reports unconfigured',
      (await verifyFirebasePhoneToken(FAKE_TOKEN)).status === 'unconfigured'
    );
    check('and the SDK is never called', verifyCalls === before);
    process.env.FIREBASE_PROJECT_ID = saved!;
  }

  // ==========================================
  section('2. Session exchange over HTTP');

  await clearRows();
  {
    process.env.SMS_PROVIDER = 'firebase';
    resolveWith(phoneToken());

    const res = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('a valid token returns 200', res.status === 200);
    check('a JWT is issued', typeof res.body.token === 'string' && res.body.token.split('.').length === 3);
    check('the account is flagged new', res.body.isNewAccount === true);
    check('the verified number is on the user', res.body.user?.phone === `+91 ${PHONE_NATIONAL}`);
    check('marked phone-verified', res.body.user?.phoneVerified === true);

    const customer = await pool.query('SELECT * FROM customers WHERE phone_e164 = $1', [PHONE_E164]);
    check('a customer row was created', customer.rows.length === 1);
    check('with a password hash placeholder, never an empty credential', !!customer.rows[0].password_hash);

    const me = await api('GET', '/api/customer/auth/me', undefined, {
      Authorization: `Bearer ${res.body.token}`,
    });
    check('the issued session authenticates /auth/me', me.status === 200);
    check('and resolves to the same customer', me.body.user?.id === res.body.user.id);

    // Signing in again reuses the account rather than duplicating it.
    resolveWith(phoneToken());
    const again = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('a second sign-in succeeds', again.status === 200);
    check('and is not reported as new', again.body.isNewAccount === false);
    check('returning the same customer', again.body.user.id === res.body.user.id);
    const count = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_E164]);
    check('with no duplicate row', count.rows[0].n === 1);
  }

  // ==========================================
  section('3. Rejections issue no session');

  await clearRows();
  {
    const cases: Array<[string, () => void, number]> = [
      ['invalid signature', () => rejectWith('invalid signature'), 401],
      ['wrong provider', () => resolveWith(phoneToken({ firebase: { sign_in_provider: 'google.com' } })), 401],
      ['stale auth_time', () => resolveWith(phoneToken({ auth_time: nowSeconds() - 3600 })), 401],
      ['missing phone_number', () => resolveWith(phoneToken({ phone_number: undefined })), 401],
    ];
    for (const [label, setup, expected] of cases) {
      setup();
      const res = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
      check(`[${label}] returns ${expected}`, res.status === expected);
      check(`[${label}] issues no token`, res.body.token === undefined);
    }

    const noToken = await api('POST', '/api/customer/auth/otp/firebase/verify', {});
    check('a missing idToken returns 400', noToken.status === 400);
    check('and issues no token', noToken.body.token === undefined);

    const rows = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_E164]);
    check('no account was created by any rejection', rows.rows[0].n === 0);
  }

  // ==========================================
  section('4. Identity binding — country and claimed number');

  await clearRows();
  {
    // Firebase is configured for India, but the backend re-validates anyway.
    resolveWith(phoneToken({ phone_number: '+14155550100' }));
    const foreign = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('an unsupported country is refused', foreign.status === 400);
    check('and issues no token', foreign.body.token === undefined);

    resolveWith(phoneToken({ phone_number: '+915555500001' }));
    const notMobile = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('an Indian number that is not a mobile is refused', notMobile.status === 400);

    // The browser's claim is only used to detect disagreement.
    resolveWith(phoneToken());
    const mismatch = await api('POST', '/api/customer/auth/otp/firebase/verify', {
      idToken: FAKE_TOKEN,
      phone: '9123400999',
      countryCode: '+91',
    });
    check('a claimed number that differs from the token is refused', mismatch.status === 400);
    check('and issues no token', mismatch.body.token === undefined);

    resolveWith(phoneToken());
    const agreeing = await api('POST', '/api/customer/auth/otp/firebase/verify', {
      idToken: FAKE_TOKEN,
      phone: PHONE_NATIONAL,
      countryCode: '+91',
    });
    check('a matching claim is accepted', agreeing.status === 200);
    check('and the identity still comes from the token', agreeing.body.user?.phone === `+91 ${PHONE_NATIONAL}`);
  }

  // ==========================================
  section('5. Provider flag switching');

  await clearRows();
  {
    // --- firebase selected: the backend issues nothing ---
    process.env.SMS_PROVIDER = 'firebase';
    const bypass = await issueOtp({ phoneE164: PHONE_E164, method: 'sms', ip: '203.0.113.40' });
    check('issueOtp refuses in firebase mode', bypass.status === 'provider_is_client_side');
    const noRows = await pool.query('SELECT count(*)::int AS n FROM customer_otp_codes WHERE phone_e164 = $1', [
      PHONE_E164,
    ]);
    check('and writes no challenge row — no second credential exists', noRows.rows[0].n === 0);

    const req = await api('POST', '/api/customer/auth/otp/request', { phone: PHONE_NATIONAL, countryCode: '+91' });
    check('/auth/otp/request returns a clear 409, not a silent success', req.status === 409);
    check('it does not claim success', req.body.success !== true);
    check('no challengeId is handed out', req.body.challengeId === undefined);
    check('and names the client-side provider', req.body.clientSideProvider === 'firebase');

    const ver = await api('POST', '/api/customer/auth/otp/verify', { challengeId: 'x', code: '123456' });
    check('/auth/otp/verify returns 409 in firebase mode', ver.status === 409);
    check('and issues no token', ver.body.token === undefined);

    // --- another provider selected: the firebase route is closed ---
    process.env.SMS_PROVIDER = 'meta-whatsapp-only';
    resolveWith(phoneToken());
    const closed = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('with a non-firebase provider the firebase route is closed (409)', closed.status === 409);
    check('and issues no token', closed.body.token === undefined);

    // The server-side path still reaches its own gates rather than the bypass.
    delete process.env.OTP_DELIVERY_ENABLED;
    const serverSideReq = await issueOtp({ phoneE164: PHONE_E164, method: 'sms', ip: '203.0.113.41' });
    check(
      'with a non-firebase provider, issueOtp returns to its normal gating',
      serverSideReq.status !== 'provider_is_client_side'
    );
  }

  // ==========================================
  section('6. No live Firebase traffic');

  {
    check('every verification went through the mock', verifyCalls > 0);
    check('and no real credential was used anywhere', !JSON.stringify(process.env.FIREBASE_PROJECT_ID).includes('AIza'));
  }

  // ==========================================
  // 7. APP INITIALISATION CACHING
  //
  // The app is initialised once and reused. The bug this guards: caching the
  // promise unconditionally meant a FAILED initialisation was cached too, so
  // every later sign-in re-awaited the same rejection and only a restart
  // cleared it — one transient fault at the wrong moment taking phone sign-in
  // down until someone noticed.
  //
  // Driven through __ensureFirebaseAppForTests so the caching is exercised on
  // its own, without getAuth() wanting a real app behind the stub.
  // ==========================================
  section('7. App initialisation is cached, but failure is not');

  {
    let initCalls = 0;
    let shouldFail = true;

    __setFirebaseAppInitForTests(async () => {
      initCalls++;
      if (shouldFail) throw new Error('simulated initialisation failure');
      return { app: 'stub' };
    });

    // First attempt fails.
    let firstError: Error | null = null;
    await __ensureFirebaseAppForTests().catch((err) => {
      firstError = err as Error;
    });
    check('a failing initialisation rejects', firstError !== null);
    check('and the initialiser ran once', initCalls === 1);

    // Second attempt, still failing: proves the rejection was not cached —
    // a cached one would resolve from the stored promise without re-running.
    let secondError: Error | null = null;
    await __ensureFirebaseAppForTests().catch((err) => {
      secondError = err as Error;
    });
    check('a later attempt retries rather than replaying the failure', initCalls === 2);
    check('and reports the fresh failure', secondError !== null);

    // Now let it succeed: the retry path must actually recover.
    shouldFail = false;
    const app = await __ensureFirebaseAppForTests();
    check('once the cause clears, initialisation succeeds', !!app);
    check('without a restart', initCalls === 3);

    // ...and the success IS cached.
    await __ensureFirebaseAppForTests();
    await __ensureFirebaseAppForTests();
    check('a successful app is cached and reused', initCalls === 3);
  }

  {
    // Concurrency: callers arriving while an attempt is in flight must share
    // it. Without this each request would initialise its own app.
    let initCalls = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    __setFirebaseAppInitForTests(async () => {
      initCalls++;
      await gate;
      return { app: 'stub' };
    });

    const inFlight = [
      __ensureFirebaseAppForTests(),
      __ensureFirebaseAppForTests(),
      __ensureFirebaseAppForTests(),
    ];
    check('concurrent callers share one initialisation', initCalls === 1);
    release!();
    const results = await Promise.all(inFlight);
    check('and all of them receive the same app', results[0] === results[1] && results[1] === results[2]);
  }

  {
    // The same, but the shared attempt fails: every concurrent caller must see
    // the failure, and the cache must still be clear for the next one.
    let initCalls = 0;
    let shouldFail = true;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    __setFirebaseAppInitForTests(async () => {
      initCalls++;
      await gate;
      if (shouldFail) throw new Error('simulated concurrent failure');
      return { app: 'stub' };
    });

    const settled = Promise.allSettled([__ensureFirebaseAppForTests(), __ensureFirebaseAppForTests()]);
    check('concurrent callers share a failing initialisation too', initCalls === 1);
    release!();
    const outcomes = await settled;
    check('and both see the rejection', outcomes.every((o) => o.status === 'rejected'));

    shouldFail = false;
    const recovered = await __ensureFirebaseAppForTests();
    check('a caller after the shared failure still gets a retry', initCalls === 2);
    check('and recovers', !!recovered);
  }

  // Put the module back as the rest of the suite expects to find it.
  __setFirebaseAppInitForTests(null);

  // ==========================================
  // 8. THE SIGN-IN AVAILABILITY GATE
  //
  // What /auth/otp/channels answers, which is what enables or disables the
  // login button. Two failures are guarded here.
  //
  // The switch: OTP_DELIVERY_ENABLED must still govern firebase mode. Google
  // sends the SMS, not this server, so it would be easy to argue the switch
  // no longer applies — but it is the documented way to keep mobile sign-in
  // dark, and a provider change must not quietly turn sign-in on.
  //
  // The mismatch: the server half being configured says nothing about whether
  // the BROWSER can reach Firebase. Reporting "available" on the server half
  // alone produces an enabled button that dead-ends, which is exactly what a
  // VPS build with an incomplete .env produces.
  // ==========================================
  section('8. Mobile sign-in availability gate');

  const savedEnv = {
    delivery: process.env.OTP_DELIVERY_ENABLED,
    provider: process.env.SMS_PROVIDER,
    projectId: process.env.FIREBASE_PROJECT_ID,
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    clientProject: process.env.VITE_FIREBASE_PROJECT_ID,
  };

  const fullyConfigured = () => {
    process.env.SMS_PROVIDER = 'firebase';
    process.env.FIREBASE_PROJECT_ID = 'glamirk-test-project';
    process.env.VITE_FIREBASE_API_KEY = 'test-api-key-NOT-A-REAL-CREDENTIAL';
    process.env.VITE_FIREBASE_PROJECT_ID = 'glamirk-test-project';
    process.env.OTP_DELIVERY_ENABLED = 'true';
  };

  {
    fullyConfigured();
    check('fully configured and switched on, SMS is offered', channelConfigured('sms') === true);
    check('and readiness reports no problems', describeFirebaseReadiness().problems.length === 0);

    const res = await api('GET', '/api/customer/auth/otp/channels', undefined);
    check('the channels endpoint agrees', res.body.sms === true);
    check('and never offers WhatsApp for sign-in', res.body.whatsapp === false);
  }

  {
    // The safety switch still governs firebase mode.
    fullyConfigured();
    delete process.env.OTP_DELIVERY_ENABLED;
    check('with the switch off, SMS is NOT offered even in firebase mode', channelConfigured('sms') === false);

    process.env.OTP_DELIVERY_ENABLED = 'false';
    check('an explicit "false" is honoured too', channelConfigured('sms') === false);
  }

  {
    // The mismatch this gate was reporting wrongly: server half present,
    // browser half absent. Previously reported available.
    fullyConfigured();
    delete process.env.VITE_FIREBASE_API_KEY;
    check('without the browser API key, SMS is NOT offered', channelConfigured('sms') === false);
    check(
      'and readiness names the missing key',
      describeFirebaseReadiness().problems.some((p) => p.includes('VITE_FIREBASE_API_KEY'))
    );

    fullyConfigured();
    delete process.env.VITE_FIREBASE_PROJECT_ID;
    check('without the browser project id, SMS is NOT offered', channelConfigured('sms') === false);
  }

  {
    // Both halves present but pointing at different projects — every token
    // would fail verifyIdToken's audience check, with nothing in the log.
    fullyConfigured();
    process.env.VITE_FIREBASE_PROJECT_ID = 'a-different-project';
    check('mismatched project ids are NOT reported as ready', channelConfigured('sms') === false);
    const { problems } = describeFirebaseReadiness();
    check('and the mismatch is named', problems.some((p) => p.includes('different projects')));
    check(
      'without printing either value',
      !problems.some((p) => p.includes('glamirk-test-project') || p.includes('a-different-project'))
    );
  }

  {
    // The server half alone is not enough either.
    fullyConfigured();
    delete process.env.FIREBASE_PROJECT_ID;
    check('without FIREBASE_PROJECT_ID, SMS is NOT offered', channelConfigured('sms') === false);
    check(
      'and readiness says the backend cannot verify tokens',
      describeFirebaseReadiness().problems.some((p) => p.includes('FIREBASE_PROJECT_ID'))
    );
  }

  // Restore, so later cleanup and any future section see what they expect.
  for (const [key, value] of Object.entries({
    OTP_DELIVERY_ENABLED: savedEnv.delivery,
    SMS_PROVIDER: savedEnv.provider,
    FIREBASE_PROJECT_ID: savedEnv.projectId,
    VITE_FIREBASE_API_KEY: savedEnv.apiKey,
    VITE_FIREBASE_PROJECT_ID: savedEnv.clientProject,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  // ==========================================
  // 9. RETRIES AND RACES CREATE ONE ACCOUNT
  //
  // A customer who double-taps verify, or a client that retries on a slow
  // network, sends the same proven number twice with nothing in between. Both
  // requests find no account and both try to create one.
  //
  // There is a unique index on phone_e164, so the database will not store two
  // rows — but an unguarded INSERT turns that protection into a 500 for
  // whichever request loses, which is a customer who proved their number and
  // got an error page.
  // ==========================================
  section('9. Concurrent sign-ins create exactly one account');

  await clearRows();
  {
    process.env.SMS_PROVIDER = 'firebase';
    process.env.FIREBASE_PROJECT_ID = 'glamirk-test-project';

    // Both in flight before either can finish, which is what a double tap
    // actually does — sequential retries are covered in section 2.
    resolveWith(phoneToken());
    const [a, b] = await Promise.all([
      api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN }),
      api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN }),
    ]);

    check('both concurrent sign-ins succeed', a.status === 200 && b.status === 200);
    check('both receive a session', !!a.body.token && !!b.body.token);
    check('and both resolve to the same customer', a.body.user?.id === b.body.user?.id);

    const rows = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_E164]);
    check('exactly one customer row exists', rows.rows[0].n === 1);

    // The bonus is the part a duplicate would be expensive: points are money.
    const bonus = await pool.query(
      `SELECT count(*)::int AS n, COALESCE(sum(points), 0)::int AS total
         FROM reward_transactions
        WHERE user_id = (SELECT id FROM customers WHERE phone_e164 = $1) AND type = 'SIGNUP'`,
      [PHONE_E164]
    );
    check('exactly one signup bonus was granted', bonus.rows[0].n === 1);

    // ...and a later sign-in must not top it up again.
    resolveWith(phoneToken());
    const third = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('a later sign-in still succeeds', third.status === 200);
    check('and is not reported as new', third.body.isNewAccount === false);

    const bonusAfter = await pool.query(
      `SELECT count(*)::int AS n, COALESCE(sum(points), 0)::int AS total
         FROM reward_transactions
        WHERE user_id = (SELECT id FROM customers WHERE phone_e164 = $1) AND type = 'SIGNUP'`,
      [PHONE_E164]
    );
    check('the signup bonus is not granted twice', bonusAfter.rows[0].n === 1);
    check('and the points total is unchanged', bonusAfter.rows[0].total === bonus.rows[0].total);
  }

  // ==========================================
  // 10. GOOGLE SIGN-IN IS GONE
  //
  // "Continue with Google" was removed, so the endpoint behind it must be
  // gone too — not merely hidden by the UI flag it used to sit behind. A
  // route that still answers is still an authentication surface, reachable by
  // anyone willing to POST to it, whatever the storefront renders.
  //
  // Phone sign-in is re-checked in the same block: the point is that removing
  // one provider left the remaining one working.
  // ==========================================
  section('10. Removed auth surfaces, phone sign-in still works');

  await clearRows();
  {
    process.env.SMS_PROVIDER = 'firebase';

    // Google sign-in is gone for good. A route that still answers is still an
    // authentication surface, reachable by anyone willing to POST to it,
    // whatever the storefront renders — so "the UI is gone" is not the test.
    //
    // Email + password was REINSTATED after this check first went in, so it is
    // deliberately not listed here; section 13 covers it as a live capability.
    const retired: Array<[string, any]> = [
      ['/api/customer/auth/google', { accessToken: 'anything' }],
      // Changing a password is done through the reset flow, not a standalone
      // endpoint; this one was removed and stays removed.
      ['/api/customer/account/change-password', { currentPassword: 'a', newPassword: 'password123' }],
    ];
    for (const [path, body] of retired) {
      const res = await api('POST', path, body);
      check(`POST ${path.replace('/api/customer', '')} no longer exists`, res.status === 404);
      check(`  ...and issues no token`, res.body.token === undefined);
    }

    // The provider that remains still signs a customer in, end to end.
    resolveWith(phoneToken());
    const signIn = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('phone sign-in still returns a session', signIn.status === 200);
    check('with a JWT', typeof signIn.body.token === 'string' && signIn.body.token.split('.').length === 3);

    const me = await api('GET', '/api/customer/auth/me', undefined, {
      Authorization: `Bearer ${signIn.body.token}`,
    });
    check('and that session authenticates /auth/me', me.status === 200);
    check('resolving to the phone account', me.body.user?.id === signIn.body.user.id);
  }

  // ==========================================
  // 11. A CART SURVIVES SIGNING IN
  //
  // Guests shop before they have an account, and the storefront merges that
  // localStorage cart into the server cart the moment they sign in
  // (mergeGuestCartIntoServer in CommerceContext). That merge is a sequence of
  // POST /cart/items calls against a brand-new session, so what has to hold on
  // this side is: a freshly created phone account accepts cart writes, and
  // signing in AGAIN on that number returns the same account with the cart
  // still on it rather than a fresh empty one.
  // ==========================================
  section('11. A cart survives signing in and signing in again');

  await clearRows();
  {
    process.env.SMS_PROVIDER = 'firebase';
    resolveWith(phoneToken());

    // New number → account created by verifying, exactly as a guest would.
    const first = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('a guest signing in for the first time gets an account', first.status === 200);
    check('reported as new', first.body.isNewAccount === true);

    // The merge the storefront performs: the guest's items, posted one by one.
    // Try each catalogue item until one is addable. Sibling suites rewrite
    // cms_state and can leave the first product out of stock, which is a fact
    // about the fixture rather than about the cart.
    const candidates = await cartCandidates();
    check('the catalogue has at least one product', candidates.length > 0);

    let pick: { productId: string; variantId?: string } | null = null;
    let add: { status: number; body: any } = { status: 0, body: {} };
    for (const candidate of candidates) {
      add = await api(
        'POST',
        '/api/customer/cart/items',
        // The storefront always carries the chosen variant through the merge,
        // and the route refuses a shade-bearing product without one.
        { productId: candidate.productId, variantId: candidate.variantId, quantity: 2 },
        { Authorization: `Bearer ${first.body.token}` }
      );
      if (add.status === 200 || add.status === 201) {
        pick = candidate;
        break;
      }
    }
    check('the merged guest item is accepted', pick !== null,
      `last response ${add.status} ${JSON.stringify(add.body)}`);

    const stored = await pool.query(
      'SELECT quantity FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [first.body.user.id, pick!.productId]
    );
    check('and is stored against that customer', stored.rows.length === 1);
    check('with the quantity the guest had', Number(stored.rows[0]?.quantity) === 2);

    // Signing in again on the same number — a refresh, a new device, a
    // returning customer. The cart must not be orphaned on a second account.
    resolveWith(phoneToken());
    const second = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('signing in again succeeds', second.status === 200);
    check('on the SAME account', second.body.user.id === first.body.user.id);
    check('not reported as new', second.body.isNewAccount === false);

    const cart = await api('GET', '/api/customer/cart', undefined, {
      Authorization: `Bearer ${second.body.token}`,
    });
    check('the cart is still there after signing in again', cart.status === 200);
    const items = cart.body.items || cart.body.cart?.items || [];
    check('and still holds the merged item', items.length === 1);

    const accounts = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_E164]);
    check('with no duplicate account created along the way', accounts.rows[0].n === 1);
  }

  // ==========================================
  // 12. REMOVING AUTH DID NOT TOUCH THE DATA
  //
  // Four credential endpoints and a password field were deleted. None of that
  // should have reached a customer row or an order, so this asserts the thing
  // a migration mistake would break: existing records are still there, still
  // linked, and still reachable through the session a phone sign-in mints.
  //
  // Also covers the deletion path, which USED to demand a password no
  // phone-only account has ever had — it was unsatisfiable, so erasure was
  // impossible for exactly the customers this architecture creates.
  // ==========================================
  section('12. Customer records and orders survive the auth removal');

  await clearRows();
  {
    process.env.SMS_PROVIDER = 'firebase';

    // Whatever the store already holds, untouched by anything above.
    const before = await pool.query(
      `SELECT (SELECT count(*)::int FROM customers) AS customers,
              (SELECT count(*)::int FROM orders)    AS orders`
    );

    resolveWith(phoneToken());
    const signIn = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('a phone sign-in still works after the removal', signIn.status === 200);
    const token = signIn.body.token;

    // The password column still exists and still holds the unusable random
    // hash. Deliberately NOT dropped: it is NOT NULL, other rows depend on it,
    // and dropping a column to tidy up is how data gets lost.
    const col = await pool.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'password_hash'`
    );
    check('password_hash is left in place, not dropped', col.rows.length === 1);
    const row = await pool.query('SELECT password_hash FROM customers WHERE id = $1', [signIn.body.user.id]);
    check('and still satisfied by the random placeholder', !!row.rows[0]?.password_hash);

    // Account data still reachable through the OTP session.
    const orders = await api('GET', '/api/customer/orders', undefined, { Authorization: `Bearer ${token}` });
    check('orders are reachable with an OTP session', orders.status === 200);
    const addresses = await api('GET', '/api/customer/addresses', undefined, { Authorization: `Bearer ${token}` });
    check('addresses are reachable', addresses.status === 200);
    const wishlist = await api('GET', '/api/customer/wishlist', undefined, { Authorization: `Bearer ${token}` });
    check('the wishlist is reachable', wishlist.status === 200);

    // Deletion no longer asks for a password that cannot exist.
    const noConfirm = await api('POST', '/api/customer/account/delete', {}, { Authorization: `Bearer ${token}` });
    check('deletion still refuses without the typed confirmation', noConfirm.status === 400);

    const deleted = await api(
      'POST',
      '/api/customer/account/delete',
      { confirmation: 'DELETE' },
      { Authorization: `Bearer ${token}` }
    );
    check('a phone-only customer CAN now close their account', deleted.status === 200,
      JSON.stringify(deleted.body));

    // Scheduled, not erased — the grace window is the protection.
    const stillThere = await pool.query(
      'SELECT deletion_requested_at FROM customers WHERE id = $1',
      [signIn.body.user.id]
    );
    check('the row is still present', stillThere.rows.length === 1);
    check('with closure scheduled rather than data destroyed', !!stillThere.rows[0].deletion_requested_at);

    const after = await pool.query(
      `SELECT (SELECT count(*)::int FROM customers) AS customers,
              (SELECT count(*)::int FROM orders)    AS orders`
    );
    check('no order was destroyed anywhere in this suite', after.rows[0].orders === before.rows[0].orders);
    check('and the only new customer is the one this block created',
      after.rows[0].customers === before.rows[0].customers + 1);
  }

  // ==========================================
  // 13. EMAIL + PASSWORD, ALONGSIDE PHONE
  //
  // A second, independent way in — reinstated after being removed, using the
  // original bcrypt implementation rather than a reimplementation.
  //
  // The property that matters is that the two methods stay SEPARATE. Matching
  // an email or a phone value must never silently join two accounts together:
  // a shared address is a coincidence until someone proves they hold both
  // credentials, and merging on a coincidence hands one customer another
  // customer's order history.
  // ==========================================
  section('13. Email + password works and stays separate from phone');

  await clearRows();
  const EMAIL = 'legacy.customer@glamirk-test.invalid';
  {
    process.env.SMS_PROVIDER = 'firebase';

    const reg = await api('POST', '/api/customer/auth/register', {
      name: 'Legacy Customer',
      email: EMAIL,
      password: 'correct-horse-battery',
    });
    check('registration succeeds', reg.status === 200, JSON.stringify(reg.body));
    check('and issues a session', typeof reg.body.token === 'string');
    check('with the name on the profile', reg.body.user?.name === 'Legacy Customer');
    check('and the email', reg.body.user?.email === EMAIL);

    // Uniqueness: the same address cannot be registered twice.
    const dupe = await api('POST', '/api/customer/auth/register', {
      name: 'Impostor',
      email: EMAIL,
      password: 'another-password',
    });
    check('a duplicate email is refused with 409', dupe.status === 409);
    check('and no second account is created', dupe.body.token === undefined);

    const stored = await pool.query('SELECT id, password_hash FROM customers WHERE email = $1', [EMAIL]);
    check('exactly one row holds the address', stored.rows.length === 1);
    check('the password is hashed, never stored as given',
      !!stored.rows[0].password_hash && stored.rows[0].password_hash !== 'correct-horse-battery');
    check('using a bcrypt hash', /^\$2[aby]\$/.test(stored.rows[0].password_hash));

    // Sign in with the credential just created.
    const login = await api('POST', '/api/customer/auth/login', {
      identifier: EMAIL,
      password: 'correct-horse-battery',
    });
    check('sign-in with the right password succeeds', login.status === 200);
    check('returning the SAME account', login.body.user?.id === reg.body.user.id);

    const wrong = await api('POST', '/api/customer/auth/login', { identifier: EMAIL, password: 'wrong' });
    check('a wrong password is refused', wrong.status === 401);
    check('and issues no token', wrong.body.token === undefined);

    const me = await api('GET', '/api/customer/auth/me', undefined, {
      Authorization: `Bearer ${login.body.token}`,
    });
    check('the email session authenticates /auth/me', me.status === 200);
  }

  {
    // No automatic merging. A phone sign-in must not adopt the email account
    // just because a human could tell they are the same person.
    const emailAccount = await pool.query('SELECT id FROM customers WHERE email = $1', [EMAIL]);

    resolveWith(phoneToken());
    const phoneSignIn = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('a phone sign-in still succeeds alongside the email account', phoneSignIn.status === 200);
    check('and creates its OWN account, not the email one',
      phoneSignIn.body.user.id !== emailAccount.rows[0].id);
    check('reported as new', phoneSignIn.body.isNewAccount === true);

    const emailStill = await pool.query('SELECT email, phone_e164 FROM customers WHERE id = $1', [
      emailAccount.rows[0].id,
    ]);
    check('the email account keeps its address', emailStill.rows[0].email === EMAIL);
    check('and was not given the phone number', emailStill.rows[0].phone_e164 === null);
  }

  {
    // Password reset: the token is single-use and time-bound, and resetting
    // does not touch the address or the account identity.
    const forgot = await api('POST', '/api/customer/auth/forgot-password', { email: EMAIL });
    check('forgot-password responds', forgot.status === 200);

    const row = await pool.query('SELECT reset_token, reset_token_expiry FROM customers WHERE email = $1', [EMAIL]);
    check('a reset token is stored', !!row.rows[0].reset_token);
    check('with an expiry', !!row.rows[0].reset_token_expiry);

    const reset = await api('POST', '/api/customer/auth/reset-password', {
      token: row.rows[0].reset_token,
      newPassword: 'a-brand-new-password',
    });
    check('the token resets the password', reset.status === 200);

    const cleared = await pool.query('SELECT reset_token FROM customers WHERE email = $1', [EMAIL]);
    check('and is consumed, so it cannot be replayed', cleared.rows[0].reset_token === null);

    const replay = await api('POST', '/api/customer/auth/reset-password', {
      token: row.rows[0].reset_token,
      newPassword: 'third-password',
    });
    check('replaying the used token fails', replay.status >= 400);

    const newLogin = await api('POST', '/api/customer/auth/login', {
      identifier: EMAIL,
      password: 'a-brand-new-password',
    });
    check('the new password works', newLogin.status === 200);
    const oldLogin = await api('POST', '/api/customer/auth/login', {
      identifier: EMAIL,
      password: 'correct-horse-battery',
    });
    check('and the old one no longer does', oldLogin.status === 401);
  }

  await pool.query('DELETE FROM customers WHERE email = $1', [EMAIL]).catch(() => undefined);
  // ==========================================
  // 14. CHANGING THE VERIFIED MOBILE NUMBER
  //
  // The number is the identity, so this is a credential change rather than a
  // profile edit. It needs BOTH an existing session and a Firebase token for
  // the new number: a stolen handset alone cannot take an account over, and a
  // stolen session alone cannot move it somewhere the thief receives codes.
  // ==========================================
  section('14. Changing the verified mobile number');

  await clearRows();
  await clearChangePhoneRows();
  {
    process.env.SMS_PROVIDER = 'firebase';

    resolveWith(phoneToken());
    const signIn = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    const token = signIn.body.token;
    const customerId = signIn.body.user.id;
    check('signed in on the original number', signIn.status === 200);

    // A second device on the same account — it must be signed out by the change.
    resolveWith(phoneToken());
    const second = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    const secondToken = second.body.token;
    check('a second device is signed in too', second.status === 200);
    check('both devices are the same account', second.body.user.id === customerId);

    const beforeMe = await api('GET', '/api/customer/auth/me', undefined, authHeader(secondToken));
    check('the second device works before the change', beforeMe.status === 200);

    resolveWith(phoneToken({ phone_number: PHONE_NEW }));
    const anon = await api('POST', '/api/customer/auth/otp/firebase/change-phone', { idToken: FAKE_TOKEN });
    check('changing the number requires a session', anon.status === 401 || anon.status === 403);

    rejectWith('Firebase ID token has invalid signature');
    const badToken = await api(
      'POST',
      '/api/customer/auth/otp/firebase/change-phone',
      { idToken: FAKE_TOKEN },
      authHeader(token)
    );
    check('an invalid token is refused with 401', badToken.status === 401);
    const unchanged = await pool.query('SELECT phone_e164 FROM customers WHERE id = $1', [customerId]);
    check('and the number is unchanged', unchanged.rows[0].phone_e164 === PHONE_E164);

    // A number owned by someone else.
    resolveWith(phoneToken({ phone_number: PHONE_TAKEN }));
    const other = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('another customer exists on a different number', other.status === 200);

    resolveWith(phoneToken({ phone_number: PHONE_TAKEN }));
    const dupe = await api(
      'POST',
      '/api/customer/auth/otp/firebase/change-phone',
      { idToken: FAKE_TOKEN },
      authHeader(token)
    );
    check('a number owned by another customer returns 409', dupe.status === 409, String(dupe.status));
    check('with a clear reason', /already in use/i.test(dupe.body.error || ''));
    const stillOurs = await pool.query('SELECT phone_e164 FROM customers WHERE id = $1', [customerId]);
    check('and our number is untouched', stillOurs.rows[0].phone_e164 === PHONE_E164);
    const theirs = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_TAKEN]);
    check('the other account keeps its number', theirs.rows[0].n === 1);

    // The real change.
    resolveWith(phoneToken({ phone_number: PHONE_NEW }));
    const changed = await api(
      'POST',
      '/api/customer/auth/otp/firebase/change-phone',
      { idToken: FAKE_TOKEN },
      authHeader(token)
    );
    check('the change succeeds', changed.status === 200, JSON.stringify(changed.body));
    check('and returns a replacement token', typeof changed.body.token === 'string');

    const after = await pool.query('SELECT phone_e164, phone_verified FROM customers WHERE id = $1', [customerId]);
    check('phone_e164 moved to the new number', after.rows[0].phone_e164 === PHONE_NEW);
    check('and it is marked verified', after.rows[0].phone_verified === true);
    const holders = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_NEW]);
    check('no second account was created', holders.rows[0].n === 1);

    const newMe = await api('GET', '/api/customer/auth/me', undefined, authHeader(changed.body.token));
    check('the replacement token still works on this device', newMe.status === 200);

    const oldMe = await api('GET', '/api/customer/auth/me', undefined, authHeader(token));
    check('the pre-change token is rejected', oldMe.status === 401, String(oldMe.status));

    const otherDevice = await api('GET', '/api/customer/auth/me', undefined, authHeader(secondToken));
    check('the other device is signed out', otherDevice.status === 401, String(otherDevice.status));

    resolveWith(phoneToken({ phone_number: PHONE_NEW }));
    const viaNew = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('the new number signs into the SAME account', viaNew.body.user?.id === customerId);
    check('and is not treated as a new account', viaNew.body.isNewAccount === false);

    resolveWith(phoneToken());
    const viaOld = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('the old number no longer reaches the account', viaOld.body.user?.id !== customerId);

    resolveWith(phoneToken({ phone_number: PHONE_NEW }));
    const retry = await api(
      'POST',
      '/api/customer/auth/otp/firebase/change-phone',
      { idToken: FAKE_TOKEN },
      authHeader(changed.body.token)
    );
    check('repeating the change is a no-op success', retry.status === 200, String(retry.status));
    check('reported as unchanged', retry.body.unchanged === true);
  }

  {
    // "Firebase is switched off here" and "that number belongs to someone
    // else" are different problems with different remedies, so they must not
    // share a status code. They used to: both answered 409, and the UI reads
    // 409 as the second one — telling a customer their number was taken when
    // the deployment simply had Firebase disabled.
    await clearRows();
    await clearChangePhoneRows();

    resolveWith(phoneToken());
    const mine = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    const myToken = mine.body.token;
    const myId = mine.body.user.id;

    resolveWith(phoneToken({ phone_number: PHONE_TAKEN }));
    const rival = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    check('a rival account holds PHONE_TAKEN', rival.status === 200);

    // --- taken number: still 409 ---
    resolveWith(phoneToken({ phone_number: PHONE_TAKEN }));
    const taken = await api(
      'POST',
      '/api/customer/auth/otp/firebase/change-phone',
      { idToken: FAKE_TOKEN },
      authHeader(myToken)
    );
    check('a number held by another account is 409', taken.status === 409, String(taken.status));
    check('and says so', /already in use/i.test(taken.body.error || ''));

    // --- provider switched off: 503, not 409 ---
    process.env.SMS_PROVIDER = 'meta-whatsapp-only';
    resolveWith(phoneToken({ phone_number: PHONE_NEW }));
    const off = await api(
      'POST',
      '/api/customer/auth/otp/firebase/change-phone',
      { idToken: FAKE_TOKEN },
      authHeader(myToken)
    );
    check('with Firebase not selected the route answers 503', off.status === 503, String(off.status));
    check('and NOT 409, which the UI reads as a taken number', off.status !== 409);
    check(
      'the reason is configuration, not a conflict',
      /not enabled/i.test(off.body.error || ''),
      off.body.error
    );

    // The gate must refuse before touching anything.
    const afterOff = await pool.query('SELECT phone_e164 FROM customers WHERE id = $1', [myId]);
    check('the number is untouched when the provider is off', afterOff.rows[0].phone_e164 === PHONE_E164);
    const claimed = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_NEW]);
    check('and the new number was not claimed', claimed.rows[0].n === 0);

    // The two codes genuinely differ — the point of the fix.
    check('taken and disabled no longer share a status', taken.status !== off.status);

    process.env.SMS_PROVIDER = 'firebase';
  }

  {
    // Two devices racing for the same free number. The partial unique index is
    // the authority: exactly one may win, and the loser must get a 409 rather
    // than a 500 from the raw constraint violation.
    await clearRows();
    await clearChangePhoneRows();

    resolveWith(phoneToken());
    const a = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });
    resolveWith(phoneToken({ phone_number: PHONE_TAKEN }));
    const b = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: FAKE_TOKEN });

    resolveWith(phoneToken({ phone_number: PHONE_NEW }));
    const [r1, r2] = await Promise.all([
      api('POST', '/api/customer/auth/otp/firebase/change-phone', { idToken: FAKE_TOKEN }, authHeader(a.body.token)),
      api('POST', '/api/customer/auth/otp/firebase/change-phone', { idToken: FAKE_TOKEN }, authHeader(b.body.token)),
    ]);

    const statuses = [r1.status, r2.status].sort();
    check('exactly one concurrent claim succeeds', statuses[0] === 200 && statuses[1] === 409, statuses.join(','));
    check('neither returns a 500', !(r1.status === 500 || r2.status === 500));

    const holders = await pool.query('SELECT count(*)::int AS n FROM customers WHERE phone_e164 = $1', [PHONE_NEW]);
    check('and only one account holds the number', holders.rows[0].n === 1);
  }

  await clearChangePhoneRows();
  await clearRows();
  process.env.SMS_PROVIDER = '';
}

main()
  .then(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
    __setFirebaseAuthForTests(null);
    if (failed > 0) {
      console.log(`\n${failed} FAILED, ${passed} passed\n`);
      for (const f of failures) console.log(`  - ${f}`);
      process.exit(1);
    }
    console.log(`\nAll ${passed} Firebase auth checks passed.\n`);
    assert.ok(passed > 0);
  })
  .catch(async (err) => {
    console.error('\nTest run crashed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
