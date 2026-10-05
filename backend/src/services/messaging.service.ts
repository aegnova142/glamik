// ==========================================
// OTP DELIVERY — SMS AND WHATSAPP
//
//   sendOtpMessage({ phone, otp, method })
//        ├── method 'sms'      → SMS_PROVIDER      (twilio | msg91)
//        └── method 'whatsapp' → WHATSAPP_PROVIDER (meta | twilio)
//
// The login route knows only this function and the result it returns; it has
// no idea which vendor is behind either channel. Swapping providers is an
// env change plus a ~30-line function here, and touches no auth code.
//
// Two rules this module exists to enforce:
//
//   * An unconfigured channel reports 'unconfigured' and the customer is told
//     the OTP could not be sent. It never resolves as if a message went out —
//     a login screen that cheerfully asks for a code nobody received is worse
//     than one that admits it is not set up.
//   * The code itself is never logged. Provider errors are logged with the
//     phone number and status, never the payload.
//
// Credentials come from the environment only. See .env.example for the full
// list and what each provider needs.
// ==========================================

export type OtpChannel = 'sms' | 'whatsapp';

export interface OtpMessage {
  /** E.164, e.g. "+919876543210". */
  phone: string;
  otp: string;
  method: OtpChannel;
  /** Rendered into the message body. Seconds rather than minutes because the
   * validity window is now under a minute. */
  expiresInSeconds: number;
}

/**
 * Discriminated on a string rather than an `ok: boolean`, deliberately.
 * This project compiles without `strict`, where narrowing a union on a
 * literal-boolean discriminant does not work (the same reason
 * validateAddressPayload in customer.routes.ts avoids the pattern). A string
 * tag narrows correctly either way.
 */
export type DeliveryResult =
  | { status: 'sent'; provider: string; providerMessageId?: string }
  /** The channel has no credentials configured. */
  | { status: 'unconfigured'; provider: string | null }
  /** Credentials exist but the provider rejected or could not be reached. */
  | { status: 'error'; provider: string; detail: string };

interface ProviderConfig {
  smsProvider: string;
  whatsappProvider: string;
}

