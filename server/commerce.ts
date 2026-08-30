import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { pool, loadDatabase, saveDatabase, withStockLock, broadcastEvent, evaluateOffers, InternalCMSDatabaseSchema, JWT_SECRET } from './db';
import { Product, Shade, ServerCartItem, Order, OrderItem, PaymentDetails, CODRules } from '../src/types';
import {
  CANCELLABLE_STATUSES,
  buildOrderFromRow,
  buildOrdersFromRows,
  insertOrderStatusHistory,
  mapReturnRequestRow,
  restockOrderItems,
} from './orders';
import { isVerifiedPurchase, mapReviewRow, recomputeProductRating } from './reviews';
import { mapNotificationRow, notifyOrderStatusChange, notifyAdminNewOrder } from './notifications';
import { sendOrderStatusEmail, sendAdminNewOrderEmail } from './email';

const router = express.Router();

// Lazily built — undefined when SMTP isn't configured, in which case callers
// fall back to their own dev-mode behavior instead of trying to send mail.
let mailTransporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;
function getMailTransporter() {
  if (mailTransporter !== undefined) return mailTransporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    mailTransporter = null;
    return mailTransporter;
  }
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return mailTransporter;
}

// ==========================================
// CUSTOMER AUTH
// ==========================================

export interface AuthenticatedCustomerRequest extends Request {
  customer?: { id: string; email: string };
}

export function requireCustomer(req: AuthenticatedCustomerRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded || decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Customer session required.' });
    }
    req.customer = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

function signCustomerToken(id: string, email: string) {
  return jwt.sign({ id, email, role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
}

router.post('/auth/register', async (req: Request, res: Response) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await pool.query('SELECT id FROM customers WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
  }

  const id = 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));

  await pool.query(
    'INSERT INTO customers (id, name, email, phone, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [id, name, normalizedEmail, phone || null, passwordHash]
  );

  const token = signCustomerToken(id, normalizedEmail);
  res.json({ token, user: { id, name, email: normalizedEmail, phone: phone || undefined, createdAt: new Date().toISOString() } });
});

router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const result = await pool.query('SELECT * FROM customers WHERE email = $1', [normalizedEmail]);
  const row = result.rows[0];
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signCustomerToken(row.id, row.email);
  res.json({
    token,
    user: { id: row.id, name: row.name, email: row.email, phone: row.phone || undefined, createdAt: row.created_at },
  });
});

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

