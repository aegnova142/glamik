import { Request } from 'express';
import { pool } from '../db/db';
import { clientIp } from '../utils/request';

// ==========================================
// DEVICE SESSIONS
//
// One row per signed-in device/browser, created at login and deleted on
// logout. These are informational — what actually enforces revocation is the
// account's token_version (see auth/tokens.ts). This is the list a customer
// sees under "Active sessions".
// ==========================================

export async function createSession(userId: string, req: Request): Promise<string> {
  const id = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  await pool.query('INSERT INTO customer_sessions (id, user_id, user_agent, ip_address) VALUES ($1, $2, $3, $4)', [
    id,
    userId,
    String(req.headers['user-agent'] || '').slice(0, 500) || null,
    clientIp(req),
  ]);
  return id;
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await pool.query('DELETE FROM customer_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
}

export async function deleteAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  if (exceptSessionId) {
    await pool.query('DELETE FROM customer_sessions WHERE user_id = $1 AND id <> $2', [userId, exceptSessionId]);
  } else {
    await pool.query('DELETE FROM customer_sessions WHERE user_id = $1', [userId]);
  }
}

// last_seen_at is only interesting at roughly "which device was used today"
// resolution, so it's written at most once every few minutes per session
// rather than on every request.
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastTouchedAt = new Map<string, number>();

export function touchSession(sessionId: string): void {
  const last = lastTouchedAt.get(sessionId) || 0;
  if (Date.now() - last < SESSION_TOUCH_INTERVAL_MS) return;
  lastTouchedAt.set(sessionId, Date.now());
  pool
    .query('UPDATE customer_sessions SET last_seen_at = now() WHERE id = $1', [sessionId])
    .catch((err) => console.error('Failed to touch customer session:', err));
}
