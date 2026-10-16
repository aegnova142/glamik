import { pool } from '../db/db';
import { OrderStatus, ReturnRequest } from '@glamirk/shared/types';
import { enqueueNotification, NotificationEventType } from './notificationEngine.service';
// Side-effect import: installs the channel adapters. Every caller of this
// module wants delivery, not just an outbox row, and forgetting this import
// is the one mistake that would make the whole thing silently inert.
import './notificationChannels.service';

// ==========================================
// TRANSITION → EVENT MAPPING
//
// The one place that knows which business transition deserves which
// notification event. It exists so that `fulfillment`, `admin.routes` and
// `customer.routes` can say "this order just shipped" without any of them
// holding an opinion about channels, copy, recipients or dedupe keys — and
// without three different files drifting into three different answers, which
// is exactly what happened to the nineteen call sites this replaces.
//
// WHAT IT GUARANTEES.
//
// Recipients are read from the order row, never passed in. The recipient is a
// fact about the order, not about the message; the old call sites each had to
// remember to pass customer_email, and the ones that forgot sent nothing.
//
// Nothing here throws. A notification is a side effect of a transition that
// has already committed — the money has moved, the courier has the parcel —
// and an outbox hiccup must never unwind it or turn a successful request into
// a reported failure. Every entry point swallows and logs.
//
// Nothing here sends. These functions write an outbox row and return; the
// worker in server.ts does the delivering. That is what keeps an SMTP
// round-trip out of a payment confirmation.
// ==========================================

/**
 * Statuses that are worth telling a customer about.
 *
 * PRESERVED EXACTLY from the two legacy maps it replaces — the in-app
 * ORDER_STATUS_NOTIFICATION and the email ORDER_STATUS_EMAIL covered the same
 * seven statuses, and a customer who used to receive a "your order is packed"
 * message must still receive one.
 *
 * PROCESSING is the single deliberate addition: the engine already carries
 * copy for it (written when the outbox was built, precisely because the old
 * maps had the gap), and an order that has entered preparation is a real
 * thing to tell someone about.
 *
 * The statuses absent here are absent on purpose and were silent before:
 * PENDING_PAYMENT (nothing has happened yet — an unpaid order is a request,
 * not an order), READY_TO_SHIP (internal warehouse bookkeeping the customer
 * cannot act on), and RETURN_REQUESTED / RETURNED / RTO, which are narrated
 * by the return workflow below rather than by the order's own status.
 */
const STATUS_EVENT: Partial<Record<OrderStatus, NotificationEventType>> = {
  PLACED: 'ORDER_PLACED',
  CONFIRMED: 'ORDER_CONFIRMED',
  PROCESSING: 'ORDER_PROCESSING',
  PACKED: 'ORDER_PACKED',
  SHIPPED: 'ORDER_SHIPPED',
  OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  DELIVERED: 'ORDER_DELIVERED',
  CANCELLED: 'ORDER_CANCELLED',
};

/** The five return states the customer is told about. Taken verbatim from
 * RETURN_STATUS_NOTIFICATION; the other return states are internal. */
const RETURN_EVENT: Partial<Record<ReturnRequest['status'], NotificationEventType>> = {
  SUBMITTED: 'RETURN_REQUESTED',
  UNDER_REVIEW: 'RETURN_UNDER_REVIEW',
  APPROVED: 'RETURN_APPROVED',
  PICKUP_SCHEDULED: 'RETURN_PICKUP_SCHEDULED',
  REFUNDED: 'RETURN_REFUNDED',
};

interface OrderRecipient {
  id: string;
  userId: string | null;
  orderNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  total: number;
}

/**
 * Everything a message needs about an order, in one read.
 *
 * Callers may pass a row they already hold — most of them have just UPDATEd
 * it and have it in hand — which keeps this to zero extra queries on the hot
 * paths. Accepting either shape is what let the migration avoid adding a
 * round-trip to markOrderPaid and transitionOrderStatus.
 */
