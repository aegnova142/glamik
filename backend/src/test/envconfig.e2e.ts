/**
 * Environment-configuration policy knobs.
 *
 *   npx tsx src/test/envconfig.e2e.ts        (from backend/)
 *
 * No network and no database CONNECTION — but a DATABASE_URL has to exist for
 * the imports to resolve at all. Both services below import db.ts for
 * JWT_SECRET, and db.ts reads env.databaseUrl through required() at module
 * load, which throws when it is absent. So one is set here, before the
 * imports: a throwaway local value that is never connected to, because nothing
 * in this file issues a query.
 *
 * Set unconditionally rather than only when missing. That costs nothing and
 * makes it impossible for this suite to reach a real database by accident,
 * whatever the environment it inherits.
 *
 * Every other case sets process.env itself and puts back what it found. The
 * policy objects are getters, read per access, so one process can exercise
 * both sides of every rule.
 *
 * Scope is deliberately narrow: the config surfaces that nothing else covers.
 * classifyRazorpayKey (checkout.e2e.ts) and resolveDelhiveryBaseUrl
 * (delhivery.e2e.ts) are already tested where they are used, and duplicating
 * them here would mean two places to update for one change.
 *
 * emailCodePolicy had NO coverage at all. Its three variables gate how long a
 * verification code lives, how many guesses it survives, and how often one can
 * be requested — the difference between a six-digit code and a six-digit code
 * that can be walked.
 */

import assert from 'node:assert/strict';

// db.ts resolves env.databaseUrl through required() at MODULE LOAD, so the
// value has to exist before the services are pulled in. A static `import`
// cannot be used for that: ESM hoists every import above the surrounding
// statements, so the assignment below would run second and the import would
// still throw. Hence await import(), after the variable is in place.
//
// Deliberately a name no real deployment uses, on the loopback interface at a
// port nothing listens on, so a stray query fails loudly rather than reaching
// anything that matters. Nothing here issues one.
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'postgres://envconfig:unused@127.0.0.1:1/envconfig_never_connected';

const { emailCodePolicy, EMAIL_CODE_LENGTH } = await import('../services/emailVerification.service');
const { otpPolicy } = await import('../services/otp.service');
const { emailDeliveryEnabled, __resetMailTransportForTests } = await import('../services/mailer');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

const TOUCHED = [
  'EMAIL_CODE_EXPIRY_SECONDS',
  'EMAIL_CODE_MAX_ATTEMPTS',
  'EMAIL_CODE_RESEND_COOLDOWN_SECONDS',
  'OTP_EXPIRY_SECONDS',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_DELIVERY_DISABLED',
  'NODE_ENV',
] as const;

const saved = new Map<string, string | undefined>();
for (const k of TOUCHED) saved.set(k, process.env[k]);

