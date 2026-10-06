import crypto from 'crypto';
import { env } from '../../config/env';
import { httpJson } from '../http.client';
import { ShippingStatus, OrderStatus, OrderTimelineEvent } from '@glamirk/shared/types';
import { registerCourierProvider, CourierProvider, CourierShipment } from '../shipping.service';
import {
  ShipmentProvider,
  ProviderResult,
  ProviderCapabilities,
  CreateShipmentInput,
  CreatedShipment,
  ServiceabilityResult,
  ShipmentPaymentMode,
  TrackingResult,
  TrackingScan,
  PickupRequestInput,
  PickupRequestResult,
} from './shippingProvider';

// ==========================================
// DELHIVERY ONE — B2C
//
// A carrier operating its own network, not an aggregator. That difference
// shapes the whole adapter: there is no rate shopping and nothing to select,
// waybills are drawn from a pool BEFORE a shipment exists, and pickups are
// booked per warehouse per day rather than per parcel.
//
// Two adapters behind one interface, chosen by env.delhivery.enabled. With
// live mode off nothing reaches Delhivery — no waybill is drawn, no shipment
// is created, no pickup is booked — while the full serviceability → waybill →
// create → track sequence still runs against the mock.
//
// The API token lives only in env and only in this process. It is sent as
// `Authorization: Token <token>` and is never logged, never returned to a
// browser, and scrubbed out of any provider error string before it travels.
// ==========================================

function apiBase(): string {
  return env.delhivery.baseUrl;
}

/**
 * Outbound transport, injectable.
 *
 * Tests must never reach the real account — a stray call would draw a real
 * waybill from the client's pool or create a real shipment. Rather than
 * relying on "the live adapter is only selected when the flag is on", the
 * transport itself is a seam.
 */
type Transport = typeof httpJson;
let transport: Transport = httpJson;

/** Test seam. Returns a function that restores the real transport. */
export function __setDelhiveryTransportForTests(next: Transport | null): () => void {
  const previous = transport;
  transport = next || httpJson;
  return () => {
    transport = previous;
  };
}

// ------------------------------------------
// Status mapping
// ------------------------------------------

/**
 * Delhivery reports a (Status, StatusType) pair. Neither alone is enough:
 * "Dispatched" means out for delivery on a forward shipment and in-transit on
 * a return, and "Delivered" with StatusType DL is a sale completed while
 * "RTO" with StatusType DL is a parcel that came back.
 *
 * Keyed as `${StatusType}/${Status}`, exactly the pairs Delhivery documents.
 * Anything outside this table maps to null — see mapDelhiveryStatus.
 */
const DELHIVERY_STATUS_MAP: Record<string, ShippingStatus> = {
  // --- Forward ---
  'UD/Manifested': 'AWB_ASSIGNED',
  'UD/Not Picked': 'PICKUP_SCHEDULED',
  'UD/In Transit': 'IN_TRANSIT',
  'UD/Pending': 'IN_TRANSIT',
  'UD/Dispatched': 'OUT_FOR_DELIVERY',
  'DL/Delivered': 'DELIVERED',

  // --- Return to origin ---
  // The parcel is on its way back to us. Glamirk represents the whole journey
  // home as RTO_INITIATED until it actually arrives.
  'RT/In Transit': 'RTO_INITIATED',
  'RT/Pending': 'RTO_INITIATED',
  'RT/Dispatched': 'RTO_INITIATED',
  'DL/RTO': 'RTO_DELIVERED',

  // --- Reverse pickup (customer returns) ---
  // Glamirk has no separate reverse vocabulary, and inventing one would mean
  // new order states for a flow the rest of the system does not model. These
  // reuse the existing stages, which describe the parcel's position just as
  // accurately in the other direction.
  'PP/Open': 'PICKUP_SCHEDULED',
  'PP/Scheduled': 'PICKUP_SCHEDULED',
  'PP/Dispatched': 'PICKED_UP',
  'PU/In Transit': 'IN_TRANSIT',
  'PU/Pending': 'IN_TRANSIT',
  'PU/Dispatched': 'IN_TRANSIT',
  // Delivered To Origin — the return reached us, which is the same end state
  // as an RTO arriving.
  'DL/DTO': 'RTO_DELIVERED',

  'CN/Canceled': 'CANCELLED',
  'CN/Cancelled': 'CANCELLED',
  'CN/Closed': 'CANCELLED',
};

