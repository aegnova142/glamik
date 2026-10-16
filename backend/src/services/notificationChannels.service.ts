import {
  registerChannel,
  registerChannelBlockProbe,
  NotificationPayload,
  NotificationEventType,
  ChannelResult,
} from './notificationEngine.service';
import { getMailTransporter } from './mailer';
import { channelConfigured } from './messaging.service';
import { pool, loadDatabase } from '../db/db';
import { mapNotificationRow } from './notifications.service';
import { broadcastEvent } from '../db/db';

// ==========================================
// CHANNEL ADAPTERS
//
// Each channel answers one question: can you deliver this payload, and if not,
// is that because you chose not to (skip) or because you tried and could not
// (fail)? The engine owns retries, backoff and recording; a channel only
// reports.
//
// Separated from the engine so adding a provider never touches dispatch logic,
// and so a channel that is not configured is a registered-but-skipping adapter
// rather than a missing branch somewhere in the middle of an order flow.
// ==========================================

// ------------------------------------------
// Copy
// ------------------------------------------

/**
 * Payment wording, which is the one thing that must never be wrong.
 *
 * A COD customer being told "your payment was received" is a lie that costs a
 * support call; a prepaid customer being told "pay the courier on delivery"
 * invites them to pay twice. The method is carried on the event payload
 * rather than re-read at send time, so a later status change cannot rewrite
 * the wording of a message about an earlier one.
 */
function paymentLine(payload: NotificationPayload): string {
  if (payload.paymentMethod === 'cod') {
    return `Payment: Cash on Delivery${payload.total !== undefined ? ` — ₹${payload.total} due to the courier` : ''}.`;
  }
  return `Payment: Paid online${payload.total !== undefined ? ` — ₹${payload.total}` : ''}.`;
}

/**
 * Payment status as the STORE needs to read it.
 *
 * The distinction that matters: a prepaid order sitting at PENDING_PAYMENT is
 * an order nobody has paid for yet. Describing it as anything other than
 * unpaid would have a packer dispatch goods against money that may never
 * arrive — which is precisely why checkout used to stay silent about prepaid
 * orders entirely. It is reported now, with the state said plainly.
 */
function adminPaymentLine(p: NotificationPayload): string {
  if (p.paymentMethod === 'cod') {
    return `COD — collect ₹${p.total ?? 0} on delivery`;
  }
  switch (p.paymentStatus) {
    case 'PAID':
      return `Prepaid — PAID ₹${p.total ?? 0} (verified)`;
    case 'FAILED':
    case 'CANCELLED':
    case 'EXPIRED':
      return `Prepaid — payment ${String(p.paymentStatus).toLowerCase()}. DO NOT DISPATCH.`;
    default:
      return `Prepaid — AWAITING PAYMENT. Not yet paid, do not dispatch.`;
  }
}

function itemLines(payload: NotificationPayload): string {
  if (!payload.items?.length) return '';
  return payload.items.map((i) => `${i.name} × ${i.quantity}`).join(', ');
}

interface Copy {
  subject: string;
  heading: string;
  body: (p: NotificationPayload) => string;
}

/**
 * One entry per event. Covers the four the old ORDER_STATUS_EMAIL map was
 * missing — PROCESSING, payment failure, and the refund states — which is why
 * a customer whose card was declined, or whose money was sent back, received
 * nothing at all.
 */
