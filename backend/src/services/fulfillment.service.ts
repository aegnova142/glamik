import { pool, loadDatabase, saveDatabase, withStockLock, withOrderShipmentLock, withOrderRefundLock } from '../db/db';
import { env } from '../config/env';
import {
  OrderStatus,
  PaymentStatus,
  ShippingStatus,
  SHIPPING_TO_ORDER_STATUS,
  canonicalOrderStatus,
  TERMINAL_ORDER_STATUSES,
} from '@glamirk/shared/types';
import { insertOrderStatusHistory, restockOrderItems } from './orders.service';
import {
  notifyOrderStatus,
  notifyPaymentFailed,
  notifyRefund,
  notifyAdminPaid,
  notifyAdminDelivered,
} from './orderNotifications.service';
import { grantOrderPoints } from './rewards.service';
import {
  getShipmentProvider,
  shipmentProviderConfigured,
  scrubDelhiverySecrets,
  delhiveryScanKey,
} from './couriers/delhivery.service';
import { CreateShipmentInput, ShipmentPaymentMode, TrackingScan } from './couriers/shippingProvider';
import { getPaymentGateway, toMinorUnits, fromMinorUnits } from './payment.service';
import { hasSellableStock } from '@glamirk/shared/utils/productVariant';
import {
  sqlInventoryEnabled,
  inventoryWriteTargets,
  reserveStockForOrder,
  releaseOrderReservations,
  commitOrderReservations,
  restockReturnedOrder,
} from './inventory.service';

// ==========================================
// FULFILMENT ORCHESTRATION
//
// The single place that moves an order between the three lifecycles. Checkout,
// the payment webhook, the shipping webhook and the admin panel all call in
// here rather than each writing their own UPDATE — otherwise "what makes an
// order paid" would have four slightly different answers, and the one that
// disagreed would be the one that shipped goods for an unpaid order.
//
// Everything here is idempotent. Webhooks retry, admins double-click, and
// reconciliation sweeps re-run; every operation below is safe to call twice
// and guarded by a conditional UPDATE rather than a read-then-write.
// ==========================================

// ------------------------------------------
// Stock
// ------------------------------------------

/**
 * Takes an order's items out of inventory, exactly once.
 *
 * The `stock_committed` flag is the guard, and it is flipped by a conditional
 * UPDATE inside the same lock that performs the deduction. A retried payment
 * webhook therefore cannot deduct twice: the second call finds the flag
 * already set and does nothing.
 *
 * Returns false when the stock was already committed, so callers can tell a
 * genuine commit from a replay.
 */
