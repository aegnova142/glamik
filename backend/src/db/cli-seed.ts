/**
 * CLI: populate a database with Glamirk's default content graph.
 *
 *   npm run seed                 (safe — skips if content already exists)
 *   npm run seed -- --force      (overwrites cms_state; destroys admin edits)
 *
 * Runs migrations first, so this works against a completely empty database.
 */
import '../config/env';
import { pool } from './db';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

async function main() {
  const force = process.argv.includes('--force');

  if (force) {
    console.warn('[seed] --force: existing cms_state content will be REPLACED with the defaults.');
  }

  await runMigrations(pool);
  const result = await seedDatabase(pool, { force });

  console.log(result.seeded ? 'Seed complete.' : 'Seed skipped — database already has content.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
