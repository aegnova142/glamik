import { Request, Response, NextFunction } from 'express';
import { getAccountState, verifyCustomerToken } from '../auth/tokens';
import { touchSession } from '../auth/sessions';

/**
 * A request that has passed requireCustomer. `req.customer.id` is the ONLY
 * source of customer identity anywhere in the API — no endpoint accepts a
 * user id from the client, which is what makes the ownership guarantees hold.
 */
export interface AuthenticatedCustomerRequest extends Request {
  // email is null for accounts created through mobile + OTP that haven't
  // added one. Authorization never reads it; `id` is the identity.
  customer?: { id: string; email: string | null; sessionId?: string };
}

export async function requireCustomer(req: AuthenticatedCustomerRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }

  const decoded = verifyCustomerToken(authHeader.split(' ')[1]);
  if (!decoded) {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  if (decoded.role !== 'customer' || !decoded.id) {
    return res.status(403).json({ error: 'Customer session required.' });
  }

  const state = await getAccountState(decoded.id);
  if (!state) {
    return res.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
  }
  if (state.deleted) {
    return res.status(401).json({ error: 'This account has been closed.' });
  }
  // Tokens signed before the account's version was bumped (logout-everywhere,
  // password change/reset) are dead regardless of their expiry date.
  if ((decoded.tv || 0) !== state.tokenVersion) {
    return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
  }

  if (decoded.sid) touchSession(decoded.sid);

  req.customer = { id: decoded.id, email: decoded.email, sessionId: decoded.sid };
  next();
}
