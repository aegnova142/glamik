/**
 * MSG91 OTP delivery — the provider layer, with every HTTP call mocked.
 *
 *   npm run test:msg91 --workspace @glamirk/backend
 *
 * No database and no network: `globalThis.fetch` is replaced for each case, so
 * this never sends a real SMS and can run on a laptop with no credentials.
 *
 * What this file is actually guarding:
 *
 *   * that MSG91 is only ever a TRANSPORT — both routes send a code we
 *     generated and neither one asks MSG91 to verify anything;
 *   * that an unconfigured channel reports 'unconfigured' rather than
 *     pretending a message went out;
 *   * that the auth key never reaches a DeliveryResult or a log line.
 *
 * The lifecycle around this (expiry, attempts, single-use, quotas) needs
 * Postgres and lives in otpflow.db.e2e.ts.
 */
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import { sendOtpMessage, channelConfigured, describeOtpChannels } from '../services/messaging.service';

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

/** A placeholder that is obviously not a real credential, and is also the
 * needle the leak tests below search every output for. */
const FAKE_AUTH_KEY = 'test-authkey-NOT-A-REAL-CREDENTIAL';
const FAKE_TEMPLATE_ID = 'test-template-id';

const MSG91_KEYS = [
  'SMS_PROVIDER',
  'WHATSAPP_PROVIDER',
  'MSG91_SMS_ROUTE',
  'MSG91_AUTH_KEY',
  'MSG91_OTP_TEMPLATE_ID',
  'MSG91_SENDER_ID',
  'MSG91_OTP_VARIABLE',
  'MSG91_API_BASE_URL',
  'OTP_DELIVERY_ENABLED',
];

/**
 * Resets the provider environment.
 *
 * Real delivery is switched ON by default here, because this file exists to
 * test what the providers put on the wire — with the master switch in its
 * shipped (off) position there would be no request to assert against. The
 * switch itself is covered in its own section below, which sets it
 * explicitly.
 */
function setEnv(values: Record<string, string | undefined>) {
  for (const key of MSG91_KEYS) delete process.env[key];
  process.env.OTP_DELIVERY_ENABLED = 'true';
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

const realFetch = globalThis.fetch;
let captured: Captured[] = [];

/** Replaces fetch with something that records the request and answers with
 * `responder`. Returns the recorded calls. */
function mockFetch(responder: (req: Captured) => Promise<Response> | Response) {
  captured = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const req: Captured = {
      url: String(input),
      method: init.method || 'GET',
      headers: Object.fromEntries(
        Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)])
      ),
      body: typeof init.body === 'string' ? init.body : String(init.body ?? ''),
    };
    captured.push(req);
    return responder(req);
  }) as typeof fetch;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Collects anything written to console.error while `fn` runs, so the leak
 * tests can inspect what this module would really have logged. */
async function captureErrorLog<T>(fn: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    const result = await fn();
    return { result, logged: lines.join('\n') };
  } finally {
    console.error = original;
  }
}

const message = (over: Partial<Parameters<typeof sendOtpMessage>[0]> = {}) => ({
  phone: '+919876543210',
  otp: '123456',
  method: 'sms' as const,
  expiresInSeconds: 60,
  ...over,
});

// ==========================================
// 1. CHANNEL CONFIGURATION
// ==========================================
section('1. Channel configuration');

setEnv({});
check('no SMS_PROVIDER means SMS is not offered', channelConfigured('sms') === false);
check('no WHATSAPP_PROVIDER means WhatsApp is not offered', channelConfigured('whatsapp') === false);

setEnv({ SMS_PROVIDER: 'msg91' });
check(
  'msg91 selected but with no credentials is still not configured — this is the live bug',
  channelConfigured('sms') === false
);

setEnv({ SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: FAKE_AUTH_KEY });
check('an auth key alone is not enough; the template is required too', channelConfigured('sms') === false);

setEnv({ SMS_PROVIDER: 'msg91', MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID });
check('a template alone is not enough either', channelConfigured('sms') === false);

setEnv({ SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: FAKE_AUTH_KEY, MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID });
check('both credentials present means SMS is offered', channelConfigured('sms') === true);
check('...on the default flow route', describeOtpChannels().sms === true);

setEnv({
  SMS_PROVIDER: 'msg91',
  MSG91_SMS_ROUTE: 'otp',
  MSG91_AUTH_KEY: FAKE_AUTH_KEY,
  MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
});
check('...and on the otp route, which needs the same two credentials', channelConfigured('sms') === true);

