import nodemailer from 'nodemailer';

// ==========================================
// MAIL TRANSPORT
//
// The one place a mail transporter is constructed, and the one place that
// decides whether this process may open an SMTP connection at all.
//
// There were two identical copies of this logic (email.service.ts and
// customer.routes.ts). Two copies meant two places to forget the test gate —
// and a suite that forgets it does not fail loudly. It authenticates against
// whatever mailbox .env happens to carry and emails real customers, which is
// exactly what the e2e suites were doing.
// ==========================================

/**
 * Narrower than nodemailer's own transporter type on purpose: `sendMail` is
 * the entire surface every caller uses, and narrowing it is what lets the test
 * gate return a capturing stub in place of a real connection.
 */
export interface MailMessage {
  from?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

/** Messages a test run composed and would have sent. Never leaves the process. */
const sentTestEmails: MailMessage[] = [];

// `undefined` means "not decided yet"; `null` means "decided: no transport".
let mailTransporter: MailTransport | null | undefined;

/** True when NODE_ENV says this is a test run, or delivery was switched off
 * explicitly. Either way no socket may be opened. */
function deliverySuppressed(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.EMAIL_DELIVERY_DISABLED === 'true';
}

/**
 * The values .env.example ships, which are NOT credentials.
 *
 * This gate used to ask only "are the three variables non-empty", and a
 * deployment that copied .env.example without filling the mail block in
 * answered yes: SMTP_HOST was the literal `smtp.example.com`. So a real
 * transport was built, every send failed with `getaddrinfo ENOTFOUND
 * smtp.example.com`, the failure was retryable, and each message burned five
 * attempts before landing in FAILED. Production carried three of those from
 * 2026-10-14 and nobody saw them, because nothing distinguishes "the mail
 * server rejected us" from "there was never a mail server".
 *
 * Failing CLOSED is the honest answer to a half-filled config: with no
 * transport the channel reports `skip` with a reason that names the cause, the
 * row says SKIPPED rather than FAILED, and no socket is opened. An operator
 * reading notification_deliveries then sees the truth — email was never set up
 * here — instead of a delivery problem that does not exist.
 *
 * `.example.com`/`.example.org`/`.example.net` are reserved by RFC 2606 and can
 * never be a real mail host, so matching the suffix catches the whole family of
 * copied-template hosts rather than just the one string we happened to ship.
 */
const SMTP_PLACEHOLDERS = new Set(['apikey_or_username', 'smtp_password_or_api_key']);

function isPlaceholder(value: string | undefined): boolean {
  const v = (value || '').trim();
  if (!v) return true;
  if (SMTP_PLACEHOLDERS.has(v.toLowerCase())) return true;
  return /(^|\.)example\.(com|org|net)$/i.test(v);
}

function smtpConfigured(): boolean {
  return ![process.env.SMTP_HOST, process.env.SMTP_USER, process.env.SMTP_PASS].some(isPlaceholder);
}

/**
 * Whether a real message could actually be delivered right now.
 *
 * Exposed so a test can assert the gate is closed rather than inferring it
 * from the absence of an error.
 */
export function emailDeliveryEnabled(): boolean {
  return smtpConfigured() && !deliverySuppressed();
}

/**
 * Lazily built, cached, and null when SMTP is not configured — in which case
 * every caller silently no-ops rather than blocking the flow it sits in.
 *
 * Under a test run the same configuration check applies, but what comes back
 * is a stub that records the message instead of transmitting it. A stub rather
 * than null deliberately: callers still run their own template and recipient
 * logic, so a broken email body is caught by the suite instead of in
 * production.
 */
export function getMailTransporter(): MailTransport | null {
  if (mailTransporter !== undefined) return mailTransporter;

  if (!smtpConfigured()) {
    mailTransporter = null;
    return mailTransporter;
  }

  if (deliverySuppressed()) {
    mailTransporter = {
      async sendMail(message: MailMessage) {
        sentTestEmails.push(message);
        return { accepted: [message.to], delivered: false, suppressed: true };
      },
    };
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

/** Test seam: everything the suppressed transport captured. */
export function __getSentTestEmails(): MailMessage[] {
  return [...sentTestEmails];
}

/** Test seam: drops the cached transport and the captured messages, so a suite
 * can re-decide the gate after changing the environment. */
export function __resetMailTransportForTests(): void {
  mailTransporter = undefined;
  sentTestEmails.length = 0;
}
