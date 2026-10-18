/**
 * Phone and email input normalisation.
 *
 * The bug this file exists for: the sign-in field used to strip non-digits and
 * then TRUNCATE to ten. Pasting "+91 98765 43210" — the shape a saved contact
 * or a WhatsApp message gives you — produced "9198765432", which is a
 * different, perfectly well-formed Indian mobile. It passed every length check
 * on both sides, and the backend normalised it to +919198765432, so a code
 * would have gone to a stranger.
 *
 * Normalising before limiting the length is the whole fix. These cases are the
 * shapes people actually paste.
 *
 * The frontend is a convenience layer: backend/src/utils/phone.ts re-derives
 * E.164 independently and is the authority. Its own rules are covered by the
 * backend suites.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePhoneInput,
  validatePhoneNumber,
  normalizeEmail,
  isValidEmail,
} from '@glamirk/shared/utils/formValidation';

/** The ten subscriber digits every Indian case below should reduce to. */
const SUBSCRIBER = '9876543210';

describe('phone — normalising what people paste (India)', () => {
  it.each([
    ['plain', '9876543210'],
    ['with the dial code', '+919876543210'],
    ['dial code, spaced', '+91 98765 43210'],
    ['dial code, no plus', '919876543210'],
    ['hyphenated', '98765-43210'],
    ['parenthesised dial code', '(+91) 98765-43210'],
    ['surrounding whitespace', '   9876543210   '],
    ['internal spaces', '98765 43210'],
    ['domestic trunk prefix', '09876543210'],
    ['trunk prefix after dial code', '9109876543210'],
    ['duplicated dial code', '+91919876543210'],
    ['international prefix 00', '00919876543210'],
    ['letters mixed in', 'abc9876543210'],
  ])('%s -> the same ten digits', (_label, raw) => {
    expect(normalizePhoneInput(raw, '+91')).toBe(SUBSCRIBER);
  });

  it('accepts every Indian mobile series (6, 7, 8, 9)', () => {
    for (const first of ['6', '7', '8', '9']) {
      const n = `${first}012345678`;
      expect(validatePhoneNumber('+91', normalizePhoneInput(n, '+91')).valid).toBe(true);
    }
  });
});

describe('phone — what must be rejected', () => {
  it('rejects a number that is the right length but not a mobile series', () => {
    // Landlines and short codes cannot receive an app OTP. The backend
    // refuses them, so accepting here would only move the failure later.
    const result = validatePhoneNumber('+91', normalizePhoneInput('1234567890', '+91'));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/6, 7, 8 or 9/);
  });

  it('rejects an incomplete number', () => {
    const result = validatePhoneNumber('+91', normalizePhoneInput('98765', '+91'));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/exactly 10 digits/);
  });

  it('reduces a letters-only entry to nothing rather than inventing digits', () => {
    expect(normalizePhoneInput('not a number', '+91')).toBe('');
  });

  it('never yields more than the subscriber length', () => {
    expect(normalizePhoneInput('9'.repeat(40), '+91')).toHaveLength(10);
  });

  /**
   * The regression that motivated all of this. Asserted on the VALUE, not just
   * on validity: the old behaviour was valid-looking and wrong, so "is it
   * valid" would not have caught it.
   */
  it('does not truncate a pasted international number into a different one', () => {
    expect(normalizePhoneInput('+919876543210', '+91')).not.toBe('9198765432');
    expect(normalizePhoneInput('+919876543210', '+91')).toBe(SUBSCRIBER);
  });
});

describe('phone — a leading zero is not always a trunk prefix', () => {
  it('keeps a legitimate leading zero for another country', () => {
    // German national numbers really do begin with 0. Stripping zeroes on
    // sight would corrupt them.
    expect(normalizePhoneInput('0612345678', '+49')).toBe('0612345678');
  });

  it('still removes that country’s dial code when it is unambiguous', () => {
    expect(normalizePhoneInput('+49 0612345678', '+49')).toBe('0612345678');
  });

  it('only strips a trunk zero when the length proves it is one', () => {
    // Ten digits already — nothing to peel, so the zero stays and the number
    // is rejected as a non-mobile rather than silently rewritten.
    expect(normalizePhoneInput('0987654321', '+91')).toBe('0987654321');
    expect(validatePhoneNumber('+91', '0987654321').valid).toBe(false);
  });
});

describe('phone — switching country re-normalises', () => {
  it('drops a dial code that belonged to the previous country', () => {
    const typed = normalizePhoneInput('+919876543210', '+91');
    expect(typed).toBe(SUBSCRIBER);
    // Re-run for a different country: the digits are kept, not re-prefixed.
    expect(normalizePhoneInput(typed, '+49')).toBe(SUBSCRIBER);
  });
});

describe('email — normalisation', () => {
  it.each([
    ['  user@example.com  ', 'user@example.com'],
    ['USER@Example.COM', 'user@example.com'],
    ['  Mixed.Case@Gmail.Com ', 'mixed.case@gmail.com'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  it('normalises to the same value the backend looks up on', () => {
    // Uniqueness and account lookup are both lowercase, so two spellings of
    // one address must not become two accounts.
    expect(normalizeEmail(' ASHA@Glamirk.com ')).toBe(normalizeEmail('asha@glamirk.com'));
  });
});

describe('email — validity', () => {
  it.each([
    'user@example.com',
    'first.last@example.co.in',
    'user+tag@example.com',
    'user_name@sub.example.com',
    "o'brien@example.com",
  ])('accepts %s', (address) => {
    expect(isValidEmail(normalizeEmail(address))).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['no at sign', 'userexample.com'],
    ['no domain', 'user@'],
    ['no local part', '@example.com'],
    ['no dot in domain', 'user@example'],
    ['two at signs', 'user@@example.com'],
    ['single-char tld', 'user@example.c'],
  ])('rejects %s', (_label, address) => {
    expect(isValidEmail(normalizeEmail(address))).toBe(false);
  });

  /**
   * Internal whitespace is stripped by normalizeEmail rather than rejected,
   * which is a deliberate choice: "user @example.com" from a wrapped paste is
   * almost always one address. Recorded here so the behaviour is a decision
   * rather than a surprise.
   */
  it('collapses internal whitespace instead of rejecting it', () => {
    expect(normalizeEmail('user @example.com')).toBe('user@example.com');
    expect(isValidEmail(normalizeEmail('user @example.com'))).toBe(true);
  });
});
