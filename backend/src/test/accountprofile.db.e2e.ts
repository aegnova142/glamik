/**
 * Profile updates for phone-only accounts.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/accountprofile.db.e2e.ts
 *
 * An account created by mobile + OTP has no name the customer chose and no
 * email at all, so PUT /account/profile is the only way it ever gets either.
 * That makes this endpoint part of the sign-up story rather than a settings
 * screen, and three of its properties are load-bearing:
 *
 *   IT UPDATES, NEVER INSERTS. Adding an email must change the row the
 *   customer is signed into. A second row would split their orders, points
 *   and addresses in a way nothing later can merge.
 *
 *   AN ABSENT KEY MEANS "LEAVE IT ALONE". The column that matters here is
 *   phone: it was proved by OTP, and a save that never mentioned it used to
 *   null it — because `String(undefined || '')` and `String('' || '')` are the
 *   same value, so "not supplied" and "cleared" were indistinguishable.
 *
 *   A CLEARED EMAIL IS NULL, NOT ''. The UNIQUE constraint on email is not
 *   partial, so Postgres permits many NULLs but only ONE ''. Two customers
 *   clearing their address would collide on the second one.
 *
 * Sessions come from the real Firebase sign-in route with a stubbed verifier,
 * so the accounts under test are built exactly the way production builds them.
 * No SMTP is configured here and no mail is sent.
 */

process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

process.env.FIREBASE_PROJECT_ID = 'glamirk-test-project';
process.env.SMS_PROVIDER = 'firebase';

import assert from 'node:assert/strict';
import express from 'express';
import { createServer, Server } from 'http';

/** Stub verifier — no SDK, no credential, no network. */
let nextPhone = '';
const authStub = {
  verifyIdToken: async (_token: string) => ({
    uid: `firebase-uid-${nextPhone}`,
    phone_number: nextPhone,
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: 'phone' },
  }),
};

import { pool } from '../db/db';
import customerRouter from '../routes/customer.routes';
import accountRouter from '../routes/account.routes';
import { __setFirebaseAuthForTests } from '../services/firebaseAuth.service';

__setFirebaseAuthForTests(authStub as any);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

// ------------------------------------------
// Fixtures
// ------------------------------------------

const PHONE_A = '+919876591001';
const PHONE_B = '+919876591002';
const EMAIL_A = 'phone.only.a@glamirk-test.invalid';
const EMAIL_B = 'phone.only.b@glamirk-test.invalid';
const ALL_PHONES = [PHONE_A, PHONE_B];
const ALL_EMAILS = [EMAIL_A, EMAIL_B];

let server: Server;
let baseUrl = '';

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/customer', customerRouter);
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

