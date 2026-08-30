import { pool, loadDatabase, saveDatabase, InternalCMSDatabaseSchema } from './db';
import {
  ORDER_STATUS_SEQUENCE,
  CANCELLABLE_ORDER_STATUSES,
  RETURN_STATUSES,
  Order,
  OrderItem,
  OrderStatus,
  OrderTimelineEvent,
  Product,
  ReturnRequest,
  Shade,
} from '../src/types';

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
  PLACED: 'Order placed successfully',
  CONFIRMED: 'Order confirmed and allocated',
  PACKED: 'Order packed and ready for dispatch',
  SHIPPED: 'Order has been shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Order delivered',
  CANCELLED: 'Order cancelled',
  RETURN_REQUESTED: 'Return requested',
};

// Admins/automation only ever move an order one step forward at a time, or
// sideways into CANCELLED from an early-enough status — never backward and
// never skipping a stage.
export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === 'CANCELLED') return CANCELLABLE_STATUSES.includes(from);
  const fromIdx = ORDER_STATUS_SEQUENCE.indexOf(from);
  const toIdx = ORDER_STATUS_SEQUENCE.indexOf(to);
  return fromIdx !== -1 && toIdx === fromIdx + 1;
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
  const itemsRes = await pool.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]);
  if (itemsRes.rows.length === 0) return;

  const db = await loadDatabase();
  let changed = false;
  for (const row of itemsRes.rows) {
    const idx = db.products.findIndex((p) => p.id === row.product_id);
    if (idx === -1) continue;
    const newStock = db.products[idx].stock + row.quantity;
    db.products[idx] = { ...db.products[idx], stock: newStock, inStock: newStock > 0 };
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
      price: Number(it.price),
      quantity: it.quantity,
    };
  });
}

function assembleOrder(row: any, items: OrderItem[], timeline: OrderTimelineEvent[]): Order {
  const createdAt = new Date(row.created_at).toISOString();
  return {
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
  const itemsRes = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC', [row.id]);
  const timeline = await getOrderTimeline(row.id);
  return assembleOrder(row, mapOrderItemRows(itemsRes.rows, db), timeline);
}

// Batched equivalent of buildOrderFromRow for list endpoints (customer order
// history, admin order list) — fetches items and timeline for every order in
// 2 queries total instead of 2 per order, then assembles each in memory.
export async function buildOrdersFromRows(rows: any[], db: InternalCMSDatabaseSchema): Promise<Order[]> {
  if (rows.length === 0) return [];
  const orderIds = rows.map((r) => r.id);

  const [itemsRes, historyRes] = await Promise.all([
    pool.query('SELECT * FROM order_items WHERE order_id = ANY($1::text[]) ORDER BY created_at ASC', [orderIds]),
    pool.query('SELECT * FROM order_status_history WHERE order_id = ANY($1::text[]) ORDER BY created_at ASC', [orderIds]),
  ]);

  const itemsByOrder = groupBy(itemsRes.rows, (r) => r.order_id);
  const historyByOrder = groupBy(historyRes.rows, (r) => r.order_id);

  return rows.map((row) =>
    assembleOrder(row, mapOrderItemRows(itemsByOrder.get(row.id) || [], db), mapHistoryRows(historyByOrder.get(row.id) || []))
  );
}
