import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v2 as cloudinary } from 'cloudinary';
import {
  loadDatabase,
  saveDatabase,
  evaluateOffers,
  broadcastEvent,
  pool,
  withStockLock,
  StoredUser,
  JWT_SECRET,
} from '../db/db';
import {
  ORDER_STATUS_SEQUENCE,
  RETURN_STATUSES,
  buildOrderFromRow,
  buildOrdersFromRows,
  insertOrderStatusHistory,
  isValidStatusTransition,
  mapReturnRequestRow,
  restockOrderItems,
} from '../services/orders.service';
import { mapReviewRow } from '../services/reviews.service';
import {
  notifyOrderStatusChange,
  notifyReturnStatusChange,
  notifyAdminOrderDelivered,
  mapNotificationRow,
} from '../services/notifications.service';
import { sendOrderStatusEmail } from '../services/email.service';
import { grantOrderPoints } from '../services/rewards.service';
import {
  createShipmentForOrder,
  cancelShipmentForOrder,
  ensureWarehousePickup,
  ensureShipmentLabel,
  recordTrackingEvents,
  refundOrderPayment,
  restoreOrderStock,
  applyShippingStatus,
  shipmentsEnabled,
} from '../services/fulfillment.service';
import { getShipmentProvider } from '../services/couriers/delhivery.service';
import {
  getProductInventory,
  getInventoryTransactions,
  getLowStockUnits,
  adjustInventory,
  ensureProductInventory,
  sqlInventoryEnabled,
} from '../services/inventory.service';
import {
  createUploadMiddleware,
  validateMediaFile,
  uploadToCloudinary,
  discardOrphanedAsset,
  respondToUploadError,
  sanitizeFilename,
  hashBuffer,
  UploadedAsset,
} from '../services/media.service';
import { env } from '../config/env';
import { requireAdmin, AuthenticatedRequest } from '../middleware/requireAdmin';
import {
  CMSAuditLog,
  CMSPage,
  CMSOffer,
  CMSCategory,
  CMSNavigationItem,
  CMSFooterConfig,
  CMSGlobalSettings,
  CMSMediaItem,
  Product,
  JournalArticle,
  SupportFaq,
  CMSBenefit,
  Look,
  OrderStatus,
  Shade,
  TryOnModelPreset,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  SHIPPING_STATUSES,
} from '@glamirk/shared/types';

const router = express.Router();

// Cloudinary configuration for durable media storage (reads CLOUDINARY_URL automatically)
cloudinary.config();

// Multer holds the upload in memory; it is streamed to Cloudinary, never
// written to local disk. The ceiling here is the VIDEO one, because multer has
// to pick a number before a single byte has been read and cannot know which
// kind of file is arriving; validateMediaFile re-applies the (smaller) image
// limit once the magic bytes have identified it. See media.service.ts.
const upload = createUploadMiddleware();

// ---------------------------------------------------------------------------
// Rollback & Cleanup Timing policy
//
// Replacing an image/video reference anywhere in this file (hero, looks,
// promo banners, shade-finder profiles, the site logo, product/shade image
// slots) NEVER deletes the asset it replaced, and never as an automatic side
// effect of saving unrelated content. A previous version of this file did
// exactly that (a `releaseReplacedMedia` helper, called from every "replace"
// endpoint) — it was removed because it violated the core safety rule below.
//
// Rollback protection takes priority over storage cleanup. A recoverable
// existing asset is never sacrificed just to keep Cloudinary tidy. Concretely:
//
//   - If an upload fails, a database write fails, the new URL/publicId is
//     invalid, or anything unexpected happens mid-replacement: the OLD asset
//     is untouched, because nothing in these handlers ever deletes it in the
//     first place — there is no cleanup step to roll back.
//   - After a successful replacement, the OLD asset simply remains a normal
//     entry in the Media Library. Nothing here schedules, times, or
//     automatically triggers its removal.
//   - The only way an asset is ever deleted is DELETE /admin/media/:id below,
//     an explicit, single-asset, admin-authenticated action that re-verifies
//     at THAT moment — not at replacement time — that nothing in the rest of
//     the document still references it, and refuses (409) if it does.
//
// Do not reintroduce automatic cleanup here. If it becomes genuinely
// necessary, it belongs in that one explicit, reviewable endpoint — never as
// an implicit consequence of an unrelated content save.
// ---------------------------------------------------------------------------

// ==========================================
// AUTHENTICATION & RBAC MIDDLEWARE
// ==========================================

// requireAdmin and AuthenticatedRequest now live in middleware/requireAdmin
// and are re-exported here so existing import sites keep working.
export { requireAdmin };
export type { AuthenticatedRequest };

// Helper: Record an audit action
async function logAudit(
  req: AuthenticatedRequest,
  action: string,
  objectType: string,
  objectId: string,
  objectTitle: string,
  details?: string
) {
  const db = await loadDatabase();
  const log: CMSAuditLog = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    userId: req.user?.id || 'system',
    userEmail: req.user?.email || 'admin',
    action,
    objectType,
    objectId,
    objectTitle,
    details,
    timestamp: new Date().toISOString(),
  };

  db.auditLogs.unshift(log);
  // Keep last 300 logs
  if (db.auditLogs.length > 300) {
    db.auditLogs = db.auditLogs.slice(0, 300);
  }
  await saveDatabase(db);
}

// ==========================================
// AUTH ROUTES
// ==========================================

router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = await loadDatabase();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const { passwordHash, ...safeUser } = user;
  res.json({
    token,
    user: safeUser,
  });
});

router.get('/auth/me', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

router.post('/auth/change-password', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 5) {
    return res.status(400).json({ error: 'New password must be at least 5 characters' });
  }

  const db = await loadDatabase();
  const userIndex = db.users.findIndex((u) => u.id === req.user?.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = db.users[userIndex];
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const salt = bcrypt.genSaltSync(10);
  db.users[userIndex].passwordHash = bcrypt.hashSync(newPassword, salt);
  await saveDatabase(db);

  await logAudit(req, 'CHANGE_PASSWORD', 'USER', user.id, user.email, 'Admin password successfully updated');
  res.json({ success: true, message: 'Password updated successfully' });
});

// ==========================================
// PUBLIC CMS CONTENT ROUTES
// ==========================================

router.get('/cms/content', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  const evaluatedOffers = evaluateOffers(db.offers);

  // Return public safe dataset
  const publicData = {
    pages: db.pages.filter((p) => p.status === 'published'),
    products: db.products.filter((p) => p.inStock !== undefined),
    categories: db.categories.filter((c) => c.isVisible),
    navigation: db.navigation.filter((n) => n.isVisible),
    footer: db.footer,
    offers: evaluatedOffers.filter((o) => o.status === 'active'),
    journalArticles: db.journalArticles,
    faqs: db.faqs.filter((f) => f.isVisible !== false),
    globalSettings: db.globalSettings,
    heroContent: db.heroContent,
    aboutContent: db.aboutContent,
    benefits: (db.benefits || [])
      .filter((b) => b.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    looks: db.looks || [],
    shadeJourney: db.shadeJourney,
    benefitsSection: db.benefitsSection,
    promoBanners: db.promoBanners || { enabled: false, banners: [], intervalMs: 4000 },
    shadeFinderTeaser: db.shadeFinderTeaser,
    // [Glamik CMS] 2026-10-03 — expose Personalized Beauty + Shop mega-menu to
    // the storefront (active-only, sorted) alongside the existing sections.
    personalizedBeauty: db.personalizedBeauty
      ? {
          ...db.personalizedBeauty,
          // Only ship active undertones to the storefront, in display order.
          undertones: (db.personalizedBeauty.undertones || [])
            .filter((u) => u.isActive !== false)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        }
      : undefined,
    shopMegaMenu: db.shopMegaMenu
      ? {
          ...db.shopMegaMenu,
          // Ship only active columns/items to the storefront, in order.
          columns: (db.shopMegaMenu.columns || [])
            .filter((c) => c.isActive !== false)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((c) => ({
              ...c,
              items: (c.items || [])
                .filter((i) => i.isActive !== false)
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
            })),
        }
      : undefined,
    journalSectionCopy: db.journalSectionCopy,
    findMyShadeResultsCopy: db.findMyShadeResultsCopy,
    findMyShadeHero: db.findMyShadeHero,
    tryOnModels: (db.tryOnModels || [])
      .filter((m) => m.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    serverTime: new Date().toISOString(),
  };

  res.json(publicData);
});

router.get('/cms/page/:slug', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  const slug = req.params.slug === 'home' || req.params.slug === '_' ? '' : req.params.slug;
  const page = db.pages.find((p) => p.slug === slug && p.status === 'published');

  if (!page) {
    return res.status(404).json({ error: 'Page not found or not published' });
  }

  res.json(page);
});

