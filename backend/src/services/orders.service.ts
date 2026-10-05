import { pool, loadDatabase, saveDatabase, InternalCMSDatabaseSchema } from '../db/db';
import { hasSellableStock } from '@glamirk/shared/utils/productVariant';
import {
  ORDER_STATUS_SEQUENCE,
  CANCELLABLE_ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  CLOSED_ORDER_STATUSES,
  canonicalOrderStatus,
  RETURN_STATUSES,
  Order,
  OrderItem,
  OrderStatus,
  OrderTimelineEvent,
  PaymentStatus,
  Product,
  ReturnRequest,
  ReturnStatus,
  Shade,
  ShipmentDetail,
  ShippingStatus,
} from '@glamirk/shared/types';

export { ORDER_STATUS_SEQUENCE, RETURN_STATUSES };
export const CANCELLABLE_STATUSES = CANCELLABLE_ORDER_STATUSES;

// return_requests rows are always fetched joined against orders for order_number,
// which the frontend ReturnRequest type requires alongside orderId.
export function mapReturnRequestRow(row: any): ReturnRequest {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    productId: row.product_id,
    productName: row.product_name,
    productImage: row.product_image || '',
    reason: row.reason,
    status: row.status,
    requestedAt: new Date(row.created_at).toISOString(),
    comment: row.comment || undefined,
    photoUrl: row.photo_url || undefined,
  };
}

const STATUS_NOTES: Partial<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: 'Awaiting payment confirmation',
  PLACED: 'Order placed successfully',
  CONFIRMED: 'Order confirmed and allocated',
  PROCESSING: 'Order is being prepared',
  PACKED: 'Order packed and ready for dispatch',
  READY_TO_SHIP: 'Order packed and ready for dispatch',
  SHIPPED: 'Order has been shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Order delivered',
  CANCELLED: 'Order cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Return completed',
  RTO: 'Returned to origin',
};

/**
 * Admins/automation only ever move an order one step forward at a time, or
 * sideways into a terminal state — never backward and never skipping a stage.
 *
 * Both ends are normalised through canonicalOrderStatus first, so an order
 * still sitting on a legacy PLACED/PACKED value advances exactly as if it had
 * been written with the modern spelling. Without that, every order placed
 * before the lifecycle split would be frozen: PLACED is not on the ladder, so
 * indexOf would return -1 and no transition would ever be legal.
 */
export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  const current = canonicalOrderStatus(from);
  const next = canonicalOrderStatus(to);

  if (current === next) return false;
  // Closed, not merely delivered. A DELIVERED order is excluded from this
  // guard on purpose so the RETURN_REQUESTED rule below can still fire —
  // blocking every transition out of DELIVERED would make returns
  // unraisable.
  if (CLOSED_ORDER_STATUSES.includes(current)) return false;

  if (next === 'CANCELLED') return CANCELLABLE_STATUSES.includes(from) || CANCELLABLE_STATUSES.includes(current);

  // Post-delivery outcomes. A return is raised against a delivered order; an
  // RTO is the courier bringing back something that never got there, so it is
  // reachable from any in-flight shipping state rather than from DELIVERED.
  if (next === 'RETURN_REQUESTED') return current === 'DELIVERED';
  if (next === 'RETURNED') return current === 'RETURN_REQUESTED';
  if (next === 'RTO') return ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(current);

  const fromIdx = ORDER_STATUS_SEQUENCE.indexOf(current);
  const toIdx = ORDER_STATUS_SEQUENCE.indexOf(next);
  return fromIdx !== -1 && toIdx === fromIdx + 1;
}

/** The single status an order may legally advance to next, or null at the end
 * of the ladder. Shared so the admin's "next step" button and the server agree
 * without each deriving it separately. */
export function nextOrderStatus(from: OrderStatus): OrderStatus | null {
  const current = canonicalOrderStatus(from);
  const idx = ORDER_STATUS_SEQUENCE.indexOf(current);
  if (idx === -1 || idx >= ORDER_STATUS_SEQUENCE.length - 1) return null;
  return ORDER_STATUS_SEQUENCE[idx + 1];
}

export async function insertOrderStatusHistory(orderId: string, status: OrderStatus, note?: string): Promise<void> {
  const id = 'osh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    'INSERT INTO order_status_history (id, order_id, status, note) VALUES ($1, $2, $3, $4)',
    [id, orderId, status, note || STATUS_NOTES[status] || '']
  );
}

function mapHistoryRows(rows: any[]): OrderTimelineEvent[] {
  return rows.map((r) => ({
    status: r.status,
    timestamp: new Date(r.created_at).toISOString(),
    note: r.note || STATUS_NOTES[r.status as OrderStatus] || '',
    completed: true,
  }));
}