export async function commitOrderStock(orderId: string): Promise<boolean> {
  return withStockLock(async () => {
    // Claim the right to deduct. If this updates no rows, someone else already
    // did it and we must not do it again.
    const claim = await pool.query(
      'UPDATE orders SET stock_committed = true WHERE id = $1 AND stock_committed = false RETURNING id, user_id',
      [orderId]
    );
    if (claim.rows.length === 0) return false;

    const itemsRes = await pool.query(
      'SELECT product_id, variant_id, selected_size, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );
    if (itemsRes.rows.length === 0) return false;

    const targets = inventoryWriteTargets();

    // SQL inventory. Written whenever SQL is authoritative OR mirroring is on
    // — not only when authoritative, which was the bug: with SQL_MODE=false
    // the SQL side received nothing and drifted on every order.
    if (targets.sql) {
      const reserved = await reserveStockForOrder({
        orderId,
        userId: claim.rows[0].user_id,
        lines: itemsRes.rows.map((row) => ({
          productId: row.product_id,
          variantId: row.variant_id,
          sizeLabel: row.selected_size,
          quantity: row.quantity,
        })),
        // No expiry: by the time stock is committed the order is confirmed, so
        // the hold lasts until it is delivered or cancelled.
        expiresAt: null,
        // Only SQL's availability may refuse the sale when SQL is the system
        // deciding. While merely mirroring, legacy has already authorised it.
        enforceAvailability: targets.sqlAuthoritative,
      });
      if (!reserved.ok) {
        if (targets.sqlAuthoritative) {
          // Undo the claim so a later retry can try again rather than finding
          // the order marked committed with nothing actually deducted.
          await pool.query('UPDATE orders SET stock_committed = false WHERE id = $1', [orderId]);
          return false;
        }
        // Mirror-only failure. The order stands — legacy decides here — and
        // the drift is surfaced by inventory:verify / inventory:health rather
        // than failing a customer's checkout over a secondary store.
        console.error(`[inventory] mirror write failed for order ${orderId}: ${reserved.error}`);
      }
    }

    if (targets.legacy) {
      const db = await loadDatabase();
      for (const row of itemsRes.rows) {
        const idx = db.products.findIndex((p) => p.id === row.product_id);
        if (idx === -1) continue;
        applyStockDelta(db, idx, row, -row.quantity);
      }
      await saveDatabase(db);
    }
    return true;
  });
}

/**
 * Puts an order's items back, exactly once.
 *
 * Guarded by `stock_restored` for the same reason as above: a cancellation
 * that races with a refund webhook must not restock twice and inflate
 * inventory. Orders whose stock was never committed (an online order that
 * failed at the gateway) are a no-op — there is nothing to give back.
 */
export async function restoreOrderStock(orderId: string, reason = 'Order cancelled'): Promise<boolean> {
  return withStockLock(async () => {
    const claim = await pool.query(
      `UPDATE orders SET stock_restored = true
       WHERE id = $1 AND stock_committed = true AND stock_restored = false
       RETURNING id, status`,
      [orderId]
    );
    if (claim.rows.length === 0) return false;

    const targets = inventoryWriteTargets();

    // Released whenever SQL is authoritative OR mirroring is on. Previously
    // this only ran when authoritative, so cancelling with SQL_MODE=false
    // restocked legacy while leaving the SQL reservation ACTIVE — stock held
    // off sale for an order that had ended, which is what the "finished order
    // still holding stock" health invariant now detects.
    if (targets.sql) {
      // Which counter the units sit in depends on whether the order was
      // delivered: an undelivered order still holds them as reserved, a
      // delivered one has them as sold. Taking them from the wrong counter
      // would either invent stock or lose it, so the two cases are handled by
      // different calls rather than one that guesses.
      const wasDelivered = ['DELIVERED', 'RETURNED', 'RTO'].includes(claim.rows[0].status);
      if (wasDelivered) {
        await restockReturnedOrder({ orderId, reason });
      } else {
        await releaseOrderReservations({ orderId, reason });
      }
    }

    if (targets.legacy) {
      await restockOrderItems(orderId);
    }
    return true;
  });
}

/** Shared stock arithmetic for a single order line. `delta` is negative to
 * deduct and positive to restore; the variant/size drill-down is identical
 * either way, so it lives in one place rather than being mirrored. */
function applyStockDelta(
  db: Awaited<ReturnType<typeof loadDatabase>>,
  idx: number,
  row: { variant_id: string | null; selected_size: string | null },
  delta: number
): void {
  const product = db.products[idx];
  const nextStock = Math.max(0, product.stock + delta);

  let nextShades = product.shades;
  if (row.variant_id && nextShades) {
    nextShades = nextShades.map((s) => {
      if (s.id !== row.variant_id) return s;
      if (row.selected_size && s.sizes && s.sizes.length > 0) {
        return {
          ...s,
          sizes: s.sizes.map((sz) =>
            sz.label === row.selected_size && sz.stock !== undefined
              ? { ...sz, stock: Math.max(0, sz.stock + delta) }
              : sz
          ),
        };
      }
      return s.stock !== undefined ? { ...s, stock: Math.max(0, s.stock + delta) } : s;
    });
  }

  let nextSizePricing = product.sizePricing;
  if (!row.variant_id && row.selected_size && nextSizePricing?.[row.selected_size]?.stock !== undefined) {
    const entry = nextSizePricing[row.selected_size];
    nextSizePricing = {
      ...nextSizePricing,
      [row.selected_size]: { ...entry, stock: Math.max(0, entry.stock! + delta) },
    };
  }

  const next = {
    ...product,
    stock: nextStock,
    shades: nextShades,
    sizePricing: nextSizePricing,
  };
  // Derived from every sellable unit, not from the product pool alone.
  // For a product whose shades carry their own stock the pool is a shared
  // total that also drains, so `nextStock > 0` marked the whole product out
  // of stock while shades still had units — hiding it from the shop and
  // refusing the entire basket at checkout.
  db.products[idx] = { ...next, inStock: hasSellableStock(next) };
}

// ------------------------------------------
// Order status transitions
// ------------------------------------------

/**
 * Moves an order to a new status and fires the side effects, exactly once.
 *
 * The UPDATE is conditional on the status we believe the order is in, so two
 * concurrent callers racing to apply the same transition produce one winner
 * and one no-op rather than two sets of notification emails.
 */
export async function transitionOrderStatus(input: {
  orderId: string;
  from?: OrderStatus;
  to: OrderStatus;
  note?: string;
  /** Skipped for internal bookkeeping moves that the customer shouldn't be
   * emailed about. */
  notify?: boolean;
}): Promise<boolean> {
  const { orderId, from, to, note, notify = true } = input;

  const result = from
    ? await pool.query('UPDATE orders SET status = $1 WHERE id = $2 AND status = $3 RETURNING *', [to, orderId, from])
    : await pool.query('UPDATE orders SET status = $1 WHERE id = $2 AND status <> $1 RETURNING *', [to, orderId]);

  if (result.rows.length === 0) return false;
  const row = result.rows[0];

  // None of these are read by the caller and none depend on each other, so
  // they run concurrently. Wrapped so a mail/notification failure can never
  // undo a status change that is already committed.
  try {
    await Promise.all([
      insertOrderStatusHistory(orderId, to, note),
      // One outbox row instead of an in-app insert plus an SMTP round-trip.
      // The row we already hold is passed through, so this costs no extra
      // read on what is the hottest notification path in the system.
      ...(notify ? [notifyOrderStatus(row, to)] : []),
      // Points are credited on delivery only, so they cannot be farmed by
      // placing and cancelling. The ledger's unique (user, type, reference)
      // constraint makes a repeat call harmless.
      ...(to === 'DELIVERED'
        ? [
            grantOrderPoints(row.user_id, orderId, row.order_number, Number(row.total)),
            // The store's delivery alert now rides the same transition as the
            // customer's. It used to fire only from the admin status route,
            // so a delivery recorded by a courier webhook — the normal case —
            // never reached the notification bell at all.
            notifyAdminDelivered(row),
          ]
        : []),
    ]);
  } catch (err) {
    console.error(`[fulfillment] side effects failed for order ${orderId} -> ${to}:`, err);
  }

  return true;
}

// ------------------------------------------
// Payment outcomes
// ------------------------------------------

/**
 * Records a successful payment and moves the order forward.
 *
 * This is the only path that may set payment_status = 'PAID'. Everything it
 * does is conditional on the order still being unpaid, so a webhook arriving
 * after the browser-side verify call (the normal case — both fire for the same
 * payment) results in one commit and one no-op rather than double-deducted
 * stock and two confirmation emails.
 */
export async function markOrderPaid(input: {
  orderId: string;
  amountPaid: number;
  gatewayPaymentId?: string;
  method?: string;
}): Promise<{ changed: boolean }> {
  const claim = await pool.query(
    `UPDATE orders
     SET payment_status = 'PAID', amount_paid = $2
     WHERE id = $1 AND payment_status <> 'PAID'
     RETURNING *`,
    [input.orderId, input.amountPaid]
  );
  if (claim.rows.length === 0) return { changed: false };

  const row = claim.rows[0];

  // Normally a no-op: /checkout reserves stock at order creation for both
  // payment methods, so stock_committed is already true and the claim inside
  // commitOrderStock updates nothing. Kept as a backstop for any order that
  // reached payment without a reservation (an admin-created order, a replay of
  // a pre-reservation row), and safe to call either way — the
  // `stock_committed = false` claim makes it idempotent.
  await commitOrderStock(input.orderId);

  // PENDING_PAYMENT is the only status a successful payment advances from.
  // An order already further along (admin moved it manually while the webhook
  // was in flight) keeps its position.
  await transitionOrderStatus({
    orderId: input.orderId,
    from: 'PENDING_PAYMENT',
    to: 'CONFIRMED',
    note: 'Payment received',
  });

  // Tell the store, exactly once.
  //
  // Three independent callers reach markOrderPaid for the same payment — the
  // browser verify call, the Razorpay webhook, and the reconciliation sweep —
  // and in the normal case at least two of them do. Gating on the conditional
  // UPDATE above is what makes this exactly-once: whichever caller wins the
  // claim is the only one that gets here, and the rest returned `changed:
  // false` without reaching this line. No dedupe table, no event id, no
  // window to tune.
  //
  // Placed after the claim commits, not before, so the store is never told
  // about a payment that then failed to persist.
  //
  // Awaited rather than fired-and-forgotten, unlike the shipment below: this
  // is a local INSERT plus a socket emit, so there is no slow third party to
  // protect the response from, and swallowing a failure here would mean an
  // order the store never hears about.
  try {
    await notifyAdminPaid(input.orderId);
  } catch (err) {
    // The payment is already committed and the customer has been charged — a
    // notification failure must not unwind that. Logged loudly instead,
    // because a silent miss here is exactly the gap this fixes.
    console.error(`[fulfillment] admin paid-order notification failed for ${input.orderId}:`, err);
  }

  // Fulfilment is attempted immediately but never blocks the response: a
  // courier outage must not turn a successful payment into a failed
  // checkout. The reconciliation sweep retries anything that did not stick.
  void createShipmentForOrder(input.orderId).catch((err) =>
    console.error(`[fulfillment] shipment creation failed for ${input.orderId}:`, err)
  );

  return { changed: true };
}

/**
 * Records a failed/cancelled/expired payment and cancels the order.
 *
 * Deliberately does NOT release stock. An online order does hold a reservation
 * taken at creation, but the release is the caller's to make: restoreOrderStock
 * is guarded by `stock_restored` and must be paired with the specific failure
 * being handled, not fired implicitly from here where a caller reconciling an
 * already-restored order would have no way to opt out. Every caller that ends
 * an order's life pairs the two — the payment.failed webhook, the verify
 * route's decline branch, the customer cancel route and the expiry sweep.
 */
export async function markOrderPaymentFailed(input: {
  orderId: string;
  status: Extract<PaymentStatus, 'FAILED' | 'CANCELLED' | 'EXPIRED'>;
  reason?: string;
}): Promise<boolean> {
  const result = await pool.query(
    `UPDATE orders SET payment_status = $2
     WHERE id = $1 AND payment_status NOT IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
     RETURNING id, status`,
    [input.orderId, input.status]
  );
  if (result.rows.length === 0) return false;

  // The order itself is cancelled: there is no scenario where an unpaid online
  // order should sit in the fulfilment queue.
  if (result.rows[0].status === 'PENDING_PAYMENT') {
    await pool.query(
      `UPDATE orders SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = $2
       WHERE id = $1 AND status = 'PENDING_PAYMENT'`,
      [input.orderId, input.reason || `Payment ${input.status.toLowerCase()}`]
    );
    await insertOrderStatusHistory(input.orderId, 'CANCELLED', input.reason || `Payment ${input.status.toLowerCase()}`);
  }

  // Tell the customer their payment did not go through.
  //
  // This is the single choke point for all four failure paths — the declined
  // verify call, the payment.failed webhook, the customer abandoning the
  // gateway, and the expiry sweep — and the conditional UPDATE above is what
  // makes it exactly once: a caller that did not win the claim returned false
  // several lines ago.
  //
  // Before this, every one of those four was completely silent. A customer
  // whose card was declined saw their order disappear with no explanation.
  //
  // Deliberately NOT paired with an ORDER_CANCELLED message, even though the
  // order is cancelled just above: two messages for one event, one of which
  // implies the customer cancelled something they did not, is worse than one
  // accurate message. The PAYMENT_FAILED copy states that nothing was
  // charged.
  await notifyPaymentFailed(input.orderId, input.status, input.reason);

  return true;
}

/** Records a refund against an order. Partial and full are distinguished by
 * comparing against the amount actually collected. */
export async function recordRefund(input: { orderId: string; amount: number }): Promise<boolean> {
  const result = await pool.query(
    `UPDATE orders
     SET amount_refunded = LEAST(amount_paid, amount_refunded + $2),
         payment_status = CASE
           WHEN amount_refunded + $2 >= amount_paid THEN 'REFUNDED'
           ELSE 'PARTIALLY_REFUNDED'
         END
     WHERE id = $1 AND amount_paid > 0
     RETURNING id`,
    [input.orderId, input.amount]
  );
  return result.rows.length > 0;
}

// ------------------------------------------
// Shipping
// ------------------------------------------
/**
 * Books the courier shipment for an order, exactly once.
 *
 * Delhivery's sequence differs from an aggregator's in a way that matters for
 * safety: a waybill is drawn from the client pool BEFORE the shipment exists.
 * So the order of operations here is
 *
 *   claim the shipments row  ->  draw a waybill  ->  PERSIST it  ->  create
 *
 * and the persist step is not an optimisation. If creation times out after
 * Delhivery accepted it, the parcel exists and the waybill is spent; a retry
 * that drew a fresh waybill would create a second parcel for the same order
 * and leak the first. Reusing the stored waybill makes the retry collide with
 * the unique index instead.
 *
 * Duplicate protection is therefore two layers: the unique index on
 * shipments.order_id, claimed before any API call, and the unique index on
 * shipments.waybill.
 *
 * Partial failure is expected. The shipment row keeps whatever succeeded and
 * records the error, so a retry resumes rather than restarting.
 *
 * Serialised per order by an advisory lock. The unique index alone was not
 * enough: it decides only who INSERTs the shipments row, and the caller that
 * loses then reads that same row and carries on — two callers holding one
 * shipmentRowId, each drawing a waybill, the second overwriting the first with
 * an UPDATE that no unique index can catch. Two create.json calls, two real
 * parcels, one orphaned waybill. The lock is what makes the sequence below
 * single-threaded for a given order; the indexes remain the backstop.
 */
/**
 * Refuses every courier call when this environment must not make one.
 *
 * `shipmentsEnabled()` has always known the answer; nothing enforced it on the
 * path that matters. markOrderPaid booked through whatever
 * getShipmentProvider() returned, and in production that is the MOCK adapter
 * whenever DELHIVERY_LIVE_MODE is off. A paid order then got a `MOCKWB…`
 * waybill and a `mock.delhivery.local` tracking URL written onto it — a
 * tracking number the customer can click, that resolves to nothing, for a
 * parcel nobody ever booked. The order looked shipped and never was.
 *
 * Enforced inside each service function rather than at the call sites, because
 * the hole was never one call site: markOrderPaid alone is reached from the
 * browser verify call, the Razorpay webhook and the reconciliation sweep, and
 * the admin pickup/label actions bypassed the route-level check entirely.
 * Guarding here means no present or future caller can route around it.
 *
 * Outside production the mock IS the point, so this is a no-op in development
 * and in tests.
 */
function courierCallsBlocked(): string | null {
  if (shipmentsEnabled()) return null;
  return (
    'Shipping is not enabled in this environment, so no courier call was made. ' +
    'Set DELHIVERY_LIVE_MODE=true with credentials to book real shipments. ' +
    'The order itself is unaffected and can be booked once shipping is live.'
  );
}

export async function createShipmentForOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const blocked = courierCallsBlocked();
  if (blocked) {
    // Deliberately writes nothing: no shipments row, no waybill, no tracking
    // number. An order with no shipment is the truthful record of "not booked
    // yet", and it is what the admin booking screen already looks for. A row
    // naming the mock provider would be worse than none.
    console.warn(`[fulfillment] shipment booking skipped for order ${orderId}: shipping is not enabled`);
    return { ok: false, error: blocked };
  }

  const run = await withOrderShipmentLock(orderId, () => bookShipmentForOrder(orderId));
  if (!run.acquired) {
    // Someone else is mid-flight on this exact order. Refusing is the safe
    // answer — queueing behind them would book the parcel a second time.
    return { ok: false, error: 'A shipment booking for this order is already in progress.' };
  }
  return run.value!;
}