/**
 * Maps a Delhivery (StatusType, Status) pair onto a Glamirk status, or null
 * when the pair is not one this build knows.
 *
 * Null means "record it verbatim, change nothing". Approximating an unknown
 * status is how a parcel still in transit gets marked delivered — which on
 * this system also converts reserved stock into sold.
 */
export function mapDelhiveryStatus(statusType: string | null | undefined, status: string | null | undefined): ShippingStatus | null {
  const type = (statusType || '').trim();
  const value = (status || '').trim();
  if (!type || !value) return null;
  return DELHIVERY_STATUS_MAP[`${type}/${value}`] ?? null;
}

/** Shipping status → the order timeline status it should appear as. */
const SHIPPING_TIMELINE_STATUS: Partial<Record<ShippingStatus, OrderStatus>> = {
  PICKED_UP: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RTO_INITIATED: 'RTO',
  RTO_DELIVERED: 'RTO',
};

/** Glamirk payment mode → Delhivery's `payment_mode`. */
const PAYMENT_MODE: Record<ShipmentPaymentMode, string> = {
  PREPAID: 'Prepaid',
  COD: 'COD',
  REVERSE_PICKUP: 'Pickup',
  REPLACEMENT: 'REPL',
};

// ------------------------------------------
// Secret handling
// ------------------------------------------

/**
 * Removes anything secret-shaped from an operator-facing string.
 *
 * Error strings come from an upstream we do not control and end up in logs, in
 * shipments.last_error, and in admin responses. One regex is cheaper than
 * auditing every path they can take.
 */
export function scrubDelhiverySecrets(text: string): string {
  let out = String(text);
  out = out.replace(/(Token\s+)[A-Za-z0-9._-]{8,}/gi, '$1[redacted]');
  out = out.replace(/([?&]token=)[^&\s]+/gi, '$1[redacted]');
  const token = env.delhivery.apiToken;
  if (token && token.length >= 8) out = out.split(token).join('[redacted]');
  return out;
}

async function delhiveryRequest<T = any>(
  path: string,
  options: Parameters<typeof httpJson>[1] = {}
): Promise<ReturnType<typeof httpJson<T>>> {
  const token = env.delhivery.apiToken;
  if (!token) {
    return { ok: false, status: 401, error: 'DELHIVERY_TOKEN is not configured.', retryable: false };
  }
  const res = await transport<T>(`${apiBase()}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Token ${token}`,
    },
  });
  if (res.error) res.error = scrubDelhiverySecrets(res.error);
  return res;
}

/** Delhivery timestamps look like `2024-05-21T14:03:11.123` — local time, no
 * offset. Interpreted as IST, the only timezone the account reports in. */
export function parseDelhiveryDate(value: unknown): Date | null {
  const text = typeof value === 'string' ? value.trim() : null;
  if (!text) return null;
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const withOffset = new Date(text);
    return Number.isNaN(withOffset.getTime()) ? null : withOffset;
  }
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || '0'));
  const parsed = new Date(utcMs - (5 * 60 + 30) * 60 * 1000);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const CAPABILITIES: ProviderCapabilities = {
  // Delhivery carries the parcel itself. There is no list of carriers and
  // nothing to choose between, so no caller should be rate shopping.
  ratesShopping: false,
  waybillPreallocation: true,
  warehouseLevelPickup: true,
  shipmentEdit: true,
  manifest: false,
  invoice: false,
};

// ------------------------------------------
// Live adapter
// ------------------------------------------