router.post('/auth/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const result = await pool.query('SELECT id FROM customers WHERE email = $1', [normalizedEmail]);
  const row = result.rows[0];
  if (!row) {
    return res.status(404).json({ error: 'No account found with that email address.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await pool.query('UPDATE customers SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [
    token,
    expiry,
    row.id,
  ]);

  const transporter = getMailTransporter();
  if (!transporter) {
    // No SMTP configured — return the token directly so the client-side flow
    // still works end-to-end without email delivery.
    return res.json({ success: true, resetToken: token, expiresInMinutes: 15 });
  }

  const configuredAppUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null;
  const appUrl = configuredAppUrl || `${req.protocol}://${req.get('host')}`;
  const resetLink = `${appUrl}/?resetToken=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Glamirk Beauty <no-reply@glamirk.com>',
      to: normalizedEmail,
      subject: 'Reset your Glamirk password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#121212;">Reset your password</h2>
          <p style="color:#6B6B6B;">We received a request to reset your Glamirk Beauty account password. This link expires in 15 minutes.</p>
          <p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#C9972B;color:#0B0B0B;text-decoration:none;font-weight:bold;border-radius:8px;">Reset Password</a></p>
          <p style="color:#6B6B6B;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    res.json({ success: true, expiresInMinutes: 15 });
  } catch (err) {
    console.error('Failed to send reset email:', err);
    // Email failed to send (bad credentials, provider down, etc.) — still let
    // the user finish the flow instead of leaving them stuck.
    res.json({ success: true, resetToken: token, expiresInMinutes: 15 });
  }
});

router.post('/auth/reset-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const result = await pool.query(
    'SELECT id, reset_token_expiry FROM customers WHERE reset_token = $1',
    [token]
  );
  const row = result.rows[0];
  if (!row || !row.reset_token_expiry || new Date(row.reset_token_expiry).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
  await pool.query(
    'UPDATE customers SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
    [passwordHash, row.id]
  );

  // Sign the user straight back in — a freshly reset password shouldn't
  // require immediately typing it again on a second screen.
  const updated = await pool.query('SELECT id, name, email, phone, created_at FROM customers WHERE id = $1', [row.id]);
  const user = updated.rows[0];
  const jwtToken = signCustomerToken(user.id, user.email);

  res.json({
    success: true,
    token: jwtToken,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone || undefined, createdAt: user.created_at },
  });
});

// "Continue with Google" — the client obtains an OAuth access token via
// Google Identity Services (see src/utils/googleAuth.ts) and hands it here.
// We verify it's real by asking Google's own userinfo endpoint who it
// belongs to, rather than trusting an unverifiable client-side claim.
router.post('/auth/google', async (req: Request, res: Response) => {
  const { accessToken } = req.body || {};
  if (!accessToken) {
    return res.status(400).json({ error: 'Missing Google access token.' });
  }

  let profile: { email?: string; email_verified?: boolean; name?: string };
  try {
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!googleRes.ok) {
      return res.status(401).json({ error: 'Google sign-in verification failed.' });
    }
    profile = await googleRes.json();
  } catch (err) {
    console.error('Google userinfo lookup failed:', err);
    return res.status(502).json({ error: 'Could not reach Google right now. Please try again.' });
  }

  if (!profile.email || profile.email_verified === false) {
    return res.status(401).json({ error: 'Your Google account email is not verified.' });
  }

  const normalizedEmail = profile.email.toLowerCase().trim();
  const existing = await pool.query('SELECT * FROM customers WHERE email = $1', [normalizedEmail]);
  let row = existing.rows[0];

  if (!row) {
    const id = 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    // Google-authenticated accounts never use password login — a random,
    // never-shared hash just satisfies the NOT NULL column.
    const passwordHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), bcrypt.genSaltSync(10));
    await pool.query(
      'INSERT INTO customers (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, profile.name || normalizedEmail, normalizedEmail, passwordHash]
    );
    const created = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    row = created.rows[0];
  }

  const token = signCustomerToken(row.id, row.email);
  res.json({
    token,
    user: { id: row.id, name: row.name, email: row.email, phone: row.phone || undefined, createdAt: row.created_at },
  });
});

router.get('/auth/me', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT id, name, email, phone, created_at FROM customers WHERE id = $1', [req.customer!.id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: { id: row.id, name: row.name, email: row.email, phone: row.phone || undefined, createdAt: row.created_at } });
});

// ==========================================
// ADDRESSES — always scoped to the authenticated customer
// ==========================================

function mapAddressRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    phone: row.phone,
    email: row.email || undefined,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2 || undefined,
    city: row.city,
    state: row.state,
    pinCode: row.pin_code,
    isDefault: row.is_default,
  };
}

router.get('/addresses', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC',
    [req.customer!.id]
  );
  res.json({ addresses: result.rows.map(mapAddressRow) });
});

// Only one address can be marked default at a time — clears every other
// address's flag for this customer before the caller sets the new one.
async function clearOtherDefaultAddresses(userId: string, keepId?: string): Promise<void> {
  await pool.query('UPDATE customer_addresses SET is_default = false WHERE user_id = $1 AND id IS DISTINCT FROM $2', [userId, keepId || null]);
}

router.post('/addresses', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { name, type, phone, email, addressLine1, addressLine2, city, state, pinCode, isDefault } = req.body || {};
  if (!name?.trim() || !phone?.trim() || !addressLine1?.trim() || !city?.trim() || !state?.trim() || !pinCode?.trim()) {
    return res.status(400).json({ error: 'Please fill in all required address fields.' });
  }

  const id = 'addr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  if (isDefault) await clearOtherDefaultAddresses(req.customer!.id);
  await pool.query(
    `INSERT INTO customer_addresses
      (id, user_id, name, type, phone, email, address_line1, address_line2, city, state, pin_code, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, req.customer!.id, name, type || 'Home', phone, email || null, addressLine1, addressLine2 || null, city, state, pinCode, !!isDefault]
  );

  const result = await pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC', [req.customer!.id]);
  res.json({ addresses: result.rows.map(mapAddressRow), newAddressId: id });
});

router.put('/addresses/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { name, type, phone, email, addressLine1, addressLine2, city, state, pinCode, isDefault } = req.body || {};
  if (!name?.trim() || !phone?.trim() || !addressLine1?.trim() || !city?.trim() || !state?.trim() || !pinCode?.trim()) {
    return res.status(400).json({ error: 'Please fill in all required address fields.' });
  }

  const ownerCheck = await pool.query('SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  if (ownerCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Address not found.' });
  }

  if (isDefault) await clearOtherDefaultAddresses(req.customer!.id, req.params.id);
  await pool.query(
    `UPDATE customer_addresses SET
      name = $1, type = $2, phone = $3, email = $4, address_line1 = $5, address_line2 = $6,
      city = $7, state = $8, pin_code = $9, is_default = $10
     WHERE id = $11`,
    [name, type || 'Home', phone, email || null, addressLine1, addressLine2 || null, city, state, pinCode, !!isDefault, req.params.id]
  );

  const result = await pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC', [req.customer!.id]);
  res.json({ addresses: result.rows.map(mapAddressRow) });
});

router.delete('/addresses/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.customer!.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Address not found.' });
  }
  const remaining = await pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC', [req.customer!.id]);
  res.json({ addresses: remaining.rows.map(mapAddressRow) });
});

// ==========================================
// SHARED HELPERS
// ==========================================

function findProduct(products: Product[], productId: string): Product | undefined {
  return products.find((p) => p.id === productId);
}

function findShade(product: Product, variantId: string | null): Shade | undefined {
  if (!variantId || !product.shades) return undefined;
  return product.shades.find((s) => s.id === variantId);
}

function requiresVariant(product: Product): boolean {
  return !!product.shades && product.shades.length > 0;
}

// ==========================================
// WISHLIST — userId + productId is UNIQUE (enforced at DB level)
// ==========================================