router.get('/cms/offers/active', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  const evaluatedOffers = evaluateOffers(db.offers);
  const activeOffers = evaluatedOffers.filter((o) => o.status === 'active');
  res.json({
    offers: activeOffers,
    serverTime: new Date().toISOString(),
  });
});

// --- Benefits & Optimization (public) ---
router.get('/benefits', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  const benefits = (db.benefits || [])
    .filter((b) => b.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  res.json({ benefits });
});

router.get('/benefits/:id', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  const benefit = (db.benefits || []).find((b) => b.id === req.params.id && b.isActive);
  if (!benefit) {
    return res.status(404).json({ error: 'Benefit not found' });
  }
  res.json({ benefit });
});

// --- Shop The Look (public) ---
router.get('/looks', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  res.json({ looks: db.looks || [] });
});

router.get('/looks/:id', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  const look = (db.looks || []).find((l) => l.id === req.params.id);
  if (!look) {
    return res.status(404).json({ error: 'Look not found' });
  }
  res.json({ look });
});

// ==========================================
// PROTECTED ADMIN CMS ROUTES
// ==========================================

router.get('/products/:id/reviews', async (req: Request, res: Response) => {
  const db = await loadDatabase();
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const result = await pool.query('SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC', [req.params.id]);
  const reviews = result.rows.map((row) => mapReviewRow(row, product.name));
  const count = reviews.length;
  const average = count > 0 ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : 0;
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));

  res.json({ reviews, average, count, breakdown });
});

router.get('/admin/audit-logs', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  res.json(db.auditLogs);
});

router.get('/admin/overview', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const evaluatedOffers = evaluateOffers(db.offers);

  const stats = {
    totalProducts: db.products.length,
    publishedProducts: db.products.filter((p) => p.inStock).length,
    draftProducts: db.products.filter((p) => !p.inStock).length,
    totalPages: db.pages.length,
    publishedPages: db.pages.filter((p) => p.status === 'published').length,
    draftPages: db.pages.filter((p) => p.status === 'draft').length,
    totalOffers: db.offers.length,
    activeOffers: evaluatedOffers.filter((o) => o.status === 'active').length,
    scheduledOffers: evaluatedOffers.filter((o) => o.status === 'scheduled').length,
    totalMedia: db.media.length,
    recentAuditLogs: db.auditLogs.slice(0, 15),
  };

  res.json(stats);
});

router.get('/admin/full-state', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const evaluatedOffers = evaluateOffers(db.offers);
  const { users, ...rest } = db;
  const safeUsers = users.map(({ passwordHash, ...u }) => u);

  res.json({
    ...rest,
    offers: evaluatedOffers,
    users: safeUsers,
    serverTime: new Date().toISOString(),
  });
});

// --- Order management ---
/**
 * Admin order list, filterable across all three lifecycles.
 *
 * `status` keeps its original meaning (order status) so existing admin links
 * still work; paymentStatus/shippingStatus/paymentMethod are new, independent
 * filters. Every one of them is matched against a fixed allow-list rather than
 * interpolated, and the values go in as bound parameters — a filter string is
 * query input, not SQL.
 *
 * Each filter is backed by an index added in migration 011; without them every
 * filtered page was a sequential scan of the whole orders table.
 */
router.get('/admin/orders', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: any[] = [];

  const pick = (value: unknown, allowed: readonly string[]): string | null => {
    const candidate = typeof value === 'string' ? value : '';
    return allowed.includes(candidate) ? candidate : null;
  };

  const status = pick(req.query.status, ORDER_STATUSES);
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const paymentStatus = pick(req.query.paymentStatus, PAYMENT_STATUSES);
  if (paymentStatus) {
    params.push(paymentStatus);
    conditions.push(`payment_status = $${params.length}`);
  }

  const shippingStatus = pick(req.query.shippingStatus, SHIPPING_STATUSES);
  if (shippingStatus) {
    params.push(shippingStatus);
    conditions.push(`shipping_status = $${params.length}`);
  }

  const paymentMethod = pick(req.query.paymentMethod, ['cod', 'upi', 'card', 'netbanking', 'wallet', 'online']);
  if (paymentMethod) {
    params.push(paymentMethod);
    conditions.push(`payment_method = $${params.length}`);
  }

  // Free-text lookup for support: order number, customer name, phone or email.
  const search = String(req.query.search || '').trim();
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(
      `(order_number ILIKE $${idx} OR customer_name ILIKE $${idx} OR customer_phone ILIKE $${idx} OR customer_email ILIKE $${idx})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRes, ordersRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM orders ${whereClause}`, params),
    pool.query(
      `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    ),
  ]);

  const db = await loadDatabase();
  const orders = await buildOrdersFromRows(ordersRes.rows, db);

  res.json({ orders, total: parseInt(countRes.rows[0].count, 10), page, pageSize });
});

router.get('/admin/orders/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const db = await loadDatabase();
  const order = await buildOrderFromRow(row, db);
  res.json({ order });
});

router.get('/admin/analytics/summary', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const [revenueRes, orderCountRes, pendingRes, customerCountRes, recentRes] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE status != 'CANCELLED'`),
    pool.query('SELECT COUNT(*) FROM orders'),
    pool.query(`SELECT COUNT(*) FROM orders WHERE status NOT IN ('DELIVERED', 'CANCELLED')`),
    pool.query('SELECT COUNT(*) FROM customers'),
    pool.query('SELECT order_number, customer_name, status, total, created_at FROM orders ORDER BY created_at DESC LIMIT 8'),
  ]);

  res.json({
    totalRevenue: Number(revenueRes.rows[0].revenue),
    totalOrders: parseInt(orderCountRes.rows[0].count, 10),
    pendingOrders: parseInt(pendingRes.rows[0].count, 10),
    totalCustomers: parseInt(customerCountRes.rows[0].count, 10),
    recentOrders: recentRes.rows.map((r) => ({
      orderNumber: r.order_number,
      customerName: r.customer_name,
      status: r.status,
      total: Number(r.total),
      createdAt: new Date(r.created_at).toISOString(),
    })),
  });
});

// --- Order status lifecycle ---
router.put('/admin/orders/:id/status', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { status, note } = req.body || {};
  // Every legal value, including the post-delivery outcomes and the legacy
  // spellings an older order may still be sitting on. isValidStatusTransition
  // below is what decides whether this *particular* move is allowed.
  if (!status || !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status.' });
  }

  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  if (!isValidStatusTransition(row.status, status)) {
    return res.status(400).json({ error: `Cannot move an order from ${row.status} to ${status}.` });
  }

  // row.status is a pre-lock snapshot — re-verify it atomically inside the
  // lock before restocking, so two concurrent status changes on the same
  // order (e.g. an admin double-click, or racing with the customer's own
  // cancel endpoint) can't both restock the same order.
  const updateRes = await pool.query(
    `UPDATE orders SET status = $1,
            cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN now() ELSE cancelled_at END,
            cancellation_reason = CASE WHEN $1 = 'CANCELLED' THEN COALESCE($4, 'Cancelled by store') ELSE cancellation_reason END
     WHERE id = $2 AND status = $3 RETURNING id`,
    [status, row.id, row.status, note || null]
  );
  if (updateRes.rows.length === 0) {
    return res.status(409).json({ error: 'This order was already updated. Please refresh and try again.' });
  }

  // Restocking goes through restoreOrderStock, which carries the
  // stock_restored guard — an order cancelled here and then refunded by a
  // webhook is credited back exactly once, not twice.
  if (status === 'CANCELLED' || status === 'RETURNED' || status === 'RTO') {
    await restoreOrderStock(row.id);
  }
  if (status === 'CANCELLED') {
    // Best-effort: the order is already cancelled, and a courier API hiccup
    // must not undo that.
    void cancelShipmentForOrder(row.id).catch((err) =>
      console.error(`Could not cancel shipment for order ${row.id}:`, err)
    );
  }

  // Independent writes/sends — none read each other's result, so they run
  // concurrently instead of serializing behind an SMTP round-trip.
  await Promise.all([
    insertOrderStatusHistory(row.id, status, note),
    notifyOrderStatusChange(row.user_id, row.id, row.order_number, status),
    sendOrderStatusEmail({
      toEmail: row.customer_email,
      customerName: row.customer_name,
      orderId: row.id,
      orderNumber: row.order_number,
      status,
      total: Number(row.total),
    }),
    // Glam Rewards points are credited on delivery, not on placement, so they
    // can't be farmed by placing and cancelling orders. The ledger's unique
    // (user, type, reference) constraint makes this safe to re-run.
    ...(status === 'DELIVERED'
      ? [
          notifyAdminOrderDelivered(row.id, row.order_number),
          grantOrderPoints(row.user_id, row.id, row.order_number, Number(row.total)),
        ]
      : []),
    logAudit(req, 'UPDATE_ORDER_STATUS', 'ORDER', row.id, row.order_number, `${row.status} -> ${status}`),
  ]);

  const db = await loadDatabase();
  const updatedRes = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  const order = await buildOrderFromRow(updatedRes.rows[0], db);
  res.json({ order });
});