const COPY: Record<NotificationEventType, Copy> = {
  ORDER_PLACED: {
    subject: 'Your Glamirk order is confirmed 🎉',
    heading: 'Order Placed',
    body: (p) => `Thank you! Order #${p.orderNumber} is confirmed.${itemLines(p) ? ` Items: ${itemLines(p)}.` : ''} ${paymentLine(p)}`,
  },
  ORDER_CONFIRMED: {
    subject: 'Payment received — your order is confirmed ✅',
    heading: 'Order Confirmed',
    body: (p) => `Order #${p.orderNumber} is confirmed and being prepared.${itemLines(p) ? ` Items: ${itemLines(p)}.` : ''} ${paymentLine(p)}`,
  },
  PAYMENT_FAILED: {
    subject: 'We could not process your payment',
    heading: 'Payment Not Completed',
    body: (p) =>
      `Your payment for order #${p.orderNumber} did not go through${p.failureReason ? ` — ${p.failureReason}` : ''}. ` +
      `Nothing has been charged. You can complete the payment from your order history.`,
  },
  ORDER_PROCESSING: {
    subject: 'Your order is being prepared',
    heading: 'Being Prepared',
    body: (p) => `Order #${p.orderNumber} is being prepared at our atelier.`,
  },
  ORDER_PACKED: {
    subject: 'Your order has been packed 📦',
    heading: 'Order Packed',
    body: (p) => `Order #${p.orderNumber} is packed and ready for dispatch.`,
  },
  ORDER_SHIPPED: {
    subject: 'Your order has shipped 🚚',
    heading: 'Order Shipped',
    body: (p) =>
      `Order #${p.orderNumber} is on its way.` +
      // Only stated when the carrier actually gave us one. A fabricated AWB
      // is a tracking link that resolves to nothing.
      (p.trackingNumber ? ` ${p.courierName || 'Courier'} tracking: ${p.trackingNumber}.` : '') +
      (p.paymentMethod === 'cod' && p.total !== undefined ? ` Please keep ₹${p.total} ready for the courier.` : ''),
  },
  ORDER_OUT_FOR_DELIVERY: {
    subject: 'Out for delivery today',
    heading: 'Out for Delivery',
    body: (p) =>
      `Order #${p.orderNumber} is out for delivery.` +
      (p.paymentMethod === 'cod' && p.total !== undefined ? ` Please keep ₹${p.total} ready.` : ''),
  },
  ORDER_DELIVERED: {
    subject: 'Delivered — we hope you love it 💕',
    heading: 'Order Delivered',
    body: (p) => `Order #${p.orderNumber} has been delivered. We hope you love it.`,
  },
  ORDER_CANCELLED: {
    subject: 'Your order has been cancelled',
    heading: 'Order Cancelled',
    body: (p) =>
      `Order #${p.orderNumber} has been cancelled.` +
      (p.paymentMethod !== 'cod' ? ' Any amount paid will be refunded to your original payment method.' : ''),
  },
  REFUND_INITIATED: {
    subject: 'Your refund has been initiated',
    heading: 'Refund Initiated',
    body: (p) => `A refund of ₹${p.refundAmount} for order #${p.orderNumber} has been initiated.`,
  },
  REFUND_PENDING: {
    subject: 'Your refund is being processed',
    heading: 'Refund Processing',
    body: (p) => `Your refund of ₹${p.refundAmount} for order #${p.orderNumber} is being processed by your bank.`,
  },
  REFUND_COMPLETED: {
    subject: 'Your refund has been completed',
    heading: 'Refund Completed',
    body: (p) =>
      `₹${p.refundAmount} has been refunded for order #${p.orderNumber}. ` +
      `It should reach your account in 5–7 working days.`,
  },
  REFUND_FAILED: {
    subject: 'There was a problem with your refund',
    heading: 'Refund Issue',
    body: (p) => `We hit a problem refunding order #${p.orderNumber}. Our team is looking into it and will be in touch.`,
  },
  // --- Returns ---
  // Wording carried over verbatim from RETURN_STATUS_NOTIFICATION, which is
  // what these replace. A customer mid-return should not notice that the
  // plumbing underneath changed.
  RETURN_REQUESTED: {
    subject: 'We have your return request',
    heading: 'Return Requested',
    body: (p) => `Your return request for order #${p.orderNumber} has been submitted.`,
  },
  RETURN_UNDER_REVIEW: {
    subject: 'Your return is under review',
    heading: 'Return Under Review',
    body: (p) => `Your return request for order #${p.orderNumber} is under review.`,
  },
  RETURN_APPROVED: {
    subject: 'Your return has been approved',
    heading: 'Return Approved',
    body: (p) => `Your return request for order #${p.orderNumber} has been approved.`,
  },
  RETURN_PICKUP_SCHEDULED: {
    subject: 'Pickup scheduled for your return',
    heading: 'Pickup Scheduled',
    body: (p) => `Pickup has been scheduled for your return on order #${p.orderNumber}.`,
  },
  RETURN_REFUNDED: {
    subject: 'Your refund is complete',
    heading: 'Refund Completed',
    body: (p) => `Your refund for order #${p.orderNumber} has been completed.`,
  },

  REVIEW_REMINDER: {
    subject: 'How are you liking your Glamirk order? ⭐',
    heading: 'Rate Your Order',
    body: (p) =>
      `How is everything from order #${p.orderNumber}? A quick star rating helps other shoppers — ` +
      `it takes a few seconds, and verified reviews earn Glam points.`,
  },

  // --- Store-facing ---
  ADMIN_NEW_ORDER: {
    subject: 'New order received',
    heading: 'New Order Received',
    body: (p) =>
      `${p.customerName || 'A customer'} placed order #${p.orderNumber} — ₹${p.total ?? 0}. ` +
      `${adminPaymentLine(p)}.${itemLines(p) ? ` Items: ${itemLines(p)}.` : ''}`,
  },
  ADMIN_ORDER_PAID: {
    subject: 'Payment received',
    heading: 'Payment Received',
    body: (p) => `${p.customerName || 'A customer'} paid ₹${p.total ?? 0} for order #${p.orderNumber}.`,
  },
  ADMIN_ORDER_DELIVERED: {
    subject: 'Order delivered',
    heading: 'Order Delivered',
    body: (p) => `Order #${p.orderNumber} has been delivered.`,
  },
  ADMIN_REFUND_ISSUED: {
    subject: 'Refund issued',
    // A partial refund is operationally different from a full one — it leaves
    // money still collected against a live order — so the two keep the
    // distinct headings the legacy notification had.
    heading: 'Refund Issued',
    body: (p) =>
      `₹${p.refundAmount ?? 0} refunded on order #${p.orderNumber}` +
      `${p.refundStatus === 'PARTIAL' ? ' (partial refund).' : '.'}`,
  },
};

