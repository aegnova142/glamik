import { Request, Response, NextFunction } from 'express';
import { clientIp } from '../utils/request';

// ==========================================
// RATE LIMITING
//
// Fixed-window counter, in-process. Enough to blunt credential stuffing and
// reset-token guessing against this single-process server; a multi-instance
// deployment would want this moved to Redis or Postgres. (Relatedly, the pm2
// config pins exec_mode to 'fork' for exactly this reason — clustering would
// silently give each worker its own counters.)
// ==========================================

interface RateWindow {
  count: number;
  resetAt: number;
}

const rateWindows = new Map<string, RateWindow>();

// Periodic sweep so the map can't grow unbounded from one-off IPs.
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of rateWindows) {
    if (win.resetAt <= now) rateWindows.delete(key);
  }
}, 10 * 60 * 1000).unref?.();

export function rateLimit(options: { windowMs: number; max: number; scope: string; message?: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${options.scope}:${clientIp(req) || 'unknown'}`;
    const now = Date.now();
    const win = rateWindows.get(key);

    if (!win || win.resetAt <= now) {
      rateWindows.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    win.count += 1;
    if (win.count > options.max) {
      const retryAfter = Math.ceil((win.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: options.message || `Too many attempts. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      });
    }
    next();
  };
}