async function bookShipmentForOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = orderRes.rows[0];
  if (!order) return { ok: false, error: 'Order not found.' };

  // Never ship an unpaid prepaid order.
  if (order.payment_method !== 'cod' && order.payment_status !== 'PAID') {
    return { ok: false, error: 'Order is not paid.' };
  }
  if (TERMINAL_ORDER_STATUSES.includes(canonicalOrderStatus(order.status))) {
    return { ok: false, error: `Order is ${order.status}.` };
  }

  const provider = getShipmentProvider();
  const shipmentId = 'shp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const isCod = order.payment_method === 'cod';

  // Claim the slot. ON CONFLICT DO NOTHING means a concurrent caller simply
  // finds nothing inserted and stops.
  const claim = await pool.query(
    `INSERT INTO shipments (id, order_id, provider, status, is_cod)
     VALUES ($1, $2, $3, 'PENDING', $4)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id`,
    [shipmentId, orderId, provider.name, isCod]
  );

  let shipmentRowId = claim.rows[0]?.id;
  let existingWaybill: string | null = null;

  if (!shipmentRowId) {
    // A shipment row already exists. Resume only if it never got a waybill
    // onto an accepted shipment — otherwise this is a genuine duplicate.
    const existing = await pool.query(
      'SELECT id, awb_code, waybill, attempt_count FROM shipments WHERE order_id = $1',
      [orderId]
    );
    const row = existing.rows[0];
    if (!row) return { ok: false, error: 'Shipment row vanished.' };
    if (row.awb_code) return { ok: true };
    if (row.attempt_count >= 5) {
      return { ok: false, error: 'Shipment creation has failed too many times; needs manual review.' };
    }
    shipmentRowId = row.id;
    // A waybill drawn by a previous attempt but never spent. Reused, not
    // replaced — drawing a fresh one on every retry leaks the client's pool.
    existingWaybill = row.waybill || null;
  }

  await pool.query('UPDATE shipments SET attempt_count = attempt_count + 1, updated_at = now() WHERE id = $1', [
    shipmentRowId,
  ]);

  /**
   * Records a booking failure and leaves the shipment retryable.
   *
   * The Glamirk order is never cancelled, refunded or stock-released because a
   * courier call failed — a parcel we have not booked yet is still a sale we
   * owe the customer. `integration_status` becomes PENDING rather than FAILED
   * so the admin list reads it as "waiting to be booked", which is what it is:
   * an operator action is outstanding, not a dead end. `last_error` carries
   * the reason, already scrubbed of anything secret-shaped.
   *
   * `permanent` marks the cases retrying cannot fix — an address Delhivery
   * will not deliver to at all. Those still stay PENDING rather than FAILED,
   * because the fix is to change the address and retry, not to give up.
   */
  const fail = async (rawError: string, permanent = false) => {
    const error = scrubDelhiverySecrets(rawError);
    await pool.query(
      `UPDATE shipments SET last_error = $2, integration_status = 'PENDING',
              status = 'PENDING', updated_at = now()
       WHERE id = $1`,
      [shipmentRowId, error]
    );
    // The order's own shipping lifecycle stays NOT_SHIPPED: nothing has moved,
    // and showing a customer anything else would be a lie.
    console.error(`[fulfillment] shipment ${shipmentRowId} for order ${orderId} pending: ${error}`);
    return { ok: false, error, pending: true, permanent };
  };

  const address = order.shipping_address || {};
  const itemsRes = await pool.query(
    'SELECT product_id, product_name, quantity, price FROM order_items WHERE order_id = $1',
    [orderId]
  );

  const db = await loadDatabase();
  // Weight is summed from each product's own recorded weight where present,
  // falling back to a configured default — shipping the wrong weight gets the
  // parcel re-weighed by the courier and billed back at a penalty rate.
  let weightKg = 0;
  for (const item of itemsRes.rows) {
    const product = db.products.find((p) => p.id === item.product_id);
    const unitWeight = Number((product as any)?.weightKg) || env.delhivery.defaultWeightKg;
    weightKg += unitWeight * item.quantity;
  }
  weightKg = Math.max(0.05, Math.round(weightKg * 1000) / 1000);

  const payload: CreateShipmentInput = {
    orderId,
    orderNumber: order.order_number,
    createdAt: new Date(order.created_at).toISOString(),
    customerName: order.customer_name || address.name || 'Customer',
    customerEmail: order.customer_email || undefined,
    customerPhone: order.customer_phone || address.phone || '',
    address: {
      addressLine1: address.addressLine1 || '',
      addressLine2: [address.addressLine2, address.area, address.landmark].filter(Boolean).join(', ') || undefined,
      city: address.city || '',
      state: address.state || '',
      pinCode: address.pinCode || '',
      country: 'India',
    },
    items: itemsRes.rows.map((item) => ({
      name: item.product_name,
      sku: item.product_id,
      units: item.quantity,
      sellingPrice: Number(item.price),
    })),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    total: Number(order.total),
    isCod,
    weightKg,
    lengthCm: env.delhivery.defaultLengthCm,
    breadthCm: env.delhivery.defaultBreadthCm,
    heightCm: env.delhivery.defaultHeightCm,
    sellerInvoice: order.order_number,
  };

  if (!payload.address.pinCode) return fail('Order has no delivery pincode.');

  // 1. Will Delhivery deliver here at all? Checked before a waybill is drawn,
  //    so an unserviceable address costs nothing from the pool.
  const serviceability = await provider.checkPincode({
    deliveryPincode: payload.address.pinCode,
    isCod,
  });
  if (!serviceability.ok) return fail(`Serviceability check failed: ${serviceability.error}`);
  if (!serviceability.value?.serviceable) {
    const remark = serviceability.value?.remark;
    // An embargo clears on its own; a plain refusal does not. Both leave the
    // shipment PENDING and the order intact — the difference is only what the
    // operator should do about it.
    return fail(
      serviceability.value?.temporary
        ? `Pincode ${payload.address.pinCode} is temporarily unserviceable${remark ? ` (${remark})` : ''}. Retry later.`
        : `Pincode ${payload.address.pinCode} is not serviceable by Delhivery. The delivery address must be changed.`,
      !serviceability.value?.temporary
    );
  }

  // A pincode can be serviceable for prepaid and still refuse cash. Delhivery
  // reports the two separately and we were asking for the answer without
  // reading it — booking a COD parcel into a prepaid-only area gets it refused
  // at the door and returned as an RTO. Caught here instead, while it is still
  // a message to an operator rather than a parcel on a van.
  //
  // Strictly `=== false`: undefined means the provider did not say, and a
  // missing answer must not block a sale.
  if (isCod && serviceability.value.codAvailable === false) {
    return fail(
      `Pincode ${payload.address.pinCode} does not accept Cash on Delivery. The order must be prepaid, or the delivery address changed.`,
      true
    );
  }

  // 2. Draw a waybill and persist it BEFORE creating anything. See the note at
  //    the top of this function — this is what makes a timeout recoverable.
  let waybill = existingWaybill;
  if (!waybill) {
    if (!provider.fetchWaybill) return fail('Provider cannot allocate a waybill.');
    const drawn = await provider.fetchWaybill();
    if (!drawn.ok || !drawn.value?.waybill) {
      // An ambiguous outcome is reported in its own words. The order is still
      // retryable and a retry still draws a fresh number — but the previous
      // one may have been allocated and lost, and that is worth an operator
      // seeing in last_error rather than discovering on a Delhivery invoice.
      return fail(
        drawn.ambiguous
          ? `Waybill allocation outcome unknown: ${drawn.error} A retry will draw a fresh number.`
          : `Waybill fetch failed: ${drawn.error}`
      );
    }
    waybill = drawn.value.waybill;

    await pool.query(
      `UPDATE shipments SET waybill = $2, waybill_fetched_at = now(), updated_at = now() WHERE id = $1`,
      [shipmentRowId, waybill]
    );
  }

  // 3. Create the shipment against that waybill.
  const paymentMode: ShipmentPaymentMode = isCod ? 'COD' : 'PREPAID';
  const created = await provider.createShipment({ ...payload, waybill }, paymentMode);
  if (!created.ok) return fail(`Create failed: ${created.error}`);

  const trackingUrl =
    created.value.trackingUrl || `https://www.delhivery.com/track/package/${encodeURIComponent(created.value.waybill)}`;

  // 4. Label. Non-fatal: the parcel is real and trackable without one, and it
  //    can be regenerated from the admin panel at any time.
  const label = await provider.getLabel({ waybill: created.value.waybill });

  await pool.query(
    `UPDATE shipments SET awb_code = $2, waybill = $2, courier_name = $3,
            provider_order_id = $4, tracking_url = $5, label_url = $6,
            status = 'AWB_ASSIGNED', integration_status = 'READY', last_error = NULL,
            provider_response = $7::jsonb,
            provider_artifacts = provider_artifacts || $8::jsonb,
            updated_at = now()
     WHERE id = $1`,
    [
      shipmentRowId,
      created.value.waybill,
      created.value.courierName || 'Delhivery',
      created.value.providerOrderRef || order.order_number,
      trackingUrl,
      label.ok ? label.value.labelUrl : null,
      JSON.stringify(created.value.raw || {}),
      JSON.stringify(label.ok ? { label: label.value.raw ?? {} } : {}),
    ]
  );

  // The orders table keeps carrying these three columns because the existing
  // tracking screen and admin read them directly.
  await pool.query(
    `UPDATE orders SET tracking_number = $2, courier_partner = $3, courier_tracking_url = $4,
            shipping_status = 'AWB_ASSIGNED'
     WHERE id = $1`,
    [orderId, created.value.waybill, created.value.courierName || 'Delhivery', trackingUrl]
  );

  // 5. Ask for a collection. Warehouse-level, so this is a no-op whenever a
  //    booking for today already exists — see ensureWarehousePickup.
  await ensureWarehousePickup();

  return { ok: true };
}

