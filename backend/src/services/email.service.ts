import { OrderStatus } from '@glamirk/shared/types';
// Transport construction and the "may this process send at all" decision live
// in mailer.ts, shared with the customer router. Null when SMTP isn't
// configured, in which case every send* function below silently no-ops rather
// than blocking the order flow.
import { getMailTransporter } from './mailer';

function wrapEmailHtml(heading: string, message: string, ctaLabel?: string, ctaUrl?: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#121212;">${heading}</h2>
      <p style="color:#6B6B6B; line-height:1.6;">${message}</p>
      ${
        ctaLabel && ctaUrl
          ? `<p><a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:#C9972B;color:#0B0B0B;text-decoration:none;font-weight:bold;border-radius:8px;">${ctaLabel}</a></p>`
          : ''
      }
      <p style="color:#6B6B6B;font-size:12px;">— Glamirk Beauty</p>
    </div>
  `;
}

const ORDER_STATUS_EMAIL: Partial<Record<OrderStatus, { subject: string; heading: string; body: (orderNumber: string, total?: number) => string }>> = {
  PLACED: {
    subject: 'Your Order Has Been Placed Successfully 🎉',
    heading: 'Order Placed!',
    body: (n, t) => `Thank you for your order. Order ID: #${n}${t !== undefined ? `, Amount: ₹${t}` : ''}. We'll let you know as it moves through packing and dispatch.`,
  },
  CONFIRMED: {
    subject: 'Your Order Has Been Confirmed ✅',
    heading: 'Order Confirmed',
    body: (n) => `Your order #${n} has been confirmed and is being prepared at our atelier.`,
  },
  PACKED: {
    subject: 'Your Order Has Been Packed 📦',
    heading: 'Order Packed',
    body: (n) => `Your order #${n} has been packed and is ready for dispatch.`,
  },
  SHIPPED: {
    subject: 'Your Order Has Been Shipped 🚚',
    heading: 'Order Shipped',
    body: (n) => `Your order #${n} is on its way to you.`,
  },
  OUT_FOR_DELIVERY: {
    subject: 'Your Order Is Arriving Today 🛵',
    heading: 'Out for Delivery',
    body: (n) => `Your order #${n} is out for delivery today.`,
  },
  DELIVERED: {
    subject: 'Your Order Has Been Delivered 🎉',
    heading: 'Order Delivered',
    body: (n) => `Your order #${n} has been delivered. We hope you love it!`,
  },
  CANCELLED: {
    subject: 'Your Order Has Been Cancelled',
    heading: 'Order Cancelled',
    body: (n) => `Your order #${n} has been cancelled. Any reserved stock has been released.`,
  },
};

export async function sendOrderStatusEmail(params: {
  toEmail?: string | null;
  customerName?: string | null;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  total?: number;
}): Promise<void> {
  const transporter = getMailTransporter();
  if (!transporter || !params.toEmail) return;
  const entry = ORDER_STATUS_EMAIL[params.status];
  if (!entry) return;

  const configuredAppUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null;
  const trackUrl = configuredAppUrl ? `${configuredAppUrl}/?trackOrder=${params.orderId}` : undefined;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Glamirk Beauty <no-reply@glamirk.com>',
      to: params.toEmail,
      subject: entry.subject,
      html: wrapEmailHtml(
        entry.heading,
        `Hello ${params.customerName || 'there'}, ${entry.body(params.orderNumber, params.total)}`,
        trackUrl ? 'TRACK YOUR ORDER' : undefined,
        trackUrl
      ),
    });
  } catch (err) {
    // Best-effort — email delivery must never break the order flow itself.
    console.error('Failed to send order status email:', err);
  }
}

/** Generic transactional send used by the account area (email verification,
 * support-request notifications). Returns whether the message actually went
 * out, so callers can fall back to an in-app flow when SMTP isn't configured
 * instead of telling the customer to check an inbox nothing was sent to. */
export async function sendAccountEmail(params: {
  toEmail?: string | null;
  subject: string;
  heading: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<boolean> {
  const transporter = getMailTransporter();
  if (!transporter || !params.toEmail) return false;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Glamirk Beauty <no-reply@glamirk.com>',
      to: params.toEmail,
      subject: params.subject,
      html: wrapEmailHtml(params.heading, params.message, params.ctaLabel, params.ctaUrl),
    });
    return true;
  } catch (err) {
    console.error('Failed to send account email:', err);
    return false;
  }
}

export async function sendAdminNewOrderEmail(params: {
  toEmail?: string | null;
  orderNumber: string;
  customerName?: string | null;
  total: number;
}): Promise<void> {
  const transporter = getMailTransporter();
  if (!transporter || !params.toEmail) return;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Glamirk Beauty <no-reply@glamirk.com>',
      to: params.toEmail,
      subject: `New Order Received — #${params.orderNumber}`,
      html: wrapEmailHtml(
        'New Order Received 🔔',
        `${params.customerName || 'A customer'} just placed order #${params.orderNumber} for ₹${params.total}.`
      ),
    });
  } catch (err) {
    console.error('Failed to send admin new-order email:', err);
  }
}