router.get('/wishlist', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const result = await pool.query('SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC', [req.customer!.id]);
  const items = result.rows
    .map((r) => findProduct(db.products, r.product_id))
    .filter((p): p is Product => !!p);
  res.json({ items });
});

router.post('/wishlist/toggle/:productId', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId } = req.params;
  const db = await loadDatabase();
  if (!findProduct(db.products, productId)) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const existing = await pool.query('SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.customer!.id, productId]);

  if (existing.rows.length > 0) {
    await pool.query('DELETE FROM wishlist_items WHERE id = $1', [existing.rows[0].id]);
    return res.json({ inWishlist: false, productId });
  }

  const id = 'wl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  try {
    await pool.query('INSERT INTO wishlist_items (id, user_id, product_id) VALUES ($1, $2, $3)', [id, req.customer!.id, productId]);
  } catch (err: any) {
    // Unique violation race (double-click) — treat as already-added, not an error
    if (err.code !== '23505') throw err;
  }
  res.json({ inWishlist: true, productId });
});

// ==========================================
// CART — userId + productId + variantId is UNIQUE
// Price is NEVER trusted from the client — always looked up live from the product catalog.
// ==========================================

function mapCartRow(row: any, db: Awaited<ReturnType<typeof loadDatabase>>): ServerCartItem {
  const product = findProduct(db.products, row.product_id);
  const shade = product ? findShade(product, row.variant_id) : undefined;
  const unavailable = !product || product.inStock === false;
  const unitPrice = product ? product.price : 0;
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    product: product as Product,
    selectedShade: shade,
    lineTotal: unavailable ? 0 : unitPrice * row.quantity,
    unavailable,
    maxAvailable: product ? product.stock : 0,
  };
}

async function hydrateCart(userId: string): Promise<ServerCartItem[]> {
  const db = await loadDatabase();
  const result = await pool.query(
    'SELECT id, product_id, variant_id, quantity FROM cart_items WHERE user_id = $1 AND saved = false ORDER BY created_at ASC',
    [userId]
  );
  return result.rows.map((row) => mapCartRow(row, db));
}

async function hydrateSavedItems(userId: string): Promise<ServerCartItem[]> {
  const db = await loadDatabase();
  const result = await pool.query(
    'SELECT id, product_id, variant_id, quantity FROM cart_items WHERE user_id = $1 AND saved = true ORDER BY created_at DESC',
    [userId]
  );
  return result.rows.map((row) => mapCartRow(row, db));
}

router.get('/cart', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const items = await hydrateCart(req.customer!.id);
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  res.json({ items, subtotal, itemCount: items.reduce((n, i) => n + i.quantity, 0) });
});

router.get('/cart/saved', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const items = await hydrateSavedItems(req.customer!.id);
  res.json({ items });
});

router.post('/cart/items', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId, variantId, quantity } = req.body || {};
  const requestedQty = Math.max(1, parseInt(quantity, 10) || 1);

  const db = await loadDatabase();
  const product = findProduct(db.products, productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.inStock === false) return res.status(400).json({ error: `${product.name} is currently out of stock.` });

  const normalizedVariantId = variantId || null;
  if (requiresVariant(product) && !normalizedVariantId) {
    return res.status(400).json({ error: `Please select a shade for ${product.name} before adding to bag.` });
  }
  if (normalizedVariantId && !findShade(product, normalizedVariantId)) {
    return res.status(400).json({ error: 'Selected shade is not available for this product.' });
  }

  const existing = await pool.query(
    'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3',
    [req.customer!.id, productId, normalizedVariantId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const newQty = row.quantity + requestedQty;
    if (newQty > product.stock) {
      return res.status(400).json({
        error: `Only ${product.stock} of ${product.name} available. You already have ${row.quantity} in your bag.`,
        maxAvailable: product.stock,
      });
    }
    // Reactivates a previously "saved for later" row too — Add to Cart always
    // means the item is active in the bag, regardless of its prior state.
    await pool.query('UPDATE cart_items SET quantity = $1, saved = false, updated_at = now() WHERE id = $2', [newQty, row.id]);
  } else {
    if (requestedQty > product.stock) {
      return res.status(400).json({
        error: `Only ${product.stock} of ${product.name} available.`,
        maxAvailable: product.stock,
      });
    }
    const id = 'cart-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await pool.query(
      'INSERT INTO cart_items (id, user_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4, $5)',
      [id, req.customer!.id, productId, normalizedVariantId, requestedQty]
    );
  }

  const items = await hydrateCart(req.customer!.id);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0) });
});

router.put('/cart/items/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { quantity } = req.body || {};
  const requestedQty = parseInt(quantity, 10);

  if (!requestedQty || requestedQty < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1. Use remove to delete the item instead.' });
  }

  const ownerCheck = await pool.query('SELECT product_id FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  if (ownerCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }

  const db = await loadDatabase();
  const product = findProduct(db.products, ownerCheck.rows[0].product_id);
  if (!product) return res.status(404).json({ error: 'Product no longer available.' });

  if (requestedQty > product.stock) {
    return res.status(400).json({
      error: `Maximum available quantity reached. Only ${product.stock} of ${product.name} in stock.`,
      maxAvailable: product.stock,
    });
  }

  await pool.query('UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2', [requestedQty, req.params.id]);

  const items = await hydrateCart(req.customer!.id);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0) });
});