const liveProvider: ShipmentProvider = {
  name: 'delhivery',
  isMock: false,
  capabilities: CAPABILITIES,

  async checkPincode({ deliveryPincode, isCod }) {
    if (!/^\d{6}$/.test(String(deliveryPincode || ''))) {
      return { ok: false, error: 'Delivery pincode must be 6 digits.', retryable: false };
    }

    // One pincode per call, as documented. Batching is possible but a batched
    // failure is far harder to attribute, and this runs once per checkout.
    const res = await delhiveryRequest<any>(
      `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(deliveryPincode)}`,
      { timeoutMs: 15000, attempts: 2 }
    );
    if (!res.ok) {
      return { ok: false, error: res.error || 'Serviceability lookup failed.', retryable: !!res.retryable };
    }

    const codes = res.data?.delivery_codes;
    // An empty list is the documented way of saying "we do not deliver here".
    // It is a successful answer, not a failure — the caller needs to tell a
    // customer "not serviceable", not "try again".
    if (!Array.isArray(codes) || codes.length === 0) {
      return { ok: true, value: { serviceable: false, temporary: false, raw: res.data } };
    }

    const postal = codes[0]?.postal_code || {};
    const remark = typeof postal.remarks === 'string' ? postal.remarks.trim() : '';
    // A blank remark means serviceable. "Embargo" means temporarily not —
    // a distinction worth keeping, because one is a permanent refusal to sell
    // into an area and the other clears on its own.
    const embargoed = /embargo/i.test(remark);

    return {
      ok: true,
      value: {
        serviceable: remark === '',
        temporary: embargoed,
        remark: remark || undefined,
        city: postal.city || undefined,
        state: postal.state_code || undefined,
        codAvailable: postal.cod === 'Y',
        prepaidAvailable: postal.pre_paid === 'Y',
        raw: res.data,
      },
    };
  },

  async fetchWaybill() {
    // The token goes in the query string for this endpoint, which is how
    // Delhivery documents it. scrubDelhiverySecrets strips `token=` out of any
    // error text before it can be logged.
    const token = env.delhivery.apiToken;
    if (!token) return { ok: false, error: 'DELHIVERY_TOKEN is not configured.', retryable: false };

    const res = await transport<any>(
      `${apiBase()}/waybill/api/fetch/json/?token=${encodeURIComponent(token)}`,
      { timeoutMs: 15000, attempts: 2 }
    );
    if (!res.ok) {
      return { ok: false, error: scrubDelhiverySecrets(res.error || 'Waybill fetch failed.'), retryable: !!res.retryable };
    }

    // The endpoint answers with a bare quoted string rather than an object.
    const raw = typeof res.data === 'string' ? res.data : res.data?.waybill ?? '';
    const waybill = String(raw).replace(/^"+|"+$/g, '').trim();
    if (!waybill) {
      return { ok: false, error: 'Delhivery returned no waybill.', retryable: true };
    }
    return { ok: true, value: { waybill } };
  },

  async createShipment(input, paymentMode) {
    const pickupLocation = env.delhivery.pickupLocation;
    // Checked locally rather than discovered through a rejected shipment: a
    // wrong or missing warehouse name is the single most common reason
    // create.json fails, and the API's own error does not say so clearly.
    if (!pickupLocation) {
      return {
        ok: false,
        error: 'DELHIVERY_PICKUP_NAME is not set — it must match the registered warehouse name exactly.',
        retryable: false,
      };
    }
    if (!input.waybill) {
      return { ok: false, error: 'No waybill supplied; fetch one before creating the shipment.', retryable: false };
    }

    const productsDesc = input.items.map((i) => `${i.name} x${i.units}`).join(', ').slice(0, 250);
    const totalUnits = input.items.reduce((n, i) => n + i.units, 0);

    const shipment: Record<string, unknown> = {
      name: input.customerName,
      // Our order number, so Delhivery's records and ours line up and the
      // tracking API can be queried by ref_ids.
      order: input.orderNumber,
      phone: input.customerPhone,
      add: [input.address.addressLine1, input.address.addressLine2].filter(Boolean).join(', '),
      pin: input.address.pinCode,
      city: input.address.city,
      state: input.address.state,
      country: input.address.country || 'India',
      payment_mode: PAYMENT_MODE[paymentMode],
      total_amount: input.total,
      products_desc: productsDesc,
      quantity: totalUnits,
      weight: Math.round(input.weightKg * 1000), // grams
      shipment_width: input.breadthCm,
      shipment_height: input.heightCm,
      shipment_length: input.lengthCm,
      waybill: input.waybill,
      seller_name: env.delhivery.sellerName,
      seller_add: env.delhivery.sellerAddress || '',
    };

    // COD must carry the amount to collect. Sending a COD shipment without one
    // is how a parcel gets delivered for free.
    if (paymentMode === 'COD') shipment.cod_amount = input.total;
    if (input.sellerInvoice) shipment.seller_inv = input.sellerInvoice;

    const body = {
      shipments: [shipment],
      pickup_location: { name: pickupLocation },
    };

    // create.json takes form-encoded `format=json&data=<json>`, not a JSON
    // body — the one endpoint here that differs.
    const encoded = `format=json&data=${encodeURIComponent(JSON.stringify(body))}`;

    const res = await delhiveryRequest<any>('/api/cmu/create.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encoded,
      timeoutMs: 30000,
      // Exactly one attempt. Creation is not idempotent at Delhivery, and a
      // retry after a timeout risks a second shipment against the same
      // waybill. Duplicate protection is the unique index on shipments.order_id
      // plus the persisted waybill, not hope.
      attempts: 1,
    });

    if (!res.ok) {
      return { ok: false, error: res.error || 'Delhivery did not create the shipment.', retryable: !!res.retryable };
    }

    // Delhivery answers 200 with success:false and a per-package remark when
    // it rejects a shipment, so the HTTP status alone proves nothing.
    const pkg = res.data?.packages?.[0];
    const accepted = res.data?.success === true && pkg && pkg.status !== 'Fail';
    if (!accepted) {
      const remark = pkg?.remarks?.join?.('; ') || res.data?.rmk || 'Delhivery rejected the shipment.';
      return { ok: false, error: scrubDelhiverySecrets(String(remark)), retryable: false };
    }

    return {
      ok: true,
      value: {
        waybill: String(pkg.waybill || input.waybill),
        providerOrderRef: pkg.refnum ? String(pkg.refnum) : input.orderNumber,
        courierName: 'Delhivery',
        trackingUrl: `https://www.delhivery.com/track/package/${encodeURIComponent(String(pkg.waybill || input.waybill))}`,
        raw: res.data,
      },
    };
  },

  async track(waybill, orderRef) {
    const params = new URLSearchParams();
    if (waybill) params.set('waybill', waybill);
    if (orderRef) params.set('ref_ids', orderRef);
    if (![...params.keys()].length) {
      return { ok: false, error: 'Tracking needs a waybill or an order reference.', retryable: false };
    }

    const res = await delhiveryRequest<any>(`/api/v1/packages/json/?${params.toString()}`, {
      timeoutMs: 20000,
      attempts: 2,
    });
    if (!res.ok) return { ok: false, error: res.error || 'Tracking lookup failed.', retryable: !!res.retryable };

    const shipment = res.data?.ShipmentData?.[0]?.Shipment;
    if (!shipment) {
      return { ok: false, error: 'Delhivery returned no shipment for that waybill.', retryable: false };
    }

    const statusBlock = shipment.Status || {};
    const providerStatus = statusBlock.Status ?? null;
    const providerStatusType = statusBlock.StatusType ?? null;
    const mapped = mapDelhiveryStatus(providerStatusType, providerStatus);

    const rawScans: any[] = Array.isArray(shipment.Scans) ? shipment.Scans : [];
    const scans: TrackingScan[] = rawScans
      .map((entry) => {
        const detail = entry?.ScanDetail || entry || {};
        return {
          rawDate: typeof detail.ScanDateTime === 'string' ? detail.ScanDateTime : null,
          scanAt: parseDelhiveryDate(detail.ScanDateTime),
          activity: detail.Instructions || detail.Scan || null,
          location: detail.ScannedLocation || null,
          providerStatus: detail.Scan ?? null,
          providerStatusType: detail.StatusType ?? null,
        } as TrackingScan;
      })
      .filter((s) => s.rawDate || s.activity || s.location);

    const events: OrderTimelineEvent[] = scans
      .map((scan) => {
        const scanStatus = mapDelhiveryStatus(scan.providerStatusType, scan.providerStatus);
        return {
          status: (scanStatus && SHIPPING_TIMELINE_STATUS[scanStatus]) || 'SHIPPED',
          timestamp: (scan.scanAt || new Date()).toISOString(),
          note: scan.activity || '',
          completed: true,
        } as OrderTimelineEvent;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const deliveredAt =
      mapped === 'DELIVERED' && statusBlock.StatusDateTime
        ? (parseDelhiveryDate(statusBlock.StatusDateTime) || new Date()).toISOString()
        : undefined;

    return {
      ok: true,
      value: {
        status: mapped,
        providerStatus,
        providerStatusType,
        scans,
        events,
        courierName: 'Delhivery',
        deliveredAt,
        expectedDelivery: shipment.ExpectedDeliveryDate
          ? (parseDelhiveryDate(shipment.ExpectedDeliveryDate) || undefined)?.toISOString()
          : undefined,
        raw: res.data,
      },
    };
  },

  async getLabel({ waybill }) {
    if (!waybill) return { ok: false, error: 'No waybill to label.', retryable: false };
    const res = await delhiveryRequest<any>(
      `/api/p/packing_slip?wbns=${encodeURIComponent(waybill)}&pdf=true&pdf_size=4R`,
      { timeoutMs: 25000, attempts: 2 }
    );
    if (!res.ok) return { ok: false, error: res.error || 'Label generation failed.', retryable: !!res.retryable };

    const pkg = res.data?.packages?.[0];
    const url = pkg?.pdf_download_link;
    if (!url) return { ok: false, error: 'Delhivery returned no label URL.', retryable: false };
    return { ok: true, value: { labelUrl: String(url), raw: res.data } };
  },

  async requestPickup(input) {
    if (!input.pickupLocation) {
      return { ok: false, error: 'No pickup location configured.', retryable: false };
    }
    const res = await delhiveryRequest<any>('/fm/request/new/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        pickup_location: input.pickupLocation,
        pickup_date: input.pickupDate,
        pickup_time: input.pickupTime,
        expected_package_count: input.expectedPackageCount,
      },
      timeoutMs: 25000,
      // One attempt: a retried pickup booking is a second van, and the
      // duplicate guard lives in the database rather than here.
      attempts: 1,
    });
    if (!res.ok) return { ok: false, error: res.error || 'Pickup request failed.', retryable: !!res.retryable };

    return {
      ok: true,
      value: {
        pickupId: res.data?.pickup_id ? String(res.data.pickup_id) : undefined,
        scheduledFor: `${input.pickupDate} ${input.pickupTime}`,
        raw: res.data,
      },
    };
  },

  async cancelShipment({ waybill }) {
    const res = await delhiveryRequest<any>('/api/p/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { waybill, cancellation: 'true' },
      timeoutMs: 20000,
      attempts: 2,
    });
    if (!res.ok) return { ok: false, error: res.error || 'Cancellation failed.', retryable: !!res.retryable };
    // Delhivery answers 200 with status:false when it will not cancel — once a
    // parcel is moving, for instance. Accepting that as success would mark an
    // order cancelled while the parcel is still on its way to the customer.
    if (res.data && res.data.status === false) {
      return { ok: false, error: scrubDelhiverySecrets(String(res.data.remark || 'Delhivery refused the cancellation.')), retryable: false };
    }
    return { ok: true, value: undefined };
  },

  async editShipment({ waybill, changes }) {
    const res = await delhiveryRequest<any>('/api/p/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { waybill, ...changes },
      timeoutMs: 20000,
      attempts: 2,
    });
    if (!res.ok) return { ok: false, error: res.error || 'Edit failed.', retryable: !!res.retryable };
    if (res.data && res.data.status === false) {
      return { ok: false, error: scrubDelhiverySecrets(String(res.data.remark || 'Delhivery refused the edit.')), retryable: false };
    }
    return { ok: true, value: undefined };
  },

  async expectedTat({ originPin, destinationPin, expectedPickupDate }) {
    const params = new URLSearchParams({
      origin_pin: originPin,
      destination_pin: destinationPin,
      mot: 'S',
      pdt: 'B2C',
    });
    if (expectedPickupDate) params.set('expected_pickup_date', expectedPickupDate);

    const res = await delhiveryRequest<any>(`/api/dc/expected_tat?${params.toString()}`, {
      timeoutMs: 12000,
      attempts: 1,
    });
    // Advisory only. A failure here must never block anything, so the caller
    // gets ok:false and is expected to carry on without an estimate.
    if (!res.ok) return { ok: false, error: res.error || 'TAT lookup failed.', retryable: !!res.retryable };
    return {
      ok: true,
      value: { expectedDeliveryDate: res.data?.data?.expected_delivery_date || undefined, raw: res.data },
    };
  },
};

