import crypto from 'crypto';
import { env } from '../config/env';
import { httpJson } from './http.client';
import { ShippingStatus, OrderStatus, OrderTimelineEvent } from '@glamirk/shared/types';
import { registerCourierProvider, CourierProvider, CourierShipment } from './shipping.service';

// ==========================================
// SHIPROCKET
//
// Shipping aggregator: one account fronting many couriers, which is why
// courier *selection* is a real step here rather than a hardcoded carrier.
//
// Like the payment gateway, this is two adapters behind one interface chosen
// by env.shiprocket.enabled. With live mode off nothing reaches Shiprocket —
// no order is created, no pickup is scheduled, no AWB is bought — but the full
// create → select courier → assign AWB → label → track sequence still runs
// against the mock so it can be tested and demoed.
//
// Credentials live only in env and only in this process. Nothing here is ever
// returned to a browser.
// ==========================================

/** Every documented endpoint lives under this prefix. The host comes from
 * env.shiprocket.baseUrl, which is validated (HTTPS, Shiprocket-or-loopback)
 * before it is allowed to prefix a token-bearing request. */
function apiBase(): string {
  return `${env.shiprocket.baseUrl}/v1/external`;
}

/**
 * Outbound transport, injectable.
 *
 * Tests must never reach the real Shiprocket account — a stray call would
 * create a live order or buy a real AWB. Rather than relying on "the live
 * adapter is only selected when the flag is on", the transport itself is a
 * seam, so the live adapter's own auth, retry and error handling can be
 * exercised against a double.
 */
type Transport = typeof httpJson;
let transport: Transport = httpJson;

/** Test seam. Returns a function that restores the real transport. */
export function __setShiprocketTransportForTests(next: Transport | null): () => void {
  const previous = transport;
  transport = next || httpJson;
  resetShiprocketTokenCache();
  return () => {
    transport = previous;
    resetShiprocketTokenCache();
  };
}

export interface CourierOption {
  courierCompanyId: string;
  courierName: string;
  rate: number;
  estimatedDeliveryDays?: number;
  /** Shiprocket's own performance score; used to break ties on price. */
  rating?: number;
  isSurface?: boolean;
}

export interface CreateShipmentInput {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pinCode: string;
  };
  items: { name: string; sku: string; units: number; sellingPrice: number }[];
  subtotal: number;
  discount: number;
  total: number;
  isCod: boolean;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

export interface PickupResult {
  /** Shiprocket's scheduled-date string, when the response carries one. */
  scheduledDate?: string;
  /** Free-text pickup status from the provider, for the audit trail. */
  pickupStatus?: string;
  raw?: unknown;
}

export interface CreatedShipment {
  providerOrderId: string;
  providerShipmentId: string;
  awbCode?: string;
  courierName?: string;
  courierCompanyId?: string;
  trackingUrl?: string;
  labelUrl?: string;
  freightCharge?: number;
  appliedWeight?: number;
  raw?: Record<string, unknown>;
}

/**
 * One open shape rather than a discriminated union on `ok`.
 *
 * This project compiles without `strict`, where narrowing on a literal-boolean
 * discriminant is unreliable — the same reason validateAddressPayload in
 * customer.routes.ts is written this way. Callers check `ok` and then read
 * `value`/`error`, which are optional at the type level but always present in
 * practice for their respective branch.
 */
type Result<T> = { ok: boolean; value?: T; error?: string; retryable?: boolean };

export interface ShippingProvider {
  readonly name: string;
  readonly isMock: boolean;
  checkServiceability(input: {
    deliveryPincode: string;
    weightKg: number;
    isCod: boolean;
    declaredValue: number;
  }): Promise<Result<CourierOption[]>>;
  createShipment(input: CreateShipmentInput): Promise<Result<CreatedShipment>>;
  assignAwb(input: { shipmentId: string; courierCompanyId?: string }): Promise<Result<{ awbCode: string; courierName: string; courierCompanyId: string }>>;
  /** Asks the courier to collect. Only valid once an AWB exists. */
  generatePickup(input: { shipmentId: string }): Promise<Result<PickupResult>>;
  generateLabel(input: { shipmentId: string }): Promise<Result<{ labelUrl: string; raw?: unknown }>>;
  /** Handover document for a batch of shipments. */
  generateManifest(input: { shipmentId: string }): Promise<Result<{ manifestUrl?: string; raw?: unknown }>>;
  printManifest(input: { orderIds: string[] }): Promise<Result<{ manifestUrl: string; raw?: unknown }>>;
  generateInvoice(input: { orderIds: string[] }): Promise<Result<{ invoiceUrl: string; raw?: unknown }>>;
  track(awbCode: string): Promise<
    Result<{
      status: ShippingStatus;
      events: OrderTimelineEvent[];
      /** The same activities in raw scan form, so a poll can be written to the
       * tracking history under the same dedupe key a webhook would use. */
      scans: ShiprocketScan[];
      courierName?: string;
      deliveredAt?: string;
    }>
  >;
  cancelShipment(input: { awbCode: string }): Promise<Result<void>>;
}

// ------------------------------------------
// Status mapping
// ------------------------------------------

/**
 * Shiprocket reports status as both a numeric code and free text, and the text
 * varies by courier. The numeric code is authoritative where present; the text
 * is only consulted as a fallback.
 *
 * Anything unrecognised maps to IN_TRANSIT rather than to a terminal state —
 * guessing "delivered" from an unknown code would close an order that is still
 * moving, and guessing "failed" would alarm a customer whose parcel is fine.
 */