router.delete('/cart/items/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.customer!.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }
  const items = await hydrateCart(req.customer!.id);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0) });
});

// Moves an active cart line into "saved for later" — it stays owned by the
// customer but drops out of the cart subtotal/checkout until moved back.
router.post('/cart/items/:id/save', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'UPDATE cart_items SET saved = true, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.customer!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }
  const [items, savedItems] = await Promise.all([hydrateCart(req.customer!.id), hydrateSavedItems(req.customer!.id)]);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0), savedItems });
});

router.post('/cart/items/:id/unsave', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    'UPDATE cart_items SET saved = false, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.customer!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found.' });
  }
  const [items, savedItems] = await Promise.all([hydrateCart(req.customer!.id), hydrateSavedItems(req.customer!.id)]);
  res.json({ items, subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0), savedItems });
});

// ==========================================
// CHECKOUT — re-verifies stock + price server-side inside a lock,
// atomically deducts stock, creates the order, and clears the cart.
// ==========================================

// Formats the full order into a wa.me deep link so the customer's own
// WhatsApp opens with the message pre-filled to the admin's number — no
// WhatsApp Business API/credentials required. Returns null if the admin
// hasn't configured a number in Global Store Settings yet.
function buildWhatsAppOrderLink(params: {
  adminNumber: string | undefined | null;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: any;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
}): string | null {
  const digitsOnly = (params.adminNumber || '').replace(/\D/g, '');
  if (!digitsOnly) return null;

  const addressLines = params.address
    ? [
        params.address.addressLine1,
        params.address.addressLine2,
        `${params.address.city || ''}, ${params.address.state || ''} - ${params.address.pinCode || ''}`,
      ]
        .filter(Boolean)
        .join(', ')
    : 'Not provided';

  const itemLines = params.items
    .map((it, i) => {
      const variant = it.shade ? ` (${it.shade.name})` : it.size ? ` (${it.size})` : '';
      return `${i + 1}. ${it.productName}${variant} x${it.quantity} — ₹${it.price * it.quantity}`;
    })
    .join('\n');

  const lines = [
    '🛍️ *New Order Received*',
    '',
    `*Order ID:* #${params.orderNumber}`,
    `*Date:* ${params.createdAt}`,
    '',
    `*Customer:* ${params.customerName}`,
    `*Phone:* ${params.customerPhone}`,
    `*Email:* ${params.customerEmail}`,
    `*Delivery Address:* ${addressLines}`,
    '',
    '*Items:*',
    itemLines,
    '',
    `*Subtotal:* ₹${params.subtotal}`,
    `*Discount:* -₹${params.discount}`,
    `*Shipping:* ₹${params.shipping}`,
    `*Total:* ₹${params.total}`,
    '',
    `*Payment Method:* ${params.paymentMethod.toUpperCase()}`,
    `*Payment Status:* ${params.paymentStatus}`,
  ];

  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(lines.join('\n'))}`;
}

// Discount is always computed server-side against the live, currently-active
// offer list — never trusted from the client. Shared by checkout and the
// standalone /coupons/validate endpoint so the two can never disagree.
function computeCouponDiscount(
  db: InternalCMSDatabaseSchema,
  couponCode: string | undefined | null,
  subtotal: number
): { discount: number; appliedCouponCode: string | null; offer?: ReturnType<typeof evaluateOffers>[number]; error?: string } {
  if (!couponCode) return { discount: 0, appliedCouponCode: null };

  const liveOffers = evaluateOffers(db.offers || []);
  const offer = liveOffers.find(
    (o) => o.status === 'active' && o.couponCode && o.couponCode.toUpperCase() === String(couponCode).toUpperCase()
  );
  if (!offer) {
    return { discount: 0, appliedCouponCode: null, error: 'This coupon code is invalid or has expired.' };
  }
  if (subtotal < (offer.minOrderValue || 0)) {
    return { discount: 0, appliedCouponCode: null, error: `This code requires a minimum order value of ₹${offer.minOrderValue}.` };
  }

  let discount = 0;
  if (offer.discountType === 'percentage') {
    discount = Math.round((subtotal * offer.discountValue) / 100);
  } else if (offer.discountType === 'flat') {
    discount = offer.discountValue;
  }
  discount = Math.min(discount, subtotal);
  return { discount, appliedCouponCode: offer.couponCode!, offer };
}

const PAYMENT_METHODS = ['cod', 'upi', 'card', 'netbanking', 'wallet'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Glamirk has no payment gateway wired up yet — every order is Cash on
// Delivery. The 'upi'/'card'/'netbanking'/'wallet' branches of
// buildPaymentDetails() below stay in place (unreachable while this is
// false) purely so the order model doesn't need reshaping the day a real
// gateway is integrated. Flip this only alongside actually wiring one in.
const ONLINE_PAYMENTS_ENABLED = false;

// The frontend already only ever offers COD, but a request can be sent by
// anything — never trust a client-supplied payment method or an
// unvalidated "COD is fine" assumption. This is the single place that
// decides whether COD may complete a given order.
function checkCodEligibility(
  codRules: CODRules | undefined,
  total: number,
  shippingAddress: { pinCode?: string } | undefined,
  productIds: string[]
): { eligible: true } | { eligible: false; reason: string } {
  const rules = codRules || {
    minOrderAmount: 0,
    maxOrderAmount: 0,
    serviceablePinCodes: [],
    blockedPinCodes: [],
    codDisabledProductIds: [],
  };

  if (rules.minOrderAmount > 0 && total < rules.minOrderAmount) {
    return { eligible: false, reason: `COD requires a minimum order value of ₹${rules.minOrderAmount}.` };
  }
  if (rules.maxOrderAmount > 0 && total > rules.maxOrderAmount) {
    return { eligible: false, reason: `COD is not available for orders above ₹${rules.maxOrderAmount}.` };
  }

  const pinCode = String(shippingAddress?.pinCode || '').trim();
  if (rules.blockedPinCodes?.includes(pinCode)) {
    return { eligible: false, reason: `COD is not available for pin code ${pinCode}.` };
  }
  if (rules.serviceablePinCodes?.length > 0 && !rules.serviceablePinCodes.includes(pinCode)) {
    return { eligible: false, reason: `COD is not serviceable at pin code ${pinCode}.` };
  }

  if (rules.codDisabledProductIds?.length > 0 && productIds.some((id) => rules.codDisabledProductIds.includes(id))) {
    return { eligible: false, reason: 'One or more items in your bag require online payment and are not eligible for Cash on Delivery.' };
  }

  return { eligible: true };
}

// Public (no auth — a shopper checking a product page may not be signed in
// yet) pincode-serviceability check, used by the "Check Delivery
// Availability" widget on the product page. Only checks the
// pincode-related COD rules, not min/max order amount (which depends on the
// eventual cart total, unknown here) — this is the same
// serviceablePinCodes/blockedPinCodes data checkCodEligibility() enforces
// for real at checkout, so this widget can no longer promise COD is
// available somewhere the admin has actually blocked it.
router.get('/cod-eligibility', async (req: Request, res: Response) => {
  const pincode = String(req.query.pincode || '').trim();
  if (!/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ error: 'Please provide a valid 6-digit PIN code.' });
  }

  const db = await loadDatabase();
  const rules = db.globalSettings?.codRules;
  const blocked = rules?.blockedPinCodes?.includes(pincode) || false;
  const restrictedToList = (rules?.serviceablePinCodes?.length || 0) > 0;
  const notInServiceableList = restrictedToList && !rules!.serviceablePinCodes.includes(pincode);
  const serviceable = !blocked && !notInServiceableList;

  res.json({ pincode, serviceable });
});

// Validates + simulates the payment gateway for one checkout attempt. Runs
// BEFORE the stock lock is acquired — it doesn't touch stock or the cart, so
// there's no reason to serialize every other concurrent checkout in the
// store behind its ~1s artificial delay (or behind a real SMTP round-trip,
// for the notification emails sent after checkout completes). This is a
// demo simulation only: no real gateway is called, and only a card's last 4
// digits are ever kept.
async function buildPaymentDetails(
  paymentMethod: PaymentMethod,
  fields: { upiId?: string; cardNumber?: string; bankName?: string; walletProvider?: string }
): Promise<{ error: string; status: number } | PaymentDetails> {
  const paymentDetails: PaymentDetails = { method: paymentMethod, status: 'COD_PENDING' };
  if (paymentMethod === 'cod') return paymentDetails;

  if (paymentMethod === 'upi') {
    if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(String(fields.upiId || ''))) {
      return { error: 'Please enter a valid UPI ID (e.g. name@bank).', status: 400 };
    }
    paymentDetails.upiId = fields.upiId;
  } else if (paymentMethod === 'card') {
    const digits = String(fields.cardNumber || '').replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      return { error: 'Please enter a valid card number.', status: 400 };
    }
    paymentDetails.cardLast4 = digits.slice(-4);
    paymentDetails.cardNetwork = digits.startsWith('4') ? 'Visa' : digits.startsWith('5') ? 'Mastercard' : digits.startsWith('6') ? 'RuPay' : 'Card';
  } else if (paymentMethod === 'netbanking') {
    if (!String(fields.bankName || '').trim()) {
      return { error: 'Please select your bank.', status: 400 };
    }
    paymentDetails.bankName = fields.bankName;
  } else if (paymentMethod === 'wallet') {
    if (!String(fields.walletProvider || '').trim()) {
      return { error: 'Please select a wallet provider.', status: 400 };
    }
    paymentDetails.walletProvider = fields.walletProvider;
  }

  // Simulated processing delay + occasional simulated decline, purely for
  // demo realism — this never touches a real payment network.
  await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 500));
  if (Math.random() < 0.1) {
    return { error: 'Payment declined by your bank/provider. Please try again or choose a different method.', status: 402 };
  }
  paymentDetails.status = 'PAID';
  paymentDetails.paidAt = new Date().toISOString();
  return paymentDetails;
}

router.post('/coupons/validate', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { couponCode, subtotal } = req.body || {};
  if (!String(couponCode || '').trim()) {
    return res.status(400).json({ error: 'Please enter a coupon code.' });
  }

  const db = await loadDatabase();
  const result = computeCouponDiscount(db, couponCode, Number(subtotal) || 0);
  if (!result.appliedCouponCode || !result.offer) {
    return res.status(400).json({ error: result.error || 'Invalid coupon code.' });
  }

  const offer = result.offer;
  res.json({
    coupon: {
      code: offer.couponCode,
      title: offer.publicTitle || offer.name,
      description: offer.description,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      minOrderValue: offer.minOrderValue || undefined,
      tag: offer.tag,
    },
    discount: result.discount,
  });
});

router.post('/checkout', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const {
    shippingAddress, idempotencyKey, customerName, customerPhone, customerEmail, couponCode,
    upiId, cardNumber, bankName, walletProvider,
  } = req.body || {};
  const paymentMethod: (typeof PAYMENT_METHODS)[number] = req.body?.paymentMethod || 'cod';
  const userId = req.customer!.id;
  const placedNote = 'Order placed successfully';
  const resolvedName = customerName || shippingAddress?.name || '';
  const resolvedPhone = customerPhone || shippingAddress?.phone || '';
  const resolvedEmail = customerEmail || shippingAddress?.email || '';

  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Please select a valid payment method.' });
  }
  // The frontend only ever sends 'cod' — but never trust that from the
  // server side. Reject anything else outright while no gateway is wired up,
  // rather than letting a direct API call through to the payment simulator.
  if (paymentMethod !== 'cod' && !ONLINE_PAYMENTS_ENABLED) {
    return res.status(400).json({ error: 'Only Cash on Delivery is available at this time.' });
  }

  try {
    // A pure replay of an already-processed attempt needs neither the stock
    // lock nor a re-simulated payment — just hand back what was built last time.
    if (idempotencyKey) {
      const existingOrder = await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
      if (existingOrder.rows.length > 0) {
        const existingDb = await loadDatabase();
        const order = await buildOrderFromRow(existingOrder.rows[0], existingDb);
        return res.json({ order, alreadyProcessed: true });
      }
    }

    // Payment validation + the simulated gateway delay run BEFORE the stock
    // lock is acquired — neither touches stock or the cart, so there's no
    // reason to serialize every other concurrent checkout in the store
    // behind this ~1s artificial wait.
    const paymentResult = await buildPaymentDetails(paymentMethod, { upiId, cardNumber, bankName, walletProvider });
    if ('error' in paymentResult) {
      return res.status(paymentResult.status).json({ error: paymentResult.error });
    }
    const paymentDetails = paymentResult;

    const result = await withStockLock(async () => {
      // Re-check idempotency now that we hold the lock — guards the rare
      // case where two requests carrying the same key raced past the
      // unlocked pre-check above (the DB's UNIQUE constraint on
      // idempotency_key would also catch this on insert, but this avoids
      // surfacing that as a generic 500).
      if (idempotencyKey) {
        const existingOrder = await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
        if (existingOrder.rows.length > 0) {
          const existingDb = await loadDatabase();
          const order = await buildOrderFromRow(existingOrder.rows[0], existingDb);
          return { alreadyProcessed: true, order };
        }
      }

      const cartRes = await pool.query(
        'SELECT id, product_id, variant_id, quantity FROM cart_items WHERE user_id = $1 AND saved = false ORDER BY created_at ASC',
        [userId]
      );
      if (cartRes.rows.length === 0) {
        return { error: 'Your shopping bag is empty.', status: 400 };
      }

      const db = await loadDatabase();

      // Re-verify every line against the live product catalog (never trust cached client state).
      for (const row of cartRes.rows) {
        const product = findProduct(db.products, row.product_id);
        if (!product || product.inStock === false) {
          return { error: `${product?.name || 'An item'} in your bag is no longer available.`, status: 409 };
        }
        if (row.quantity > product.stock) {
          return {
            error: `Only ${product.stock} of ${product.name} are currently available. Please update the quantity in your bag.`,
            status: 409,
          };
        }
      }

      // All valid — compute totals from live DB prices and build order items.
      // Stock is not touched yet: COD eligibility depends on the final total,
      // computed below, and must be checked before anything is deducted.
      const orderItems: OrderItem[] = [];
      let subtotal = 0;
      for (const row of cartRes.rows) {
        const product = findProduct(db.products, row.product_id)!;
        const shade = findShade(product, row.variant_id);
        const lineTotal = product.price * row.quantity;
        subtotal += lineTotal;
        orderItems.push({
          productId: product.id,
          productName: product.name,
          productImage: product.images?.primary || '',
          shade,
          price: product.price,
          quantity: row.quantity,
        });
      }

      const { discount, appliedCouponCode } = computeCouponDiscount(db, couponCode, subtotal);

      const shipping = subtotal - discount >= 999 ? 0 : 99;
      const total = Math.max(0, subtotal - discount + shipping);

      if (paymentMethod === 'cod') {
        const codCheck = checkCodEligibility(
          db.globalSettings?.codRules,
          total,
          shippingAddress,
          orderItems.map((item) => item.productId)
        );
        if (codCheck.eligible === false) {
          console.warn('COD checkout refused:', codCheck.reason);
          return { error: 'Cash on Delivery is not available for this order.', status: 400 };
        }
      }

      // Eligibility confirmed — now safe to deduct stock.
      for (const row of cartRes.rows) {
        const idx = db.products.findIndex((p) => p.id === row.product_id);
        db.products[idx] = {
          ...db.products[idx],
          stock: db.products[idx].stock - row.quantity,
          inStock: db.products[idx].stock - row.quantity > 0,
        };
      }

      // Persist the stock deduction. loadDatabase() hands back the shared
      // in-process cache by reference, so the mutations above are already
      // visible to every other request in this process — but without this
      // write they never reach Postgres, and a restart would silently undo
      // every checkout's stock deduction while restocks (which do save)
      // stay applied, drifting stock upward over time.
      await saveDatabase(db);

      const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const orderNumber = 'GLM' + Date.now().toString().slice(-8);

      await pool.query(
        `INSERT INTO orders
          (id, user_id, order_number, status, subtotal, discount, shipping, total, shipping_address, idempotency_key, customer_name, customer_phone, customer_email, coupon_code, payment_method, payment_status, payment_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          orderId, userId, orderNumber, 'PLACED', subtotal, discount, shipping, total,
          shippingAddress ? JSON.stringify(shippingAddress) : null, idempotencyKey || null,
          resolvedName, resolvedPhone, resolvedEmail, appliedCouponCode, paymentMethod, paymentDetails.status,
          JSON.stringify(paymentDetails),
        ]
      );

      for (const item of orderItems) {
        const itemId = 'oi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        await pool.query(
          'INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, quantity, price) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [itemId, orderId, item.productId, item.shade?.id || null, item.productName, item.quantity, item.price]
        );
      }

      await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND saved = false', [userId]);

      const createdAt = new Date().toISOString();
      const order: Order = {
        id: orderId,
        orderNumber,
        createdAt,
        status: 'PLACED',
        items: orderItems,
        subtotal,
        discount,
        shipping,
        tax: 0,
        total,
        deliveryAddress: shippingAddress,
        payment: paymentDetails,
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        timeline: [
          { status: 'PLACED', timestamp: createdAt, note: placedNote, completed: true },
        ],
      };

      const whatsappUrl = buildWhatsAppOrderLink({
        adminNumber: db.globalSettings?.whatsappOrderNumber,
        orderNumber,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        customerEmail: resolvedEmail,
        address: shippingAddress,
        items: orderItems,
        subtotal,
        discount,
        shipping,
        total,
        paymentMethod: paymentMethod.toUpperCase(),
        paymentStatus: paymentDetails.status,
        createdAt: new Date(createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      });

      return { order, whatsappUrl };
    });

    if ('error' in result) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    if ('alreadyProcessed' in result) {
      return res.json({ order: result.order, alreadyProcessed: true });
    }

    // Post-order side effects — none of these are read by the response and
    // none depend on each other, so they run concurrently after the lock has
    // already been released rather than serializing every other checkout
    // behind a status-history write, two notification inserts, and two SMTP
    // round-trips. Wrapped in its own try/catch: the order is already
    // committed at this point, so a notification/email hiccup must never
    // turn into a false "Checkout failed" response for an order that
    // actually succeeded.
    try {
      const db = await loadDatabase();
      await Promise.all([
        insertOrderStatusHistory(result.order.id, 'PLACED', placedNote),
        notifyOrderStatusChange(userId, result.order.id, result.order.orderNumber, 'PLACED'),
        notifyAdminNewOrder(result.order.id, result.order.orderNumber, resolvedName, result.order.total),
        sendOrderStatusEmail({
          toEmail: resolvedEmail,
          customerName: resolvedName,
          orderId: result.order.id,
          orderNumber: result.order.orderNumber,
          status: 'PLACED',
          total: result.order.total,
        }),
        sendAdminNewOrderEmail({ toEmail: db.globalSettings?.contactEmail, orderNumber: result.order.orderNumber, customerName: resolvedName, total: result.order.total }),
      ]);
    } catch (sideEffectErr) {
      console.error('Order placed successfully, but a post-order notification/email step failed:', sideEffectErr);
    }

    res.json({ order: result.order, whatsappUrl: result.whatsappUrl });
  } catch (err) {
    console.error('Checkout failed:', err);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

// ==========================================
// ORDER HISTORY — reconstructed from the persisted orders/order_items rows,
// never from client-side sample data.
// ==========================================

router.get('/orders', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const ordersRes = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.customer!.id]);
  const orders: Order[] = await buildOrdersFromRows(ordersRes.rows, db);
  res.json({ orders });
});