/**
 * Loads the shipment row with the fields the post-creation steps need.
 */
async function loadShipmentRow(orderId: string): Promise<any | null> {
  const res = await pool.query(
    `SELECT id, order_id, provider, provider_order_id, awb_code, waybill, label_url,
            integration_status, status
     FROM shipments WHERE order_id = $1`,
    [orderId]
  );
  return res.rows[0] || null;
}

/** Delhivery expects HH:MM:SS, and a booking made at 6pm for the same day will
 * not be collected. Both are formatting decisions, kept in one place. */
function pickupSlotForToday(): { date: string; time: string } {
  const now = new Date();
  // IST, because the warehouse and the courier both operate in it.
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return { date: ist.toISOString().slice(0, 10), time: env.delhivery.pickupTime };
}

/**
 * Books one collection per warehouse per day.
 *
 * Delhivery's pickup is warehouse-level: a single request covers every parcel
 * waiting at that location that day. Calling it per shipment would book a van
 * per order, which is why this takes no shipment and is safe to call after
 * every creation.
 *
 * The duplicate guard is the partial unique index on
 * (provider, pickup_location, pickup_date) WHERE status = 'OPEN', claimed
 * before the provider is called. A second caller loses the insert and returns
 * without touching Delhivery. A booking that fails is marked FAILED rather
 * than left OPEN, so the day stays retryable.
 */
