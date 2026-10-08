import { pool, loadDatabase, saveDatabase, withStockLock, withOrderShipmentLock } from '../db/db';
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
import { notifyOrderStatusChange } from './notifications.service';
import { sendOrderStatusEmail } from './email.service';
import { grantOrderPoints } from './rewards.service';
import {
  getShipmentProvider,
  shipmentProviderConfigured,
  scrubDelhiverySecrets,
  delhiveryScanKey,
} from './couriers/delhivery.service';
import { CreateShipmentInput, ShipmentPaymentMode, TrackingScan } from './couriers/shippingProvider';
import { getPaymentGateway, toMinorUnits } from './payment.service';
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
      ...(notify
        ? [
            notifyOrderStatusChange(row.user_id, orderId, row.order_number, to),
            sendOrderStatusEmail({
              toEmail: row.customer_email,
              customerName: row.customer_name,
              orderId,
              orderNumber: row.order_number,
              status: to,
              total: Number(row.total),
            }),
          ]
        : []),
      // Points are credited on delivery only, so they cannot be farmed by
      // placing and cancelling. The ledger's unique (user, type, reference)
      // constraint makes a repeat call harmless.
      ...(to === 'DELIVERED' ? [grantOrderPoints(row.user_id, orderId, row.order_number, Number(row.total))] : []),
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

  // Stock for an online order is committed here, not at order creation: an
  // order that never gets paid must not hold inventory hostage.
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

  // Fulfilment is attempted immediately but never blocks the response: a
  // courier outage must not turn a successful payment into a failed
  // checkout. The reconciliation sweep retries anything that did not stick.
  void createShipmentForOrder(input.orderId).catch((err) =>
    console.error(`[fulfillment] shipment creation failed for ${input.orderId}:`, err)
  );

  return { changed: true };
}

/** Records a failed/cancelled/expired payment. Leaves stock alone — an online
 * order never committed any. */
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
export async function refundOrderPayment(
  orderId: string,
  amount: number,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const orderRes = await pool.query('SELECT payment_method, amount_paid, amount_refunded FROM orders WHERE id = $1', [
    orderId,
  ]);
  const order = orderRes.rows[0];
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.payment_method === 'cod') {
    return { ok: false, error: 'Cash on Delivery orders are refunded manually — there is no payment to reverse.' };
  }

  const alreadyRefunded = Number(order.amount_refunded) || 0;
  const paid = Number(order.amount_paid) || 0;
  const refundable = Math.max(0, paid - alreadyRefunded);
  if (refundable <= 0) return { ok: false, error: 'This order has already been fully refunded.' };

  const amountToRefund = Math.min(amount, refundable);

  const paymentRes = await pool.query(
    `SELECT id, provider_payment_id FROM payments
     WHERE order_id = $1 AND status = 'PAID' AND provider_payment_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );
  const payment = paymentRes.rows[0];
  if (!payment) return { ok: false, error: 'No captured payment found for this order.' };

  const gateway = getPaymentGateway();
  const refund = await gateway.refund({
    paymentId: payment.provider_payment_id,
    amountMinor: toMinorUnits(amountToRefund),
    notes: { orderId, reason: reason.slice(0, 200) },
  });

  if (!refund.ok || !refund.refund) {
    return { ok: false, error: refund.error || 'The gateway did not confirm the refund.' };
  }

  await pool.query(
    `UPDATE payments SET refunded_minor = LEAST(amount_minor, refunded_minor + $2), updated_at = now()
     WHERE id = $1`,
    [payment.id, refund.refund.amountMinor]
  );
  await recordRefund({ orderId, amount: amountToRefund });
  return { ok: true };
}

/** True when shipments should be attempted at all. Exposed so callers can
 * explain *why* nothing shipped rather than failing silently. */
export function shipmentsEnabled(): boolean {
  return shipmentProviderConfigured() || !env.isProduction;
}
