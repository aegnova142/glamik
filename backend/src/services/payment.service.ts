import crypto from 'crypto';
import { env } from '../config/env';
import { httpJson } from './http.client';
import { PaymentStatus } from '@glamirk/shared/types';

// ==========================================
// PAYMENT GATEWAY — RAZORPAY
//
// Two adapters behind one interface. Which one runs is decided by
// env.razorpay.enabled (PAYMENTS_LIVE_MODE + real credentials), and nothing
// above this module knows or cares which it got. That is what makes the whole
// payment path testable without a gateway account, and what guarantees a
// deploy with the flag unset cannot charge anyone.
//
// Rules this module exists to enforce:
//
//   * Amounts are computed by the server from the server's own cart pricing
//     and are never accepted from a request body.
//   * A gateway response is only believed after its HMAC signature verifies
//     against the key secret, which never leaves this process.
//   * Verification is constant-time, so a signature cannot be brute-forced by
//     timing the comparison.
// ==========================================

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface GatewayOrder {
  /** Gateway's own order handle, passed to the browser checkout. */
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
}

export interface GatewayPayment {
  id: string;
  orderId?: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  method?: string;
  errorCode?: string;
  errorDescription?: string;
  /** Raw provider payload, stored for audit. Contains no full card number —
   * Razorpay returns only `last4`-style masked instrument data. */
  raw?: Record<string, unknown>;
}

export interface GatewayRefund {
  id: string;
  amountMinor: number;
  status: string;
}

/**
 * Open result shape rather than a discriminated union on `ok` — this project
 * compiles without `strict`, where narrowing on a literal-boolean discriminant
 * is unreliable. The payload key is named per operation so call sites read as
 * `res.order` / `res.payment` / `res.refund`.
 */
export type GatewayResult<K extends string, T> = { ok: boolean; error?: string; retryable?: boolean } & {
  [P in K]?: T;
};