const SHIPROCKET_STATUS_CODES: Record<number, ShippingStatus> = {
  1: 'AWB_ASSIGNED',
  2: 'PICKUP_SCHEDULED',
  3: 'PICKED_UP',
  4: 'CANCELLED',
  5: 'CANCELLED',
  6: 'IN_TRANSIT',
  7: 'DELIVERED',
  8: 'RTO_INITIATED',
  9: 'RTO_DELIVERED',
  10: 'PICKUP_SCHEDULED',
  17: 'OUT_FOR_DELIVERY',
  18: 'IN_TRANSIT',
  19: 'OUT_FOR_DELIVERY',
  20: 'FAILED_DELIVERY',
  21: 'FAILED_DELIVERY',
  38: 'IN_TRANSIT',
  42: 'PICKED_UP',
};

const SHIPROCKET_STATUS_TEXT: { match: RegExp; status: ShippingStatus }[] = [
  { match: /^delivered/i, status: 'DELIVERED' },
  { match: /out for delivery/i, status: 'OUT_FOR_DELIVERY' },
  { match: /rto.*deliver/i, status: 'RTO_DELIVERED' },
  { match: /\brto\b|return to origin/i, status: 'RTO_INITIATED' },
  { match: /undelivered|delivery failed|npr/i, status: 'FAILED_DELIVERY' },
  { match: /picked ?up|pickup complete/i, status: 'PICKED_UP' },
  { match: /pickup (scheduled|generated|queued)/i, status: 'PICKUP_SCHEDULED' },
  { match: /cancel/i, status: 'CANCELLED' },
  { match: /awb assigned/i, status: 'AWB_ASSIGNED' },
  { match: /transit|shipped|in ?transit/i, status: 'IN_TRANSIT' },
];

/**
 * Maps a Shiprocket status to a Glamirk ShippingStatus, or null when neither
 * the code nor the text is recognised.
 *
 * Used by the webhook. An unknown status there must NOT be approximated: the
 * caller records it verbatim and leaves the order's shipping status alone.
 * Guessing is how a parcel that is still moving gets marked delivered — which
 * on this system also converts reserved stock to sold.
 */
export function mapShiprocketStatusStrict(
  code: number | undefined | null,
  text?: string | null
): ShippingStatus | null {
  if (typeof code === 'number' && Number.isFinite(code) && SHIPROCKET_STATUS_CODES[code]) {
    return SHIPROCKET_STATUS_CODES[code];
  }
  if (text) {
    const hit = SHIPROCKET_STATUS_TEXT.find((entry) => entry.match.test(text));
    if (hit) return hit.status;
  }
  return null;
}

/**
 * Lenient variant, for the polling path.
 *
 * Tracking-API scans are a narrative of a parcel already known to be moving, so
 * an unrecognised intermediate scan is far more likely to be a courier's own
 * wording for "in transit" than a state we care about. Unknown therefore
 * degrades to IN_TRANSIT here — never to a terminal state.
 */
export function mapShiprocketStatus(code: number | undefined | null, text?: string | null): ShippingStatus {
  return mapShiprocketStatusStrict(code, text) || 'IN_TRANSIT';
}

/** Shipping status → the order timeline status it should appear as. Only the
 * stages the customer-facing timeline knows about are mapped. */
const SHIPPING_TIMELINE_STATUS: Partial<Record<ShippingStatus, OrderStatus>> = {
  PICKED_UP: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RTO_INITIATED: 'RTO',
  RTO_DELIVERED: 'RTO',
};

// ------------------------------------------
// Auth token cache
// ------------------------------------------

/**
 * Shiprocket issues a bearer token valid for ~10 days from an email/password
 * login. Logging in per request would be both slow and a good way to get rate
 * limited, so the token is cached in process and refreshed slightly early.
 *
 * The in-flight promise is shared: without it, ten concurrent calls arriving
 * on a cold cache would each start their own login.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<string | null> | null = null;
/** Logins performed since the last cache reset. Test-only observability — it
 * is how "the token was reused rather than re-fetched" is asserted. */
let loginCount = 0;

// Shiprocket documents the token as valid for 240 hours (10 days). Cached for
// nine, and refreshed an hour before that, so a token is never used in the
// window where it might expire mid-request.
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;

/** Drops the cached token. Used by the test seam and after a 401. */
export function resetShiprocketTokenCache(): void {
  cachedToken = null;
  tokenInFlight = null;
  loginCount = 0;
}

export function __shiprocketLoginCountForTests(): number {
  return loginCount;
}

async function login(): Promise<string | null> {
  loginCount++;
  const res = await transport<any>(`${apiBase()}/auth/login`, {
    method: 'POST',
    body: { email: env.shiprocket.email, password: env.shiprocket.password },
    timeoutMs: 15000,
    // Two attempts: a login that fails on a network blip should not fail the
    // shipment behind it. Not more — repeatedly replaying credentials against
    // an auth endpoint is how an API user gets locked out.
    attempts: 2,
  });
  if (!res.ok || typeof res.data?.token !== 'string' || !res.data.token) {
    // Logs the HTTP status and the provider's message. Never the email, never
    // the password, never a partial token.
    console.error('[shiprocket] authentication failed:', res.status, res.error || 'no token in response');
    return null;
  }
  return res.data.token;
}

