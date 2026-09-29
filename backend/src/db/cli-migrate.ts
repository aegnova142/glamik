/**
 * CLI: apply pending database migrations.
 *
 *   npm run migrate              (from the repo root)
 *
 * The server applies migrations at boot anyway, so this exists for the cases
 * where you want schema changes applied without starting the app: CI, a fresh
 * database, or a deploy that migrates before switching traffic over.
 */
import '../config/env';
import { pool } from './db';
import { runMigrations } from './migrate';

async function main() {
  const result = await runMigrations(pool);
  if (result.applied.length === 0) {
    console.log('Nothing to apply.');
  } else {
    console.log(`Applied ${result.applied.length}: ${result.applied.join(', ')}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