// --- Return requests ---
// Attaches courier/AWB details to an order. Until a courier provider is
// registered in server/shipping.ts these are stored and displayed as-is (with
// the tracking screen clearly saying scans aren't live yet) rather than being
// used to fabricate movement the shipment hasn't actually made.
router.put('/admin/orders/:id/shipment', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { trackingNumber, courierPartner, courierTrackingUrl } = req.body || {};

  const orderRes = await pool.query('SELECT id, order_number FROM orders WHERE id = $1', [req.params.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const url = String(courierTrackingUrl || '').trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Tracking URL must start with http:// or https://' });
  }

  await pool.query(
    'UPDATE orders SET tracking_number = $1, courier_partner = $2, courier_tracking_url = $3 WHERE id = $4',
    [
      String(trackingNumber || '').trim() || null,
      String(courierPartner || '').trim() || null,
      url || null,
      row.id,
    ]
  );

  await logAudit(req, 'UPDATE_ORDER_SHIPMENT', 'ORDER', row.id, row.order_number, courierPartner || 'cleared');

  const db = await loadDatabase();
  const updatedRes = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  res.json({ order: await buildOrderFromRow(updatedRes.rows[0], db) });
});

// --- Courier shipments ---

/**
 * Books (or retries booking) the courier shipment for an order.
 *
 * Safe to press twice: createShipmentForOrder claims the shipments row by
 * unique index before calling the aggregator, so a double-click produces one
 * shipment and one no-op rather than two AWBs for the same parcel. A partially
 * created shipment (order made, AWB not assigned) resumes rather than starting
 * over.
 */
router.post('/admin/orders/:id/shipment/create', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const orderRes = await pool.query('SELECT id, order_number FROM orders WHERE id = $1', [req.params.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  if (!shipmentsEnabled()) {
    return res.status(503).json({
      error: 'Shipping is not enabled. Set DELHIVERY_LIVE_MODE=true with credentials to create real shipments.',
    });
  }

  const result = await createShipmentForOrder(row.id);
  if (!result.ok) {
    // The operator sees the real reason; it is already logged server-side too.
    return res.status(502).json({ error: result.error || 'Could not create the shipment.' });
  }

  await logAudit(req, 'CREATE_SHIPMENT', 'ORDER', row.id, row.order_number, 'shipment booked');

  const db = await loadDatabase();
  const updated = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  res.json({ order: await buildOrderFromRow(updated.rows[0], db) });
});

/**
 * Post-creation shipment actions, exposed so an operator can retry a step that
 * failed independently of the booking itself. Each is individually idempotent:
 * pressing one twice is a no-op, not a second van or a reissued label.
 *
 * Manifest and invoice are gone, not renamed. Delhivery has no endpoint for
 * either — they belonged to the aggregator model this replaced, and keeping
 * buttons that could only ever fail would be worse than not offering them.
 *
 * `pickup` ignores its orderId: Delhivery books collections per warehouse per
 * day, so one request covers every parcel waiting there. The signature keeps
 * the argument only so every action in this table looks the same to the route
 * below.
 */
const SHIPMENT_DOCUMENT_ACTIONS: Record<
  string,
  { run: (orderId: string) => Promise<{ ok: boolean; error?: string }>; audit: string; label: string }
> = {
  pickup: { run: () => ensureWarehousePickup(), audit: 'REQUEST_PICKUP', label: 'warehouse pickup requested' },
  label: { run: ensureShipmentLabel, audit: 'GENERATE_LABEL', label: 'shipping label generated' },
};

router.post('/admin/orders/:id/shipment/:action', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const action = SHIPMENT_DOCUMENT_ACTIONS[req.params.action];
  // Anything this does not own (create, cancel) is handed back to the router so
  // the more specific routes still match, whatever order they are declared in.
  if (!action) return next();

  const orderRes = await pool.query('SELECT id, order_number FROM orders WHERE id = $1', [req.params.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const result = await action.run(row.id);
  if (!result.ok) {
    // 502 rather than 500: the failure is upstream, and the operator-facing
    // message has already been scrubbed of anything secret-shaped.
    return res.status(502).json({ error: result.error || 'The courier did not complete this step.' });
  }

  await logAudit(req, action.audit, 'ORDER', row.id, row.order_number, action.label);

  const shipmentRes = await pool.query(
    `SELECT awb_code, courier_name, label_url, invoice_url, manifest_url,
            pickup_scheduled_at, integration_status, status
     FROM shipments WHERE order_id = $1`,
    [row.id]
  );
  res.json({ ok: true, shipment: shipmentRes.rows[0] || null });
});

/** Cancels a courier booking that has not yet been picked up. */
router.post('/admin/orders/:id/shipment/cancel', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const orderRes = await pool.query('SELECT id, order_number FROM orders WHERE id = $1', [req.params.id]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const cancelled = await cancelShipmentForOrder(row.id);
  if (!cancelled) {
    return res.status(409).json({ error: 'This shipment cannot be cancelled — it may already be in transit.' });
  }

  await logAudit(req, 'CANCEL_SHIPMENT', 'ORDER', row.id, row.order_number, 'shipment cancelled');
  const db = await loadDatabase();
  const updated = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  res.json({ order: await buildOrderFromRow(updated.rows[0], db) });
});

/** Pulls the latest courier scan on demand, rather than waiting for a webhook. */
router.get('/admin/orders/:id/shipment/track', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const shipmentRes = await pool.query(
    'SELECT id, awb_code, waybill, provider_order_id FROM shipments WHERE order_id = $1',
    [req.params.id]
  );
  // `waybill` is Delhivery's; `awb_code` still carries it too, and carries
  // the retired provider's on historical rows. Reading both keeps an old shipment
  // trackable through whichever provider is registered for its courier.
  const waybill = shipmentRes.rows[0]?.waybill || shipmentRes.rows[0]?.awb_code;
  if (!waybill) return res.status(404).json({ error: 'This order has no tracking number yet.' });

  const provider = getShipmentProvider();
  const tracking = await provider.track(waybill, shipmentRes.rows[0]?.provider_order_id || undefined);
  if (!tracking.ok || !tracking.value) {
    return res.status(502).json({ error: tracking.error || 'Could not reach the courier.' });
  }

  // Polled scans go through the same idempotent writer as webhook scans and
  // under the same dedupe key, so pressing "track" on a parcel whose webhooks
  // already arrived adds nothing rather than duplicating its whole history.
  await recordTrackingEvents({
    orderId: req.params.id,
    shipmentRowId: shipmentRes.rows[0].id,
    awb: waybill,
    scans: tracking.value.scans || [],
    source: 'tracking_api',
    providerStatus: tracking.value.providerStatus,
    mappedStatus: tracking.value.status,
  });

  // A manual check also reconciles, so pressing "track" fixes an order whose
  // webhook was missed. An unrecognised provider status maps to null, and that
  // must not move the order — it is recorded above and nothing more.
  if (tracking.value.status) {
    await applyShippingStatus({
      orderId: req.params.id,
      status: tracking.value.status,
      awbCode: waybill,
      courierName: tracking.value.courierName,
      deliveredAt: tracking.value.deliveredAt,
    });
  }

  res.json({ awb: waybill, waybill, providerStatus: tracking.value.providerStatus, status: tracking.value.status, events: tracking.value.events, courierName: tracking.value.courierName });
});

// --- Refunds ---

/**
 * Refunds a prepaid order back to the instrument it was paid with.
 *
 * The amount is clamped server-side to what is actually refundable, so an
 * over-stated amount in the request body cannot send a customer more than they
 * paid.
 */
router.post('/admin/orders/:id/refund', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { amount, reason } = req.body || {};

  const orderRes = await pool.query('SELECT id, order_number, amount_paid, amount_refunded FROM orders WHERE id = $1', [
    req.params.id,
  ]);
  const row = orderRes.rows[0];
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const refundable = Math.max(0, Number(row.amount_paid) - Number(row.amount_refunded));
  const requested = Number(amount) > 0 ? Number(amount) : refundable;
  if (requested <= 0) return res.status(400).json({ error: 'There is nothing left to refund on this order.' });

  const result = await refundOrderPayment(row.id, requested, String(reason || 'Refunded by store'));
  if (!result.ok) return res.status(400).json({ error: result.error || 'Refund failed.' });

  await logAudit(req, 'REFUND_ORDER', 'ORDER', row.id, row.order_number, `₹${Math.min(requested, refundable)}`);

  const db = await loadDatabase();
  const updated = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  res.json({ order: await buildOrderFromRow(updated.rows[0], db) });
});