async function getToken(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) {
    return cachedToken.value;
  }
  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = (async () => {
    const token = await login();
    cachedToken = token ? { value: token, expiresAt: Date.now() + TOKEN_TTL_MS } : null;
    return token;
  })();

  try {
    return await tokenInFlight;
  } finally {
    tokenInFlight = null;
  }
}

/**
 * Authenticated request with one automatic re-auth.
 *
 * A token can be revoked server-side before its nominal expiry, which shows up
 * as a 401 on an otherwise valid call. Retrying once with a fresh token turns
 * that into a transparent recovery instead of a failed shipment.
 */
async function authedRequest<T = any>(
  path: string,
  options: Parameters<typeof httpJson>[1] = {},
  isRetry = false
): Promise<ReturnType<typeof httpJson<T>>> {
  const token = await getToken(isRetry);
  if (!token) {
    return { ok: false, status: 401, error: 'Could not authenticate with Shiprocket.', retryable: true };
  }
  const res = await transport<T>(`${apiBase()}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !isRetry) {
    cachedToken = null;
    return authedRequest<T>(path, options, true);
  }
  // The provider's message can echo back parts of the request. Scrubbed before
  // it travels any further, so a token can never reach a log line or an admin
  // error toast through an error string.
  if (res.error) res.error = scrubSecrets(res.error);
  return res;
}

/**
 * Removes anything secret-shaped from an operator-facing string.
 *
 * Defence in depth: nothing here is *supposed* to put a token in an error
 * message, but error strings come from an upstream we do not control and end up
 * in logs, in shipments.last_error, and in admin responses. One regex is
 * cheaper than auditing every path they can take.
 */
export function scrubSecrets(text: string): string {
  let out = String(text);
  // JWT-shaped tokens, which is what Shiprocket issues.
  out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
  out = out.replace(/(bearer\s+)\S+/gi, '$1[redacted]');
  out = out.replace(/("?(?:token|password|api[_-]?key|x-api-key|secret)"?\s*[:=]\s*)"?[^"\s,}]+"?/gi, '$1[redacted]');
  const password = env.shiprocket.password;
  if (password && password.length >= 4) out = out.split(password).join('[redacted]');
  const email = env.shiprocket.email;
  if (email) out = out.split(email).join('[redacted]');
  const webhookSecret = env.shiprocket.webhookSecret;
  if (webhookSecret && webhookSecret.length >= 4) out = out.split(webhookSecret).join('[redacted]');
  return out;
}

/**
 * Validates a document URL that came back from Shiprocket before we store it.
 *
 * Label, manifest and invoice URLs are persisted and then handed to an admin's
 * browser as a link. A provider response is still external input: a
 * `javascript:` URL stored here becomes stored XSS the moment someone clicks
 * it, and an `http://10.x` URL turns the admin panel into an SSRF probe. Only
 * absolute HTTPS survives.
 *
 * Returns undefined rather than throwing — a missing document is a degraded
 * shipment, not a failed one.
 */
export function sanitiseProviderUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  if (parsed.username || parsed.password) return undefined;
  return parsed.toString();
}

// ------------------------------------------
// Courier selection
// ------------------------------------------

/**
 * Picks a courier from the serviceable options.
 *
 * Cheapest wins, with Shiprocket's delivery-performance rating breaking ties
 * — a courier that is ₹2 cheaper but routinely loses parcels is a false
 * economy. No carrier is hardcoded: the list comes from Shiprocket's own
 * serviceability response for this exact pincode pair, weight and COD flag,
 * so an unserviceable route returns nothing rather than a courier that will
 * reject the booking.
 */
export function selectCourier(options: CourierOption[]): CourierOption | null {
  if (options.length === 0) return null;
  return [...options].sort((a, b) => {
    if (a.rate !== b.rate) return a.rate - b.rate;
    return (b.rating || 0) - (a.rating || 0);
  })[0];
}

// ------------------------------------------
// Live adapter
// ------------------------------------------

const liveProvider: ShippingProvider = {
  name: 'shiprocket',
  isMock: false,

  async checkServiceability({ deliveryPincode, weightKg, isCod, declaredValue }) {
    // Every parameter is validated before the call rather than after the
    // failure. Shiprocket answers a malformed serviceability query with a
    // generic 422 that says nothing useful, so a bad pincode would otherwise
    // surface as "serviceability check failed" with no way to tell whether the
    // route is unserviceable or the request was junk.
    if (!env.shiprocket.pickupPincode) {
      return { ok: false, error: 'No pickup pincode configured.', retryable: false };
    }
    if (!/^\d{6}$/.test(String(env.shiprocket.pickupPincode))) {
      return { ok: false, error: 'Configured pickup pincode is not a 6-digit Indian pincode.', retryable: false };
    }
    if (!/^\d{6}$/.test(String(deliveryPincode || ''))) {
      return { ok: false, error: 'Delivery pincode must be 6 digits.', retryable: false };
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      return { ok: false, error: 'Shipment weight must be greater than zero.', retryable: false };
    }
    if (!Number.isFinite(declaredValue) || declaredValue < 0) {
      return { ok: false, error: 'Declared value must be a non-negative number.', retryable: false };
    }
    const params = new URLSearchParams({
      pickup_postcode: env.shiprocket.pickupPincode,
      delivery_postcode: deliveryPincode,
      weight: String(weightKg),
      cod: isCod ? '1' : '0',
      declared_value: String(declaredValue),
    });
    const res = await authedRequest<any>(`/courier/serviceability/?${params.toString()}`, {
      timeoutMs: 15000,
      attempts: 2,
    });
    if (!res.ok) return { ok: false, error: res.error || 'Serviceability check failed.', retryable: !!res.retryable };

    const available = res.data?.data?.available_courier_companies || [];
    const options: CourierOption[] = available.map((c: any) => ({
      courierCompanyId: String(c.courier_company_id),
      courierName: c.courier_name,
      rate: Number(c.rate) || 0,
      estimatedDeliveryDays: Number(c.estimated_delivery_days) || undefined,
      rating: Number(c.rating) || undefined,
      isSurface: c.is_surface === true,
    }));
    return { ok: true, value: options };
  },

  async createShipment(input) {
    const body = {
      order_id: input.orderNumber,
      order_date: new Date(input.createdAt).toISOString().slice(0, 19).replace('T', ' '),
      pickup_location: env.shiprocket.pickupLocation,
      billing_customer_name: input.customerName,
      billing_last_name: '',
      billing_address: input.address.addressLine1,
      billing_address_2: input.address.addressLine2 || '',
      billing_city: input.address.city,
      billing_pincode: input.address.pinCode,
      billing_state: input.address.state,
      billing_country: 'India',
      billing_email: input.customerEmail || '',
      billing_phone: input.customerPhone,
      shipping_is_billing: true,
      order_items: input.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.sellingPrice,
      })),
      payment_method: input.isCod ? 'COD' : 'Prepaid',
      sub_total: input.subtotal - input.discount,
      length: input.lengthCm,
      breadth: input.breadthCm,
      height: input.heightCm,
      weight: input.weightKg,
    };

    const res = await authedRequest<any>('/orders/create/adhoc', {
      method: 'POST',
      body,
      timeoutMs: 25000,
      // Shipment creation is not idempotent on Shiprocket's side, so this is
      // attempted once. A retry risks a duplicate shipment, which the caller
      // handles instead via the unique index on shipments.order_id.
      attempts: 1,
    });
    if (!res.ok || !res.data?.shipment_id) {
      return { ok: false, error: res.error || 'Shiprocket did not create the shipment.', retryable: !!res.retryable };
    }
    return {
      ok: true,
      value: {
        providerOrderId: String(res.data.order_id),
        providerShipmentId: String(res.data.shipment_id),
        raw: res.data,
      },
    };
  },

  async assignAwb({ shipmentId, courierCompanyId }) {
    const res = await authedRequest<any>('/courier/assign/awb', {
      method: 'POST',
      body: {
        shipment_id: shipmentId,
        ...(courierCompanyId ? { courier_id: courierCompanyId } : {}),
      },
      timeoutMs: 25000,
      attempts: 2,
    });
    const data = res.data?.response?.data;
    if (!res.ok || !data?.awb_code) {
      return { ok: false, error: res.error || 'Shiprocket did not return an AWB.', retryable: !!res.retryable };
    }
    return {
      ok: true,
      value: {
        awbCode: String(data.awb_code),
        courierName: data.courier_name || 'Courier',
        courierCompanyId: String(data.courier_company_id || courierCompanyId || ''),
      },
    };
  },

  async generatePickup({ shipmentId }) {
    const numericShipmentId = Number(shipmentId);
    if (!Number.isFinite(numericShipmentId)) {
      return { ok: false, error: 'Shipment id is not valid.', retryable: false };
    }
    const res = await authedRequest<any>('/courier/generate/pickup', {
      method: 'POST',
      body: { shipment_id: [numericShipmentId] },
      timeoutMs: 25000,
      // Retried, but only on retryable transport/5xx failures — httpJson
      // already refuses to replay a 4xx. Duplicate pickup *requests* are
      // prevented a layer up, by the pickup_requested_at marker on the
      // shipment row, not by hoping the call never repeats.
      attempts: 2,
    });
    if (!res.ok) {
      return { ok: false, error: res.error || 'Shiprocket did not schedule a pickup.', retryable: !!res.retryable };
    }
    // Only the two fields Shiprocket documents on this response are read, and
    // both defensively — a successful pickup that reports no scheduled date is
    // still a successful pickup.
    const inner = res.data?.response || {};
    return {
      ok: true,
      value: {
        scheduledDate: typeof inner.pickup_scheduled_date === 'string' ? inner.pickup_scheduled_date : undefined,
        pickupStatus: typeof res.data?.pickup_status !== 'undefined' ? String(res.data.pickup_status) : undefined,
        raw: res.data,
      },
    };
  },

  async generateLabel({ shipmentId }) {
    const numericShipmentId = Number(shipmentId);
    if (!Number.isFinite(numericShipmentId)) {
      return { ok: false, error: 'Shipment id is not valid.', retryable: false };
    }
    const res = await authedRequest<any>('/courier/generate/label', {
      method: 'POST',
      body: { shipment_id: [numericShipmentId] },
      timeoutMs: 25000,
      attempts: 2,
    });
    const labelUrl = sanitiseProviderUrl(res.data?.label_url);
    if (!res.ok || !labelUrl) {
      return { ok: false, error: res.error || 'Shiprocket did not return a label.', retryable: !!res.retryable };
    }
    return { ok: true, value: { labelUrl, raw: res.data } };
  },

  async generateManifest({ shipmentId }) {
    const numericShipmentId = Number(shipmentId);
    if (!Number.isFinite(numericShipmentId)) {
      return { ok: false, error: 'Shipment id is not valid.', retryable: false };
    }
    const res = await authedRequest<any>('/manifests/generate', {
      method: 'POST',
      body: { shipment_id: [numericShipmentId] },
      timeoutMs: 25000,
      attempts: 2,
    });
    if (!res.ok) {
      return { ok: false, error: res.error || 'Shiprocket did not generate a manifest.', retryable: !!res.retryable };
    }
    // The generate call sometimes returns the URL directly and sometimes only
    // confirms generation, leaving /manifests/print to produce it. Both are
    // handled: a missing URL here is not a failure.
    return { ok: true, value: { manifestUrl: sanitiseProviderUrl(res.data?.manifest_url), raw: res.data } };
  },

  async printManifest({ orderIds }) {
    const numericOrderIds = orderIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (numericOrderIds.length === 0) {
      return { ok: false, error: 'No valid Shiprocket order ids to print a manifest for.', retryable: false };
    }
    const res = await authedRequest<any>('/manifests/print', {
      method: 'POST',
      body: { order_ids: numericOrderIds },
      timeoutMs: 25000,
      attempts: 2,
    });
    const manifestUrl = sanitiseProviderUrl(res.data?.manifest_url);
    if (!res.ok || !manifestUrl) {
      return { ok: false, error: res.error || 'Shiprocket did not return a manifest.', retryable: !!res.retryable };
    }
    return { ok: true, value: { manifestUrl, raw: res.data } };
  },

  async generateInvoice({ orderIds }) {
    const numericOrderIds = orderIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (numericOrderIds.length === 0) {
      return { ok: false, error: 'No valid Shiprocket order ids to invoice.', retryable: false };
    }
    const res = await authedRequest<any>('/orders/print/invoice', {
      method: 'POST',
      body: { ids: numericOrderIds },
      timeoutMs: 25000,
      attempts: 2,
    });
    const invoiceUrl = sanitiseProviderUrl(res.data?.invoice_url);
    if (!res.ok || !invoiceUrl) {
      return { ok: false, error: res.error || 'Shiprocket did not return an invoice.', retryable: !!res.retryable };
    }
    return { ok: true, value: { invoiceUrl, raw: res.data } };
  },

  async track(awbCode) {
    const res = await authedRequest<any>(`/courier/track/awb/${encodeURIComponent(awbCode)}`, {
      timeoutMs: 15000,
      attempts: 2,
    });
    if (!res.ok) return { ok: false, error: res.error || 'Tracking lookup failed.', retryable: !!res.retryable };

    const data = res.data?.tracking_data;
    const activities = data?.shipment_track_activities || [];
    const track = data?.shipment_track?.[0];
    const status = mapShiprocketStatus(track?.current_status_id, track?.current_status);

    const events: OrderTimelineEvent[] = activities
      .map((a: any) => {
        const mapped = mapShiprocketStatus(a.status_code ?? a.sr_status, a.status ?? a.activity);
        const scanAt = parseShiprocketDate(a.date);
        return {
          status: SHIPPING_TIMELINE_STATUS[mapped] || 'SHIPPED',
          timestamp: (scanAt || new Date()).toISOString(),
          note: a.activity || a.status || '',
          completed: true,
        } as OrderTimelineEvent;
      })
      // Shiprocket returns newest-first; the timeline component renders oldest-first.
      .reverse();

    // The same activities as raw scans. Deliberately built from the same three
    // documented fields a webhook scan carries, so a polled scan and a webhook
    // scan for the same physical event produce the same dedupe key and only one
    // row survives.
    const scans: ShiprocketScan[] = activities
      .map((a: any) => ({
        rawDate: typeof a.date === 'string' ? a.date.trim() || null : null,
        scanAt: parseShiprocketDate(a.date),
        activity: typeof a.activity === 'string' ? a.activity.trim() || null : null,
        location: typeof a.location === 'string' ? a.location.trim() || null : null,
      }))
      .filter((s: ShiprocketScan) => s.rawDate || s.activity || s.location)
      .reverse();

    return {
      ok: true,
      value: {
        status,
        events,
        scans,
        courierName: track?.courier_name || undefined,
        deliveredAt:
          status === 'DELIVERED' && track?.delivered_date
            ? (parseShiprocketDate(track.delivered_date) || new Date()).toISOString()
            : undefined,
      },
    };
  },

  async cancelShipment({ awbCode }) {
    const res = await authedRequest<any>('/orders/cancel/shipment/awbs', {
      method: 'POST',
      body: { awbs: [awbCode] },
      timeoutMs: 20000,
      attempts: 2,
    });
    if (!res.ok) return { ok: false, error: res.error || 'Shiprocket did not confirm the cancellation.', retryable: !!res.retryable };
    return { ok: true, value: undefined };
  },
};