async function resolveOrder(orderIdOrRow: string | any): Promise<OrderRecipient | null> {
  let row = orderIdOrRow;
  if (typeof orderIdOrRow === 'string' || !row?.order_number) {
    const id = typeof orderIdOrRow === 'string' ? orderIdOrRow : orderIdOrRow?.id;
    if (!id) return null;
    const res = await pool.query(
      `SELECT id, user_id, order_number, customer_name, customer_email, customer_phone,
              payment_method, payment_status, total
       FROM orders WHERE id = $1`,
      [id]
    );
    row = res.rows[0];
    if (!row) return null;
  }
  return {
    id: row.id,
    userId: row.user_id || null,
    orderNumber: row.order_number,
    customerName: row.customer_name || null,
    customerEmail: row.customer_email || null,
    customerPhone: row.customer_phone || null,
    paymentMethod: row.payment_method || null,
    paymentStatus: row.payment_status || null,
    total: Number(row.total) || 0,
  };
}

/** The product lines a message may name. Trimmed to name and quantity — a
 * notification has no business carrying prices, shades or the full order. */
async function orderItems(orderId: string): Promise<{ name: string; quantity: number }[]> {
  try {
    const res = await pool.query(
      `SELECT product_name, quantity FROM order_items WHERE order_id = $1 ORDER BY created_at ASC LIMIT 20`,
      [orderId]
    );
    return res.rows.map((r) => ({ name: r.product_name, quantity: Number(r.quantity) }));
  } catch {
    // Item lines are decoration; a message without them is still correct.
    return [];
  }
}

/**
 * Tells the customer their order reached a new status.
 *
 * The dedupe key is the order plus the event, which makes a repeated admin
 * click, a redelivered courier webhook and the reconciliation sweep collapse
 * onto one message. The callers' conditional UPDATEs already filter most
 * replays out; this is the second line of defence, and the one that holds
 * when two different code paths both legitimately reach the same transition.
 */
export async function notifyOrderStatus(
  orderIdOrRow: string | any,
  status: OrderStatus,
  options: { includeItems?: boolean } = {}
): Promise<void> {
  try {
    const eventType = STATUS_EVENT[status];
    if (!eventType) return;

    const order = await resolveOrder(orderIdOrRow);
    if (!order) return;

    await enqueueNotification({
      orderId: order.id,
      userId: order.userId,
      eventType,
      dedupeKey: `${order.id}:${eventType}`,
      payload: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        toEmail: order.customerEmail,
        toPhone: order.customerPhone,
        paymentMethod: order.paymentMethod || undefined,
        total: order.total,
        ...(options.includeItems ? { items: await orderItems(order.id) } : {}),
      },
    });

    // Ask for a rating once they've had time to try it. Same dedupe rule, so a
    // repeated DELIVERED transition never schedules a second reminder.
    if (status === 'DELIVERED' && order.userId) {
      await enqueueNotification({
        orderId: order.id,
        userId: order.userId,
        eventType: 'REVIEW_REMINDER',
        dedupeKey: `${order.id}:REVIEW_REMINDER`,
        sendAt: new Date(Date.now() + REVIEW_REMINDER_DELAY_HOURS * 3_600_000),
        payload: { orderNumber: order.orderNumber, customerName: order.customerName, toEmail: order.customerEmail },
      });
    }
  } catch (err) {
    console.error(`[notifications] could not enqueue ${status} for order:`, err);
  }
}

/** How long after delivery the "rate your order" reminder goes out. */
const REVIEW_REMINDER_DELAY_HOURS = 48;

/**
 * Tells the customer a payment did not go through.
 *
 * Before the outbox existed this had no call site at all: a declined card, an
 * abandoned gateway session and an expired payment window were all completely
 * silent, and the customer's only clue was an order that quietly vanished.
 *
 * The copy for PAYMENT_FAILED says nothing was charged and never uses
 * confirmation wording, so there is no path by which a failure reads as a
 * success.
 */
export async function notifyPaymentFailed(
  orderIdOrRow: string | any,
  failureStatus: 'FAILED' | 'CANCELLED' | 'EXPIRED',
  reason?: string
): Promise<void> {
  try {
    const order = await resolveOrder(orderIdOrRow);
    if (!order) return;

    await enqueueNotification({
      orderId: order.id,
      userId: order.userId,
      eventType: 'PAYMENT_FAILED',
      // Not keyed on failureStatus: an order's payment fails once. A decline
      // followed by the expiry sweep finding the same order must not produce
      // two "your payment did not go through" messages.
      dedupeKey: `${order.id}:PAYMENT_FAILED`,
      payload: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        toEmail: order.customerEmail,
        toPhone: order.customerPhone,
        paymentMethod: order.paymentMethod || undefined,
        total: order.total,
        failureReason: reason || `Payment ${failureStatus.toLowerCase()}`,
      },
    });
  } catch (err) {
    console.error('[notifications] could not enqueue PAYMENT_FAILED:', err);
  }
}