/** Full payment history for one order, for support to answer "was I charged?" */
router.get('/admin/orders/:id/payments', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC', [
    req.params.id,
  ]);
  res.json({
    payments: result.rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      provider: row.provider,
      providerOrderId: row.provider_order_id || undefined,
      providerPaymentId: row.provider_payment_id || undefined,
      amount: Number(row.amount_minor) / 100,
      currency: row.currency,
      status: row.status,
      method: row.method || undefined,
      errorCode: row.error_code || undefined,
      errorDescription: row.error_description || undefined,
      refundedAmount: Number(row.refunded_minor) / 100,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  });
});

// ==========================================
// INVENTORY
//
// Every route here is behind requireAdmin — the same gate as the rest of this
// router, which is what keeps stock correction an admin-only capability. No
// customer-facing endpoint can reach any of it.
// ==========================================

/**
 * Which system owns stock right now.
 *
 * The product editor needs this before it renders: under SQL mode its stock
 * inputs cannot safely write (they would overwrite counters tied to live
 * orders), so they must be shown read-only rather than left looking editable.
 */
router.get('/admin/inventory-mode', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ sqlMode: sqlInventoryEnabled(), mirroringLegacy: env.inventory.mirrorLegacy });
});

/** Current counters for one product, across every stock-bearing level. */
router.get('/admin/inventory/:productId', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const units = await getProductInventory(req.params.productId);
  res.json({ productId: req.params.productId, units, sqlMode: sqlInventoryEnabled() });
});

/** Movement history, newest first — the audit trail behind a disputed count. */
router.get('/admin/inventory/:productId/transactions', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
  res.json({ transactions: await getInventoryTransactions(req.params.productId, limit) });
});

/** Everything at or below its low-stock threshold. */
router.get('/admin/inventory-alerts/low-stock', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ units: await getLowStockUnits() });
});

/**
 * Stocktake correction.
 *
 * Sets an absolute available count. Quantities are validated as non-negative
 * whole numbers before anything is locked, and the adjustment is written with
 * the acting admin's id so a correction is always attributable.
 */
router.put('/admin/inventory/:productId', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { variantId, sizeLabel, availableStock, lowStockThreshold, reason } = req.body || {};

  if (!Number.isInteger(availableStock) || availableStock < 0) {
    return res.status(400).json({ error: 'Available stock must be a whole number of zero or more.' });
  }
  if (lowStockThreshold !== undefined && (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0)) {
    return res.status(400).json({ error: 'Low stock threshold must be a whole number of zero or more.' });
  }

  const result = await adjustInventory({
    productId: req.params.productId,
    variantId: variantId || null,
    sizeLabel: sizeLabel || null,
    availableStock,
    lowStockThreshold,
    actor: req.user?.id || 'admin',
    reason: String(reason || 'Manual stock adjustment').slice(0, 300),
  });
  if (!result.ok) return res.status(400).json({ error: result.error || 'Could not adjust inventory.' });

  await logAudit(
    req,
    'ADJUST_INVENTORY',
    'PRODUCT',
    req.params.productId,
    req.params.productId,
    `${variantId || '-'}/${sizeLabel || '-'} -> ${availableStock}`
  );
  res.json({ units: await getProductInventory(req.params.productId) });
});

/**
 * Legacy-vs-SQL comparison, straight from the database view.
 *
 * This is the gate on switching INVENTORY_SQL_MODE on: until every unit
 * reports MATCH, the two systems disagree and the flag must stay off.
 */
router.get('/admin/inventory-migration/verify', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const [summary, mismatches] = await Promise.all([
    pool.query('SELECT verdict, COUNT(*)::int AS count FROM inventory_migration_check GROUP BY verdict'),
    pool.query(`SELECT * FROM inventory_migration_check WHERE verdict <> 'MATCH' ORDER BY product_id LIMIT 200`),
  ]);

  const counts: Record<string, number> = {};
  for (const row of summary.rows) counts[row.verdict] = row.count;

  res.json({
    sqlMode: sqlInventoryEnabled(),
    mirroringLegacy: env.inventory.mirrorLegacy,
    summary: counts,
    // Only the rows that disagree; a clean run returns an empty array.
    mismatches: mismatches.rows,
    safeToSwitch: (counts.MISMATCH || 0) === 0 && (counts.MISSING_IN_SQL || 0) === 0,
  });
});

router.get('/admin/returns', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const result = await pool.query(
    `SELECT r.*, o.order_number FROM return_requests r
     JOIN orders o ON o.id = r.order_id
     ORDER BY r.created_at DESC`
  );
  res.json({ returns: result.rows.map(mapReturnRequestRow) });
});

router.put('/admin/returns/:id/status', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body || {};
  if (!status || !RETURN_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid return status.' });
  }

  const result = await pool.query('UPDATE return_requests SET status = $1, updated_at = now() WHERE id = $2 RETURNING id', [status, req.params.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Return request not found.' });
  }

  await logAudit(req, 'UPDATE_RETURN_STATUS', 'RETURN', req.params.id, req.params.id, `-> ${status}`);

  const updated = await pool.query(
    `SELECT r.*, o.order_number FROM return_requests r JOIN orders o ON o.id = r.order_id WHERE r.id = $1`,
    [req.params.id]
  );
  const updatedRow = updated.rows[0];
  await notifyReturnStatusChange(updatedRow.customer_id, updatedRow.order_id, updatedRow.order_number, status);
  res.json({ return: mapReturnRequestRow(updatedRow) });
});

// --- Admin (store-side) notifications ---
router.get('/admin/notifications', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const result = await pool.query('SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 50');
  res.json({ notifications: result.rows.map(mapNotificationRow) });
});

router.post('/admin/notifications/:id/read', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  await pool.query('UPDATE admin_notifications SET is_read = true WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

router.post('/admin/notifications/read-all', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  await pool.query('UPDATE admin_notifications SET is_read = true WHERE is_read = false');
  res.json({ success: true });
});

// --- Pages Management ---
router.post('/admin/pages', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newPage: CMSPage = {
    ...req.body,
    id: req.body.id || 'page-' + Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.pages.push(newPage);
  await saveDatabase(db);
  await logAudit(req, 'CREATE_PAGE', 'PAGE', newPage.id, newPage.title);
  broadcastEvent('CMS_UPDATE', 'pages', newPage);

  res.json(newPage);
});

router.put('/admin/pages/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = db.pages.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Page not found' });
  }

  db.pages[idx] = {
    ...db.pages[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_PAGE', 'PAGE', db.pages[idx].id, db.pages[idx].title);
  broadcastEvent('CMS_UPDATE', 'pages', db.pages[idx]);

  res.json(db.pages[idx]);
});

router.delete('/admin/pages/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const page = db.pages.find((p) => p.id === req.params.id);
  if (!page) {
    return res.status(404).json({ error: 'Page not found' });
  }
  if (page.isSystemPage) {
    return res.status(400).json({ error: 'Cannot delete system core homepage' });
  }

  db.pages = db.pages.filter((p) => p.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_PAGE', 'PAGE', page.id, page.title);
  broadcastEvent('CMS_UPDATE', 'pages', { deletedId: page.id });

  res.json({ success: true, id: req.params.id });
});

// --- Products Management ---

