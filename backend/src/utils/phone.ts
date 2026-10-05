// ==========================================
// PHONE NUMBERS
//
// OTP login makes the phone number an identity, so "the same number" has to
// mean exactly one thing everywhere: at sign-in, in the uniqueness index, in
// the rate-limit key, and in the row an OTP is checked against. Every one of
// those goes through normalizePhone() and compares the E.164 string it
// returns — never raw input, and never the free-text `customers.phone`
// column, which is whatever the customer happened to type.
//
// Deliberately hand-rolled rather than pulling in libphonenumber: the store
// sells to India, the backend bundle lists its externals explicitly in the
// esbuild command, and one country's rules are 20 lines.
// ==========================================

/** Country codes the sign-in screen offers. Keep in sync with the frontend
 * selector — the backend re-validates whatever the client sends, so this list
 * is the authority and the frontend's copy is only for display. */
export const SUPPORTED_COUNTRY_CODES = ['+91'] as const;

export const DEFAULT_COUNTRY_CODE = '+91';

/**
 * Dial codes this app can encounter, longest first so prefix matching is
 * unambiguous (+971 must win over +97 and +9).
 *
 * Mirrors COUNTRY_PHONE_RULES on the client. Only used to split an E.164
 * string back into country code and subscriber number for display —
 * SUPPORTED_COUNTRY_CODES above is what actually gates sign-in.
 */
const KNOWN_DIAL_CODES = ['+971', '+91', '+65', '+61', '+49', '+81', '+44', '+1'].sort(
  (a, b) => b.length - a.length
);

export interface NormalizedPhone {
  /** Canonical form, e.g. "+919876543210". The value everything keys on. */
  e164: string;
  /** e.g. "+91" */
  countryCode: string;
  /** Subscriber number without the country code, e.g. "9876543210" */
  national: string;
}

/**
 * Reduces user input to E.164, or returns null if it isn't a number we can
 * send an OTP to.
 *
 * Accepts the shapes people actually type for an Indian mobile — "9876543210",
 * "098765 43210", "+91 98765-43210", "919876543210" — and rejects everything
 * else. Indian mobiles are 10 digits starting 6-9; landlines and short codes
 * can't receive an app OTP, so letting them through would only produce a
 * "didn't arrive" support ticket later.
 */
export function normalizePhone(raw: unknown, countryCode: string = DEFAULT_COUNTRY_CODE): NormalizedPhone | null {
  if (raw === null || raw === undefined) return null;

  const cc = String(countryCode).trim();
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (cc === '+91') {
    let national = digits;
    // Trunk prefix and country code, in the orders they get pasted in.
    if (national.length === 13 && national.startsWith('910')) national = national.slice(3);
    if (national.length === 12 && national.startsWith('91')) national = national.slice(2);
    if (national.length === 11 && national.startsWith('0')) national = national.slice(1);

    if (!/^[6-9]\d{9}$/.test(national)) return null;
    return { e164: `+91${national}`, countryCode: '+91', national };
  }

  // No other country code is offered today; this branch exists so adding one
  // to SUPPORTED_COUNTRY_CODES is a one-line change rather than a rewrite.
  if (!/^\+\d{1,3}$/.test(cc)) return null;
  const national = digits.startsWith(cc.slice(1)) ? digits.slice(cc.length - 1) : digits;
  if (!/^\d{6,12}$/.test(national)) return null;
  return { e164: `${cc}${national}`, countryCode: cc, national };
}

/**
 * Display form for the "we sent a code to…" line.
 *
 * Shows enough for the customer to recognise their own number and catch a
 * typo, without printing it in full on a screen someone else might be looking
 * at — and without confirming a complete number to whoever typed it.
 */
export function maskPhone(e164: string): string {
  if (!/^\+\d{5,}$/.test(e164)) return e164;

  // Longest known dial code first. A greedy `\+\d{1,3}` would split
  // "+919876543210" as "+919" / "876543210" and mask one digit too few,
  // which is how this managed to print a wrong-looking number.
  const cc = KNOWN_DIAL_CODES.find((code) => e164.startsWith(code));
  if (!cc) return e164;
  const national = e164.slice(cc.length);
  if (national.length <= 4) return `${cc} ${national}`;

  // e.g. "+91 ******1234" — the last four are what lets someone recognise
  // their own number and catch a typo; the rest stays hidden so the screen
  // never spells out a full number, and never confirms one back to whoever
  // typed it.
  return `${cc} ${'*'.repeat(national.length - 4)}${national.slice(-4)}`;
}

/**
 * The last-10-digits key the pre-existing password login matches phone
 * numbers on (see findCustomerByIdentifier in customer.routes.ts). Used only
 * to find accounts that predate phone_e164 and so were never backfilled;
 * new writes always set phone_e164.
 */
export function legacyPhoneSuffix(e164: string): string {
  return e164.replace(/\D/g, '').slice(-10);
}