// ------------------------------------------
// Mock adapter
// ------------------------------------------

interface MockShipmentState {
  shipmentId: string;
  orderId: string;
  awbCode?: string;
  courierName?: string;
  status: ShippingStatus;
  events: OrderTimelineEvent[];
  /** How many times a pickup was actually requested of the "courier". Lets a
   * test assert that retrying the pickup step did not book a second one. */
  pickupCount: number;
}

const mockShipments = new Map<string, MockShipmentState>();

function mockRef(prefix: string): string {
  return `${prefix}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export const mockShippingProvider: ShippingProvider & {
  /** Test seam: advances a mock shipment, as a courier scan would. */
  simulateScan(awbCode: string, status: ShippingStatus, note?: string): void;
  /** Test seam: how many pickups were actually requested for this AWB. */
  pickupCountFor(awbCode: string): number;
  reset(): void;
} = {
  name: 'shiprocket-mock',
  isMock: true,

  async checkServiceability({ deliveryPincode, isCod }) {
    // A deliberately unserviceable range so the "we cannot deliver here"
    // branch is reachable in tests. Everything else gets two options, which
    // is what exercises selectCourier rather than trivially returning one.
    if (deliveryPincode.startsWith('99')) return { ok: true, value: [] };
    const options: CourierOption[] = [
      { courierCompanyId: '11', courierName: 'Mock Express', rate: 78, estimatedDeliveryDays: 3, rating: 4.1 },
      { courierCompanyId: '22', courierName: 'Mock Surface', rate: 62, estimatedDeliveryDays: 5, rating: 3.6, isSurface: true },
    ];
    // COD generally carries a collection fee; reflected so the cheaper option
    // is not always trivially the same one.
    return { ok: true, value: isCod ? options.map((o) => ({ ...o, rate: o.rate + 25 })) : options };
  },

  async createShipment(input) {
    const shipmentId = mockRef('SHP');
    mockShipments.set(shipmentId, {
      shipmentId,
      orderId: input.orderId,
      status: 'NOT_SHIPPED',
      events: [],
      pickupCount: 0,
    });
    return {
      ok: true,
      value: {
        providerOrderId: mockRef('SRO'),
        providerShipmentId: shipmentId,
        raw: { mock: true, orderNumber: input.orderNumber },
      },
    };
  },

  async assignAwb({ shipmentId, courierCompanyId }) {
    const state = mockShipments.get(shipmentId);
    if (!state) return { ok: false, error: 'No such mock shipment.', retryable: false };
    const awbCode = mockRef('AWB');
    const courierName = courierCompanyId === '22' ? 'Mock Surface' : 'Mock Express';
    state.awbCode = awbCode;
    state.courierName = courierName;
    state.status = 'AWB_ASSIGNED';
    return { ok: true, value: { awbCode, courierName, courierCompanyId: courierCompanyId || '11' } };
  },

  async generatePickup({ shipmentId }) {
    const state = mockShipments.get(shipmentId);
    if (!state) return { ok: false, error: 'No such mock shipment.', retryable: false };
    // Mirrors the live precondition: the courier cannot be asked to collect a
    // parcel that has no AWB on it.
    if (!state.awbCode) return { ok: false, error: 'Shipment has no AWB yet.', retryable: false };
    state.pickupCount++;
    state.status = 'PICKUP_SCHEDULED';
    return {
      ok: true,
      value: {
        scheduledDate: new Date().toISOString().slice(0, 10),
        pickupStatus: '1',
        raw: { mock: true, pickups: state.pickupCount },
      },
    };
  },

  async generateLabel({ shipmentId }) {
    if (!mockShipments.has(shipmentId)) return { ok: false, error: 'No such mock shipment.', retryable: false };
    return { ok: true, value: { labelUrl: `https://mock.shiprocket.local/labels/${shipmentId}.pdf`, raw: { mock: true } } };
  },

  async generateManifest({ shipmentId }) {
    if (!mockShipments.has(shipmentId)) return { ok: false, error: 'No such mock shipment.', retryable: false };
    return {
      ok: true,
      value: { manifestUrl: `https://mock.shiprocket.local/manifests/${shipmentId}.pdf`, raw: { mock: true } },
    };
  },

  async printManifest({ orderIds }) {
    if (orderIds.length === 0) return { ok: false, error: 'No orders to print.', retryable: false };
    return {
      ok: true,
      value: { manifestUrl: `https://mock.shiprocket.local/manifests/${orderIds[0]}.pdf`, raw: { mock: true } },
    };
  },

  async generateInvoice({ orderIds }) {
    if (orderIds.length === 0) return { ok: false, error: 'No orders to invoice.', retryable: false };
    return {
      ok: true,
      value: { invoiceUrl: `https://mock.shiprocket.local/invoices/${orderIds[0]}.pdf`, raw: { mock: true } },
    };
  },

  async track(awbCode) {
    const state = [...mockShipments.values()].find((s) => s.awbCode === awbCode);
    if (!state) return { ok: false, error: 'No such AWB.', retryable: false };
    return {
      ok: true,
      value: {
        status: state.status,
        events: state.events,
        scans: state.events.map((event) => ({
          rawDate: event.timestamp,
          scanAt: new Date(event.timestamp),
          activity: event.note || null,
          location: 'MOCK',
        })),
        courierName: state.courierName,
        deliveredAt: state.status === 'DELIVERED' ? new Date().toISOString() : undefined,
      },
    };
  },

  async cancelShipment({ awbCode }) {
    const state = [...mockShipments.values()].find((s) => s.awbCode === awbCode);
    if (!state) return { ok: false, error: 'No such AWB.', retryable: false };
    state.status = 'CANCELLED';
    return { ok: true, value: undefined };
  },

  simulateScan(awbCode, status, note) {
    const state = [...mockShipments.values()].find((s) => s.awbCode === awbCode);
    if (!state) return;
    state.status = status;
    state.events.push({
      status: SHIPPING_TIMELINE_STATUS[status] || 'SHIPPED',
      timestamp: new Date().toISOString(),
      note: note || status.replace(/_/g, ' ').toLowerCase(),
      completed: true,
    });
  },

  pickupCountFor(awbCode) {
    return [...mockShipments.values()].find((s) => s.awbCode === awbCode)?.pickupCount || 0;
  },

  reset() {
    mockShipments.clear();
  },
};

