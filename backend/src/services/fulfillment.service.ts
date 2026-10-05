import { pool, loadDatabase, saveDatabase, withStockLock } from '../db/db';
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
  getShippingProvider,
  selectCourier,
  shippingConfigured,
  scrubSecrets,
  scanDedupeKey,
  CreateShipmentInput,
  ShiprocketScan,
} from './shiprocket.service';
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
  // Shiprocket outage must not turn a successful payment into a failed
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
 * Creates the courier shipment for an order, exactly once.
 *
 * Duplicate protection is the unique index on shipments.order_id, claimed up
 * front: the row is inserted *before* any API call, so a second concurrent
 * caller fails the insert and backs off rather than both reaching Shiprocket
 * and buying two AWBs for one parcel.
 *
 * Partial failure is expected and handled: if the order is created but AWB
 * assignment fails, the shipment row keeps what succeeded and records the
 * error, so a retry resumes from where it stopped instead of creating a second
 * Shiprocket order.
 */
export async function createShipmentForOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
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

  const shipmentId = 'shp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const isCod = order.payment_method === 'cod';

  // Claim the slot. ON CONFLICT DO NOTHING means a concurrent caller simply
  // finds nothing inserted and stops.
  const claim = await pool.query(
    `INSERT INTO shipments (id, order_id, provider, status, is_cod)
     VALUES ($1, $2, $3, 'PENDING', $4)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id`,
    [shipmentId, orderId, getShippingProvider().name, isCod]
  );

  let shipmentRowId = claim.rows[0]?.id;
  if (!shipmentRowId) {
    // A shipment row already exists. Resume only if it never got an AWB —
    // otherwise this is a genuine duplicate attempt and must not proceed.
    const existing = await pool.query('SELECT id, awb_code, attempt_count FROM shipments WHERE order_id = $1', [orderId]);
    const row = existing.rows[0];
    if (!row) return { ok: false, error: 'Shipment row vanished.' };
    if (row.awb_code) return { ok: true };
    if (row.attempt_count >= 5) {
      return { ok: false, error: 'Shipment creation has failed too many times; needs manual review.' };
    }
    shipmentRowId = row.id;
  }

  await pool.query('UPDATE shipments SET attempt_count = attempt_count + 1, updated_at = now() WHERE id = $1', [
    shipmentRowId,
  ]);

  // Records the failure against the shipment and leaves the integration in
  // FAILED, which is what makes a retry possible and visible. The Glamirk order
  // is never cancelled, refunded or stock-released because a courier call
  // failed — a parcel we have not booked yet is still a sale we owe the
  // customer.
  const fail = async (rawError: string) => {
    const error = scrubSecrets(rawError);
    await pool.query(
      `UPDATE shipments SET last_error = $2, integration_status = 'FAILED', updated_at = now() WHERE id = $1`,
      [shipmentRowId, error]
    );
    console.error(`[fulfillment] shipment ${shipmentRowId} for order ${orderId}: ${error}`);
    return { ok: false, error };
  };

  const provider = getShippingProvider();
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
    const unitWeight = Number((product as any)?.weightKg) || env.shiprocket.defaultWeightKg;
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
    lengthCm: env.shiprocket.defaultLengthCm,
    breadthCm: env.shiprocket.defaultBreadthCm,
    heightCm: env.shiprocket.defaultHeightCm,
  };

  if (!payload.address.pinCode) return fail('Order has no delivery pincode.');

  // 1. Which couriers will actually carry this, to this pincode, at this
  //    weight, with this payment mode.
  const serviceability = await provider.checkServiceability({
    deliveryPincode: payload.address.pinCode,
    weightKg,
    isCod,
    declaredValue: Number(order.total),
  });
  if (!serviceability.ok) return fail(`Serviceability check failed: ${serviceability.error}`);

  const courier = selectCourier(serviceability.value);
  if (!courier) return fail(`No courier services pincode ${payload.address.pinCode} for this shipment.`);

  // 2. Create the shipment.
  const created = await provider.createShipment(payload);
  if (!created.ok) return fail(`Create failed: ${created.error}`);

  await pool.query(
    `UPDATE shipments SET provider_order_id = $2, provider_shipment_id = $3, provider_response = $4::jsonb,
            courier_company_id = $5, courier_name = $6, integration_status = 'CREATED', updated_at = now()
     WHERE id = $1`,
    [
      shipmentRowId,
      created.value.providerOrderId,
      created.value.providerShipmentId,
      JSON.stringify(created.value.raw || {}),
      courier.courierCompanyId,
      courier.courierName,
    ]
  );

  // 3. Buy the AWB from the selected courier.
  const awb = await provider.assignAwb({
    shipmentId: created.value.providerShipmentId,
    courierCompanyId: courier.courierCompanyId,
  });
  if (!awb.ok) return fail(`AWB assignment failed: ${awb.error}`);

  const trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(awb.value.awbCode)}`;

  // 4. Label. Non-fatal: the shipment is real and trackable without one, and
  //    it can be regenerated from the admin panel at any time.
  const label = await provider.generateLabel({ shipmentId: created.value.providerShipmentId });

  await pool.query(
    `UPDATE shipments SET awb_code = $2, courier_name = $3, courier_company_id = $4,
            tracking_url = $5, label_url = $6, status = 'AWB_ASSIGNED',
            integration_status = 'READY', last_error = NULL,
            provider_artifacts = provider_artifacts || $7::jsonb,
            updated_at = now()
     WHERE id = $1`,
    [
      shipmentRowId,
      awb.value.awbCode,
      awb.value.courierName,
      awb.value.courierCompanyId,
      trackingUrl,
      label.ok ? label.value.labelUrl : null,
      JSON.stringify(label.ok ? { label: label.value.raw ?? {} } : {}),
    ]
  );

  // The orders table keeps carrying these three columns because the existing
  // tracking screen and admin read them directly. Written alongside the
  // shipment row rather than instead of it.
  await pool.query(
    `UPDATE orders SET tracking_number = $2, courier_partner = $3, courier_tracking_url = $4,
            shipping_status = 'AWB_ASSIGNED'
     WHERE id = $1`,
    [orderId, awb.value.awbCode, awb.value.courierName, trackingUrl]
  );

  // 5. Ask the courier to collect, and 6. produce the invoice.
  //
  // Both are deliberately non-fatal and deliberately after the AWB write above.
  // The parcel is booked and trackable at this point; a pickup that has to be
  // re-requested or an invoice that has to be regenerated is an operational
  // nuisance, not a reason to report the shipment as failed and have a retry
  // walk the whole sequence again. Each is independently idempotent, so the
  // admin retry button resumes exactly the step that did not finish.
  await ensureShipmentPickup(orderId);
  await ensureShipmentInvoice(orderId);

  return { ok: true };
}

/**
 * Loads the shipment row with the fields the post-AWB steps need.
 *
 * Shared by pickup, manifest and invoice so each one checks the same
 * preconditions against the same row rather than three slightly different
 * readings of "is this shipment ready".
 */
async function loadShipmentRow(orderId: string): Promise<any | null> {
  const res = await pool.query(
    `SELECT id, order_id, provider_order_id, provider_shipment_id, awb_code,
            pickup_requested_at, pickup_scheduled_at, manifest_url, manifest_generated_at, invoice_url
     FROM shipments WHERE order_id = $1`,
    [orderId]
  );
  return res.rows[0] || null;
}

/**
 * Requests the courier pickup, exactly once.
 *
 * Idempotency is the pickup_requested_at marker, claimed with a conditional
 * UPDATE before the provider is called: a second concurrent caller updates zero
 * rows and returns without touching Shiprocket. Generating a duplicate pickup
 * is not harmless — it books a second courier visit someone has to cancel.
 *
 * The marker is cleared again if the call fails, so a transient failure stays
 * retryable rather than permanently convincing us a pickup exists.
 */
export async function ensureShipmentPickup(orderId: string): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const shipment = await loadShipmentRow(orderId);
  if (!shipment) return { ok: false, error: 'This order has no shipment.' };
  if (!shipment.provider_shipment_id) return { ok: false, error: 'Shipment has not been created with the courier yet.' };
  // Shiprocket rejects a pickup for a shipment with no AWB, and so do we —
  // locally, without spending a call to find out.
  if (!shipment.awb_code) return { ok: false, error: 'Shipment has no AWB yet.' };
  if (shipment.pickup_requested_at) return { ok: true, skipped: true };

  const claim = await pool.query(
    `UPDATE shipments SET pickup_requested_at = now(), updated_at = now()
     WHERE id = $1 AND pickup_requested_at IS NULL
     RETURNING id`,
    [shipment.id]
  );
  if (claim.rows.length === 0) return { ok: true, skipped: true };

  const result = await getShippingProvider().generatePickup({ shipmentId: shipment.provider_shipment_id });
  if (!result.ok) {
    const error = scrubSecrets(result.error || 'Pickup generation failed.');
    // Release the claim so this can be retried. Safe: the provider told us it
    // did not schedule anything.
    await pool.query(
      'UPDATE shipments SET pickup_requested_at = NULL, last_error = $2, updated_at = now() WHERE id = $1',
      [shipment.id, error]
    );
    console.error(`[fulfillment] pickup for order ${orderId}: ${error}`);
    return { ok: false, error };
  }

  await pool.query(
    `UPDATE shipments SET pickup_scheduled_at = now(), status = 'PICKUP_SCHEDULED',
            provider_artifacts = provider_artifacts || $2::jsonb, last_error = NULL, updated_at = now()
     WHERE id = $1`,
    [shipment.id, JSON.stringify({ pickup: result.value?.raw ?? {} })]
  );
  // The parcel's own lifecycle moves through the one function that owns it, so
  // the order status, timeline and notifications stay consistent with every
  // other way a shipment can advance.
  await applyShippingStatus({
    orderId,
    status: 'PICKUP_SCHEDULED',
    awbCode: shipment.awb_code,
    note: 'Pickup scheduled with the courier',
  });
  return { ok: true };
}

/**
 * Generates (and if needed prints) the handover manifest for this shipment.
 *
 * Two endpoints, because Shiprocket splits them: /manifests/generate creates
 * the document and sometimes returns its URL; /manifests/print returns the URL
 * for an already-generated manifest. The print call is made only when generate
 * did not hand one back, so the normal path costs one request.
 */
export async function generateShipmentManifest(orderId: string): Promise<{ ok: boolean; error?: string; manifestUrl?: string }> {
  const shipment = await loadShipmentRow(orderId);
  if (!shipment) return { ok: false, error: 'This order has no shipment.' };
  if (!shipment.provider_shipment_id) return { ok: false, error: 'Shipment has not been created with the courier yet.' };
  if (!shipment.awb_code) return { ok: false, error: 'Shipment has no AWB yet.' };
  // Already produced. Returned rather than regenerated — a manifest is a
  // handover record, and reissuing it after the courier has signed one is how
  // a disputed handover becomes unprovable.
  if (shipment.manifest_url) return { ok: true, manifestUrl: shipment.manifest_url };

  const provider = getShippingProvider();
  const generated = await provider.generateManifest({ shipmentId: shipment.provider_shipment_id });
  if (!generated.ok) {
    const error = scrubSecrets(generated.error || 'Manifest generation failed.');
    await pool.query('UPDATE shipments SET last_error = $2, updated_at = now() WHERE id = $1', [shipment.id, error]);
    return { ok: false, error };
  }

  let manifestUrl = generated.value?.manifestUrl;
  let printRaw: unknown = null;
  if (!manifestUrl && shipment.provider_order_id) {
    const printed = await provider.printManifest({ orderIds: [shipment.provider_order_id] });
    if (printed.ok) {
      manifestUrl = printed.value.manifestUrl;
      printRaw = printed.value.raw ?? {};
    }
  }

  await pool.query(
    `UPDATE shipments SET manifest_url = COALESCE($2, manifest_url), manifest_generated_at = now(),
            provider_artifacts = provider_artifacts || $3::jsonb, updated_at = now()
     WHERE id = $1`,
    [
      shipment.id,
      manifestUrl || null,
      JSON.stringify({ manifest: generated.value?.raw ?? {}, ...(printRaw ? { manifestPrint: printRaw } : {}) }),
    ]
  );

  // Generated but with no URL is a partial success: the manifest exists at
  // Shiprocket and can be printed later from the admin panel.
  return { ok: true, manifestUrl };
}

/**
 * Fetches the Shiprocket invoice PDF for this order.
 *
 * Idempotent by stored URL: once we have one, the call is not repeated. The
 * invoice is keyed on Shiprocket's ORDER id, not the shipment id — a different
 * identifier from every other step here, which is why it is read explicitly
 * from provider_order_id rather than reusing the shipment id.
 */
export async function ensureShipmentInvoice(orderId: string): Promise<{ ok: boolean; error?: string; invoiceUrl?: string }> {
  const shipment = await loadShipmentRow(orderId);
  if (!shipment) return { ok: false, error: 'This order has no shipment.' };
  if (shipment.invoice_url) return { ok: true, invoiceUrl: shipment.invoice_url };
  if (!shipment.provider_order_id) return { ok: false, error: 'Shipment has no Shiprocket order id yet.' };

  const result = await getShippingProvider().generateInvoice({ orderIds: [shipment.provider_order_id] });
  if (!result.ok) {
    const error = scrubSecrets(result.error || 'Invoice generation failed.');
    // Non-fatal and not recorded as a shipment failure: an invoice is a
    // document, and its absence does not stop the parcel moving.
    console.warn(`[fulfillment] invoice for order ${orderId}: ${error}`);
    return { ok: false, error };
  }

  await pool.query(
    `UPDATE shipments SET invoice_url = $2, provider_artifacts = provider_artifacts || $3::jsonb, updated_at = now()
     WHERE id = $1`,
    [shipment.id, result.value.invoiceUrl, JSON.stringify({ invoice: result.value.raw ?? {} })]
  );
  return { ok: true, invoiceUrl: result.value.invoiceUrl };
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
  scans: ShiprocketScan[];
  source?: string;
  providerStatus?: string | null;
  providerStatusId?: number | null;
  mappedStatus?: ShippingStatus | null;
}): Promise<number> {
  let inserted = 0;
  for (const scan of input.scans) {
    const dedupeKey = scanDedupeKey({
      awb: input.awb,
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
    const currentStatus = orderUpdate.rows[0]?.status;
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
  const result = await pool.query('SELECT id, awb_code, status FROM shipments WHERE order_id = $1', [orderId]);
  const shipment = result.rows[0];
  if (!shipment || !shipment.awb_code) return false;
  if (['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(shipment.status)) {
    return false;
  }

  const provider = getShippingProvider();
  const cancelled = await provider.cancelShipment({ awbCode: shipment.awb_code });
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
  return shippingConfigured() || !env.isProduction;
}