setEnv({ SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: FAKE_AUTH_KEY, MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID });
check(
  'configuring SMS must not quietly enable WhatsApp — it stays off until its own provider is set',
  describeOtpChannels().whatsapp === false
);

setEnv({ SMS_PROVIDER: 'nonsense', MSG91_AUTH_KEY: FAKE_AUTH_KEY, MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID });
check('an unrecognised provider name is not configured', channelConfigured('sms') === false);

// ==========================================
// 1b. THE MASTER SWITCH — no vendor is contacted while it is off
// ==========================================
section('1b. OTP_DELIVERY_ENABLED master switch');

{
  const fullyCredentialled = {
    SMS_PROVIDER: 'msg91',
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
  };

  for (const off of ['', '0', 'false', 'no', 'off', undefined]) {
    setEnv({ ...fullyCredentialled, OTP_DELIVERY_ENABLED: off });
    // setEnv defaults the switch ON, so an explicit undefined has to be
    // removed again to model "the variable is simply absent".
    if (off === undefined) delete process.env.OTP_DELIVERY_ENABLED;

    mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'must-not-happen' }));
    const result = await sendOtpMessage(message());

    check(`OTP_DELIVERY_ENABLED=${JSON.stringify(off)} reports unconfigured`, result.status === 'unconfigured');
    check(`...and contacts NO provider`, captured.length === 0);
    check(`...and never reports a send`, result.status !== 'sent');
    check(`...and hides the SMS channel`, channelConfigured('sms') === false);
    check(`...and hides WhatsApp too`, channelConfigured('whatsapp') === false);
  }

  // The switch has to be the FIRST thing consulted — a fully credentialled
  // provider must still be bypassed.
  setEnv({ ...fullyCredentialled, OTP_DELIVERY_ENABLED: '' });
  delete process.env.OTP_DELIVERY_ENABLED;
  mockFetch(() => jsonResponse(200, { type: 'success' }));
  await sendOtpMessage(message({ method: 'whatsapp' }));
  check('neither does the WhatsApp path reach a vendor', captured.length === 0);

  for (const on of ['1', 'true', 'TRUE', 'yes', 'on']) {
    setEnv({ ...fullyCredentialled, OTP_DELIVERY_ENABLED: on });
    mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'ok' }));
    const result = await sendOtpMessage(message());
    check(`OTP_DELIVERY_ENABLED=${on} resumes real delivery`, result.status === 'sent');
    check(`...and the provider is called exactly once`, captured.length === 1);
  }
}

// ==========================================
// 2. MISSING CREDENTIALS NEVER LOOK LIKE SUCCESS
// ==========================================
section('2. Missing credentials');

{
  setEnv({ SMS_PROVIDER: 'msg91' });
  mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'should-never-happen' }));
  const result = await sendOtpMessage(message());
  check('an unconfigured provider reports unconfigured', result.status === 'unconfigured');
  check('and never claims it was sent', result.status !== 'sent');
  check('and makes no HTTP call at all', captured.length === 0);
}

{
  setEnv({ SMS_PROVIDER: '' });
  mockFetch(() => jsonResponse(200, { type: 'success' }));
  const result = await sendOtpMessage(message());
  check('a blank SMS_PROVIDER also reports unconfigured', result.status === 'unconfigured');
  check('with no provider name to report', result.status === 'unconfigured' && result.provider === null);
}

{
  setEnv({ WHATSAPP_PROVIDER: '' });
  mockFetch(() => jsonResponse(200, { type: 'success' }));
  const result = await sendOtpMessage(message({ method: 'whatsapp' }));
  check('WhatsApp stays disabled until it is explicitly configured', result.status === 'unconfigured');
  check('and sends nothing', captured.length === 0);
}

// ==========================================
// 3. FLOW ROUTE — the default
// ==========================================
section('3. Flow route (POST /api/v5/flow/)');

