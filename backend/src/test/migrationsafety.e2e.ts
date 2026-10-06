/**
 * Migration auto-apply protection.
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55443/safety_test \
 *     npx tsx src/test/migrationsafety.e2e.ts
 *
 * Guards the hole that let migrations 012 and 013 reach production unasked: a
 * local dev server, NODE_ENV=development, .env pointing at the live database,
 * and ensureSchema() applying every migration file in the working tree on boot.
 *
 * The classification half runs against connection strings only — no database
 * needed, which is the point: the refusal must happen before anything connects.
 * The behavioural half runs against a real throwaway database to prove the
 * refusal actually prevents DDL, and that the explicit path still works.
 */

// Pinned before any import — mailer.ts will not open an SMTP connection under
// NODE_ENV=test. See checkout.e2e.ts for why that matters. The
// classifyDatabaseTarget cases below pass NODE_ENV explicitly as an argument,
// so they are unaffected by what process.env holds.
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}

import { Pool } from 'pg';
import {
  classifyDatabaseTarget,
  maskConnectionString,
  describeHost,
  buildAutoMigrationRefusal,
} from '../config/databaseTarget';
// Pure helper, imported directly rather than through `env` — env captures
// NODE_ENV once at module load, so the production branch could not otherwise be
// exercised in the same process as the development branch.
import { resolveJwtSecret, DEV_JWT_SECRET } from '../config/env';
import { runMigrations } from '../db/migrate';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

// The production URL *shape* — a Neon pooler endpoint, remote, with sslmode —
// so the tests exercise the same classification path as the string that caused
// the incident. Every identifier here is fabricated: the real endpoint and
// database user are deliberately not committed, because a repository is the
// wrong place to publish live infrastructure names even without a password.
const PROD_URL =
  'postgresql://dbowner:fakepassword@ep-example-endpoint-00000-pooler.c-2.us-east-1.aws.neon.tech/appdb?sslmode=require';
const LOCAL_URL = 'postgres://postgres:test@localhost:5432/glamirk_test';

