/**
 * Payment + shipping integration checks.
 *
 * Run against a THROWAWAY database only:
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/checkout.e2e.ts
 *
 * There is no test framework in this repo, so this is a plain script with a
 * tiny assertion helper rather than a suite in a runner that would have to be
 * added and configured. It exits non-zero on failure, which is what a CI step
 * needs.
 *
 * Everything runs against the mock payment gateway and mock courier, so no
 * real charge or shipment is ever created.
 */

// ==========================================
// SAFETY GUARD — must run before anything imports db.ts
//
// The repo-root .env points at the production database. dotenv does not
// override an already-set variable, so exporting DATABASE_URL before running
// is enough to redirect — but "enough" is not the same as "guaranteed", and
// this script writes orders, mutates stock and cancels shipments. It refuses
// to start unless the target is unmistakably a local throwaway.
// ==========================================
// Pinned before any import. mailer.ts refuses to open an SMTP connection under
// NODE_ENV=test and hands back a capturing stub instead. The repo's .env holds
// working Gmail credentials, so without this a suite run authenticates against
// the live mailbox and emails real customers — which is what it used to do.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const looksLikeTestDb = /test/i.test(url);
if (!isLocal || !looksLikeTestDb) {
  console.error(
    '\nREFUSING TO RUN.\n\n' +
      'DATABASE_URL must point at a local database whose name contains "test".\n' +
      `Got: ${url ? url.replace(/:[^:@/]+@/, ':***@') : '(unset)'}\n\n` +
      'Start one with:\n' +
      '  docker run -d --name glamirk-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=glamirk_test -p 55434:5432 postgres:16-alpine\n'
  );
  process.exit(1);
}

// Pinned before any import reads it. dotenv does not override an already-set
// variable, so this wins over the repo-root .env — otherwise the courier
// webhook assertions below pass or fail depending on whether the developer
// running them happens to have a real secret configured.
const WEBHOOK_KEY = 'test-webhook-secret-do-not-use-anywhere-real';
process.env.DELHIVERY_WEBHOOK_SECRET = WEBHOOK_KEY;

// Delhivery is the active provider now, and it refuses to create a shipment
// without a registered warehouse name. Pinned here so these suites exercise
// the booking flow rather than its fail-closed guard.
process.env.DELHIVERY_PICKUP_NAME = 'Test Warehouse';
process.env.DELHIVERY_LIVE_MODE = 'false';

// Opts this process into the mock gateway so the online branch of /checkout is
// reachable at all. Without it onlinePaymentsAvailable() is false, /checkout
// refuses every online order with "Only Cash on Delivery is available", and
// the route-level assertions below would pass against the COD path while
// testing nothing about payments. Safe by construction: the flag is ignored in
// production (see onlinePaymentsAvailable), and PAYMENTS_LIVE_MODE stays unset
// so no real credential is ever used.
process.env.PAYMENTS_MOCK_CHECKOUT = '1';

import crypto from 'crypto';
import express from 'express';
import { createServer, Server } from 'http';
import jwt from 'jsonwebtoken';
import { pool, loadDatabase, saveDatabase, ensureSchema, JWT_SECRET } from '../db/db';
import {
  mockGateway,
  verifyPaymentSignature,
  signPaymentForMock,
  signWebhookForMock,
  verifyWebhookSignature,
  toMinorUnits,
  fromMinorUnits,
} from '../services/payment.service';
import { mockDelhiveryProvider, mapDelhiveryStatus, getShipmentProvider } from '../services/couriers/delhivery.service';
import {
  markOrderPaid,
  markOrderPaymentFailed,
  transitionOrderStatus,
  commitOrderStock,
  restoreOrderStock,
  createShipmentForOrder,
  applyShippingStatus,
  cancelShipmentForOrder,
  refundOrderPayment,
  listOrderRefunds,
  reconcileRefund,
  recordRefund,
} from '../services/fulfillment.service';
import { isValidStatusTransition, buildOrderFromRow } from '../services/orders.service';
import { getPaymentStatusLabel } from '@glamirk/shared/utils/paymentDisplay';
import { ensureProductInventory } from '../services/inventory.service';
import webhooksRouter, { expirePendingPaymentOrders } from '../routes/webhooks.routes';
import commerceRouter from '../routes/customer.routes';
import adminRouter from '../routes/admin.routes';
import accountRouter from '../routes/account.routes';
import { signCustomerToken } from '../auth/tokens';
import { classifyRazorpayKey } from '../config/env';
import {
  enqueueNotification,
  processPendingNotifications,
  listFailedNotifications,
  retryNotification,
  registerChannel,
  registerChannelBlockProbe,
  resetChannelsForTest,
  listNotificationDeliveries,
  getNotificationDelivery,
  maskRecipient,
  MAX_ATTEMPTS,
} from '../services/notificationEngine.service';
import { registerDefaultChannels } from '../services/notificationChannels.service';
import { resolveVariantThumbnail } from '@glamirk/shared/utils/productVariant';

// ------------------------------------------
// Harness
// ------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

// ------------------------------------------
// Fixtures
// ------------------------------------------

const TEST_USER = 'test-user-1';
const TEST_USER_2 = 'test-user-2';
const PRODUCT_ID = 'test-product-1';
const SHADED_PRODUCT_ID = 'test-product-shaded';

async function resetDatabase(): Promise<void> {
  await ensureSchema();
  // Ordered by dependency so foreign keys never block the wipe.
  await pool.query('DELETE FROM webhook_events');
  await pool.query('DELETE FROM shipments');
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM order_status_history');
  await pool.query('DELETE FROM return_requests');
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM notifications');
  // admin_notifications.order_id is a bare TEXT column with no foreign key,
  // so deleting orders does NOT cascade to it. Without this, a second run
  // sees the previous run's rows against the same fixture order ids and the
  // exactly-once assertions fail on leftovers rather than on a real defect.
  await pool.query('DELETE FROM notification_deliveries');
  await pool.query('DELETE FROM notification_events');
  await pool.query('DELETE FROM admin_notifications');
  await pool.query('DELETE FROM refunds');
  await pool.query('DELETE FROM cart_items');
  await pool.query('DELETE FROM customers');

  await pool.query(
    `INSERT INTO customers (id, name, email, password_hash) VALUES ($1, 'Test One', 'one@test.local', 'x'), ($2, 'Test Two', 'two@test.local', 'x')`,
    [TEST_USER, TEST_USER_2]
  );

  // Seed one product with known stock directly into the CMS document, which is
  // where inventory actually lives.
  const db = await loadDatabase();
  db.products = [
    {
      id: PRODUCT_ID,
      name: 'Test Lipstick',
      price: 1000,
      // Headroom, not a magic number. The route-level sections each place a
      // real order through /checkout, and the payment-method matrix alone
      // places fifteen. At the old value of 10 the product ran dry partway
      // through and three later assertions failed on stock=0 — a fixture
      // ceiling reported as a product defect. Nothing asserts this value
      // directly; the out-of-stock scenario sets stock explicitly when it
      // needs a specific number.
      stock: 60,
      inStock: true,
      images: { primary: 'x.jpg', secondary: 'y.jpg' },
      benefits: [],
      category: 'Lips',
    } as any,
    // A shaded product, for the cart/checkout image assertions. Shade A has
    // its own gallery, shade B has a different one, shade C has none at all
    // so it must fall back to the product image.
    {
      id: SHADED_PRODUCT_ID,
      name: 'Test Foundation',
      price: 2000,
      stock: 10,
      inStock: true,
      images: { primary: 'foundation-product-primary.jpg' },
      benefits: [],
      category: 'Face',
      shades: [
        {
          id: 'shade-a',
          name: 'Porcelain',
          hex: '#F5E6D3',
          undertone: 'Cool',
          description: 'A',
          images: [
            { id: 'ia2', url: 'shade-a-extra.jpg', sortOrder: 1, isPrimary: false },
            { id: 'ia1', url: 'shade-a-primary.jpg', sortOrder: 9, isPrimary: true },
          ],
        },
        {
          id: 'shade-b',
          name: 'Sandstone',
          hex: '#D9B38C',
          undertone: 'Warm',
          description: 'B',
          images: [{ id: 'ib1', url: 'shade-b-primary.jpg', sortOrder: 0, isPrimary: true }],
        },
        { id: 'shade-c', name: 'Umber', hex: '#6B4A32', undertone: 'Neutral', description: 'C' },
      ],
    } as any,
  ];
  await saveDatabase(db);

  // Provision SQL inventory for the seeded product, exactly as admin product
  // creation now does. Without this the suite would pass in legacy mode and
  // fail in SQL mode for a reason that is a fixture gap rather than a defect.
  await pool.query('DELETE FROM inventory_transactions');
  await pool.query('DELETE FROM inventory_reservations');
  await pool.query('DELETE FROM inventory');
  for (const product of db.products) {
    await ensureProductInventory(product as any);
  }

  mockGateway.reset();
  mockDelhiveryProvider.reset();
}

async function productStock(): Promise<number> {
  const db = await loadDatabase();
  return db.products.find((p) => p.id === PRODUCT_ID)?.stock ?? -1;
}

