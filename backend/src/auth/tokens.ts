import jwt from 'jsonwebtoken';
import { pool, JWT_SECRET } from '../db/db';

// ==========================================
// CUSTOMER TOKENS
//
// A customer token is only as good as the account state behind it, so this
// module owns both: minting tokens, and deciding whether a presented one is
// still live.
// ==========================================

const TOKEN_TTL = '30d';

/** Claims carried by every customer token. `tv` is the account's token
 * version at signing time and `sid` identifies the device session — both are
 * what make logout and revocation real rather than client-side-only. */
export interface CustomerTokenClaims {
  id: string;
  email: string;
  role: 'customer';
  tv: number;
  sid?: string;
}

export function signCustomerToken(id: string, email: string, tokenVersion: number, sessionId?: string): string {
  const claims: CustomerTokenClaims = { id, email, role: 'customer', tv: tokenVersion, sid: sessionId };
  return jwt.sign(claims, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyCustomerToken(token: string): CustomerTokenClaims | null {
  try {
    return jwt.verify(token, JWT_SECRET) as CustomerTokenClaims;
  } catch {
    return null;
  }
}

// ------------------------------------------
// Account state cache
//
// Authenticating a request has to know the account's current token_version
// and whether it has been deleted, which would otherwise mean a database
// round trip on every single authenticated request. Cached briefly per user
// instead; any code path that changes either value calls
// invalidateAccountCache() so a revocation takes effect immediately in this
// process rather than after the TTL. The TTL is the backstop for a second
// process (or a direct SQL edit) changing the row behind our back.
// ------------------------------------------
export interface AccountState {
  tokenVersion: number;
  deleted: boolean;
  fetchedAt: number;
}

const ACCOUNT_CACHE_TTL_MS = 30_000;
const accountStateCache = new Map<string, AccountState>();

export function invalidateAccountCache(userId: string): void {
  accountStateCache.delete(userId);
}

export async function getAccountState(userId: string): Promise<AccountState | null> {
  const cached = accountStateCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < ACCOUNT_CACHE_TTL_MS) return cached;

  const res = await pool.query('SELECT token_version, deleted_at FROM customers WHERE id = $1', [userId]);
  const row = res.rows[0];
  if (!row) {
    accountStateCache.delete(userId);
    return null;
  }
  const state: AccountState = {
    tokenVersion: Number(row.token_version) || 0,
    deleted: !!row.deleted_at,
    fetchedAt: Date.now(),
  };
  accountStateCache.set(userId, state);
  return state;
}

/** Invalidates every existing token for an account by moving its version
 * forward. Used by "log out of all devices", password change and password
 * reset — a leaked token stops working the moment this runs. */
export async function bumpTokenVersion(userId: string): Promise<number> {
  const res = await pool.query(
    'UPDATE customers SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
    [userId]
  );
  invalidateAccountCache(userId);
  return Number(res.rows[0]?.token_version) || 0;
}

export async function getTokenVersion(userId: string): Promise<number> {
  const res = await pool.query('SELECT token_version FROM customers WHERE id = $1', [userId]);
  return Number(res.rows[0]?.token_version) || 0;
}