// Server-side re-check of the same rules the admin UI already enforces —
// never trust that a request actually came from that UI.
function validateProduct(product: Partial<Product>): string | null {
  if (!product.name || !product.name.trim()) return 'Product name is required.';
  if (typeof product.price !== 'number' || isNaN(product.price) || product.price < 0) {
    return 'Product price must be a non-negative number.';
  }
  if (product.stock !== undefined && (typeof product.stock !== 'number' || isNaN(product.stock) || product.stock < 0)) {
    return 'Product stock must be a non-negative number.';
  }
  const shades = product.shades || [];
  const skus: string[] = [];
  for (const shade of shades) {
    if (!shade.name || !shade.name.trim()) return 'Every variant needs a name.';
    if (shade.price !== undefined && (typeof shade.price !== 'number' || isNaN(shade.price) || shade.price < 0)) {
      return `Variant "${shade.name}" has an invalid price.`;
    }
    if (shade.stock !== undefined && (typeof shade.stock !== 'number' || isNaN(shade.stock) || shade.stock < 0)) {
      return `Variant "${shade.name}" has an invalid stock quantity.`;
    }
    if (shade.sku && shade.sku.trim()) skus.push(shade.sku.trim());
    if (shade.sizes && shade.sizes.length > 0) {
      const sizeLabels: string[] = [];
      for (const sz of shade.sizes) {
        if (!sz.label || !sz.label.trim()) return `A size on variant "${shade.name}" needs a label.`;
        if (typeof sz.price !== 'number' || isNaN(sz.price) || sz.price < 0) {
          return `Size "${sz.label}" on variant "${shade.name}" has an invalid price.`;
        }
        if (sz.stock !== undefined && (typeof sz.stock !== 'number' || isNaN(sz.stock) || sz.stock < 0)) {
          return `Size "${sz.label}" on variant "${shade.name}" has an invalid stock quantity.`;
        }
        sizeLabels.push(sz.label.trim());
      }
      if (new Set(sizeLabels).size !== sizeLabels.length) {
        return `Variant "${shade.name}" has duplicate size labels.`;
      }
    }
  }
  if (new Set(skus).size !== skus.length) {
    return 'Variant SKUs must be unique within a product.';
  }
  if (product.sizePricing) {
    for (const [label, entry] of Object.entries(product.sizePricing)) {
      if (typeof entry.price !== 'number' || isNaN(entry.price) || entry.price < 0) {
        return `Size "${label}" has an invalid price.`;
      }
      if (entry.stock !== undefined && (typeof entry.stock !== 'number' || isNaN(entry.stock) || entry.stock < 0)) {
        return `Size "${label}" has an invalid stock quantity.`;
      }
    }
  }
  if ((product.benefits || []).some((b) => !b || !b.trim())) {
    return 'Benefit text cannot be empty.';
  }
  for (const attr of product.attributes || []) {
    if (!attr.name || !attr.name.trim() || !attr.value || !attr.value.trim()) {
      return 'Every attribute needs both a name and a value.';
    }
  }
  for (const step of product.usageSteps || []) {
    if (!step.text || !step.text.trim()) return 'Every How-to-Use step needs instruction text.';
  }
  if ((product.ingredients || []).some((i) => !i || !i.trim())) {
    return 'Ingredient entries cannot be empty.';
  }
  return null;
}

router.post('/admin/products', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const validationError = validateProduct(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const db = await loadDatabase();
  const newProduct: Product = {
    ...req.body,
    id: req.body.id || 'prod-' + Date.now(),
  };

  db.products.push(newProduct);
  await saveDatabase(db);
  // Provision the SQL inventory rows this product needs. Without it a product
  // created after migration 012 would be unsellable the moment SQL inventory
  // became authoritative.
  await ensureProductInventory(newProduct as any);
  await logAudit(req, 'CREATE_PRODUCT', 'PRODUCT', newProduct.id, newProduct.name);
  broadcastEvent('CMS_UPDATE', 'products', newProduct);

  res.json(newProduct);
});

router.put('/admin/products/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = db.products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const merged = { ...db.products[idx], ...req.body };
  const validationError = validateProduct(merged);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  db.products[idx] = merged;

  await saveDatabase(db);
  // An edit can introduce a new shade or size that defines its own stock, so
  // the same provisioning runs here. Existing rows are never overwritten —
  // stock corrections go through PUT /admin/inventory/:productId, which locks
  // the row and records who changed it.
  await ensureProductInventory(db.products[idx] as any);
  await logAudit(req, 'UPDATE_PRODUCT', 'PRODUCT', db.products[idx].id, db.products[idx].name);
  broadcastEvent('CMS_UPDATE', 'products', db.products[idx]);

  res.json(db.products[idx]);
});

router.post('/admin/products/duplicate/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const original = db.products.find((p) => p.id === req.params.id);
  if (!original) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const cloneSuffix = Date.now();
  const clonedShades: Shade[] = (JSON.parse(JSON.stringify(original.shades || [])) as Shade[]).map((shade, i) => ({
    ...shade,
    id: `shade-${cloneSuffix}-${i}`,
    sku: undefined, // a cloned SKU would collide with the original — admin must assign a new one
    images: (shade.images || []).map((img, j) => ({ ...img, id: `vimg-${cloneSuffix}-${i}-${j}` })),
  }));

  const duplicated: Product = {
    ...JSON.parse(JSON.stringify(original)),
    id: original.id + '-copy-' + cloneSuffix,
    name: `${original.name} (Copy)`,
    shades: clonedShades,
  };

  db.products.push(duplicated);
  await saveDatabase(db);
  // The clone is a new product with its own id, so it needs its own inventory
  // rows exactly as a created one does. This was missing, and the omission is
  // invisible until something compares the two stores: the duplicate carried
  // the original's stock in the legacy document while SQL had no row for it at
  // all, so inventory:verify reported MISSING_IN_SQL and the catalogue totals
  // drifted apart by the clone's stock.
  //
  // Idempotent — ensureProductInventory inserts ON CONFLICT DO NOTHING, so a
  // retried duplicate neither creates a second row nor resets stock on one
  // that already exists.
  await ensureProductInventory(duplicated as any);
  await logAudit(req, 'DUPLICATE_PRODUCT', 'PRODUCT', duplicated.id, duplicated.name);
  broadcastEvent('CMS_UPDATE', 'products', duplicated);

  res.json(duplicated);
});

router.delete('/admin/products/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const prod = db.products.find((p) => p.id === req.params.id);
  if (!prod) {
    return res.status(404).json({ error: 'Product not found' });
  }

  db.products = db.products.filter((p) => p.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_PRODUCT', 'PRODUCT', prod.id, prod.name);
  broadcastEvent('CMS_UPDATE', 'products', { deletedId: prod.id });

  res.json({ success: true, id: req.params.id });
});

// --- Categories Management ---
router.post('/admin/categories', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newCategory: CMSCategory = {
    ...req.body,
    id: req.body.id || 'cat-' + Date.now(),
  };

  db.categories.push(newCategory);
  await saveDatabase(db);
  await logAudit(req, 'CREATE_CATEGORY', 'CATEGORY', newCategory.id, newCategory.name);
  broadcastEvent('CMS_UPDATE', 'categories', newCategory);

  res.json(newCategory);
});

router.put('/admin/categories/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = db.categories.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }

  db.categories[idx] = { ...db.categories[idx], ...req.body };
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_CATEGORY', 'CATEGORY', db.categories[idx].id, db.categories[idx].name);
  broadcastEvent('CMS_UPDATE', 'categories', db.categories[idx]);

  res.json(db.categories[idx]);
});

router.delete('/admin/categories/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const cat = db.categories.find((c) => c.id === req.params.id);
  if (!cat) {
    return res.status(404).json({ error: 'Category not found' });
  }

  db.categories = db.categories.filter((c) => c.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_CATEGORY', 'CATEGORY', cat.id, cat.name);
  broadcastEvent('CMS_UPDATE', 'categories', { deletedId: cat.id });

  res.json({ success: true, id: req.params.id });
});

// --- Offers Management ---
router.post('/admin/offers', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newOffer: CMSOffer = {
    ...req.body,
    id: req.body.id || 'off-' + Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.offers.push(newOffer);
  await saveDatabase(db);
  await logAudit(req, 'CREATE_OFFER', 'OFFER', newOffer.id, newOffer.name);
  broadcastEvent('CMS_UPDATE', 'offers', newOffer);

  res.json(newOffer);
});

