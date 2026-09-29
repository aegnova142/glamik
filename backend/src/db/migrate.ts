import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { PATHS } from '../config/paths';

// ==========================================
// MIGRATION RUNNER
//
// Replaces the single 160-line ensureSchema() SQL string with numbered,
// forward-only files in database/migrations. Same guarantee as before —
// the schema is ready before any query runs, with nothing to apply by hand —
// but now the schema has a history, can be rebuilt from zero deterministically,
// and shows up in code review.
//
// Takes the pool as an argument rather than importing it, so this module never
// imports db.ts and the two can't form an import cycle.
// ==========================================

export interface MigrationResult {
  applied: string[];
  skipped: number;
}

function checksum(sql: string): string {
  // Line endings differ between a Windows checkout and the Linux VPS, so they
  // are normalised out — otherwise every migration would look "modified" on
  // one platform and the drift guard below would fire constantly.
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

function loadMigrationFiles(dir: string): { version: string; sql: string; sum: string }[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found at ${dir}`);
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    // Zero-padded numeric prefixes, so lexical order is chronological order.
    .sort()
    .map((version) => {
      const sql = fs.readFileSync(path.join(dir, version), 'utf8');
      return { version, sql, sum: checksum(sql) };
    });
}

/**
 * Applies every migration that hasn't run yet, each in its own transaction.
 *
 * A partially-applied migration is the worst outcome here, so each file is
 * wrapped in BEGIN/COMMIT: either the whole file lands and is recorded, or
 * nothing from it does and startup fails loudly.
 */
export async function runMigrations(pool: Pool, options: { silent?: boolean } = {}): Promise<MigrationResult> {
  const log = (msg: string) => {
    if (!options.silent) console.log(`[migrate] ${msg}`);
  };

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = loadMigrationFiles(PATHS.migrations);
  if (files.length === 0) throw new Error(`No .sql migrations found in ${PATHS.migrations}`);

  const appliedRows = await pool.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations'
  );
  const already = new Map(appliedRows.rows.map((r) => [r.version, r.checksum]));

  // Migrations are immutable once applied. Editing one in place would mean
  // two databases silently disagreeing about their schema, so it's surfaced
  // as a warning rather than being quietly ignored.
  for (const file of files) {
    const previous = already.get(file.version);
    if (previous && previous !== file.sum) {
      console.warn(
        `[migrate] WARNING: ${file.version} has changed since it was applied ` +
          `(recorded ${previous}, now ${file.sum}). Applied migrations must be treated as ` +
          `immutable — add a new migration instead of editing this one.`
      );
    }
  }

  const pending = files.filter((f) => !already.has(f.version));
  if (pending.length === 0) {
    log(`schema up to date (${files.length} migration${files.length === 1 ? '' : 's'} already applied)`);
    return { applied: [], skipped: files.length };
  }

  log(`applying ${pending.length} migration${pending.length === 1 ? '' : 's'}…`);
  const applied: string[] = [];

  for (const file of pending) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(file.sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        file.version,
        file.sum,
      ]);
      await client.query('COMMIT');
      applied.push(file.version);
      log(`  ✓ ${file.version}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${file.version} failed and was rolled back: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  log(`done — ${applied.length} applied, ${files.length - applied.length} already present`);
  return { applied, skipped: files.length - applied.length };
}