/** The `type` column written to admin_notifications, which the notification
 * bell reads. Mapped rather than using the event name directly so the stored
 * values stay exactly what they were before the migration — the admin UI
 * picks its icons off these strings. */
const ADMIN_NOTIFICATION_TYPE: Partial<Record<NotificationEventType, string>> = {
  ADMIN_NEW_ORDER: 'NEW_ORDER',
  ADMIN_ORDER_PAID: 'ORDER_PAID',
  ADMIN_ORDER_DELIVERED: 'ORDER_DELIVERED',
  ADMIN_REFUND_ISSUED: 'REFUND_ISSUED',
};

// ------------------------------------------
// In-app
// ------------------------------------------

/**
 * Writes the row the notification bell reads, and pushes it over the socket.
 *
 * The only channel that works today, which is why it is on every event.
 */
/**
 * Installs every channel adapter.
 *
 * Called once at import for the running server, and exported so a test that
 * swaps in a stub channel can put the real ones back — module-level side
 * effects cannot be re-run, since ES modules execute their body exactly once.
 */
/** A review reminder is pointless once every product in the order has a
 * review (in any status), so both channels check at send time. */
async function reviewReminderNotNeeded(eventType: NotificationEventType, orderNumber: string): Promise<ChannelResult | null> {
  if (eventType !== 'REVIEW_REMINDER') return null;
  const res = await pool.query(
    `SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.order_number = $1 AND o.status = 'DELIVERED'
       AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = oi.product_id
                       AND (r.customer_id = o.user_id OR r.order_id = o.id))
     LIMIT 1`,
    [orderNumber]
  );
  return res.rows.length === 0
    ? { ok: false, skip: true, reason: 'Everything in this order is already reviewed (or it is no longer delivered).' }
    : null;
}

