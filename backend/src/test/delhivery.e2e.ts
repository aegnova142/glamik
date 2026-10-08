/**
 * Delhivery B2C integration checks.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55470/glamirk_test \
 *     npx tsx src/test/delhivery.e2e.ts
 *
 * NO REAL DELHIVERY CALL IS EVER MADE. Two independent guarantees:
 *
 *   1. The live adapter's transport is replaced with a scripted double via
 *      __setDelhiveryTransportForTests, so even the live code path cannot
 *      reach the network.
 *   2. The flow tests run against the mock adapter.
 *
 * That matters more here than for a payment gateway: a stray live call would
 * draw a real waybill out of the client's pool, create a real parcel, or book
 * a real van that somebody has to cancel.
 */

// Pinned before any import — mailer.ts will not open an SMTP connection under
// NODE_ENV=test. See checkout.e2e.ts for why that matters.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

// Production's inventory configuration, so the delivery path's stock effects
// are exercised in the mode production actually runs in.
process.env.INVENTORY_SQL_MODE = 'false';
process.env.INVENTORY_MIRROR_LEGACY = 'true';

// Pinned before any import reads them. dotenv does not override an already-set
// variable, so these win over the repo-root .env — otherwise the suite's
// verdict would depend on whether the developer running it happens to have
// real Delhivery credentials configured.
const TEST_WEBHOOK_SECRET = 'test-delhivery-secret-do-not-use-anywhere-real';
process.env.DELHIVERY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.DELHIVERY_PICKUP_NAME = 'Test Warehouse';
process.env.DELHIVERY_LIVE_MODE = 'false';

import express from 'express';
import { createServer, Server } from 'http';
import { pool, loadDatabase, saveDatabase, ensureSchema } from '../db/db';
import {
  mockDelhiveryProvider,
  getShipmentProvider,
  mapDelhiveryStatus,
  parseDelhiveryDate,
  parseDelhiveryScanPush,
  verifyDelhiveryWebhook,
  delhiveryScanKey,
  delhiveryStatusKey,
  scrubDelhiverySecrets,
  outcomeIsAmbiguous,
  pickEditableShipmentFields,
  __setDelhiveryTransportForTests,
} from '../services/couriers/delhivery.service';
import {
  emailDeliveryEnabled,
  getMailTransporter,
  __getSentTestEmails,
  __resetMailTransportForTests,
} from '../services/mailer';
import { sendOrderStatusEmail } from '../services/email.service';
import { resolveDelhiveryBaseUrl, DELHIVERY_DEFAULT_BASE_URL } from '../config/env';
import {
  createShipmentForOrder,
  ensureWarehousePickup,
  ensureShipmentLabel,
  commitOrderStock,
  applyShippingStatus,
  shipmentsEnabled,
} from '../services/fulfillment.service';
import { httpJson } from '../services/http.client';
import { ensureProductInventory } from '../services/inventory.service';
import webhooksRouter from '../routes/webhooks.routes';

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
const section = (t: string) => console.log(`\n${t}`);

/**
 * A scripted stand-in for httpJson. Routes match by substring of the URL.
 *
 * `attempts` is recorded because this double REPLACES httpJson, retry loop
 * included — so a route is called once however many attempts were requested.
 * Asserting on call count therefore proves nothing about retry behaviour; the
 * only observable fact is what the adapter asked for, which is this field.
 */
interface FakeCall { url: string; method: string; body: any; headers: Record<string, string>; attempts?: number }
function makeTransport(routes: { match: string; respond: (call: FakeCall) => any }[]) {
  const calls: FakeCall[] = [];
  const transport = (async (requestUrl: string, options: any = {}) => {
    calls.push({ url: requestUrl, method: options.method || 'GET', body: options.body, headers: options.headers || {}, attempts: options.attempts });
    const route = routes.find((r) => requestUrl.includes(r.match));
    if (!route) return { ok: false, status: 404, error: `No fake route for ${requestUrl}` };
    return route.respond(calls[calls.length - 1]);
  }) as any;
  return { transport, calls };
}

const TEST_USER = 'dlv-user-1';
const PRODUCT_ID = 'dlv-product-1';
let webhookServer: Server;
let webhookPort = 0;

async function resetDatabase(): Promise<void> {
  await ensureSchema();
  await pool.query('DELETE FROM shipment_tracking_events');
  await pool.query('DELETE FROM shipment_pickup_requests');
  await pool.query('DELETE FROM webhook_events');
  await pool.query('DELETE FROM shipments');
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM order_status_history');
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM customers');
  await pool.query(`INSERT INTO customers (id, name, email, password_hash) VALUES ($1,'DLV Tester','dlv@test.local','x')`, [TEST_USER]);

  const db = await loadDatabase();
  db.products = [{
    id: PRODUCT_ID, name: 'Test Serum', price: 500, stock: 50, inStock: true,
    images: { primary: 'x.jpg', secondary: 'y.jpg' }, benefits: [], category: 'Skin',
  } as any];
  await saveDatabase(db);

  await pool.query('DELETE FROM inventory_transactions');
  await pool.query('DELETE FROM inventory_reservations');
  await pool.query('DELETE FROM inventory');
  await ensureProductInventory(db.products[0] as any);

  mockDelhiveryProvider.reset();
}

