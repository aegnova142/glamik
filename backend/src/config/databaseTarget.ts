/**
 * What database are we actually pointed at, and may we migrate it automatically?
 *
 * ==========================================================================
 * WHY THIS EXISTS
 * ==========================================================================
 *
 * Migrations 012 and 013 both reached the production database without anyone
 * intending it, and without any deploy step running. The mechanism:
 *
 *   1. The repo-root .env holds the PRODUCTION DATABASE_URL.
 *   2. server.ts calls ensureSchema() on boot.
 *   3. ensureSchema() applied every pending migration file.
 *
 * So starting a local dev server executed whatever migration files happened to
 * be in that developer's working tree — unreviewed, unmerged, untested against
 * production data — directly against production.
 *
 * Guarding on NODE_ENV does not fix this. The dangerous case IS
 * NODE_ENV=development: a local machine, dev tooling, production data. The
 * only reliable signal is the target itself.
 *
 * ==========================================================================
 * THE RULE: DEFAULT DENY
 * ==========================================================================
 *
 * A target is treated as production unless it is demonstrably safe. Being
 * wrong in that direction costs a developer one explicit command; being wrong
 * the other way rewrites a live schema.
 *
 * Decided from the connection string alone — no query, no connection. That
 * matters: the refusal has to happen before anything touches the database, and
 * it makes the rule trivially testable against any URL.
 */

export type DatabaseTargetKind = 'local' | 'production' | 'remote-allowed';

export interface DatabaseTarget {
  /** Host only. Never includes credentials. */
  host: string;
  kind: DatabaseTargetKind;
  /** Whether ensureSchema() may apply migrations without being asked. */
  allowsAutoMigration: boolean;
  /** Human-readable justification, safe to log. */
  reason: string;
}

/** Hosts that are unambiguously a developer's own machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/**
 * Host, with credentials stripped.
 *
 * Everything that logs anything about the database goes through here. A
 * connection string contains a password, and a password in a log file is a
 * leaked password — CI output, log aggregators and error trackers all retain
 * it indefinitely.
 */
export function describeHost(connectionString: string): string {
  try {
    return new URL(connectionString).host || '(unparseable)';
  } catch {
    return '(unparseable)';
  }
}

/** A connection string safe to print: credentials replaced, everything else
 * intact so the target is still identifiable. */
export function maskConnectionString(connectionString: string): string {
  if (!connectionString) return '(unset)';
  return connectionString.replace(/\/\/[^@/]+@/, '//***:***@');
}

/**
 * Classifies the target.
 *
 * Order matters — each rule is more explicit than the one after it:
 *
 *   1. DATABASE_ENV=production      operator has said so outright
 *   2. a local host                 a developer's own machine
 *   3. ALLOW_REMOTE_AUTO_MIGRATE    deliberate opt-in for a remote dev/staging DB
 *   4. anything else                assumed production
 *
 * Note that rule 3 cannot override rule 1. Someone who has declared a database
 * production cannot then opt back into auto-migrating it by setting another
 * variable — that would rebuild the hole this closes.
 */
export function classifyDatabaseTarget(connectionString: string, envVars: NodeJS.ProcessEnv = process.env): DatabaseTarget {
  const host = describeHost(connectionString);

  if (String(envVars.DATABASE_ENV || '').toLowerCase() === 'production') {
    return {
      host,
      kind: 'production',
      allowsAutoMigration: false,
      reason: 'DATABASE_ENV=production',
    };
  }

  // Hostname only — a database named "localhost_backup" on a remote host must
  // not pass as local.
  //
  // Brackets are stripped because URL.hostname returns an IPv6 literal as
  // "[::1]" rather than "::1", so a bracket-sensitive comparison misclassifies
  // localhost-over-IPv6 as remote. That failed safe (it refused to
  // auto-migrate a local database) but it was still wrong, and would have sent
  // developers hunting for a problem that did not exist.
  let hostname = '';
  try {
    hostname = new URL(connectionString).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    hostname = '';
  }

  if (LOCAL_HOSTS.has(hostname)) {
    return {
      host,
      kind: 'local',
      allowsAutoMigration: true,
      reason: 'host is local',
    };
  }

  if (String(envVars.ALLOW_REMOTE_AUTO_MIGRATE || '').toLowerCase() === 'true') {
    return {
      host,
      kind: 'remote-allowed',
      allowsAutoMigration: true,
      reason: 'remote host, but ALLOW_REMOTE_AUTO_MIGRATE=true',
    };
  }

  return {
    host,
    kind: 'production',
    allowsAutoMigration: false,
    // Phrased as the assumption it is, so an operator reading a refusal
    // understands why and how to say otherwise.
    reason: 'remote host, assumed production (set ALLOW_REMOTE_AUTO_MIGRATE=true if it is not)',
  };
}

/**
 * The message shown when automatic migration is refused.
 *
 * Deliberately tells the operator exactly what to run instead. A refusal that
 * does not say how to proceed gets worked around rather than followed.
 */
export function buildAutoMigrationRefusal(target: DatabaseTarget, pending: string[]): string {
  const list = pending.length > 0 ? pending.join(', ') : '(none detected)';
  return (
    `Refusing to apply migrations automatically to ${target.host} — ${target.reason}.\n` +
    `Pending: ${list}\n\n` +
    'Migrations against a production database are an explicit deployment step, not a side\n' +
    'effect of starting the application. Run:\n\n' +
    '    npm run migrate\n\n' +
    'If this is NOT production, either point DATABASE_URL at a local database or set\n' +
    'ALLOW_REMOTE_AUTO_MIGRATE=true for this environment.'
  );
}