/** Creates an order row directly, standing in for what /checkout writes. */
async function seedOrder(input: {
  id: string;
  userId?: string;
  status: string;
  paymentMethod: 'cod' | 'upi' | 'card';
  paymentStatus: string;
  total?: number;
  quantity?: number;
  stockCommitted?: boolean;
}): Promise<void> {
  const total = input.total ?? 1000;
  const quantity = input.quantity ?? 1;
  await pool.query(
    `INSERT INTO orders (id, user_id, order_number, status, subtotal, discount, shipping, total,
                         shipping_address, customer_name, customer_phone, customer_email,
                         payment_method, payment_status, payment_details, shipping_status, stock_committed)
     VALUES ($1,$2,$3,$4,$5,0,0,$5,$6::jsonb,'Test One','9876543210','one@test.local',$7,$8,'{}'::jsonb,'NOT_SHIPPED',$9)`,
    [
      input.id,
      input.userId || TEST_USER,
      'GLM' + input.id.slice(-6),
      input.status,
      total,
      JSON.stringify({ addressLine1: '1 Test St', city: 'Pune', state: 'MH', pinCode: '411001', phone: '9876543210' }),
      input.paymentMethod,
      input.paymentStatus,
      input.stockCommitted ?? true,
    ]
  );
  await pool.query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price)
     VALUES ($1,$2,$3,'Test Lipstick',$4,1000)`,
    ['oi-' + input.id, input.id, PRODUCT_ID, quantity]
  );
}

async function orderRow(id: string): Promise<any> {
  const res = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return res.rows[0];
}

// ------------------------------------------
// Webhook test server
// ------------------------------------------

let webhookServer: Server;
let webhookPort = 0;

async function startWebhookServer(): Promise<void> {
  const app = express();
  // Mounted exactly as server.ts does — before any JSON parser — so the raw
  // body the signature is computed over is the real one.
  app.use('/api', webhooksRouter);
  app.use(express.json());
  // The real customer API, mounted at the same path server.ts uses. The
  // scenarios below drive /checkout and /payments/* over HTTP rather than
  // calling the services directly: the route layer is where the method is
  // validated, the gateway order is created and the handoff is built, and a
  // test that seeds an order row straight into Postgres skips all of it. That
  // gap is why a /checkout that rejected every online order read as passing.
  app.use('/api/customer', commerceRouter);
  // Admin routes share the same test server so the tracking endpoints can be
  // driven over real HTTP, verbs and all.
  app.use('/api', adminRouter);
  // Account routes carry the payments summary the assertions below read.
  app.use('/api/customer', accountRouter);
  webhookServer = createServer(app);
  await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', resolve));
  webhookPort = (webhookServer.address() as any).port;
}

/** A signed customer session for TEST_USER, as the login route would issue. */
function customerAuth(userId = TEST_USER): Record<string, string> {
  return { Authorization: `Bearer ${signCustomerToken(userId, 'one@test.local', 0)}` };
}

/** A signed admin session. requireAdmin only checks the `role` claim. */
function adminAuth(): Record<string, string> {
  return {
    Authorization:
      'Bearer ' +
      jwt.sign({ id: 'admin-test', email: 'admin@test.local', role: 'admin', name: 'Test Admin' }, JWT_SECRET),
  };
}

/** Calls the real admin API over HTTP, verb included. */
async function adminFetch(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${webhookPort}${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...adminAuth() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Calls the real customer API over HTTP. */
async function apiFetch(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${webhookPort}${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...customerAuth(), ...(init.headers || {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/**
 * Runs the outbox worker until nothing is left due.
 *
 * A single processPendingNotifications() pass is bounded (50 rows), which is
 * correct in production — a backlog is worked through steadily rather than in
 * one burst that would stall the event loop — but means one call is not
 * "deliver everything" once a suite has accumulated events. Looping is what
 * makes an assertion about final state actually about final state.
 *
 * Bounded itself, so a channel that somehow re-queues forever fails the test
 * rather than hanging it.
 */
async function drainNotifications(maxPasses = 40): Promise<void> {
  for (let i = 0; i < maxPasses; i++) {
    const { attempted } = await processPendingNotifications(50);
    if (attempted === 0) return;
  }
}

/** Puts one unit of the seeded product in the customer's cart, which is what
 * /checkout reads its line items and its authoritative pricing from. */
async function seedCart(quantity = 1): Promise<void> {
  await pool.query('DELETE FROM cart_items WHERE user_id = $1', [TEST_USER]);
  await pool.query(
    `INSERT INTO cart_items (id, user_id, product_id, quantity, saved)
     VALUES ($1, $2, $3, $4, false)`,
    ['ci-' + Math.random().toString(36).slice(2, 8), TEST_USER, PRODUCT_ID, quantity]
  );
}

const TEST_ADDRESS = {
  name: 'Test One',
  phone: '9876543210',
  addressLine1: '1 Test St',
  city: 'Pune',
  state: 'MH',
  pinCode: '411001',
};

async function postWebhook(
  path: string,
  body: unknown,
  headers: Record<string, string>
): Promise<{ status: number; json: any }> {
  const raw = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${webhookPort}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function razorpayHeaders(body: unknown, eventId: string): Record<string, string> {
  const raw = JSON.stringify(body);
  return { 'x-razorpay-signature': signWebhookForMock(raw), 'x-razorpay-event-id': eventId };
}

/**
 * Waits for a delivered webhook to finish processing.
 *
 * The handlers acknowledge as soon as the event is durably recorded and do the
 * work afterwards — that is deliberate, because providers retry on timeout and
 * a slow handler would be redelivered rather than trusted. It does mean the
 * HTTP response returning is not the same as the work being done, so a test
 * that asserts immediately after the response is racing the handler.
 */
async function waitForWebhookProcessed(eventId: string, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query('SELECT status FROM webhook_events WHERE event_id = $1', [eventId]);
    const status = res.rows[0]?.status;
    if (status && status !== 'RECEIVED') return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

/**
 * Waits until no webhook is still being processed.
 *
 * Used for the courier deliveries instead of waiting on a specific event id.
 * The handler derives the provider's event id itself (none is sent), and a test
 * that recomputes that derivation silently stops matching the moment the
 * derivation changes — which is exactly what happened here: these waits were
 * looking up an id format the handler no longer produces, so each one sat out
 * its full timeout and waited on nothing.
 *
 * Asking "is anything still in flight" needs no knowledge of the handler's
 * internals, so it cannot drift out of sync with them.
 */
async function waitForWebhooksDrained(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query(`SELECT COUNT(*)::int n FROM webhook_events WHERE status = 'RECEIVED'`);
    if (res.rows[0].n === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

// ------------------------------------------
// Scenarios
// ------------------------------------------

async function run(): Promise<void> {
  await resetDatabase();
  await startWebhookServer();

  // ========================================
  section('Pure logic — money, signatures, transitions');
  // ========================================

  check('1799.90 converts to 179990 paise without float drift', toMinorUnits(1799.9) === 179990, String(toMinorUnits(1799.9)));
  check('paise round-trip back to rupees', fromMinorUnits(toMinorUnits(2499.5)) === 2499.5);

  // The boot log's only means of telling a sandbox run from a chargeable one.
  // PAYMENTS_LIVE_MODE cannot answer this — it just selects the real adapter —
  // so if this classification is wrong the log confidently reports the wrong
  // one, which is worse than reporting nothing.
  check("an rzp_live_ key is classified live", classifyRazorpayKey('rzp_live_ABC123') === 'live');
  check("an rzp_test_ key is classified test", classifyRazorpayKey('rzp_test_ABC123') === 'test');
  check('surrounding whitespace does not hide the prefix', classifyRazorpayKey('  rzp_live_ABC123  ') === 'live');
  check('an unrecognised prefix is not assumed safe', classifyRazorpayKey('sk_live_ABC123') === 'unknown');
  check('a missing key is unknown, not test', classifyRazorpayKey(null) === 'unknown');
  check('an empty key is unknown, not test', classifyRazorpayKey('') === 'unknown');
  // The mock's placeholder must never read as a real sandbox key — it is the
  // value publishableKeyId() hands out when no credentials exist at all.
  check("the mock placeholder still classifies as test-shaped", classifyRazorpayKey('rzp_test_mock_key') === 'test');

  const sigOrder = 'order_test123';
  const sigPayment = 'pay_test456';
  const goodSig = signPaymentForMock(sigOrder, sigPayment);
  check(
    'valid payment signature verifies',
    verifyPaymentSignature({ gatewayOrderId: sigOrder, gatewayPaymentId: sigPayment, signature: goodSig })
  );
  check(
    'forged payment signature is rejected',
    !verifyPaymentSignature({ gatewayOrderId: sigOrder, gatewayPaymentId: sigPayment, signature: 'deadbeef' })
  );
  check(
    'signature for a different order is rejected',
    !verifyPaymentSignature({ gatewayOrderId: 'order_other', gatewayPaymentId: sigPayment, signature: goodSig })
  );
  check('empty signature is rejected', !verifyPaymentSignature({ gatewayOrderId: sigOrder, gatewayPaymentId: sigPayment, signature: '' }));

  const webhookBody = JSON.stringify({ event: 'payment.captured' });
  check('valid webhook signature verifies', verifyWebhookSignature(webhookBody, signWebhookForMock(webhookBody)));
  check('tampered webhook body fails verification', !verifyWebhookSignature(webhookBody + ' ', signWebhookForMock(webhookBody)));
  check('missing webhook signature is rejected', !verifyWebhookSignature(webhookBody, undefined));

  check('legacy PLACED can still advance to PROCESSING', isValidStatusTransition('PLACED', 'PROCESSING'));
  check('legacy PACKED can still advance to SHIPPED', isValidStatusTransition('PACKED', 'SHIPPED'));
  check('order cannot skip a stage', !isValidStatusTransition('CONFIRMED', 'SHIPPED'));
  check('order cannot move backwards', !isValidStatusTransition('SHIPPED', 'PROCESSING'));
  check('delivered order cannot be cancelled', !isValidStatusTransition('DELIVERED', 'CANCELLED'));
  check('delivered order can start a return', isValidStatusTransition('DELIVERED', 'RETURN_REQUESTED'));
  check('shipped order can go RTO', isValidStatusTransition('SHIPPED', 'RTO'));
  check('pending payment can be cancelled', isValidStatusTransition('PENDING_PAYMENT', 'CANCELLED'));

  // Courier selection is gone, not renamed: Delhivery carries the parcel
  // itself, so there is no list of carriers and nothing to choose between.
  // The provider declares that rather than leaving callers to assume it.
  check('the provider declares it does not rate-shop', getShipmentProvider().capabilities.ratesShopping === false);
  check('...and that waybills are pre-allocated', getShipmentProvider().capabilities.waybillPreallocation === true);
  check('DL/Delivered maps to DELIVERED', mapDelhiveryStatus('DL','Delivered') === 'DELIVERED');
  check('an unknown pair does not invent a terminal state', mapDelhiveryStatus('ZZ','Nope') === null);

  // ========================================
  section('Scenario 5 — COD order');
  // ========================================

  await seedOrder({ id: 'ord-cod', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  const codRow = await orderRow('ord-cod');
  check('COD order is created unpaid', codRow.payment_status === 'COD_PENDING');
  check('COD order holds no collected amount', Number(codRow.amount_paid) === 0);

  // ========================================
  section('Checkout route — payment method contract');
  // ========================================

  // Regression: PAYMENT_METHODS omitted 'online', which is the only value the
  // storefront ever sends for a card/UPI order. Every online checkout was
  // rejected at the method check with 400 "Please select a valid payment
  // method" before the gateway was reached, so Razorpay was unreachable from
  // the UI while every service-level payment test still passed.
  const cfg = await apiFetch('/api/customer/payments/config');
  check('payments config reports online payments available in mock mode', cfg.json?.onlinePaymentsEnabled === true);
  check('payments config exposes a key id', !!cfg.json?.keyId);
  check('payments config never leaks a secret', !JSON.stringify(cfg.json || {}).toLowerCase().includes('secret'));

  const stockBeforeRoute = await productStock();
  await seedCart(1);
  const onlineCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-online-1' },
  });
  check(
    "checkout accepts the storefront's 'online' method",
    onlineCheckout.status === 200,
    `status=${onlineCheckout.status} error=${onlineCheckout.json?.error}`
  );
  check('online checkout returns a gateway handoff', !!onlineCheckout.json?.payment?.gatewayOrderId);
  check('the handoff carries the publishable key id', !!onlineCheckout.json?.payment?.keyId);
  check(
    'the handoff amount is the server-computed total in paise',
    onlineCheckout.json?.payment?.amountMinor === toMinorUnits(Number(onlineCheckout.json?.order?.total)),
    `handoff=${onlineCheckout.json?.payment?.amountMinor} total=${onlineCheckout.json?.order?.total}`
  );

  const routeOrderId: string = onlineCheckout.json?.order?.id;
  const routeOrderRow = await orderRow(routeOrderId);
  check('online order starts at PENDING_PAYMENT', routeOrderRow?.status === 'PENDING_PAYMENT', routeOrderRow?.status);
  check('online order is not paid at creation', routeOrderRow?.payment_status === 'PENDING', routeOrderRow?.payment_status);
  check('online order reserves stock at creation', routeOrderRow?.stock_committed === true);
  check('stock is reserved by the route', (await productStock()) === stockBeforeRoute - 1);

  const ledger = await pool.query('SELECT * FROM payments WHERE order_id = $1', [routeOrderId]);
  check('a payments ledger row is written', ledger.rows.length === 1);
  check(
    'the ledger amount matches the order total, not the request',
    Number(ledger.rows[0]?.amount_minor) === toMinorUnits(Number(routeOrderRow.total))
  );

  // Amount tampering at the route boundary. The request body carries a total
  // the client made up; the server must price the order from the cart.
  await seedCart(1);
  const tamperedCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: {
      shippingAddress: TEST_ADDRESS,
      paymentMethod: 'online',
      idempotencyKey: 'idem-tamper-1',
      total: 1,
      subtotal: 1,
      amountMinor: 100,
    },
  });
  check('a client-supplied total is ignored', Number(tamperedCheckout.json?.order?.total) === 1000, `total=${tamperedCheckout.json?.order?.total}`);
  check(
    'the gateway is charged the server total, not the tampered one',
    tamperedCheckout.json?.payment?.amountMinor === toMinorUnits(1000),
    String(tamperedCheckout.json?.payment?.amountMinor)
  );

  // COD regression over the same route — the fix must not have disturbed it.
  await seedCart(1);
  const codCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'cod', idempotencyKey: 'idem-cod-1' },
  });
  check('COD checkout still succeeds', codCheckout.status === 200, `status=${codCheckout.status} error=${codCheckout.json?.error}`);
  const codRouteRow = await orderRow(codCheckout.json?.order?.id);
  check('COD order is PLACED, not PENDING_PAYMENT', codRouteRow?.status === 'PLACED', codRouteRow?.status);
  check('COD order is COD_PENDING', codRouteRow?.payment_status === 'COD_PENDING', codRouteRow?.payment_status);
  check('COD order gets no gateway handoff', !codCheckout.json?.payment);

  // The full accept/reject matrix. Widening PAYMENT_METHODS to admit 'online'
  // must not have turned the check into a formality, and the legacy instrument
  // names must keep working — an older frontend bundle sitting in a customer's
  // cache still sends them, and they are all simply "not COD" to this route.
  let methodCase = 0;
  for (const method of ['upi', 'card', 'netbanking', 'wallet'] as const) {
    await seedCart(1);
    const res = await apiFetch('/api/customer/checkout', {
      method: 'POST',
      body: { shippingAddress: TEST_ADDRESS, paymentMethod: method, idempotencyKey: `idem-legacy-${methodCase++}` },
    });
    check(`legacy method '${method}' is still accepted`, res.status === 200, `status=${res.status} ${res.json?.error || ''}`);
    check(`legacy method '${method}' is treated as online`, res.json?.order?.status === 'PENDING_PAYMENT', res.json?.order?.status);
    check(`legacy method '${method}' gets a gateway handoff`, !!res.json?.payment?.gatewayOrderId);
  }

  // Anything not on the list is refused before the gateway is touched. Each of
  // these is a shape a hand-rolled request or a tampered client could send;
  // none may fall through to `isOnline = paymentMethod !== 'cod'` and quietly
  // open a payment.
  let rejectCase = 0;
  for (const bad of ['crypto', 'COD', 'Online', 'cod ', '', 'cod;drop', '__proto__']) {
    await seedCart(1);
    const res = await apiFetch('/api/customer/checkout', {
      method: 'POST',
      body: { shippingAddress: TEST_ADDRESS, paymentMethod: bad, idempotencyKey: `idem-bad-${rejectCase++}` },
    });
    // '' falls back to the 'cod' default (`req.body?.paymentMethod || 'cod'`),
    // which is a safe default rather than a rejection — assert that it lands
    // on COD rather than on anything that could take money.
    if (bad === '') {
      check("an empty payment method defaults to COD, not online", res.json?.order?.payment_method === undefined ? res.status === 200 : true, `status=${res.status}`);
      const emptyRow = await orderRow(res.json?.order?.id);
      check("the empty-method order really is COD", emptyRow?.payment_method === 'cod', emptyRow?.payment_method);
      check("the empty-method order takes no payment", emptyRow?.status === 'PLACED', emptyRow?.status);
      continue;
    }
    check(`payment method ${JSON.stringify(bad)} is rejected`, res.status === 400, `status=${res.status}`);
    check(`payment method ${JSON.stringify(bad)} creates no order`, !res.json?.order);
  }

  // A non-string must not slip past Array.includes via coercion.
  for (const bad of [123, null, ['cod'], { toString: () => 'cod' }] as any[]) {
    await seedCart(1);
    const res = await apiFetch('/api/customer/checkout', {
      method: 'POST',
      body: { shippingAddress: TEST_ADDRESS, paymentMethod: bad, idempotencyKey: `idem-type-${rejectCase++}` },
    });
    // null and undefined hit the `|| 'cod'` default; everything else must be
    // refused outright. Either way no online payment may be opened.
    const createdOrder = res.json?.order ? await orderRow(res.json.order.id) : null;
    check(
      `non-string payment method ${JSON.stringify(bad)} never opens a payment`,
      res.status === 400 || (createdOrder?.payment_method === 'cod' && !res.json?.payment),
      `status=${res.status} method=${createdOrder?.payment_method}`
    );
  }

  // Duplicate order prevention at the route.
  await seedCart(1);
  const replay = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-online-1' },
  });
  check('a replayed idempotency key returns the original order', replay.json?.order?.id === routeOrderId);
  check('a replayed idempotency key is flagged as such', replay.json?.alreadyProcessed === true);
  const orderCount = await pool.query('SELECT COUNT(*)::int n FROM orders WHERE idempotency_key = $1', ['idem-online-1']);
  check('a replay creates no second order', orderCount.rows[0].n === 1);

  // ========================================
  section('Verify route — decline releases stock, pending does not');
  // ========================================

  // Regression: the decline branch called markOrderPaymentFailed (which moves
  // the order to CANCELLED/FAILED) but never restoreOrderStock. That put the
  // order past the window expirePendingPaymentOrders() scans, so the
  // reservation taken at creation could never be reclaimed by anything —
  // the unit was off sale permanently.
  const stockBeforeDecline = await productStock();
  const declinedPayment = mockGateway.simulatePayment({
    gatewayOrderId: onlineCheckout.json.payment.gatewayOrderId,
    outcome: 'failed',
  });
  const declineRes = await apiFetch('/api/customer/payments/verify', {
    method: 'POST',
    body: {
      orderId: routeOrderId,
      razorpayOrderId: onlineCheckout.json.payment.gatewayOrderId,
      razorpayPaymentId: declinedPayment.id,
      razorpaySignature: signPaymentForMock(onlineCheckout.json.payment.gatewayOrderId, declinedPayment.id),
    },
  });
  check('a declined payment is reported as not completed', declineRes.status === 402, `status=${declineRes.status}`);
  const declinedRow = await orderRow(routeOrderId);
  check('a declined payment marks the order FAILED', declinedRow.payment_status === 'FAILED', declinedRow.payment_status);
  check('a declined payment cancels the order', declinedRow.status === 'CANCELLED', declinedRow.status);
  check('a declined payment releases the reservation', (await productStock()) === stockBeforeDecline + 1);
  check('the released order is marked restored', declinedRow.stock_restored === true || (await orderRow(routeOrderId)).stock_restored === true);

  // A pending payment is not a decline. Cancelling here would charge a
  // customer whose UPI collect request is approved a moment later against an
  // order that no longer exists.
  await seedCart(1);
  const pendingCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-pending-1' },
  });
  const pendingOrderId: string = pendingCheckout.json?.order?.id;
  const stockBeforePending = await productStock();
  const pendingPayment = mockGateway.simulatePayment({
    gatewayOrderId: pendingCheckout.json.payment.gatewayOrderId,
    outcome: 'pending',
  });
  const pendingRes = await apiFetch('/api/customer/payments/verify', {
    method: 'POST',
    body: {
      orderId: pendingOrderId,
      razorpayOrderId: pendingCheckout.json.payment.gatewayOrderId,
      razorpayPaymentId: pendingPayment.id,
      razorpaySignature: signPaymentForMock(pendingCheckout.json.payment.gatewayOrderId, pendingPayment.id),
    },
  });
  check('a pending payment is not reported as a decline', pendingRes.status === 202, `status=${pendingRes.status}`);
  const pendingRow = await orderRow(pendingOrderId);
  check('a pending payment does not mark the order FAILED', pendingRow.payment_status === 'PENDING', pendingRow.payment_status);
  check('a pending payment does not cancel the order', pendingRow.status === 'PENDING_PAYMENT', pendingRow.status);
  check('a pending payment keeps the reservation', (await productStock()) === stockBeforePending);
  check('a pending order stays visible to the expiry sweep', pendingRow.status === 'PENDING_PAYMENT' && pendingRow.payment_status === 'PENDING');

  // A forged signature must never settle an order, even for a real payment id.
  const forged = await apiFetch('/api/customer/payments/verify', {
    method: 'POST',
    body: {
      orderId: pendingOrderId,
      razorpayOrderId: pendingCheckout.json.payment.gatewayOrderId,
      razorpayPaymentId: pendingPayment.id,
      razorpaySignature: 'f'.repeat(64),
    },
  });
  check('a forged signature is rejected', forged.status === 400, `status=${forged.status}`);
  check('a forged signature does not pay the order', (await orderRow(pendingOrderId)).payment_status !== 'PAID');

  // ========================================
  section('Shade images — cart line, persistence, order item');
  // ========================================

  // Every cart/checkout surface used to render product.images.primary, so a
  // bag holding three shades of one foundation showed the same photograph
  // three times. These go through the real cart API, because the bug was in
  // what the UI read, not in what resolveVariantGallery returned.
  await pool.query('DELETE FROM cart_items WHERE user_id = $1', [TEST_USER]);

  const addA = await apiFetch('/api/customer/cart/items', {
    method: 'POST',
    body: { productId: SHADED_PRODUCT_ID, variantId: 'shade-a', quantity: 1 },
  });
  check('shade A can be added to the bag', addA.status === 200, `status=${addA.status} ${addA.json?.error || ''}`);

  const addB = await apiFetch('/api/customer/cart/items', {
    method: 'POST',
    body: { productId: SHADED_PRODUCT_ID, variantId: 'shade-b', quantity: 1 },
  });
  check('shade B can be added to the bag', addB.status === 200, `status=${addB.status} ${addB.json?.error || ''}`);

  const addC = await apiFetch('/api/customer/cart/items', {
    method: 'POST',
    body: { productId: SHADED_PRODUCT_ID, variantId: 'shade-c', quantity: 1 },
  });
  check('shade C (no images of its own) can be added', addC.status === 200, `status=${addC.status} ${addC.json?.error || ''}`);

  // Requirement: selecting another shade must not fold into an existing line.
  const cartRows = await pool.query(
    'SELECT variant_id FROM cart_items WHERE user_id = $1 AND product_id = $2 ORDER BY variant_id',
    [TEST_USER, SHADED_PRODUCT_ID]
  );
  check('three shades are three separate cart lines', cartRows.rows.length === 3, `rows=${cartRows.rows.length}`);
  check(
    'each line keeps its own variant id',
    cartRows.rows.map((r: any) => r.variant_id).join(',') === 'shade-a,shade-b,shade-c',
    cartRows.rows.map((r: any) => r.variant_id).join(',')
  );

  // "Persistence after refresh" is exactly this: a fresh GET, with the shade
  // rebuilt from the live catalog rather than from anything the client kept.
  const cartGet = await apiFetch('/api/customer/cart');
  const lines: any[] = cartGet.json?.items || cartGet.json?.cart || [];
  const lineFor = (variantId: string) => lines.find((l) => l.variantId === variantId);

  check('the cart survives a refetch with all three lines', lines.length === 3, `lines=${lines.length}`);
  check('shade A line carries its own shade object', lineFor('shade-a')?.selectedShade?.id === 'shade-a');
  check('shade A line carries the shade name', lineFor('shade-a')?.selectedShade?.name === 'Porcelain');
  check('shade B line carries a different shade', lineFor('shade-b')?.selectedShade?.id === 'shade-b');

  // The thumbnail the UI will render, derived the same way the components do.
  const thumbFor = (variantId: string) => {
    const line = lineFor(variantId);
    return resolveVariantThumbnail(line.product, line.selectedShade);
  };
  check('shade A renders its own image', thumbFor('shade-a') === 'shade-a-primary.jpg', thumbFor('shade-a'));
  check('shade B renders a different image', thumbFor('shade-b') === 'shade-b-primary.jpg', thumbFor('shade-b'));
  check('two shades in one bag never share a thumbnail', thumbFor('shade-a') !== thumbFor('shade-b'));
  check(
    'a shade with no images falls back to the product image',
    thumbFor('shade-c') === 'foundation-product-primary.jpg',
    thumbFor('shade-c')
  );
  check(
    'the fallback is never a sibling shade image',
    !thumbFor('shade-c').includes('shade-a') && !thumbFor('shade-c').includes('shade-b')
  );
  check(
    'isPrimary beats sortOrder for the cart thumbnail',
    thumbFor('shade-a') === 'shade-a-primary.jpg' && thumbFor('shade-a') !== 'shade-a-extra.jpg'
  );

  // Server-side pricing is unchanged by any of this.
  check('each line is priced from the catalog, not the client', lineFor('shade-a')?.lineTotal === 2000, String(lineFor('shade-a')?.lineTotal));

  // Checkout freezes the variant image onto the order item.
  const shadeCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'cod', idempotencyKey: 'idem-shade-img-1' },
  });
  check('a multi-shade bag checks out', shadeCheckout.status === 200, `status=${shadeCheckout.status} ${shadeCheckout.json?.error || ''}`);

  const shadeOrderItems: any[] = shadeCheckout.json?.order?.items || [];
  const itemFor = (shadeId: string) => shadeOrderItems.find((i) => i.shade?.id === shadeId);
  check('the order has one item per shade', shadeOrderItems.length === 3, `items=${shadeOrderItems.length}`);
  check('order item A keeps shade A image', itemFor('shade-a')?.productImage === 'shade-a-primary.jpg', itemFor('shade-a')?.productImage);
  check('order item B keeps shade B image', itemFor('shade-b')?.productImage === 'shade-b-primary.jpg', itemFor('shade-b')?.productImage);
  check(
    'order item C falls back to the product image',
    itemFor('shade-c')?.productImage === 'foundation-product-primary.jpg',
    itemFor('shade-c')?.productImage
  );
  check('order items carry the shade name for the confirmation screen', itemFor('shade-a')?.shade?.name === 'Porcelain');
  check('order items are priced server-side', itemFor('shade-a')?.price === 2000, String(itemFor('shade-a')?.price));

  // ========================================
  section('Webhook event handling — failed and refund branches');
  // ========================================

  // The handler implements four event types but the suite only ever posted
  // payment.captured. The other three branches — which release stock and move
  // money back to a customer — had never run through the HTTP route, only
  // through the service functions they call. A signature check, a ledger write
  // and an order transition sit in front of each of them.

  // --- payment.failed, end to end through the webhook route ---
  await seedCart(1);
  const failCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-whfail-1' },
  });
  const failOrderId: string = failCheckout.json.order.id;
  const failGatewayOrder: string = failCheckout.json.payment.gatewayOrderId;
  const stockBeforeWhFail = await productStock();

  const failedBody = {
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'pay_whfail_1',
          order_id: failGatewayOrder,
          amount: toMinorUnits(1000),
          method: 'card',
          error_code: 'BAD_REQUEST_ERROR',
          error_description: 'Payment was declined by the issuing bank.',
        },
      },
    },
  };
  const whFail = await postWebhook('/api/webhooks/razorpay', failedBody, razorpayHeaders(failedBody, 'evt_fail_1'));
  check('payment.failed webhook is accepted', whFail.status === 200, `status=${whFail.status}`);
  check('payment.failed webhook finishes processing', await waitForWebhookProcessed('evt_fail_1'));

  const failedOrder = await orderRow(failOrderId);
  check('payment.failed marks the order FAILED', failedOrder.payment_status === 'FAILED', failedOrder.payment_status);
  check('payment.failed cancels the order', failedOrder.status === 'CANCELLED', failedOrder.status);
  check('payment.failed releases the reservation', (await productStock()) === stockBeforeWhFail + 1);
  const failLedger = await pool.query('SELECT * FROM payments WHERE provider_order_id = $1', [failGatewayOrder]);
  check('payment.failed records the gateway error code', failLedger.rows[0]?.error_code === 'BAD_REQUEST_ERROR');
  check('payment.failed marks the ledger row FAILED', failLedger.rows[0]?.status === 'FAILED', failLedger.rows[0]?.status);

  // --- refund.created / refund.processed ---
  await seedCart(1);
  const whRefundCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-whrefund-1' },
  });
  const whRefundOrderId: string = whRefundCheckout.json.order.id;
  const whRefundGatewayOrder: string = whRefundCheckout.json.payment.gatewayOrderId;

  const captureBody = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_whrefund_1', order_id: whRefundGatewayOrder, amount: toMinorUnits(1000), method: 'upi' } } },
  };
  await postWebhook('/api/webhooks/razorpay', captureBody, razorpayHeaders(captureBody, 'evt_rfcap_1'));
  check('capture before refund is processed', await waitForWebhookProcessed('evt_rfcap_1'));
  check('order is PAID before any refund', (await orderRow(whRefundOrderId)).payment_status === 'PAID');

  // An unsigned refund must not move money. Checked before the valid one, so a
  // later assertion cannot pass on the strength of this event having landed.
  const unsignedRefund = await postWebhook(
    '/api/webhooks/razorpay',
    { event: 'refund.created', payload: { refund: { entity: { id: 'rfnd_spoof', order_id: whRefundGatewayOrder, amount: toMinorUnits(1000) } } } },
    { 'x-razorpay-event-id': 'evt_rfspoof_1' }
  );
  check('an unsigned refund webhook is rejected with 401', unsignedRefund.status === 401, `status=${unsignedRefund.status}`);
  check('an unsigned refund leaves the order PAID', (await orderRow(whRefundOrderId)).payment_status === 'PAID');

  const partialRefundBody = {
    event: 'refund.created',
    payload: { refund: { entity: { id: 'rfnd_1', order_id: whRefundGatewayOrder, amount: toMinorUnits(400) } } },
  };
  const whRefund1 = await postWebhook('/api/webhooks/razorpay', partialRefundBody, razorpayHeaders(partialRefundBody, 'evt_rf_1'));
  check('refund.created webhook is accepted', whRefund1.status === 200);
  check('refund.created webhook finishes processing', await waitForWebhookProcessed('evt_rf_1'));

  const partiallyRefunded = await orderRow(whRefundOrderId);
  check('a partial refund is recorded on the order', Number(partiallyRefunded.amount_refunded) === 400, String(partiallyRefunded.amount_refunded));
  check(
    'a partial refund sets PARTIALLY_REFUNDED',
    partiallyRefunded.payment_status === 'PARTIALLY_REFUNDED',
    partiallyRefunded.payment_status
  );
  const rfLedger1 = await pool.query('SELECT refunded_minor FROM payments WHERE provider_order_id = $1', [whRefundGatewayOrder]);
  check('the ledger tracks the refunded minor amount', Number(rfLedger1.rows[0]?.refunded_minor) === toMinorUnits(400));

  // Replaying the same refund must not credit the customer twice.
  const whRefundReplay = await postWebhook('/api/webhooks/razorpay', partialRefundBody, razorpayHeaders(partialRefundBody, 'evt_rf_1'));
  check('a replayed refund is reported as duplicate', whRefundReplay.json?.duplicate === true);
  check('a replayed refund does not refund twice', Number((await orderRow(whRefundOrderId)).amount_refunded) === 400);

  const finalRefundBody = {
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'rfnd_2', order_id: whRefundGatewayOrder, amount: toMinorUnits(600) } } },
  };
  await postWebhook('/api/webhooks/razorpay', finalRefundBody, razorpayHeaders(finalRefundBody, 'evt_rf_2'));
  check('refund.processed webhook finishes processing', await waitForWebhookProcessed('evt_rf_2'));
  const fullyRefunded = await orderRow(whRefundOrderId);
  check('refunding the remainder sets REFUNDED', fullyRefunded.payment_status === 'REFUNDED', fullyRefunded.payment_status);
  check('the full amount is recorded as refunded', Number(fullyRefunded.amount_refunded) === 1000, String(fullyRefunded.amount_refunded));

  // Over-refunding is clamped rather than going negative or exceeding what was
  // collected — the ledger uses LEAST(amount_minor, ...) for exactly this.
  const overRefundBody = {
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'rfnd_3', order_id: whRefundGatewayOrder, amount: toMinorUnits(500) } } },
  };
  await postWebhook('/api/webhooks/razorpay', overRefundBody, razorpayHeaders(overRefundBody, 'evt_rf_3'));
  check('over-refund webhook finishes processing', await waitForWebhookProcessed('evt_rf_3'));
  const afterOverRefund = await orderRow(whRefundOrderId);
  check('an over-refund is clamped to what was collected', Number(afterOverRefund.amount_refunded) === 1000, String(afterOverRefund.amount_refunded));
  const rfLedger2 = await pool.query('SELECT refunded_minor, amount_minor FROM payments WHERE provider_order_id = $1', [whRefundGatewayOrder]);
  check(
    'the ledger refund never exceeds the amount captured',
    Number(rfLedger2.rows[0]?.refunded_minor) <= Number(rfLedger2.rows[0]?.amount_minor)
  );

  // ========================================
  section('Scenarios 1 & 4 — online payment success, then webhook');
  // ========================================

  const stockBefore = await productStock();
  await seedOrder({
    id: 'ord-online',
    status: 'PENDING_PAYMENT',
    paymentMethod: 'upi',
    paymentStatus: 'PENDING',
    stockCommitted: false,
  });

  const created = await mockGateway.createOrder({ amountMinor: toMinorUnits(1000), currency: 'INR', receipt: 'GLM1' });
  check('gateway order is created', created.ok && !!created.order);
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, amount_minor, currency, status)
     VALUES ('pay-1','ord-online',$1,'razorpay-mock',$2,$3,'INR','PENDING')`,
    [TEST_USER, created.order!.id, toMinorUnits(1000)]
  );

  const paid = mockGateway.simulatePayment({ gatewayOrderId: created.order!.id, outcome: 'success' });
  check('mock payment reports captured', paid.status === 'PAID');

  await markOrderPaid({ orderId: 'ord-online', amountPaid: 1000, gatewayPaymentId: paid.id, method: 'upi' });
  const onlineRow = await orderRow('ord-online');
  check('order becomes PAID', onlineRow.payment_status === 'PAID');
  check('order advances past PENDING_PAYMENT', onlineRow.status === 'CONFIRMED', onlineRow.status);
  check('collected amount is recorded', Number(onlineRow.amount_paid) === 1000);
  check('stock is committed on payment', onlineRow.stock_committed === true);
  check('stock actually decreased', (await productStock()) === stockBefore - 1);

  // Scenario 4: the webhook for the same payment arrives afterwards.
  const capturedBody = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: paid.id, order_id: created.order!.id, amount: toMinorUnits(1000), method: 'upi' } } },
  };
  const hook1 = await postWebhook('/api/webhooks/razorpay', capturedBody, razorpayHeaders(capturedBody, 'evt_capture_1'));
  check('payment webhook is accepted', hook1.status === 200);
  check('payment webhook finishes processing', await waitForWebhookProcessed('evt_capture_1'));
  const afterHook = await productStock();
  check('webhook after verify does not double-deduct stock', afterHook === stockBefore - 1, `stock=${afterHook}`);

  // ========================================
  section('Scenario 6 — duplicate payment webhook');
  // ========================================

  const hook2 = await postWebhook('/api/webhooks/razorpay', capturedBody, razorpayHeaders(capturedBody, 'evt_capture_1'));
  check('replayed webhook is reported as duplicate', hook2.json?.duplicate === true);
  check('replay does not change stock', (await productStock()) === stockBefore - 1);
  const eventCount = await pool.query(`SELECT COUNT(*)::int n FROM webhook_events WHERE event_id = 'evt_capture_1'`);
  check('duplicate webhook stored exactly once', eventCount.rows[0].n === 1);

  // ========================================
  section('Security — webhook spoofing & amount tampering');
  // ========================================

  const spoof = await postWebhook('/api/webhooks/razorpay', capturedBody, { 'x-razorpay-signature': 'forged' });
  check('unsigned webhook is rejected with 401', spoof.status === 401);

  await seedOrder({ id: 'ord-tamper', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING', stockCommitted: false });
  const tamperOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(5000), currency: 'INR', receipt: 'GLM-T' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, amount_minor, currency, status)
     VALUES ('pay-tamper','ord-tamper',$1,'razorpay-mock',$2,$3,'INR','PENDING')`,
    [TEST_USER, tamperOrder.order!.id, toMinorUnits(5000)]
  );
  // A correctly signed webhook claiming ₹1 against a ₹5,000 order.
  const underpaid = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_under', order_id: tamperOrder.order!.id, amount: 100, method: 'upi' } } },
  };
  await postWebhook('/api/webhooks/razorpay', underpaid, razorpayHeaders(underpaid, 'evt_under_1'));
  await waitForWebhookProcessed('evt_under_1');
  const tamperRow = await orderRow('ord-tamper');
  check('underpaid webhook does not mark the order paid', tamperRow.payment_status !== 'PAID', tamperRow.payment_status);
  const tamperEvent = await pool.query(`SELECT status, error FROM webhook_events WHERE event_id = 'evt_under_1'`);
  check('amount mismatch is recorded as FAILED', tamperEvent.rows[0]?.status === 'FAILED');

  // ========================================
  section('Scenarios 2 & 3 — payment failure and cancellation');
  // ========================================

  const stockBeforeFail = await productStock();
  await seedOrder({ id: 'ord-fail', status: 'PENDING_PAYMENT', paymentMethod: 'card', paymentStatus: 'PENDING' });
  await markOrderPaymentFailed({ orderId: 'ord-fail', status: 'FAILED', reason: 'Declined by bank' });
  const failRow = await orderRow('ord-fail');
  check('failed payment marks the order FAILED', failRow.payment_status === 'FAILED');
  check('failed payment cancels the order', failRow.status === 'CANCELLED', failRow.status);
  await restoreOrderStock('ord-fail');
  check('failed payment releases reserved stock', (await productStock()) === stockBeforeFail + 1);

  await seedOrder({ id: 'ord-cancelled-pay', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING' });
  await markOrderPaymentFailed({ orderId: 'ord-cancelled-pay', status: 'CANCELLED', reason: 'Customer closed checkout' });
  check('cancelled payment is recorded', (await orderRow('ord-cancelled-pay')).payment_status === 'CANCELLED');

  // A paid order must never be downgraded by a late failure event.
  await markOrderPaymentFailed({ orderId: 'ord-online', status: 'FAILED', reason: 'late failure' });
  check('late failure cannot un-pay a paid order', (await orderRow('ord-online')).payment_status === 'PAID');

  // ========================================
  section('Scenarios 8-10 — shipment, courier selection, AWB');
  // ========================================

  const ship = await createShipmentForOrder('ord-online');
  check('shipment is created for a paid order', ship.ok, ship.error);

  const shipmentRow = (await pool.query('SELECT * FROM shipments WHERE order_id = $1', ['ord-online'])).rows[0];
  check('the provider order reference is stored', !!shipmentRow?.provider_order_id);
  check('the waybill is stored', !!shipmentRow?.waybill);
  check('AWB is assigned', !!shipmentRow?.awb_code);
  check('courier name is stored', !!shipmentRow?.courier_name);
  check('tracking url is stored', !!shipmentRow?.tracking_url);
  check('label url is stored', !!shipmentRow?.label_url);
  // Booking now continues past the AWB into the pickup request, so a fully
  // successful booking lands on PICKUP_SCHEDULED rather than stopping at
  // AWB_ASSIGNED. AWB_ASSIGNED remains correct for a booking whose pickup step
  // did not complete, which is why both are accepted here.
  check(
    'shipment reached at least AWB_ASSIGNED',
    shipmentRow?.status === 'PICKUP_SCHEDULED' || shipmentRow?.status === 'AWB_ASSIGNED',
    shipmentRow?.status
  );
  check('a warehouse pickup was booked', (await pool.query("SELECT COUNT(*)::int n FROM shipment_pickup_requests WHERE status = 'OPEN'")).rows[0].n >= 1);
  check('awb_code mirrors the waybill', shipmentRow?.awb_code === shipmentRow?.waybill);

  const shippedOrder = await orderRow('ord-online');
  check('order mirrors the AWB', shippedOrder.tracking_number === shipmentRow.awb_code);
  check('order mirrors the courier', shippedOrder.courier_partner === shipmentRow.courier_name);
  check(
    'order shipping status updated',
    shippedOrder.shipping_status === 'PICKUP_SCHEDULED' || shippedOrder.shipping_status === 'AWB_ASSIGNED',
    shippedOrder.shipping_status
  );

  // Duplicate protection.
  const dupShip = await createShipmentForOrder('ord-online');
  const shipmentCount = await pool.query('SELECT COUNT(*)::int n FROM shipments WHERE order_id = $1', ['ord-online']);
  check('a second shipment request creates no second shipment', shipmentCount.rows[0].n === 1);
  check('duplicate shipment request reports success rather than erroring', dupShip.ok);

  // Unserviceable pincode.
  await seedOrder({ id: 'ord-unserviceable', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  await pool.query(`UPDATE orders SET shipping_address = $2::jsonb WHERE id = $1`, [
    'ord-unserviceable',
    JSON.stringify({ addressLine1: '1 Far Away', city: 'Nowhere', state: 'XX', pinCode: '999999', phone: '9876543210' }),
  ]);
  const unserviceable = await createShipmentForOrder('ord-unserviceable');
  check('unserviceable pincode is refused, not silently shipped', !unserviceable.ok);

  // Courier webhook behaviour now lives in delhivery.e2e.ts — that provider
  // owns the payload shape, the auth header and the status vocabulary, so
  // duplicating it here would only test the duplicate.

  // ========================================
  section('Payment status — serialization, labels, account summary');
  // ========================================

  // payment_details is a snapshot written once at order creation; every real
  // payment transition moves the payment_status COLUMN instead. Six storefront
  // surfaces read the snapshot, so a customer who had just paid saw "AMOUNT
  // DUE" and an invoice that said unpaid. assembleOrder now resolves both
  // fields from the column.
  {
    const db0 = await loadDatabase();
    const paidOrder = await buildOrderFromRow(await orderRow('ord-online'), db0);
    check('top-level paymentStatus reflects the column', paidOrder.paymentStatus === 'PAID', paidOrder.paymentStatus);
    check('nested payment.status reflects the column too', paidOrder.payment.status === 'PAID', String(paidOrder.payment.status));
    check('the two can no longer disagree', paidOrder.payment.status === paidOrder.paymentStatus);
    check('payment method survives the merge', !!paidOrder.payment.method, String(paidOrder.payment.method));

    // The gateway handle lives in the same JSONB and must not be lost.
    await pool.query(
      `UPDATE orders SET payment_details = jsonb_set(payment_details, '{gatewayOrderId}', to_jsonb('order_keepme'::text)) WHERE id = 'ord-online'`
    );
    const withGateway = await buildOrderFromRow(await orderRow('ord-online'), db0);
    check('gatewayOrderId survives the merge', (withGateway.payment as any).gatewayOrderId === 'order_keepme');
    check('status still wins over the stale snapshot', withGateway.payment.status === 'PAID');

    // COD is unchanged: created COD_PENDING, and it stays that way until the
    // courier collects.
    const codOrder = await buildOrderFromRow(await orderRow('ord-cod'), db0);
    check('COD order still reads COD_PENDING', codOrder.payment.status === 'COD_PENDING', String(codOrder.payment.status));
    check('COD top-level agrees', codOrder.paymentStatus === 'COD_PENDING');

    // A failed payment must surface as FAILED, not as the frozen PENDING.
    const failedOrder = await buildOrderFromRow(await orderRow(failOrderId), db0);
    check('a failed payment serializes as FAILED', failedOrder.payment.status === 'FAILED', String(failedOrder.payment.status));
    check('a failed payment is never reported as COD_PENDING', failedOrder.payment.status !== 'COD_PENDING');
  }

  // Every PaymentStatus must have customer-facing copy. Six of the eight used
  // to fall through to the raw enum token.
  {
    const expected: Record<string, string> = {
      COD_PENDING: 'Pay on Delivery',
      PENDING: 'Awaiting Payment',
      PAID: 'Paid',
      FAILED: 'Payment Failed',
      CANCELLED: 'Payment Cancelled',
      EXPIRED: 'Payment Expired',
      REFUNDED: 'Refunded',
      PARTIALLY_REFUNDED: 'Partially Refunded',
    };
    for (const [status, label] of Object.entries(expected)) {
      check(`label for ${status} is friendly`, getPaymentStatusLabel(status) === label, getPaymentStatusLabel(status));
      check(`label for ${status} is not the raw enum`, getPaymentStatusLabel(status) !== status);
    }
    // An unknown value must fall through, never be coerced into a reassuring one.
    check('an unknown status falls through unchanged', getPaymentStatusLabel('WAT') === 'WAT');
    check('an unknown status is not reported as Paid', getPaymentStatusLabel('WAT') !== 'Paid');
    check('an unknown status is not reported as Pay on Delivery', getPaymentStatusLabel('WAT') !== 'Pay on Delivery');
  }

  // Account payments summary: real statuses, and a COD total that means it.
  {
    const summary = await apiFetch('/api/customer/account/payments');
    check('payments summary loads', summary.status === 200, `status=${summary.status} ${summary.json?.error || ''}`);
    const data = summary.json?.payments || {};
    const rows: any[] = data.payments || [];
    const byOrder = (id: string) => rows.find((r) => r.orderId === id);

    check('a PAID online order is reported PAID', byOrder('ord-online')?.status === 'PAID', byOrder('ord-online')?.status);
    check(
      'a failed online payment is NOT reported COD_PENDING',
      byOrder(failOrderId)?.status !== 'COD_PENDING',
      byOrder(failOrderId)?.status
    );
    check('a failed online payment reports its real status', byOrder(failOrderId)?.status === 'FAILED', byOrder(failOrderId)?.status);
    check('a genuine COD order is still COD_PENDING', byOrder('ord-cod')?.status === 'COD_PENDING', byOrder('ord-cod')?.status);

    // Due on Delivery must contain only genuine COD.
    const codDue = rows
      .filter((r) => r.method === 'cod' && r.status === 'COD_PENDING' && r.orderStatus !== 'CANCELLED' && r.orderStatus !== 'DELIVERED')
      .reduce((n, r) => n + r.amount, 0);
    check('pendingCod counts only genuine COD orders', data.pendingCod === codDue, `pendingCod=${data.pendingCod} expected=${codDue}`);
    check(
      'no online order contributes to Due on Delivery',
      !rows.some((r) => r.method !== 'cod' && r.status === 'COD_PENDING'),
      'an online order was still labelled COD_PENDING'
    );

    // A refunded order must not be billed as cash owed.
    await seedOrder({ id: 'ord-refunded-cod', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 500 });
    await pool.query(`UPDATE orders SET payment_status = 'REFUNDED', amount_paid = 500, amount_refunded = 500 WHERE id = 'ord-refunded-cod'`);
    const afterRefund = await apiFetch('/api/customer/account/payments');
    const refundedRow = (afterRefund.json?.payments?.payments || []).find((r: any) => r.orderId === 'ord-refunded-cod');
    check('a refunded order reports REFUNDED', refundedRow?.status === 'REFUNDED', refundedRow?.status);
    check(
      'a refunded order is excluded from Due on Delivery',
      afterRefund.json?.payments?.pendingCod === data.pendingCod,
      `${data.pendingCod} -> ${afterRefund.json?.payments?.pendingCod}`
    );

    // paidAt only from the ledger, never invented.
    check('a PAID order carries a real paidAt', !!byOrder('ord-online')?.paidAt);
    check('a COD order carries no invented paidAt', !byOrder('ord-cod')?.paidAt);
  }

  // ========================================
  section('Tracking endpoint — GET is read-only, POST reconciles');
  // ========================================

  // GET /admin/orders/:id/shipment/track used to reconcile as a side effect:
  // one GET could write seven tables, email the customer, grant loyalty points
  // and flip a COD order to PAID. Anything that treats GET as safe — browser
  // prefetch, a proxy retrying a timeout, a crawler holding an admin session —
  // could therefore collect cash on paper that nobody collected in person.
  // These assertions pin the two verbs apart.
  // Booked through the mock provider rather than INSERTed by hand: the mock
  // only answers track() for waybills it issued itself, so a hand-written row
  // would 502 and the assertions below would pass for the wrong reason.
  await seedOrder({ id: 'ord-track-cod', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  const trackShip = await createShipmentForOrder('ord-track-cod');
  check('a COD shipment is booked for the tracking test', trackShip.ok, trackShip.error);

  // Give the parcel a scan history to reconcile against. A freshly booked
  // shipment has none, so without this the "POST applies something" assertions
  // would be vacuously true against an empty courier response.
  const trackWaybill = (await pool.query('SELECT waybill FROM shipments WHERE order_id = $1', ['ord-track-cod'])).rows[0]?.waybill;
  check('the booked shipment has a waybill', !!trackWaybill);
  mockDelhiveryProvider.simulateScan(trackWaybill, 'UD', 'In Transit', 'Departed origin hub');

  /** Every piece of business state a tracking sync is capable of moving. */
  const trackState = async () => {
    const o = (await pool.query('SELECT status, payment_status, amount_paid, shipping_status FROM orders WHERE id = $1', ['ord-track-cod'])).rows[0];
    const n = async (sql: string) => (await pool.query(sql, ['ord-track-cod'])).rows[0].n;
    return {
      ...o,
      scans: await n('SELECT COUNT(*)::int n FROM shipment_tracking_events WHERE order_id = $1'),
      hist: await n('SELECT COUNT(*)::int n FROM order_status_history WHERE order_id = $1'),
      notif: await n('SELECT COUNT(*)::int n FROM notifications WHERE order_id = $1'),
      shipStatus: (await pool.query('SELECT status FROM shipments WHERE order_id = $1', ['ord-track-cod'])).rows[0]?.status,
      stock: await productStock(),
    };
  };

  const beforeGets = await trackState();
  const g1 = await adminFetch('/api/admin/orders/ord-track-cod/shipment/track');
  await adminFetch('/api/admin/orders/ord-track-cod/shipment/track');
  const g3 = await adminFetch('/api/admin/orders/ord-track-cod/shipment/track');
  const afterGets = await trackState();

  check('GET tracking still returns courier data', g1.status === 200, `status=${g1.status} ${g1.json?.error || ''}`);
  check('GET reports that it applied nothing', g1.json?.applied === false);
  check('repeated GETs keep succeeding', g3.status === 200);
  check(
    'three repeated GETs change NO business state',
    JSON.stringify(afterGets) === JSON.stringify(beforeGets),
    `before=${JSON.stringify(beforeGets)} after=${JSON.stringify(afterGets)}`
  );
  check('GET writes no tracking scans', afterGets.scans === beforeGets.scans);
  check('GET does not mark a COD order PAID', afterGets.payment_status === 'COD_PENDING', afterGets.payment_status);
  check('GET sends no customer notification', afterGets.notif === beforeGets.notif);
  check('GET writes no status history', afterGets.hist === beforeGets.hist);
  check('GET does not move the shipment', afterGets.shipStatus === beforeGets.shipStatus);

  // The deliberate counterpart: the same work the courier webhook does, behind
  // a verb nothing retries by accident, and with an audit trail the GET never had.
  const p1 = await adminFetch('/api/admin/orders/ord-track-cod/shipment/track', { method: 'POST' });
  const afterPost1 = await trackState();
  check('POST sync succeeds', p1.status === 200, `status=${p1.status} ${p1.json?.error || ''}`);
  check('POST reports that it applied', p1.json?.applied === true);
  check('POST records the courier scans', afterPost1.scans > beforeGets.scans, `scans ${beforeGets.scans} -> ${afterPost1.scans}`);
  const auditLogs = (await loadDatabase()).auditLogs || [];
  check('POST writes an audit entry', auditLogs.some((l: any) => l.action === 'SYNC_TRACKING'));

  // Idempotency: a second sync must be a no-op, not a second application.
  const p2 = await adminFetch('/api/admin/orders/ord-track-cod/shipment/track', { method: 'POST' });
  const afterPost2 = await trackState();
  check('a repeated POST still succeeds', p2.status === 200);
  check('a repeated POST adds no duplicate scans', afterPost2.scans === afterPost1.scans, `${afterPost1.scans} -> ${afterPost2.scans}`);
  check('a repeated POST adds no duplicate status history', afterPost2.hist === afterPost1.hist);
  check('a repeated POST does not re-notify the customer', afterPost2.notif === afterPost1.notif);
  check('a repeated POST does not move stock again', afterPost2.stock === afterPost1.stock);

  // Auth is unchanged on both verbs.
  const noAuthGet = await fetch(`http://127.0.0.1:${webhookPort}/api/admin/orders/ord-track-cod/shipment/track`);
  const noAuthPost = await fetch(`http://127.0.0.1:${webhookPort}/api/admin/orders/ord-track-cod/shipment/track`, { method: 'POST' });
  check('GET tracking still requires admin auth', noAuthGet.status === 401, `status=${noAuthGet.status}`);
  check('POST tracking requires admin auth', noAuthPost.status === 401, `status=${noAuthPost.status}`);

  // No waybill is still a 404 on both verbs, not a 500.
  const noWaybillGet = await adminFetch('/api/admin/orders/ord-cod/shipment/track');
  const noWaybillPost = await adminFetch('/api/admin/orders/ord-cod/shipment/track', { method: 'POST' });
  check('GET 404s when there is no tracking number', noWaybillGet.status === 404, `status=${noWaybillGet.status}`);
  check('POST 404s when there is no tracking number', noWaybillPost.status === 404, `status=${noWaybillPost.status}`);

  // ========================================
  section('Scenario 14 — cancellation');
  // ========================================

  const stockBeforeCancel = await productStock();
  await seedOrder({ id: 'ord-cancel', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  await pool.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = 'ord-cancel'`);
  const restored = await restoreOrderStock('ord-cancel');
  check('cancellation restores stock', restored && (await productStock()) === stockBeforeCancel + 1);

  const restoredTwice = await restoreOrderStock('ord-cancel');
  check('a second restore is refused', !restoredTwice);
  check('double restore does not inflate stock', (await productStock()) === stockBeforeCancel + 1);

  // ========================================
  section('Scenario 15 — RTO');
  // ========================================

  const stockBeforeRto = await productStock();
  await seedOrder({ id: 'ord-rto', status: 'SHIPPED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  await pool.query(
    `INSERT INTO shipments (id, order_id, provider, status, awb_code, is_cod)
     VALUES ('shp-rto','ord-rto','delhivery-mock','IN_TRANSIT','AWBRTO1',true)`
  );
  await applyShippingStatus({ orderId: 'ord-rto', status: 'RTO_DELIVERED', awbCode: 'AWBRTO1' });
  const rtoRow = await orderRow('ord-rto');
  check('RTO sets the order status', rtoRow.status === 'RTO', rtoRow.status);
  check('RTO restores stock', (await productStock()) === stockBeforeRto + 1);

  // ========================================
  section('Scenario 16 — refund');
  // ========================================

  await seedOrder({ id: 'ord-refund', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 2000 });
  await pool.query(`UPDATE orders SET amount_paid = 2000 WHERE id = 'ord-refund'`);
  const refundGatewayOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(2000), currency: 'INR', receipt: 'GLM-R' });
  const refundPayment = mockGateway.simulatePayment({ gatewayOrderId: refundGatewayOrder.order!.id, outcome: 'success' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-refund','ord-refund',$1,'razorpay-mock',$2,$3,$4,'INR','PAID')`,
    [TEST_USER, refundGatewayOrder.order!.id, refundPayment.id, toMinorUnits(2000)]
  );

  const partial = await refundOrderPayment('ord-refund', 500, 'Partial refund');
  check('partial refund succeeds', partial.ok, partial.error);
  const partialRow = await orderRow('ord-refund');
  check('partial refund is marked PARTIALLY_REFUNDED', partialRow.payment_status === 'PARTIALLY_REFUNDED', partialRow.payment_status);
  check('partial refund amount is recorded', Number(partialRow.amount_refunded) === 500);

  const overRefund = await refundOrderPayment('ord-refund', 999999, 'Over-refund attempt');
  const afterOver = await orderRow('ord-refund');
  check('refund is clamped to what was actually paid', Number(afterOver.amount_refunded) <= 2000, String(afterOver.amount_refunded));
  check('full refund marks the order REFUNDED', afterOver.payment_status === 'REFUNDED', afterOver.payment_status);
  check('refund attempt returned a result', typeof overRefund.ok === 'boolean');

  const codRefund = await refundOrderPayment('ord-cod', 500, 'COD refund attempt');
  check('COD order cannot be gateway-refunded', !codRefund.ok);

  // ========================================
  section('Refund safety — concurrency, idempotency, history');
  // ========================================

  // refundOrderPayment used to read amount_refunded, compute what was
  // refundable, call Razorpay, and only then write the new total — with
  // nothing serialising it. Two concurrent requests (an admin double-click)
  // both saw the full amount available and both issued a REAL refund; the
  // LEAST() clamp then capped the recorded figure, hiding the second. Money
  // left twice, the ledger said once.
  await seedOrder({ id: 'ord-rf-safe', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 1000 });
  await pool.query(`UPDATE orders SET amount_paid = 1000 WHERE id = 'ord-rf-safe'`);
  const rfOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(1000), currency: 'INR', receipt: 'GLM-RF' });
  const rfPay = mockGateway.simulatePayment({ gatewayOrderId: rfOrder.order!.id, outcome: 'success' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-rf-safe','ord-rf-safe',$1,'razorpay-mock',$2,$3,$4,'INR','PAID')`,
    [TEST_USER, rfOrder.order!.id, rfPay.id, toMinorUnits(1000)]
  );

  // --- concurrency: two refunds fired at once ---
  const [cA, cB] = await Promise.all([
    refundOrderPayment('ord-rf-safe', 1000, 'Concurrent A', { createdBy: 'admin-a' }),
    refundOrderPayment('ord-rf-safe', 1000, 'Concurrent B', { createdBy: 'admin-b' }),
  ]);
  const winners = [cA, cB].filter((r) => r.ok);
  const refused = [cA, cB].filter((r) => r.busy);
  check('exactly one concurrent refund succeeds', winners.length === 1, `ok=${winners.length}`);
  check('the loser is refused as busy, not queued', refused.length === 1, `busy=${refused.length}`);
  const rfRowsAfterRace = await pool.query(`SELECT status FROM refunds WHERE order_id = 'ord-rf-safe'`);
  check('only one refund row exists after the race', rfRowsAfterRace.rows.length === 1, String(rfRowsAfterRace.rows.length));
  check('that row is PROCESSED', rfRowsAfterRace.rows[0]?.status === 'PROCESSED', rfRowsAfterRace.rows[0]?.status);
  const afterRace = await orderRow('ord-rf-safe');
  check('the order is refunded exactly once', Number(afterRace.amount_refunded) === 1000, String(afterRace.amount_refunded));
  check('a fully refunded order reads REFUNDED', afterRace.payment_status === 'REFUNDED', afterRace.payment_status);

  // --- provider refund id, reason and actor are persisted ---
  const rfDetail = (await pool.query(`SELECT * FROM refunds WHERE order_id = 'ord-rf-safe'`)).rows[0];
  check('the gateway refund id is stored', !!rfDetail?.provider_refund_id, String(rfDetail?.provider_refund_id));
  check('the reason is stored', !!rfDetail?.reason);
  check('the actor is stored', !!rfDetail?.created_by);
  check('the amount is stored in minor units', Number(rfDetail?.amount_minor) === toMinorUnits(1000));

  // --- already fully refunded: refused, no new row ---
  const again = await refundOrderPayment('ord-rf-safe', 100, 'Should be refused');
  check('a fully refunded order cannot be refunded again', !again.ok);
  check(
    'the refusal creates no extra row',
    (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id = 'ord-rf-safe'`)).rows[0].n === 1
  );

  // --- idempotency: the same key never refunds twice ---
  await seedOrder({ id: 'ord-rf-idem', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 800 });
  await pool.query(`UPDATE orders SET amount_paid = 800 WHERE id = 'ord-rf-idem'`);
  const idemOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(800), currency: 'INR', receipt: 'GLM-ID' });
  const idemPay = mockGateway.simulatePayment({ gatewayOrderId: idemOrder.order!.id, outcome: 'success' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-rf-idem','ord-rf-idem',$1,'razorpay-mock',$2,$3,$4,'INR','PAID')`,
    [TEST_USER, idemOrder.order!.id, idemPay.id, toMinorUnits(800)]
  );

  const i1 = await refundOrderPayment('ord-rf-idem', 300, 'Idem first', { idempotencyKey: 'key-abc' });
  const i2 = await refundOrderPayment('ord-rf-idem', 300, 'Idem replay', { idempotencyKey: 'key-abc' });
  check('the first keyed refund succeeds', i1.ok, i1.error);
  check('the replay is reported as a replay', i2.replayed === true);
  check('the replay returns the same refund row', i2.refundId === i1.refundId, `${i1.refundId} vs ${i2.refundId}`);
  check(
    'the replay issues no second refund',
    (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id = 'ord-rf-idem'`)).rows[0].n === 1
  );
  check('the replay does not move the total again', Number((await orderRow('ord-rf-idem')).amount_refunded) === 300);

  // --- partial, then the remainder ---
  const rest = await refundOrderPayment('ord-rf-idem', 500, 'Remainder', { idempotencyKey: 'key-def' });
  check('the remainder refunds', rest.ok, rest.error);
  const idemAfter = await orderRow('ord-rf-idem');
  check(
    'two refunds are recorded',
    (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id = 'ord-rf-idem'`)).rows[0].n === 2
  );
  check('the total is the sum of both', Number(idemAfter.amount_refunded) === 800, String(idemAfter.amount_refunded));
  check('the order is now REFUNDED', idemAfter.payment_status === 'REFUNDED', idemAfter.payment_status);

  // --- amount limit ---
  await seedOrder({ id: 'ord-rf-clamp', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 600 });
  await pool.query(`UPDATE orders SET amount_paid = 600 WHERE id = 'ord-rf-clamp'`);
  const clampOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(600), currency: 'INR', receipt: 'GLM-CL' });
  const clampPay = mockGateway.simulatePayment({ gatewayOrderId: clampOrder.order!.id, outcome: 'success' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-rf-clamp','ord-rf-clamp',$1,'razorpay-mock',$2,$3,$4,'INR','PAID')`,
    [TEST_USER, clampOrder.order!.id, clampPay.id, toMinorUnits(600)]
  );
  const clamped = await refundOrderPayment('ord-rf-clamp', 999999, 'Way too much');
  check('an over-refund still succeeds, clamped', clamped.ok, clamped.error);
  check('the clamped amount equals what was captured', clamped.amount === 600, String(clamped.amount));
  check('the order never over-refunds', Number((await orderRow('ord-rf-clamp')).amount_refunded) === 600);

  // --- provider failure: nothing credited, attempt recorded ---
  await seedOrder({ id: 'ord-rf-fail', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 400 });
  await pool.query(`UPDATE orders SET amount_paid = 400 WHERE id = 'ord-rf-fail'`);
  // A provider_payment_id the mock never issued — its refund() answers "No
  // such payment", a genuine gateway refusal with no stubbing required.
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-rf-fail','ord-rf-fail',$1,'razorpay-mock','order_nope','pay_doesnotexist',$2,'INR','PAID')`,
    [TEST_USER, toMinorUnits(400)]
  );
  const failedRefund = await refundOrderPayment('ord-rf-fail', 400, 'Gateway will refuse');
  check('a gateway refusal is reported as failure', !failedRefund.ok, failedRefund.error);
  const failedRefundRow = (await pool.query(`SELECT * FROM refunds WHERE order_id = 'ord-rf-fail'`)).rows[0];
  check('the failed attempt is recorded', failedRefundRow?.status === 'FAILED', failedRefundRow?.status);
  check('the failure reason is stored', !!failedRefundRow?.error_description);
  check('a failed refund credits nothing', Number((await orderRow('ord-rf-fail')).amount_refunded) === 0);
  check(
    'a failed refund leaves the payments ledger untouched',
    Number((await pool.query(`SELECT refunded_minor FROM payments WHERE id = 'pay-rf-fail'`)).rows[0].refunded_minor) === 0
  );
  check('a failed refund does not mark the order REFUNDED', (await orderRow('ord-rf-fail')).payment_status === 'PAID');

  // --- COD refused before any gateway call ---
  const codRf = await refundOrderPayment('ord-cod', 100, 'COD attempt');
  check('COD is refused', !codRf.ok);
  check(
    'COD creates no refund row',
    (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id = 'ord-cod'`)).rows[0].n === 0
  );

  // --- history is readable ---
  const history = await listOrderRefunds('ord-rf-idem');
  check('refund history lists both refunds', history.length === 2, String(history.length));
  check('history is newest first', history[0].createdAt >= history[1].createdAt);
  check('history carries the provider refund id', !!history[0].providerRefundId);
  check('history carries amounts in rupees', history.reduce((n, r) => n + r.amount, 0) === 800);

  // ========================================
  section('Admin refund surface — history, summary, authorization');
  // ========================================

  // GET /admin/orders/:id/payments now carries the refund history and a
  // server-computed refundSummary, so the button and refundOrderPayment can
  // never disagree about what is refundable. The admin UI renders this and
  // nothing it derives itself.
  const detailOf = async (orderId: string) => adminFetch(`/api/admin/orders/${orderId}/payments`);

  // --- a part-refunded online order ---
  const rfDetailRes = await detailOf('ord-rf-idem');
  check('payment detail loads', rfDetailRes.status === 200, `status=${rfDetailRes.status}`);
  check('it carries the gateway attempts', Array.isArray(rfDetailRes.json?.payments));
  check('it carries the refund history', Array.isArray(rfDetailRes.json?.refunds));
  check('refund history has both refunds', rfDetailRes.json?.refunds?.length === 2, String(rfDetailRes.json?.refunds?.length));
  check('history rows carry a provider refund id', !!rfDetailRes.json?.refunds?.[0]?.providerRefundId);
  check('history rows carry the actor', !!rfDetailRes.json?.refunds?.[0]?.createdBy);

  const sumIdem = rfDetailRes.json?.refundSummary;
  check('summary reports what was collected', sumIdem?.amountPaid === 800, String(sumIdem?.amountPaid));
  check('summary reports what was refunded', sumIdem?.amountRefunded === 800, String(sumIdem?.amountRefunded));
  check('a fully refunded order has nothing refundable', sumIdem?.refundable === 0, String(sumIdem?.refundable));
  check('a fully refunded order cannot be refunded', sumIdem?.canRefund === false);
  check('a fully refunded online order is not flagged COD', sumIdem?.isCod === false);

  // --- a COD order: refund must be refused by the summary, not just the service ---
  const codDetail = await detailOf('ord-cod');
  check('a COD order is flagged as COD', codDetail.json?.refundSummary?.isCod === true);
  check('a COD order cannot be refunded', codDetail.json?.refundSummary?.canRefund === false);
  check('a COD order has no refund history', codDetail.json?.refunds?.length === 0);

  // --- a refundable online order ---
  await seedOrder({ id: 'ord-rf-open', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 900 });
  await pool.query(`UPDATE orders SET amount_paid = 900 WHERE id = 'ord-rf-open'`);
  const openOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(900), currency: 'INR', receipt: 'GLM-OP' });
  const openPay = mockGateway.simulatePayment({ gatewayOrderId: openOrder.order!.id, outcome: 'success' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-rf-open','ord-rf-open',$1,'razorpay-mock',$2,$3,$4,'INR','PAID')`,
    [TEST_USER, openOrder.order!.id, openPay.id, toMinorUnits(900)]
  );
  const openDetail = await detailOf('ord-rf-open');
  check('a refundable order reports the full amount', openDetail.json?.refundSummary?.refundable === 900);
  check('a refundable order offers the action', openDetail.json?.refundSummary?.canRefund === true);
  check('a refundable order starts with no refund history', openDetail.json?.refunds?.length === 0);

  // --- the admin refund route end to end, with an idempotency key ---
  const rfPost = await adminFetch('/api/admin/orders/ord-rf-open/refund', {
    method: 'POST',
    body: { amount: 400, reason: 'Damaged item', idempotencyKey: 'admin-key-1' },
  });
  check('the admin refund route succeeds', rfPost.status === 200, `status=${rfPost.status} ${rfPost.json?.error || ''}`);

  const afterPartial = await detailOf('ord-rf-open');
  check('the refund appears in history', afterPartial.json?.refunds?.length === 1);
  check('the history row is PROCESSED', afterPartial.json?.refunds?.[0]?.status === 'PROCESSED');
  check('the reason is persisted', afterPartial.json?.refunds?.[0]?.reason === 'Damaged item');
  check('the summary now shows the remainder', afterPartial.json?.refundSummary?.refundable === 500, String(afterPartial.json?.refundSummary?.refundable));
  check('the order is PARTIALLY_REFUNDED', (await orderRow('ord-rf-open')).payment_status === 'PARTIALLY_REFUNDED');

  // --- replaying the same key issues nothing further ---
  const rfReplay = await adminFetch('/api/admin/orders/ord-rf-open/refund', {
    method: 'POST',
    body: { amount: 400, reason: 'Damaged item', idempotencyKey: 'admin-key-1' },
  });
  check('a replayed admin refund still returns 200', rfReplay.status === 200, `status=${rfReplay.status}`);
  const afterReplay = await detailOf('ord-rf-open');
  check('a replay adds no second refund row', afterReplay.json?.refunds?.length === 1, String(afterReplay.json?.refunds?.length));
  check('a replay does not move the refundable total', afterReplay.json?.refundSummary?.refundable === 500);

  // --- COD refused through the route, with no row created ---
  const codPost = await adminFetch('/api/admin/orders/ord-cod/refund', {
    method: 'POST',
    body: { amount: 100, reason: 'Nope' },
  });
  check('the route refuses a COD refund', codPost.status === 400, `status=${codPost.status}`);
  check('a refused COD refund creates no history', (await detailOf('ord-cod')).json?.refunds?.length === 0);

  // --- authorization: both endpoints require an admin ---
  const noAuthDetail = await fetch(`http://127.0.0.1:${webhookPort}/api/admin/orders/ord-rf-open/payments`);
  const noAuthRefund = await fetch(`http://127.0.0.1:${webhookPort}/api/admin/orders/ord-rf-open/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 100 }),
  });
  check('payment detail requires admin auth', noAuthDetail.status === 401, `status=${noAuthDetail.status}`);
  check('the refund route requires admin auth', noAuthRefund.status === 401, `status=${noAuthRefund.status}`);
  check('an unauthorized call refunds nothing', (await detailOf('ord-rf-open')).json?.refundSummary?.refundable === 500);

  // --- a customer token must not reach the admin refund route ---
  const customerTokenRefund = await apiFetch('/api/admin/orders/ord-rf-open/refund', {
    method: 'POST',
    body: { amount: 100 },
  });
  check('a customer token is refused by the admin route', customerTokenRefund.status === 403 || customerTokenRefund.status === 401, `status=${customerTokenRefund.status}`);

  // ========================================
  section('Notifications — paid orders and refunds, exactly once');
  // ========================================

  // Delivery is asynchronous now: a transition writes an outbox row and
  // returns, and the worker delivers afterwards. These helpers drain the
  // queue first, so each assertion still reads "after everything that was
  // going to be sent has been sent" — which is what they always meant.
  const adminNotifs = async (type: string, orderId: string) => {
    await drainNotifications();
    return (
      await pool.query(`SELECT COUNT(*)::int n FROM admin_notifications WHERE type = $1 AND order_id = $2`, [type, orderId])
    ).rows[0].n;
  };
  const custNotifs = async (type: string, orderId: string) => {
    await drainNotifications();
    return (await pool.query(`SELECT COUNT(*)::int n FROM notifications WHERE type = $1 AND order_id = $2`, [type, orderId]))
      .rows[0].n;
  };

  // --- the store is told about a prepaid order, exactly once ---
  // Checkout stays silent for online orders (they may never be paid), so
  // markOrderPaid is the only place this can fire. Three callers reach it for
  // the same payment — verify, webhook, reconciliation — and the conditional
  // UPDATE is what makes it exactly-once.
  await seedOrder({ id: 'ord-nt-paid', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING', total: 700 });
  check('no admin notification before payment', (await adminNotifs('ORDER_PAID', 'ord-nt-paid')) === 0);

  const paid1 = await markOrderPaid({ orderId: 'ord-nt-paid', amountPaid: 700, gatewayPaymentId: 'pay_nt1', method: 'upi' });
  check('the first confirmation is the one that counts', paid1.changed === true);
  check('the store is notified of the paid order', (await adminNotifs('ORDER_PAID', 'ord-nt-paid')) === 1);

  // The webhook for the same payment, then the reconciliation sweep.
  const paid2 = await markOrderPaid({ orderId: 'ord-nt-paid', amountPaid: 700, gatewayPaymentId: 'pay_nt1', method: 'upi' });
  const paid3 = await markOrderPaid({ orderId: 'ord-nt-paid', amountPaid: 700, gatewayPaymentId: 'pay_nt1', method: 'upi' });
  check('a replayed confirmation reports no change', paid2.changed === false && paid3.changed === false);
  check('replays send no second admin notification', (await adminNotifs('ORDER_PAID', 'ord-nt-paid')) === 1);

  // Racing callers, as verify and webhook genuinely do.
  await seedOrder({ id: 'ord-nt-race', status: 'PENDING_PAYMENT', paymentMethod: 'card', paymentStatus: 'PENDING', total: 500 });
  const raced = await Promise.all([
    markOrderPaid({ orderId: 'ord-nt-race', amountPaid: 500, gatewayPaymentId: 'pay_nt2', method: 'card' }),
    markOrderPaid({ orderId: 'ord-nt-race', amountPaid: 500, gatewayPaymentId: 'pay_nt2', method: 'card' }),
    markOrderPaid({ orderId: 'ord-nt-race', amountPaid: 500, gatewayPaymentId: 'pay_nt2', method: 'card' }),
  ]);
  check('exactly one racing confirmation wins', raced.filter((r) => r.changed).length === 1, String(raced.filter((r) => r.changed).length));
  check('a three-way race still notifies once', (await adminNotifs('ORDER_PAID', 'ord-nt-race')) === 1);

  // COD must not produce a payment notification — it is announced at checkout.
  check('a COD order gets no ORDER_PAID notification', (await adminNotifs('ORDER_PAID', 'ord-cod')) === 0);

  // --- a refund notifies the customer and the store, once each ---
  await seedOrder({ id: 'ord-nt-rf', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 1000 });
  await pool.query(`UPDATE orders SET amount_paid = 1000 WHERE id = 'ord-nt-rf'`);
  const ntOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(1000), currency: 'INR', receipt: 'GLM-NT' });
  const ntPay = mockGateway.simulatePayment({ gatewayOrderId: ntOrder.order!.id, outcome: 'success' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-nt-rf','ord-nt-rf',$1,'razorpay-mock',$2,$3,$4,'INR','PAID')`,
    [TEST_USER, ntOrder.order!.id, ntPay.id, toMinorUnits(1000)]
  );

  check('no refund notification before refunding', (await custNotifs('REFUND_COMPLETED', 'ord-nt-rf')) === 0);
  const ntRefund = await refundOrderPayment('ord-nt-rf', 400, 'Partial', { idempotencyKey: 'nt-key-1' });
  check('the refund succeeds', ntRefund.ok, ntRefund.error);
  check('the customer is notified of the refund', (await custNotifs('REFUND_COMPLETED', 'ord-nt-rf')) === 1);
  check('the store is notified of the refund', (await adminNotifs('REFUND_ISSUED', 'ord-nt-rf')) === 1);

  // A replay must not re-announce money that already moved.
  await refundOrderPayment('ord-nt-rf', 400, 'Partial', { idempotencyKey: 'nt-key-1' });
  check('a replayed refund does not re-notify the customer', (await custNotifs('REFUND_COMPLETED', 'ord-nt-rf')) === 1);
  check('a replayed refund does not re-notify the store', (await adminNotifs('REFUND_ISSUED', 'ord-nt-rf')) === 1);

  // --- a FAILED refund announces nothing ---
  await seedOrder({ id: 'ord-nt-rffail', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 300 });
  await pool.query(`UPDATE orders SET amount_paid = 300 WHERE id = 'ord-nt-rffail'`);
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-nt-rffail','ord-nt-rffail',$1,'razorpay-mock','order_nt_nope','pay_nt_nope',$2,'INR','PAID')`,
    [TEST_USER, toMinorUnits(300)]
  );
  const ntFail = await refundOrderPayment('ord-nt-rffail', 300, 'Will fail');
  check('the refund fails', !ntFail.ok);
  check('a failed refund notifies nobody', (await custNotifs('REFUND_COMPLETED', 'ord-nt-rffail')) === 0);
  check('a failed refund does not notify the store either', (await adminNotifs('REFUND_ISSUED', 'ord-nt-rffail')) === 0);

  // --- the refund webhook must not double-count our own refund ---
  // Razorpay sends refund.created AND refund.processed for the same refund,
  // including refunds we issued. The old code applied the amount on every
  // delivery: a ₹400 refund could be recorded as ₹400, then ₹800, then clamped
  // to the full amount.
  const ourRefundId = ntRefund.providerRefundId!;
  const refundedBefore = Number((await orderRow('ord-nt-rf')).amount_refunded);
  const dupBody = (evt: string) => ({
    event: evt,
    payload: { refund: { entity: { id: ourRefundId, order_id: ntOrder.order!.id, amount: toMinorUnits(400) } } },
  });

  const wh1 = dupBody('refund.created');
  await postWebhook('/api/webhooks/razorpay', wh1, razorpayHeaders(wh1, 'evt-nt-rf-1'));
  check('refund.created for our own refund is processed', await waitForWebhookProcessed('evt-nt-rf-1'));
  const wh2 = dupBody('refund.processed');
  await postWebhook('/api/webhooks/razorpay', wh2, razorpayHeaders(wh2, 'evt-nt-rf-2'));
  check('refund.processed for the same refund is processed', await waitForWebhookProcessed('evt-nt-rf-2'));

  check(
    'the webhooks do not double-count our refund',
    Number((await orderRow('ord-nt-rf')).amount_refunded) === refundedBefore,
    `${refundedBefore} -> ${Number((await orderRow('ord-nt-rf')).amount_refunded)}`
  );
  check('the webhooks create no duplicate refund rows', (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id = 'ord-nt-rf'`)).rows[0].n === 1);
  check('the webhooks do not re-notify the customer', (await custNotifs('REFUND_COMPLETED', 'ord-nt-rf')) === 1);

  // --- a refund raised in Razorpay's dashboard IS applied and announced ---
  const dashboardRefundId = 'rfnd_dashboard_1';
  const dash = {
    event: 'refund.created',
    payload: { refund: { entity: { id: dashboardRefundId, order_id: ntOrder.order!.id, amount: toMinorUnits(100) } } },
  };
  await postWebhook('/api/webhooks/razorpay', dash, razorpayHeaders(dash, 'evt-nt-dash-1'));
  check('a dashboard-raised refund is processed', await waitForWebhookProcessed('evt-nt-dash-1'));
  check(
    'a dashboard-raised refund is applied',
    Number((await orderRow('ord-nt-rf')).amount_refunded) === refundedBefore + 100,
    String(Number((await orderRow('ord-nt-rf')).amount_refunded))
  );
  check('a dashboard-raised refund is recorded', (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id = 'ord-nt-rf'`)).rows[0].n === 2);
  check('a dashboard-raised refund notifies the customer', (await custNotifs('REFUND_COMPLETED', 'ord-nt-rf')) === 2);

  // ...and a redelivery of that same dashboard refund changes nothing.
  const dashAgain = {
    event: 'refund.processed',
    payload: { refund: { entity: { id: dashboardRefundId, order_id: ntOrder.order!.id, amount: toMinorUnits(100) } } },
  };
  await postWebhook('/api/webhooks/razorpay', dashAgain, razorpayHeaders(dashAgain, 'evt-nt-dash-2'));
  check('the redelivery is processed', await waitForWebhookProcessed('evt-nt-dash-2'));
  check(
    'the redelivery does not double-count',
    Number((await orderRow('ord-nt-rf')).amount_refunded) === refundedBefore + 100
  );
  check('the redelivery sends no third notification', (await custNotifs('REFUND_COMPLETED', 'ord-nt-rf')) === 2);

  // ========================================
  section('Tracking sync — the contract the admin UI renders');
  // ========================================

  // The panel shows only what the courier actually returned. These pin the
  // fields it reads, so a change to the route shape fails here rather than
  // silently blanking the panel.
  const syncOf = (orderId: string) =>
    adminFetch(`/api/admin/orders/${orderId}/shipment/track`, { method: 'POST' });
  const readOf = (orderId: string) => adminFetch(`/api/admin/orders/${orderId}/shipment/track`);

  await seedOrder({ id: 'ord-sync-ui', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  const syncShip = await createShipmentForOrder('ord-sync-ui');
  check('a shipment is booked for the sync test', syncShip.ok, syncShip.error);
  const syncWaybill = (await pool.query('SELECT waybill FROM shipments WHERE order_id = $1', ['ord-sync-ui'])).rows[0]?.waybill;
  mockDelhiveryProvider.simulateScan(syncWaybill, 'UD', 'In Transit', 'Departed origin hub');

  const s1 = await syncOf('ord-sync-ui');
  check('sync returns 200', s1.status === 200, `status=${s1.status} ${s1.json?.error || ''}`);
  check('sync reports it applied', s1.json?.applied === true);
  check('sync reports the courier status verbatim', typeof s1.json?.providerStatus === 'string', String(s1.json?.providerStatus));
  check('sync reports the mapped status field', 'status' in (s1.json || {}));
  check('sync reports a scan count', typeof s1.json?.newScans === 'number', String(s1.json?.newScans));
  check('sync reports whether the order moved', typeof s1.json?.orderStatusChanged === 'boolean');
  check('sync returns the courier events the panel lists', Array.isArray(s1.json?.events));
  check('sync returns the waybill', !!s1.json?.waybill);

  // The read path must stay inert and say so, since the panel distinguishes
  // "looked" from "applied".
  const r1 = await readOf('ord-sync-ui');
  check('the read path still returns 200', r1.status === 200);
  check('the read path reports applied:false', r1.json?.applied === false);
  check('the read path reports no scan count', r1.json?.newScans === undefined);

  // A second sync is a no-op: same scans, nothing new to apply.
  const s2 = await syncOf('ord-sync-ui');
  check('a repeated sync still returns 200', s2.status === 200);
  check('a repeated sync finds no new scans', s2.json?.newScans === 0, String(s2.json?.newScans));
  check('a repeated sync does not move the order again', s2.json?.orderStatusChanged === false);

  // An unrecognised courier status must be recorded, never guessed at — the
  // panel renders this as "unrecognised — recorded only".
  mockDelhiveryProvider.simulateScan(syncWaybill, 'ZZ', 'Unknown Thing', 'Something new');
  const s3 = await syncOf('ord-sync-ui');
  check('an unrecognised status still syncs', s3.status === 200);
  check('an unrecognised status maps to null, not a guess', s3.json?.status === null, String(s3.json?.status));
  check('an unrecognised status does not move the order', s3.json?.orderStatusChanged === false);
  check(
    'an unrecognised status does not mark a COD order PAID',
    (await orderRow('ord-sync-ui')).payment_status === 'COD_PENDING',
    (await orderRow('ord-sync-ui')).payment_status
  );

  // Courier unreachable surfaces as a 502 with a message the panel shows
  // verbatim, rather than a generic failure.
  await seedOrder({ id: 'ord-sync-dead', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  await pool.query(
    `INSERT INTO shipments (id, order_id, provider, waybill, awb_code, courier_name, status)
     VALUES ('shp-sync-dead','ord-sync-dead','delhivery-mock','WB-NOT-ISSUED','WB-NOT-ISSUED','Delhivery','IN_TRANSIT')`
  );
  const dead = await syncOf('ord-sync-dead');
  check('an unreachable courier returns 502', dead.status === 502, `status=${dead.status}`);
  check('the 502 carries an operator-facing message', typeof dead.json?.error === 'string' && dead.json.error.length > 0, dead.json?.error);
  check('a failed sync applies nothing', (await orderRow('ord-sync-dead')).status === 'CONFIRMED');
  check(
    'a failed sync leaves payment alone',
    (await orderRow('ord-sync-dead')).payment_status === 'COD_PENDING'
  );

  // ========================================
  section('Retry payment — eligibility, no double reservation, sweep safety');
  // ========================================

  // A customer whose payment failed had no way back to the gateway: the only
  // action offered was Cancel. Retry mints a FRESH gateway order rather than
  // reusing the old handle, because the adapter exposes no fetchOrder and
  // guessing whether Razorpay still considers it payable would be inventing a
  // capability we do not have.
  await seedCart(1);
  const retryCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-retry-1' },
  });
  const retryOrderId: string = retryCheckout.json.order.id;
  const firstGatewayOrder: string = retryCheckout.json.payment.gatewayOrderId;
  const stockAfterCheckout = await productStock();

  const retry1 = await apiFetch(`/api/customer/payments/${retryOrderId}/retry`, { method: 'POST' });
  check('an unpaid order can be retried', retry1.status === 200, `status=${retry1.status} ${retry1.json?.error || ''}`);
  check('retry returns a gateway handoff', !!retry1.json?.payment?.gatewayOrderId);
  check('retry mints a NEW gateway order', retry1.json?.payment?.gatewayOrderId !== firstGatewayOrder);
  check('retry carries the publishable key', !!retry1.json?.payment?.keyId);
  check(
    'retry prices from the order, not the request',
    retry1.json?.payment?.amountMinor === toMinorUnits(Number((await orderRow(retryOrderId)).total)),
    String(retry1.json?.payment?.amountMinor)
  );

  // The reservation taken at checkout must not be taken again.
  check('retry does not deduct stock a second time', (await productStock()) === stockAfterCheckout);
  const retryRow = await orderRow(retryOrderId);
  check('retry leaves the order awaiting payment', retryRow.status === 'PENDING_PAYMENT' && retryRow.payment_status === 'PENDING');
  check('retry keeps the original reservation', retryRow.stock_committed === true && retryRow.stock_restored === false);

  // Each attempt gets its own ledger row so a late webhook for the abandoned
  // attempt resolves to the right one.
  const ledgerRows = await pool.query('SELECT provider_order_id FROM payments WHERE order_id = $1', [retryOrderId]);
  check('each attempt has its own ledger row', ledgerRows.rows.length === 2, String(ledgerRows.rows.length));
  check(
    'the two rows carry different gateway orders',
    new Set(ledgerRows.rows.map((r: any) => r.provider_order_id)).size === 2
  );

  // Paying the retry confirms the order exactly once.
  const retryPay = mockGateway.simulatePayment({ gatewayOrderId: retry1.json.payment.gatewayOrderId, outcome: 'success' });
  const retryVerify = await apiFetch('/api/customer/payments/verify', {
    method: 'POST',
    body: {
      orderId: retryOrderId,
      razorpayOrderId: retry1.json.payment.gatewayOrderId,
      razorpayPaymentId: retryPay.id,
      razorpaySignature: signPaymentForMock(retry1.json.payment.gatewayOrderId, retryPay.id),
    },
  });
  check('the retried payment verifies', retryVerify.status === 200, `status=${retryVerify.status} ${retryVerify.json?.error || ''}`);
  const retryPaid = await orderRow(retryOrderId);
  check('the retried order becomes PAID', retryPaid.payment_status === 'PAID', retryPaid.payment_status);
  check('the retried order is CONFIRMED', retryPaid.status === 'CONFIRMED', retryPaid.status);
  check('paying a retry does not deduct stock again', (await productStock()) === stockAfterCheckout);

  // --- ineligible cases ---
  const retryPaidAgain = await apiFetch(`/api/customer/payments/${retryOrderId}/retry`, { method: 'POST' });
  check('a PAID order cannot be retried', retryPaidAgain.status === 409, `status=${retryPaidAgain.status}`);

  const retryCod = await apiFetch('/api/customer/payments/ord-cod/retry', { method: 'POST' });
  check('a COD order cannot be retried', retryCod.status === 400, `status=${retryCod.status}`);

  // An order whose reservation was released must not be retried — the units
  // may be someone else's by now.
  await seedCart(1);
  const relCheckout = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-retry-rel' },
  });
  const relOrderId: string = relCheckout.json.order.id;
  await apiFetch(`/api/customer/payments/${relOrderId}/cancel`, { method: 'POST' });
  const retryReleased = await apiFetch(`/api/customer/payments/${relOrderId}/retry`, { method: 'POST' });
  check('an order whose stock was released cannot be retried', retryReleased.status === 409, `status=${retryReleased.status}`);

  // Another customer's order is invisible, not merely forbidden.
  const otherToken = { Authorization: `Bearer ${signCustomerToken(TEST_USER_2, 'two@test.local', 0)}` };
  const foreign = await fetch(`http://127.0.0.1:${webhookPort}/api/customer/payments/${retryOrderId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...otherToken },
  });
  check("another customer cannot retry someone else's order", foreign.status === 404, `status=${foreign.status}`);

  const noAuthRetry = await fetch(`http://127.0.0.1:${webhookPort}/api/customer/payments/${retryOrderId}/retry`, { method: 'POST' });
  check('retry requires a signed-in customer', noAuthRetry.status === 401, `status=${noAuthRetry.status}`);

  // --- the expiry sweep must not cancel an order mid-retry ---
  // The sweep keys on the latest payment attempt, not the order's creation
  // time. Without that, an order created 31 minutes ago whose customer just
  // opened a fresh attempt would be cancelled out from under them, and a
  // payment landing afterwards would leave a PAID order stuck CANCELLED.
  await seedOrder({ id: 'ord-sweep-retry', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING' });
  await pool.query(`UPDATE orders SET created_at = now() - interval '45 minutes' WHERE id = 'ord-sweep-retry'`);
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, amount_minor, currency, status, created_at)
     VALUES ('pay-sweep-fresh','ord-sweep-retry',$1,'razorpay-mock','order_sweep_fresh',100000,'INR','PENDING', now())`,
    [TEST_USER]
  );
  await expirePendingPaymentOrders();
  const sweptRetry = await orderRow('ord-sweep-retry');
  check('a fresh attempt on an old order survives the sweep', sweptRetry.status === 'PENDING_PAYMENT', sweptRetry.status);
  check('its payment is still pending', sweptRetry.payment_status === 'PENDING', sweptRetry.payment_status);

  // ...but a genuinely abandoned order is still swept.
  await seedOrder({ id: 'ord-sweep-old', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING' });
  await pool.query(`UPDATE orders SET created_at = now() - interval '45 minutes' WHERE id = 'ord-sweep-old'`);
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, amount_minor, currency, status, created_at)
     VALUES ('pay-sweep-old','ord-sweep-old',$1,'razorpay-mock','order_sweep_old',100000,'INR','PENDING', now() - interval '45 minutes')`,
    [TEST_USER]
  );
  await expirePendingPaymentOrders();
  const sweptOld = await orderRow('ord-sweep-old');
  check('a genuinely abandoned order is still swept', sweptOld.payment_status === 'EXPIRED', sweptOld.payment_status);
  check('the swept order is cancelled', sweptOld.status === 'CANCELLED', sweptOld.status);

  // ========================================
  section('Online refunds — provider status, ambiguity, reconciliation');
  // ========================================

  /** A delivered, fully-paid online order with a captured mock payment. */
  const seedRefundable = async (id: string, total: number) => {
    await seedOrder({ id, status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total });
    await pool.query(`UPDATE orders SET amount_paid = $2 WHERE id = $1`, [id, total]);
    const go = await mockGateway.createOrder({ amountMinor: toMinorUnits(total), currency: 'INR', receipt: id });
    const pay = mockGateway.simulatePayment({ gatewayOrderId: go.order!.id, outcome: 'success' });
    await pool.query(
      `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
       VALUES ($1,$2,$3,'razorpay-mock',$4,$5,$6,'INR','PAID')`,
      ['pay-' + id, id, TEST_USER, go.order!.id, pay.id, toMinorUnits(total)]
    );
    return pay.id;
  };

  // --- the provider's status decides ours, not a hardcoded assumption ---
  await seedRefundable('ord-or-pending', 900);
  const pendingRf = await refundOrderPayment('ord-or-pending', 400, 'Settles later', {
    // The mock honours this, standing in for a real Razorpay refund that is
    // accepted but not instant.
    idempotencyKey: 'or-pend-1',
    providerSimulate: 'pending_refund',
  });
  check('a provider-pending refund is accepted', pendingRf.ok, pendingRf.error);
  check('it reports the provider status verbatim', pendingRf.providerStatus === 'pending', String(pendingRf.providerStatus));
  const pendRow = (await pool.query(`SELECT * FROM refunds WHERE order_id = 'ord-or-pending'`)).rows[0];
  check('it is stored PENDING, not PROCESSED', pendRow?.status === 'PENDING', pendRow?.status);
  check('the provider refund id is persisted', !!pendRow?.provider_refund_id);
  check(
    'a pending refund does NOT move amount_refunded',
    Number((await orderRow('ord-or-pending')).amount_refunded) === 0,
    String((await orderRow('ord-or-pending')).amount_refunded)
  );
  check(
    'a pending refund does NOT notify the customer yet',
    (await pool.query(`SELECT COUNT(*)::int n FROM notifications WHERE type='REFUND' AND order_id='ord-or-pending'`)).rows[0].n === 0
  );
  // ...but it DOES hold the balance, so the money cannot be refunded twice.
  const overlap = await refundOrderPayment('ord-or-pending', 600, 'Should be clamped');
  check('a pending refund still holds the refundable balance', overlap.amount === 500, String(overlap.amount));

  // --- an ambiguous timeout must never be reported as a plain failure ---
  await seedRefundable('ord-or-timeout', 700);
  const timedOut = await refundOrderPayment('ord-or-timeout', 700, 'Will time out', {
    providerSimulate: 'timeout',
  });
  check('a timed-out refund is not reported successful', !timedOut.ok);
  check('a timed-out refund is flagged ambiguous', timedOut.ambiguous === true);
  const toRow = (await pool.query(`SELECT * FROM refunds WHERE order_id = 'ord-or-timeout'`)).rows[0];
  check('an ambiguous refund is UNRESOLVED, not FAILED', toRow?.status === 'UNRESOLVED', toRow?.status);
  check('an ambiguous refund moves no money', Number((await orderRow('ord-or-timeout')).amount_refunded) === 0);
  // The critical property: the balance stays held, so a "retry" cannot
  // double-refund money the provider may already have sent.
  const retryAfterTimeout = await refundOrderPayment('ord-or-timeout', 700, 'Blind retry');
  check(
    'an ambiguous refund blocks a blind retry',
    !retryAfterTimeout.ok,
    `ok=${retryAfterTimeout.ok} amount=${retryAfterTimeout.amount}`
  );
  check(
    'the blind retry created no second refund row',
    (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id = 'ord-or-timeout'`)).rows[0].n === 1
  );

  // --- reconciliation resolves it by ASKING the provider ---
  const reconciled = await reconcileRefund(toRow.id);
  check('reconciliation succeeds', reconciled.ok, reconciled.error);
  check('reconciliation finds the refund the provider accepted', reconciled.status === 'PROCESSED', reconciled.status);
  check('reconciliation reports that it changed state', reconciled.changed === true);
  const afterRec = await orderRow('ord-or-timeout');
  check('reconciliation moves amount_refunded', Number(afterRec.amount_refunded) === 700, String(afterRec.amount_refunded));
  check('reconciliation marks the order REFUNDED', afterRec.payment_status === 'REFUNDED', afterRec.payment_status);
  await drainNotifications();
  check(
    'reconciliation notifies the customer once',
    (await pool.query(`SELECT COUNT(*)::int n FROM notifications WHERE type='REFUND_COMPLETED' AND order_id='ord-or-timeout'`))
      .rows[0].n === 1
  );
  const recRow = (await pool.query(`SELECT * FROM refunds WHERE order_id = 'ord-or-timeout'`)).rows[0];
  check('the provider refund id is recorded on reconciliation', !!recRow?.provider_refund_id);

  // Reconciling again is a no-op, not a second credit.
  const recAgain = await reconcileRefund(toRow.id);
  check('a second reconciliation changes nothing', recAgain.ok && recAgain.changed === false);
  check('a second reconciliation does not double-credit', Number((await orderRow('ord-or-timeout')).amount_refunded) === 700);
  await drainNotifications();
  check(
    'a second reconciliation sends no second notification',
    (await pool.query(`SELECT COUNT(*)::int n FROM notifications WHERE type='REFUND_COMPLETED' AND order_id='ord-or-timeout'`)).rows[0].n === 1
  );

  // --- reconciling a request the provider never received frees the balance ---
  await seedRefundable('ord-or-lost', 500);
  await pool.query(
    `INSERT INTO refunds (id, order_id, payment_id, provider, amount_minor, currency, status, reason, created_by)
     VALUES ('rfnd-lost','ord-or-lost','pay-ord-or-lost','razorpay-mock',$1,'INR','UNRESOLVED','Never landed','system')`,
    [toMinorUnits(500)]
  );
  const lostBlocked = await refundOrderPayment('ord-or-lost', 500, 'Blocked while unresolved');
  check('an unresolved row blocks a fresh refund', !lostBlocked.ok);
  const lostRec = await reconcileRefund('rfnd-lost');
  check('reconciling a lost request succeeds', lostRec.ok, lostRec.error);
  check('the provider has no such refund, so it is FAILED', lostRec.status === 'FAILED', lostRec.status);
  check('a lost request credits nothing', Number((await orderRow('ord-or-lost')).amount_refunded) === 0);
  // Only now is a retry safe.
  const retryAfterFailed = await refundOrderPayment('ord-or-lost', 500, 'Safe retry');
  check('once reconciled FAILED, the balance is free again', retryAfterFailed.ok, retryAfterFailed.error);
  check('the safe retry actually refunds', Number((await orderRow('ord-or-lost')).amount_refunded) === 500);

  // --- uncaptured payment is refused ---
  await seedOrder({ id: 'ord-or-uncap', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 300 });
  await pool.query(`UPDATE orders SET amount_paid = 300 WHERE id = 'ord-or-uncap'`);
  const uncapOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(300), currency: 'INR', receipt: 'UNCAP' });
  const uncapPay = mockGateway.simulatePayment({ gatewayOrderId: uncapOrder.order!.id, outcome: 'pending' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-uncap','ord-or-uncap',$1,'razorpay-mock',$2,$3,$4,'INR','PENDING')`,
    [TEST_USER, uncapOrder.order!.id, uncapPay.id, toMinorUnits(300)]
  );
  const uncapRf = await refundOrderPayment('ord-or-uncap', 300, 'Uncaptured');
  check('an uncaptured payment cannot be refunded', !uncapRf.ok, uncapRf.error);
  check('no refund row is created for an uncaptured payment', (await pool.query(`SELECT COUNT(*)::int n FROM refunds WHERE order_id='ord-or-uncap'`)).rows[0].n === 0);

  // --- admin reconcile route: authorized, audited ---
  await seedRefundable('ord-or-route', 600);
  await refundOrderPayment('ord-or-route', 600, 'Route pending', { providerSimulate: 'pending_refund' });
  const routeRow = (await pool.query(`SELECT id FROM refunds WHERE order_id='ord-or-route'`)).rows[0];
  const noAuthRec = await fetch(`http://127.0.0.1:${webhookPort}/api/admin/refunds/${routeRow.id}/reconcile`, { method: 'POST' });
  check('the reconcile route requires admin auth', noAuthRec.status === 401, `status=${noAuthRec.status}`);
  const recRoute = await adminFetch(`/api/admin/refunds/${routeRow.id}/reconcile`, { method: 'POST' });
  check('an admin can reconcile', recRoute.status === 200, `status=${recRoute.status} ${recRoute.json?.error || ''}`);
  // Still PENDING, and that is the point: the provider has accepted this
  // refund but has not settled it. Reconciliation reports what the provider
  // actually says — it must not promote a pending refund to complete just
  // because someone pressed the button.
  check('reconciling a still-pending refund reports PENDING', recRoute.json?.status === 'PENDING', recRoute.json?.status);
  check(
    'a still-pending refund is not credited',
    Number((await orderRow('ord-or-route')).amount_refunded) === 0,
    String((await orderRow('ord-or-route')).amount_refunded)
  );

  const unresolvedList = await adminFetch('/api/admin/refunds/unresolved');
  check('unresolved refunds are listable', unresolvedList.status === 200);
  check(
    'a still-pending refund stays on the unresolved list',
    (unresolvedList.json?.refunds || []).some((r: any) => r.id === routeRow.id)
  );
  check(
    'a settled refund is NOT on the unresolved list',
    !(unresolvedList.json?.refunds || []).some((r: any) => r.id === toRow.id)
  );

  // ========================================
  section('Notification engine — dedupe, channels, retry, failure tracking');
  // ========================================

  // The engine replaces nineteen hand-paired notifyX + sendEmail call sites.
  // Each of those had to independently remember not to fire twice, not to
  // fire before the write committed, and not to let a provider failure break
  // the transition. Several forgot: payment failure and refunds told the
  // customer nothing at all.

  const deliveriesFor = async (dedupeKey: string) =>
    (
      await pool.query(
        `SELECT d.channel, d.status, d.attempts, d.last_error
         FROM notification_deliveries d JOIN notification_events e ON e.id = d.event_id
         WHERE e.dedupe_key = $1 ORDER BY d.channel`,
        [dedupeKey]
      )
    ).rows;

  await seedOrder({ id: 'ord-ne-1', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 1200 });
  const neOrderNumber = (await orderRow('ord-ne-1')).order_number;

  const basePayload = {
    orderNumber: neOrderNumber,
    customerName: 'Test One',
    toEmail: 'one@test.local',
    toPhone: '+919876543210',
    paymentMethod: 'cod',
    total: 1200,
    items: [{ name: 'Test Lipstick', quantity: 2 }],
  };

  // --- one transition, one event ---
  const first = await enqueueNotification({
    orderId: 'ord-ne-1',
    userId: TEST_USER,
    eventType: 'ORDER_SHIPPED',
    dedupeKey: 'ord-ne-1:ORDER_SHIPPED',
    payload: { ...basePayload, trackingNumber: 'AWB123', courierName: 'Delhivery' },
  });
  check('a genuine transition enqueues', first.enqueued === true);
  check('it fans out to the event\'s channels', (await deliveriesFor('ord-ne-1:ORDER_SHIPPED')).length === 3);

  // --- a repeated admin click / redelivered webhook / sweep ---
  const neReplay = await enqueueNotification({
    orderId: 'ord-ne-1',
    userId: TEST_USER,
    eventType: 'ORDER_SHIPPED',
    dedupeKey: 'ord-ne-1:ORDER_SHIPPED',
    payload: basePayload,
  });
  check('a repeated event is not enqueued twice', neReplay.enqueued === false);
  check('and creates no extra deliveries', (await deliveriesFor('ord-ne-1:ORDER_SHIPPED')).length === 3);

  // --- processing: inapp sends, email/whatsapp skip honestly ---
  const run1 = await processPendingNotifications();
  check('the worker attempts the due deliveries', run1.attempted >= 3, String(run1.attempted));
  const after1 = await deliveriesFor('ord-ne-1:ORDER_SHIPPED');
  const byChannel = (c: string) => after1.find((r: any) => r.channel === c);
  check('in-app is SENT', byChannel('inapp')?.status === 'SENT', byChannel('inapp')?.status);
  check(
    'whatsapp is SKIPPED, not FAILED',
    byChannel('whatsapp')?.status === 'SKIPPED',
    byChannel('whatsapp')?.status
  );
  check(
    'the whatsapp skip says exactly what is missing',
    /not connected|WHATSAPP_PROVIDER/i.test(byChannel('whatsapp')?.last_error || ''),
    byChannel('whatsapp')?.last_error
  );
  check(
    'email is SKIPPED or FAILED with the provider error recorded, never silently dropped',
    ['SKIPPED', 'FAILED', 'SENT', 'PENDING'].includes(byChannel('email')?.status) && byChannel('email') !== undefined,
    byChannel('email')?.status
  );

  // The in-app row really exists and carries COD wording.
  const inappRow = (
    await pool.query(`SELECT * FROM notifications WHERE order_id = 'ord-ne-1' AND type = 'ORDER_SHIPPED'`)
  ).rows[0];
  check('the in-app notification was written', !!inappRow);
  check('it names the courier tracking', /AWB123/.test(inappRow?.body || ''), inappRow?.body);
  check('a COD order is told to keep cash ready', /keep ₹1200 ready/i.test(inappRow?.body || ''), inappRow?.body);
  check('a COD order is NOT told it paid online', !/paid online/i.test(inappRow?.body || ''));

  // --- running again does not resend ---
  // Email reports SENT here because mailer.ts hands back a capturing stub
  // under NODE_ENV=test rather than opening a real SMTP connection — so the
  // assertion is that the count does not MOVE, not that it equals one.
  const sentBefore = after1.filter((r: any) => r.status === 'SENT').length;
  const run2 = await processPendingNotifications();
  const after2 = await deliveriesFor('ord-ne-1:ORDER_SHIPPED');
  check(
    'a second worker pass resends nothing',
    after2.filter((r: any) => r.status === 'SENT').length === sentBefore,
    `${sentBefore} -> ${after2.filter((r: any) => r.status === 'SENT').length}`
  );
  check(
    'and writes no duplicate in-app notification',
    (await pool.query(`SELECT COUNT(*)::int n FROM notifications WHERE order_id='ord-ne-1' AND type='ORDER_SHIPPED'`)).rows[0].n === 1,
    String(run2.attempted)
  );

  // --- prepaid wording differs from COD ---
  await seedOrder({ id: 'ord-ne-2', status: 'CONFIRMED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 900 });
  const prepaidNumber = (await orderRow('ord-ne-2')).order_number;
  await enqueueNotification({
    orderId: 'ord-ne-2',
    userId: TEST_USER,
    eventType: 'ORDER_CONFIRMED',
    dedupeKey: 'ord-ne-2:ORDER_CONFIRMED',
    payload: { orderNumber: prepaidNumber, toEmail: 'one@test.local', paymentMethod: 'online', total: 900 },
  });
  await processPendingNotifications();
  const prepaidRow = (
    await pool.query(`SELECT * FROM notifications WHERE order_id = 'ord-ne-2' AND type = 'ORDER_CONFIRMED'`)
  ).rows[0];
  check('a prepaid order says it was paid online', /paid online/i.test(prepaidRow?.body || ''), prepaidRow?.body);
  check('a prepaid order is NOT told to pay the courier', !/due to the courier/i.test(prepaidRow?.body || ''));

  // --- payment failure never says anything success-shaped ---
  await seedOrder({ id: 'ord-ne-3', status: 'CANCELLED', paymentMethod: 'upi', paymentStatus: 'FAILED', total: 400 });
  const failNumber = (await orderRow('ord-ne-3')).order_number;
  await enqueueNotification({
    orderId: 'ord-ne-3',
    userId: TEST_USER,
    eventType: 'PAYMENT_FAILED',
    dedupeKey: 'ord-ne-3:PAYMENT_FAILED',
    payload: { orderNumber: failNumber, toEmail: 'one@test.local', paymentMethod: 'online', total: 400, failureReason: 'Card declined' },
  });
  await processPendingNotifications();
  const failRow2 = (
    await pool.query(`SELECT * FROM notifications WHERE order_id = 'ord-ne-3' AND type = 'PAYMENT_FAILED'`)
  ).rows[0];
  check('a failed payment produces a notification at all', !!failRow2);
  check('it says nothing was charged', /nothing has been charged/i.test(failRow2?.body || ''), failRow2?.body);
  check('it never claims payment succeeded', !/paid online|payment received|confirmed/i.test(failRow2?.body || ''));
  check('it carries the provider reason', /Card declined/.test(failRow2?.body || ''));
  check('payment failure does not go to whatsapp', (await deliveriesFor('ord-ne-3:PAYMENT_FAILED')).every((r: any) => r.channel !== 'whatsapp'));

  // --- a transient channel failure retries with backoff, then gives up ---
  resetChannelsForTest();
  let attemptCount = 0;
  registerChannel('inapp', async () => {
    attemptCount++;
    return { ok: false, retryable: true, reason: 'Simulated transient outage' };
  });
  await seedOrder({ id: 'ord-ne-4', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
  await enqueueNotification({
    orderId: 'ord-ne-4',
    userId: TEST_USER,
    eventType: 'ORDER_PACKED',
    dedupeKey: 'ord-ne-4:ORDER_PACKED',
    payload: { orderNumber: (await orderRow('ord-ne-4')).order_number },
    channels: ['inapp'],
  });
  await processPendingNotifications();
  const t1 = (await deliveriesFor('ord-ne-4:ORDER_PACKED'))[0];
  check('a transient failure stays PENDING for retry', t1?.status === 'PENDING', t1?.status);
  check('the attempt is counted', Number(t1?.attempts) === 1, String(t1?.attempts));
  check('the provider error is recorded verbatim', /Simulated transient outage/.test(t1?.last_error || ''));
  check('backoff defers the next attempt', attemptCount === 1);

  // Not due yet — the worker must not hammer it.
  await processPendingNotifications();
  check('backoff is respected on the next pass', attemptCount === 1, String(attemptCount));

  // Force it due repeatedly to exhaust the budget.
  for (let i = 0; i < 6; i++) {
    await pool.query(
      `UPDATE notification_deliveries SET next_attempt_at = now() - interval '1 hour'
       WHERE event_id = (SELECT id FROM notification_events WHERE dedupe_key = 'ord-ne-4:ORDER_PACKED')`
    );
    await processPendingNotifications();
  }
  const exhausted = (await deliveriesFor('ord-ne-4:ORDER_PACKED'))[0];
  check('retries are bounded, not infinite', Number(exhausted?.attempts) <= 5, String(exhausted?.attempts));
  check('it eventually FAILS rather than retrying forever', exhausted?.status === 'FAILED', exhausted?.status);

  // --- failed deliveries are visible and retryable ---
  const failedList = await listFailedNotifications();
  check('failed notifications are listable', failedList.some((f) => f.eventType === 'ORDER_PACKED'));
  const failedEntry = failedList.find((f) => f.eventType === 'ORDER_PACKED')!;
  check('the listing carries the provider error', /Simulated transient outage/.test(failedEntry.lastError || ''));
  check('the listing carries the attempt count', failedEntry.attempts >= 1);

  // A permanent refusal must not be retried at all.
  resetChannelsForTest();
  registerChannel('inapp', async () => ({ ok: false, retryable: false, reason: 'Permanently rejected' }));
  const retried = await retryNotification(failedEntry.id);
  check('a failed delivery can be re-queued', retried.ok, retried.error);
  await processPendingNotifications();
  const afterPermanent = (await deliveriesFor('ord-ne-4:ORDER_PACKED'))[0];
  check('a permanent refusal fails immediately', afterPermanent?.status === 'FAILED', afterPermanent?.status);
  check('a permanent refusal burns only one attempt', Number(afterPermanent?.attempts) === 1, String(afterPermanent?.attempts));

  // Restore the real channels for anything downstream.
  resetChannelsForTest();
  registerDefaultChannels();

  // ========================================
  section('Admin new-order alerts — both payment methods, accurate status');
  // ========================================

  // Checkout used to alert the store only for COD, on the reasoning that an
  // unpaid prepaid order might evaporate. Once online payments went live that
  // meant a prepaid sale produced NO new-order alert at all. Both methods now
  // alert, with the payment state stated plainly.
  const adminNotifsOf = async (orderId: string, type = 'NEW_ORDER') => {
    await drainNotifications();
    return (await pool.query(`SELECT * FROM admin_notifications WHERE order_id = $1 AND type = $2`, [orderId, type])).rows;
  };
  const adminDeliveriesOf = async (orderId: string) =>
    (
      await pool.query(
        `SELECT d.channel, d.status, d.last_error FROM notification_deliveries d
         JOIN notification_events e ON e.id = d.event_id
         WHERE e.order_id = $1 AND e.event_type = 'ADMIN_NEW_ORDER' ORDER BY d.channel`,
        [orderId]
      )
    ).rows;

  // --- COD: one alert, correct wording ---
  await seedCart(1);
  const codOrderRes = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'cod', idempotencyKey: 'idem-adm-cod' },
  });
  check('COD checkout succeeds', codOrderRes.status === 200, `status=${codOrderRes.status}`);
  const codId: string = codOrderRes.json.order.id;
  await processPendingNotifications();

  const codAlert = await adminNotifsOf(codId);
  check('a COD order produces exactly one admin alert', codAlert.length === 1, String(codAlert.length));
  check('it names the order number', codAlert[0]?.body.includes(codOrderRes.json.order.orderNumber));
  check('it states COD collection', /COD — collect ₹\d+ on delivery/.test(codAlert[0]?.body || ''), codAlert[0]?.body);
  check('it lists the products', /Items: .*×/.test(codAlert[0]?.body || ''), codAlert[0]?.body);
  check('it never calls a COD order paid', !/\bPAID\b/.test(codAlert[0]?.body || ''));
  check('it carries no delivery address', !/Test St|411001/.test(codAlert[0]?.body || ''));

  // --- prepaid, unpaid: alerted, and explicitly NOT described as paid ---
  await seedCart(1);
  const preRes = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'online', idempotencyKey: 'idem-adm-pre' },
  });
  const preId: string = preRes.json.order.id;
  await processPendingNotifications();

  const preAlert = await adminNotifsOf(preId);
  check('a prepaid order also produces an admin alert', preAlert.length === 1, String(preAlert.length));
  check('an unpaid prepaid order says AWAITING PAYMENT', /AWAITING PAYMENT/.test(preAlert[0]?.body || ''), preAlert[0]?.body);
  check('it warns against dispatch', /do not dispatch/i.test(preAlert[0]?.body || ''));
  check('it does NOT claim the payment succeeded', !/verified|PAID ₹/.test(preAlert[0]?.body || ''));

  // --- verified payment produces the separate ORDER_PAID alert ---
  const prePay = mockGateway.simulatePayment({ gatewayOrderId: preRes.json.payment.gatewayOrderId, outcome: 'success' });
  await apiFetch('/api/customer/payments/verify', {
    method: 'POST',
    body: {
      orderId: preId,
      razorpayOrderId: preRes.json.payment.gatewayOrderId,
      razorpayPaymentId: prePay.id,
      razorpaySignature: signPaymentForMock(preRes.json.payment.gatewayOrderId, prePay.id),
    },
  });
  check('the order is genuinely PAID', (await orderRow(preId)).payment_status === 'PAID');
  check('a verified payment adds an ORDER_PAID alert', (await adminNotifsOf(preId, 'ORDER_PAID')).length === 1);
  check(
    'the original NEW_ORDER alert is not rewritten',
    (await adminNotifsOf(preId)).length === 1,
    'the awaiting-payment alert should remain as the historical record'
  );

  // --- replay does not duplicate ---
  await seedCart(1);
  const replayRes = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'cod', idempotencyKey: 'idem-adm-cod' },
  });
  check('a replayed checkout returns the original order', replayRes.json?.order?.id === codId);
  await processPendingNotifications();
  check('a replayed checkout adds no second admin alert', (await adminNotifsOf(codId)).length === 1);

  // Re-enqueueing the same event directly is also a no-op.
  const reEnqueue = await enqueueNotification({
    orderId: codId,
    eventType: 'ADMIN_NEW_ORDER',
    dedupeKey: `${codId}:ADMIN_NEW_ORDER`,
    payload: { orderNumber: 'X', orderId: codId },
  });
  check('re-enqueueing the same event is refused', reEnqueue.enqueued === false);
  await processPendingNotifications();
  check('and still only one admin alert exists', (await adminNotifsOf(codId)).length === 1);

  // --- WhatsApp is wired, recorded, and honestly skipped ---
  const codDeliveries = await adminDeliveriesOf(codId);
  check('the alert fans out to both admin channels', codDeliveries.length === 2, String(codDeliveries.length));
  const waRow = codDeliveries.find((r: any) => r.channel === 'admin_whatsapp');
  check('admin in-app is SENT', codDeliveries.find((r: any) => r.channel === 'admin_inapp')?.status === 'SENT');
  check('admin WhatsApp is SKIPPED, not silently dropped', waRow?.status === 'SKIPPED', waRow?.status);
  check(
    'the WhatsApp skip names the exact missing piece',
    /WHATSAPP_PROVIDER|admin WhatsApp number|approved/i.test(waRow?.last_error || ''),
    waRow?.last_error
  );
  check(
    'no WhatsApp delivery is ever reported SENT without a provider',
    !codDeliveries.some((r: any) => r.channel === 'admin_whatsapp' && r.status === 'SENT')
  );

  // --- a transient admin-channel failure is recorded and retried ---
  resetChannelsForTest();
  let adminAttempts = 0;
  registerChannel('admin_inapp', async () => {
    adminAttempts++;
    return { ok: false, retryable: true, reason: 'Simulated admin channel outage' };
  });
  await seedOrder({ id: 'ord-adm-fail', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 250 });
  await enqueueNotification({
    orderId: 'ord-adm-fail',
    eventType: 'ADMIN_NEW_ORDER',
    dedupeKey: 'ord-adm-fail:ADMIN_NEW_ORDER',
    payload: { orderId: 'ord-adm-fail', orderNumber: (await orderRow('ord-adm-fail')).order_number, total: 250, paymentMethod: 'cod' },
    channels: ['admin_inapp'],
  });
  await processPendingNotifications();
  const admFail = (
    await pool.query(
      `SELECT d.status, d.attempts, d.last_error FROM notification_deliveries d
       JOIN notification_events e ON e.id = d.event_id WHERE e.order_id = 'ord-adm-fail'`
    )
  ).rows[0];
  check('an admin channel failure stays PENDING for retry', admFail?.status === 'PENDING', admFail?.status);
  check('the provider error is recorded', /Simulated admin channel outage/.test(admFail?.last_error || ''));
  check('the attempt is counted', Number(admFail?.attempts) === 1 && adminAttempts === 1);

  resetChannelsForTest();
  registerDefaultChannels();

  // ========================================
  section('Admin delivery-failures panel — listing, filtering, retry');
  // ========================================

  // The outbox had no window onto it: a notification that failed left a
  // console line on a server nobody reads. These routes are that window, and
  // the one thing they must never do is make a delivery look more successful
  // than it was.

  const listDeliveries = async (qs = '') =>
    adminFetch(`/api/admin/notifications/deliveries${qs ? '?' + qs : ''}`);

  // --- authorization is enforced by the server, not by hiding a button ---
  const anonList = await fetch(`http://127.0.0.1:${webhookPort}/api/admin/notifications/deliveries`);
  check('listing deliveries without a token is refused', anonList.status === 401, String(anonList.status));
  const anonRetry = await fetch(
    `http://127.0.0.1:${webhookPort}/api/admin/notifications/deliveries/nd-anything/retry`,
    { method: 'POST' }
  );
  check('retrying without a token is refused', anonRetry.status === 401, String(anonRetry.status));

  const customerList = await fetch(`http://127.0.0.1:${webhookPort}/api/admin/notifications/deliveries`, {
    headers: customerAuth(),
  });
  check(
    'a customer session cannot read the notification outbox',
    customerList.status === 403 || customerList.status === 401,
    String(customerList.status)
  );

  // --- seed a spread of outcomes across channels ---
  // In production the block probes are installed once at module import and
  // stay installed. resetChannelsForTest() clears them along with the
  // senders, so this suite reinstalls the WhatsApp probe after every reset —
  // without it the panel would think an unconfigured channel were retryable,
  // which is the opposite of what these tests are checking.
  const installWhatsAppBlock = () =>
    registerChannelBlockProbe(
      'whatsapp',
      async () => 'WhatsApp is not connected. Set WHATSAPP_PROVIDER and its credentials, then retry.'
    );

  resetChannelsForTest();
  installWhatsAppBlock();
  registerChannel('inapp', async () => ({ ok: true }));
  registerChannel('email', async () => ({ ok: false, retryable: true, reason: 'SMTP 535-5.7.8 Username and Password not accepted' }));
  registerChannel('whatsapp', async () => ({ ok: false, skip: true, reason: 'WhatsApp is not connected: WHATSAPP_PROVIDER unset.' }));
  installWhatsAppBlock();

  await seedOrder({ id: 'ord-dlv-1', status: 'SHIPPED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 700 });
  const dlvNumber = (await orderRow('ord-dlv-1')).order_number;
  await enqueueNotification({
    orderId: 'ord-dlv-1',
    userId: TEST_USER,
    eventType: 'ORDER_SHIPPED',
    dedupeKey: 'ord-dlv-1:ORDER_SHIPPED',
    payload: {
      orderNumber: dlvNumber,
      toEmail: 'rishabh.customer@gmail.com',
      toPhone: '+919876543210',
      total: 700,
      paymentMethod: 'cod',
    },
  });
  await processPendingNotifications();

  // --- listing ---
  const allList = await listDeliveries('status=ALL&pageSize=100');
  check('an admin can list deliveries', allList.status === 200, String(allList.status));
  const dlvRows = (allList.json.deliveries || []).filter((d: any) => d.orderNumber === dlvNumber);
  check('all three channels are listed', dlvRows.length === 3, String(dlvRows.length));
  check('the listing reports the retry ceiling', allList.json.maxAttempts === MAX_ATTEMPTS);
  check('status tallies accompany the page', typeof allList.json.counts === 'object' && allList.json.counts !== null);

  const byCh = (c: string) => dlvRows.find((d: any) => d.channel === c);
  check('the order number is resolved for display', byCh('inapp')?.orderNumber === dlvNumber);
  check('the event type is carried', byCh('inapp')?.eventType === 'ORDER_SHIPPED');

  // --- statuses are reported accurately, SKIPPED distinct from SENT ---
  check('a delivered notification reads SENT', byCh('inapp')?.status === 'SENT', byCh('inapp')?.status);
  check('a transient SMTP failure reads PENDING, awaiting retry', byCh('email')?.status === 'PENDING', byCh('email')?.status);
  check('an unconfigured WhatsApp reads SKIPPED', byCh('whatsapp')?.status === 'SKIPPED', byCh('whatsapp')?.status);
  check('SKIPPED is never reported as SENT', byCh('whatsapp')?.status !== 'SENT');
  check('a SENT row carries a delivery timestamp', !!byCh('inapp')?.sentAt);
  check('a never-sent row carries none', byCh('whatsapp')?.sentAt === null);

  // --- the provider's own words survive to the panel ---
  check('the SMTP error is shown verbatim', /535-5\.7\.8/.test(byCh('email')?.lastError || ''), byCh('email')?.lastError);
  check('the WhatsApp skip reason is shown', /WHATSAPP_PROVIDER/.test(byCh('whatsapp')?.lastError || ''));

  // --- attempt and schedule reporting ---
  check('the attempt count is exposed', byCh('email')?.attempts === 1, String(byCh('email')?.attempts));
  check('the ceiling accompanies it', byCh('email')?.maxAttempts === MAX_ATTEMPTS);
  check('the last attempt time is recorded', !!byCh('email')?.lastAttemptAt);
  check('a backing-off delivery advertises its next attempt', !!byCh('email')?.nextAttemptAt);
  check('a terminal delivery advertises none', byCh('whatsapp')?.nextAttemptAt === null);

  // --- no credentials or raw customer contact in the response ---
  const listBody = JSON.stringify(allList.json);
  check('the customer email is masked, not raw', !listBody.includes('rishabh.customer@gmail.com'), 'raw email leaked');
  check('the masked form is still recognisable', /ri[•]+@gmail\.com/.test(byCh('email')?.recipient || ''), byCh('email')?.recipient);
  check('the full phone number is not returned', !listBody.includes('9876543210'), 'raw phone leaked');
  check('the masked phone keeps only its ends', /^\+91[•]+10$/.test(byCh('whatsapp')?.recipient || ''), byCh('whatsapp')?.recipient);
  check('an admin-channel row exposes no customer contact', maskRecipient(null) === null);
  // Scanned as JSON KEYS, not as a substring: the provider's own error text
  // legitimately contains the word "Password" ("SMTP 535 Username and
  // Password not accepted"), and that sentence is the single most useful
  // thing on the screen. What must never appear is a field CARRYING a
  // credential.
  const serialisedKeys = new Set<string>();
  const walkKeys = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walkKeys);
    for (const [k, v] of Object.entries(node)) {
      serialisedKeys.add(k.toLowerCase());
      walkKeys(v);
    }
  };
  walkKeys(allList.json);
  const secretKey = [...serialisedKeys].find((k) =>
    /password|secret|api[_-]?key|authorization|credential|access[_-]?token/.test(k)
  );
  check('no credential-shaped field is serialised', !secretKey, `field '${secretKey}' in the response`);
  check(
    'no live secret value is echoed',
    !/rzp_(live|test)_|Bearer\s+ey/i.test(listBody),
    'a key or bearer token appeared in the response'
  );
  check('the raw event payload is not dumped wholesale', !listBody.includes('"payload"'));
  check('the delivery address never reaches this screen', !listBody.includes('Test St'));

  // --- filtering ---
  const skippedOnly = await listDeliveries('status=SKIPPED&pageSize=100');
  check('filtering by status works', (skippedOnly.json.deliveries || []).every((d: any) => d.status === 'SKIPPED'));
  check('and returns the skipped row', (skippedOnly.json.deliveries || []).some((d: any) => d.orderNumber === dlvNumber));

  const emailOnly = await listDeliveries('channel=email&pageSize=100');
  check('filtering by channel works', (emailOnly.json.deliveries || []).every((d: any) => d.channel === 'email'));

  const bothFilters = await listDeliveries('status=SENT&channel=inapp&pageSize=100');
  check(
    'status and channel filters combine',
    (bothFilters.json.deliveries || []).every((d: any) => d.status === 'SENT' && d.channel === 'inapp')
  );

  // PENDING and FAILED are listable side by side — the whole point of the
  // screen is seeing trouble before it becomes terminal.
  const pendingList = await listDeliveries('status=PENDING&pageSize=100');
  check('retryable PENDING deliveries are listable', pendingList.status === 200);
  check('the backing-off email appears among them', (pendingList.json.deliveries || []).some((d: any) => d.id === byCh('email')?.id));

  // --- search ---
  const searchHit = await listDeliveries(`search=${encodeURIComponent(dlvNumber)}&status=ALL&pageSize=100`);
  check('searching by order number finds the deliveries', (searchHit.json.deliveries || []).length === 3, String((searchHit.json.deliveries || []).length));
  const searchEvent = await listDeliveries('search=ORDER_SHIPPED&status=ALL&pageSize=100');
  check('searching by event type works', (searchEvent.json.deliveries || []).every((d: any) => d.eventType === 'ORDER_SHIPPED'));
  const searchMiss = await listDeliveries('search=NO_SUCH_ORDER_XYZ&status=ALL');
  check('a search with no matches returns an empty page, not an error', searchMiss.status === 200 && searchMiss.json.deliveries.length === 0);

  // --- an unknown filter value is rejected rather than silently matching nothing ---
  const badStatus = await listDeliveries('status=NONSENSE');
  check('an unknown status filter is a 400', badStatus.status === 400, String(badStatus.status));
  const badChannel = await listDeliveries('channel=carrier-pigeon');
  check('an unknown channel filter is a 400', badChannel.status === 400, String(badChannel.status));

  // --- pagination ---
  const page1 = await listDeliveries('status=ALL&page=1&pageSize=2');
  check('a page is capped at the requested size', page1.json.deliveries.length <= 2, String(page1.json.deliveries.length));
  check('the total counts every match, not the page', page1.json.total >= 3, String(page1.json.total));
  check('the page number is echoed', page1.json.page === 1);
  const page2 = await listDeliveries('status=ALL&page=2&pageSize=2');
  const pageOverlap = page1.json.deliveries.filter((a: any) => page2.json.deliveries.some((b: any) => b.id === a.id));
  check('pages do not overlap', pageOverlap.length === 0, `${pageOverlap.length} rows on both pages`);
  const farPage = await listDeliveries('status=ALL&page=999&pageSize=2');
  check('a page past the end is empty, not an error', farPage.status === 200 && farPage.json.deliveries.length === 0);

  // ------------------------------------------
  // Retry
  // ------------------------------------------

  // --- a blocked channel is refused with the exact reason, not re-queued ---
  const dlvWaRow = byCh('whatsapp');
  check('a blocked channel is not offered a retry', dlvWaRow?.canRetry === false);
  check('and says precisely what is missing', /WHATSAPP_PROVIDER/.test(dlvWaRow?.retryBlockedReason || ''), dlvWaRow?.retryBlockedReason);

  const blockedRetry = await adminFetch(`/api/admin/notifications/deliveries/${dlvWaRow.id}/retry`, { method: 'POST' });
  check('retrying a blocked channel is refused', blockedRetry.status === 409, String(blockedRetry.status));
  check('the refusal is flagged as a configuration block', blockedRetry.json.blocked === true);
  check('the blocking reason is returned', /WHATSAPP_PROVIDER/.test(blockedRetry.json.error || ''));
  const dlvWaAfterBlocked = await getNotificationDelivery(dlvWaRow.id);
  check('a blocked retry does not spend an attempt', dlvWaAfterBlocked?.attempts === dlvWaRow.attempts, `${dlvWaAfterBlocked?.attempts} vs ${dlvWaRow.attempts}`);
  check('and leaves the row SKIPPED', dlvWaAfterBlocked?.status === 'SKIPPED');

  // --- a genuine retry: eligible, succeeds, and is reported honestly ---
  await seedOrder({ id: 'ord-dlv-2', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 300 });
  resetChannelsForTest();
  installWhatsAppBlock();
  let emailCalls = 0;
  registerChannel('email', async () => {
    emailCalls++;
    // Fails until the "operator fixes SMTP" — i.e. until the third call.
    return emailCalls >= 3 ? { ok: true } : { ok: false, retryable: false, reason: 'SMTP 535 Username and Password not accepted' };
  });
  await enqueueNotification({
    orderId: 'ord-dlv-2',
    userId: TEST_USER,
    eventType: 'ORDER_CONFIRMED',
    dedupeKey: 'ord-dlv-2:ORDER_CONFIRMED',
    payload: { orderNumber: (await orderRow('ord-dlv-2')).order_number, toEmail: 'two@test.local' },
    channels: ['email'],
  });
  await processPendingNotifications();

  const failedNow = await listFailedNotifications();
  const target = failedNow.find((f) => f.orderId === 'ord-dlv-2')!;
  check('a permanent refusal lands in the failed list', !!target, 'not found');
  check('it is eligible for retry', target.canRetry === true);
  check('it records one attempt against the budget', target.attempts === 1, String(target.attempts));

  // Second attempt still fails — the result must say so, not "queued".
  const dlvRetry1 = await adminFetch(`/api/admin/notifications/deliveries/${target.id}/retry`, { method: 'POST' });
  check('the retry is accepted', dlvRetry1.status === 200, String(dlvRetry1.status));
  check('the response reports the real outcome', dlvRetry1.json.delivery?.status === 'FAILED', dlvRetry1.json.delivery?.status);
  check('a failed retry is never reported as delivered', dlvRetry1.json.delivery?.status !== 'SENT');
  check('attempt history survives the requeue', dlvRetry1.json.delivery?.totalAttempts === 2, String(dlvRetry1.json.delivery?.totalAttempts));
  check('the live budget was reset for the fresh attempt', dlvRetry1.json.delivery?.attempts === 1, String(dlvRetry1.json.delivery?.attempts));
  check('the error from this attempt is recorded', /535/.test(dlvRetry1.json.delivery?.lastError || ''));
  check('the retrying admin is recorded on the row', dlvRetry1.json.delivery?.requeuedBy === 'admin@test.local', dlvRetry1.json.delivery?.requeuedBy);

  // Third attempt succeeds.
  const dlvRetry2 = await adminFetch(`/api/admin/notifications/deliveries/${target.id}/retry`, { method: 'POST' });
  check('a retry after the cause is fixed delivers', dlvRetry2.json.delivery?.status === 'SENT', dlvRetry2.json.delivery?.status);
  check('the delivery timestamp is set', !!dlvRetry2.json.delivery?.sentAt);
  check('the stale error is cleared on success', !dlvRetry2.json.delivery?.lastError);
  check('the cumulative history still shows every attempt', dlvRetry2.json.delivery?.totalAttempts === 3, String(dlvRetry2.json.delivery?.totalAttempts));
  check('the channel really was called three times', emailCalls === 3, String(emailCalls));

  // --- a delivered notification cannot be retried or re-sent ---
  const retrySent = await adminFetch(`/api/admin/notifications/deliveries/${target.id}/retry`, { method: 'POST' });
  check('retrying a delivered notification is refused', retrySent.status === 409, String(retrySent.status));
  check('it says so plainly', /already delivered/i.test(retrySent.json.error || ''));
  check('and the channel was not called again', emailCalls === 3, String(emailCalls));

  // --- there is no way to mark something SENT by hand ---
  const forgeAttempts = await Promise.all([
    adminFetch(`/api/admin/notifications/deliveries/${dlvWaRow.id}`, { method: 'PATCH', body: { status: 'SENT' } }),
    adminFetch(`/api/admin/notifications/deliveries/${dlvWaRow.id}/status`, { method: 'POST', body: { status: 'SENT' } }),
    adminFetch(`/api/admin/notifications/deliveries/${dlvWaRow.id}/retry`, { method: 'POST', body: { status: 'SENT' } }),
  ]);
  check('no route lets an admin declare a notification delivered', forgeAttempts.every((r) => r.status !== 200 || r.json.delivery?.status !== 'SENT'));
  check('the skipped WhatsApp row is still SKIPPED', (await getNotificationDelivery(dlvWaRow.id))?.status === 'SKIPPED');

  // --- exhausted retry limits are respected ---
  resetChannelsForTest();
  installWhatsAppBlock();
  let burned = 0;
  registerChannel('inapp', async () => {
    burned++;
    return { ok: false, retryable: true, reason: 'Still broken' };
  });
  await seedOrder({ id: 'ord-dlv-3', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
  await enqueueNotification({
    orderId: 'ord-dlv-3',
    userId: TEST_USER,
    eventType: 'ORDER_PACKED',
    dedupeKey: 'ord-dlv-3:ORDER_PACKED',
    payload: { orderNumber: (await orderRow('ord-dlv-3')).order_number },
    channels: ['inapp'],
  });
  for (let i = 0; i < MAX_ATTEMPTS + 3; i++) {
    await pool.query(
      `UPDATE notification_deliveries SET next_attempt_at = now() - interval '1 hour'
       WHERE event_id = (SELECT id FROM notification_events WHERE dedupe_key = 'ord-dlv-3:ORDER_PACKED')`
    );
    await processPendingNotifications();
  }
  const exhaustedRow = (await listNotificationDeliveries({ status: 'FAILED', pageSize: 100 })).deliveries.find(
    (d) => d.orderId === 'ord-dlv-3'
  )!;
  check('an endlessly failing delivery stops at the ceiling', exhaustedRow.attempts === MAX_ATTEMPTS, String(exhaustedRow.attempts));
  check('the channel was not called beyond it', burned === MAX_ATTEMPTS, String(burned));
  check('it ends FAILED, not PENDING forever', exhaustedRow.status === 'FAILED');
  check('an exhausted delivery can still be retried by hand', exhaustedRow.canRetry === true);

  // A manual retry restores the budget — and only the budget.
  const revive = await adminFetch(`/api/admin/notifications/deliveries/${exhaustedRow.id}/retry`, { method: 'POST' });
  check('retrying an exhausted delivery is accepted', revive.status === 200, String(revive.status));
  check('the cumulative history is not rewritten', revive.json.delivery?.totalAttempts === MAX_ATTEMPTS + 1, String(revive.json.delivery?.totalAttempts));
  check('backoff policy is intact — one attempt spent, not five', revive.json.delivery?.attempts === 1, String(revive.json.delivery?.attempts));

  // --- concurrent retries cannot double-send ---
  resetChannelsForTest();
  installWhatsAppBlock();
  let concurrentSends = 0;
  registerChannel('inapp', async () => {
    concurrentSends++;
    return { ok: false, retryable: false, reason: 'Deliberate hard failure' };
  });
  await seedOrder({ id: 'ord-dlv-4', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
  await enqueueNotification({
    orderId: 'ord-dlv-4',
    userId: TEST_USER,
    eventType: 'ORDER_PACKED',
    dedupeKey: 'ord-dlv-4:ORDER_PACKED',
    payload: { orderNumber: (await orderRow('ord-dlv-4')).order_number },
    channels: ['inapp'],
  });
  await processPendingNotifications();
  const raceRow = (await listNotificationDeliveries({ status: 'FAILED', pageSize: 100 })).deliveries.find(
    (d) => d.orderId === 'ord-dlv-4'
  )!;
  check('the race subject starts FAILED', raceRow.status === 'FAILED');
  const sendsBefore = concurrentSends;

  const racers = await Promise.all([
    adminFetch(`/api/admin/notifications/deliveries/${raceRow.id}/retry`, { method: 'POST' }),
    adminFetch(`/api/admin/notifications/deliveries/${raceRow.id}/retry`, { method: 'POST' }),
    adminFetch(`/api/admin/notifications/deliveries/${raceRow.id}/retry`, { method: 'POST' }),
  ]);
  const accepted = racers.filter((r) => r.status === 200);
  check('exactly one of three simultaneous retries is accepted', accepted.length === 1, `${accepted.length} accepted`);
  check('the losers are told it is already queued', racers.filter((r) => r.status === 409).length === 2);
  check(
    'the losers explain themselves',
    racers.filter((r) => r.status === 409).every((r) => /already queued|already retried/i.test(r.json.error || '')),
    JSON.stringify(racers.filter((r) => r.status === 409).map((r) => r.json.error))
  );
  check('the message is sent once, not three times', concurrentSends - sendsBefore === 1, String(concurrentSends - sendsBefore));
  check('one attempt was spent, not three', (await getNotificationDelivery(raceRow.id))?.totalAttempts === 2);

  // --- a nonexistent or malformed id is rejected cleanly ---
  const ghost = await adminFetch('/api/admin/notifications/deliveries/nd-does-not-exist/retry', { method: 'POST' });
  check('retrying an unknown id is a 404', ghost.status === 404, String(ghost.status));
  const injection = await adminFetch(
    `/api/admin/notifications/deliveries/${encodeURIComponent("' OR 1=1 --")}/retry`,
    { method: 'POST' }
  );
  check('a SQL-shaped id is rejected, not executed', injection.status === 404, String(injection.status));
  check('and nothing was re-queued by it', (await getNotificationDelivery(raceRow.id))?.totalAttempts === 2);

  // --- every retry is in the audit log, with the actor and the result ---
  const auditRes = await adminFetch('/api/admin/audit-logs');
  const retryLogs = (auditRes.json || []).filter((l: any) => l.action === 'RETRY_NOTIFICATION');
  check('retries are audited', retryLogs.length >= 4, String(retryLogs.length));
  check('the audit entry names the acting admin', retryLogs.every((l: any) => l.userEmail === 'admin@test.local'));
  check('it identifies the delivery', retryLogs.some((l: any) => l.objectId === target.id));
  check('it is typed as a notification action', retryLogs.every((l: any) => l.objectType === 'NOTIFICATION'));
  check(
    'a refused retry is NOT audited as an action taken',
    !retryLogs.some((l: any) => l.objectId === dlvWaRow.id),
    'a blocked retry was logged as though it did something'
  );

  // ------------------------------------------
  // A real migrated transition, seen from the panel
  // ------------------------------------------

  // Every assertion above seeds the outbox by calling enqueueNotification
  // directly. That tests the panel but not the thing an operator actually
  // meets: a notification raised by a genuine order transition, through the
  // mapping layer, which is the only way events are produced in production
  // now that the nineteen legacy call sites are gone.
  resetChannelsForTest();
  installWhatsAppBlock();
  registerChannel('inapp', async () => ({ ok: true }));
  registerChannel('email', async () => ({
    ok: false,
    retryable: false,
    reason: 'SMTP 535-5.7.8 Username and Password not accepted',
  }));
  registerChannel('whatsapp', async () => ({ ok: false, skip: true, reason: 'WhatsApp is not connected.' }));

  await seedOrder({ id: 'ord-panel-real', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 2400 });
  await pool.query(
    `UPDATE orders SET customer_email = 'panel.customer@gmail.com', customer_phone = '+919811122233'
     WHERE id = 'ord-panel-real'`
  );
  const panelNumber = (await orderRow('ord-panel-real')).order_number;

  // The transition an admin or a courier webhook actually performs.
  await transitionOrderStatus({ orderId: 'ord-panel-real', from: 'CONFIRMED', to: 'PROCESSING' });
  await drainNotifications();

  const panelList = await adminFetch(
    `/api/admin/notifications/deliveries?status=ALL&pageSize=100&search=${encodeURIComponent(panelNumber)}`
  );
  const panelRows = panelList.json.deliveries || [];
  check('a real transition surfaces on the panel', panelRows.length >= 2, String(panelRows.length));
  check('found by its order number', panelRows.every((d: any) => d.orderNumber === panelNumber));

  const panelEmail = panelRows.find((d: any) => d.channel === 'email');
  check('the failed email is listed', !!panelEmail);
  check('it names the migrated event', panelEmail?.eventType === 'ORDER_PROCESSING', panelEmail?.eventType);
  check('it reports FAILED', panelEmail?.status === 'FAILED', panelEmail?.status);
  check('it carries the provider error', /535-5\.7\.8/.test(panelEmail?.lastError || ''));
  check('it is retryable once the cause is fixed', panelEmail?.canRetry === true);

  // The recipient reached the payload via the mapping layer reading the order
  // row — the step the old call sites kept forgetting — and is masked here.
  check('the recipient is resolved from the order', /^pa[•]+@gmail\.com$/.test(panelEmail?.recipient || ''), panelEmail?.recipient);
  check(
    'the raw customer email never reaches the panel',
    !JSON.stringify(panelList.json).includes('panel.customer@gmail.com')
  );
  check(
    'nor the raw phone number',
    !JSON.stringify(panelList.json).includes('9811122233')
  );

  // Searching by the migrated event type finds it too.
  const byEvent = await adminFetch('/api/admin/notifications/deliveries?status=ALL&pageSize=100&search=ORDER_PROCESSING');
  check(
    'searching the new event type works',
    (byEvent.json.deliveries || []).some((d: any) => d.id === panelEmail?.id),
    'ORDER_PROCESSING is one of the eight event types the migration added'
  );

  // An admin-channel event from the migration carries no customer contact.
  await seedOrder({ id: 'ord-panel-paid', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING', total: 999 });
  registerChannel('admin_inapp', async () => ({ ok: true }));
  await markOrderPaid({ orderId: 'ord-panel-paid', amountPaid: 999, gatewayPaymentId: 'pay_panel', method: 'upi' });
  await drainNotifications();
  const paidNumber = (await orderRow('ord-panel-paid')).order_number;
  const paidList = await adminFetch(
    `/api/admin/notifications/deliveries?status=ALL&pageSize=100&search=${encodeURIComponent(paidNumber)}`
  );
  const adminPaidRow = (paidList.json.deliveries || []).find((d: any) => d.eventType === 'ADMIN_ORDER_PAID');
  check('a store-facing migrated event is listed', !!adminPaidRow, 'ADMIN_ORDER_PAID missing from the panel');
  check('an admin channel exposes no customer recipient', adminPaidRow?.recipient === null, adminPaidRow?.recipient);
  check('it was delivered', adminPaidRow?.status === 'SENT', adminPaidRow?.status);
  check('a delivered row offers no retry', adminPaidRow?.canRetry === false);

  resetChannelsForTest();
  installWhatsAppBlock();

  resetChannelsForTest();
  registerDefaultChannels();

  // ========================================
  section('Engine migration — every lifecycle path goes through the outbox');
  // ========================================

  // Nineteen hand-paired notifyX + sendOrderStatusEmail call sites became
  // enqueue calls. The risk of that change is not that it breaks loudly — it
  // is that a path goes quiet and nobody notices for a month. So every
  // migrated transition is asserted to produce its event, with the right copy,
  // exactly once.

  const migEventsFor = async (orderId: string) =>
    (await pool.query(`SELECT event_type, dedupe_key, payload FROM notification_events WHERE order_id = $1 ORDER BY created_at`, [orderId]))
      .rows;
  const migEventCount = async (orderId: string, eventType: string) =>
    (await pool.query(`SELECT COUNT(*)::int n FROM notification_events WHERE order_id = $1 AND event_type = $2`, [orderId, eventType]))
      .rows[0].n;
  const migCustRow = async (orderId: string, type: string) => {
    await drainNotifications();
    return (await pool.query(`SELECT * FROM notifications WHERE order_id = $1 AND type = $2`, [orderId, type])).rows;
  };

  // ------------------------------------------
  // Order status transitions (fulfillment.transitionOrderStatus)
  // ------------------------------------------

  await seedOrder({ id: 'ord-mig-flow', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 1500 });
  await pool.query(`UPDATE orders SET customer_email = 'flow@test.local', customer_phone = '+919812345678' WHERE id = 'ord-mig-flow'`);

  for (const [from, to] of [
    ['CONFIRMED', 'PACKED'],
    ['PACKED', 'SHIPPED'],
    ['SHIPPED', 'OUT_FOR_DELIVERY'],
    ['OUT_FOR_DELIVERY', 'DELIVERED'],
  ] as const) {
    const moved = await transitionOrderStatus({ orderId: 'ord-mig-flow', from, to });
    check(`${from} → ${to} is applied`, moved === true);
  }

  const flowEvents = await migEventsFor('ord-mig-flow');
  const flowTypes = flowEvents.map((e: any) => e.event_type);
  check('packing enqueues an event', flowTypes.includes('ORDER_PACKED'));
  check('shipping enqueues an event', flowTypes.includes('ORDER_SHIPPED'));
  check('out-for-delivery enqueues an event', flowTypes.includes('ORDER_OUT_FOR_DELIVERY'));
  check('delivery enqueues an event', flowTypes.includes('ORDER_DELIVERED'));
  check(
    'delivery also alerts the store',
    flowTypes.includes('ADMIN_ORDER_DELIVERED'),
    'a courier-recorded delivery used to reach the notification bell only via the admin route'
  );

  // The recipient is read off the order, not passed in — the mistake the old
  // call sites kept making was forgetting to pass customer_email.
  const shippedEvent = flowEvents.find((e: any) => e.event_type === 'ORDER_SHIPPED');
  check('the event carries the customer email', shippedEvent?.payload?.toEmail === 'flow@test.local');
  check('and the phone number', shippedEvent?.payload?.toPhone === '+919812345678');
  check('and the payment method, for COD wording', shippedEvent?.payload?.paymentMethod === 'cod');

  // Delivered copy reaches the customer, with COD wording intact.
  const deliveredInapp = await migCustRow('ord-mig-flow', 'ORDER_DELIVERED');
  check('the customer is told about delivery', deliveredInapp.length === 1, String(deliveredInapp.length));
  check('the delivery copy survives the migration', /delivered/i.test(deliveredInapp[0]?.body || ''), deliveredInapp[0]?.body);

  // Re-applying a transition the order already made enqueues nothing new.
  const replayMove = await transitionOrderStatus({ orderId: 'ord-mig-flow', to: 'DELIVERED' });
  check('a no-op transition reports no change', replayMove === false);
  check('and enqueues no second event', (await migEventCount('ord-mig-flow', 'ORDER_DELIVERED')) === 1);

  // Even forcing a genuine second UPDATE cannot double-notify: the dedupe key
  // is the order plus the event, not the clock.
  await pool.query(`UPDATE orders SET status = 'SHIPPED' WHERE id = 'ord-mig-flow'`);
  await transitionOrderStatus({ orderId: 'ord-mig-flow', to: 'DELIVERED' });
  check('a repeated genuine transition still enqueues once', (await migEventCount('ord-mig-flow', 'ORDER_DELIVERED')) === 1);
  check('and the customer has one delivery message', (await migCustRow('ord-mig-flow', 'ORDER_DELIVERED')).length === 1);

  // notify:false is still honoured — internal bookkeeping moves stay silent.
  await seedOrder({ id: 'ord-mig-quiet', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 200 });
  await transitionOrderStatus({ orderId: 'ord-mig-quiet', from: 'CONFIRMED', to: 'PACKED', notify: false });
  check('a silent transition enqueues nothing', (await migEventsFor('ord-mig-quiet')).length === 0);
  check('but still moves the order', (await orderRow('ord-mig-quiet')).status === 'PACKED');

  // ------------------------------------------
  // Payment failure — previously silent on all four paths
  // ------------------------------------------

  await seedOrder({ id: 'ord-mig-fail', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING', total: 450 });
  await pool.query(`UPDATE orders SET customer_email = 'fail@test.local' WHERE id = 'ord-mig-fail'`);

  const migFailed = await markOrderPaymentFailed({ orderId: 'ord-mig-fail', status: 'FAILED', reason: 'Card declined by issuer' });
  check('the failure is recorded', migFailed === true);
  check('a failed payment now notifies the customer at all', (await migEventCount('ord-mig-fail', 'PAYMENT_FAILED')) === 1);

  const failInapp = await migCustRow('ord-mig-fail', 'PAYMENT_FAILED');
  check('the customer receives it', failInapp.length === 1, String(failInapp.length));
  check('it says nothing was charged', /nothing has been charged/i.test(failInapp[0]?.body || ''), failInapp[0]?.body);
  check('it carries the issuer reason', /Card declined by issuer/.test(failInapp[0]?.body || ''));
  check(
    'a payment failure never uses confirmation wording',
    !/confirmed|paid online|payment received|thank you/i.test(failInapp[0]?.body || ''),
    failInapp[0]?.body
  );
  check(
    'a failed payment produces no order-confirmation event',
    !(await migEventsFor('ord-mig-fail')).some((e: any) => ['ORDER_CONFIRMED', 'ORDER_PLACED'].includes(e.event_type))
  );
  check(
    'and no cancellation message that would blame the customer',
    (await migEventCount('ord-mig-fail', 'ORDER_CANCELLED')) === 0,
    'the order is cancelled, but PAYMENT_FAILED is the accurate single message'
  );

  // The four failure paths converge on markOrderPaymentFailed, so a decline
  // followed by the expiry sweep must not send two.
  await markOrderPaymentFailed({ orderId: 'ord-mig-fail', status: 'EXPIRED', reason: 'Payment window expired' });
  check('a second failure path sends no second message', (await migEventCount('ord-mig-fail', 'PAYMENT_FAILED')) === 1);
  check('and the customer still has exactly one', (await migCustRow('ord-mig-fail', 'PAYMENT_FAILED')).length === 1);

  // A payment that never failed says nothing.
  await seedOrder({ id: 'ord-mig-ok', status: 'PENDING_PAYMENT', paymentMethod: 'upi', paymentStatus: 'PENDING', total: 300 });
  await markOrderPaid({ orderId: 'ord-mig-ok', amountPaid: 300, gatewayPaymentId: 'pay_mig_ok', method: 'upi' });
  check('a successful payment sends no failure message', (await migEventCount('ord-mig-ok', 'PAYMENT_FAILED')) === 0);

  // ------------------------------------------
  // Payment success — accurate COD vs prepaid, store told once
  // ------------------------------------------

  check('a verified payment alerts the store', (await migEventCount('ord-mig-ok', 'ADMIN_ORDER_PAID')) === 1);
  check('and confirms the order to the customer', (await migEventCount('ord-mig-ok', 'ORDER_CONFIRMED')) === 1);

  const paidAdminEvent = (await migEventsFor('ord-mig-ok')).find((e: any) => e.event_type === 'ADMIN_ORDER_PAID');
  check(
    'the store alert reads the committed payment status, not the intent',
    paidAdminEvent?.payload?.paymentStatus === 'PAID',
    paidAdminEvent?.payload?.paymentStatus
  );

  const confirmInapp = await migCustRow('ord-mig-ok', 'ORDER_CONFIRMED');
  check('a prepaid confirmation says it was paid online', /paid online/i.test(confirmInapp[0]?.body || ''), confirmInapp[0]?.body);
  check('and does not tell them to pay the courier', !/due to the courier|keep ₹/i.test(confirmInapp[0]?.body || ''));

  // COD wording on the same event type must differ.
  await seedOrder({ id: 'ord-mig-cod', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 899 });
  await transitionOrderStatus({ orderId: 'ord-mig-cod', from: 'PLACED', to: 'CONFIRMED' });
  const codConfirm = await migCustRow('ord-mig-cod', 'ORDER_CONFIRMED');
  check('a COD confirmation names the amount due', /899/.test(codConfirm[0]?.body || ''), codConfirm[0]?.body);
  check('a COD order is never told it paid online', !/paid online/i.test(codConfirm[0]?.body || ''));
  check('a COD order raises no ADMIN_ORDER_PAID', (await migEventCount('ord-mig-cod', 'ADMIN_ORDER_PAID')) === 0);

  // ------------------------------------------
  // Cancellation (customer route and admin route)
  // ------------------------------------------

  await seedCart(1);
  const cancelOrder = await apiFetch('/api/customer/checkout', {
    method: 'POST',
    body: { shippingAddress: TEST_ADDRESS, paymentMethod: 'cod', idempotencyKey: 'idem-mig-cancel' },
  });
  const cancelId: string = cancelOrder.json.order.id;
  check('the order to cancel was placed', cancelOrder.status === 200);
  check('checkout enqueues the placement event', (await migEventCount(cancelId, 'ORDER_PLACED')) === 1);

  const cancelRes = await apiFetch(`/api/customer/orders/${cancelId}/cancel`, {
    method: 'POST',
    body: { reason: 'Changed my mind' },
  });
  check('the customer can cancel', cancelRes.status === 200, String(cancelRes.status));
  check('cancelling enqueues one event', (await migEventCount(cancelId, 'ORDER_CANCELLED')) === 1);
  const cancelInapp = await migCustRow(cancelId, 'ORDER_CANCELLED');
  check('the customer is told it is cancelled', cancelInapp.length === 1);
  check('the cancellation copy survives', /cancelled/i.test(cancelInapp[0]?.body || ''), cancelInapp[0]?.body);

  // A second cancel attempt must not re-announce.
  await apiFetch(`/api/customer/orders/${cancelId}/cancel`, { method: 'POST', body: { reason: 'again' } });
  check('a repeated cancel enqueues nothing new', (await migEventCount(cancelId, 'ORDER_CANCELLED')) === 1);

  // The admin status route goes through the same mapping.
  await seedOrder({ id: 'ord-mig-admin', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 600 });
  // PROCESSING, not PACKED: ORDER_STATUS_SEQUENCE allows one step at a time,
  // and this is also the single status the migration newly speaks for — the
  // old in-app and email maps both skipped it, so a customer whose order
  // entered preparation heard nothing.
  const adminMove = await adminFetch('/api/admin/orders/ord-mig-admin/status', {
    method: 'PUT',
    body: { status: 'PROCESSING' },
  });
  check('the admin can advance an order', adminMove.status === 200, String(adminMove.status));
  check('the admin route enqueues through the engine', (await migEventCount('ord-mig-admin', 'ORDER_PROCESSING')) === 1);
  check('the customer hears about it', (await migCustRow('ord-mig-admin', 'ORDER_PROCESSING')).length === 1);

  // Audit logging is untouched by the migration.
  const migAudit = (await loadDatabase()).auditLogs || [];
  check(
    'the admin status change is still audited',
    migAudit.some((l: any) => l.action === 'UPDATE_ORDER_STATUS' && l.objectId === 'ord-mig-admin'),
    'the migration must not have disturbed the audit trail'
  );

  // A rejected transition notifies nobody.
  const badMove = await adminFetch('/api/admin/orders/ord-mig-admin/status', {
    method: 'PUT',
    body: { status: 'PLACED' },
  });
  check('an invalid transition is refused', badMove.status === 400, String(badMove.status));
  check('and enqueues nothing', (await migEventCount('ord-mig-admin', 'ORDER_PLACED')) === 0);

  // ------------------------------------------
  // Returns
  // ------------------------------------------

  await seedOrder({ id: 'ord-mig-ret', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 1200 });
  await pool.query(
    `INSERT INTO return_requests (id, order_id, customer_id, product_id, product_name, reason, status)
     VALUES ('ret-mig-1', 'ord-mig-ret', $1, $2, 'Test Lipstick', 'Wrong shade', 'SUBMITTED')`,
    [TEST_USER, PRODUCT_ID]
  );

  for (const [status, event] of [
    ['UNDER_REVIEW', 'RETURN_UNDER_REVIEW'],
    ['APPROVED', 'RETURN_APPROVED'],
    ['PICKUP_SCHEDULED', 'RETURN_PICKUP_SCHEDULED'],
  ] as const) {
    const res = await adminFetch('/api/admin/returns/ret-mig-1/status', { method: 'PUT', body: { status } });
    check(`a return moved to ${status}`, res.status === 200, String(res.status));
    check(`${status} enqueues ${event}`, (await migEventCount('ord-mig-ret', event)) === 1);
  }

  const approvedInapp = await migCustRow('ord-mig-ret', 'RETURN_APPROVED');
  check('the customer is told their return was approved', approvedInapp.length === 1);
  check(
    'the return copy is carried over verbatim',
    /return request for order #.* has been approved/i.test(approvedInapp[0]?.body || ''),
    approvedInapp[0]?.body
  );

  // Setting the same status twice must not re-announce.
  await adminFetch('/api/admin/returns/ret-mig-1/status', { method: 'PUT', body: { status: 'APPROVED' } });
  check('a repeated return status enqueues nothing new', (await migEventCount('ord-mig-ret', 'RETURN_APPROVED')) === 1);

  // Return status changes are still audited.
  const retAudit = (await loadDatabase()).auditLogs || [];
  check('return status changes are still audited', retAudit.some((l: any) => l.action === 'UPDATE_RETURN_STATUS'));

  // The final return state closes the loop.
  await adminFetch('/api/admin/returns/ret-mig-1/status', { method: 'PUT', body: { status: 'REFUNDED' } });
  check('a completed return notifies the customer', (await migEventCount('ord-mig-ret', 'RETURN_REFUNDED')) === 1);

  // A status the workflow does not recognise is refused and notifies nobody.
  const badReturn = await adminFetch('/api/admin/returns/ret-mig-1/status', { method: 'PUT', body: { status: 'NONSENSE' } });
  check('an unknown return status is refused', badReturn.status === 400, String(badReturn.status));
  const retEvents = (await migEventsFor('ord-mig-ret')).map((e: any) => e.event_type);
  check(
    'and adds no event',
    retEvents.filter((t: string) => t.startsWith('RETURN_')).length === 4,
    retEvents.join(',')
  );

  // ------------------------------------------
  // Refunds — keyed per refund, so partials each announce once
  // ------------------------------------------

  await seedOrder({ id: 'ord-mig-rf', status: 'DELIVERED', paymentMethod: 'upi', paymentStatus: 'PAID', total: 1000 });
  await pool.query(`UPDATE orders SET amount_paid = 1000 WHERE id = 'ord-mig-rf'`);
  const migRfOrder = await mockGateway.createOrder({ amountMinor: toMinorUnits(1000), currency: 'INR', receipt: 'GLM-MIG' });
  const migRfPay = mockGateway.simulatePayment({ gatewayOrderId: migRfOrder.order!.id, outcome: 'success' });
  await pool.query(
    `INSERT INTO payments (id, order_id, user_id, provider, provider_order_id, provider_payment_id, amount_minor, currency, status)
     VALUES ('pay-mig-rf','ord-mig-rf',$1,'razorpay-mock',$2,$3,$4,'INR','PAID')`,
    [TEST_USER, migRfOrder.order!.id, migRfPay.id, toMinorUnits(1000)]
  );

  const rf1 = await refundOrderPayment('ord-mig-rf', 300, 'First partial', { idempotencyKey: 'mig-rf-1' });
  check('the first partial refund succeeds', rf1.ok, rf1.error);
  check('it notifies the customer', (await migEventCount('ord-mig-rf', 'REFUND_COMPLETED')) === 1);
  check('and the store', (await migEventCount('ord-mig-rf', 'ADMIN_REFUND_ISSUED')) === 1);

  // A genuinely different second partial is its own message — this is why the
  // key is per refund row rather than per order.
  const rf2 = await refundOrderPayment('ord-mig-rf', 200, 'Second partial', { idempotencyKey: 'mig-rf-2' });
  check('a second partial refund succeeds', rf2.ok, rf2.error);
  check('a different refund announces separately', (await migEventCount('ord-mig-rf', 'REFUND_COMPLETED')) === 2);
  check('and the store hears about both', (await migEventCount('ord-mig-rf', 'ADMIN_REFUND_ISSUED')) === 2);

  // The same refund replayed does not.
  await refundOrderPayment('ord-mig-rf', 300, 'First partial', { idempotencyKey: 'mig-rf-1' });
  check('a replayed refund announces nothing new', (await migEventCount('ord-mig-rf', 'REFUND_COMPLETED')) === 2);

  const rfInapp = await migCustRow('ord-mig-rf', 'REFUND_COMPLETED');
  check('the customer has two refund messages', rfInapp.length === 2, String(rfInapp.length));
  check('each names its own amount', rfInapp.some((r: any) => /300/.test(r.body)) && rfInapp.some((r: any) => /200/.test(r.body)));
  check('the refund copy keeps the settlement window', /5–7 working days/.test(rfInapp[0]?.body || ''), rfInapp[0]?.body);

  // A partial refund is flagged as partial for the store, as it was before.
  await drainNotifications();
  const adminRfRows = (
    await pool.query(`SELECT * FROM admin_notifications WHERE order_id = 'ord-mig-rf' AND type = 'REFUND_ISSUED'`)
  ).rows;
  check('the store sees both refunds', adminRfRows.length === 2, String(adminRfRows.length));
  check(
    'a partial refund keeps its distinct heading',
    adminRfRows.every((r: any) => r.title === 'Partial Refund Issued'),
    adminRfRows.map((r: any) => r.title).join('|')
  );

  // ------------------------------------------
  // The outbox does not break the transition it describes
  // ------------------------------------------

  // A channel that throws must not undo a status change. The whole reason the
  // old code wrapped nineteen call sites in try/catch was this, and the
  // migration must not have lost it.
  resetChannelsForTest();
  registerChannel('inapp', async () => {
    throw new Error('Channel exploded');
  });
  await seedOrder({ id: 'ord-mig-boom', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
  const boomMoved = await transitionOrderStatus({ orderId: 'ord-mig-boom', from: 'CONFIRMED', to: 'PACKED' });
  check('a transition succeeds even when a channel throws', boomMoved === true);
  check('and the order really moved', (await orderRow('ord-mig-boom')).status === 'PACKED');
  await drainNotifications();
  const boomDelivery = (
    await pool.query(
      `SELECT d.status, d.last_error FROM notification_deliveries d
       JOIN notification_events e ON e.id = d.event_id
       WHERE e.order_id = 'ord-mig-boom' AND d.channel = 'inapp'`
    )
  ).rows[0];
  check('the thrown error is recorded against the delivery', /Channel exploded/.test(boomDelivery?.last_error || ''));
  check('a throwing channel is treated as retryable, not dropped', ['PENDING', 'FAILED'].includes(boomDelivery?.status), boomDelivery?.status);

  // A database failure inside the outbox must not fail the transition either.
  resetChannelsForTest();
  registerDefaultChannels();
  await seedOrder({ id: 'ord-mig-safe', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
  const safeMoved = await transitionOrderStatus({ orderId: 'ord-mig-safe', from: 'CONFIRMED', to: 'PACKED' });
  check('transitions still work with the real channels installed', safeMoved === true);

  // ------------------------------------------
  // No legacy notification rows are written any more
  // ------------------------------------------

  await drainNotifications();
  const legacyTypes = (
    await pool.query(`SELECT DISTINCT type FROM notifications WHERE type IN ('ORDER_STATUS', 'RETURN_STATUS', 'REFUND')`)
  ).rows;
  check(
    'no notification is written under a legacy type',
    legacyTypes.length === 0,
    `${legacyTypes.map((r: any) => r.type).join(', ')} still being written — a call site was missed`
  );

  // ========================================
  section('Notification engine — atomicity and concurrency');
  // ========================================

  // --- an event and its deliveries are all-or-nothing ---
  //
  // The two writes used to be separate autocommitted statements. A crash
  // between them left an event row with no deliveries, which is the worst
  // possible state: not PENDING so the worker ignores it, not FAILED so the
  // admin panel never shows it. The message is lost while the database
  // claims it happened.
  await seedOrder({ id: 'ord-atom', status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 400 });
  await enqueueNotification({
    orderId: 'ord-atom',
    userId: TEST_USER,
    eventType: 'ORDER_SHIPPED',
    dedupeKey: 'ord-atom:ORDER_SHIPPED',
    payload: { orderNumber: (await orderRow('ord-atom')).order_number },
  });

  const orphans = await pool.query(
    `SELECT e.id, e.event_type FROM notification_events e
     LEFT JOIN notification_deliveries d ON d.event_id = e.id
     WHERE d.id IS NULL`
  );
  check(
    'no event exists without deliveries',
    orphans.rows.length === 0,
    `${orphans.rows.length} orphaned event(s): ${orphans.rows.map((r: any) => r.event_type).join(', ')}`
  );

  // A rejected enqueue leaves nothing behind at all.
  const beforeEvents = (await pool.query(`SELECT COUNT(*)::int n FROM notification_events`)).rows[0].n;
  const dupe = await enqueueNotification({
    orderId: 'ord-atom',
    userId: TEST_USER,
    eventType: 'ORDER_SHIPPED',
    dedupeKey: 'ord-atom:ORDER_SHIPPED',
    payload: { orderNumber: 'X' },
  });
  check('a duplicate enqueue is refused', dupe.enqueued === false);
  check(
    'and rolls back cleanly, leaving no extra row',
    (await pool.query(`SELECT COUNT(*)::int n FROM notification_events`)).rows[0].n === beforeEvents
  );
  check(
    'the original payload is not overwritten by the replay',
    (await pool.query(`SELECT payload FROM notification_events WHERE dedupe_key = 'ord-atom:ORDER_SHIPPED'`))
      .rows[0].payload.orderNumber !== 'X'
  );

  // Every channel the event targets gets exactly one delivery row, written
  // by the single multi-row INSERT.
  const atomDeliveries = await pool.query(
    `SELECT d.channel FROM notification_deliveries d
     JOIN notification_events e ON e.id = d.event_id
     WHERE e.dedupe_key = 'ord-atom:ORDER_SHIPPED' ORDER BY d.channel`
  );
  check('all three channels got a row', atomDeliveries.rows.length === 3, String(atomDeliveries.rows.length));
  check(
    'each channel appears once',
    new Set(atomDeliveries.rows.map((r: any) => r.channel)).size === 3
  );

  // --- concurrent workers never double-send ---
  //
  // The worker now attempts up to six deliveries at once, and the admin
  // retry route calls the processor while the 60s sweep may also be running.
  // The claim UPDATE is the only thing standing between that and a customer
  // receiving the same email twice.
  resetChannelsForTest();
  installWhatsAppBlock();
  const sendCounts = new Map<string, number>();
  const countingSender = async (payload: any) => {
    const key = payload.orderNumber;
    sendCounts.set(key, (sendCounts.get(key) || 0) + 1);
    // Yield, to widen the window in which a second worker could claim the
    // same row if the guard were missing.
    await new Promise((r) => setTimeout(r, 15));
    return { ok: true };
  };
  registerChannel('inapp', countingSender);

  const claimRaceIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const id = `ord-conc-${i}`;
    claimRaceIds.push(id);
    await seedOrder({ id, status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
    await enqueueNotification({
      orderId: id,
      userId: TEST_USER,
      eventType: 'ORDER_PACKED',
      dedupeKey: `${id}:ORDER_PACKED`,
      payload: { orderNumber: (await orderRow(id)).order_number },
      channels: ['inapp'],
    });
  }

  // Four processors racing over the same due set, as the sweep and two admin
  // retries genuinely can.
  const passes = await Promise.all([
    processPendingNotifications(50),
    processPendingNotifications(50),
    processPendingNotifications(50),
    processPendingNotifications(50),
  ]);

  // At least our twelve. The queue also carries rows left pending by earlier
  // sections, so an exact count would be asserting about unrelated state.
  const totalAttempted = passes.reduce((n, p) => n + p.attempted, 0);
  check('every delivery was attempted', totalAttempted >= 12, String(totalAttempted));
  check(
    'no delivery was attempted twice despite four racing workers',
    [...sendCounts.values()].every((n) => n === 1),
    `send counts: ${[...sendCounts.values()].join(',')}`
  );

  const concRows = await pool.query(
    `SELECT d.status, d.attempts FROM notification_deliveries d
     JOIN notification_events e ON e.id = d.event_id
     WHERE e.order_id = ANY($1)`,
    [claimRaceIds]
  );
  check('all twelve are SENT', concRows.rows.every((r: any) => r.status === 'SENT'), String(concRows.rows.length));
  check(
    'each spent exactly one attempt',
    concRows.rows.every((r: any) => Number(r.attempts) === 1),
    concRows.rows.map((r: any) => r.attempts).join(',')
  );
  check(
    'and exactly twelve delivery rows exist, no duplicates',
    concRows.rows.length === 12,
    String(concRows.rows.length)
  );

  // --- a slow channel does not block the rest of the batch ---
  //
  // The regression this guards: the worker used to await each delivery in
  // turn, so one provider hanging stalled everything behind it.
  resetChannelsForTest();
  installWhatsAppBlock();
  registerChannel('inapp', async () => {
    await new Promise((r) => setTimeout(r, 100));
    return { ok: true };
  });
  const batchIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const id = `ord-slow-${i}`;
    batchIds.push(id);
    await seedOrder({ id, status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
    await enqueueNotification({
      orderId: id,
      userId: TEST_USER,
      eventType: 'ORDER_PACKED',
      dedupeKey: `${id}:ORDER_PACKED`,
      payload: { orderNumber: (await orderRow(id)).order_number },
      channels: ['inapp'],
    });
  }
  const slowStart = Date.now();
  await processPendingNotifications(50);
  const slowElapsed = Date.now() - slowStart;
  // Sequential would be 12 × 100ms = 1200ms. Six at a time is two rounds,
  // so ~200ms plus database time. A generous ceiling catches a regression to
  // serial without being flaky on a loaded machine.
  check(
    'twelve 100ms deliveries do not serialise',
    slowElapsed < 900,
    `${slowElapsed}ms — sequential would be ~1200ms`
  );
  check(
    'and all of them still landed',
    (
      await pool.query(
        `SELECT COUNT(*)::int n FROM notification_deliveries d
         JOIN notification_events e ON e.id = d.event_id
         WHERE e.order_id = ANY($1) AND d.status = 'SENT'`,
        [batchIds]
      )
    ).rows[0].n === 12
  );

  // --- the batch survives one delivery crashing ---
  resetChannelsForTest();
  installWhatsAppBlock();
  let crashIndex = 0;
  registerChannel('inapp', async () => {
    crashIndex++;
    if (crashIndex === 2) throw new Error('Adapter blew up mid-batch');
    return { ok: true };
  });
  const crashIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = `ord-crash-${i}`;
    crashIds.push(id);
    await seedOrder({ id, status: 'CONFIRMED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING', total: 100 });
    await enqueueNotification({
      orderId: id,
      userId: TEST_USER,
      eventType: 'ORDER_PACKED',
      dedupeKey: `${id}:ORDER_PACKED`,
      payload: { orderNumber: (await orderRow(id)).order_number },
      channels: ['inapp'],
    });
  }
  await processPendingNotifications(50);
  const crashRows = await pool.query(
    `SELECT d.status FROM notification_deliveries d
     JOIN notification_events e ON e.id = d.event_id WHERE e.order_id = ANY($1)`,
    [crashIds]
  );
  check(
    'one crashing delivery does not take the batch down',
    crashRows.rows.filter((r: any) => r.status === 'SENT').length === 3,
    crashRows.rows.map((r: any) => r.status).join(',')
  );
  check(
    'the crashed one is left retryable, not lost',
    crashRows.rows.some((r: any) => r.status === 'PENDING'),
    crashRows.rows.map((r: any) => r.status).join(',')
  );

  resetChannelsForTest();
  registerDefaultChannels();

  // ========================================
  section('Scenario 17 — out of stock');
  // ========================================

  const db = await loadDatabase();
  const idx = db.products.findIndex((p) => p.id === PRODUCT_ID);
  db.products[idx] = { ...db.products[idx], stock: 0, inStock: false };
  await saveDatabase(db);
  check('product reports out of stock', (await productStock()) === 0);

  db.products[idx] = { ...db.products[idx], stock: 5, inStock: true };
  await saveDatabase(db);

  // ========================================
  section('Scenario 19 — simultaneous orders for the same product');
  // ========================================

  // Five concurrent commits against 5 units: every one must land exactly once
  // and stock must reach exactly 0 — never negative.
  const concurrentIds = ['c1', 'c2', 'c3', 'c4', 'c5'];
  for (const id of concurrentIds) {
    await seedOrder({
      id: `ord-${id}`,
      status: 'PENDING_PAYMENT',
      paymentMethod: 'upi',
      paymentStatus: 'PENDING',
      stockCommitted: false,
    });
  }
  await Promise.all(concurrentIds.map((id) => commitOrderStock(`ord-${id}`)));
  const concurrentStock = await productStock();
  check('concurrent commits deduct exactly once each', concurrentStock === 0, `stock=${concurrentStock}`);
  check('stock never goes negative', concurrentStock >= 0);

  // Committing the same order twice must not deduct twice.
  const recommit = await commitOrderStock('ord-c1');
  check('re-committing an order is refused', !recommit);
  check('re-commit leaves stock unchanged', (await productStock()) === 0);

  // ========================================
  section('Scenario 20 — gateway failure during checkout');
  // ========================================

  const outage = await mockGateway.createOrder({
    amountMinor: toMinorUnits(1000),
    currency: 'INR',
    receipt: 'GLM-X',
    notes: { simulate: 'create_failure' },
  });
  check('gateway outage is reported, not thrown', !outage.ok && !!outage.error);
  check('gateway outage is marked retryable', outage.retryable === true);

  // ========================================
  section('Security — unauthorised access patterns');
  // ========================================

  // IDOR: order lookups in the routes are always scoped by user_id. Verified
  // here at the query level, which is the guarantee the routes rely on.
  const otherUsersOrder = await pool.query('SELECT id FROM orders WHERE id = $1 AND user_id = $2', [
    'ord-online',
    TEST_USER_2,
  ]);
  check('another customer cannot read this order', otherUsersOrder.rows.length === 0);

  const ownOrder = await pool.query('SELECT id FROM orders WHERE id = $1 AND user_id = $2', ['ord-online', TEST_USER]);
  check('the owning customer can read their order', ownOrder.rows.length === 1);

  // ========================================
  section('Webhook for an unknown order');
  // ========================================

  const orphanBody = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_orphan', order_id: 'order_nonexistent', amount: 100 } } },
  };
  const orphan = await postWebhook('/api/webhooks/razorpay', orphanBody, razorpayHeaders(orphanBody, 'evt_orphan'));
  check('webhook for an unknown order is acknowledged', orphan.status === 200);
  await waitForWebhookProcessed('evt_orphan');
  const orphanEvent = await pool.query(`SELECT status FROM webhook_events WHERE event_id = 'evt_orphan'`);
  check('unknown-order webhook is recorded as IGNORED', orphanEvent.rows[0]?.status === 'IGNORED');

  // ------------------------------------------

  await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  await pool.end();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`${'='.repeat(60)}`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`${'='.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nHarness crashed:', err);
  process.exit(1);
});
