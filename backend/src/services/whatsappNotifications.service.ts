// ==========================================
// WHATSAPP — ORDER NOTIFICATIONS (Meta WhatsApp Cloud API)
//
// WhatsApp carries ORDER UPDATES ONLY. It is never an OTP transport: sign-in
// codes go through Firebase Phone Auth and nowhere else, so nothing here is
// reachable from the authentication path and no OTP template is referenced.
//
// Meta refuses free-form text to a customer who has not messaged first, so a
// business-initiated order update must use a named, pre-approved template of
// category UTILITY. Those are registered per event, and an OTP template —
// category AUTHENTICATION — cannot stand in for one: Meta rejects the send,
// and reusing an auth template for marketing-adjacent content is what gets a
// number rate-limited.
//
// Templates are therefore configuration, not constants, and an event with no
// template configured is reported as a skip rather than guessed at.
// ==========================================

import type { NotificationEventType } from './notificationEngine.service';

/** The outcome shape the notification channels translate into ChannelResult. */
export type WhatsAppSendResult =
  | { status: 'sent'; providerMessageId?: string }
  /** Credentials absent — the channel cannot send at all. */
  | { status: 'unconfigured' }
  /** Credentials present, but this event has no approved template registered. */
  | { status: 'no_template'; eventType: NotificationEventType }
  /** Meta was reached and refused, or could not be reached. */
  | { status: 'error'; detail: string; retryable: boolean };

const PROVIDER_TIMEOUT_MS = 10_000;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

function apiBase(): string {
  return (process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com').replace(/\/+$/, '');
}

/** Truncated and collapsed so a Meta HTML error page cannot flood the log. */
function briefly(text: string): string {
  const collapsed = String(text).replace(/\s+/g, ' ').trim();
  return collapsed.length > 300 ? `${collapsed.slice(0, 300)}…` : collapsed;
}

/**
 * Provider text, scrubbed of the access token before it is stored or logged.
 *
 * Meta quotes request parameters back in validation errors, and a notification
 * failure reason is written to the notifications table and shown in the admin
 * panel — so an unredacted token would end up on a screen and in a database
 * row, not just a log file.
 */
function safeDetail(text: string): string {
  let out = briefly(text);
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (token && token.length >= 4) out = out.split(token).join('[redacted]');
  return out;
}

/**
 * Whether WhatsApp can send at all.
 *
 * Deliberately independent of the OTP channel checks in messaging.service:
 * order notifications must not start or stop working because sign-in
 * configuration changed.
 */
export function whatsappNotificationsConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * The approved UTILITY template registered for one event, if any.
 *
 * Read per call rather than cached so a template can be registered without a
 * restart. The naming convention is one variable per event — explicit rather
 * than derived, so a typo surfaces as "no template configured" instead of
 * silently addressing the wrong template.
 */
export function orderTemplateFor(eventType: NotificationEventType): string | null {
  const key = `WHATSAPP_ORDER_TEMPLATE_${eventType}`;
  const name = (process.env[key] || '').trim();
  return name || null;
}

/**
 * Whether ANY order template is registered.
 *
 * The admin panel's "why is this channel blocked" probe runs without an event
 * in hand, so it can only answer the blanket question: nothing at all is
 * configured. A gap for one specific event is reported at send time instead,
 * where the event is known and can be named.
 */
export function anyOrderTemplateConfigured(): boolean {
  return Object.entries(process.env).some(
    ([key, value]) =>
      key.startsWith('WHATSAPP_ORDER_TEMPLATE_') &&
      // Shares the prefix but names no template, and has a default — without
      // this exclusion the probe would always report "configured".
      key !== 'WHATSAPP_ORDER_TEMPLATE_LANGUAGE' &&
      (value || '').trim() !== ''
  );
}

export function orderTemplateLanguage(): string {
  return process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE || 'en_US';
}

function apiVersion(): string {
  return process.env.WHATSAPP_API_VERSION || 'v21.0';
}

export interface OrderWhatsAppMessage {
  /** E.164 or plain digits; the leading '+' is stripped for Meta. */
  toPhone: string;
  eventType: NotificationEventType;
  /** Ordered body parameters for the approved template's {{1}}, {{2}}, … */
  variables: string[];
}

/**
 * Sends one order-update template.
 *
 * Never throws: every outcome is a tagged result so the calling channel
 * decides whether it is a skip (configuration) or a failure (delivery), and
 * the engine decides whether to retry.
 *
 * Only a confirmed Meta acceptance returns 'sent'. Meta answers 200 with an
 * `error` object for template and permission problems, so the status code
 * alone is not enough to call a send successful.
 */
export async function sendOrderWhatsApp(msg: OrderWhatsAppMessage): Promise<WhatsAppSendResult> {
  if (!whatsappNotificationsConfigured()) return { status: 'unconfigured' };

  const template = orderTemplateFor(msg.eventType);
  if (!template) return { status: 'no_template', eventType: msg.eventType };

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;

  const components = msg.variables.length
    ? [{ type: 'body', parameters: msg.variables.map((text) => ({ type: 'text', text })) }]
    : [];

  try {
    const res = await fetch(
      `${apiBase()}/${apiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msg.toPhone.replace(/^\+/, ''),
          type: 'template',
          template: { name: template, language: { code: orderTemplateLanguage() }, components },
        }),
        signal: timeoutSignal(),
      }
    );
    const payload: any = await res.json().catch(() => ({}));

    if (!res.ok || payload?.error) {
      const detail = safeDetail(payload?.error?.message || `HTTP ${res.status}`);
      // A rejected template, a disabled number or a bad token will not fix
      // itself; retrying burns the engine's budget and buries the cause.
      // Meta's own classification: 4xx is the caller's fault, 5xx is theirs.
      const retryable = res.status >= 500 || res.status === 429;
      return { status: 'error', detail, retryable };
    }

    return { status: 'sent', providerMessageId: payload?.messages?.[0]?.id };
  } catch (err) {
    // Timeout or transport failure — worth another attempt.
    return { status: 'error', detail: safeDetail((err as Error).message), retryable: true };
  }
}