{
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
    MSG91_SENDER_ID: 'GLMIRK',
  });
  mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'req-flow-1' }));

  const result = await sendOtpMessage(message());
  const req = captured[0];
  const body = JSON.parse(req.body);

  check('reports sent', result.status === 'sent');
  check('as msg91', result.status === 'sent' && result.provider === 'msg91');
  check('with the provider request id', result.status === 'sent' && result.providerMessageId === 'req-flow-1');
  check('POSTs to the v5 flow endpoint', req.method === 'POST' && req.url === 'https://control.msg91.com/api/v5/flow/');
  check('authenticates with the authkey header', req.headers.authkey === FAKE_AUTH_KEY);
  check('sends the template id as template_id (the current v5 name)', body.template_id === FAKE_TEMPLATE_ID);
  check('addresses the number without a leading +', body.recipients[0].mobiles === '919876543210');
  check('carries the code in the default ##otp## variable', body.recipients[0].otp === '123456');
  check('passes the sender id when one is set', body.sender === 'GLMIRK');
}

{
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
    MSG91_OTP_VARIABLE: 'code',
  });
  mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'req-flow-2' }));

  await sendOtpMessage(message());
  const body = JSON.parse(captured[0].body);
  check('MSG91_OTP_VARIABLE renames the placeholder the code travels in', body.recipients[0].code === '123456');
  check('and the default name is then absent', body.recipients[0].otp === undefined);
}

{
  setEnv({ SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: FAKE_AUTH_KEY, MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID });
  mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'req-flow-3' }));
  await sendOtpMessage(message());
  const body = JSON.parse(captured[0].body);
  check('no sender key is sent when MSG91_SENDER_ID is unset', body.sender === undefined);
}

// ==========================================
// 4. OTP ROUTE — for accounts whose only template is an OTP template
// ==========================================
section('4. OTP route (POST /api/v5/otp)');

{
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_SMS_ROUTE: 'otp',
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
    MSG91_SENDER_ID: 'GLMIRK',
  });
  mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'req-otp-1' }));

  const result = await sendOtpMessage(message());
  const req = captured[0];
  const url = new URL(req.url);

  check('reports sent', result.status === 'sent');
  check('POSTs to the v5 otp endpoint', req.method === 'POST' && url.origin + url.pathname === 'https://control.msg91.com/api/v5/otp');
  check('authenticates with the authkey header', req.headers.authkey === FAKE_AUTH_KEY);
  check('passes template_id in the query string', url.searchParams.get('template_id') === FAKE_TEMPLATE_ID);
  check('addresses the number without a leading +', url.searchParams.get('mobile') === '919876543210');
  check(
    'sends OUR code rather than letting MSG91 generate one — the whole point',
    url.searchParams.get('otp') === '123456'
  );
  check('declares our own OTP length, not the API default of 4', url.searchParams.get('otp_length') === '6');
  check('asks for a real-time result so a rejection is not read as a send', url.searchParams.get('realTimeResponse') === '1');
  check('passes the sender id when one is set', url.searchParams.get('sender') === 'GLMIRK');
  check('body carries no code — it travels as a query parameter', req.body === '{}');
}

{
  // otp_expiry is in minutes with a floor of 1; our window is 60 seconds.
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_SMS_ROUTE: 'otp',
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
  });
  mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'x' }));

  await sendOtpMessage(message({ expiresInSeconds: 60 }));
  check('a 60s window asks MSG91 for 1 minute', new URL(captured[0].url).searchParams.get('otp_expiry') === '1');

  await sendOtpMessage(message({ expiresInSeconds: 30 }));
  check(
    'a sub-minute window still asks for 1, MSG91\'s floor — our expires_at is what actually enforces 30s',
    new URL(captured[1].url).searchParams.get('otp_expiry') === '1'
  );

  await sendOtpMessage(message({ expiresInSeconds: 300 }));
  check('a 5 minute window rounds to 5', new URL(captured[2].url).searchParams.get('otp_expiry') === '5');
}

{
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_SMS_ROUTE: 'OTP',
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
  });
  mockFetch(() => jsonResponse(200, { type: 'success' }));
  await sendOtpMessage(message());
  check('MSG91_SMS_ROUTE is matched case-insensitively', captured[0].url.includes('/api/v5/otp'));
}

{
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_SMS_ROUTE: 'something-else',
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
  });
  mockFetch(() => jsonResponse(200, { type: 'success' }));
  await sendOtpMessage(message());
  check('an unrecognised route falls back to flow rather than failing', captured[0].url.endsWith('/api/v5/flow/'));
}

// ==========================================
// 5. PROVIDER REJECTION AND FAILURE
// ==========================================
section('5. Provider rejection and failure');

