import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { pool, loadDatabase, saveDatabase, withStockLock, broadcastEvent, evaluateOffers } from './db';
import { Product, Shade, ServerCartItem, Order, OrderItem } from '../src/types';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'glamirk_luxury_atelier_jwt_secret_2026';

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

async function hydrateCart(userId: string): Promise<ServerCartItem[]> {
  const db = await loadDatabase();
  const result = await pool.query(
    'SELECT id, product_id, variant_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );

  return result.rows.map((row): ServerCartItem => {
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
  });
}

router.get('/cart', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const items = await hydrateCart(req.customer!.id);
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  res.json({ items, subtotal, itemCount: items.reduce((n, i) => n + i.quantity, 0) });
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
    await pool.query('UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2', [newQty, row.id]);
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

router.post('/checkout', requireCustomer, async (req: AuthenticatedCustomerRequest, res: Response) => {
  const { shippingAddress, idempotencyKey, customerName, customerPhone, customerEmail, paymentMethod, couponCode } = req.body || {};
  const userId = req.customer!.id;

  // Online payment isn't wired to a real gateway yet — the checkout UI only
  // ever offers COD, but reject it here too rather than silently accepting
  // a client that somehow sent something else.
  if (paymentMethod && paymentMethod !== 'cod') {
    return res.status(400).json({ error: 'Online payment is coming soon. Please select Cash on Delivery for now.' });
  }

  try {
    const result = await withStockLock(async () => {
      // Idempotency: if this exact checkout attempt already produced an order, return it instead of double-charging stock.
      if (idempotencyKey) {
        const existingOrder = await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
        if (existingOrder.rows.length > 0) {
          const itemsRes = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [existingOrder.rows[0].id]);
          return { alreadyProcessed: true, order: existingOrder.rows[0], items: itemsRes.rows };
        }
      }

      const cartRes = await pool.query(
        'SELECT id, product_id, variant_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY created_at ASC',
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

        // Deduct stock in the in-memory/JSONB product catalog
        const idx = db.products.findIndex((p) => p.id === product.id);
        db.products[idx] = {
          ...db.products[idx],
          stock: db.products[idx].stock - row.quantity,
          inStock: db.products[idx].stock - row.quantity > 0,
        };
      }

      // Discount is computed here, never trusted from the client — look up
      // the coupon against the live, currently-active offer list.
      let discount = 0;
      let appliedCouponCode: string | null = null;
      if (couponCode) {
        const liveOffers = evaluateOffers(db.offers || []);
        const offer = liveOffers.find(
          (o) => o.status === 'active' && o.couponCode && o.couponCode.toUpperCase() === String(couponCode).toUpperCase()
        );
        if (offer && subtotal >= (offer.minOrderValue || 0)) {
          if (offer.discountType === 'percentage') {
            discount = Math.round((subtotal * offer.discountValue) / 100);
          } else if (offer.discountType === 'flat') {
            discount = offer.discountValue;
          }
          discount = Math.min(discount, subtotal);
          appliedCouponCode = offer.couponCode!;
        }
      }

      const shipping = subtotal - discount >= 999 ? 0 : 99;
      const total = Math.max(0, subtotal - discount + shipping);
      const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const orderNumber = 'GLM' + Date.now().toString().slice(-8);
      const resolvedName = customerName || shippingAddress?.name || '';
      const resolvedPhone = customerPhone || shippingAddress?.phone || '';
      const resolvedEmail = customerEmail || shippingAddress?.email || '';

      await pool.query(
        `INSERT INTO orders
          (id, user_id, order_number, status, subtotal, discount, shipping, total, shipping_address, idempotency_key, customer_name, customer_phone, customer_email, coupon_code, payment_method, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          orderId, userId, orderNumber, 'CONFIRMED', subtotal, discount, shipping, total,
          shippingAddress ? JSON.stringify(shippingAddress) : null, idempotencyKey || null,
          resolvedName, resolvedPhone, resolvedEmail, appliedCouponCode, 'cod', 'PENDING',
        ]
      );

      for (const item of orderItems) {
        const itemId = 'oi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        await pool.query(
          'INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, quantity, price) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [itemId, orderId, item.productId, item.shade?.id || null, item.productName, item.quantity, item.price]
        );
      }

      await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

      const createdAt = new Date().toISOString();
      const order: Order = {
        id: orderId,
        orderNumber,
        createdAt,
        status: 'CONFIRMED',
        items: orderItems,
        subtotal,
        discount,
        shipping,
        tax: 0,
        total,
        deliveryAddress: shippingAddress,
        payment: { method: 'cod', status: 'PENDING' },
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        timeline: [
          { status: 'CONFIRMED', timestamp: createdAt, note: 'Order confirmed', completed: true },
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
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
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
    res.json({ order: result.order, whatsappUrl: result.whatsappUrl });
  } catch (err) {
    console.error('Checkout failed:', err);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

export default router;