router.get('/orders/:id', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const db = await loadDatabase();
  const order = await buildOrderFromRow(row, db);
  res.json({ order });
});

router.post('/orders/:id/cancel', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { reason } = req.body || {};
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });
  if (!CANCELLABLE_STATUSES.includes(row.status)) {
    return res.status(400).json({ error: `This order can no longer be cancelled (current status: ${row.status}).` });
  }

  // The status check above reads a snapshot taken before the lock is
  // acquired, so it can't be trusted alone — two concurrent cancel attempts
  // (a double-click, or a customer and admin cancelling at once) would both
  // pass it and both restock. The conditional UPDATE re-verifies the status
  // hasn't changed while serialized inside the lock; only the request that
  // actually flips it restocks, so stock is credited exactly once.
  const wasCancelled = await withStockLock(async () => {
    const updateRes = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND status = $3 RETURNING id',
      ['CANCELLED', row.id, row.status]
    );
    if (updateRes.rows.length === 0) return false;
    await restockOrderItems(row.id);
    return true;
  });
  if (!wasCancelled) {
    return res.status(409).json({ error: 'This order was already updated. Please refresh and try again.' });
  }

  // Independent writes/sends — none read each other's result, so they run
  // concurrently instead of serializing behind an SMTP round-trip.
  await Promise.all([
    insertOrderStatusHistory(row.id, 'CANCELLED', reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer'),
    notifyOrderStatusChange(req.customer!.id, row.id, row.order_number, 'CANCELLED'),
    sendOrderStatusEmail({
      toEmail: row.customer_email,
      customerName: row.customer_name,
      orderId: row.id,
      orderNumber: row.order_number,
      status: 'CANCELLED',
      total: Number(row.total),
    }),
  ]);

  const db = await loadDatabase();
  const updatedRes = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  const order = await buildOrderFromRow(updatedRes.rows[0], db);
  res.json({ order });
});