for (const route of ['flow', 'otp'] as const) {
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_SMS_ROUTE: route,
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
  });

  // MSG91's signature trap: HTTP 200 with a failure in the body.
  mockFetch(() => jsonResponse(200, { type: 'error', message: 'template not found' }));
  const rejected = await captureErrorLog(() => sendOtpMessage(message()));
  check(`[${route}] HTTP 200 with type:error is a failure, not a send`, rejected.result.status === 'error');
  check(
    `[${route}] and the provider's reason is kept for the operator`,
    rejected.result.status === 'error' && rejected.result.detail === 'template not found'
  );

  // A rejected auth key — the most likely real-world failure here.
  mockFetch(() => jsonResponse(401, { type: 'error', message: 'authkey is invalid' }));
  const unauthorized = await captureErrorLog(() => sendOtpMessage(message()));
  check(`[${route}] a rejected auth key is an error`, unauthorized.result.status === 'error');

  // IP security is on by default for new MSG91 keys.
  mockFetch(() => jsonResponse(400, { type: 'error', message: 'IP not whitelisted' }));
  const blocked = await captureErrorLog(() => sendOtpMessage(message()));
  check(`[${route}] an IP-whitelist rejection is an error`, blocked.result.status === 'error');

  // Network failure / DNS / connection refused.
  mockFetch(() => {
    throw new Error('fetch failed');
  });
  const offline = await captureErrorLog(() => sendOtpMessage(message()));
  check(`[${route}] an unreachable provider is an error, never a send`, offline.result.status === 'error');

  // A timeout surfaces as an AbortError from the AbortSignal.
  mockFetch(() => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  });
  const timedOut = await captureErrorLog(() => sendOtpMessage(message()));
  check(`[${route}] a timeout is an error, never a send`, timedOut.result.status === 'error');
  check(
    `[${route}] and no result ever reports 'sent' on failure`,
    [rejected, unauthorized, blocked, offline, timedOut].every((r) => r.result.status !== 'sent')
  );

  // Garbage that is not JSON at all — an HTML error page, say.
  mockFetch(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
  const garbage = await captureErrorLog(() => sendOtpMessage(message()));
  check(`[${route}] an unparseable error page is still an error`, garbage.result.status === 'error');
  check(
    `[${route}] and is reported as a status, not a stack trace or raw HTML`,
    garbage.result.status === 'error' && garbage.result.detail === 'HTTP 502'
  );
}

// ==========================================
// 6. SECRETS NEVER LEAVE THE BACKEND
// ==========================================
section('6. Secret containment');

for (const route of ['flow', 'otp'] as const) {
  setEnv({
    SMS_PROVIDER: 'msg91',
    MSG91_SMS_ROUTE: route,
    MSG91_AUTH_KEY: FAKE_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: FAKE_TEMPLATE_ID,
  });

  mockFetch(() => jsonResponse(200, { type: 'success', request_id: 'ok' }));
  const sent = await captureErrorLog(() => sendOtpMessage(message()));
  const sentJson = JSON.stringify(sent.result);
  check(`[${route}] a successful result carries no auth key`, !sentJson.includes(FAKE_AUTH_KEY));
  check(`[${route}] a successful result carries no OTP code`, !sentJson.includes('123456'));
  check(`[${route}] a success is not logged at all`, sent.logged === '');

  // The nastiest case: a provider that echoes the credential back at us.
  mockFetch(() =>
    jsonResponse(400, { type: 'error', message: `authkey ${FAKE_AUTH_KEY} rejected for otp 123456` })
  );
  const echoed = await captureErrorLog(() => sendOtpMessage(message()));
  check(
    `[${route}] a failure result never carries the auth key`,
    !JSON.stringify(echoed.result).includes(FAKE_AUTH_KEY)
  );
  check(`[${route}] and the log line never carries the auth key`, !echoed.logged.includes(FAKE_AUTH_KEY));
  check(`[${route}] and the log line never carries the OTP code`, !echoed.logged.includes('123456'));

  // A provider error page long enough to flood a log is truncated.
  mockFetch(() => jsonResponse(500, { type: 'error', message: 'x'.repeat(5000) }));
  const flood = await captureErrorLog(() => sendOtpMessage(message()));
  check(
    `[${route}] an enormous provider error is truncated rather than logged whole`,
    flood.result.status === 'error' && flood.result.detail.length <= 301
  );
}

globalThis.fetch = realFetch;

// ==========================================
section('');
if (failed > 0) {
  console.log(`\n${failed} FAILED, ${passed} passed\n`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`\nAll ${passed} MSG91 delivery checks passed.\n`);
assert.ok(passed > 0);