// ------------------------------------------
// Mock adapter
// ------------------------------------------

interface MockShipmentState {
  waybill: string;
  orderNumber: string;
  statusType: string;
  status: string;
  scans: TrackingScan[];
}

const mockShipments = new Map<string, MockShipmentState>();
const mockPickups: { location: string; date: string; count: number }[] = [];
let mockWaybillCounter = 0;

function mockRef(prefix: string): string {
  return `${prefix}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export const mockDelhiveryProvider: ShipmentProvider & {
  /** Test seam: advances a mock shipment, as a courier scan would. */
  simulateScan(waybill: string, statusType: string, status: string, note?: string): void;
  pickupCount(): number;
  reset(): void;
} = {
  name: 'delhivery-mock',
  isMock: true,
  capabilities: CAPABILITIES,

  async checkPincode({ deliveryPincode }) {
    if (!/^\d{6}$/.test(String(deliveryPincode || ''))) {
      return { ok: false, error: 'Delivery pincode must be 6 digits.', retryable: false };
    }
    // Deliberate ranges so every branch is reachable in tests rather than only
    // the happy one.
    if (deliveryPincode.startsWith('99')) {
      return { ok: true, value: { serviceable: false, temporary: false, raw: { mock: true } } };
    }
    if (deliveryPincode.startsWith('98')) {
      return { ok: true, value: { serviceable: false, temporary: true, remark: 'Embargo', raw: { mock: true } } };
    }
    return {
      ok: true,
      value: {
        serviceable: true,
        temporary: false,
        remark: undefined,
        city: 'Mock City',
        state: 'MC',
        codAvailable: true,
        prepaidAvailable: true,
        raw: { mock: true },
      },
    };
  },

  async fetchWaybill() {
    mockWaybillCounter++;
    return { ok: true, value: { waybill: `MOCKWB${String(mockWaybillCounter).padStart(8, '0')}` } };
  },

  async createShipment(input, paymentMode) {
    if (!env.delhivery.pickupLocation) {
      return { ok: false, error: 'DELHIVERY_PICKUP_NAME is not set.', retryable: false };
    }
    if (!input.waybill) {
      return { ok: false, error: 'No waybill supplied; fetch one before creating the shipment.', retryable: false };
    }
    if (mockShipments.has(input.waybill)) {
      return { ok: false, error: 'A shipment already exists for that waybill.', retryable: false };
    }
    mockShipments.set(input.waybill, {
      waybill: input.waybill,
      orderNumber: input.orderNumber,
      statusType: 'UD',
      status: 'Manifested',
      scans: [],
    });
    return {
      ok: true,
      value: {
        waybill: input.waybill,
        providerOrderRef: input.orderNumber,
        courierName: 'Delhivery',
        trackingUrl: `https://mock.delhivery.local/track/${input.waybill}`,
        raw: { mock: true, paymentMode: PAYMENT_MODE[paymentMode] },
      },
    };
  },

  async track(waybill) {
    const state = mockShipments.get(waybill);
    if (!state) return { ok: false, error: 'No such mock shipment.', retryable: false };
    const mapped = mapDelhiveryStatus(state.statusType, state.status);
    return {
      ok: true,
      value: {
        status: mapped,
        providerStatus: state.status,
        providerStatusType: state.statusType,
        scans: state.scans,
        events: state.scans.map((s) => ({
          status: (mapDelhiveryStatus(s.providerStatusType, s.providerStatus) &&
            SHIPPING_TIMELINE_STATUS[mapDelhiveryStatus(s.providerStatusType, s.providerStatus)!]) || 'SHIPPED',
          timestamp: (s.scanAt || new Date()).toISOString(),
          note: s.activity || '',
          completed: true,
        })),
        courierName: 'Delhivery',
        deliveredAt: mapped === 'DELIVERED' ? new Date().toISOString() : undefined,
        raw: { mock: true },
      },
    };
  },

  async getLabel({ waybill }) {
    if (!mockShipments.has(waybill)) return { ok: false, error: 'No such mock shipment.', retryable: false };
    return { ok: true, value: { labelUrl: `https://mock.delhivery.local/labels/${waybill}.pdf`, raw: { mock: true } } };
  },

  async requestPickup(input) {
    mockPickups.push({ location: input.pickupLocation, date: input.pickupDate, count: input.expectedPackageCount });
    return { ok: true, value: { pickupId: mockRef('PU'), scheduledFor: `${input.pickupDate} ${input.pickupTime}`, raw: { mock: true } } };
  },

  async cancelShipment({ waybill }) {
    const state = mockShipments.get(waybill);
    if (!state) return { ok: false, error: 'No such mock shipment.', retryable: false };
    // Mirrors the live refusal: once it has moved, it cannot be cancelled.
    if (state.statusType !== 'UD' || state.status !== 'Manifested') {
      return { ok: false, error: 'Shipment has already moved and cannot be cancelled.', retryable: false };
    }
    state.statusType = 'CN';
    state.status = 'Canceled';
    return { ok: true, value: undefined };
  },

  async editShipment({ waybill }) {
    if (!mockShipments.has(waybill)) return { ok: false, error: 'No such mock shipment.', retryable: false };
    return { ok: true, value: undefined };
  },

  async expectedTat() {
    const d = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    return { ok: true, value: { expectedDeliveryDate: d.toISOString().slice(0, 10), raw: { mock: true } } };
  },

  simulateScan(waybill, statusType, status, note) {
    const state = mockShipments.get(waybill);
    if (!state) return;
    state.statusType = statusType;
    state.status = status;
    state.scans.push({
      rawDate: new Date().toISOString(),
      scanAt: new Date(),
      activity: note || `${statusType}/${status}`,
      location: 'MOCK HUB',
      providerStatus: status,
      providerStatusType: statusType,
    });
  },

  pickupCount() {
    return mockPickups.length;
  },

  reset() {
    mockShipments.clear();
    mockPickups.length = 0;
    mockWaybillCounter = 0;
  },
};