router.put('/admin/offers/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = db.offers.findIndex((o) => o.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Offer not found' });
  }

  db.offers[idx] = {
    ...db.offers[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_OFFER', 'OFFER', db.offers[idx].id, db.offers[idx].name);
  broadcastEvent('CMS_UPDATE', 'offers', db.offers[idx]);

  res.json(db.offers[idx]);
});

router.delete('/admin/offers/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const off = db.offers.find((o) => o.id === req.params.id);
  if (!off) {
    return res.status(404).json({ error: 'Offer not found' });
  }

  db.offers = db.offers.filter((o) => o.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_OFFER', 'OFFER', off.id, off.name);
  broadcastEvent('CMS_UPDATE', 'offers', { deletedId: off.id });

  res.json({ success: true, id: req.params.id });
});

// --- Benefits & Optimization Management ---
router.post('/admin/benefits', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { title, description, icon, imageUrl, imagePublicId, displayOrder, isActive } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'Description is required.' });
  }

  const db = await loadDatabase();
  const newBenefit: CMSBenefit = {
    id: 'ben-' + Date.now(),
    title,
    description,
    icon: icon || 'Sparkles',
    imageUrl: imageUrl || undefined,
    imagePublicId: imagePublicId || undefined,
    displayOrder: typeof displayOrder === 'number' ? displayOrder : (db.benefits || []).length + 1,
    isActive: isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.benefits = [...(db.benefits || []), newBenefit];
  await saveDatabase(db);
  await logAudit(req, 'CREATE_BENEFIT', 'BENEFIT', newBenefit.id, newBenefit.title);
  broadcastEvent('CMS_UPDATE', 'benefits', newBenefit);

  res.json(newBenefit);
});

router.put('/admin/benefits/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = (db.benefits || []).findIndex((b) => b.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Benefit not found' });
  }

  const { title, description } = req.body || {};
  if (title !== undefined && !String(title).trim()) {
    return res.status(400).json({ error: 'Title cannot be empty.' });
  }
  if (description !== undefined && !String(description).trim()) {
    return res.status(400).json({ error: 'Description cannot be empty.' });
  }

  db.benefits[idx] = {
    ...db.benefits[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_BENEFIT', 'BENEFIT', db.benefits[idx].id, db.benefits[idx].title);
  broadcastEvent('CMS_UPDATE', 'benefits', db.benefits[idx]);

  res.json(db.benefits[idx]);
});

router.delete('/admin/benefits/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const benefit = (db.benefits || []).find((b) => b.id === req.params.id);
  if (!benefit) {
    return res.status(404).json({ error: 'Benefit not found' });
  }

  db.benefits = db.benefits.filter((b) => b.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_BENEFIT', 'BENEFIT', benefit.id, benefit.title);
  broadcastEvent('CMS_UPDATE', 'benefits', { deletedId: benefit.id });

  res.json({ success: true, id: req.params.id });
});

// --- Virtual Try-On Standard Models ---
router.post('/admin/try-on-models', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, skinTone, undertone, image, description, isActive, sortOrder } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Model name is required.' });
  }
  if (!image || !String(image).trim()) {
    return res.status(400).json({ error: 'A model image is required.' });
  }

  const db = await loadDatabase();
  const newModel: TryOnModelPreset = {
    id: 'tryon-model-' + Date.now(),
    name,
    skinTone: skinTone || 'Medium',
    undertone: undertone || 'Warm',
    image,
    description: description || undefined,
    isActive: isActive !== false,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : (db.tryOnModels || []).length,
  };

  db.tryOnModels = [...(db.tryOnModels || []), newModel];
  await saveDatabase(db);
  await logAudit(req, 'CREATE_TRY_ON_MODEL', 'TRY_ON_MODEL', newModel.id, newModel.name);
  broadcastEvent('CMS_UPDATE', 'tryOnModels', newModel);

  res.json(newModel);
});

router.put('/admin/try-on-models/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = (db.tryOnModels || []).findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Try-On model not found' });
  }

  const { name, image } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'Model name cannot be empty.' });
  }
  if (image !== undefined && !String(image).trim()) {
    return res.status(400).json({ error: 'Model image cannot be empty.' });
  }

  db.tryOnModels[idx] = { ...db.tryOnModels[idx], ...req.body };
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_TRY_ON_MODEL', 'TRY_ON_MODEL', db.tryOnModels[idx].id, db.tryOnModels[idx].name);
  broadcastEvent('CMS_UPDATE', 'tryOnModels', db.tryOnModels[idx]);

  res.json(db.tryOnModels[idx]);
});

router.delete('/admin/try-on-models/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const model = (db.tryOnModels || []).find((m) => m.id === req.params.id);
  if (!model) {
    return res.status(404).json({ error: 'Try-On model not found' });
  }

  db.tryOnModels = db.tryOnModels.filter((m) => m.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_TRY_ON_MODEL', 'TRY_ON_MODEL', model.id, model.name);
  broadcastEvent('CMS_UPDATE', 'tryOnModels', { deletedId: model.id });

  res.json({ success: true, id: req.params.id });
});

// --- Shop The Look Management ---
router.post('/admin/looks', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { title, tagline, description, image, video, category, productsUsed } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!image || !String(image).trim()) {
    return res.status(400).json({ error: 'Image is required.' });
  }

  const db = await loadDatabase();
  const newLook: Look = {
    id: 'look-' + Date.now(),
    title,
    tagline: tagline || '',
    description: description || '',
    image,
    video: video || undefined,
    category: category || 'EVERYDAY GLAM',
    productsUsed: Array.isArray(productsUsed) ? productsUsed : [],
  };

  db.looks = [...(db.looks || []), newLook];
  await saveDatabase(db);
  await logAudit(req, 'CREATE_LOOK', 'LOOK', newLook.id, newLook.title);
  broadcastEvent('CMS_UPDATE', 'looks', newLook);

  res.json(newLook);
});

router.put('/admin/looks/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = (db.looks || []).findIndex((l) => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Look not found' });
  }

  const { title } = req.body || {};
  if (title !== undefined && !String(title).trim()) {
    return res.status(400).json({ error: 'Title cannot be empty.' });
  }
  // Image is intentionally NOT required on update, unlike creation — an admin
  // clearing a placeholder pending a real upload is the same "blank until
  // uploaded" state every other image field (products, categories, offers)
  // already allows. Requiring one here just for Looks was the odd one out.

  // The previous image/video (if replaced) is deliberately left alone here —
  // see the "Rollback & Cleanup Timing" policy at the top of this file. It
  // stays a normal, deletable Media Library entry until an admin explicitly
  // removes it via DELETE /admin/media/:id, which re-verifies at that point
  // that nothing still points at it.
  db.looks[idx] = { ...db.looks[idx], ...req.body };

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_LOOK', 'LOOK', db.looks[idx].id, db.looks[idx].title);
  broadcastEvent('CMS_UPDATE', 'looks', db.looks[idx]);

  res.json(db.looks[idx]);
});

router.delete('/admin/looks/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const look = (db.looks || []).find((l) => l.id === req.params.id);
  if (!look) {
    return res.status(404).json({ error: 'Look not found' });
  }

  // Deleting the Look does not touch its image/video asset — same rollback
  // policy as replacement. It remains in the Media Library for explicit
  // admin cleanup.
  db.looks = db.looks.filter((l) => l.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_LOOK', 'LOOK', look.id, look.title);
  broadcastEvent('CMS_UPDATE', 'looks', { deletedId: look.id });

  res.json({ success: true, id: req.params.id });
});

// --- Navigation & Footer ---
router.put('/admin/navigation', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.navigation = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_NAVIGATION', 'NAVIGATION', 'nav-main', 'Header Navigation Updated');
  broadcastEvent('CMS_UPDATE', 'navigation', db.navigation);

  res.json(db.navigation);
});

router.put('/admin/footer', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.footer = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_FOOTER', 'FOOTER', 'footer-main', 'Footer Configuration Updated');
  broadcastEvent('CMS_UPDATE', 'footer', db.footer);

  res.json(db.footer);
});

// --- Homepage Hero Content ---
router.put('/admin/hero', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newHero = req.body;

  // Replaced images/slides/backgrounds are deliberately left alone — see the
  // "Rollback & Cleanup Timing" policy at the top of this file. Nothing here
  // is deleted as a side effect of saving new content; an old asset only
  // ever goes away through an explicit DELETE /admin/media/:id, which
  // re-verifies at that later point that nothing still references it.
  db.heroContent = newHero;

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_HERO', 'HERO', 'hero-main', 'Homepage Hero Content Updated');
  broadcastEvent('CMS_UPDATE', 'heroContent', db.heroContent);

  res.json(db.heroContent);
});