function providerNames(): ProviderConfig {
  return {
    smsProvider: (process.env.SMS_PROVIDER || '').trim().toLowerCase(),
    whatsappProvider: (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase(),
  };
}

/** "60 seconds" / "2 minutes" — whichever reads naturally for the configured
 * window, so the message never says "1 minutes" or "0.5 minutes". */
function describeValidity(seconds: number): string {
  if (seconds % 60 === 0 && seconds >= 120) return `${seconds / 60} minutes`;
  if (seconds === 60) return '1 minute';
  return `${seconds} seconds`;
}

/** Message text for SMS. Kept short — one segment, and the code is first so
 * it shows in a notification preview without opening the app. */
function smsBody(otp: string, expiresInSeconds: number): string {
  const brand = process.env.OTP_SMS_BRAND || 'Glamirk Beauty';
  return `${otp} is your ${brand} verification code. It expires in ${describeValidity(expiresInSeconds)}. Do not share it with anyone.`;
}

// Provider calls should fail fast: the customer is watching a spinner, and a
// hung TCP connection would otherwise hold the request open until the
// server's own timeout.
const PROVIDER_TIMEOUT_MS = 10_000;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

/**
 * Provider API roots, overridable per deployment.
 *
 * Defaults are the real endpoints and are what production uses. The overrides
 * exist so the delivery path can be pointed at a mock in tests, and so a
 * deployment behind an egress proxy or on a regional endpoint doesn't need a
 * code change. Trailing slashes are trimmed so callers can append a path
 * without worrying about doubling them.
 */
function apiBase(name: string, fallback: string): string {
  return (process.env[name] || fallback).replace(/\/+$/, '');
}

/** Truncated so a provider's HTML error page can't flood the log. Never
 * reaches the customer — the route maps failures to its own wording. */
function briefly(text: string): string {
  const collapsed = String(text).replace(/\s+/g, ' ').trim();
  return collapsed.length > 300 ? `${collapsed.slice(0, 300)}…` : collapsed;
}

// ------------------------------------------
// SMS — Twilio
// ------------------------------------------

async function sendSmsViaTwilio(msg: OtpMessage): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  // Either a plain sender number or a Messaging Service; Twilio accepts one
  // or the other, and the Messaging Service is what gives sender rotation.
  const from = process.env.TWILIO_SMS_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!sid || !token || (!from && !messagingServiceSid)) {
    return { status: 'unconfigured', provider: 'twilio' };
  }

  const body = new URLSearchParams({ To: msg.phone, Body: smsBody(msg.otp, msg.expiresInSeconds) });
  if (messagingServiceSid) body.set('MessagingServiceSid', messagingServiceSid);
  else body.set('From', from!);

  try {
    const res = await fetch(
      `${apiBase('TWILIO_API_BASE_URL', 'https://api.twilio.com')}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: timeoutSignal(),
    });
    const payload: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'error', provider: 'twilio', detail: briefly(payload?.message || `HTTP ${res.status}`) };
    }
    return { status: 'sent', provider: 'twilio', providerMessageId: payload?.sid };
  } catch (err) {
    return { status: 'error', provider: 'twilio', detail: briefly((err as Error).message) };
  }
}

// ------------------------------------------
// SMS — MSG91
//
// Uses the Flow API rather than MSG91's own OTP endpoint on purpose: the OTP
// endpoint generates and verifies the code itself, which would move
// authentication out of this application and into a vendor. We generate and
// verify our own code and use MSG91 purely as a transport.
// ------------------------------------------

async function sendSmsViaMsg91(msg: OtpMessage): Promise<DeliveryResult> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;

  if (!authKey || !templateId) {
    return { status: 'unconfigured', provider: 'msg91' };
  }

  // MSG91 wants the number without a leading '+'.
  const recipient = msg.phone.replace(/^\+/, '');
  // The variable name has to match the ##placeholder## in the approved DLT
  // template, which differs per account — hence the override.
  const otpVariable = process.env.MSG91_OTP_VARIABLE || 'otp';

  const body: Record<string, unknown> = {
    template_id: templateId,
    short_url: '0',
    recipients: [{ mobiles: recipient, [otpVariable]: msg.otp }],
  };
  if (process.env.MSG91_SENDER_ID) body.sender = process.env.MSG91_SENDER_ID;

  try {
    const res = await fetch(`${apiBase('MSG91_API_BASE_URL', 'https://control.msg91.com')}/api/v5/flow/`, {
      method: 'POST',
      headers: { authkey: authKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutSignal(),
    });
    const payload: any = await res.json().catch(() => ({}));
    // MSG91 answers 200 with {type:'error'} for template and DLT problems, so
    // the status code alone is not enough to call this a success.
    if (!res.ok || payload?.type === 'error') {
      return { status: 'error', provider: 'msg91', detail: briefly(payload?.message || `HTTP ${res.status}`) };
    }
    return { status: 'sent', provider: 'msg91', providerMessageId: payload?.request_id };
  } catch (err) {
    return { status: 'error', provider: 'msg91', detail: briefly((err as Error).message) };
  }
}

// ------------------------------------------
// WhatsApp — Meta WhatsApp Cloud API (official)
//
// Business-initiated OTP messages must use an approved template of category
// AUTHENTICATION; free-form text to a user who hasn't messaged first is
// rejected by Meta. So this sends a template, and the template name/language
// are configuration rather than constants.
// ------------------------------------------

async function sendWhatsAppViaMeta(msg: OtpMessage): Promise<DeliveryResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const template = process.env.WHATSAPP_OTP_TEMPLATE_NAME;

  if (!phoneNumberId || !accessToken || !template) {
    return { status: 'unconfigured', provider: 'meta' };
  }

  const language = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en_US';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';

  const components: unknown[] = [
    { type: 'body', parameters: [{ type: 'text', text: msg.otp }] },
  ];
  // Meta's authentication templates normally carry a one-tap / copy-code
  // button, and when they do the code must be repeated as the button's
  // parameter or the send is rejected. Templates without one set this false.
  if ((process.env.WHATSAPP_OTP_TEMPLATE_COPY_CODE_BUTTON || 'true').toLowerCase() !== 'false') {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: msg.otp }],
    });
  }

  try {
    const res = await fetch(
      `${apiBase('WHATSAPP_API_BASE_URL', 'https://graph.facebook.com')}/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.phone.replace(/^\+/, ''),
        type: 'template',
        template: { name: template, language: { code: language }, components },
      }),
      signal: timeoutSignal(),
    });
    const payload: any = await res.json().catch(() => ({}));
    if (!res.ok || payload?.error) {
      return { status: 'error', provider: 'meta', detail: briefly(payload?.error?.message || `HTTP ${res.status}`) };
    }
    return { status: 'sent', provider: 'meta', providerMessageId: payload?.messages?.[0]?.id };
  } catch (err) {
    return { status: 'error', provider: 'meta', detail: briefly((err as Error).message) };
  }
}

