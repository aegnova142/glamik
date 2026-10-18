/**
 * Customer address book.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/addresses.db.e2e.ts
 *
 * Addresses are the one piece of customer data that another customer would
 * most like to read: a name, a phone number and where someone lives. So the
 * property this file cares about most is not that CRUD works — it is that
 * every route is scoped to the caller, and that an id belonging to someone
 * else is indistinguishable from an id that does not exist.
 *
 * The second property is about history. An order stores its shipping address
 * as a JSONB snapshot, so editing or deleting a saved address must not reach
 * backwards into orders already placed. That is asserted directly rather than
 * assumed from the column type.
 *
 * Sessions come from the real Firebase sign-in route with a stubbed verifier,
 * so the accounts here are built the way production builds them.
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

const PHONE_A = '+919123955001';
const PHONE_B = '+919123955002';
const ALL = [PHONE_A, PHONE_B];

let server: Server;
let baseUrl = '';

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/customer', customerRouter);
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

async function signIn(phoneE164: string): Promise<{ token: string; id: string }> {
  nextPhone = phoneE164;
  const res = await api('POST', '/api/customer/auth/otp/firebase/verify', { idToken: 'fake-NOT-A-CREDENTIAL' });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, id: res.body.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const VALID = {
  name: 'Asha Verma',
  phone: '9876501234',
  addressLine1: '12 Marine Drive',
  area: 'Churchgate',
  landmark: 'Opposite the pier',
  city: 'Mumbai',
  state: 'Maharashtra',
  pinCode: '400020',
  type: 'Home',
};

async function clearRows() {
  const ids = await pool.query('SELECT id FROM customers WHERE phone_e164 = ANY($1)', [ALL]);
  const userIds = ids.rows.map((r: any) => r.id);
  if (userIds.length) {
    await pool.query('DELETE FROM orders WHERE user_id = ANY($1)', [userIds]).catch(() => undefined);
    await pool.query('DELETE FROM customer_addresses WHERE user_id = ANY($1)', [userIds]).catch(() => undefined);
    await pool
      .query('DELETE FROM customer_sessions WHERE user_id = ANY($1)', [userIds])
      .catch(() => undefined);
  }
  await pool.query('DELETE FROM customers WHERE phone_e164 = ANY($1)', [ALL]);
}

async function main(): Promise<void> {
  await startServer();
  await clearRows();

  const a = await signIn(PHONE_A);
  const b = await signIn(PHONE_B);

  // ==========================================
  section('1. Creating an address');

  let addressId = '';
  {
    const res = await api('POST', '/api/customer/addresses', VALID, auth(a.token));
    check('a valid address is accepted', res.status === 200, JSON.stringify(res.body));
    check('and the list comes back with it', Array.isArray(res.body.addresses) && res.body.addresses.length === 1);

    const saved = res.body.addresses[0];
    addressId = saved.id;
    check('the recipient name is stored', saved.name === VALID.name);
    check('the locality is stored', saved.area === VALID.area);
    check('the landmark is stored', saved.landmark === VALID.landmark);
    check('the pin code is stored', saved.pinCode === VALID.pinCode);
    check('the type is stored', saved.type === 'Home');

    const owned = await pool.query('SELECT user_id FROM customer_addresses WHERE id = $1', [addressId]);
    check('and it belongs to the caller', owned.rows[0].user_id === a.id);
  }

  // ==========================================
  section('2. Invalid input is refused');

  {
    const bad: Array<[string, any]> = [
      ['missing name', { ...VALID, name: '' }],
      ['missing address line', { ...VALID, addressLine1: '' }],
      ['missing city', { ...VALID, city: '' }],
      ['missing state', { ...VALID, state: '' }],
      ['missing pin code', { ...VALID, pinCode: '' }],
      ['pin code too short', { ...VALID, pinCode: '40002' }],
      ['pin code starting with 0', { ...VALID, pinCode: '040020' }],
      ['pin code with letters', { ...VALID, pinCode: '4000A0' }],
      ['phone too short', { ...VALID, phone: '98765' }],
      ['phone not a mobile series', { ...VALID, phone: '1234567890' }],
      ['malformed email', { ...VALID, email: 'not-an-email' }],
    ];

    for (const [label, payload] of bad) {
      const res = await api('POST', '/api/customer/addresses', payload, auth(a.token));
      check(`${label} is refused`, res.status === 400, `got ${res.status}`);
    }

    const count = await pool.query('SELECT count(*)::int AS n FROM customer_addresses WHERE user_id = $1', [a.id]);
    check('none of them was stored', count.rows[0].n === 1);
  }

  // ==========================================
  section('3. Editing updates in place, never duplicates');

  {
    const before = await pool.query('SELECT count(*)::int AS n FROM customer_addresses WHERE user_id = $1', [a.id]);

    const res = await api(
      'PUT',
      `/api/customer/addresses/${addressId}`,
      { ...VALID, name: 'Asha V. Verma', landmark: 'Next to the lighthouse' },
      auth(a.token)
    );
    check('the edit is accepted', res.status === 200, JSON.stringify(res.body));

    const after = await pool.query(
      'SELECT id, name, landmark, city FROM customer_addresses WHERE user_id = $1',
      [a.id]
    );
    check('still exactly one address', after.rows.length === before.rows[0].n);
    check('the same record was updated', after.rows[0].id === addressId);
    check('the changed field is changed', after.rows[0].name === 'Asha V. Verma');
    check('the other changed field too', after.rows[0].landmark === 'Next to the lighthouse');
    check('and untouched fields survive', after.rows[0].city === VALID.city);
  }

  // ==========================================
  section('4. One customer cannot reach another’s addresses');

  {
    const listB = await api('GET', '/api/customer/addresses', undefined, auth(b.token));
    check('B’s list is empty — it is scoped to B', listB.status === 200 && listB.body.addresses.length === 0);

    const readAcross = await api(
      'PUT',
      `/api/customer/addresses/${addressId}`,
      { ...VALID, name: 'Hijacked' },
      auth(b.token)
    );
    check('B cannot edit A’s address', readAcross.status === 404, `got ${readAcross.status}`);

    const stillA = await pool.query('SELECT name FROM customer_addresses WHERE id = $1', [addressId]);
    check('and A’s address is unchanged', stillA.rows[0].name === 'Asha V. Verma');

    const deleteAcross = await api('DELETE', `/api/customer/addresses/${addressId}`, undefined, auth(b.token));
    check('B cannot delete A’s address', deleteAcross.status === 404, `got ${deleteAcross.status}`);

    const survives = await pool.query('SELECT count(*)::int AS n FROM customer_addresses WHERE id = $1', [addressId]);
    check('the address survives the attempt', survives.rows[0].n === 1);

    // 404 rather than 403: a different status would confirm the id exists.
    const nonexistent = await api('DELETE', '/api/customer/addresses/addr-does-not-exist', undefined, auth(b.token));
    check('an unknown id is also a 404, so ids cannot be probed', nonexistent.status === 404);
  }

  {
    const anon = await api('GET', '/api/customer/addresses');
    check('the list requires a session', anon.status === 401 || anon.status === 403);
    const anonPost = await api('POST', '/api/customer/addresses', VALID);
    check('creating requires a session', anonPost.status === 401 || anonPost.status === 403);
  }

  // ==========================================
  section('5. Historical orders keep their own copy');

  {
    // An order stores the address as a JSONB snapshot at checkout time.
    const orderId = `ord-test-${Date.now()}`;
    await pool.query(
      `INSERT INTO orders (id, user_id, order_number, status, subtotal, discount, shipping, total,
                           shipping_address, payment_method, payment_status)
       VALUES ($1, $2, $3, 'PLACED', 100, 0, 0, 100, $4, 'cod', 'PENDING')`,
      [orderId, a.id, `GLM-TEST-${Date.now()}`, JSON.stringify({ ...VALID, name: 'Asha V. Verma' })]
    );

    // Edit the saved address to something completely different…
    await api(
      'PUT',
      `/api/customer/addresses/${addressId}`,
      { ...VALID, name: 'Someone Else', city: 'Pune', pinCode: '411001' },
      auth(a.token)
    );

    const order = await pool.query('SELECT shipping_address FROM orders WHERE id = $1', [orderId]);
    const snapshot = order.rows[0].shipping_address;
    check('the order still shows who it shipped to', snapshot.name === 'Asha V. Verma');
    check('and where it shipped', snapshot.city === VALID.city);
    check('not the edited values', snapshot.city !== 'Pune');

    // …then delete it entirely.
    const del = await api('DELETE', `/api/customer/addresses/${addressId}`, undefined, auth(a.token));
    check('the address can be deleted', del.status === 200, JSON.stringify(del.body));

    const orderAfter = await pool.query('SELECT shipping_address FROM orders WHERE id = $1', [orderId]);
    check('the order survives the deletion', orderAfter.rows.length === 1);
    check('with its address intact', orderAfter.rows[0].shipping_address.name === 'Asha V. Verma');

    await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
  }

  // ==========================================
  section('6. Deleting removes only the chosen address');

  {
    const first = await api('POST', '/api/customer/addresses', VALID, auth(a.token));
    const second = await api(
      'POST',
      '/api/customer/addresses',
      { ...VALID, name: 'Work desk', type: 'Work', addressLine1: '9 Tech Park' },
      auth(a.token)
    );
    check('two addresses exist', second.body.addresses.length === 2);

    const target = second.body.addresses.find((x: any) => x.name === 'Work desk');
    const keep = second.body.addresses.find((x: any) => x.name !== 'Work desk');

    const del = await api('DELETE', `/api/customer/addresses/${target.id}`, undefined, auth(a.token));
    check('the delete succeeds', del.status === 200);
    check('and the refreshed list has one left', del.body.addresses.length === 1);
    check('the one that was kept', del.body.addresses[0].id === keep.id);

    const gone = await pool.query('SELECT count(*)::int AS n FROM customer_addresses WHERE id = $1', [target.id]);
    check('the chosen record is gone from the database', gone.rows[0].n === 0);
    void first;
  }

  // ==========================================
  // Email is optional on every layer — nullable column, format-checked only
  // when present, and returned as undefined when absent. The TypeScript type
  // used to claim otherwise, which is what this section pins down.
  // ==========================================
  section('6b. An address needs no email address');

  {
    const { email, ...withoutEmail } = { ...VALID, email: 'ignored@example.invalid' } as any;
    void email;

    const created = await api(
      'POST',
      '/api/customer/addresses',
      { ...withoutEmail, name: 'No Email Here', addressLine1: '4 Quiet Lane' },
      auth(a.token)
    );
    check('an address with no email key is accepted', created.status === 200, JSON.stringify(created.body));

    const saved = created.body.addresses.find((x: any) => x.name === 'No Email Here');
    check('it is stored', !!saved);
    check('and the API reports no email rather than an empty string', saved.email === undefined);

    const col = await pool.query('SELECT email FROM customer_addresses WHERE id = $1', [saved.id]);
    check('the column is NULL, not an empty string', col.rows[0].email === null);

    // Editing it must not invent one either.
    const edited = await api(
      'PUT',
      `/api/customer/addresses/${saved.id}`,
      { ...withoutEmail, name: 'Still No Email', addressLine1: '4 Quiet Lane' },
      auth(a.token)
    );
    check('editing without an email succeeds', edited.status === 200, JSON.stringify(edited.body));

    const after = await pool.query('SELECT name, email FROM customer_addresses WHERE id = $1', [saved.id]);
    check('the edit applied', after.rows[0].name === 'Still No Email');
    check('and email is still NULL', after.rows[0].email === null);

    // An explicitly blank string must land as NULL too, not as ''.
    const blank = await api(
      'PUT',
      `/api/customer/addresses/${saved.id}`,
      { ...withoutEmail, email: '', name: 'Blank Email' },
      auth(a.token)
    );
    check('an explicitly blank email is accepted', blank.status === 200);
    const blankRow = await pool.query('SELECT email FROM customer_addresses WHERE id = $1', [saved.id]);
    check('and stored as NULL rather than an empty string', blankRow.rows[0].email === null);

    // A supplied address is still validated.
    const bad = await api(
      'PUT',
      `/api/customer/addresses/${saved.id}`,
      { ...withoutEmail, email: 'not-an-email' },
      auth(a.token)
    );
    check('a malformed email is still refused', bad.status === 400);

    await api('DELETE', `/api/customer/addresses/${saved.id}`, undefined, auth(a.token));
  }

  // ==========================================
  section('7. Saved addresses are what checkout offers');

  {
    // Checkout reads the same list this section writes to — there is no
    // second address store. Asserted through the API the storefront calls.
    const list = await api('GET', '/api/customer/addresses', undefined, auth(a.token));
    check('the list endpoint answers', list.status === 200);
    check('with the surviving address', list.body.addresses.length === 1);

    const addr = list.body.addresses[0];
    for (const field of ['id', 'name', 'phone', 'addressLine1', 'city', 'state', 'pinCode', 'type']) {
      check(`it carries ${field}, which checkout needs`, addr[field] !== undefined && addr[field] !== null);
    }
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
  console.log(`\nAll ${passed} address checks passed.\n`);
  assert.ok(passed > 0);
}

main().catch(async (err) => {
  console.error('\nTest run crashed:', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
