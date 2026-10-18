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

  // The suite must not leak its own settings into whatever runs next.
  section('5. The environment is left as it was found');
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