export function getShippingProvider(): ShippingProvider {
  return env.shiprocket.enabled ? liveProvider : mockShippingProvider;
}

/** Whether shipments should actually be created. False in mock mode in
 * production, so a misconfigured deploy never silently stops shipping real
 * orders without anyone noticing. */
export function shippingConfigured(): boolean {
  return env.shiprocket.enabled;
}

// ------------------------------------------
// Registration into the existing tracking layer
// ------------------------------------------

/**
 * Registers Shiprocket with the CourierProvider registry that
 * shipping.service.ts already exposes.
 *
 * Done this way rather than by rewriting buildOrderTracking: the tracking
 * endpoint, the account tracking screen and its "scans are not live yet"
 * messaging all already read through that registry, so registering here is
 * the whole integration as far as the UI is concerned — and unregistering
 * (live mode off) cleanly restores the previous internal-status behaviour.
 */
export function registerShiprocketTracking(): void {
  const provider = getShippingProvider();
  // The mock is registered in development too, so the tracking screen's
  // courier path is exercised rather than only its fallback.
  if (!env.shiprocket.enabled && env.isProduction) return;

  const courierProvider: CourierProvider = {
    name: 'Shiprocket',
    async fetchShipment(trackingNumber: string): Promise<CourierShipment | null> {
      const result = await provider.track(trackingNumber);
      if (!result.ok) return null;
      return {
        trackingNumber,
        courierPartner: result.value.courierName || 'Shiprocket',
        trackingUrl: `https://shiprocket.co/tracking/${encodeURIComponent(trackingNumber)}`,
        events: result.value.events,
        currentStatus: SHIPPING_TIMELINE_STATUS[result.value.status],
      };
    },
  };

  registerCourierProvider('shiprocket', courierProvider);
  // Also register under the courier's own display name: orders store the
  // actual carrier (e.g. "Mock Express") in courier_partner, and
  // resolveProvider() looks up by that value first.
  registerCourierProvider('shiprocket-mock', courierProvider);
}