// ------------------------------------------
// WhatsApp — Twilio (WhatsApp Business API reseller)
// ------------------------------------------

async function sendWhatsAppViaTwilio(msg: OtpMessage): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    return { status: 'unconfigured', provider: 'twilio' };
  }

  const body = new URLSearchParams({
    To: `whatsapp:${msg.phone}`,
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
  });
  // A Content SID is Twilio's handle for an approved WhatsApp template. It is
  // required to open a conversation; plain Body only works inside an existing
  // 24-hour session, which a login almost never is.
  const contentSid = process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID;
  if (contentSid) {
    body.set('ContentSid', contentSid);
    body.set('ContentVariables', JSON.stringify({ '1': msg.otp }));
  } else {
    body.set('Body', smsBody(msg.otp, msg.expiresInSeconds));
  }

  try {
    const res = await fetch(
      `${apiBase('TWILIO_API_BASE_URL', 'https://api.twilio.com')}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: timeoutSignal(),
    });
    const payload: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'error', provider: 'twilio', detail: briefly(payload?.message || `HTTP ${res.status}`) };
    }
    return { status: 'sent', provider: 'twilio', providerMessageId: payload?.sid };
  } catch (err) {
    return { status: 'error', provider: 'twilio', detail: briefly((err as Error).message) };
  }
}

// ------------------------------------------
// Dispatch
// ------------------------------------------

const SMS_PROVIDERS: Record<string, (msg: OtpMessage) => Promise<DeliveryResult>> = {
  twilio: sendSmsViaTwilio,
  msg91: sendSmsViaMsg91,
};

const WHATSAPP_PROVIDERS: Record<string, (msg: OtpMessage) => Promise<DeliveryResult>> = {
  meta: sendWhatsAppViaMeta,
  twilio: sendWhatsAppViaTwilio,
};

/** Whether a channel has a provider selected and credentialled. Used to hide
 * a dead option on the sign-in screen rather than letting the customer pick
 * it and hit an error. */
export function channelConfigured(method: OtpChannel): boolean {
  const names = providerNames();
  if (method === 'sms') {
    const send = SMS_PROVIDERS[names.smsProvider];
    if (!send) return false;
    return names.smsProvider === 'twilio'
      ? !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN &&
           (process.env.TWILIO_SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID))
      : !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID);
  }
  const send = WHATSAPP_PROVIDERS[names.whatsappProvider];
  if (!send) return false;
  return names.whatsappProvider === 'meta'
    ? !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_OTP_TEMPLATE_NAME)
    : !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

/**
 * Sends one OTP over the requested channel.
 *
 * Never throws: every failure comes back as a DeliveryResult so the caller
 * can decide what the customer sees. Never switches channel on its own —
 * if WhatsApp fails the customer is told, and chooses.
 */
export async function sendOtpMessage(msg: OtpMessage): Promise<DeliveryResult> {
  const names = providerNames();
  const providerName = msg.method === 'sms' ? names.smsProvider : names.whatsappProvider;
  const table = msg.method === 'sms' ? SMS_PROVIDERS : WHATSAPP_PROVIDERS;
  const send = table[providerName];

  if (!send) {
    return { status: 'unconfigured', provider: providerName || null };
  }

  const result = await send(msg);

  if (result.status === 'error') {
    // Phone and provider only — never the body, which carries the code.
    console.error(`[otp] ${msg.method} delivery failed via ${result.provider} for ${msg.phone}: ${result.detail}`);
  }
  return result;
}

/** Logged once at boot alongside the other configuration warnings. */
export function describeOtpChannels(): { sms: boolean; whatsapp: boolean } {
  return { sms: channelConfigured('sms'), whatsapp: channelConfigured('whatsapp') };
}