export async function ensureWarehousePickup(): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  // The admin "request pickup" action reaches this without passing through the
  // route-level shipmentsEnabled() check, so in production with the mock
  // selected it would write a shipment_pickup_requests row naming a provider
  // that booked nothing.
  const blocked = courierCallsBlocked();
  if (blocked) return { ok: false, error: blocked };

  const provider = getShipmentProvider();
  const pickupLocation = env.delhivery.pickupLocation;
  if (!pickupLocation) {
    return { ok: false, error: 'DELHIVERY_PICKUP_NAME is not set.' };
  }

  const { date, time } = pickupSlotForToday();
  const id = 'pu-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const claim = await pool.query(
    `INSERT INTO shipment_pickup_requests
       (id, provider, pickup_location, pickup_date, pickup_time, expected_package_count, status)
     VALUES ($1, $2, $3, $4::date, $5, 1, 'OPEN')
     ON CONFLICT (provider, pickup_location, pickup_date) WHERE status = 'OPEN' DO NOTHING
     RETURNING id`,
    [id, provider.name, pickupLocation, date, time]
  );

  if (claim.rows.length === 0) {
    // Today's van is already booked. Count this parcel against it so the
    // declared package count stays roughly honest, then stop.
    await pool.query(
      `UPDATE shipment_pickup_requests
          SET expected_package_count = expected_package_count + 1, updated_at = now()
        WHERE provider = $1 AND pickup_location = $2 AND pickup_date = $3::date AND status = 'OPEN'`,
      [provider.name, pickupLocation, date]
    );
    return { ok: true, skipped: true };
  }

  const result = await provider.requestPickup({
    pickupLocation,
    pickupDate: date,
    pickupTime: time,
    expectedPackageCount: 1,
  });

  if (!result.ok) {
    const error = scrubDelhiverySecrets(result.error || 'Pickup request failed.');
    // FAILED, not OPEN — an open row would block every retry for the rest of
    // the day behind a booking that does not exist.
    await pool.query(
      `UPDATE shipment_pickup_requests SET status = 'FAILED', last_error = $2, updated_at = now() WHERE id = $1`,
      [claim.rows[0].id, error]
    );
    console.error(`[fulfillment] pickup for ${pickupLocation} on ${date}: ${error}`);
    return { ok: false, error };
  }

  await pool.query(
    `UPDATE shipment_pickup_requests
        SET provider_pickup_id = $2, provider_response = $3::jsonb, last_error = NULL, updated_at = now()
      WHERE id = $1`,
    [claim.rows[0].id, result.value?.pickupId || null, JSON.stringify(result.value?.raw ?? {})]
  );
  return { ok: true };
}

/**
 * Regenerates the shipping label for an order.
 *
 * Idempotent by stored URL: once there is one, Delhivery is not asked again.
 */
export async function ensureShipmentLabel(orderId: string): Promise<{ ok: boolean; error?: string; labelUrl?: string }> {
  // Same bypass as the pickup action: unguarded, the mock answers and a
  // `mock.delhivery.local` PDF link gets stored as the shipment's label_url.
  const blocked = courierCallsBlocked();
  if (blocked) return { ok: false, error: blocked };

  const shipment = await loadShipmentRow(orderId);
  if (!shipment) return { ok: false, error: 'This order has no shipment.' };
  if (shipment.label_url) return { ok: true, labelUrl: shipment.label_url };

  const waybill = shipment.waybill || shipment.awb_code;
  if (!waybill) return { ok: false, error: 'Shipment has no waybill yet.' };

  const result = await getShipmentProvider().getLabel({ waybill });
  if (!result.ok) {
    const error = scrubDelhiverySecrets(result.error || 'Label generation failed.');
    // Non-fatal and not recorded as a shipment failure: a label is a document,
    // and its absence does not stop the parcel moving.
    console.warn(`[fulfillment] label for order ${orderId}: ${error}`);
    return { ok: false, error };
  }

  await pool.query(
    `UPDATE shipments SET label_url = $2, provider_artifacts = provider_artifacts || $3::jsonb, updated_at = now()
     WHERE id = $1`,
    [shipment.id, result.value.labelUrl, JSON.stringify({ label: result.value.raw ?? {} })]
  );
  return { ok: true, labelUrl: result.value.labelUrl };
}

/**
 * Records courier scans, skipping any already stored.
 *
 * The duplicate suppression is the unique index on dedupe_key, not a prior
 * SELECT: two deliveries of the same webhook can be in flight at once, and a
 * check-then-insert would let both through. ON CONFLICT DO NOTHING makes the
 * loser a no-op instead of a duplicate row or a crash.
 *
 * Returns how many rows were genuinely new, which is what lets a test assert
 * that a redelivered webhook inserted nothing.
 */