async function seedOrder(input: { id: string; orderNumber: string; paymentMethod?: 'cod' | 'card'; paymentStatus?: string; pinCode?: string; quantity?: number }): Promise<void> {
  await pool.query(
    `INSERT INTO orders (id, user_id, order_number, status, subtotal, discount, shipping, total,
                         shipping_address, payment_method, payment_status, stock_committed, stock_restored,
                         customer_name, customer_phone, customer_email)
     VALUES ($1,$2,$3,'PLACED',500,0,0,500,$4::jsonb,$5,$6,false,false,'DLV Tester','9000000000','dlv@test.local')`,
    [input.id, TEST_USER, input.orderNumber,
     JSON.stringify({ name: 'DLV Tester', phone: '9000000000', addressLine1: '1 Test Road', city: 'Jaipur', state: 'RJ', pinCode: input.pinCode || '302020' }),
     input.paymentMethod || 'cod', input.paymentStatus || 'COD_PENDING']
  );
  await pool.query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price) VALUES ($1,$2,$3,'Test Serum',$4,500)`,
    [`oi-${input.id}`, input.id, PRODUCT_ID, input.quantity ?? 1]
  );
}

async function startWebhookServer(): Promise<void> {
  const app = express();
  app.use('/api', webhooksRouter);
  app.use(express.json());
  webhookServer = createServer(app);
  await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', resolve));
  webhookPort = (webhookServer.address() as any).port;
}

async function postWebhook(body: unknown, headers: Record<string, string> = { 'x-api-key': TEST_WEBHOOK_SECRET }): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${webhookPort}/api/webhooks/delhivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Polls the ledger instead of sleeping: the endpoint acknowledges before the
 * work finishes, and a fixed delay races it under load. */
async function settle(timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await pool.query(`SELECT COUNT(*)::int n FROM webhook_events WHERE status = 'RECEIVED'`);
    if (res.rows[0].n === 0) return;
    if (Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

function scanPush(overrides: Record<string, unknown> = {}, statusOverrides: Record<string, unknown> = {}) {
  return {
    Shipment: {
      AWB: 'MOCKWB00000001',
      ReferenceNo: 'GLM-DLV-1',
      Status: {
        Status: 'In Transit',
        StatusType: 'UD',
        StatusCode: 'X-UCI',
        StatusDateTime: '2026-10-06 11:30:00',
        StatusLocation: 'Jaipur_Hub',
        Instructions: 'Shipment in transit',
        ...statusOverrides,
      },
      Scans: [
        { ScanDetail: { ScanDateTime: '2026-10-06 11:30:00', Scan: 'In Transit', StatusType: 'UD', ScannedLocation: 'Jaipur_Hub', Instructions: 'Shipment in transit' } },
      ],
      ...overrides,
    },
  };
}

async function run(): Promise<void> {
  console.log('\nDelhivery B2C suite — mocked APIs only, no real Delhivery call.\n');
  await resetDatabase();
  await startWebhookServer();

  // ========================================
  section('1. Base URL resolution (SSRF protection)');
  // ========================================
  check('the documented host is accepted', resolveDelhiveryBaseUrl('https://track.delhivery.com') === 'https://track.delhivery.com');
  check('unset falls back to the default', resolveDelhiveryBaseUrl(undefined) === DELHIVERY_DEFAULT_BASE_URL);
  check('a non-Delhivery host is refused', resolveDelhiveryBaseUrl('https://evil.example.com') === DELHIVERY_DEFAULT_BASE_URL);
  check('the metadata address is refused', resolveDelhiveryBaseUrl('http://169.254.169.254') === DELHIVERY_DEFAULT_BASE_URL);
  check('plain HTTP to a remote host is refused', resolveDelhiveryBaseUrl('http://track.delhivery.com') === DELHIVERY_DEFAULT_BASE_URL);
  check('a lookalike domain is refused', resolveDelhiveryBaseUrl('https://track.delhivery.com.evil.test') === DELHIVERY_DEFAULT_BASE_URL);
  check('embedded credentials are refused', resolveDelhiveryBaseUrl('https://u:p@track.delhivery.com') === DELHIVERY_DEFAULT_BASE_URL);

  // ========================================
  section('2. Serviceability (live adapter, scripted transport)');
  // ========================================
  const previousLive = process.env.DELHIVERY_LIVE_MODE;
  const previousToken = process.env.DELHIVERY_TOKEN;
  process.env.DELHIVERY_LIVE_MODE = 'true';
  process.env.DELHIVERY_TOKEN = 'fake-token-for-tests-only';

  {
    const { transport, calls } = makeTransport([{
      match: '/c/api/pin-codes/json/',
      respond: () => ({ ok: true, status: 200, data: { delivery_codes: [{ postal_code: { pin: 302020, city: 'Jaipur', state_code: 'RJ', remarks: '', cod: 'Y', pre_paid: 'Y' } }] } }),
    }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const provider = getShipmentProvider();
    check('live adapter is selected with live mode on', provider.isMock === false);
    check('capabilities say no rate shopping', provider.capabilities.ratesShopping === false);
    check('capabilities say waybills are pre-allocated', provider.capabilities.waybillPreallocation === true);
    check('capabilities say pickup is warehouse-level', provider.capabilities.warehouseLevelPickup === true);
    check('capabilities say no manifest', provider.capabilities.manifest === false);
    check('capabilities say no invoice', provider.capabilities.invoice === false);

    const r = await provider.checkPincode({ deliveryPincode: '302020', isCod: true });
    check('a blank remark means serviceable', r.ok === true && r.value!.serviceable === true);
    check('...and is not flagged temporary', r.value!.temporary === false);
    check('city and state are read', r.value!.city === 'Jaipur' && r.value!.state === 'RJ');
    check('COD availability is read', r.value!.codAvailable === true);
    const authHeader = calls[0]?.headers?.Authorization;
    check('the token is sent as a Token header', typeof authHeader === 'string' && authHeader.startsWith('Token '));
    check('one pincode per call', calls[0].url.includes('filter_codes=302020'));
    // The single-attempt rule is targeted at allocation, not blanket: a read
    // changes nothing upstream, so retrying it is free and still allowed.
    check('a read-only lookup is still allowed to retry', (calls[0].attempts || 0) > 1, `attempts=${calls[0].attempts}`);
    restore();
  }
  {
    const { transport } = makeTransport([{ match: '/c/api/pin-codes/json/', respond: () => ({ ok: true, status: 200, data: { delivery_codes: [] } }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().checkPincode({ deliveryPincode: '999999', isCod: false });
    check('an empty response means NON-serviceable', r.ok === true && r.value!.serviceable === false);
    check('...reported as a success, not an error', r.ok === true);
    check('...and not temporary', r.value!.temporary === false);
    restore();
  }
  {
    const { transport } = makeTransport([{
      match: '/c/api/pin-codes/json/',
      respond: () => ({ ok: true, status: 200, data: { delivery_codes: [{ postal_code: { city: 'X', state_code: 'XX', remarks: 'Embargo', cod: 'N', pre_paid: 'N' } }] } }),
    }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().checkPincode({ deliveryPincode: '110001', isCod: false });
    check('an Embargo remark means NOT serviceable', r.value!.serviceable === false);
    check('...but IS flagged temporary', r.value!.temporary === true);
    check('...and keeps the provider wording', r.value!.remark === 'Embargo');
    restore();
  }
  {
    const { transport } = makeTransport([{ match: '/c/api/pin-codes/json/', respond: () => ({ ok: false, status: 500, error: 'boom', retryable: true }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().checkPincode({ deliveryPincode: '302020', isCod: false });
    check('an API failure is reported as a failure', r.ok === false);
    check('...and marked retryable', r.retryable === true);
    restore();
  }
  {
    const { transport, calls } = makeTransport([{ match: '/c/api/pin-codes/json/', respond: () => ({ ok: true, status: 200, data: {} }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().checkPincode({ deliveryPincode: '12', isCod: false });
    check('a malformed pincode is rejected before any call', r.ok === false && calls.length === 0);
    restore();
  }

  // ========================================
  section('3. Waybill');
  // ========================================
  {
    const { transport, calls } = makeTransport([{ match: '/waybill/api/fetch/json/', respond: () => ({ ok: true, status: 200, data: '"1234567890123"' }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().fetchWaybill!();
    check('a waybill is returned', r.ok === true && r.value!.waybill === '1234567890123');
    check('surrounding quotes are stripped', !r.value!.waybill.includes('"'));
    check('the token goes in the query string for this endpoint', calls[0].url.includes('token='));
    check('a successful allocation also asks for one attempt', calls[0].attempts === 1, `attempts=${calls[0].attempts}`);
    restore();
  }
  {
    const { transport } = makeTransport([{ match: '/waybill/api/fetch/json/', respond: () => ({ ok: true, status: 200, data: '' }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().fetchWaybill!();
    check('an empty waybill response is a failure', r.ok === false);
    check('...and is retryable', r.retryable === true);
    restore();
  }

  // --- allocation is never retried blindly (M8) ---------------------------
  // The pool hands out a NEW number per call. A retry after a timeout draws a
  // second waybill and strands the first — a number the client paid for that
  // no parcel will ever carry.
  {
    const { transport, calls } = makeTransport([
      { match: '/waybill/api/fetch/json/', respond: () => ({ ok: false, status: 0, error: 'Request timed out after 15000ms', retryable: true }) },
    ]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().fetchWaybill!();
    check('allocation asks httpJson for exactly ONE attempt', calls[0].attempts === 1, `attempts=${calls[0].attempts}`);
    check('...and reported as a failure', r.ok === false);
    check('...flagged ambiguous — a waybill may have been allocated', r.ambiguous === true);
    check('...and says the outcome is unknown', /outcome unknown/i.test(r.error || ''));
    restore();
  }
  {
    const { transport, calls } = makeTransport([
      { match: '/waybill/api/fetch/json/', respond: () => ({ ok: false, status: 503, error: 'Service Unavailable', retryable: true }) },
    ]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().fetchWaybill!();
    check('a 5xx allocation is never auto-retried either', calls[0].attempts === 1, `attempts=${calls[0].attempts}`);
    check('...and is ambiguous too — 5xx can follow completed work', r.ambiguous === true);
    restore();
  }
  {
    // A 4xx is the one honest "nothing happened": rejected on sight.
    const { transport, calls } = makeTransport([
      { match: '/waybill/api/fetch/json/', respond: () => ({ ok: false, status: 401, error: 'Unauthorized', retryable: false }) },
    ]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().fetchWaybill!();
    check('a 4xx allocation asks for one attempt too', calls[0].attempts === 1, `attempts=${calls[0].attempts}`);
    check('...and is NOT ambiguous — nothing was allocated', r.ambiguous === false);
    check('...so the error carries no "outcome unknown" wording', !/outcome unknown/i.test(r.error || ''));
    restore();
  }
  check('status 0 (network/timeout) is ambiguous', outcomeIsAmbiguous(0) === true);
  check('500 is ambiguous', outcomeIsAmbiguous(500) === true);
  check('502 is ambiguous', outcomeIsAmbiguous(502) === true);
  check('400 is not ambiguous', outcomeIsAmbiguous(400) === false);
  check('404 is not ambiguous', outcomeIsAmbiguous(404) === false);
  check('429 is not ambiguous — the request was refused, not performed', outcomeIsAmbiguous(429) === false);

  // ========================================
  section('4. Shipment creation');
  // ========================================
  const createOk = {
    match: '/api/cmu/create.json',
    respond: () => ({ ok: true, status: 200, data: { success: true, packages: [{ waybill: '1234567890123', refnum: 'GLM-X', status: 'Success' }] } }),
  };
  {
    const { transport, calls } = makeTransport([createOk]);
    const restore = __setDelhiveryTransportForTests(transport);
    const base = {
      orderId: 'o1', orderNumber: 'GLM-X', createdAt: new Date().toISOString(),
      customerName: 'A', customerPhone: '9000000000',
      address: { addressLine1: '1 Rd', city: 'Jaipur', state: 'RJ', pinCode: '302020' },
      items: [{ name: 'Serum', sku: PRODUCT_ID, units: 2, sellingPrice: 500 }],
      subtotal: 1000, discount: 0, total: 1000, isCod: true,
      weightKg: 0.3, lengthCm: 15, breadthCm: 10, heightCm: 5, waybill: '1234567890123',
    };
    const cod = await getShipmentProvider().createShipment(base as any, 'COD');
    check('a COD shipment is created', cod.ok === true && cod.value!.waybill === '1234567890123');

    const sent = JSON.parse(decodeURIComponent(String(calls[0].body).replace('format=json&data=', '')));
    const pkg = sent.shipments[0];
    check('payment_mode is COD', pkg.payment_mode === 'COD');
    check('cod_amount carries the total', pkg.cod_amount === 1000);
    check('the order number is sent as `order`', pkg.order === 'GLM-X');
    check('the waybill is sent', pkg.waybill === '1234567890123');
    check('weight is converted to grams', pkg.weight === 300);
    check('quantity sums the units', pkg.quantity === 2);
    check('pickup_location.name is the configured warehouse', sent.pickup_location.name === 'Test Warehouse');
    check('dimensions map to shipment_* fields', pkg.shipment_length === 15 && pkg.shipment_width === 10 && pkg.shipment_height === 5);
    restore();
  }
  {
    const { transport, calls } = makeTransport([createOk]);
    const restore = __setDelhiveryTransportForTests(transport);
    const prepaid = await getShipmentProvider().createShipment({
      orderId: 'o2', orderNumber: 'GLM-Y', createdAt: new Date().toISOString(),
      customerName: 'A', customerPhone: '9000000000',
      address: { addressLine1: '1 Rd', city: 'Jaipur', state: 'RJ', pinCode: '302020' },
      items: [{ name: 'Serum', sku: PRODUCT_ID, units: 1, sellingPrice: 500 }],
      subtotal: 500, discount: 0, total: 500, isCod: false,
      weightKg: 0.3, lengthCm: 15, breadthCm: 10, heightCm: 5, waybill: '9999999999999',
    } as any, 'PREPAID');
    check('a prepaid shipment is created', prepaid.ok === true);
    const pkg = JSON.parse(decodeURIComponent(String(calls[0].body).replace('format=json&data=', ''))).shipments[0];
    check('payment_mode is Prepaid', pkg.payment_mode === 'Prepaid');
    check('a prepaid shipment carries NO cod_amount', pkg.cod_amount === undefined);
    restore();
  }
  {
    // Delhivery answers 200 with success:false when it rejects. Treating the
    // HTTP status as the verdict would record a parcel that does not exist.
    const { transport } = makeTransport([{
      match: '/api/cmu/create.json',
      respond: () => ({ ok: true, status: 200, data: { success: false, packages: [{ status: 'Fail', remarks: ['ClientWarehouse matching query does not exist'] }] } }),
    }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().createShipment({
      orderId: 'o3', orderNumber: 'GLM-Z', createdAt: new Date().toISOString(),
      customerName: 'A', customerPhone: '9', address: { addressLine1: 'x', city: 'y', state: 'z', pinCode: '302020' },
      items: [], subtotal: 0, discount: 0, total: 0, isCod: false,
      weightKg: 0.3, lengthCm: 1, breadthCm: 1, heightCm: 1, waybill: 'WB1',
    } as any, 'PREPAID');
    check('a 200 with success:false is a FAILURE', r.ok === false);
    check('...and surfaces the provider remark', /ClientWarehouse/.test(r.error || ''));
    check('...and is not retryable', r.retryable !== true);
    restore();
  }
  for (const [label, response] of [
    ['a timeout', { ok: false, status: 0, error: 'Request timed out after 30000ms', retryable: true }],
    ['a 4xx', { ok: false, status: 401, error: 'Invalid token', retryable: false }],
    ['a 5xx', { ok: false, status: 503, error: 'Service unavailable', retryable: true }],
    ['a malformed response', { ok: true, status: 200, data: { unexpected: true } }],
  ] as [string, any][]) {
    const { transport } = makeTransport([{ match: '/api/cmu/create.json', respond: () => response }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().createShipment({
      orderId: 'oX', orderNumber: 'GLM-T', createdAt: new Date().toISOString(),
      customerName: 'A', customerPhone: '9', address: { addressLine1: 'x', city: 'y', state: 'z', pinCode: '302020' },
      items: [], subtotal: 0, discount: 0, total: 0, isCod: false,
      weightKg: 0.3, lengthCm: 1, breadthCm: 1, heightCm: 1, waybill: 'WB2',
    } as any, 'PREPAID');
    check(`creation handles ${label} without throwing`, r.ok === false, r.error);
    restore();
  }
  {
    // No warehouse configured must fail locally, before a call — the API's own
    // error for this is unhelpfully generic.
    const saved = process.env.DELHIVERY_PICKUP_NAME;
    delete process.env.DELHIVERY_PICKUP_NAME;
    const { transport, calls } = makeTransport([createOk]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().createShipment({
      orderId: 'o4', orderNumber: 'GLM-W', createdAt: new Date().toISOString(),
      customerName: 'A', customerPhone: '9', address: { addressLine1: 'x', city: 'y', state: 'z', pinCode: '302020' },
      items: [], subtotal: 0, discount: 0, total: 0, isCod: false,
      weightKg: 0.3, lengthCm: 1, breadthCm: 1, heightCm: 1, waybill: 'WB3',
    } as any, 'PREPAID');
    check('a missing warehouse name fails before any call', r.ok === false && calls.length === 0);
    check('...and says which variable is missing', /DELHIVERY_PICKUP_NAME/.test(r.error || ''));
    restore();
    process.env.DELHIVERY_PICKUP_NAME = saved;
  }

  // ========================================
  section('5. Tracking and status mapping');
  // ========================================
  {
    const { transport } = makeTransport([{
      match: '/api/v1/packages/json/',
      respond: () => ({ ok: true, status: 200, data: { ShipmentData: [{ Shipment: {
        Status: { Status: 'Delivered', StatusType: 'DL', StatusDateTime: '2026-10-06 14:00:00' },
        Scans: [
          { ScanDetail: { ScanDateTime: '2026-10-05 09:00:00', Scan: 'In Transit', StatusType: 'UD', ScannedLocation: 'Delhi_Hub', Instructions: 'In transit' } },
          { ScanDetail: { ScanDateTime: '2026-10-06 14:00:00', Scan: 'Delivered', StatusType: 'DL', ScannedLocation: 'Jaipur', Instructions: 'Delivered to consignee' } },
        ],
      } }] } }),
    }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().track('1234567890123', 'GLM-X');
    check('tracking succeeds', r.ok === true);
    check('DL/Delivered maps to DELIVERED', r.value!.status === 'DELIVERED');
    check('the provider pair is kept verbatim', r.value!.providerStatus === 'Delivered' && r.value!.providerStatusType === 'DL');
    check('scans are returned', r.value!.scans.length === 2);
    check('scan location is read', r.value!.scans[0].location === 'Delhi_Hub');
    check('deliveredAt is set', !!r.value!.deliveredAt);
    check('the timeline is oldest-first', new Date(r.value!.events[0].timestamp) <= new Date(r.value!.events[1].timestamp));
    restore();
  }

  const forward: [string, string, string][] = [
    ['UD', 'Manifested', 'AWB_ASSIGNED'],
    ['UD', 'Not Picked', 'PICKUP_SCHEDULED'],
    ['UD', 'In Transit', 'IN_TRANSIT'],
    ['UD', 'Pending', 'IN_TRANSIT'],
    ['UD', 'Dispatched', 'OUT_FOR_DELIVERY'],
    ['DL', 'Delivered', 'DELIVERED'],
  ];
  for (const [type, status, expected] of forward) {
    check(`${type}/${status} -> ${expected}`, mapDelhiveryStatus(type, status) === expected, String(mapDelhiveryStatus(type, status)));
  }
  const rto: [string, string, string][] = [
    ['RT', 'In Transit', 'RTO_INITIATED'],
    ['RT', 'Pending', 'RTO_INITIATED'],
    ['RT', 'Dispatched', 'RTO_INITIATED'],
    ['DL', 'RTO', 'RTO_DELIVERED'],
  ];
  for (const [type, status, expected] of rto) {
    check(`${type}/${status} -> ${expected}`, mapDelhiveryStatus(type, status) === expected, String(mapDelhiveryStatus(type, status)));
  }
  const reverse: [string, string, string][] = [
    ['PP', 'Open', 'PICKUP_SCHEDULED'],
    ['PP', 'Scheduled', 'PICKUP_SCHEDULED'],
    ['PP', 'Dispatched', 'PICKED_UP'],
    ['PU', 'In Transit', 'IN_TRANSIT'],
    ['PU', 'Pending', 'IN_TRANSIT'],
    ['PU', 'Dispatched', 'IN_TRANSIT'],
    ['DL', 'DTO', 'RTO_DELIVERED'],
    ['CN', 'Canceled', 'CANCELLED'],
    ['CN', 'Closed', 'CANCELLED'],
  ];
  for (const [type, status, expected] of reverse) {
    check(`${type}/${status} -> ${expected}`, mapDelhiveryStatus(type, status) === expected, String(mapDelhiveryStatus(type, status)));
  }
  check('an unknown pair maps to NULL, never a guess', mapDelhiveryStatus('ZZ', 'Quantum') === null);
  check('a known status under the wrong type is still unknown', mapDelhiveryStatus('PP', 'Delivered') === null);
  check('a missing type is unknown', mapDelhiveryStatus(null, 'Delivered') === null);
  check('a missing status is unknown', mapDelhiveryStatus('DL', null) === null);

  check('a Delhivery timestamp parses as IST', parseDelhiveryDate('2026-10-06 11:30:00')?.toISOString() === '2026-10-06T06:00:00.000Z');
  check('an unparseable timestamp returns null', parseDelhiveryDate('nonsense') === null);
  check('an explicit Z offset is respected', parseDelhiveryDate('2026-10-06T11:30:00Z')?.toISOString() === '2026-10-06T11:30:00.000Z');

  // ========================================
  section('6. Label, pickup, cancellation');
  // ========================================
  {
    const { transport } = makeTransport([{ match: '/api/p/packing_slip', respond: () => ({ ok: true, status: 200, data: { packages: [{ pdf_download_link: 'https://track.delhivery.com/label/1.pdf' }] } }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().getLabel({ waybill: '1234567890123' });
    check('a label URL is returned', r.ok === true && r.value!.labelUrl.endsWith('/label/1.pdf'));
    restore();
  }
  {
    const { transport, calls } = makeTransport([{ match: '/fm/request/new/', respond: () => ({ ok: true, status: 200, data: { pickup_id: 987 } }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().requestPickup({ pickupLocation: 'Test Warehouse', pickupDate: '2026-10-07', pickupTime: '14:00:00', expectedPackageCount: 3 });
    check('a pickup is booked', r.ok === true && r.value!.pickupId === '987');
    check('the request carries the four documented fields', !!calls[0].body.pickup_location && !!calls[0].body.pickup_date && !!calls[0].body.pickup_time && calls[0].body.expected_package_count === 3);
    restore();
  }
  {
    const { transport } = makeTransport([{ match: '/api/p/edit', respond: () => ({ ok: true, status: 200, data: { status: false, remark: 'Shipment already in transit' } }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().cancelShipment({ waybill: '1234567890123' });
    check('a refused cancellation is NOT reported as success', r.ok === false);
    check('...and keeps the provider reason', /already in transit/.test(r.error || ''));
    restore();
  }
  {
    const { transport } = makeTransport([{ match: '/api/p/edit', respond: () => ({ ok: true, status: 200, data: { status: true } }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().cancelShipment({ waybill: '1234567890123' });
    check('an accepted cancellation succeeds', r.ok === true);
    restore();
  }

  // --- auth failure -------------------------------------------------------
  {
    // Removing the token does not merely fail a request — it makes the
    // integration ineligible. `enabled` requires both a token and a warehouse,
    // so the selector falls back to the mock and the live adapter is never
    // reached at all. That is the stronger property and the one worth
    // asserting: a half-configured deployment cannot touch the real account.
    const savedToken = process.env.DELHIVERY_TOKEN;
    delete process.env.DELHIVERY_TOKEN;
    const provider = getShipmentProvider();
    check('a missing token makes the provider ineligible', provider.isMock === true);
    check('...so no live call is possible', provider.name === 'delhivery-mock');
    process.env.DELHIVERY_TOKEN = savedToken;
    check('restoring the token re-enables the live adapter', getShipmentProvider().isMock === false);
  }
  {
    // And a missing warehouse does the same, independently of the token.
    const savedLoc = process.env.DELHIVERY_PICKUP_NAME;
    delete process.env.DELHIVERY_PICKUP_NAME;
    check('a missing warehouse also makes the provider ineligible', getShipmentProvider().isMock === true);
    process.env.DELHIVERY_PICKUP_NAME = savedLoc;
  }
  {
    const { transport } = makeTransport([{ match: '/c/api', respond: () => ({ ok: false, status: 401, error: 'Invalid token', retryable: false }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().checkPincode({ deliveryPincode: '302020', isCod: false });
    check('a 401 from the provider is a non-retryable failure', r.ok === false && r.retryable !== true);
    restore();
  }

  process.env.DELHIVERY_LIVE_MODE = previousLive || 'false';
  if (previousToken === undefined) delete process.env.DELHIVERY_TOKEN;
  else process.env.DELHIVERY_TOKEN = previousToken;
  check('live mode is off again for the flow tests', getShipmentProvider().isMock === true);

  // ========================================
  section('7. End-to-end booking (mock adapter, real database)');
  // ========================================
  await resetDatabase();
  await seedOrder({ id: 'bk-1', orderNumber: 'GLM-DLV-1', quantity: 2 });
  await commitOrderStock('bk-1');

  const booked = await createShipmentForOrder('bk-1');
  check('booking succeeds', booked.ok === true, booked.error);

  let ship = (await pool.query(`SELECT * FROM shipments WHERE order_id = 'bk-1'`)).rows[0];
  check('provider is recorded as delhivery', String(ship.provider).startsWith('delhivery'));
  check('a waybill was drawn and stored', !!ship.waybill);
  check('waybill_fetched_at is stamped', !!ship.waybill_fetched_at);
  check('awb_code carries the same waybill', ship.awb_code === ship.waybill);
  check('integration reached READY', ship.integration_status === 'READY');
  check('a label URL was stored', !!ship.label_url);
  const firstWaybill = ship.waybill;

  const order = (await pool.query(`SELECT * FROM orders WHERE id = 'bk-1'`)).rows[0];
  check('the order mirrors the tracking number', order.tracking_number === firstWaybill);
  check('the order names Delhivery as courier', order.courier_partner === 'Delhivery');
  check('shipping status is AWB_ASSIGNED', order.shipping_status === 'AWB_ASSIGNED');

  // --- idempotency --------------------------------------------------------
  const again = await createShipmentForOrder('bk-1');
  check('re-booking is a no-op success', again.ok === true);
  const count = await pool.query(`SELECT COUNT(*)::int n FROM shipments WHERE order_id = 'bk-1'`);
  check('still exactly one shipment row', count.rows[0].n === 1);
  ship = (await pool.query(`SELECT * FROM shipments WHERE order_id = 'bk-1'`)).rows[0];
  check('the waybill did not change', ship.waybill === firstWaybill);

  // --- concurrency --------------------------------------------------------
  // A row count alone does not prove this. The unique index decides only who
  // INSERTs the shipments row; a caller that loses it used to read that same
  // row and carry on, so two callers drew two waybills, each created a parcel,
  // and the second overwrote the first on one row. One row, two parcels. These
  // assertions count what the courier was actually asked to do.
  await seedOrder({ id: 'bk-2', orderNumber: 'GLM-DLV-2' });
  await commitOrderStock('bk-2');
  const shipmentsBefore = mockDelhiveryProvider.shipmentCount();
  const waybillsBefore = mockDelhiveryProvider.waybillsDrawn();
  const racing = await Promise.all(Array.from({ length: 5 }, () => createShipmentForOrder('bk-2')));
  const racedRows = await pool.query(`SELECT COUNT(*)::int n FROM shipments WHERE order_id = 'bk-2'`);
  check('5 concurrent bookings produce exactly one shipment row', racedRows.rows[0].n === 1, String(racedRows.rows[0].n));
  check('at least one concurrent caller succeeded', racing.some((r) => r.ok));
  check(
    '...and the courier was asked to create exactly ONE parcel',
    mockDelhiveryProvider.shipmentCount() - shipmentsBefore === 1,
    String(mockDelhiveryProvider.shipmentCount() - shipmentsBefore)
  );
  check(
    '...drawing exactly ONE waybill from the pool',
    mockDelhiveryProvider.waybillsDrawn() - waybillsBefore === 1,
    String(mockDelhiveryProvider.waybillsDrawn() - waybillsBefore)
  );
  check('the losers say a booking is already in progress', racing.some((r) => /already in progress/i.test(r.error || '')));
  const racedShip = (await pool.query(`SELECT waybill, awb_code FROM shipments WHERE order_id = 'bk-2'`)).rows[0];
  check('the stored waybill is the one that was actually booked', racedShip.waybill === racedShip.awb_code);

  // --- unserviceable ------------------------------------------------------
  await seedOrder({ id: 'bk-3', orderNumber: 'GLM-DLV-3', pinCode: '990001' });
  const unserviceable = await createShipmentForOrder('bk-3');
  check('an unserviceable pincode blocks booking', unserviceable.ok === false);
  check('...and says so plainly', /not serviceable/i.test(unserviceable.error || ''));
  const survived = (await pool.query(`SELECT * FROM orders WHERE id = 'bk-3'`)).rows[0];
  check('the Glamirk order still exists', !!survived);
  check('...was not cancelled', survived.status !== 'CANCELLED');
  check('...and its stock was not released', survived.stock_restored === false);

  await seedOrder({ id: 'bk-4', orderNumber: 'GLM-DLV-4', pinCode: '980001' });
  const embargoed = await createShipmentForOrder('bk-4');
  check('an embargoed pincode blocks booking', embargoed.ok === false);
  check('...and is described as temporary', /temporarily/i.test(embargoed.error || ''));

  // --- COD serviceability -------------------------------------------------
  // Deliverable, but cash is refused there. Serviceability alone said yes, so
  // the parcel used to be booked and then returned as an RTO.
  await seedOrder({ id: 'bk-5', orderNumber: 'GLM-DLV-5', pinCode: '970001', paymentMethod: 'cod' });
  const codBefore = mockDelhiveryProvider.shipmentCount();
  const codBlocked = await createShipmentForOrder('bk-5');
  check('a COD order into a prepaid-only pincode is blocked', codBlocked.ok === false);
  check('...and names Cash on Delivery as the reason', /cash on delivery/i.test(codBlocked.error || ''));
  check('...before any parcel is created', mockDelhiveryProvider.shipmentCount() === codBefore);
  const codOrder = (await pool.query(`SELECT * FROM orders WHERE id = 'bk-5'`)).rows[0];
  check('...and the Glamirk order is left intact', codOrder.status !== 'CANCELLED' && codOrder.stock_restored === false);

  // The same pincode is fine when the money has already been taken.
  await seedOrder({ id: 'bk-6', orderNumber: 'GLM-DLV-6', pinCode: '970001', paymentMethod: 'card', paymentStatus: 'PAID' });
  const prepaidThere = await createShipmentForOrder('bk-6');
  check('a PREPAID order into the same pincode still books', prepaidThere.ok === true, prepaidThere.error);

  // --- pickup idempotency -------------------------------------------------
  const pickupRows = await pool.query(`SELECT COUNT(*)::int n FROM shipment_pickup_requests WHERE status = 'OPEN'`);
  check('booking created one open pickup for the warehouse', pickupRows.rows[0].n === 1, String(pickupRows.rows[0].n));
  check('the courier was asked for exactly one pickup', mockDelhiveryProvider.pickupCount() === 1, String(mockDelhiveryProvider.pickupCount()));

  const extra = await Promise.all([ensureWarehousePickup(), ensureWarehousePickup(), ensureWarehousePickup()]);
  check('repeat pickup requests all report success', extra.every((r) => r.ok));
  check('...but book no second van', mockDelhiveryProvider.pickupCount() === 1, String(mockDelhiveryProvider.pickupCount()));
  const stillOne = await pool.query(`SELECT COUNT(*)::int n FROM shipment_pickup_requests WHERE status = 'OPEN'`);
  check('...and leave exactly one open booking', stillOne.rows[0].n === 1, String(stillOne.rows[0].n));
  const counted = await pool.query(`SELECT expected_package_count FROM shipment_pickup_requests WHERE status = 'OPEN'`);
  check('the package count accumulates instead', Number(counted.rows[0].expected_package_count) > 1);

  // ========================================
  section('8. Webhook authentication');
  // ========================================
  const body = scanPush();
  check('a missing key is rejected with 401', (await postWebhook(body, {})).status === 401);
  check('an invalid key is rejected with 401', (await postWebhook(body, { 'x-api-key': 'nope' })).status === 401);
  check('a same-length wrong key is rejected', (await postWebhook(body, { 'x-api-key': 'x'.repeat(TEST_WEBHOOK_SECRET.length) })).status === 401);
  check('an empty key is rejected', (await postWebhook(body, { 'x-api-key': '' })).status === 401);

  check('verify rejects undefined', verifyDelhiveryWebhook(undefined) === false);
  check('verify rejects null', verifyDelhiveryWebhook(null) === false);
  check('verify accepts the configured secret', verifyDelhiveryWebhook(TEST_WEBHOOK_SECRET) === true);
  {
    // Fails closed with nothing configured — in every environment, unlike the
    // courier webhook it replaces.
    const saved = process.env.DELHIVERY_WEBHOOK_SECRET;
    delete process.env.DELHIVERY_WEBHOOK_SECRET;
    check('with no secret configured NOTHING is accepted', verifyDelhiveryWebhook('anything') === false);
    check('...not even an empty key', verifyDelhiveryWebhook('') === false);
    process.env.DELHIVERY_WEBHOOK_SECRET = saved;
  }

  check('a malformed body returns 400', (await postWebhook('{ not json', { 'x-api-key': TEST_WEBHOOK_SECRET })).status === 400);
  check('a non-object body returns 400', (await postWebhook('"a string"', { 'x-api-key': TEST_WEBHOOK_SECRET })).status === 400);

  // ========================================
  section('9. Webhook payload and idempotency');
  // ========================================
  const parsed = parseDelhiveryScanPush(scanPush());
  check('waybill is read', parsed?.waybill === 'MOCKWB00000001');
  check('order reference is read', parsed?.orderRef === 'GLM-DLV-1');
  check('status and type are read', parsed?.status === 'In Transit' && parsed?.statusType === 'UD');
  check('the status timestamp parses', parsed?.statusDateTime instanceof Date);
  check('scans are read', parsed?.scans.length === 1);
  check('scan location is read', parsed?.scans[0].location === 'Jaipur_Hub');
  check('a non-object body does not parse', parseDelhiveryScanPush('x') === null);
  check('an array body does not parse', parseDelhiveryScanPush([1]) === null);

  const k1 = delhiveryScanKey({ waybill: 'W', orderId: 'o', rawDate: 'd', activity: 'a', location: 'l' });
  const k2 = delhiveryScanKey({ waybill: 'W', orderId: 'o', rawDate: 'd', activity: 'a', location: 'l' });
  check('the same scan yields the same key', k1 === k2);
  check('a different location yields a different key', k1 !== delhiveryScanKey({ waybill: 'W', orderId: 'o', rawDate: 'd', activity: 'a', location: 'OTHER' }));
  check('the same scan on another order does not collide', k1 !== delhiveryScanKey({ waybill: 'W', orderId: 'OTHER', rawDate: 'd', activity: 'a', location: 'l' }));
  check('status keys are stable', delhiveryStatusKey({ waybill: 'W', orderId: 'o', statusType: 'UD', status: 'S', timestamp: 't' }) === delhiveryStatusKey({ waybill: 'W', orderId: 'o', statusType: 'UD', status: 'S', timestamp: 't' }));

  // --- live push against a real order -------------------------------------
  await resetDatabase();
  await seedOrder({ id: 'wh-1', orderNumber: 'GLM-WH-1', quantity: 2 });
  await commitOrderStock('wh-1');
  await createShipmentForOrder('wh-1');
  const whShip = (await pool.query(`SELECT * FROM shipments WHERE order_id = 'wh-1'`)).rows[0];

  const push = scanPush({ AWB: whShip.waybill, ReferenceNo: 'GLM-WH-1' });
  const first = await postWebhook(push);
  check('a mappable push is accepted', first.status === 200);
  await settle();

  let whOrder = (await pool.query(`SELECT * FROM orders WHERE id = 'wh-1'`)).rows[0];
  check('shipping status moved to IN_TRANSIT', whOrder.shipping_status === 'IN_TRANSIT', whOrder.shipping_status);
  check('the order status moved to SHIPPED', whOrder.status === 'SHIPPED', whOrder.status);
  const scanCount1 = await pool.query(`SELECT COUNT(*)::int n FROM shipment_tracking_events WHERE order_id = 'wh-1'`);
  check('the scan was recorded', scanCount1.rows[0].n === 1);

  const dup = await postWebhook(push);
  check('a redelivery is reported as duplicate', dup.json?.duplicate === true);
  await settle();
  const scanCount2 = await pool.query(`SELECT COUNT(*)::int n FROM shipment_tracking_events WHERE order_id = 'wh-1'`);
  check('the duplicate created NO extra scan rows', scanCount2.rows[0].n === 1, String(scanCount2.rows[0].n));
  const eventRows = await pool.query(`SELECT COUNT(*)::int n FROM webhook_events WHERE source = 'delhivery' AND order_id = 'wh-1'`);
  check('and no extra webhook_events row', eventRows.rows[0].n === 1, String(eventRows.rows[0].n));

  const burst = await Promise.all(Array.from({ length: 6 }, () => postWebhook(push)));
  check('a concurrent burst is all acknowledged', burst.every((r) => r.status === 200));
  await settle();
  const scanCount3 = await pool.query(`SELECT COUNT(*)::int n FROM shipment_tracking_events WHERE order_id = 'wh-1'`);
  check('the burst created no duplicate scans', scanCount3.rows[0].n === 1, String(scanCount3.rows[0].n));

  // --- unknown status ------------------------------------------------------
  const beforeUnknown = (await pool.query(`SELECT * FROM orders WHERE id = 'wh-1'`)).rows[0];
  await postWebhook(scanPush({ AWB: whShip.waybill, ReferenceNo: 'GLM-WH-1' }, { Status: 'Quantum Entangled', StatusType: 'ZZ', StatusDateTime: '2026-10-07 10:00:00' }));
  await settle();
  const afterUnknown = (await pool.query(`SELECT * FROM orders WHERE id = 'wh-1'`)).rows[0];
  check('an unknown status does NOT change the order status', afterUnknown.status === beforeUnknown.status);
  check('...nor the shipping status', afterUnknown.shipping_status === beforeUnknown.shipping_status);
  const unknownShip = (await pool.query(`SELECT * FROM shipments WHERE order_id = 'wh-1'`)).rows[0];
  check('...but the raw pair is stored verbatim', unknownShip.tracking_status === 'Quantum Entangled' && unknownShip.provider_status_type === 'ZZ');
  const unknownEvent = await pool.query(`SELECT status FROM webhook_events WHERE event_type = 'Quantum Entangled' LIMIT 1`);
  check('...and the event is PROCESSED, not FAILED', unknownEvent.rows[0]?.status === 'PROCESSED');

  // --- unknown order / conflicting identifiers -----------------------------
  await postWebhook(scanPush({ AWB: 'NOSUCHWAYBILL', ReferenceNo: 'GLM-NOPE' }));
  await settle();
  const ignored = await pool.query(`SELECT status, error FROM webhook_events WHERE source='delhivery' ORDER BY received_at DESC LIMIT 1`);
  check('an unmappable push is IGNORED', ignored.rows[0].status === 'IGNORED');
  check('...and says why', /No Glamirk order matches/i.test(ignored.rows[0].error || ''));

  await seedOrder({ id: 'wh-2', orderNumber: 'GLM-WH-2' });
  await postWebhook(scanPush({ AWB: whShip.waybill, ReferenceNo: 'GLM-WH-2' }, { StatusDateTime: '2026-10-08 10:00:00' }));
  await settle();
  const conflict = await pool.query(`SELECT status, error FROM webhook_events WHERE source='delhivery' ORDER BY received_at DESC LIMIT 1`);
  check('conflicting identifiers are refused', conflict.rows[0].status === 'IGNORED');
  check('...and the reason names the disagreement', /disagree/i.test(conflict.rows[0].error || ''));
  const untouched = (await pool.query(`SELECT * FROM orders WHERE id = 'wh-2'`)).rows[0];
  check('the wrongly-claimed order was NOT touched', untouched.status === 'PLACED' && untouched.shipping_status === 'NOT_SHIPPED');

  // ========================================
  section('10. Delivery and inventory safety');
  // ========================================
  const reservedBefore = await pool.query(`SELECT COALESCE(SUM(reserved_stock),0)::int r, COALESCE(SUM(sold_stock),0)::int s FROM inventory`);
  check('stock is reserved for the in-flight order', reservedBefore.rows[0].r === 2, String(reservedBefore.rows[0].r));

  const deliveredPush = scanPush({ AWB: whShip.waybill, ReferenceNo: 'GLM-WH-1' }, { Status: 'Delivered', StatusType: 'DL', StatusDateTime: '2026-10-09 12:00:00' });
  await postWebhook(deliveredPush);
  await settle();

  const deliveredOrder = (await pool.query(`SELECT * FROM orders WHERE id = 'wh-1'`)).rows[0];
  check('the order is DELIVERED', deliveredOrder.status === 'DELIVERED', deliveredOrder.status);
  check('a COD order becomes PAID on delivery (existing lifecycle)', deliveredOrder.payment_status === 'PAID');

  const afterDelivery = await pool.query(`SELECT COALESCE(SUM(reserved_stock),0)::int r, COALESCE(SUM(sold_stock),0)::int s, COALESCE(SUM(available_stock),0)::int a FROM inventory`);
  check('the reservation was consumed', afterDelivery.rows[0].r === 0);
  check('stock was marked sold exactly once', afterDelivery.rows[0].s === 2, String(afterDelivery.rows[0].s));

  await Promise.all(Array.from({ length: 5 }, () => postWebhook(deliveredPush)));
  await settle();
  const afterBurst = await pool.query(`SELECT COALESCE(SUM(reserved_stock),0)::int r, COALESCE(SUM(sold_stock),0)::int s, COALESCE(SUM(available_stock),0)::int a FROM inventory`);
  check('a duplicate DELIVERED push does NOT double-consume stock', afterBurst.rows[0].s === 2, String(afterBurst.rows[0].s));
  check('...nor change available stock', afterBurst.rows[0].a === afterDelivery.rows[0].a);
  check('...nor release a reservation', afterBurst.rows[0].r === 0);
  const commits = await pool.query(`SELECT COUNT(*)::int n FROM inventory_transactions WHERE order_id = 'wh-1' AND operation = 'COMMIT'`);
  check('...and creates no duplicate inventory transaction', commits.rows[0].n === 1, String(commits.rows[0].n));

  // A late in-transit scan must not un-deliver the order.
  await postWebhook(scanPush({ AWB: whShip.waybill, ReferenceNo: 'GLM-WH-1' }, { Status: 'In Transit', StatusType: 'UD', StatusDateTime: '2026-10-10 09:00:00' }));
  await settle();
  const stillDelivered = (await pool.query(`SELECT * FROM orders WHERE id = 'wh-1'`)).rows[0];
  check('a late IN_TRANSIT scan did not un-deliver the order', stillDelivered.status === 'DELIVERED');

  // The same rule, on the path that used to slip past it. The terminal guard
  // read the order status out of the shipping_status UPDATE's RETURNING, and
  // that returns nothing when shipping_status already matched — so a push that
  // moved only the shipment left the guard with no status to check and
  // transitioned anyway. Set up exactly that divergence: shipment behind,
  // order's shipping_status already where the push wants it.
  await pool.query(`UPDATE shipments SET status = 'DELIVERED' WHERE order_id = 'wh-1'`);
  await pool.query(`UPDATE orders SET shipping_status = 'IN_TRANSIT' WHERE id = 'wh-1'`);
  await applyShippingStatus({ orderId: 'wh-1', status: 'IN_TRANSIT', courierName: 'Delhivery' });
  const guarded = (await pool.query(`SELECT status FROM orders WHERE id = 'wh-1'`)).rows[0];
  check('a shipment-only change cannot drag a DELIVERED order backwards', guarded.status === 'DELIVERED', guarded.status);

  // ========================================
  section('11. Secrets never leak');
  // ========================================
  process.env.DELHIVERY_TOKEN = 'supersecrettoken1234567890';
  check('a Token header is scrubbed', !scrubDelhiverySecrets('Authorization: Token supersecrettoken1234567890').includes('supersecrettoken'));
  check('a token query param is scrubbed', !scrubDelhiverySecrets('GET /waybill?token=supersecrettoken1234567890').includes('supersecrettoken'));
  check('the configured token is scrubbed anywhere', !scrubDelhiverySecrets('failed with supersecrettoken1234567890').includes('supersecrettoken'));
  check('ordinary text survives', scrubDelhiverySecrets('Pincode not serviceable.') === 'Pincode not serviceable.');
  delete process.env.DELHIVERY_TOKEN;

  const stored = await pool.query(`SELECT payload::text AS p FROM webhook_events WHERE source = 'delhivery' LIMIT 30`);
  const allPayloads = stored.rows.map((r) => r.p).join(' ');
  check('no webhook secret was persisted', !allPayloads.includes(TEST_WEBHOOK_SECRET));
  const errs = await pool.query(`SELECT COALESCE(last_error,'') AS e FROM shipments`);
  check('no token leaked into a stored shipment error', !errs.rows.map((r) => r.e).join(' ').includes('supersecrettoken'));

  // ========================================
  section('12. Shipment edit is an allowlist, not a spread (L14)');
  // ========================================
  {
    const { fields, rejected } = pickEditableShipmentFields({
      name: 'New Name',
      add: '2 Other Road',
      phone: '9111111111',
      pin: '110001',
      weight: 500,
    });
    check('documented edit fields pass through', Object.keys(fields).length === 5);
    check('...with their values intact', fields.name === 'New Name' && fields.weight === 500);
    check('...and nothing is rejected', rejected.length === 0);
  }
  {
    // The field that made the spread dangerous: an address correction that
    // quietly cancels the parcel.
    const { fields, rejected } = pickEditableShipmentFields({ add: '2 Other Road', cancellation: 'true' });
    check('`cancellation` is NOT an editable field', fields.cancellation === undefined);
    check('...it is rejected by name', rejected.includes('cancellation'));
    check('...while the legitimate change survives', fields.add === '2 Other Road');
  }
  {
    const { fields, rejected } = pickEditableShipmentFields({
      waybill: 'ATTACKER-WAYBILL',
      pickup_location: 'Somebody Elses Warehouse',
      __proto__: 'x',
      token: 'leak-me',
    });
    check('a caller cannot redirect the edit to another waybill', fields.waybill === undefined);
    check('a caller cannot change the pickup location', fields.pickup_location === undefined);
    check('a caller cannot smuggle a token field', fields.token === undefined);
    check('nothing unknown survives at all', Object.keys(fields).length === 0);
    check('...and every dropped key is named', rejected.length > 0);
  }
  {
    const { fields, rejected } = pickEditableShipmentFields({ name: undefined, add: '1 Rd' });
    check('an explicit undefined is dropped, not rejected', !rejected.includes('name') && fields.name === undefined);
    check('...and does not reach the request body', Object.keys(fields).length === 1);
  }
  check('a null change set is handled', pickEditableShipmentFields(null).rejected.length === 0);
  check('an empty change set is handled', Object.keys(pickEditableShipmentFields({}).fields).length === 0);
  // End to end through the live adapter: what actually goes on the wire.
  // Section 11 cleared the token, and delhiveryRequest refuses before calling
  // the transport without one, so live mode is re-armed just for these blocks.
  const editLive = process.env.DELHIVERY_LIVE_MODE;
  const editToken = process.env.DELHIVERY_TOKEN;
  process.env.DELHIVERY_LIVE_MODE = 'true';
  process.env.DELHIVERY_TOKEN = 'fake-token-for-tests-only';
  {
    const { transport, calls } = makeTransport([{ match: '/api/p/edit', respond: () => ({ ok: true, status: 200, data: { status: true } }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().editShipment!({
      waybill: 'WB1',
      changes: { add: '2 Other Road', cancellation: 'true', nonsense: 1 },
    });
    check('a valid edit still succeeds', r.ok === true);
    check('the request body carries the allowed field', calls[0].body.add === '2 Other Road');
    check('the request body carries the waybill being edited', calls[0].body.waybill === 'WB1');
    check('`cancellation` never reaches Delhivery', calls[0].body.cancellation === undefined);
    check('nor does an unknown field', calls[0].body.nonsense === undefined);
    restore();
  }
  {
    const { transport, calls } = makeTransport([{ match: '/api/p/edit', respond: () => ({ ok: true, status: 200, data: { status: true } }) }]);
    const restore = __setDelhiveryTransportForTests(transport);
    const r = await getShipmentProvider().editShipment!({ waybill: 'WB1', changes: { cancellation: 'true' } });
    check('an edit of nothing but rejected fields is refused', r.ok === false);
    check('...without calling Delhivery at all', calls.length === 0, `${calls.length} call(s)`);
    restore();
  }
  if (editLive === undefined) delete process.env.DELHIVERY_LIVE_MODE; else process.env.DELHIVERY_LIVE_MODE = editLive;
  if (editToken === undefined) delete process.env.DELHIVERY_TOKEN; else process.env.DELHIVERY_TOKEN = editToken;

  // ========================================
  section('13. No real email is sent during tests (SMTP isolation)');
  // ========================================
  {
    // Credentials deliberately present: the gate must hold because this is a
    // test run, not because the mailbox happens to be unconfigured.
    const savedHost = process.env.SMTP_HOST;
    const savedUser = process.env.SMTP_USER;
    const savedPass = process.env.SMTP_PASS;
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'real-looking@glamirk.com';
    process.env.SMTP_PASS = 'real-looking-app-password';
    __resetMailTransportForTests();

    check('NODE_ENV is test for this run', process.env.NODE_ENV === 'test');
    check('delivery is disabled even with SMTP fully configured', emailDeliveryEnabled() === false);

    const t = getMailTransporter();
    check('a transport is still handed out, so callers run their templates', !!t);
    check('...but it is NOT a nodemailer transport', !!t && typeof (t as any).verify !== 'function');

    await sendOrderStatusEmail({
      toEmail: 'customer@example.com',
      customerName: 'Test Customer',
      orderId: 'bk-1',
      orderNumber: 'GLM-DLV-1',
      status: 'SHIPPED',
      total: 500,
    });
    const captured = __getSentTestEmails();
    check('the message was composed and captured', captured.length === 1, `${captured.length} captured`);
    check('...addressed to the right recipient', captured[0]?.to === 'customer@example.com');
    check('...with the real subject line', /Shipped/i.test(captured[0]?.subject || ''));
    check('...and a rendered body, so a broken template would fail here', (captured[0]?.html || '').includes('GLM-DLV-1'));

    // Flip the suppression off and the same configuration builds a real
    // transport — proving the gate is what stopped it, not a missing mailbox.
    __resetMailTransportForTests();
    process.env.NODE_ENV = 'development';
    check('delivery would be enabled outside a test run', emailDeliveryEnabled() === true);
    const real = getMailTransporter();
    check('...and a real nodemailer transport is built there', !!real && typeof (real as any).verify === 'function');

    // Restore: back to suppressed, with the original environment.
    process.env.NODE_ENV = 'test';
    __resetMailTransportForTests();
    if (savedHost === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = savedHost;
    if (savedUser === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = savedUser;
    if (savedPass === undefined) delete process.env.SMTP_PASS; else process.env.SMTP_PASS = savedPass;
    check('the gate is closed again after restoring', emailDeliveryEnabled() === false);
  }

  // ========================================
  section('14. Outbound body encoding (real httpJson, local echo server)');
  // ========================================
  // The scripted transport above records `options.body` before httpJson ever
  // touches it, so every assertion in section 4 passes whatever httpJson then
  // puts on the wire. create.json is the one endpoint that takes
  // x-www-form-urlencoded rather than JSON, and httpJson used to JSON.stringify
  // it — wrapping `format=json&data=...` in quotes, so Delhivery never saw the
  // `format` parameter and every live booking failed. Nothing short of a real
  // request through httpJson can catch that, so this makes one.
  {
    const echoApp = express();
    echoApp.use(express.text({ type: '*/*' }));
    echoApp.post('/echo', (req, res) => {
      res.json({ received: req.body, contentType: req.get('content-type') || '' });
    });
    const echoServer = createServer(echoApp);
    await new Promise<void>((resolve) => echoServer.listen(0, '127.0.0.1', resolve));
    const echoPort = (echoServer.address() as any).port;
    const echoUrl = `http://127.0.0.1:${echoPort}/echo`;

    const form = `format=json&data=${encodeURIComponent(JSON.stringify({ shipments: [{ waybill: '1' }] }))}`;
    const formRes = await httpJson<any>(echoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      attempts: 1,
    });
    check('a string body reaches the server byte-for-byte', formRes.data?.received === form, String(formRes.data?.received).slice(0, 60));
    check('...with no wrapping quotes', !String(formRes.data?.received).startsWith('"'));
    check('...and keeps the form content type', /x-www-form-urlencoded/.test(formRes.data?.contentType || ''));
    check('...so `format=json` survives the trip', String(formRes.data?.received).startsWith('format=json&data='));

    // Objects must still be serialised as JSON — that is every other caller.
    const jsonRes = await httpJson<any>(echoUrl, { method: 'POST', body: { a: 1 }, attempts: 1 });
    check('an object body is still JSON-encoded', jsonRes.data?.received === '{"a":1}', String(jsonRes.data?.received));
    check('...and still declares application/json', /application\/json/.test(jsonRes.data?.contentType || ''));

    await new Promise<void>((resolve) => echoServer.close(() => resolve()));
  }

  // ========================================
  section('15. Production safety gate — the mock never books in production');
  // ========================================
  // The hole this closes: markOrderPaid booked through getShipmentProvider()
  // with no check, and in production that returns the MOCK adapter whenever
  // DELHIVERY_LIVE_MODE is off. A paid order got a MOCKWB waybill and a
  // mock.delhivery.local tracking URL for a parcel nobody booked.
  //
  // NODE_ENV is flipped to 'production' here, which env.isProduction now reads
  // through a getter — that is what makes this branch reachable at all.
  {
    await resetDatabase();
    await seedOrder({ id: 'gate-1', orderNumber: 'GLM-GATE-1', paymentMethod: 'card', paymentStatus: 'PAID' });
    await commitOrderStock('gate-1');

    const savedNodeEnv = process.env.NODE_ENV;
    const savedLive = process.env.DELHIVERY_LIVE_MODE;
    process.env.NODE_ENV = 'production';
    process.env.DELHIVERY_LIVE_MODE = 'false';

    check('production + mock mode means shipping is NOT enabled', shipmentsEnabled() === false);

    const shipBefore = mockDelhiveryProvider.shipmentCount();
    const wbBefore = mockDelhiveryProvider.waybillsDrawn();

    const blocked = await createShipmentForOrder('gate-1');
    check('booking is refused', blocked.ok === false);
    check('...and says shipping is not enabled', /not enabled/i.test(blocked.error || ''));
    check('...and tells the operator which flag to set', /DELHIVERY_LIVE_MODE/.test(blocked.error || ''));

    check('no waybill was drawn from the provider', mockDelhiveryProvider.waybillsDrawn() === wbBefore);
    check('no parcel was created at the provider', mockDelhiveryProvider.shipmentCount() === shipBefore);

    const rows = await pool.query(`SELECT COUNT(*)::int n FROM shipments WHERE order_id = 'gate-1'`);
    check('NO shipments row was written at all', rows.rows[0].n === 0, String(rows.rows[0].n));

    const ord = (await pool.query(`SELECT * FROM orders WHERE id = 'gate-1'`)).rows[0];
    check('the order keeps NO tracking number', !ord.tracking_number, String(ord.tracking_number));
    check('...no MOCKWB number leaked onto it', !/MOCKWB/.test(String(ord.tracking_number || '')));
    check('...no mock tracking URL leaked onto it', !/mock\.delhivery\.local/.test(String(ord.courier_tracking_url || '')));
    check('...and no courier was named', !ord.courier_partner, String(ord.courier_partner));

    // The customer's order must survive untouched — payment stands, stock
    // stays committed, nothing is cancelled.
    check('the order is NOT cancelled', ord.status !== 'CANCELLED', ord.status);
    check('payment is still PAID', ord.payment_status === 'PAID', ord.payment_status);
    check('stock stays committed', ord.stock_committed === true);
    check('stock was NOT released', ord.stock_restored === false);
    check('shipping status stays NOT_SHIPPED — truthful', ord.shipping_status === 'NOT_SHIPPED', ord.shipping_status);

    // The two admin actions that bypassed the route-level check entirely.
    const pickup = await ensureWarehousePickup();
    check('warehouse pickup is refused too', pickup.ok === false);
    const puRows = await pool.query(`SELECT COUNT(*)::int n FROM shipment_pickup_requests`);
    check('...and books no van', puRows.rows[0].n === 0, String(puRows.rows[0].n));
    check('...calling the provider not at all', mockDelhiveryProvider.pickupCount() === 0, String(mockDelhiveryProvider.pickupCount()));

    const label = await ensureShipmentLabel('gate-1');
    check('label generation is refused too', label.ok === false);
    check('...so no mock PDF link can be stored', !/mock\.delhivery\.local/.test(label.labelUrl || ''));

    // --- the gate must not fire when shipping IS live ---------------------
    process.env.DELHIVERY_LIVE_MODE = 'true';
    process.env.DELHIVERY_TOKEN = 'fake-token-for-tests-only';
    check('production + live mode means shipping IS enabled', shipmentsEnabled() === true);
    process.env.DELHIVERY_LIVE_MODE = 'false';
    delete process.env.DELHIVERY_TOKEN;

    // --- and must not fire outside production -----------------------------
    process.env.NODE_ENV = 'test';
    check('outside production the mock is still allowed, so dev/tests are unaffected', shipmentsEnabled() === true);

    const allowed = await createShipmentForOrder('gate-1');
    check('the same order books fine once out of production', allowed.ok === true, allowed.error);
    const after = (await pool.query(`SELECT * FROM orders WHERE id = 'gate-1'`)).rows[0];
    check('...and only then gets a tracking number', !!after.tracking_number);

    if (savedNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedNodeEnv;
    if (savedLive === undefined) delete process.env.DELHIVERY_LIVE_MODE; else process.env.DELHIVERY_LIVE_MODE = savedLive;
    check('NODE_ENV is restored for the rest of the suite', process.env.NODE_ENV === 'test');
  }

  // ========================================
  await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  await pool.end();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log(`${'='.repeat(64)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nSuite crashed:', err);
  process.exit(1);
});