async function run(): Promise<void> {
  // ========================================
  section('Classification — decided from the URL alone, before any connection');
  // ========================================

  const prodAsDev = classifyDatabaseTarget(PROD_URL, { NODE_ENV: 'development' } as any);
  check('production URL under NODE_ENV=development is classified production', prodAsDev.kind === 'production', prodAsDev.kind);
  check('...and auto-migration is refused', prodAsDev.allowsAutoMigration === false);

  const prodAsProd = classifyDatabaseTarget(PROD_URL, { NODE_ENV: 'production' } as any);
  check('production URL under NODE_ENV=production is classified production', prodAsProd.kind === 'production');
  check('...and auto-migration is refused', prodAsProd.allowsAutoMigration === false);

  const local = classifyDatabaseTarget(LOCAL_URL, { NODE_ENV: 'development' } as any);
  check('a local URL is classified local', local.kind === 'local', local.kind);
  check('...and auto-migration is allowed, so normal dev is unaffected', local.allowsAutoMigration === true);

  for (const host of ['127.0.0.1', '::1', 'host.docker.internal']) {
    const u = `postgres://u:p@${host.includes(':') && host !== '::1' ? host : host === '::1' ? '[::1]' : host}:5432/dev_test`;
    const t = classifyDatabaseTarget(u, {} as any);
    check(`${host} is treated as local`, t.allowsAutoMigration === true, t.kind);
  }

  // A remote host is production by default. Being wrong this way costs one
  // explicit command; being wrong the other way rewrites a live schema.
  const unknownRemote = classifyDatabaseTarget('postgres://u:p@db.somewhere.example.com/app', {} as any);
  check('an unrecognised remote host defaults to production', unknownRemote.kind === 'production', unknownRemote.kind);
  check('...default-deny: auto-migration refused', unknownRemote.allowsAutoMigration === false);

  // Explicit opt-in for a genuine remote dev/staging database.
  const optedIn = classifyDatabaseTarget('postgres://u:p@staging.example.com/app', {
    ALLOW_REMOTE_AUTO_MIGRATE: 'true',
  } as any);
  check('ALLOW_REMOTE_AUTO_MIGRATE re-enables auto-migration for a remote host', optedIn.allowsAutoMigration === true);

  // ...but it must NOT be able to override an explicit production declaration,
  // or the hole is simply rebuilt behind a second variable.
  const cannotOverride = classifyDatabaseTarget(LOCAL_URL, {
    DATABASE_ENV: 'production',
    ALLOW_REMOTE_AUTO_MIGRATE: 'true',
  } as any);
  check('DATABASE_ENV=production cannot be overridden by the opt-in', cannotOverride.allowsAutoMigration === false);
  check('...even for a local host', cannotOverride.kind === 'production');

  // ========================================
  section('Credentials never leak into logs or messages');
  // ========================================

  const masked = maskConnectionString(PROD_URL);
  check('masking removes the password', !masked.includes('fakepassword'), masked);
  check('masking removes the username', !masked.includes('dbowner'));
  check('masking keeps the host identifiable', masked.includes('ep-example-endpoint'));
  check('host description contains no credentials', !describeHost(PROD_URL).includes('fakepassword'));

  const refusal = buildAutoMigrationRefusal(prodAsDev, ['013_sql_inventory_reservations.sql']);
  check('the refusal message leaks no password', !refusal.includes('fakepassword'));
  check('the refusal names the pending migration', refusal.includes('013_sql_inventory_reservations.sql'));
  check('the refusal tells the operator what to run', refusal.includes('npm run migrate'));

  // ========================================
  section('Behaviour — a pending migration is never auto-applied to production');
  // ========================================

  // A real database, deliberately described as production, with migrations
  // outstanding. ensureSchema() must refuse and create nothing.
  const pool = new Pool({ connectionString: url, max: 2 });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  const before = await pool.query(
    `SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'`
  );
  check('the test database starts empty', before.rows[0].n === 0, String(before.rows[0].n));

  // Load db.ts with DATABASE_ENV=production so the same local URL is
  // classified production — isolating the target rule from the host rule.
  process.env.DATABASE_ENV = 'production';
  const dbModule = await import('../db/db');

  let refused = false;
  let message = '';
  try {
    await dbModule.ensureSchema();
  } catch (err: any) {
    refused = true;
    message = err?.message || '';
  }

  check('ensureSchema refuses a production target', refused);
  check('...naming pending migrations', message.includes('Pending:'), message.slice(0, 120));
  check('...and pointing at the explicit command', message.includes('npm run migrate'));
  check('...without leaking credentials', !message.includes('test@') || !message.includes('postgres://postgres:'));

  const afterRefusal = await pool.query(
    `SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'`
  );
  check(
    'NO tables were created — the refusal actually prevented DDL',
    afterRefusal.rows[0].n === 0,
    `${afterRefusal.rows[0].n} table(s) appeared`
  );

  // ========================================
  section('The explicit path still works');
  // ========================================

  // npm run migrate calls runMigrations directly, bypassing ensureSchema —
  // so a deliberate deployment step must still apply everything even against
  // a target auto-migration refuses.
  const result = await runMigrations(pool, { silent: true });
  check('npm run migrate applies migrations to a production target', result.applied.length > 0, String(result.applied.length));

  const afterMigrate = await pool.query(
    `SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'`
  );
  check('tables now exist', afterMigrate.rows[0].n > 0, String(afterMigrate.rows[0].n));

  const inventoryExists = await pool.query(
    `SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_name='inventory'`
  );
  check('the inventory table was created by the explicit path', inventoryExists.rows[0].n === 1);

  // With nothing outstanding, ensureSchema verifies instead of refusing.
  dbModule.__resetCmsCacheForTests();
  let verifyPassed = false;
  try {
    // The memoised promise already rejected, so a fresh module instance is
    // needed to re-evaluate. Re-importing with a cache-busting query gives one.
    const fresh = await import(`../db/db?v=${Date.now()}`);
    await fresh.ensureSchema();
    verifyPassed = true;
  } catch {
    verifyPassed = false;
  }
  check('with the schema current, ensureSchema verifies and proceeds', verifyPassed);

  // ========================================
  section('JWT_SECRET — production never falls back to a committed default');
  // ========================================

  // The old behaviour was `process.env.JWT_SECRET || '<a literal in this repo>'`.
  // A deployment that simply lost the variable kept booting and signed every
  // admin session, customer session and OTP hash with a publicly readable key.
  const LEAKED = 'glamirk_luxury_atelier_jwt_secret_2026';
  const throws = (configured: string | undefined, isProd: boolean): boolean => {
    try {
      resolveJwtSecret(configured, isProd);
      return false;
    } catch {
      return true;
    }
  };

  check('production with no JWT_SECRET refuses to start', throws(undefined, true));
  check('production with an empty JWT_SECRET refuses to start', throws('', true));
  check('production with whitespace-only JWT_SECRET refuses to start', throws('   ', true));
  // The specific value that leaked, rejected by name wherever it reappears —
  // an operator copying .env.example verbatim must not land back on it.
  check('production rejects the old committed default outright', throws(LEAKED, true));
  check('production rejects the dev key outright', throws(DEV_JWT_SECRET, true));
  check('production accepts a real secret', !throws('a'.repeat(64), true));
  check('...and returns it unchanged', resolveJwtSecret('a'.repeat(64), true) === 'a'.repeat(64));
  check('surrounding whitespace is trimmed', resolveJwtSecret('  realsecret  ', true) === 'realsecret');

  // Development must stay runnable with no configuration at all, or people
  // paste the production secret into their local .env to make the app start.
  check('development with no JWT_SECRET still works', !throws(undefined, false));
  check('...using the clearly-named dev key', resolveJwtSecret(undefined, false) === DEV_JWT_SECRET);
  check('development downgrades the leaked default to the dev key', resolveJwtSecret(LEAKED, false) === DEV_JWT_SECRET);
  check('development still honours a real secret', resolveJwtSecret('local-dev-secret', false) === 'local-dev-secret');

  // The dev key must not be mistakable for a real one at a glance, and must
  // not be the value that leaked. (Compared via String() so this stays a real
  // runtime assertion rather than something the compiler folds away.)
  check('the dev key is self-describing', /dev-only/.test(DEV_JWT_SECRET) && /not-for-production/.test(DEV_JWT_SECRET));
  check('the leaked default is no longer the dev fallback', String(DEV_JWT_SECRET) !== String(LEAKED));

  // The error has to say what to do, not just that something is wrong.
  let jwtRefusal = '';
  try {
    resolveJwtSecret(undefined, true);
  } catch (err: any) {
    jwtRefusal = err?.message || '';
  }
  check('the jwtRefusal explains how to generate one', jwtRefusal.includes('openssl rand -hex 32'));
  check('the jwtRefusal warns that rotating signs everyone out', /signs out every logged-in user/i.test(jwtRefusal));
  check('the jwtRefusal never prints a secret', !jwtRefusal.includes(LEAKED) && !jwtRefusal.includes(DEV_JWT_SECRET));

  delete process.env.DATABASE_ENV;
  await pool.end();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('='.repeat(60));
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`${'='.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nHarness crashed:', err);
  process.exit(1);
});
