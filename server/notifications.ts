import { pool, broadcastEvent } from './db';
import { OrderStatus, ReturnRequest, AppNotification } from '../src/types';

const ORDER_STATUS_NOTIFICATION: Partial<Record<OrderStatus, { title: string; body: (orderNumber: string) => string }>> = {
  PLACED: { title: 'Order Placed', body: (n) => `Your order #${n} has been placed successfully.` },
  CONFIRMED: { title: 'Order Confirmed', body: (n) => `Your order #${n} has been confirmed.` },
  PACKED: { title: 'Order Packed', body: (n) => `Your order #${n} has been packed and is ready for dispatch.` },
  SHIPPED: { title: 'Order Shipped', body: (n) => `Your order #${n} has been shipped.` },
  OUT_FOR_DELIVERY: { title: 'Out for Delivery', body: (n) => `Your order #${n} is out for delivery.` },
  DELIVERED: { title: 'Order Delivered', body: (n) => `Your order #${n} has been delivered. We hope you love it!` },
  CANCELLED: { title: 'Order Cancelled', body: (n) => `Your order #${n} has been cancelled.` },
};

const RETURN_STATUS_NOTIFICATION: Partial<Record<ReturnRequest['status'], { title: string; body: (orderNumber: string) => string }>> = {
  SUBMITTED: { title: 'Return Requested', body: (n) => `Your return request for order #${n} has been submitted.` },
  UNDER_REVIEW: { title: 'Return Under Review', body: (n) => `Your return request for order #${n} is under review.` },
  APPROVED: { title: 'Return Approved', body: (n) => `Your return request for order #${n} has been approved.` },
  PICKUP_SCHEDULED: { title: 'Pickup Scheduled', body: (n) => `Pickup has been scheduled for your return on order #${n}.` },
  REFUNDED: { title: 'Refund Completed', body: (n) => `Your refund for order #${n} has been completed.` },
};

async function insertNotification(userId: string, type: string, title: string, body: string, orderId?: string): Promise<void> {
  const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const result = await pool.query(
    'INSERT INTO notifications (id, user_id, type, title, body, order_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [id, userId, type, title, body, orderId || null]
  );
  // Pushed over the same SSE stream CMS content already uses — every
  // connected client receives it, so the payload carries userId and the
  // client is responsible for ignoring events that aren't theirs.
  broadcastEvent('NEW_NOTIFICATION', 'customer', { userId, notification: mapNotificationRow(result.rows[0]) });
}

export async function notifyOrderStatusChange(userId: string, orderId: string, orderNumber: string, status: OrderStatus): Promise<void> {
  const entry = ORDER_STATUS_NOTIFICATION[status];
  if (!entry) return;
  await insertNotification(userId, 'ORDER_STATUS', entry.title, entry.body(orderNumber), orderId);
}

export async function notifyReturnStatusChange(
  userId: string,
  orderId: string,
  orderNumber: string,
  status: ReturnRequest['status']
): Promise<void> {
  const entry = RETURN_STATUS_NOTIFICATION[status];
  if (!entry) return;
  await insertNotification(userId, 'RETURN_STATUS', entry.title, entry.body(orderNumber), orderId);
}

// Shared by both the per-customer `notifications` table and the shared
// `admin_notifications` table — the two tables intentionally stay separate
// (one is owned-per-row, the other is a global feed like the audit log) but
// they happen to have the exact same shape, so one mapper serves both.
export function mapNotificationRow(row: any): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    createdAt: new Date(row.created_at).toISOString(),
    orderId: row.order_id || undefined,
  };
}

// ==========================================
// Store-side (admin/company) notifications — the other half of "both sides
// find out automatically": these fire on events the admin didn't themselves
// trigger (a new order coming in) or that other admins should learn about
// without watching the order (a delivery being marked complete).
// ==========================================

async function insertAdminNotification(type: string, title: string, body: string, orderId?: string): Promise<void> {
  const id = 'anotif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const result = await pool.query(
    'INSERT INTO admin_notifications (id, type, title, body, order_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [id, type, title, body, orderId || null]
  );
  broadcastEvent('NEW_ADMIN_NOTIFICATION', 'admin', { notification: mapNotificationRow(result.rows[0]) });
}

export async function notifyAdminNewOrder(orderId: string, orderNumber: string, customerName: string, total: number): Promise<void> {
  await insertAdminNotification(
    'NEW_ORDER',
    'New Order Received',
    `${customerName || 'A customer'} placed order #${orderNumber} — ₹${total}.`,
    orderId
  );
}

export async function notifyAdminOrderDelivered(orderId: string, orderNumber: string): Promise<void> {
  await insertAdminNotification('ORDER_DELIVERED', 'Order Delivered', `Order #${orderNumber} has been delivered.`, orderId);
}