// ------------------------------------------
// Webhook authentication
// ------------------------------------------

/**
 * Development-only stand-in so the webhook path is reachable locally without a
 * real Shiprocket account. Accepted ONLY when NODE_ENV is not production AND no
 * real secret is configured — see verifyShiprocketWebhook.
 */
export const DEV_WEBHOOK_SECRET = 'mock_shiprocket_secret';

/**
 * Verifies a Shiprocket webhook.
 *
 * Shiprocket authenticates with a shared token in the `x-api-key` header rather
 * than an HMAC over the body, so this is a secret comparison, not a signature
 * check — which means the comparison itself must not leak the secret through
 * timing. Length is compared first (timingSafeEqual throws on a length
 * mismatch, and the length of a secret is not itself sensitive), then the
 * bytes, in constant time.
 *
 * The configured secret always wins when one is set. The development fallback
 * is reachable only when NODE_ENV is not production and nothing is configured:
 * previously the fallback applied whenever SHIPROCKET_LIVE_MODE was off, which
 * meant a production deploy with live mode off would accept a constant that is
 * sitting in this repository — anyone could drive shipping status changes on
 * real orders.
 */
export function verifyShiprocketWebhook(providedKey: string | undefined | null): boolean {
  const configured = env.shiprocket.webhookSecret;
  const secret = configured || (env.isProduction ? null : DEV_WEBHOOK_SECRET);

  if (!secret) {
    // Fail closed. An unconfigured production webhook rejects everything rather
    // than accepting anything.
    console.warn('[webhook] SHIPROCKET_WEBHOOK_SECRET is not configured — rejecting the delivery.');
    return false;
  }
  if (typeof providedKey !== 'string' || providedKey.length === 0) return false;

  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(providedKey, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ------------------------------------------
// Webhook payload
// ------------------------------------------

/**
 * One courier scan, exactly as Shiprocket documents it: date, activity,
 * location. No other field is read, and none is invented.
 */
export interface ShiprocketScan {
  rawDate: string | null;
  scanAt: Date | null;
  activity: string | null;
  location: string | null;
}

/**
 * The webhook payload, normalised.
 *
 * Only the documented fields appear here. Identifiers are normalised to
 * strings because Shiprocket sends `awb` as a JSON number (59629792084 in the
 * reference payload) and `order_id` as a string ("13905312") — and either can
 * arrive as the other. A number that large is still exactly representable as a
 * double, but comparing a number to a TEXT column in Postgres is a type error
 * waiting to happen, so the boundary is where this gets settled.
 */
export interface ShiprocketWebhookPayload {
  /** Courier tracking number. */
  awb: string | null;
  /** SHIPROCKET's own order id — not a Glamirk order number. */
  providerOrderId: string | null;
  /** The id WE gave Shiprocket at creation: the Glamirk order number. */
  channelOrderId: string | null;
  channel: string | null;
  currentStatus: string | null;
  currentStatusId: number | null;
  shipmentStatus: string | null;
  shipmentStatusId: number | null;
  currentTimestampRaw: string | null;
  currentTimestamp: Date | null;
  etdRaw: string | null;
  etd: Date | null;
  courierName: string | null;
  scans: ShiprocketScan[];
}

/**
 * Normalises an identifier that may arrive as a number or a string.
 *
 * Rejects non-finite numbers and anything that is not a scalar, so a payload
 * sending `{"awb": {"$ne": null}}` or `awb: NaN` yields null rather than the
 * string "[object Object]" or "NaN" being used as a lookup key.
 */
export function toIdString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Beyond 2^53 a JSON number has already lost precision before it reached
    // us; treating it as an identifier would silently match the wrong row.
    if (!Number.isSafeInteger(value)) return null;
    return String(value);
  }
  return null;
}

