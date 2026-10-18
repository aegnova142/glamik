// ==========================================
// OTP DELIVERY — SMS ONLY
//
//   sendOtpMessage({ phone, otp }) → firebase (client-side) or the dev console
//
// SMS is the only OTP channel. WhatsApp and email are deliberately NOT OTP
// transports: WhatsApp carries order updates only (see
// whatsappNotifications.service.ts), and a sign-in code must not arrive on a
// channel the customer did not prove control of.
//
// Firebase is client-side, so with it selected this module sends nothing at
// all — the browser talks to Google and the backend only verifies the ID
// token afterwards.
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

import { firebaseSignInReady } from './firebaseAuth.service';

/** SMS is the only OTP channel. Kept as a named type rather than inlined so
 * the stored `delivery_method` column and every signature still say what they
 * carry, and so adding a channel later is a union edit rather than a hunt. */
export type OtpChannel = 'sms';

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

function smsProviderName(): string {
  return (process.env.SMS_PROVIDER || '').trim().toLowerCase();
}

/** "60 seconds" / "2 minutes" — whichever reads naturally for the configured
 * window, so the message never says "1 minutes" or "0.5 minutes". */
function describeValidity(seconds: number): string {
  if (seconds % 60 === 0 && seconds >= 120) return `${seconds / 60} minutes`;
  if (seconds === 60) return '1 minute';
  return `${seconds} seconds`;
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

/**
 * Provider-supplied text, made safe to keep and log.
 *
 * Error messages come from a third party and end up in our logs, so they are
 * treated as untrusted input rather than as our own words: anything matching
 * a credential this process holds — or the code we just sent — is replaced
 * before the string goes anywhere. Providers do quote what you sent them back
 * at you in validation errors, and a 401 reading "authkey <key> is invalid"
 * would otherwise write that key to disk, where log shipping and support
 * screenshots take it from there.
 *
 * Length is bounded first so a single huge page can't make this slow.
 */
function safeDetail(text: string, otp?: string): string {
  let out = briefly(text);
  const secrets = [
    process.env.WHATSAPP_ACCESS_TOKEN,
    otp,
  ];
  for (const secret of secrets) {
    // Short values would redact ordinary words out of the message and make it
    // useless; a real credential is never this short.
    if (secret && secret.length >= 4) out = out.split(secret).join('[redacted]');
  }
  return out;
}

// ------------------------------------------
// Gates
//
// Three independent switches, checked in this order by sendOtpMessage:
// the dev console bypass, the master kill switch, then provider selection.
// ------------------------------------------

/**
 * Master switch for REAL outbound OTP delivery. Defaults to OFF.
 *
 * Off-by-default is deliberate: relying on provider names being blank means a
 * vendor starts sending the moment somebody pastes credentials into an .env,
 * which is how a "disabled" integration quietly turns itself back on. It also
 * keeps a deployment disabled without anyone editing a file there.
 *
 * This does NOT weaken anything: codes are still generated, hashed, expired,
 * rate-limited and verified exactly as before. The only question it answers is
 * whether a message is handed to a third party.
 */
export function otpDeliveryEnabled(): boolean {
  const flag = (process.env.OTP_DELIVERY_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

/**
 * Whether Firebase Phone Auth is the selected SMS path.
 *
 * In this mode Google sends the SMS and checks the code, so this module sends
 * nothing: there is no SMS_PROVIDERS entry for it on purpose. The backend's
 * own issue/verify endpoints refuse rather than pretending, and the browser
 * hands us an ID token to verify (firebaseAuth.service.ts).
 */
export function firebaseOtpSelected(): boolean {
  return (process.env.SMS_PROVIDER || '').trim().toLowerCase() === 'firebase';
}

/**
 * Whether the console transport is active. Checked per call, never cached, so
 * a test can exercise both sides of the gate in one process.
 *
 * Requires NODE_ENV to be exactly 'development' — deliberately stricter than
 * "not production", because a server with NODE_ENV unset (the normal result of
 * a systemd unit or a Docker image that forgets it) would otherwise print live
 * customers' codes into the journal. An unset NODE_ENV fails closed, which is
 * the behaviour an auth bypass has to have.
 */
export function devOtpEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  const flag = (process.env.OTP_DEV_MODE || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

/**
 * Whether OTP_DEV_MODE is asking for something this environment refuses.
 *
 * Reported at boot so the refusal is visible: someone who set the flag in a
 * production .env and saw sign-in keep working would otherwise have no way to
 * know the bypass was inert — and might go looking for the code in the logs.
 */
export function devOtpRequestedButRefused(): boolean {
  const flag = (process.env.OTP_DEV_MODE || '').trim().toLowerCase();
  const asked = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
  return asked && !devOtpEnabled();
}

/**
 * "Delivers" the code by printing it.
 *
 * Boxed and loud because it is a security bypass; nobody should be able to see
 * this scroll past and mistake the server for a normal one. The phone number
 * is printed in full here — unlike every other log line in this file — because
 * locally it is the developer's own test number and matching code to number is
 * the entire point.
 */
function deliverOtpToConsole(msg: OtpMessage): DeliveryResult {
  console.log(
    '\n' +
      '  ====================================================================\n' +
      '   DEVELOPMENT OTP — no SMS was sent\n' +
      '\n' +
      `   channel : ${msg.method}\n` +
      `   to      : ${msg.phone}\n` +
      `   code    : ${msg.otp}\n` +
      `   expires : in ${describeValidity(msg.expiresInSeconds)}\n` +
      '\n' +
      '   OTP_DEV_MODE is on and NODE_ENV is development. This cannot\n' +
      '   happen in production.\n' +
      '  ====================================================================\n'
  );
  return { status: 'sent', provider: 'dev-console' };
}

// ------------------------------------------
// Dispatch
// ------------------------------------------

/**
 * Server-side SMS transports.
 *
 * DELIBERATELY EMPTY. Firebase is the only SMS provider, and it does not
 * belong here: the browser talks to Google directly and this backend never
 * carries a code. The table is kept rather than deleted because the dispatch
 * below is written around it, and because adding a server-side vendor later
 * means one entry here and a ~30-line function above — not a rewrite.
 *
 * With nothing in it, any SMS_PROVIDER value other than "firebase" reports the
 * channel unconfigured, which is the honest answer.
 */
const SMS_PROVIDERS: Record<string, (msg: OtpMessage) => Promise<DeliveryResult>> = {};

/** Whether a channel has a provider selected and credentialled. Used to hide
 * a dead option on the sign-in screen rather than letting the customer pick
 * it and hit an error. */
export function channelConfigured(method: OtpChannel): boolean {
  // In dev mode every channel can deliver, because the transport is a
  // console.log that cannot fail. Without this the sign-in screen would hide
  // SMS — the very thing being tested — whenever credentials are absent,
  // which locally is the normal state.
  if (devOtpEnabled()) return true;

  // With real delivery switched off, no channel is offered — however complete
  // the credentials happen to be. The sign-in screen then shows its
  // "unavailable" state instead of taking a number it cannot send to.
  if (!otpDeliveryEnabled()) return false;

  if (method === 'sms') {
    // Firebase has no entry in SMS_PROVIDERS — the browser talks to Google
    // directly — so it must be answered before the table lookup below, which
    // would otherwise report the channel dead. It still honours the kill
    // switch above: with delivery off, firebase mode offers nothing either, so
    // no SMS can leave by any route.
    //
    // The full readiness check, not just FIREBASE_PROJECT_ID: the server half
    // being configured says nothing about whether the browser can actually
    // reach Firebase. Answering "available" on the strength of the server half
    // alone is what produces an enabled sign-in button that dead-ends — the
    // client falls back to the server OTP path, which answers 409, and the
    // customer is told to reload a page that will do the same thing again.
    if (firebaseOtpSelected()) return firebaseSignInReady();

    // SMS_PROVIDERS is empty, so anything other than firebase lands here and
    // reports the channel dead — which is correct: there is no server-side SMS
    // vendor left to carry a code.
    return !!SMS_PROVIDERS[smsProviderName()];
  }
  // No other channel carries an OTP.
  return false;
}

/**
 * Sends one OTP over the requested channel.
 *
 * Never throws: every failure comes back as a DeliveryResult so the caller
 * can decide what the customer sees. Never switches channel on its own —
 * if delivery fails the customer is told rather than silently rerouted.
 */
export async function sendOtpMessage(msg: OtpMessage): Promise<DeliveryResult> {
  // Checked before any provider is selected, so dev mode works with
  // SMS_PROVIDER unset entirely and never reaches a vendor's network.
  if (devOtpEnabled()) return deliverOtpToConsole(msg);

  // The kill switch sits in front of provider selection, so with delivery off
  // no vendor is contacted on any code path — not even one with complete
  // credentials. Reported as 'unconfigured' rather than 'error' because this
  // is a deliberate state, not a failure, and the route tells the customer
  // the channel is unavailable rather than asking them to retry.
  if (!otpDeliveryEnabled()) {
    return { status: 'unconfigured', provider: null };
  }

  // Firebase mode must never reach here: issueOtp bypasses delivery entirely
  // (see otp.service.ts), because Google both sends the code and checks it.
  // If a caller does arrive, say so rather than returning 'sent' for a message
  // nobody sent — a cheerful lie here is exactly what this module exists to
  // prevent.
  if (firebaseOtpSelected()) {
    return {
      status: 'error',
      provider: 'firebase',
      detail: 'firebase phone auth sends its own SMS; the backend must not be asked to deliver one',
    };
  }

  const providerName = smsProviderName();
  const send = SMS_PROVIDERS[providerName];

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
  // whatsapp is reported false, not omitted: the sign-in screen still reads the
  // field, and saying "not available" is clearer than a missing key.
  return { sms: channelConfigured('sms'), whatsapp: false };
}
