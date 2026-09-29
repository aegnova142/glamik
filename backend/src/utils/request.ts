import { Request } from 'express';

/**
 * Best-effort client IP.
 *
 * Behind the VPS's nginx reverse proxy the socket address is always the proxy
 * itself, so X-Forwarded-For is what actually identifies the caller. Only the
 * first entry is used — the rest of the chain is attacker-controllable.
 *
 * Shared by session recording and rate limiting so the two can never disagree
 * about who a request came from.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}
