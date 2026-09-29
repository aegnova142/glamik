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
export function sanitizePhoneDigits(value: string, maxDigits: number): string {
  return onlyDigits(value).slice(0, maxDigits);
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