export function registerDefaultChannels(): void {
  registerChannel('inapp', async (payload, eventType): Promise<ChannelResult> => {
  const copy = COPY[eventType];
  if (!copy) return { ok: false, skip: true, reason: `No copy defined for ${eventType}.` };
  const notNeeded = await reviewReminderNotNeeded(eventType, payload.orderNumber);
  if (notNeeded) return notNeeded;

  // Resolved from the event's order rather than carried on the payload: the
  // recipient is a fact about the order, not about the message.
  const owner = await pool.query('SELECT user_id FROM orders WHERE order_number = $1', [payload.orderNumber]);
  const userId = owner.rows[0]?.user_id;
  if (!userId) return { ok: false, skip: true, reason: 'No account to notify.' };

  const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const inserted = await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, body, order_id)
     SELECT $1, $2, $3, $4, $5, o.id FROM orders o WHERE o.order_number = $6
     RETURNING *`,
    [id, userId, eventType, copy.heading, copy.body(payload), payload.orderNumber]
  );
  if (inserted.rows.length === 0) return { ok: false, retryable: false, reason: 'Order no longer exists.' };

  broadcastEvent('NEW_NOTIFICATION', 'customer', {
    userId,
    notification: mapNotificationRow(inserted.rows[0]),
  });
  return { ok: true };
});

// ------------------------------------------
// Email
// ------------------------------------------

function wrap(heading: string, body: string, trackUrl?: string, ctaLabel = 'Track your order'): string {
  const cta = trackUrl
    ? `<p style="margin:28px 0 0"><a href="${trackUrl}" style="background:#0B0B0B;color:#FAF9F6;text-decoration:none;padding:12px 22px;letter-spacing:.14em;font-size:11px;font-weight:700;text-transform:uppercase">${ctaLabel}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#FAF9F6;font-family:Helvetica,Arial,sans-serif;color:#121212">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E8D5A8;padding:36px">
    <div style="font-size:19px;letter-spacing:.2em;font-weight:700">GLAMIRK</div>
    <div style="font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:#C9972B;font-weight:700;margin-top:4px">Beauty</div>
    <h1 style="font-size:19px;margin:28px 0 10px">${heading}</h1>
    <p style="font-size:14px;line-height:1.65;color:#3C3C3C;margin:0">${body}</p>
    ${cta}
    <p style="margin:32px 0 0;font-size:11px;color:#9C9689;border-top:1px solid #F1EBDD;padding-top:16px">
      Glamirk Beauty · This is a transactional message about an order you placed.
    </p>
  </div></body></html>`;
}

  registerChannel('email', async (payload, eventType): Promise<ChannelResult> => {
  const copy = COPY[eventType];
  if (!copy) return { ok: false, skip: true, reason: `No copy defined for ${eventType}.` };

  const transporter = getMailTransporter();
  // Unconfigured is a skip, not a failure: retrying five times against an
  // absent transport tells an operator nothing they did not already know.
  if (!transporter) return { ok: false, skip: true, reason: 'SMTP is not configured on this deployment.' };
  if (!payload.toEmail) return { ok: false, skip: true, reason: 'No email address on this order.' };
  const notNeeded = await reviewReminderNotNeeded(eventType, payload.orderNumber);
  if (notNeeded) return notNeeded;

  const appUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null;
  const isReminder = eventType === 'REVIEW_REMINDER';
  const ctaUrl = !appUrl || !payload.orderNumber ? undefined
    : isReminder ? `${appUrl}/account/reviews`
    : `${appUrl}/?trackOrder=${encodeURIComponent(payload.orderNumber)}`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Glamirk Beauty <no-reply@glamirk.com>',
      to: payload.toEmail,
      subject: copy.subject,
      html: wrap(
        copy.heading,
        `Hello ${payload.customerName || 'there'}, ${copy.body(payload)}`,
        ctaUrl,
        isReminder ? 'Rate your products' : undefined
      ),
    });
    return { ok: true };
  } catch (err: any) {
    // The provider's own words, verbatim. An SMTP 535 is the only thing that
    // tells an operator the password is wrong rather than the network.
    const message = String(err?.message || 'Mail send failed.');
    // Authentication and addressing errors will not fix themselves; retrying
    // burns the budget and buries the real cause.
    const permanent = /5\.7\.|Invalid login|no recipients|EENVELOPE/i.test(message);
    return { ok: false, retryable: !permanent, reason: message };
  }
});

  // ------------------------------------------
  // Store-facing
  // ------------------------------------------

  /** Writes admin_notifications and pushes it to the `admin` socket room —
   * the same table and event the existing bell already reads, so the UI needs
   * no change. */
  registerChannel('admin_inapp', async (payload, eventType): Promise<ChannelResult> => {
    const copy = COPY[eventType];
    if (!copy) return { ok: false, skip: true, reason: `No copy defined for ${eventType}.` };

    const id = 'anotif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const inserted = await pool.query(
      `INSERT INTO admin_notifications (id, type, title, body, order_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        id,
        ADMIN_NOTIFICATION_TYPE[eventType] || eventType,
        // A partial refund says so in its heading, matching the legacy
        // notifyAdminRefundIssued, which an operator reads at a glance.
        eventType === 'ADMIN_REFUND_ISSUED' && payload.refundStatus === 'PARTIAL'
          ? 'Partial Refund Issued'
          : copy.heading,
        copy.body(payload),
        payload.orderId || null,
      ]
    );
    broadcastEvent('NEW_ADMIN_NOTIFICATION', 'admin', { notification: mapNotificationRow(inserted.rows[0]) });
    return { ok: true };
  });

  /**
   * WhatsApp to the store's own number. Registered, INERT.
   *
   * The number itself already exists — `globalSettings.whatsappOrderNumber`,
   * editable in Admin → Settings, used today to build the customer's manual
   * wa.me deep link at checkout. What does not exist is any way to SEND
   * through it: no provider, no credentials, no approved template.
   *
   * The message body is composed here anyway, so the day a provider is
   * configured the content is already right and reviewed. It deliberately
   * carries no delivery address and no payment instrument — an admin who
   * needs those follows the link and authenticates.
   */
  registerChannel('admin_whatsapp', async (payload, eventType): Promise<ChannelResult> => {
    const settings = (await loadDatabase()).globalSettings as any;
    const adminNumber = (settings?.whatsappOrderNumber || '').replace(/\D/g, '');
    if (!adminNumber) {
      return { ok: false, skip: true, reason: 'No admin WhatsApp number set (Admin → Settings → WhatsApp order number).' };
    }
    if (!channelConfigured('whatsapp')) {
      return {
        ok: false,
        skip: true,
        reason:
          'WhatsApp is not connected: WHATSAPP_PROVIDER and its credentials are unset. ' +
          'The admin number is configured, but there is no API to send through.',
      };
    }
    return {
      ok: false,
      skip: true,
      reason:
        'WhatsApp provider is configured but no approved admin order template is registered. ' +
        'Meta requires a named, pre-approved utility template; the OTP template cannot be reused.',
    };
  });