/**
 * Tells the customer their money is on its way back, and tells the store it
 * went out.
 *
 * `refundRef` makes the key unique per refund rather than per order, because
 * partial refunds are real: an order may be refunded three times for three
 * different reasons, and each is a separate thing the customer must hear
 * about. Every caller passes the id of the refund row it just wrote, so a
 * replayed provider webhook reuses the same reference and collapses.
 */
export async function notifyRefund(input: {
  orderIdOrRow: string | any;
  refundRef: string;
  amount: number;
  fullyRefunded: boolean;
}): Promise<void> {
  try {
    const order = await resolveOrder(input.orderIdOrRow);
    if (!order) return;

    const payload = {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      toEmail: order.customerEmail,
      toPhone: order.customerPhone,
      paymentMethod: order.paymentMethod || undefined,
      total: order.total,
      refundAmount: input.amount,
      refundStatus: input.fullyRefunded ? 'FULL' : 'PARTIAL',
      orderId: order.id,
    };

    await Promise.all([
      enqueueNotification({
        orderId: order.id,
        userId: order.userId,
        eventType: 'REFUND_COMPLETED',
        dedupeKey: `${order.id}:REFUND_COMPLETED:${input.refundRef}`,
        payload,
      }),
      enqueueNotification({
        orderId: order.id,
        eventType: 'ADMIN_REFUND_ISSUED',
        dedupeKey: `${order.id}:ADMIN_REFUND_ISSUED:${input.refundRef}`,
        payload,
      }),
    ]);
  } catch (err) {
    console.error('[notifications] could not enqueue refund notifications:', err);
  }
}

/** Tells the store a prepaid order's payment is confirmed and the goods may
 * be dispatched. Fired only from markOrderPaid's conditional claim, so it is
 * exactly-once across the verify call, the webhook and the sweep. */
export async function notifyAdminPaid(orderIdOrRow: string | any): Promise<void> {
  try {
    const order = await resolveOrder(orderIdOrRow);
    if (!order) return;
    await enqueueNotification({
      orderId: order.id,
      eventType: 'ADMIN_ORDER_PAID',
      dedupeKey: `${order.id}:ADMIN_ORDER_PAID`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        paymentMethod: order.paymentMethod || undefined,
        // Read from the row rather than assumed: this fires immediately after
        // the claim that set it, and the store must never be told "PAID" on
        // the strength of the caller's intention alone.
        paymentStatus: order.paymentStatus || undefined,
        total: order.total,
      },
    });
  } catch (err) {
    console.error('[notifications] could not enqueue ADMIN_ORDER_PAID:', err);
  }
}

/** Tells the store an order reached the customer. */
export async function notifyAdminDelivered(orderIdOrRow: string | any): Promise<void> {
  try {
    const order = await resolveOrder(orderIdOrRow);
    if (!order) return;
    await enqueueNotification({
      orderId: order.id,
      eventType: 'ADMIN_ORDER_DELIVERED',
      dedupeKey: `${order.id}:ADMIN_ORDER_DELIVERED`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        paymentMethod: order.paymentMethod || undefined,
        paymentStatus: order.paymentStatus || undefined,
        total: order.total,
      },
    });
  } catch (err) {
    console.error('[notifications] could not enqueue ADMIN_ORDER_DELIVERED:', err);
  }
}

/**
 * Narrates a return request's progress to the customer.
 *
 * Keyed on the RETURN id, not the order: one order can have several returns,
 * and each walks its own path through review, approval and pickup.
 */
export async function notifyReturnStatus(input: {
  returnId: string;
  orderId: string;
  userId: string | null;
  status: ReturnRequest['status'];
}): Promise<void> {
  try {
    const eventType = RETURN_EVENT[input.status];
    if (!eventType) return;

    const order = await resolveOrder(input.orderId);
    if (!order) return;

    await enqueueNotification({
      orderId: order.id,
      userId: input.userId || order.userId,
      eventType,
      dedupeKey: `${input.returnId}:${eventType}`,
      payload: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        toEmail: order.customerEmail,
        toPhone: order.customerPhone,
        paymentMethod: order.paymentMethod || undefined,
        total: order.total,
      },
    });
  } catch (err) {
    console.error('[notifications] could not enqueue return status notification:', err);
  }
}