// ==========================================
// REVIEWS — one review per (product, customer); resubmitting edits it in
// place rather than creating a duplicate.
// ==========================================

router.get('/reviews', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const db = await loadDatabase();
  const result = await pool.query('SELECT * FROM reviews WHERE customer_id = $1 ORDER BY created_at DESC', [req.customer!.id]);
  const reviews = result.rows.map((row) => mapReviewRow(row, findProduct(db.products, row.product_id)?.name));
  res.json({ reviews });
});

router.post('/reviews', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId, rating, title, comment } = req.body || {};
  if (!productId || !rating || !String(comment || '').trim()) {
    return res.status(400).json({ error: 'A rating and a review comment are required.' });
  }

  const db = await loadDatabase();
  const product = findProduct(db.products, productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const numericRating = Math.max(1, Math.min(5, Math.round(Number(rating))));
  const custRes = await pool.query('SELECT name FROM customers WHERE id = $1', [req.customer!.id]);
  const customerName = custRes.rows[0]?.name || 'Glamirk Customer';
  const verified = await isVerifiedPurchase(req.customer!.id, productId);

  const id = 'rev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    `INSERT INTO reviews (id, product_id, customer_id, customer_name, rating, title, comment, is_verified_purchase)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (product_id, customer_id) DO UPDATE SET
       rating = EXCLUDED.rating, title = EXCLUDED.title, comment = EXCLUDED.comment,
       is_verified_purchase = EXCLUDED.is_verified_purchase, created_at = now()`,
    [id, productId, req.customer!.id, customerName, numericRating, title || null, String(comment).trim(), verified]
  );

  await recomputeProductRating(productId);

  const saved = await pool.query('SELECT * FROM reviews WHERE product_id = $1 AND customer_id = $2', [productId, req.customer!.id]);
  res.json({ review: mapReviewRow(saved.rows[0], product.name) });
});

// ==========================================
// RETURNS — only from DELIVERED orders; one active request per (order, product).
// ==========================================

router.get('/returns', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query(
    `SELECT r.*, o.order_number FROM return_requests r
     JOIN orders o ON o.id = r.order_id
     WHERE r.customer_id = $1 ORDER BY r.created_at DESC`,
    [req.customer!.id]
  );
  res.json({ returns: result.rows.map(mapReturnRequestRow) });
});

router.post('/orders/:orderId/returns', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { productId, reason, comment } = req.body || {};
  if (!productId || !String(reason || '').trim()) {
    return res.status(400).json({ error: 'Please select a product and a return reason.' });
  }

  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.orderId, req.customer!.id]);
  const order = orderRes.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status !== 'DELIVERED') {
    return res.status(400).json({ error: 'Returns can only be requested for delivered orders.' });
  }

  const itemRes = await pool.query('SELECT * FROM order_items WHERE order_id = $1 AND product_id = $2', [order.id, productId]);
  const item = itemRes.rows[0];
  if (!item) return res.status(404).json({ error: 'This product was not part of this order.' });

  const existing = await pool.query('SELECT id FROM return_requests WHERE order_id = $1 AND product_id = $2', [order.id, productId]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'A return request for this item has already been submitted.' });
  }

  const db = await loadDatabase();
  const product = findProduct(db.products, productId);

  const id = 'ret-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await pool.query(
    `INSERT INTO return_requests (id, order_id, customer_id, product_id, product_name, product_image, reason, comment, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUBMITTED')`,
    [id, order.id, req.customer!.id, productId, item.product_name, product?.images?.primary || '', reason, comment || null]
  );

  const created = await pool.query(
    `SELECT r.*, o.order_number FROM return_requests r JOIN orders o ON o.id = r.order_id WHERE r.id = $1`,
    [id]
  );
  res.json({ return: mapReturnRequestRow(created.rows[0]) });
});

// ==========================================
// NOTIFICATIONS
// ==========================================

router.get('/notifications', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.customer!.id]);
  res.json({ notifications: result.rows.map(mapNotificationRow) });
});

router.post('/notifications/:id/read', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.customer!.id]);
  res.json({ success: true });
});

router.post('/notifications/read-all', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.customer!.id]);
  res.json({ success: true });
});

export default router;