// ------------------------------------------
// Selection and registration
// ------------------------------------------

export function getShipmentProvider(): ShipmentProvider {
  return env.delhivery.enabled ? liveProvider : mockDelhiveryProvider;
}

/** Whether real shipments should actually be created. False in mock mode in
 * production, so a misconfigured deploy never silently stops shipping real
 * orders without anyone noticing. */
export function shipmentProviderConfigured(): boolean {
  return env.delhivery.enabled;
}

/**
 * Registers Delhivery with the CourierProvider registry that
 * shipping.service.ts already exposes, which is what the customer tracking
 * screen and the admin read through.
 */
export function registerDelhiveryTracking(): void {
  const provider = getShipmentProvider();
  // The mock is registered in development too, so the tracking screen's
  // courier path is exercised rather than only its fallback.
  if (!env.delhivery.enabled && env.isProduction) return;

  const courierProvider: CourierProvider = {
    name: 'Delhivery',
    async fetchShipment(trackingNumber: string): Promise<CourierShipment | null> {
      const result = await provider.track(trackingNumber);
      if (!result.ok || !result.value) return null;
      return {
        trackingNumber,
        courierPartner: result.value.courierName || 'Delhivery',
        trackingUrl: `https://www.delhivery.com/track/package/${encodeURIComponent(trackingNumber)}`,
        events: result.value.events,
        currentStatus: result.value.status ? SHIPPING_TIMELINE_STATUS[result.value.status] : undefined,
      };
    },
  };

  registerCourierProvider('delhivery', courierProvider);
  // Orders store the carrier's display name in courier_partner, and
  // resolveProvider() looks up by that value first.
  registerCourierProvider('Delhivery', courierProvider);
  registerCourierProvider('delhivery-mock', courierProvider);
}