// ------------------------------------------
// WhatsApp
// ------------------------------------------

/**
 * Registered but INERT.
 *
 * There is no WhatsApp provider configured on this deployment, and the
 * existing integration is OTP-only: it sends one hardcoded template with the
 * code as its single parameter. Order notifications need different templates,
 * each approved by Meta separately, with their own parameter order.
 *
 * So this adapter exists to make the wiring real and the gap visible — every
 * WhatsApp delivery records a SKIPPED row naming exactly what is missing —
 * without pretending the channel works. It will start sending the day
 * credentials and approved templates exist, and not before.
 */
  registerChannel('whatsapp', async (payload): Promise<ChannelResult> => {
  if (!channelConfigured('whatsapp')) {
    return {
      ok: false,
      skip: true,
      reason: 'WhatsApp is not connected: WHATSAPP_PROVIDER and its credentials are unset.',
    };
  }
  if (!payload.toPhone) return { ok: false, skip: true, reason: 'No phone number on this order.' };

  // Reached only once a provider is configured. Deliberately still a skip
  // rather than a send: the OTP template is the only approved one, and using
  // it for an order update would be both wrong and a template violation.
  return {
    ok: false,
    skip: true,
    reason:
      'WhatsApp provider is configured but no approved order-notification template is registered. ' +
      'Add Meta-approved utility templates per event before enabling this channel.',
  };
});

  // ------------------------------------------------------------------
  // Retry block probes
  //
  // Asked by the admin Retry button, not by the worker. A channel that cannot
  // deliver for a CONFIGURATION reason should say so once, in the panel,
  // rather than accepting a retry that is certain to land back on the same
  // SKIPPED row. Returning null means "nothing structural in the way" — the
  // delivery may still fail for its own reasons, which is what retries are
  // for.
  // ------------------------------------------------------------------
  const whatsappBlock = async (): Promise<string | null> => {
    if (!channelConfigured('whatsapp')) {
      return (
        'WhatsApp is not connected. Set WHATSAPP_PROVIDER and its credentials, then retry. ' +
        'Retrying now would skip again without sending.'
      );
    }
    return (
      'WhatsApp has a provider but no approved order-notification template. ' +
      'Meta requires a named, pre-approved utility template per event; the OTP template cannot be reused.'
    );
  };

  registerChannelBlockProbe('whatsapp', whatsappBlock);
  registerChannelBlockProbe('admin_whatsapp', async () => {
    const settings = (await loadDatabase()).globalSettings as any;
    if (!(settings?.whatsappOrderNumber || '').replace(/\D/g, '')) {
      return 'No admin WhatsApp number set. Add one under Admin → Settings → WhatsApp order number.';
    }
    return whatsappBlock();
  });
}

// Installed on import, so simply importing this module wires the channels up.
registerDefaultChannels();
