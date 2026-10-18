// Shared client-side validation helpers for auth / account forms.

export interface CountryPhoneRule {
  code: string; // dial code, e.g. "+91"
  label: string; // display name
  minDigits: number;
  maxDigits: number;
}

export const COUNTRY_PHONE_RULES: CountryPhoneRule[] = [
  { code: '+91', label: 'India', minDigits: 10, maxDigits: 10 },
  { code: '+1', label: 'USA / Canada', minDigits: 7, maxDigits: 15 },
  { code: '+44', label: 'United Kingdom', minDigits: 7, maxDigits: 15 },
  { code: '+971', label: 'UAE', minDigits: 7, maxDigits: 15 },
  { code: '+65', label: 'Singapore', minDigits: 7, maxDigits: 15 },
  { code: '+61', label: 'Australia', minDigits: 7, maxDigits: 15 },
  { code: '+49', label: 'Germany', minDigits: 7, maxDigits: 15 },
  { code: '+81', label: 'Japan', minDigits: 7, maxDigits: 15 },
];

export const DEFAULT_COUNTRY_CODE = '+91';

// Strips every non-digit character — the input itself should already be
// digit-only (see sanitizePhoneDigits), this just guards untrusted values.
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// Use on every phone input's onChange so users can never type letters/symbols.
//
// NOTE: this truncates blindly. For the sign-in field use
// normalizePhoneInput() instead, which strips a pasted dial code and trunk
// prefix FIRST — truncating "+919876543210" to ten digits yields
// "9198765432", a different number that still looks valid.
export function sanitizePhoneDigits(value: string, maxDigits: number): string {
  return onlyDigits(value).slice(0, maxDigits);
}

/**
 * What the customer meant, from what they actually typed or pasted.
 *
 * People paste numbers in every shape a contact card or a WhatsApp message
 * produces: "+91 98765 43210", "(+91) 98765-43210", "0 98765 43210",
 * "919876543210". Each of those is the SAME number, and the field must end up
 * holding the ten subscriber digits — not a truncation of the longer string.
 *
 * Trunk and dial prefixes are only removed when the length makes them
 * unambiguous, and only for a country whose rules allow it. A leading zero is
 * a legitimate digit in plenty of numbering plans, so it is never stripped on
 * sight — only when the total length says it is India's trunk prefix.
 *
 * Mirrors normalizePhone() in backend/src/utils/phone.ts on purpose: the
 * backend re-derives this independently and is the authority. This exists so
 * the customer sees their own number in the box and gets an inline error,
 * rather than a late failure on a number they never entered.
 */
export function normalizePhoneInput(value: string, countryCode: string): string {
  const rule = getCountryRule(countryCode);
  let digits = onlyDigits(value);
  if (!digits) return '';

  const dial = countryCode.replace(/\D/g, ''); // "+91" -> "91"

  if (countryCode === '+91') {
    // Peel prefixes only while the number is LONGER than a subscriber number
    // and removing one still leaves a full-length one. That condition is what
    // makes this safe: it cannot eat into the ten digits that matter, so a
    // number already at the right length is never touched.
    //
    // A loop rather than fixed-length guards because prefixes get doubled —
    // "+91 919876543210" happens when a saved contact already carries the
    // code and the field adds it again. Bounded to keep it obviously finite.
    for (let i = 0; i < 4 && digits.length > rule.maxDigits; i++) {
      if (digits.startsWith('91') && digits.length - 2 >= rule.maxDigits) {
        digits = digits.slice(2);
        continue;
      }
      // Domestic trunk prefix. Removed only on this length evidence — a
      // leading zero is a real digit in plenty of other numbering plans.
      if (digits.startsWith('0') && digits.length - 1 >= rule.maxDigits) {
        digits = digits.slice(1);
        continue;
      }
      break;
    }
    return digits.slice(0, rule.maxDigits);
  }

  // Other countries: strip only a dial code that is unambiguously present,
  // i.e. the remainder still fits the country's own length rule. Without that
  // check, a national number that happens to begin with its own dial code
  // would be mangled.
  if (dial && digits.startsWith(dial)) {
    const rest = digits.slice(dial.length);
    if (rest.length >= rule.minDigits && rest.length <= rule.maxDigits) digits = rest;
  }
  return digits.slice(0, rule.maxDigits);
}

export function getCountryRule(code: string): CountryPhoneRule {
  return COUNTRY_PHONE_RULES.find((c) => c.code === code) || COUNTRY_PHONE_RULES[0];
}

export function validatePhoneNumber(countryCode: string, digits: string): { valid: boolean; error?: string } {
  const rule = getCountryRule(countryCode);
  const clean = onlyDigits(digits);
  if (clean.length === 0) return { valid: true }; // optional field — empty is fine
  if (rule.minDigits === rule.maxDigits) {
    if (clean.length !== rule.minDigits) {
      return { valid: false, error: `${rule.label} mobile number must be exactly ${rule.minDigits} digits.` };
    }
  } else if (clean.length < rule.minDigits || clean.length > rule.maxDigits) {
    return { valid: false, error: `${rule.label} mobile number must be ${rule.minDigits}-${rule.maxDigits} digits.` };
  }

  // India: mobile ranges start 6-9. Landlines and short codes are the right
  // length but cannot receive an app OTP, and the backend rejects them — so
  // accepting them here only moves the failure later and makes it vaguer.
  if (countryCode === '+91' && !/^[6-9]/.test(clean)) {
    return { valid: false, error: 'Indian mobile numbers start with 6, 7, 8 or 9.' };
  }

  return { valid: true };
}

// Removes ALL whitespace (leading, trailing, and internal — emails can never
// contain spaces) and lowercases the whole address so "AHJ@Gmail.com" and
// " ahj@gmail.com " both normalize to "ahj@gmail.com" before it ever reaches
// the database.
export function normalizeEmail(raw: string): string {
  return raw.replace(/\s+/g, '').toLowerCase();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export const PASSWORD_MIN_LENGTH = 8;

// Live checklist the UI renders under the password field — every rule must
// be met before the form will submit.
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { id: 'upper', label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { id: 'lower', label: 'One lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { id: 'number', label: 'One number (0-9)', met: /[0-9]/.test(password) },
    { id: 'special', label: 'One special character (!@#$...)', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return getPasswordRequirements(password).every((r) => r.met);
}