function toText(value: unknown, maxLength = 512): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function toStatusId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{1,6}$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * Parses Shiprocket's timestamp format: "2021-07-02 16:41:59", local to the
 * account's timezone with no offset.
 *
 * Interpreted as IST, because that is the timezone the Shiprocket account is
 * configured in and the only one its timestamps are ever expressed in. Guessing
 * UTC would place every scan five and a half hours in the past, which on a
 * same-day delivery shows the customer a timeline that has not happened yet.
 *
 * Returns null for anything unparseable; the raw string is stored regardless.
 */
export function parseShiprocketDate(value: unknown): Date | null {
  const text = typeof value === 'string' ? value.trim() : null;
  if (!text) return null;

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, y, mo, d, h, mi, s] = match;
    // IST is UTC+5:30 with no daylight saving, so a fixed offset is exact.
    const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || '0'));
    const parsed = new Date(utcMs - (5 * 60 + 30) * 60 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // A value that already carries an offset or a Z is taken at face value.
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Caps how much of one delivery we will process. A payload claiming ten
 * thousand scans is either a bug or an attempt to make one webhook write ten
 * thousand rows. */
const MAX_SCANS = 200;

/**
 * Turns a raw webhook body into the normalised payload, reading only the
 * documented fields.
 *
 * Returns null when the body is not a JSON object at all. An object missing
 * every identifier still parses — the caller decides what to do with a payload
 * it cannot map to an order, and recording that decision is more useful than
 * failing here.
 */
export function parseShiprocketWebhook(body: unknown): ShiprocketWebhookPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;

  const rawScans = Array.isArray(raw.scans) ? raw.scans.slice(0, MAX_SCANS) : [];
  const scans: ShiprocketScan[] = rawScans
    .filter((scan): scan is Record<string, unknown> => !!scan && typeof scan === 'object' && !Array.isArray(scan))
    .map((scan) => ({
      rawDate: toText(scan.date, 64),
      scanAt: parseShiprocketDate(scan.date),
      activity: toText(scan.activity, 512),
      location: toText(scan.location, 255),
    }))
    // A scan with no date, no activity and no location carries no information
    // and would dedupe against every other empty scan.
    .filter((scan) => scan.rawDate || scan.activity || scan.location);

  return {
    awb: toIdString(raw.awb),
    providerOrderId: toIdString(raw.order_id),
    channelOrderId: toIdString(raw.channel_order_id),
    channel: toText(raw.channel, 64),
    currentStatus: toText(raw.current_status, 128),
    currentStatusId: toStatusId(raw.current_status_id),
    shipmentStatus: toText(raw.shipment_status, 128),
    shipmentStatusId: toStatusId(raw.shipment_status_id),
    currentTimestampRaw: toText(raw.current_timestamp, 64),
    currentTimestamp: parseShiprocketDate(raw.current_timestamp),
    etdRaw: toText(raw.etd, 64),
    etd: parseShiprocketDate(raw.etd),
    courierName: toText(raw.courier_name, 128),
    scans,
  };
}