// --- Homepage Promotional Banner Popup ---
router.put('/admin/promo-banners', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newConfig = req.body;

  // Replaced/removed banner images are left alone — see the "Rollback &
  // Cleanup Timing" policy at the top of this file.
  db.promoBanners = newConfig;

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_PROMO_BANNERS', 'PROMO_BANNERS', 'promo-banners-main', 'Promotional Banner Popup Updated');
  broadcastEvent('CMS_UPDATE', 'promoBanners', db.promoBanners);

  res.json(db.promoBanners);
});

// --- Homepage Shade Intelligence Teaser ---
// [Glamik CMS] 2026-10-03 — admin-only save for the homepage Personalized Beauty section.
router.put('/admin/personalized-beauty', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const incoming = req.body;

  // Basic server-side validation — never trust the frontend-only admin check.
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.undertones)) {
    return res.status(400).json({ error: 'Invalid Personalized Beauty payload' });
  }
  for (const u of incoming.undertones) {
    if (!u.id || !u.name) {
      return res.status(400).json({ error: 'Each undertone needs an id and a name' });
    }
    for (const card of [u.lipShade, u.pairing]) {
      if (card && card.mediaType && card.mediaType !== 'image' && card.mediaType !== 'video') {
        return res.status(400).json({ error: 'mediaType must be "image" or "video"' });
      }
    }
  }

  db.personalizedBeauty = incoming;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_PERSONALIZED_BEAUTY', 'PERSONALIZED_BEAUTY', 'personalized-beauty-main', 'Homepage Personalized Beauty Section Updated');
  broadcastEvent('CMS_UPDATE', 'personalizedBeauty', db.personalizedBeauty);

  res.json(db.personalizedBeauty);
});

// [Glamik CMS] 2026-10-03 — admin-only save for the header Shop mega-menu.
router.put('/admin/shop-mega-menu', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const incoming = req.body;

  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.columns) || !incoming.promo) {
    return res.status(400).json({ error: 'Invalid Shop mega-menu payload' });
  }
  for (const col of incoming.columns) {
    if (!col.id || !col.title) {
      return res.status(400).json({ error: 'Each column needs an id and a title' });
    }
    if (!Array.isArray(col.items)) {
      return res.status(400).json({ error: 'Each column needs an items array' });
    }
  }
  if (incoming.promo.mediaType && incoming.promo.mediaType !== 'image' && incoming.promo.mediaType !== 'video') {
    return res.status(400).json({ error: 'promo.mediaType must be "image" or "video"' });
  }

  db.shopMegaMenu = incoming;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_SHOP_MEGA_MENU', 'SHOP_MEGA_MENU', 'shop-mega-menu-main', 'Header Shop Mega-Menu Updated');
  broadcastEvent('CMS_UPDATE', 'shopMegaMenu', db.shopMegaMenu);

  res.json(db.shopMegaMenu);
});

router.put('/admin/shade-finder-teaser', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newTeaser = req.body;

  // Replaced profile visuals are left alone — see the "Rollback & Cleanup
  // Timing" policy at the top of this file.
  db.shadeFinderTeaser = newTeaser;

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_SHADE_FINDER_TEASER', 'SHADE_FINDER_TEASER', 'shade-finder-teaser-main', 'Homepage Shade Intelligence Teaser Updated');
  broadcastEvent('CMS_UPDATE', 'shadeFinderTeaser', db.shadeFinderTeaser);

  res.json(db.shadeFinderTeaser);
});

// --- Homepage "The Glamirk Journal" Section Heading ---
router.put('/admin/journal-section-copy', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.journalSectionCopy = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_JOURNAL_SECTION_COPY', 'JOURNAL_SECTION_COPY', 'journal-section-copy-main', 'Homepage Journal Section Heading Updated');
  broadcastEvent('CMS_UPDATE', 'journalSectionCopy', db.journalSectionCopy);

  res.json(db.journalSectionCopy);
});

// --- Find My Shade Quiz Results Headings ---
router.put('/admin/find-my-shade-results-copy', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.findMyShadeResultsCopy = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_FIND_MY_SHADE_RESULTS_COPY', 'FIND_MY_SHADE_RESULTS_COPY', 'find-my-shade-results-copy-main', 'Find My Shade Results Headings Updated');
  broadcastEvent('CMS_UPDATE', 'findMyShadeResultsCopy', db.findMyShadeResultsCopy);

  res.json(db.findMyShadeResultsCopy);
});

// --- About Page Content ---
router.put('/admin/about', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.aboutContent = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_ABOUT', 'ABOUT', 'about-main', 'About Page Content Updated');
  broadcastEvent('CMS_UPDATE', 'aboutContent', db.aboutContent);

  res.json(db.aboutContent);
});

// --- Find My Shade Journey ---
router.put('/admin/shade-journey', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.shadeJourney = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_SHADE_JOURNEY', 'SHADE_JOURNEY', 'shade-journey-main', 'Find My Shade Journey Updated');
  broadcastEvent('CMS_UPDATE', 'shadeJourney', db.shadeJourney);

  res.json(db.shadeJourney);
});

// --- Find My Shade Landing Hero (badge/heading/description/photo) ---
router.put('/admin/find-my-shade-hero', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.findMyShadeHero = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_FIND_MY_SHADE_HERO', 'FIND_MY_SHADE_HERO', 'find-my-shade-hero-main', 'Find My Shade Landing Hero Updated');
  broadcastEvent('CMS_UPDATE', 'findMyShadeHero', db.findMyShadeHero);

  res.json(db.findMyShadeHero);
});

// --- Homepage Benefits Section Heading ---
router.put('/admin/benefits-section', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  db.benefitsSection = req.body;
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_BENEFITS_SECTION', 'BENEFITS_SECTION', 'benefits-section-main', 'Homepage Benefits Section Heading Updated');
  broadcastEvent('CMS_UPDATE', 'benefitsSection', db.benefitsSection);

  res.json(db.benefitsSection);
});

// --- Journal / Blog CMS ---
// Only one article should ever read as the storefront's featured hero
// story — the frontend just takes `articles.find(a => a.isHero)`, so if
// two articles both carried isHero:true the "first in array order" would
// win silently and the admin would have no idea why picking a new hero
// didn't visibly change anything. Enforced here (not just in the admin
// UI) so it holds regardless of which client made the request.
function enforceSingleHero(articles: JournalArticle[], newHeroId: string): JournalArticle[] {
  return articles.map((a) => (a.id === newHeroId ? a : a.isHero ? { ...a, isHero: false } : a));
}

function validateArticle(article: Partial<JournalArticle>): string | null {
  if (!article.title || !article.title.trim()) return 'Article title is required.';
  if (article.slug && !/^[a-z0-9-]+$/.test(article.slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens.';
  }
  return null;
}

router.post('/admin/articles', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const validationError = validateArticle(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const db = await loadDatabase();
  const newArticle: JournalArticle = {
    ...req.body,
    id: req.body.id || req.body.slug || 'art-' + Date.now(),
  };
  if (req.body.slug && db.journalArticles.some((a) => a.slug === req.body.slug)) {
    return res.status(400).json({ error: 'An article with this slug already exists.' });
  }

  db.journalArticles = newArticle.isHero ? enforceSingleHero(db.journalArticles, newArticle.id) : db.journalArticles;
  db.journalArticles.push(newArticle);
  await saveDatabase(db);
  await logAudit(req, 'CREATE_ARTICLE', 'ARTICLE', newArticle.id, newArticle.title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', newArticle);

  res.json(newArticle);
});

router.put('/admin/articles/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const validationError = validateArticle(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const db = await loadDatabase();
  const idx = db.journalArticles.findIndex((a) => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Article not found' });
  }
  if (req.body.slug && db.journalArticles.some((a) => a.slug === req.body.slug && a.id !== req.params.id)) {
    return res.status(400).json({ error: 'An article with this slug already exists.' });
  }

  db.journalArticles = req.body.isHero ? enforceSingleHero(db.journalArticles, req.params.id) : db.journalArticles;
  const refreshedIdx = db.journalArticles.findIndex((a) => a.id === req.params.id);
  db.journalArticles[refreshedIdx] = { ...db.journalArticles[refreshedIdx], ...req.body };
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_ARTICLE', 'ARTICLE', db.journalArticles[refreshedIdx].id, db.journalArticles[refreshedIdx].title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', db.journalArticles[refreshedIdx]);

  res.json(db.journalArticles[refreshedIdx]);
});