export interface PaymentGateway {
  readonly name: string;
  readonly isMock: boolean;
  createOrder(input: {
    amountMinor: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<GatewayResult<'order', GatewayOrder>>;
  fetchPayment(paymentId: string): Promise<GatewayResult<'payment', GatewayPayment>>;
  refund(input: {
    paymentId: string;
    amountMinor: number;
    notes?: Record<string, string>;
  }): Promise<GatewayResult<'refund', GatewayRefund>>;
}

/** Razorpay's payment states mapped onto Glamirk's payment vocabulary. */
function mapRazorpayStatus(status: string): PaymentStatus {
  switch (status) {
    case 'captured':
      return 'PAID';
    // 'authorized' is money held but not yet taken. Treated as PENDING rather
    // than PAID: an authorisation that is never captured expires and the
    // customer is never charged, so calling it paid would ship goods for
    // money that will never arrive.
    case 'authorized':
    case 'created':
    case 'pending':
      return 'PENDING';
    case 'refunded':
      return 'REFUNDED';
    case 'failed':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

function basicAuthHeader(): string {
  const token = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');
  return `Basic ${token}`;
}

// ------------------------------------------
// Live adapter
// ------------------------------------------

const liveGateway: PaymentGateway = {
  name: 'razorpay',
  isMock: false,

  async createOrder({ amountMinor, currency, receipt, notes }) {
    const res = await httpJson<any>(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader() },
      body: {
        amount: amountMinor,
        currency,
        receipt,
        // Razorpay captures automatically rather than leaving funds
        // authorised, so a successful payment is final and the order is safe
        // to fulfil without a second capture step.
        payment_capture: 1,
        notes,
      },
      // Checkout is waiting on this call, so it gets a tighter budget than a
      // background reconciliation would.
      timeoutMs: 12000,
      attempts: 2,
    });

    if (!res.ok || !res.data?.id) {
      return { ok: false, error: res.error || 'Gateway did not return an order.', retryable: res.retryable };
    }
    return {
      ok: true,
      order: {
        id: res.data.id,
        amountMinor: Number(res.data.amount),
        currency: res.data.currency,
        status: res.data.status,
      },
    };
  },

  async fetchPayment(paymentId) {
    const res = await httpJson<any>(`${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: basicAuthHeader() },
      timeoutMs: 12000,
      attempts: 3,
    });
    if (!res.ok || !res.data?.id) {
      return { ok: false, error: res.error || 'Gateway did not return a payment.', retryable: res.retryable };
    }
    const d = res.data;
    return {
      ok: true,
      payment: {
        id: d.id,
        orderId: d.order_id,
        amountMinor: Number(d.amount),
        currency: d.currency,
        status: mapRazorpayStatus(d.status),
        method: d.method,
        errorCode: d.error_code || undefined,
        errorDescription: d.error_description || undefined,
        raw: d,
      },
    };
  },

  async refund({ paymentId, amountMinor, notes }) {
    const res = await httpJson<any>(`${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader() },
      body: { amount: amountMinor, notes },
      timeoutMs: 20000,
      attempts: 2,
    });
    if (!res.ok || !res.data?.id) {
      return { ok: false, error: res.error || 'Gateway did not confirm the refund.', retryable: res.retryable };
    }
    return { ok: true, refund: { id: res.data.id, amountMinor: Number(res.data.amount), status: res.data.status } };
  },
};

// ------------------------------------------
// Mock adapter
// ------------------------------------------

/**
 * In-process stand-in used whenever live mode is off.
 *
 * Deliberately deterministic rather than random: a test that wants a decline
 * asks for one through the receipt/notes rather than running the suite until
 * chance produces it. The simulated instrument ids carry the same `pay_` /
 * `order_` prefixes as the real ones so nothing downstream can accidentally
 * depend on a shape that would change at go-live.
 */
const mockPayments = new Map<string, GatewayPayment>();
const mockOrders = new Map<string, GatewayOrder>();

function mockId(prefix: string): string {
  return `${prefix}_mock${crypto.randomBytes(8).toString('hex')}`;
}

export const mockGateway: PaymentGateway & {
  /** Test seam: drives a mock payment to a chosen outcome, as the real
   * gateway's hosted checkout would. */
  simulatePayment(input: { gatewayOrderId: string; outcome: 'success' | 'failed'; method?: string }): GatewayPayment;
  reset(): void;
} = {
  name: 'razorpay-mock',
  isMock: true,

  async createOrder({ amountMinor, currency, receipt, notes }) {
    // One deliberate failure hook so the "gateway is down" branch is
    // reachable in tests without patching the module.
    if (notes?.simulate === 'create_failure') {
      return { ok: false, error: 'Simulated gateway outage.', retryable: true };
    }
    const order: GatewayOrder = { id: mockId('order'), amountMinor, currency, status: 'created' };
    mockOrders.set(order.id, order);
    return { ok: true, order };
  },

  async fetchPayment(paymentId) {
    const payment = mockPayments.get(paymentId);
    if (!payment) return { ok: false, error: 'No such payment.', retryable: false };
    return { ok: true, payment };
  },

  async refund({ paymentId, amountMinor }) {
    const payment = mockPayments.get(paymentId);
    if (!payment) return { ok: false, error: 'No such payment.', retryable: false };
    if (payment.status !== 'PAID') return { ok: false, error: 'Only a captured payment can be refunded.', retryable: false };
    return { ok: true, refund: { id: mockId('rfnd'), amountMinor, status: 'processed' } };
  },

  simulatePayment({ gatewayOrderId, outcome, method = 'upi' }) {
    const order = mockOrders.get(gatewayOrderId);
    const payment: GatewayPayment = {
      id: mockId('pay'),
      orderId: gatewayOrderId,
      amountMinor: order?.amountMinor ?? 0,
      currency: order?.currency ?? 'INR',
      status: outcome === 'success' ? 'PAID' : 'FAILED',
      method,
      errorCode: outcome === 'failed' ? 'BAD_REQUEST_ERROR' : undefined,
      errorDescription: outcome === 'failed' ? 'Payment was declined by the issuing bank.' : undefined,
      raw: { mock: true, order_id: gatewayOrderId },
    };
    mockPayments.set(payment.id, payment);
    return payment;
  },

  reset() {
    mockPayments.clear();
    mockOrders.clear();
  },
};

/** The adapter in force for this process. */
export function getPaymentGateway(): PaymentGateway {
  return env.razorpay.enabled ? liveGateway : mockGateway;
}

/** Whether customers may choose online payment at all. False keeps checkout
 * COD-only exactly as it is today. */
export function onlinePaymentsAvailable(): boolean {
  // The mock is intentionally usable in development so the flow can be built
  // and demoed, but never in production — a production deploy without real
  // credentials must not present a payment option that silently settles
  // nothing.
  return env.razorpay.enabled || (!env.isProduction && !!process.env.PAYMENTS_MOCK_CHECKOUT);
}

/** Key id is public by design — Razorpay's browser checkout needs it. The
 * secret is never returned from here. */
export function publishableKeyId(): string | null {
  if (env.razorpay.enabled) return env.razorpay.keyId;
  return onlinePaymentsAvailable() ? 'rzp_test_mock_key' : null;
}

// ------------------------------------------
// Signature verification
// ------------------------------------------

/** Constant-time compare that tolerates unequal lengths (timingSafeEqual
 * throws on a length mismatch, and that throw would itself leak length). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** The secret used to sign. In mock mode this is a fixed local value so the
 * verification path is genuinely exercised rather than skipped. */
function signingSecret(): string {
  return env.razorpay.enabled ? env.razorpay.keySecret! : 'mock_key_secret';
}

/**
 * Verifies the handshake the browser returns after a successful payment.
 *
 * Razorpay signs `order_id|payment_id` with the key secret. Checking it is
 * what stops a customer POSTing a made-up payment id to mark their own order
 * paid — the one place where believing the client would hand away stock for
 * free.
 */
export function verifyPaymentSignature(input: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}): boolean {
  if (!input.gatewayOrderId || !input.gatewayPaymentId || !input.signature) return false;
  const expected = crypto
    .createHmac('sha256', signingSecret())
    .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
    .digest('hex');
  return safeEqual(expected, input.signature);
}