/** Sets one variable, or removes it when the value is undefined. */
function set(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restore(): void {
  for (const [k, v] of saved) set(k, v);
  set('DATABASE_URL', PRIOR_DATABASE_URL);
}

function main(): void {
  // ==========================================
  // 1. DEFAULTS
  //
  // Asserted against the documented numbers in .env.example, so the two drift
  // together or not at all.
  // ==========================================
  section('1. emailCodePolicy defaults with nothing set');
  {
    for (const k of TOUCHED) set(k, undefined);

    check('the code is six digits', EMAIL_CODE_LENGTH === 6, String(EMAIL_CODE_LENGTH));
    check('expiry defaults to 10 minutes', emailCodePolicy.expirySeconds === 600, String(emailCodePolicy.expirySeconds));
    check('attempts default to 5', emailCodePolicy.maxAttempts === 5, String(emailCodePolicy.maxAttempts));
    check(
      'resend cooldown defaults to 60s',
      emailCodePolicy.resendCooldownSeconds === 60,
      String(emailCodePolicy.resendCooldownSeconds)
    );

    // The email code lives longer than the phone code on purpose — mail is
    // slower than SMS, and a code that dies in transit is a support ticket.
    check(
      'the email code outlives the phone code',
      emailCodePolicy.expirySeconds > otpPolicy.expirySeconds,
      `${emailCodePolicy.expirySeconds} vs ${otpPolicy.expirySeconds}`
    );
  }

  // ==========================================
  // 2. OVERRIDES TAKE EFFECT, PER ACCESS
  // ==========================================
  section('2. Overrides are read per access, not cached at import');
  {
    set('EMAIL_CODE_EXPIRY_SECONDS', '300');
    check('expiry follows the environment', emailCodePolicy.expirySeconds === 300, String(emailCodePolicy.expirySeconds));

    set('EMAIL_CODE_EXPIRY_SECONDS', '900');
    check(
      'and follows it again without a reimport',
      emailCodePolicy.expirySeconds === 900,
      String(emailCodePolicy.expirySeconds)
    );

    set('EMAIL_CODE_MAX_ATTEMPTS', '3');
    check('attempts follow the environment', emailCodePolicy.maxAttempts === 3, String(emailCodePolicy.maxAttempts));

    set('EMAIL_CODE_RESEND_COOLDOWN_SECONDS', '120');
    check(
      'cooldown follows the environment',
      emailCodePolicy.resendCooldownSeconds === 120,
      String(emailCodePolicy.resendCooldownSeconds)
    );

    set('EMAIL_CODE_EXPIRY_SECONDS', '  450  ');
    check('surrounding whitespace is tolerated', emailCodePolicy.expirySeconds === 450, String(emailCodePolicy.expirySeconds));

    set('EMAIL_CODE_MAX_ATTEMPTS', '4.9');
    check('a fractional value floors rather than rounds', emailCodePolicy.maxAttempts === 4, String(emailCodePolicy.maxAttempts));
  }

  // ==========================================
  // 3. NONSENSE FALLS BACK, IT DOES NOT DISABLE
  //
  // A typo must not switch a limit off. Zero attempts would reject every
  // correct code; a negative expiry would make every code born dead.
  // ==========================================
  section('3. Invalid values fall back to the default');
  {
    for (const bad of ['', '   ', 'abc', '-1', '0', 'NaN', 'Infinity', '1e400']) {
      set('EMAIL_CODE_MAX_ATTEMPTS', bad);
      check(
        `${JSON.stringify(bad)} falls back to 5 rather than disabling the cap`,
        emailCodePolicy.maxAttempts === 5,
        String(emailCodePolicy.maxAttempts)
      );
    }

    set('EMAIL_CODE_EXPIRY_SECONDS', '-600');
    check('a negative expiry falls back, so codes are not born dead', emailCodePolicy.expirySeconds === 600);

    set('EMAIL_CODE_RESEND_COOLDOWN_SECONDS', '0');
    check('a zero cooldown falls back rather than removing the gap', emailCodePolicy.resendCooldownSeconds === 60);

    // Big but finite is honoured: an operator may genuinely want a long window.
    set('EMAIL_CODE_EXPIRY_SECONDS', '86400');
    check('a large finite value is honoured', emailCodePolicy.expirySeconds === 86400);
  }

  // ==========================================
  // 4. THE TWO POLICY READERS AGREE
  //
  // emailVerification.service and otp.service each carry their own intFromEnv.
  // They are written differently — one trims and guards empty explicitly, the
  // other leans on Number('') === 0 failing the > 0 test. Equivalent today;
  // this pins that so a change to one does not quietly diverge.
  // ==========================================
  section('4. Both services parse their limits the same way');
  {
    for (const bad of ['', 'abc', '0', '-5']) {
      set('EMAIL_CODE_EXPIRY_SECONDS', bad);
      set('OTP_EXPIRY_SECONDS', bad);
      check(
        `${JSON.stringify(bad)} is rejected by both readers`,
        emailCodePolicy.expirySeconds === 600 && otpPolicy.expirySeconds === 60,
        `email=${emailCodePolicy.expirySeconds} otp=${otpPolicy.expirySeconds}`
      );
    }

    set('EMAIL_CODE_EXPIRY_SECONDS', '42');
    set('OTP_EXPIRY_SECONDS', '42');
    check(
      'and a valid value is accepted by both',
      emailCodePolicy.expirySeconds === 42 && otpPolicy.expirySeconds === 42
    );
  }

  restore();

  // ==========================================
  // 5. THE SMTP GATE MUST FAIL CLOSED
  //
  // This gate once asked only "are the three variables non-empty". A
  // deployment that copied .env.example without filling the mail block in
  // answered yes — SMTP_HOST was the literal `smtp.example.com` — so a real
  // transport was built and every message died on `getaddrinfo ENOTFOUND`
  // after burning five retries. Production carried three such FAILED rows from
  // 2026-10-14 and nobody noticed, because a failed delivery and a mail server
  // that never existed look identical in the table.
  //
  // Half-filled config has to read as UNCONFIGURED, so the channel skips with
  // a reason instead of failing with one.
  // ==========================================
  section('5. SMTP placeholders count as unconfigured');
  {
    // The gate also closes under NODE_ENV=test and EMAIL_DELIVERY_DISABLED,
    // which are covered in delhivery.e2e.ts. Both are neutralised here so what
    // is measured is the placeholder rule alone.
    set('NODE_ENV', 'development');
    set('EMAIL_DELIVERY_DISABLED', undefined);

    /** The transport is cached, so the cache has to go between cases. */
    const gateWith = (host?: string, user?: string, pass?: string): boolean => {
      set('SMTP_HOST', host);
      set('SMTP_USER', user);
      set('SMTP_PASS', pass);
      __resetMailTransportForTests();
      return emailDeliveryEnabled();
    };

    const REAL = ['smtp.sendgrid.net', 'apikey', 'SG.real-looking-not-a-secret'] as const;

    check('real-looking credentials open the gate', gateWith(...REAL) === true);

    // The exact trio .env.example used to ship — the case that actually bit.
    check(
      'the shipped .env.example block does NOT',
      gateWith('smtp.example.com', 'apikey_or_username', 'smtp_password_or_api_key') === false
    );

    check('an unset block does not', gateWith(undefined, undefined, undefined) === false);
    check('an empty-string block does not', gateWith('', '', '') === false);
    check('whitespace is not a credential', gateWith('   ', '  ', ' ') === false);

    // RFC 2606 reserves the example domains, so no real mail host can end in
    // one. Matching the suffix catches every copied template, not just ours.
    check('any .example.com host is rejected', gateWith('mail.example.com', ...REAL.slice(1)) === false);
    check('and .example.org / .example.net too', gateWith('smtp.example.net', ...REAL.slice(1)) === false);
    check('a bare "example.com" host is rejected', gateWith('example.com', ...REAL.slice(1)) === false);

    // The suffix rule must not swallow a legitimate host that merely contains
    // the word — `example.com.br` and `myexample.com` are real-world shapes.
    check('but a host that only CONTAINS "example" is fine', gateWith('smtp.myexample.com', ...REAL.slice(1)) === true);
    check('and a different TLD after it is fine', gateWith('smtp.example.com.br', ...REAL.slice(1)) === true);

    // One placeholder anywhere is enough — a partial block is not a config.
    check('a placeholder USER alone closes it', gateWith(REAL[0], 'apikey_or_username', REAL[2]) === false);
    check('a placeholder PASS alone closes it', gateWith(REAL[0], REAL[1], 'smtp_password_or_api_key') === false);
    check('placeholder matching ignores case', gateWith(REAL[0], 'APIKEY_OR_USERNAME', REAL[2]) === false);

    __resetMailTransportForTests();
  }

  restore();
  __resetMailTransportForTests();

  // The suite must not leak its own settings into whatever runs next.
  section('6. The environment is left as it was found');
  {
    const clean = TOUCHED.every((k) => process.env[k] === saved.get(k));
    check('every variable this suite touched is restored', clean);
    check(
      'and none was left as the string "undefined"',
      TOUCHED.every((k) => process.env[k] !== 'undefined')
    );
    check('the throwaway DATABASE_URL is put back too', process.env.DATABASE_URL === PRIOR_DATABASE_URL);
  }

  if (failed > 0) {
    console.log(`\n${failed} FAILED, ${passed} passed\n`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} env-config checks passed.\n`);
  assert.ok(passed > 0);
}

try {
  main();
} catch (err) {
  restore();
  throw err;
}