export async function recordTrackingEvents(input: {
  orderId: string;
  shipmentRowId: string | null;
  awb: string | null;
  scans: TrackingScan[];
  source?: string;
  providerStatus?: string | null;
  providerStatusId?: number | null;
  mappedStatus?: ShippingStatus | null;
}): Promise<number> {
  let inserted = 0;
  for (const scan of input.scans) {
    const dedupeKey = delhiveryScanKey({
      waybill: input.awb,
      orderId: input.orderId,
      rawDate: scan.rawDate,
      activity: scan.activity,
      location: scan.location,
    });
    const result = await pool.query(
      `INSERT INTO shipment_tracking_events
         (id, shipment_id, order_id, awb_code, scan_at, raw_date, activity, location,
          provider_status, provider_status_id, mapped_status, source, dedupe_key, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        dedupeKey,
        input.shipmentRowId,
        input.orderId,
        input.awb,
        scan.scanAt ? scan.scanAt.toISOString() : null,
        scan.rawDate,
        scan.activity,
        scan.location,
        input.providerStatus ?? null,
        input.providerStatusId ?? null,
        input.mappedStatus ?? null,
        input.source || 'webhook',
        dedupeKey,
        JSON.stringify({ date: scan.rawDate, activity: scan.activity, location: scan.location }),
      ]
    );
    if (result.rows.length > 0) inserted++;
  }
  return inserted;
}

/**
 * Applies a shipping status change — from a webhook or a poll — to the
 * shipment, the order's shipping lifecycle, and where warranted the order
 * status itself.
 *
 * Returns false when nothing changed, which is the common case for a
 * redelivered webhook.
 */
export async function applyShippingStatus(input: {
  orderId: string;
  status: ShippingStatus;
  awbCode?: string;
  courierName?: string;
  note?: string;
  deliveredAt?: string;
}): Promise<boolean> {
  const { orderId, status } = input;

  const shipmentUpdate = await pool.query(
    `UPDATE shipments SET status = $2,
            awb_code = COALESCE($3, awb_code),
            courier_name = COALESCE($4, courier_name),
            delivered_at = COALESCE($5, delivered_at),
            updated_at = now()
     WHERE order_id = $1 AND status <> $2
     RETURNING id`,
    [orderId, status, input.awbCode || null, input.courierName || null, input.deliveredAt || null]
  );

  const orderUpdate = await pool.query(
    'UPDATE orders SET shipping_status = $2 WHERE id = $1 AND shipping_status IS DISTINCT FROM $2 RETURNING status',
    [orderId, status]
  );

  // Neither row moved — a duplicate delivery of an event already applied.
  if (shipmentUpdate.rows.length === 0 && orderUpdate.rows.length === 0) return false;

  const impliedOrderStatus = SHIPPING_TO_ORDER_STATUS[status];
  if (impliedOrderStatus) {
    // Read the order's status directly rather than from the UPDATE above. That
    // statement returns a row only when shipping_status actually changed, so a
    // push that moves the shipment while the order's shipping_status already
    // matched left `current` undefined — skipping the terminal check below and
    // letting a late in-transit scan drag a DELIVERED order back to SHIPPED,
    // re-sending its "on the way" email.
    const orderRes = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    const currentStatus = orderRes.rows[0]?.status;
    const current = currentStatus ? canonicalOrderStatus(currentStatus) : undefined;
    // Never drag an order backwards: a late "in transit" scan arriving after
    // delivery must not un-deliver the order.
    if (!current || !TERMINAL_ORDER_STATUSES.includes(current)) {
      await transitionOrderStatus({
        orderId,
        to: impliedOrderStatus,
        note: input.note || `Courier update: ${status.replace(/_/g, ' ').toLowerCase()}`,
      });
    }
  }

  // Cash collected on delivery is the moment a COD order is actually paid.
  if (status === 'DELIVERED') {
    await pool.query(
      `UPDATE orders SET payment_status = 'PAID', amount_paid = total
       WHERE id = $1 AND payment_method = 'cod' AND payment_status = 'COD_PENDING'`,
      [orderId]
    );
    // Delivery is the only moment the goods have demonstrably reached the
    // customer, so it is the only moment reserved stock becomes sold stock.
    // Idempotent: a redelivered webhook finds no ACTIVE reservations left.
    //
    // Runs whenever SQL is authoritative OR mirroring is on. Previously
    // authoritative-only, so with SQL_MODE=false a delivered order kept its
    // reservation ACTIVE forever and sold_stock never moved.
    //
    // The legacy document needs no counterpart here: it has no concept of
    // reserved or sold, only a single remaining-stock number, and that was
    // already decremented when the order was placed. Delivery moves units
    // between SQL counters without changing what is sellable, so there is
    // nothing for legacy to mirror.
    if (inventoryWriteTargets().sql) {
      await commitOrderReservations({ orderId });
    }
  }

  // An RTO means the goods are coming back to us, so the stock returns too.
  if (status === 'RTO_DELIVERED') {
    await restoreOrderStock(orderId);
  }

  return true;
}

/**
 * Cancels the courier booking for an order, if there is one.
 *
 * Safe to call on an order that was never shipped or whose shipment is already
 * cancelled — both are no-ops. A shipment that has already been picked up is
 * deliberately left alone: the parcel is physically in the courier's network
 * and the resolution is an RTO, not a cancellation.
 */
export async function cancelShipmentForOrder(orderId: string): Promise<boolean> {
  const result = await pool.query('SELECT id, awb_code, waybill, status FROM shipments WHERE order_id = $1', [orderId]);
  const shipment = result.rows[0];
  if (!shipment || !shipment.awb_code) return false;
  if (['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(shipment.status)) {
    return false;
  }

  const provider = getShipmentProvider();
  const cancelled = await provider.cancelShipment({ waybill: shipment.waybill || shipment.awb_code });
  if (!cancelled.ok) {
    await pool.query('UPDATE shipments SET last_error = $2, updated_at = now() WHERE id = $1', [
      shipment.id,
      `Cancel failed: ${cancelled.error}`,
    ]);
    return false;
  }

  await pool.query(`UPDATE shipments SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [shipment.id]);
  await pool.query(`UPDATE orders SET shipping_status = 'CANCELLED' WHERE id = $1`, [orderId]);
  return true;
}

/**
 * Refunds a captured payment back to its original instrument.
 *
 * Refunds only ever go back the way the money came — there is no path here to
 * send money to an arbitrary destination. A COD order has nothing to reverse
 * (no instrument was ever charged), so it is settled by the store manually and
 * this returns early rather than pretending to issue one.
 */
export interface RefundResult {
  ok: boolean;
  error?: string;
  /** The refunds row, present whenever one was created or found. */
  refundId?: string;
  providerRefundId?: string;
  amount?: number;
  /** True when an idempotency key matched an earlier refund and no second
   * gateway call was made. */
  replayed?: boolean;
  /** True when another refund for this order was already in flight. The caller
   * should surface a conflict, not retry. */
  busy?: boolean;
  /** The gateway neither confirmed nor refused — a timeout or network failure.
   * The money may have moved. Never retry on this; reconcile instead. */
  ambiguous?: boolean;
  /** The provider's own status, verbatim ('processed' | 'pending'). */
  providerStatus?: string;
}

export async function refundOrderPayment(
  orderId: string,
  amount: number,
  reason: string,
  options: {
    idempotencyKey?: string;
    createdBy?: string;
    /** Test seam, mirroring the mock gateway's existing `notes.simulate`
     * convention (see createOrder's 'create_failure'). Passed through to the
     * provider in notes; the LIVE adapter sends it as an ordinary note and
     * Razorpay ignores it, so this cannot alter real behaviour. */
    providerSimulate?: string;
  } = {}
): Promise<RefundResult> {
  // An idempotency key that already resolved is answered without taking the
  // lock or calling the gateway at all — a retried HTTP request must not queue
  // behind an unrelated in-flight refund just to be told "already done".
  if (options.idempotencyKey) {
    const prior = await findRefundByIdempotencyKey(orderId, options.idempotencyKey);
    if (prior) return prior;
  }

  // Non-queueing, per order. A second concurrent caller is REFUSED rather than
  // made to wait and then allowed to refund as well — see withOrderRefundLock.
  const locked = await withOrderRefundLock(orderId, async (): Promise<RefundResult> => {
    // Re-checked INSIDE the lock. This is the whole fix: the old code read
    // these figures with nothing serialising it, so two callers could both see
    // the full amount as refundable and both call Razorpay.
    if (options.idempotencyKey) {
      const prior = await findRefundByIdempotencyKey(orderId, options.idempotencyKey);
      if (prior) return prior;
    }

    const orderRes = await pool.query(
      'SELECT payment_method, amount_paid, amount_refunded FROM orders WHERE id = $1',
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.payment_method === 'cod') {
      return { ok: false, error: 'Cash on Delivery orders are refunded manually — there is no payment to reverse.' };
    }

    // Refundable counts every refund that is not definitively FAILED — not
    // just the confirmed ones in orders.amount_refunded.
    //
    // A provider-'pending' refund and an UNRESOLVED (timed-out) one have both
    // potentially moved money, but neither is confirmed, so neither may touch
    // amount_refunded. If the balance were computed from that column alone,
    // those amounts would look refundable again and a second refund could be
    // issued for money already on its way back.
    const inFlightRes = await pool.query(
      `SELECT COALESCE(SUM(amount_minor), 0) AS held
       FROM refunds WHERE order_id = $1 AND status <> 'FAILED'`,
      [orderId]
    );
    const heldMinor = Number(inFlightRes.rows[0]?.held) || 0;
    const paid = Number(order.amount_paid) || 0;
    const refundable = Math.max(0, paid - fromMinorUnits(heldMinor));
    if (refundable <= 0) return { ok: false, error: 'This order has already been fully refunded.' };

    const amountToRefund = Math.min(amount, refundable);
    if (!(amountToRefund > 0)) return { ok: false, error: 'Refund amount must be greater than zero.' };

    const paymentRes = await pool.query(
      `SELECT id, provider_payment_id FROM payments
       WHERE order_id = $1 AND status = 'PAID' AND provider_payment_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    const payment = paymentRes.rows[0];
    if (!payment) return { ok: false, error: 'No captured payment found for this order.' };

    const gateway = getPaymentGateway();

    // The durable claim, written BEFORE any money moves. A process that dies
    // after this point leaves a PENDING row — a visible reconciliation task
    // rather than a refund that happened with no local trace.
    const refundRowId = 'rfnd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    try {
      await pool.query(
        `INSERT INTO refunds (id, order_id, payment_id, provider, amount_minor, currency, status,
                              reason, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, 'INR', 'PENDING', $6, $7, $8)`,
        [
          refundRowId,
          orderId,
          payment.id,
          gateway.name,
          toMinorUnits(amountToRefund),
          reason ? String(reason).slice(0, 500) : null,
          options.idempotencyKey || null,
          options.createdBy || 'system',
        ]
      );
    } catch (err: any) {
      // 23505 on the idempotency index: a concurrent caller with the same key
      // claimed it between our check and this insert. Hand back theirs.
      if (err?.code === '23505' && options.idempotencyKey) {
        const prior = await findRefundByIdempotencyKey(orderId, options.idempotencyKey);
        if (prior) return prior;
      }
      throw err;
    }

    const refund = await gateway.refund({
      paymentId: payment.provider_payment_id,
      amountMinor: toMinorUnits(amountToRefund),
      // refundRowId is the thread back to our row. If this call times out, the
      // reconciliation below lists the provider's refunds and matches on it —
      // without it an orphaned attempt is indistinguishable from an unrelated
      // refund on the same payment.
      notes: {
        orderId,
        refundRowId,
        reason: String(reason || '').slice(0, 200),
        ...(options.providerSimulate ? { simulate: options.providerSimulate } : {}),
      },
    });

    if (!refund.ok || !refund.refund) {
      // A refund failure is NOT one thing. `retryable` separates the two cases,
      // and conflating them is how money gets sent twice:
      //
      //   definitive (4xx, "payment not captured")  -> the provider rejected
      //     it. Nothing moved. FAILED, and the balance is freed again.
      //
      //   ambiguous (timeout, network, 5xx) -> the provider may well have
      //     ACCEPTED it. Marking this FAILED would free the balance and invite
      //     a retry that sends the money a second time. It stays UNRESOLVED,
      //     keeps holding the balance, and is settled by reconcileRefund()
      //     asking the provider what it actually has.
      const ambiguous = refund.retryable === true;
      await pool.query(
        `UPDATE refunds SET status = $2, error_description = $3, updated_at = now() WHERE id = $1`,
        [
          refundRowId,
          ambiguous ? 'UNRESOLVED' : 'FAILED',
          (refund.error || 'The gateway did not confirm the refund.').slice(0, 1000),
        ]
      );
      return {
        ok: false,
        ambiguous,
        refundId: refundRowId,
        error: ambiguous
          ? 'The gateway did not respond in time. This refund may still have gone through — it will be reconciled before any retry.'
          : refund.error || 'The gateway did not confirm the refund.',
      };
    }

    // The provider's own verdict decides our status. Razorpay returns
    // 'processed' for an instant refund and 'pending' for one that will settle
    // over days; calling the latter complete would tell a customer their money
    // had arrived when it has not.
    const localStatus = mapProviderRefundStatus(refund.refund.status);
    await pool.query(
      `UPDATE refunds SET status = $5, provider_refund_id = $2, amount_minor = $3,
              gateway_response = $4::jsonb, updated_at = now()
       WHERE id = $1`,
      [refundRowId, refund.refund.id, refund.refund.amountMinor, JSON.stringify(refund.refund), localStatus]
    );

    // Aggregates move ONLY on a confirmed refund. A pending one is already
    // holding its share of the refundable balance via the in-flight sum above,
    // so nothing can be double-refunded while it settles — but
    // orders.amount_refunded must not claim money the customer has not had.
    if (localStatus === 'PROCESSED') {
      await pool.query(
        `UPDATE payments SET refunded_minor = LEAST(amount_minor, refunded_minor + $2), updated_at = now()
         WHERE id = $1`,
        [payment.id, refund.refund.amountMinor]
      );
      await recordRefund({ orderId, amount: amountToRefund });
    }

    // Notified only now: the refund row is PROCESSED, the gateway has
    // confirmed, and both aggregates are written. Nothing above this line
    // tells anyone money moved, so a failed or still-PENDING refund stays
    // silent — which is the honest answer, since it has not moved.
    //
    // Exactly-once falls out of the structure rather than needing a guard: a
    // refund row is created once per refund (the per-order lock stops
    // concurrent duplicates, the idempotency key stops sequential ones), and
    // a replay returns from findRefundByIdempotencyKey long before reaching
    // here.
    try {
      const after = await pool.query(
        'SELECT user_id, order_number, amount_paid, amount_refunded FROM orders WHERE id = $1',
        [orderId]
      );
      const o = after.rows[0];
      // Announced only once the provider has confirmed. A pending refund is
      // real but not yet money in the customer's account, and telling them it
      // has arrived invites a support ticket we caused.
      if (o && localStatus === 'PROCESSED') {
        await notifyRefund({
          orderIdOrRow: orderId,
          // The refund row this call just created. Keying on it rather than
          // on the order is what lets a second, genuinely different partial
          // refund produce its own message.
          refundRef: refundRowId,
          amount: amountToRefund,
          fullyRefunded: Number(o.amount_refunded) >= Number(o.amount_paid),
        });
      }
    } catch (err) {
      // The money has already gone back. A notification failure must not turn
      // a successful refund into a reported failure — the customer would be
      // refunded and told it did not work.
      console.error(`[fulfillment] refund notification failed for ${orderId}:`, err);
    }

    return {
      ok: true,
      refundId: refundRowId,
      providerRefundId: refund.refund.id,
      providerStatus: refund.refund.status,
      amount: amountToRefund,
    };
  });

  if (!locked.acquired) {
    return { ok: false, busy: true, error: 'A refund for this order is already in progress. Please wait and refresh.' };
  }
  return locked.value!;
}

/**
 * Razorpay's refund status → ours.
 *
 * 'processed' is money gone. 'pending' is accepted but still settling, which
 * for some instruments takes days. Anything unrecognised is treated as pending
 * rather than complete: under-claiming is recoverable, over-claiming tells a
 * customer they have been paid when they have not.
 */
function mapProviderRefundStatus(providerStatus: string | undefined): 'PROCESSED' | 'PENDING' | 'FAILED' {
  switch ((providerStatus || '').toLowerCase()) {
    case 'processed':
      return 'PROCESSED';
    case 'failed':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/** An already-resolved refund for this (order, key), replayed rather than reissued. */
async function findRefundByIdempotencyKey(orderId: string, key: string): Promise<RefundResult | null> {
  const res = await pool.query(
    'SELECT id, provider_refund_id, amount_minor, status, error_description FROM refunds WHERE order_id = $1 AND idempotency_key = $2',
    [orderId, key]
  );
  const row = res.rows[0];
  if (!row) return null;
  // A PENDING row means an earlier attempt claimed the key and never resolved.
  // Reported as busy rather than replayed: we genuinely do not know yet whether
  // that refund went through, and reissuing could double it.
  if (row.status === 'PENDING') {
    return { ok: false, busy: true, refundId: row.id, error: 'A refund for this request is still being processed.' };
  }
  return {
    ok: row.status === 'PROCESSED',
    error: row.status === 'PROCESSED' ? undefined : row.error_description || 'The earlier refund attempt failed.',
    refundId: row.id,
    providerRefundId: row.provider_refund_id || undefined,
    amount: fromMinorUnits(Number(row.amount_minor)),
    replayed: true,
  };
}

/**
 * Records a refund the PROVIDER told us about, exactly once.
 *
 * Razorpay sends refund.created and then refund.processed for the same refund,
 * and it sends them for refunds we issued ourselves as well as ones raised in
 * their dashboard. Before this, the webhook called recordRefund directly and
 * unconditionally, so:
 *
 *   our ₹400 refund        -> amount_refunded = 400
 *   refund.created  (same) -> amount_refunded = 800
 *   refund.processed(same) -> amount_refunded = 900 (clamped at amount_paid)
 *
 * A ₹400 refund on a ₹900 order ended up reported as ₹900 refunded, and the
 * customer was notified about it two or three times. The clamp hid it on full
 * refunds, which is why it survived.
 *
 * The dedupe key is the provider's own refund id, enforced by the unique index
 * from migration 017. A refund we issued already has its row, so the webhook
 * conflicts and does nothing; a refund raised in Razorpay's dashboard is new,
 * so it is recorded, applied and announced here.
 *
 * Returns whether this call was the one that applied it.
 */
export async function recordProviderRefund(input: {
  orderId: string;
  paymentRowId: string | null;
  providerRefundId: string | null;
  amountMinor: number;
  provider?: string;
}): Promise<{ applied: boolean }> {
  // No provider id means we cannot tell one delivery from another, so there is
  // no safe way to apply it. Recorded as ignored rather than risking a double
  // credit — the reconciliation sweep and the admin panel both surface it.
  if (!input.providerRefundId) {
    console.warn(`[fulfillment] provider refund for ${input.orderId} carried no refund id; not applied`);
    return { applied: false };
  }

  const rowId = 'rfnd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const inserted = await pool.query(
    `INSERT INTO refunds (id, order_id, payment_id, provider, provider_refund_id, amount_minor,
                          currency, status, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'INR', 'PROCESSED', 'Refund confirmed by provider', 'provider')
     ON CONFLICT (provider_refund_id) WHERE provider_refund_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      rowId,
      input.orderId,
      input.paymentRowId,
      input.provider || 'razorpay',
      input.providerRefundId,
      input.amountMinor,
    ]
  );

  // Already known — either we issued it, or an earlier delivery of this same
  // event landed. Either way the money has been accounted for once already.
  if (inserted.rows.length === 0) return { applied: false };

  if (input.paymentRowId) {
    await pool.query(
      `UPDATE payments SET refunded_minor = LEAST(amount_minor, refunded_minor + $2), updated_at = now()
       WHERE id = $1`,
      [input.paymentRowId, input.amountMinor]
    );
  }
  const amount = fromMinorUnits(input.amountMinor);
  await recordRefund({ orderId: input.orderId, amount });

  try {
    const after = await pool.query(
      'SELECT user_id, order_number, amount_paid, amount_refunded FROM orders WHERE id = $1',
      [input.orderId]
    );
    const o = after.rows[0];
    if (o) {
      await notifyRefund({
        orderIdOrRow: input.orderId,
        // The provider's own refund id. A redelivered webhook carries the
        // same one, so the replay collapses onto the original event even
        // though the INSERT above already refused it.
        refundRef: input.providerRefundId,
        amount,
        fullyRefunded: Number(o.amount_refunded) >= Number(o.amount_paid),
      });
    }
  } catch (err) {
    console.error(`[fulfillment] provider refund notification failed for ${input.orderId}:`, err);
  }

  return { applied: true };
}

/**
 * Settles a refund whose outcome we do not know.
 *
 * Reached by an UNRESOLVED row (the request timed out) or a PENDING one (the
 * provider accepted it but had not settled). Both are cases where retrying
 * would be the wrong move: the money may already be on its way, and a second
 * refund is not recoverable by an apology.
 *
 * So instead of retrying, this ASKS. It lists the provider's refunds against
 * the payment and matches on `notes.refundRowId`, which refundOrderPayment
 * attaches at request time. Three outcomes:
 *
 *   found + processed -> the refund did happen. Record it, move the
 *                        aggregates, notify. The timeout was only a lost
 *                        response.
 *   found + pending   -> accepted, still settling. Stays PENDING and keeps
 *                        holding the balance. Nothing to do yet.
 *   not found         -> the provider has no such refund, so the request
 *                        never landed. NOW it is safe to mark FAILED and free
 *                        the balance for a fresh attempt.
 *
 * Idempotent: a second call on an already-PROCESSED row changes nothing.
 */
export async function reconcileRefund(refundId: string): Promise<{
  ok: boolean;
  status?: string;
  changed?: boolean;
  error?: string;
}> {
  const res = await pool.query('SELECT * FROM refunds WHERE id = $1', [refundId]);
  const row = res.rows[0];
  if (!row) return { ok: false, error: 'Refund not found.' };
  if (row.status === 'PROCESSED' || row.status === 'FAILED') {
    return { ok: true, status: row.status, changed: false };
  }

  const payRes = await pool.query('SELECT id, provider_payment_id FROM payments WHERE id = $1', [row.payment_id]);
  const providerPaymentId = payRes.rows[0]?.provider_payment_id;
  if (!providerPaymentId) return { ok: false, error: 'No captured payment to reconcile against.' };

  // Serialised against new refunds on the same order, so a reconciliation
  // cannot run while another attempt is mid-flight and reach a stale verdict.
  const locked = await withOrderRefundLock(row.order_id, async () => {
    const gateway = getPaymentGateway();
    const listed = await gateway.listPaymentRefunds(providerPaymentId);
    if (!listed.ok || !listed.refunds) {
      // Still cannot see the provider. Deliberately leaves the row as it is —
      // guessing here is exactly what this function exists to avoid.
      return { ok: false, error: listed.error || 'Could not reach the gateway to reconcile.' };
    }

    const match =
      listed.refunds.find((r) => r.notes?.refundRowId === refundId) ||
      // Fallback for a row created before refundRowId was sent in notes: match
      // by provider id if we already captured one.
      (row.provider_refund_id ? listed.refunds.find((r) => r.id === row.provider_refund_id) : undefined);

    if (!match) {
      await pool.query(
        `UPDATE refunds SET status = 'FAILED',
                error_description = 'Reconciled: the gateway holds no such refund, so the request never landed.',
                updated_at = now()
         WHERE id = $1 AND status IN ('PENDING', 'UNRESOLVED')`,
        [refundId]
      );
      return { ok: true, status: 'FAILED', changed: true };
    }

    const mapped = mapProviderRefundStatus(match.status);
    if (mapped === 'PENDING') {
      await pool.query(
        `UPDATE refunds SET status = 'PENDING', provider_refund_id = $2,
                gateway_response = $3::jsonb, updated_at = now()
         WHERE id = $1`,
        [refundId, match.id, JSON.stringify(match)]
      );
      return { ok: true, status: 'PENDING', changed: row.status !== 'PENDING' };
    }

    if (mapped === 'FAILED') {
      await pool.query(
        `UPDATE refunds SET status = 'FAILED', provider_refund_id = $2,
                error_description = 'Reconciled: the gateway reports this refund as failed.',
                gateway_response = $3::jsonb, updated_at = now()
         WHERE id = $1`,
        [refundId, match.id, JSON.stringify(match)]
      );
      return { ok: true, status: 'FAILED', changed: true };
    }

    // Confirmed. Claim it with a conditional UPDATE so two concurrent
    // reconciliations cannot both move the aggregates.
    const claim = await pool.query(
      `UPDATE refunds SET status = 'PROCESSED', provider_refund_id = $2,
              gateway_response = $3::jsonb, updated_at = now()
       WHERE id = $1 AND status <> 'PROCESSED'
       RETURNING amount_minor`,
      [refundId, match.id, JSON.stringify(match)]
    );
    if (claim.rows.length === 0) return { ok: true, status: 'PROCESSED', changed: false };

    const amount = fromMinorUnits(Number(claim.rows[0].amount_minor));
    await pool.query(
      `UPDATE payments SET refunded_minor = LEAST(amount_minor, refunded_minor + $2), updated_at = now()
       WHERE id = $1`,
      [row.payment_id, Number(claim.rows[0].amount_minor)]
    );
    await recordRefund({ orderId: row.order_id, amount });

    try {
      const after = await pool.query(
        'SELECT user_id, order_number, amount_paid, amount_refunded FROM orders WHERE id = $1',
        [row.order_id]
      );
      const o = after.rows[0];
      if (o) {
        await notifyRefund({
          orderIdOrRow: row.order_id,
          // The same refund row refundOrderPayment created and left PENDING
          // or UNRESOLVED. Reusing its id means a refund that was announced
          // optimistically and then reconciled does not announce twice.
          refundRef: refundId,
          amount,
          fullyRefunded: Number(o.amount_refunded) >= Number(o.amount_paid),
        });
      }
    } catch (err) {
      console.error(`[fulfillment] reconciled-refund notification failed for ${row.order_id}:`, err);
    }

    return { ok: true, status: 'PROCESSED', changed: true };
  });

  if (!locked.acquired) return { ok: false, error: 'A refund for this order is currently in progress.' };
  return locked.value!;
}

/** Refunds that need a reconciliation sweep: accepted-but-unsettled, or
 * outcome unknown. Surfaced to the admin rather than retried automatically. */
export async function listUnresolvedRefunds(): Promise<{ id: string; orderId: string; status: string; amount: number }[]> {
  const res = await pool.query(
    `SELECT id, order_id, status, amount_minor FROM refunds
     WHERE status IN ('PENDING', 'UNRESOLVED') ORDER BY created_at ASC LIMIT 100`
  );
  return res.rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    status: r.status,
    amount: fromMinorUnits(Number(r.amount_minor)),
  }));
}

/** Refund history for one order, newest first. */
export async function listOrderRefunds(orderId: string): Promise<
  {
    id: string;
    providerRefundId?: string;
    amount: number;
    status: string;
    reason?: string;
    createdBy?: string;
    createdAt: string;
  }[]
> {
  const res = await pool.query(
    `SELECT id, provider_refund_id, amount_minor, status, reason, created_by, created_at
     FROM refunds WHERE order_id = $1 ORDER BY created_at DESC`,
    [orderId]
  );
  return res.rows.map((row) => ({
    id: row.id,
    providerRefundId: row.provider_refund_id || undefined,
    amount: fromMinorUnits(Number(row.amount_minor)),
    status: row.status,
    reason: row.reason || undefined,
    createdBy: row.created_by || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** True when shipments should be attempted at all. Exposed so callers can
 * explain *why* nothing shipped rather than failing silently. */
export function shipmentsEnabled(): boolean {
  return shipmentProviderConfigured() || !env.isProduction;
}
