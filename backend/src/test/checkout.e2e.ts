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
process.env.SHIPROCKET_WEBHOOK_SECRET = WEBHOOK_KEY;

import crypto from 'crypto';
import express from 'express';
import { createServer, Server } from 'http';
import { pool, loadDatabase, saveDatabase, ensureSchema } from '../db/db';
import {
  mockGateway,
  verifyPaymentSignature,
  signPaymentForMock,
  signWebhookForMock,
  verifyWebhookSignature,
  toMinorUnits,
  fromMinorUnits,
} from '../services/payment.service';
import { mockShippingProvider, selectCourier, mapShiprocketStatus } from '../services/shiprocket.service';
import {
  markOrderPaid,
  markOrderPaymentFailed,
  commitOrderStock,
  restoreOrderStock,
  createShipmentForOrder,
  applyShippingStatus,
  cancelShipmentForOrder,
  refundOrderPayment,
  recordRefund,
} from '../services/fulfillment.service';
import { isValidStatusTransition } from '../services/orders.service';
import { ensureProductInventory } from '../services/inventory.service';
import webhooksRouter from '../routes/webhooks.routes';

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
      stock: 10,
      inStock: true,
      images: { primary: 'x.jpg', secondary: 'y.jpg' },
      benefits: [],
      category: 'Lips',
    } as any,
  ];
  await saveDatabase(db);

  // Provision SQL inventory for the seeded product, exactly as admin product
  // creation now does. Without this the suite would pass in legacy mode and
  // fail in SQL mode for a reason that is a fixture gap rather than a defect.
  await pool.query('DELETE FROM inventory_transactions');
  await pool.query('DELETE FROM inventory_reservations');
  await pool.query('DELETE FROM inventory');
  await ensureProductInventory(db.products[0] as any);

  mockGateway.reset();
  mockShippingProvider.reset();
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
  webhookServer = createServer(app);
  await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', resolve));
  webhookPort = (webhookServer.address() as any).port;
}

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

/** Shiprocket sends no event id, so the handler derives one. Mirrored here so
 * the test can wait on the right row. */
function shiprocketEventId(awb: string, statusText: string, timestamp: string): string {
  return `${awb}:${statusText}:${timestamp}`;
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

  check(
    'courier selection takes the cheapest',
    selectCourier([
      { courierCompanyId: 'a', courierName: 'A', rate: 90 },
      { courierCompanyId: 'b', courierName: 'B', rate: 60 },
    ])?.courierCompanyId === 'b'
  );
  check(
    'courier tie is broken by rating',
    selectCourier([
      { courierCompanyId: 'a', courierName: 'A', rate: 60, rating: 3.0 },
      { courierCompanyId: 'b', courierName: 'B', rate: 60, rating: 4.7 },
    ])?.courierCompanyId === 'b'
  );
  check('no serviceable courier returns null', selectCourier([]) === null);
  check('shiprocket code 7 maps to DELIVERED', mapShiprocketStatus(7) === 'DELIVERED');
  check('unknown shiprocket code does not invent a terminal state', mapShiprocketStatus(9999) === 'IN_TRANSIT');

  // ========================================
  section('Scenario 5 — COD order');
  // ========================================

  await seedOrder({ id: 'ord-cod', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  const codRow = await orderRow('ord-cod');
  check('COD order is created unpaid', codRow.payment_status === 'COD_PENDING');
  check('COD order holds no collected amount', Number(codRow.amount_paid) === 0);

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
  check('shiprocket order id is stored', !!shipmentRow?.provider_order_id);
  check('shipment id is stored', !!shipmentRow?.provider_shipment_id);
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
  check('pickup was requested as part of booking', !!shipmentRow?.pickup_requested_at);
  check('invoice url is stored', !!shipmentRow?.invoice_url);

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

  // ========================================
  section('Scenarios 11-13 — shipping webhooks through to delivery');
  // ========================================

  const awb = shipmentRow.awb_code;
  const scan = (status: string, code: number, ts: string) => ({
    awb,
    current_status: status,
    current_status_id: code,
    current_timestamp: ts,
    courier_name: 'Mock Express',
  });

  const pickedBody = scan('Picked Up', 3, '2026-01-01T10:00:00Z');
  const picked = await postWebhook('/api/webhooks/shiprocket', pickedBody, { 'x-api-key': WEBHOOK_KEY });
  check('shipping webhook is accepted', picked.status === 200);
  await waitForWebhookProcessed(shiprocketEventId(awb, 'Picked Up', '2026-01-01T10:00:00Z'));
  check('pickup advances the order to SHIPPED', (await orderRow('ord-online')).status === 'SHIPPED');

  const oodBody = scan('Out For Delivery', 17, '2026-01-02T09:00:00Z');
  await postWebhook('/api/webhooks/shiprocket', oodBody, { 'x-api-key': WEBHOOK_KEY });
  await waitForWebhookProcessed(shiprocketEventId(awb, 'Out For Delivery', '2026-01-02T09:00:00Z'));
  const oodRow = await orderRow('ord-online');
  check('out-for-delivery scan updates shipping status', oodRow.shipping_status === 'OUT_FOR_DELIVERY');
  check('out-for-delivery scan updates order status', oodRow.status === 'OUT_FOR_DELIVERY');

  const deliveredBody = scan('Delivered', 7, '2026-01-03T14:00:00Z');
  await postWebhook('/api/webhooks/shiprocket', deliveredBody, { 'x-api-key': WEBHOOK_KEY });
  await waitForWebhookProcessed(shiprocketEventId(awb, 'Delivered', '2026-01-03T14:00:00Z'));
  const deliveredRow = await orderRow('ord-online');
  check('delivery scan marks the order DELIVERED', deliveredRow.status === 'DELIVERED');
  check('delivery scan sets shipping status', deliveredRow.shipping_status === 'DELIVERED');

  // A late out-of-order scan must not un-deliver the order.
  await postWebhook('/api/webhooks/shiprocket', scan('In Transit', 6, '2026-01-04T00:00:00Z'), {
    'x-api-key': WEBHOOK_KEY,
  });
  await waitForWebhookProcessed(shiprocketEventId(awb, 'In Transit', '2026-01-04T00:00:00Z'));
  check('a late in-transit scan cannot un-deliver the order', (await orderRow('ord-online')).status === 'DELIVERED');

  const badKey = await postWebhook('/api/webhooks/shiprocket', pickedBody, { 'x-api-key': 'wrong' });
  check('shipping webhook with a bad key is rejected', badKey.status === 401);

  // COD collected on delivery.
  await seedOrder({ id: 'ord-cod-deliver', status: 'SHIPPED', paymentMethod: 'cod', paymentStatus: 'COD_PENDING' });
  await applyShippingStatus({ orderId: 'ord-cod-deliver', status: 'DELIVERED' });
  const codDelivered = await orderRow('ord-cod-deliver');
  check('COD order is marked paid on delivery', codDelivered.payment_status === 'PAID');
  check('COD collected amount equals the total', Number(codDelivered.amount_paid) === Number(codDelivered.total));

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
     VALUES ('shp-rto','ord-rto','shiprocket-mock','IN_TRANSIT','AWBRTO1',true)`
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