router.delete('/admin/articles/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const art = db.journalArticles.find((a) => a.id === req.params.id);
  if (!art) {
    return res.status(404).json({ error: 'Article not found' });
  }

  db.journalArticles = db.journalArticles.filter((a) => a.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_ARTICLE', 'ARTICLE', art.id, art.title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', { deletedId: art.id });

  res.json({ success: true, id: req.params.id });
});

// --- FAQs CMS ---
router.post('/admin/faqs', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newFaq: SupportFaq = {
    ...req.body,
    id: req.body.id || 'faq-' + Date.now(),
  };

  db.faqs.push(newFaq);
  await saveDatabase(db);
  await logAudit(req, 'CREATE_FAQ', 'FAQ', newFaq.id, newFaq.question);
  broadcastEvent('CMS_UPDATE', 'faqs', newFaq);

  res.json(newFaq);
});

router.put('/admin/faqs/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = db.faqs.findIndex((f) => f.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'FAQ not found' });
  }

  db.faqs[idx] = { ...db.faqs[idx], ...req.body };
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_FAQ', 'FAQ', db.faqs[idx].id, db.faqs[idx].question);
  broadcastEvent('CMS_UPDATE', 'faqs', db.faqs[idx]);

  res.json(db.faqs[idx]);
});

router.delete('/admin/faqs/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const faq = db.faqs.find((f) => f.id === req.params.id);
  if (!faq) {
    return res.status(404).json({ error: 'FAQ not found' });
  }

  db.faqs = db.faqs.filter((f) => f.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_FAQ', 'FAQ', faq.id, faq.question);
  broadcastEvent('CMS_UPDATE', 'faqs', { deletedId: faq.id });

  res.json({ success: true, id: req.params.id });
});

// --- Global Settings ---
router.put('/admin/settings', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  // A replaced logo is left alone — see the "Rollback & Cleanup Timing"
  // policy at the top of this file.
  db.globalSettings = { ...db.globalSettings, ...req.body };
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_SETTINGS', 'GLOBAL_SETTINGS', 'settings', 'Global Store Settings Updated');
  broadcastEvent('CMS_UPDATE', 'globalSettings', db.globalSettings);

  res.json(db.globalSettings);
});

// --- Media Upload & Library ---
router.get('/admin/media', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  res.json(db.media || []);
});

/**
 * The single entry point for every admin image and video upload.
 *
 * Products, shades, categories, banners, the hero, looks, blog covers, the
 * site logo and the media library itself all post here. Which is why the
 * validation lives in a service rather than inline: this one handler is the
 * whole attack surface for admin-supplied files, and it is also the one place
 * a format or limit change has to be made.
 *
 * The order of operations is the safety argument:
 *
 *   validate → upload → persist → (only on persist failure) roll back
 *
 * Nothing is deleted on the success path. An upload that replaces an image
 * elsewhere in the CMS leaves the old asset alone — see the "Rollback &
 * Cleanup Timing" policy near the top of this file.
 */
router.post(
  '/admin/media/upload',
  requireAdmin,
  (req, res, next) => {
    // multer's own errors (file too large, too many files) are surfaced here
    // rather than thrown onward. Left to Express's default handler they come
    // back as an HTML 500 stack trace, which is both an information leak and
    // a baffling thing to show an admin who picked a 40 MB photo.
    upload.single('file')(req, res, (err) => {
      if (err) return respondToUploadError(err, res);
      next();
    });
  },
  async (req: AuthenticatedRequest, res: Response) => {
    const result = validateMediaFile(req.file, { accept: 'image-or-video' });
    if (result.outcome === 'rejected') {
      // Full detail to the log, a plain sentence to the admin. The detail
      // includes what the bytes actually looked like, which is what makes a
      // rejected upload diagnosable without asking them to send the file.
      console.warn(
        `[media] rejected upload from ${req.user?.email || 'unknown admin'}: ${result.error.logDetail}`
      );
      return res.status(result.error.status).json({ error: result.error.message });
    }

    const file = result.file;
    if (file.sanitizedNotes.length) {
      console.warn(
        `[media] sanitised SVG from ${req.user?.email || 'unknown admin'} — removed: ${file.sanitizedNotes.join(', ')}`
      );
    }

    const displayName = sanitizeFilename(req.body.name || req.file?.originalname);

    // Re-uploading a file that is already in the library returns the existing
    // entry instead of storing identical pixels twice. The match is on a
    // sha256 of the exact bytes, so it can only ever collapse two genuinely
    // identical files — and because it reuses the existing record rather than
    // creating a second one pointing at the same asset, deleting one entry
    // can never orphan another.
    const contentHash = hashBuffer(file.buffer);
    const existingDb = await loadDatabase();
    const duplicate = (existingDb.media || []).find((m) => m.contentHash && m.contentHash === contentHash);
    if (duplicate) {
      console.log(`[media] re-upload of an existing asset (${duplicate.id}) — reusing it`);
      return res.json(duplicate);
    }

    let uploaded: UploadedAsset;
    try {
      uploaded = await uploadToCloudinary(file, { folder: 'glamirk-beauty' });
    } catch (err) {
      console.error('[media] Cloudinary upload failed:', err);
      return res.status(502).json({
        error: 'Could not save that file to storage right now. Please try again.',
      });
    }

    const mediaItem: CMSMediaItem = {
      id: 'med-' + Date.now(),
      name: displayName,
      url: uploaded.url,
      publicId: uploaded.publicId,
      size: uploaded.bytes ?? file.buffer.length,
      // The verified type, not the client-declared one. A file posted as
      // image/png whose bytes are WebP is stored as, and reported as, WebP.
      mimeType: file.mimeType,
      altText: req.body.altText || displayName,
      uploadedAt: new Date().toISOString(),
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format,
      resourceType: uploaded.resourceType,
      contentHash: uploaded.contentHash,
      ...(uploaded.width && uploaded.height ? { dimensions: `${uploaded.width} × ${uploaded.height}` } : {}),
    };

    try {
      const db = await loadDatabase();
      db.media.unshift(mediaItem);
      await saveDatabase(db);
    } catch (err) {
      // Cloudinary succeeded but the reference never landed, so nothing in the
      // app knows this asset exists. It is safe — and only safe in exactly
      // this case — to remove it, because it is brand new and unreferenced.
      console.error('[media] saving the media record failed after a successful upload:', err);
      await discardOrphanedAsset(uploaded);
      return res.status(500).json({
        error: 'The image uploaded but could not be saved. Nothing was changed — please try again.',
      });
    }

    await logAudit(req, 'UPLOAD_MEDIA', 'MEDIA', mediaItem.id, mediaItem.name);
    broadcastEvent('CMS_UPDATE', 'media', mediaItem);

    res.json(mediaItem);
  }
);

router.delete('/admin/media/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const item = db.media.find((m) => m.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Media not found' });
  }

  // Media Library items are shared: the same upload can also be referenced by
  // a product image slot or a shade's variant images. Deleting it here used
  // to destroy the Cloudinary asset unconditionally, leaving those product
  // fields pointing at a 404'd URL with no way to notice until an admin
  // reopened that product. Block the delete instead, same "still referenced"
  // scan releaseReplacedMedia uses for admin-initiated replacements.
  const { media, ...contentOnly } = db;
  if (JSON.stringify(contentOnly).includes(item.url)) {
    return res.status(409).json({
      error: 'This image is still used on a product, shade, or page and cannot be deleted. Remove it from there first.',
    });
  }

  // Remove the asset from Cloudinary if it was uploaded there. If this fails,
  // the Media Library entry is NOT removed — per the rollback policy above,
  // an unverified deletion must not be treated as a completed one. Leaving
  // the record in place means the admin can see the failure and retry, rather
  // than the asset silently surviving in Cloudinary with the app having lost
  // all record of it.
  if (item.publicId) {
    try {
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.mimeType?.startsWith('video/') ? 'video' : 'image',
      });
    } catch (err) {
      console.error('Could not delete asset from Cloudinary; media entry retained:', err);
      return res.status(502).json({
        error: 'Could not delete this asset from storage. It has not been removed — please try again.',
      });
    }
  }

  db.media = db.media.filter((m) => m.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_MEDIA', 'MEDIA', item.id, item.name);
  broadcastEvent('CMS_UPDATE', 'media', { deletedId: item.id });

  res.json({ success: true, id: req.params.id });
});

export default router;