/** Test/mock helper: produces the signature the real gateway would send. Used
 * by the mock checkout flow so the verification path above runs for real. */
export function signPaymentForMock(gatewayOrderId: string, gatewayPaymentId: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(`${gatewayOrderId}|${gatewayPaymentId}`).digest('hex');
}

/**
 * Verifies an inbound webhook against the raw request body.
 *
 * Must be given the exact bytes received. Re-serialising the parsed JSON would
 * change key order or whitespace and the HMAC would never match — which is why
 * the webhook router mounts before express.json().
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  const secret = env.razorpay.enabled ? env.razorpay.webhookSecret : 'mock_webhook_secret';
  // A live deployment with no webhook secret configured must reject
  // everything rather than accept everything.
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

/** Mock-mode counterpart of the above, for the test harness. */
export function signWebhookForMock(rawBody: string): string {
  const secret = env.razorpay.enabled ? env.razorpay.webhookSecret! : 'mock_webhook_secret';
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// ------------------------------------------
// Money
// ------------------------------------------

/**
 * Rupees → paise.
 *
 * Math.round, not a bare multiply: 1799.9 * 100 is 179989.99999999997 in
 * binary floating point, which truncates to a one-paisa shortfall. Razorpay
 * rejects a mismatched amount outright, so the error surfaces as a failed
 * checkout rather than a rounding curiosity.
 */
export function toMinorUnits(rupees: number): number {
  return Math.round(Number(rupees) * 100);
}

export function fromMinorUnits(paise: number): number {
  return Math.round(Number(paise)) / 100;
}