// ------------------------------------------
// Webhook (Scan Push)
// ------------------------------------------

/**
 * Verifies a Delhivery Scan Push delivery.
 *
 * Delhivery configures the webhook through its own onboarding process and the
 * shared-secret arrangement is agreed there, so this checks a token Glamirk
 * controls rather than assuming a signature scheme. Constant-time, with a
 * length pre-check because timingSafeEqual throws on a length mismatch.
 *
 * Fails closed: with no secret configured nothing is accepted, in any
 * environment. The Shiprocket route once fell back to a constant committed in
 * this repository, and that is not repeated here.
 */
export function verifyDelhiveryWebhook(providedKey: string | undefined | null): boolean {
  const secret = env.delhivery.webhookSecret;
  if (!secret) return false;
  if (typeof providedKey !== 'string' || providedKey.length === 0) return false;
  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(providedKey, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** One Scan Push shipment payload, normalised. Only fields Delhivery
 * documents are read; nothing is invented. */
export interface DelhiveryScanPayload {
  waybill: string | null;
  orderRef: string | null;
  status: string | null;
  statusType: string | null;
  statusCode: string | null;
  statusDateTimeRaw: string | null;
  statusDateTime: Date | null;
  location: string | null;
  instructions: string | null;
  scans: TrackingScan[];
}

function text(value: unknown, max = 255): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? t.slice(0, max) : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Parses a Scan Push body.
 *
 * Delhivery posts `{ "Shipment": { ... } }`. Returns null when the body is not
 * an object at all; a body missing identifiers still parses, because the
 * handler — not the parser — decides what to do with something it cannot map.
 */
export function parseDelhiveryScanPush(body: unknown): DelhiveryScanPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const root = body as Record<string, any>;
  const shipment = root.Shipment && typeof root.Shipment === 'object' ? root.Shipment : root;
  const statusBlock = shipment.Status && typeof shipment.Status === 'object' ? shipment.Status : {};

  const rawScans: any[] = Array.isArray(shipment.Scans) ? shipment.Scans.slice(0, 200) : [];
  const scans: TrackingScan[] = rawScans
    .map((entry) => {
      const detail = entry?.ScanDetail || entry || {};
      return {
        rawDate: text(detail.ScanDateTime, 64),
        scanAt: parseDelhiveryDate(detail.ScanDateTime),
        activity: text(detail.Instructions || detail.Scan, 512),
        location: text(detail.ScannedLocation, 255),
        providerStatus: text(detail.Scan, 128),
        providerStatusType: text(detail.StatusType, 16),
      } as TrackingScan;
    })
    .filter((s) => s.rawDate || s.activity || s.location);

  return {
    waybill: text(shipment.AWB ?? shipment.Waybill, 64),
    orderRef: text(shipment.ReferenceNo ?? shipment.OrderId ?? shipment.Order, 128),
    status: text(statusBlock.Status, 128),
    statusType: text(statusBlock.StatusType, 16),
    statusCode: text(statusBlock.StatusCode, 32),
    statusDateTimeRaw: text(statusBlock.StatusDateTime, 64),
    statusDateTime: parseDelhiveryDate(statusBlock.StatusDateTime),
    location: text(statusBlock.StatusLocation, 255),
    instructions: text(statusBlock.Instructions, 512),
    scans,
  };
}

/**
 * Stable idempotency key for one scan.
 *
 * Delhivery sends no event id, and inventing one would defeat the purpose — a
 * random id makes every redelivery look new. Derived from the fields that
 * identify a physical scan and that Delhivery does send on every push.
 */
export function delhiveryScanKey(parts: {
  waybill: string | null;
  orderId: string;
  rawDate: string | null;
  activity: string | null;
  location: string | null;
}): string {
  const material = [parts.waybill || '', parts.orderId, parts.rawDate || '', parts.activity || '', parts.location || ''].join('|');
  return 'dlvscan-' + crypto.createHash('sha256').update(material).digest('hex').slice(0, 40);
}

/** Idempotency key for the push's own status change, as opposed to its scans. */
export function delhiveryStatusKey(parts: {
  waybill: string | null;
  orderId: string;
  statusType: string | null;
  status: string | null;
  timestamp: string | null;
}): string {
  const material = [
    parts.waybill || '',
    parts.orderId,
    parts.statusType || '',
    parts.status || '',
    parts.timestamp || '',
  ].join('|');
  return 'dlvstat-' + crypto.createHash('sha256').update(material).digest('hex').slice(0, 40);
}