export async function getOrderTimeline(orderId: string): Promise<OrderTimelineEvent[]> {
  const res = await pool.query(
    'SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
    [orderId]
  );
  return mapHistoryRows(res.rows);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

// Restocks every line item of an order back into the product catalog
// (cms_state JSONB, not a relational table — products are never a SQL row).
// Caller is responsible for wrapping this in withStockLock, matching
// checkout's stock-mutation safety guarantee.
export async function restockOrderItems(orderId: string): Promise<void> {
  const itemsRes = await pool.query('SELECT product_id, variant_id, selected_size, quantity FROM order_items WHERE order_id = $1', [orderId]);
  if (itemsRes.rows.length === 0) return;

  const db = await loadDatabase();
  let changed = false;
  for (const row of itemsRes.rows) {
    const idx = db.products.findIndex((p) => p.id === row.product_id);
    if (idx === -1) continue;
    const newStock = db.products[idx].stock + row.quantity;
    let nextShades = db.products[idx].shades;
    if (row.variant_id && nextShades) {
      nextShades = nextShades.map((s) => {
        if (s.id !== row.variant_id) return s;
        if (row.selected_size && s.sizes && s.sizes.length > 0) {
          return {
            ...s,
            sizes: s.sizes.map((sz) =>
              sz.label === row.selected_size && sz.stock !== undefined ? { ...sz, stock: sz.stock + row.quantity } : sz
            ),
          };
        }
        return s.stock !== undefined ? { ...s, stock: s.stock + row.quantity } : s;
      });
    }
    let nextSizePricing = db.products[idx].sizePricing;
    if (!row.variant_id && row.selected_size && nextSizePricing?.[row.selected_size]?.stock !== undefined) {
      const entry = nextSizePricing[row.selected_size];
      nextSizePricing = { ...nextSizePricing, [row.selected_size]: { ...entry, stock: entry.stock! + row.quantity } };
    }
    const next = {
      ...db.products[idx],
      stock: newStock,
      shades: nextShades,
      sizePricing: nextSizePricing,
    };
    // Same derivation as the deduction path — see applyStockDelta.
    db.products[idx] = { ...next, inStock: hasSellableStock(next) };
    changed = true;
  }
  if (changed) await saveDatabase(db);
}

function findProductInDb(db: InternalCMSDatabaseSchema, productId: string): Product | undefined {
  return db.products.find((p) => p.id === productId);
}

function findShadeInDb(product: Product | undefined, variantId: string | null): Shade | undefined {
  if (!product || !variantId || !product.shades) return undefined;
  return product.shades.find((s) => s.id === variantId);
}

export function mapOrderItemRows(itemRows: any[], db: InternalCMSDatabaseSchema): OrderItem[] {
  return itemRows.map((it) => {
    const product = findProductInDb(db, it.product_id);
    return {
      productId: it.product_id,
      productName: it.product_name,
      productImage: product?.images?.primary || '',
      shade: findShadeInDb(product, it.variant_id),
      size: it.selected_size || undefined,
      price: Number(it.price),
      quantity: it.quantity,
    };
  });
}

/**
 * The furthest-along return state on an order, or undefined if nothing was
 * returned.
 *
 * An order's own `status` stops at RETURN_REQUESTED — whether the money has
 * actually gone back lives in return_requests. Surfacing the furthest-along
 * state (rather than the first, or a count) is what lets the orders list show
 * a real "Refunded" filter instead of inferring it: a two-item order with one
 * refund settled and one still under review reads as in-progress, which is
 * what the customer is actually waiting on.
 */
function furthestReturnStatus(rows: { status: string }[]): ReturnStatus | undefined {
  let best: ReturnStatus | undefined;
  let bestIndex = -1;
  for (const row of rows) {
    const index = RETURN_STATUSES.indexOf(row.status as ReturnStatus);
    if (index > bestIndex) {
      bestIndex = index;
      best = row.status as ReturnStatus;
    }
  }
  return best;
}

export function mapShipmentRow(row: any): ShipmentDetail {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerOrderId: row.provider_order_id || undefined,
    providerShipmentId: row.provider_shipment_id || undefined,
    awbCode: row.awb_code || undefined,
    courierName: row.courier_name || undefined,
    trackingUrl: row.tracking_url || undefined,
    labelUrl: row.label_url || undefined,
    manifestUrl: row.manifest_url || undefined,
    status: (row.status || 'NOT_SHIPPED') as ShippingStatus,
    freightCharge: row.freight_charge === null || row.freight_charge === undefined ? undefined : Number(row.freight_charge),
    appliedWeight: row.applied_weight === null || row.applied_weight === undefined ? undefined : Number(row.applied_weight),
    isCod: !!row.is_cod,
    pickupScheduledAt: row.pickup_scheduled_at ? new Date(row.pickup_scheduled_at).toISOString() : undefined,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : undefined,
    attemptCount: Number(row.attempt_count) || 0,
    lastError: row.last_error || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function assembleOrder(
  row: any,
  items: OrderItem[],
  timeline: OrderTimelineEvent[],
  returnRows: { status: string }[] = [],
  shipmentRow?: any
): Order {
  const createdAt = new Date(row.created_at).toISOString();
  return {
    refundStatus: furthestReturnStatus(returnRows),
    // The three lifecycles. payment_status has carried COD_PENDING/PAID since
    // migration 002 and now carries the wider vocabulary too; shipping_status
    // was backfilled for every pre-existing row by migration 011, so neither
    // needs a fallback for "old row" — only for a row read mid-migration.
    paymentStatus: (row.payment_status || 'COD_PENDING') as PaymentStatus,
    shippingStatus: (row.shipping_status || 'NOT_SHIPPED') as ShippingStatus,
    amountPaid: Number(row.amount_paid) || 0,
    amountRefunded: Number(row.amount_refunded) || 0,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : undefined,
    cancellationReason: row.cancellation_reason || undefined,
    shipment: shipmentRow ? mapShipmentRow(shipmentRow) : undefined,
    id: row.id,
    orderNumber: row.order_number,
    createdAt,
    status: row.status,
    items,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    shipping: Number(row.shipping),
    tax: 0,
    total: Number(row.total),
    deliveryAddress: row.shipping_address,
    payment: row.payment_details || { method: row.payment_method, status: row.payment_status },
    estimatedDelivery: new Date(new Date(row.created_at).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    // Null until an admin attaches an AWB (PUT /api/admin/orders/:id/shipment).
    trackingNumber: row.tracking_number || undefined,
    courierPartner: row.courier_partner || undefined,
    timeline:
      timeline.length > 0
        ? timeline
        : [{ status: row.status, timestamp: createdAt, note: STATUS_NOTES[row.status as OrderStatus] || '', completed: true }],
  };
}

// Builds the full API-facing Order shape from an `orders` row, fetching its
// items and real status-history timeline. Shared by every place that returns
// a single order to a client (customer detail/cancel, admin detail/status-update).
export async function buildOrderFromRow(row: any, db: InternalCMSDatabaseSchema): Promise<Order> {
  const [itemsRes, timeline, returnsRes, shipmentRes] = await Promise.all([
    pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC', [row.id]),
    getOrderTimeline(row.id),
    pool.query('SELECT status FROM return_requests WHERE order_id = $1', [row.id]),
    pool.query('SELECT * FROM shipments WHERE order_id = $1', [row.id]),
  ]);
  return assembleOrder(row, mapOrderItemRows(itemsRes.rows, db), timeline, returnsRes.rows, shipmentRes.rows[0]);
}

// Batched equivalent of buildOrderFromRow for list endpoints (customer order
// history, admin order list) — fetches items and timeline for every order in
// 2 queries total instead of 2 per order, then assembles each in memory.
export async function buildOrdersFromRows(rows: any[], db: InternalCMSDatabaseSchema): Promise<Order[]> {
  if (rows.length === 0) return [];
  const orderIds = rows.map((r) => r.id);

  const [itemsRes, historyRes, returnsRes, shipmentsRes] = await Promise.all([
    pool.query('SELECT * FROM order_items WHERE order_id = ANY($1::text[]) ORDER BY created_at ASC', [orderIds]),
    pool.query('SELECT * FROM order_status_history WHERE order_id = ANY($1::text[]) ORDER BY created_at ASC', [orderIds]),
    // Batched rather than one query per order, for the same reason the other
    // two are: an admin page of 50 orders would otherwise cost 200 round trips.
    pool.query('SELECT order_id, status FROM return_requests WHERE order_id = ANY($1::text[])', [orderIds]),
    pool.query('SELECT * FROM shipments WHERE order_id = ANY($1::text[])', [orderIds]),
  ]);

  const itemsByOrder = groupBy(itemsRes.rows, (r) => r.order_id);
  const historyByOrder = groupBy(historyRes.rows, (r) => r.order_id);
  const returnsByOrder = groupBy(returnsRes.rows, (r) => r.order_id);
  const shipmentByOrder = new Map(shipmentsRes.rows.map((r) => [r.order_id, r]));

  return rows.map((row) =>
    assembleOrder(
      row,
      mapOrderItemRows(itemsByOrder.get(row.id) || [], db),
      mapHistoryRows(historyByOrder.get(row.id) || []),
      returnsByOrder.get(row.id) || [],
      shipmentByOrder.get(row.id)
    )
  );
}
