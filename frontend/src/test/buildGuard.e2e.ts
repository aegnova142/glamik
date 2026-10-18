/**
 * The build-time Firebase configuration guard.
 *
 *   npx tsx src/test/buildGuard.e2e.ts        (from frontend/)
 *
 * Run with tsx rather than Vitest on purpose. vite.config.ts is written for
 * Vite's own loader: importing it under the jsdom environment trips an esbuild
 * TextEncoder invariant, and under the node environment the suite's shared
 * setup.ts fails on localStorage. Neither is worth reshaping global test
 * infrastructure for — and `.e2e.ts` does not match the Vitest include
 * pattern, so this file stays out of that run entirely.
 *
 * Each case writes a throwaway .env into a temp directory and asks the guard
 * to read it. No real .env is touched and no build is executed: the guard runs
 * during config resolution, long before bundling, which is exactly the point —
 * a misconfigured deploy should die before it produces an artefact.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import { assertFirebaseClientConfig } from '../../vite.config';

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

/** A realistic-looking but entirely fictional client config. */
const CLIENT_KEYS = {
  VITE_FIREBASE_API_KEY: 'test-api-key-not-a-real-credential',
  VITE_FIREBASE_PROJECT_ID: 'example-test-project',
  VITE_FIREBASE_AUTH_DOMAIN: 'example-test-project.firebaseapp.com',
};

const tempDirs: string[] = [];

/** Writes a .env into a fresh temp directory and returns that directory. */
function envDirWith(vars: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glamirk-buildguard-'));
  tempDirs.push(dir);
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(path.join(dir, '.env'), body + '\n');
  return dir;
}

/** Runs the guard and returns the thrown message, or null when it allowed the build. */
function guard(vars: Record<string, string>): string | null {
  try {
    assertFirebaseClientConfig('production', envDirWith(vars));
    return null;
  } catch (err) {
    return String((err as Error).message);
  }
}

function main(): void {
  // ==========================================
  // 1. THE CASE THE GUARD WAS MISSING
  //
  // Client credentials provisioned, provider switch not selecting Firebase.
  // This used to return early and ship a bundle with sign-in switched off.
  // ==========================================
  section('1. Client keys present, SMS_PROVIDER does not select firebase');
  {
    const unset = guard({ ...CLIENT_KEYS });
    check('SMS_PROVIDER missing entirely is refused', unset !== null);
    check('and the message says it is not set', /not set/i.test(unset || ''), unset || '(no throw)');
    check(
      'and names SMS_PROVIDER as the thing to fix',
      /Set SMS_PROVIDER=firebase/.test(unset || ''),
      unset || '(no throw)'
    );

    const stale = guard({ ...CLIENT_KEYS, SMS_PROVIDER: 'msg91' });
    check('a stale provider value is refused', stale !== null);
    check('and the message quotes the offending value', /"msg91"/.test(stale || ''), stale || '(no throw)');

    const empty = guard({ ...CLIENT_KEYS, SMS_PROVIDER: '' });
    check('an empty SMS_PROVIDER is refused', empty !== null);

    const spaced = guard({ ...CLIENT_KEYS, SMS_PROVIDER: '   ' });
    check('whitespace-only SMS_PROVIDER is refused', spaced !== null);

    // One key is enough to establish intent: a half-provisioned deployment is
    // the one most likely to have a stale switch.
    const partial = guard({ VITE_FIREBASE_API_KEY: CLIENT_KEYS.VITE_FIREBASE_API_KEY });
    check('even a single client key is enough to demand the switch', partial !== null);
  }

  // ==========================================
  // 2. NO FIREBASE AT ALL — MUST STILL BUILD
  //
  // The guard must not conscript deployments that never wanted mobile sign-in.
  // ==========================================
  section('2. A deployment with no Firebase keys builds as before');
  {
    check('an empty .env is allowed', guard({}) === null);
    check('unrelated settings alone are allowed', guard({ NODE_ENV: 'production' }) === null);
    check('a non-firebase provider with no client keys is allowed', guard({ SMS_PROVIDER: 'msg91' }) === null);
    check(
      'server-side FIREBASE_PROJECT_ID alone does not trigger it',
      guard({ FIREBASE_PROJECT_ID: 'example-test-project' }) === null
    );
  }

  // ==========================================
  // 3. THE ORIGINAL DIRECTION STILL HOLDS
  // ==========================================
  section('3. SMS_PROVIDER=firebase with missing client keys');
  {
    const none = guard({ SMS_PROVIDER: 'firebase' });
    check('all three keys missing is refused', none !== null);
    check(
      'and every missing key is named',
      ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN'].every((k) =>
        (none || '').includes(k)
      ),
      none || '(no throw)'
    );

    const one = guard({
      SMS_PROVIDER: 'firebase',
      VITE_FIREBASE_API_KEY: CLIENT_KEYS.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_PROJECT_ID: CLIENT_KEYS.VITE_FIREBASE_PROJECT_ID,
    });
    check('one missing key is refused', one !== null);
    check('and it is the one named', /VITE_FIREBASE_AUTH_DOMAIN is missing/.test(one || ''), one || '(no throw)');

    check('case and padding on the provider are tolerated', guard({ ...CLIENT_KEYS, SMS_PROVIDER: ' FireBase ' }) === null);
  }

  // ==========================================
  // 4. MISMATCHED PROJECTS
  // ==========================================
  section('4. Server and client naming different projects');
  {
    const mismatch = guard({
      ...CLIENT_KEYS,
      SMS_PROVIDER: 'firebase',
      FIREBASE_PROJECT_ID: 'a-different-project',
    });
    check('a project mismatch is refused', mismatch !== null);
    check('and explains the audience failure', /audience check/i.test(mismatch || ''), mismatch || '(no throw)');

    check(
      'matching projects are allowed',
      guard({ ...CLIENT_KEYS, SMS_PROVIDER: 'firebase', FIREBASE_PROJECT_ID: CLIENT_KEYS.VITE_FIREBASE_PROJECT_ID }) ===
        null
    );
  }

  // ==========================================
  // 5. THE HAPPY PATH, AND WHAT THE MESSAGES LEAK
  // ==========================================
  section('5. A complete configuration, and log hygiene');
  {
    check('a fully configured .env builds', guard({ ...CLIENT_KEYS, SMS_PROVIDER: 'firebase' }) === null);

    // Every message lands in CI logs. Names, never values.
    const messages = [
      guard({ ...CLIENT_KEYS }),
      guard({ ...CLIENT_KEYS, SMS_PROVIDER: 'msg91' }),
      guard({ SMS_PROVIDER: 'firebase' }),
      guard({ ...CLIENT_KEYS, SMS_PROVIDER: 'firebase', FIREBASE_PROJECT_ID: 'a-different-project' }),
    ].filter(Boolean) as string[];
    check('all four failure modes produce a message', messages.length === 4, String(messages.length));
    check(
      'no message contains a configured VALUE',
      messages.every(
        (m) =>
          !m.includes(CLIENT_KEYS.VITE_FIREBASE_API_KEY) &&
          !m.includes(CLIENT_KEYS.VITE_FIREBASE_AUTH_DOMAIN) &&
          !m.includes(CLIENT_KEYS.VITE_FIREBASE_PROJECT_ID)
      )
    );
    check(
      'and each says where the .env lives',
      messages.every((m) => /\.env/.test(m))
    );
  }

  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });

  if (failed > 0) {
    console.log(`\n${failed} FAILED, ${passed} passed\n`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} build-guard checks passed.\n`);
  assert.ok(passed > 0);
}

main();
