import nodemailer from 'nodemailer';
import { OrderStatus } from '../src/types';

// Lazily built — undefined when SMTP isn't configured, in which case every
// send* function below silently no-ops rather than blocking the order flow.
// Deliberately a separate transporter/cache from the one in server/commerce.ts
// (used for password-reset emails) to avoid touching that already-working path.
let mailTransporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;
function getMailTransporter() {
  if (mailTransporter !== undefined) return mailTransporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    mailTransporter = null;
    return mailTransporter;
  }
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return mailTransporter;
}

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