/**
 * Stable idempotency key for one courier scan.
 *
 * Shiprocket sends no scan id, and inventing one would defeat the purpose — a
 * random id makes every redelivery look new. The key is therefore derived from
 * the fields that actually identify a physical scan and that Shiprocket does
 * send on every delivery: the AWB plus the scan's date, activity and location.
 *
 * Hashed rather than concatenated so the key has a bounded length regardless of
 * how verbose a courier's activity text is, and so it is safe to put in a
 * unique index.
 */
export function scanDedupeKey(parts: {
  awb: string | null;
  orderId: string;
  rawDate: string | null;
  activity: string | null;
  location: string | null;
}): string {
  const material = [
    parts.awb || '',
    // The order is included so two different parcels cannot collide on an
    // identical generic scan ("Shipment picked up", no location, same minute).
    parts.orderId,
    parts.rawDate || '',
    parts.activity || '',
    parts.location || '',
  ].join('|');
  return 'scan-' + crypto.createHash('sha256').update(material).digest('hex').slice(0, 40);
}

/**
 * Idempotency key for the delivery's own status change, as opposed to its
 * scans.
 *
 * Same principle: built only from fields Shiprocket sends. An identical
 * redelivery produces an identical key; a genuine next status produces a
 * different one.
 */
export function statusDedupeKey(parts: {
  awb: string | null;
  orderId: string;
  statusId: number | null;
  status: string | null;
  timestamp: string | null;
}): string {
  const material = [
    parts.awb || '',
    parts.orderId,
    parts.statusId === null ? '' : String(parts.statusId),
    parts.status || '',
    parts.timestamp || '',
  ].join('|');
  return 'stat-' + crypto.createHash('sha256').update(material).digest('hex').slice(0, 40);
}