/** Signs in by phone the way production does, returning the bearer token. */
async function signInByPhone(phoneE164: string): Promise<{ token: string; id: string; isNewAccount: boolean }> {
  nextPhone = phoneE164;
  const res = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: 'fake-NOT-A-CREDENTIAL' });
  if (res.status !== 200) throw new Error(`sign-in failed for ${phoneE164}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, id: res.body.user.id, isNewAccount: res.body.isNewAccount };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function row(phoneE164: string) {
  const res = await pool.query('SELECT * FROM customers WHERE phone_e164 = $1', [phoneE164]);
  return res.rows[0];
}

async function clearRows() {
  await pool
    .query(
      `DELETE FROM customer_sessions WHERE user_id IN (
         SELECT id FROM customers WHERE phone_e164 = ANY($1) OR email = ANY($2))`,
      [ALL_PHONES, ALL_EMAILS]
    )
    .catch(() => undefined);
  await pool
    .query(
      `DELETE FROM reward_transactions WHERE user_id IN (
         SELECT id FROM customers WHERE phone_e164 = ANY($1) OR email = ANY($2))`,
      [ALL_PHONES, ALL_EMAILS]
    )
    .catch(() => undefined);
  await pool.query('DELETE FROM customers WHERE phone_e164 = ANY($1) OR email = ANY($2)', [ALL_PHONES, ALL_EMAILS]);
}

async function main(): Promise<void> {
  await startServer();
  await clearRows();

  // ==========================================
  section('1. A phone-only account can add an email');

  const a = await signInByPhone(PHONE_A);
  {
    const before = await row(PHONE_A);
    check('the account starts with no email', before.email === null);
    check('and is already phone-verified', before.phone_verified === true);

    const res = await api('PUT', '/api/customer/account/profile', { email: EMAIL_A }, auth(a.token));
    check('adding an email succeeds', res.status === 200, JSON.stringify(res.body));
    check('and it comes back on the profile', res.body.profile?.email === EMAIL_A);

    const after = await row(PHONE_A);
    check('the email is stored on the row', after.email === EMAIL_A);
    check('on the SAME customer, not a new one', after.id === a.id);

    const count = await pool.query('SELECT count(*)::int AS n FROM customers WHERE email = $1', [EMAIL_A]);
    check('exactly one account holds the address', count.rows[0].n === 1);
  }

  {
    // Case and whitespace are normalised, so the same address cannot be
    // claimed twice in two spellings.
    const res = await api('PUT', '/api/customer/account/profile', { email: `  ${EMAIL_A.toUpperCase()}  ` }, auth(a.token));
    check('a mixed-case address normalises to lowercase', res.status === 200 && res.body.profile?.email === EMAIL_A);
  }

  {
    const res = await api('PUT', '/api/customer/account/profile', { email: 'not-an-address' }, auth(a.token));
    check('a malformed address is refused', res.status === 400);
    check('and the stored email is unchanged', (await row(PHONE_A)).email === EMAIL_A);
  }

  // ==========================================
  section('2. An address owned by someone else is refused');

  const b = await signInByPhone(PHONE_B);
  {
    const res = await api('PUT', '/api/customer/account/profile', { email: EMAIL_A }, auth(b.token));
    check('claiming another account\'s address returns 409', res.status === 409, `got ${res.status}`);
    check('with a clear reason, not a database error', /already in use/i.test(res.body.error || ''));
    check('the second account keeps no email', (await row(PHONE_B)).email === null);
    check('and the first account still owns it', (await row(PHONE_A)).email === EMAIL_A);

    const count = await pool.query('SELECT count(*)::int AS n FROM customers WHERE email = $1', [EMAIL_A]);
    check('still exactly one holder', count.rows[0].n === 1);
  }

  // ==========================================
  section('3. A cleared email is NULL, never an empty string');

  {
    // The constraint is UNIQUE(email), not partial — many NULLs are allowed,
    // but a second '' would collide. Both accounts clear in turn to prove it.
    await api('PUT', '/api/customer/account/profile', { email: EMAIL_B }, auth(b.token));
    check('the second account can take its own address', (await row(PHONE_B)).email === EMAIL_B);

    const cleared = await api('PUT', '/api/customer/account/profile', { email: '' }, auth(b.token));
    check('clearing the email succeeds', cleared.status === 200);
    const bRow = await row(PHONE_B);
    check('the column is NULL', bRow.email === null);
    check('and is NOT an empty string', bRow.email !== '');

    const clearedA = await api('PUT', '/api/customer/account/profile', { email: '' }, auth(a.token));
    check('a SECOND account can clear its email too', clearedA.status === 200, JSON.stringify(clearedA.body));
    check('without colliding on the unique index', (await row(PHONE_A)).email === null);

    // Put A's address back for the verification-state cases below.
    await api('PUT', '/api/customer/account/profile', { email: EMAIL_A }, auth(a.token));
  }

  // ==========================================
  section('4. An omitted phone field preserves the verified number');

  {
    const before = await row(PHONE_A);
    check('the account has a phone and phone_e164 to lose', !!before.phone && before.phone_e164 === PHONE_A);

    // The exact shape that used to wipe it: a save that never mentions phone.
    const res = await api('PUT', '/api/customer/account/profile', { dateOfBirth: '1994-04-01' }, auth(a.token));
    check('a save with no phone key succeeds', res.status === 200);

    const after = await row(PHONE_A);
    check('the free-text phone survives', after.phone === before.phone, `was ${before.phone}, now ${after.phone}`);
    check('phone_e164 survives', after.phone_e164 === PHONE_A);
    check('and it is still marked verified', after.phone_verified === true);
    check('phone and phone_e164 did not desynchronise', !!after.phone && !!after.phone_e164);
    check('the date of birth was applied', !!after.date_of_birth);
  }

  {
    // An intentional change is still honoured, and still drops verification.
    const res = await api('PUT', '/api/customer/account/profile', { phone: '9811111111' }, auth(a.token));
    check('an explicitly supplied phone is applied', res.status === 200 && (await row(PHONE_A)).phone === '9811111111');
    check('and changing it clears phone_verified', (await row(PHONE_A)).phone_verified === false);
  }

  // ==========================================
  section('5. Other fields save without resubmitting a name');

  {
    const before = await row(PHONE_A);

    const dobOnly = await api('PUT', '/api/customer/account/profile', { dateOfBirth: '1990-02-02' }, auth(a.token));
    check('a date-of-birth-only update succeeds', dobOnly.status === 200, JSON.stringify(dobOnly.body));
    check('the name is untouched', (await row(PHONE_A)).name === before.name);

    const genderOnly = await api('PUT', '/api/customer/account/profile', { gender: 'female' }, auth(a.token));
    check('a gender-only update succeeds', genderOnly.status === 200, JSON.stringify(genderOnly.body));
    const afterGender = await row(PHONE_A);
    check('the gender was applied', afterGender.gender === 'female');
    check('the name is still untouched', afterGender.name === before.name);
    check('and the date of birth set a moment ago survives', !!afterGender.date_of_birth);
  }

  {
    // Supplying a name still works, and supplying a BLANK one is refused
    // rather than overwriting a real name with nothing.
    const named = await api('PUT', '/api/customer/account/profile', { firstName: 'Asha', lastName: 'Verma' }, auth(a.token));
    check('a supplied name is saved', named.status === 200 && (await row(PHONE_A)).name === 'Asha Verma');

    const blank = await api('PUT', '/api/customer/account/profile', { firstName: '   ' }, auth(a.token));
    check('a blank name is refused', blank.status === 400);
    check('and the existing name is not overwritten', (await row(PHONE_A)).name === 'Asha Verma');
  }

  // ==========================================
  section('6. Changing an email resets its verification state');

  {
    // Put the account into the state a verified customer is in.
    await pool.query(
      `UPDATE customers SET email_verified = true, email_verification_token = 'pending-token',
         email_verification_expiry = now() + interval '1 day' WHERE id = $1`,
      [a.id]
    );
    const before = await row(PHONE_A);
    check('the account is set up as verified with a pending token', before.email_verified === true);

    const res = await api('PUT', '/api/customer/account/profile', { email: EMAIL_B }, auth(a.token));
    check('changing the address succeeds', res.status === 200);

    const after = await row(PHONE_A);
    check('the new address is stored', after.email === EMAIL_B);
    check('verification is reset — the new address is unproved', after.email_verified === false);
    check('the pending token is invalidated', after.email_verification_token === null);
    check('and so is its expiry', after.email_verification_expiry === null);
  }

  // ==========================================
  section('7. An unchanged email keeps its verification');

  {
    await pool.query('UPDATE customers SET email_verified = true WHERE id = $1', [a.id]);

    // Resubmitting the same address, and a save that omits email entirely.
    const same = await api('PUT', '/api/customer/account/profile', { email: EMAIL_B }, auth(a.token));
    check('resubmitting the same address succeeds', same.status === 200);
    check('and verification is NOT lost', (await row(PHONE_A)).email_verified === true);

    const differentCase = await api('PUT', '/api/customer/account/profile', { email: EMAIL_B.toUpperCase() }, auth(a.token));
    check('the same address in another case is not treated as a change', differentCase.status === 200);
    check('so verification survives that too', (await row(PHONE_A)).email_verified === true);

    const omitted = await api('PUT', '/api/customer/account/profile', { gender: 'prefer_not_to_say' }, auth(a.token));
    check('a save that omits email succeeds', omitted.status === 200);
    const after = await row(PHONE_A);
    check('the address is untouched', after.email === EMAIL_B);
    check('and still verified', after.email_verified === true);
  }

  // ==========================================
  section('8. Surrounding behaviour still holds');

  {
    const noAuth = await api('PUT', '/api/customer/account/profile', { gender: 'female' });
    check('the endpoint still requires a session', noAuth.status === 401 || noAuth.status === 403);

    const longName = await api('PUT', '/api/customer/account/profile', { firstName: 'x'.repeat(61) }, auth(a.token));
    check('an over-long name is still refused', longName.status === 400);

    const badGender = await api('PUT', '/api/customer/account/profile', { gender: 'not-an-option' }, auth(a.token));
    check('an invalid gender is still refused', badGender.status === 400);

    const futureDob = await api('PUT', '/api/customer/account/profile', { dateOfBirth: '2999-01-01' }, auth(a.token));
    check('a future date of birth is still refused', futureDob.status === 400);

    const badPhone = await api('PUT', '/api/customer/account/profile', { phone: '12345' }, auth(a.token));
    check('an invalid phone is still refused', badPhone.status === 400);

    // The profile read still works and still reflects the row.
    const profile = await api('GET', '/api/customer/account/profile', undefined, auth(a.token));
    check('the profile still loads', profile.status === 200);
    check('and reports the stored email', profile.body.profile?.email === EMAIL_B);

    // Signing in again by phone resolves the SAME account, now that it has an
    // email — adding one must not have broken phone identity.
    const again = await signInByPhone(PHONE_A);
    check('signing in by phone still resolves the same account', again.id === a.id);
    check('and is not reported as a new account', again.isNewAccount === false);
  }

  // ==========================================
  section('9. Verification cannot be requested without an address');

  {
    const c = await signInByPhone(PHONE_B);
    check('a fresh phone-only account has no email', (await row(PHONE_B)).email === null);

    const res = await api('POST', '/api/customer/account/profile/send-email-verification', {}, auth(c.token));
    check('requesting verification returns 400, not a crash', res.status === 400, `got ${res.status}`);
    check('and says what to do first', /add an email/i.test(res.body.error || ''));
  }

  await clearRows();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  __setFirebaseAuthForTests(null);

  if (failed > 0) {
    console.log(`\n${failed} FAILED, ${passed} passed\n`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} account-profile checks passed.\n`);
  assert.ok(passed > 0);
}

main().catch(async (err) => {
  console.error('\nTest run crashed:', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
