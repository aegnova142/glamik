import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import {
  loadDatabase,
  saveDatabase,
  evaluateOffers,
  broadcastEvent,
  pool,
  withStockLock,
  StoredUser,
  InternalCMSDatabaseSchema,
  JWT_SECRET,
} from './db';
import {
  ORDER_STATUS_SEQUENCE,
  RETURN_STATUSES,
  buildOrderFromRow,
  buildOrdersFromRows,
  insertOrderStatusHistory,
  isValidStatusTransition,
  mapReturnRequestRow,
  restockOrderItems,
} from './orders';
import { mapReviewRow } from './reviews';
import {
  notifyOrderStatusChange,
  notifyReturnStatusChange,
  notifyAdminOrderDelivered,
  mapNotificationRow,
} from './notifications';
import { sendOrderStatusEmail } from './email';
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
} from '../src/types';

const router = express.Router();

// Cloudinary configuration for durable media storage (reads CLOUDINARY_URL automatically)
cloudinary.config();

// Multer holds the upload in memory; it is streamed to Cloudinary, never written to local disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60 MB limit (video clips need more room than stills)
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF, SVG) or video files (MP4, WebM, MOV) are supported'));
    }
  },
});

// resource_type: 'auto' lets Cloudinary classify image vs. video from the
// actual file content, so callers never need to duplicate that check.
function uploadBufferToCloudinary(buffer: Buffer): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'glamirk-beauty', resource_type: 'auto' },
      (err, result) => {
        if (err || !result) return reject(err || new Error('Cloudinary upload failed'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

// Admin "replace" actions (logo, hero image, look video, etc.) only ever
// swap a reference field to a new URL — the old Cloudinary asset would
// otherwise sit around forever as orphaned storage. Call this with the
// value being overwritten and the value replacing it; if the old one was a
// tracked upload and is no longer in use, it's deleted from both Cloudinary
// and the media library.
//
// IMPORTANT: call this only after `db` has been updated to its prospective
// final state (the new value already assigned in place of the old one).
// The "still referenced elsewhere" check below scans the whole document, so
// if it ran against a stale `db` still holding the old value, every release
// would look like a false match against itself and cleanup would never fire.
async function releaseReplacedMedia(
  db: InternalCMSDatabaseSchema,
  oldUrl: string | undefined | null,
  newUrl: string | undefined | null
): Promise<void> {
  if (!oldUrl || oldUrl === newUrl) return;
  // The same asset can legitimately be reused across multiple fields/records
  // (admin pastes the same media-library URL twice). Only delete it once no
  // other part of the document points at it anymore. `media` itself is
  // excluded from this scan — every tracked asset's own library entry
  // contains its own url, which would otherwise always false-match itself.
  const { media, ...contentOnly } = db;
  if (JSON.stringify(contentOnly).includes(oldUrl)) return;
  const item = (db.media || []).find((m) => m.url === oldUrl);
  if (!item) return; // not a tracked upload (e.g. a seed/stock photo) — leave it alone
  if (item.publicId) {
    try {
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.mimeType?.startsWith('video/') ? 'video' : 'image',
      });
    } catch (err) {
      console.warn('Could not delete replaced asset from Cloudinary:', err);
    }
  }
  db.media = db.media.filter((m) => m.id !== item.id);
}

// ==========================================
// AUTHENTICATION & RBAC MIDDLEWARE
// ==========================================

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    name: string;
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin privilege required' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }
}

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
    journalSectionCopy: db.journalSectionCopy,
    findMyShadeResultsCopy: db.findMyShadeResultsCopy,
    findMyShadeHero: db.findMyShadeHero,
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
router.get('/admin/orders', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20));
  const offset = (page - 1) * pageSize;

  const whereClause = status ? 'WHERE status = $1' : '';
  const params = status ? [status] : [];

  const countRes = await pool.query(`SELECT COUNT(*) FROM orders ${whereClause}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const ordersRes = await pool.query(
    `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );

  const db = await loadDatabase();
  const orders = await buildOrdersFromRows(ordersRes.rows, db);

  res.json({ orders, total, page, pageSize });
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
  const allowedStatuses: OrderStatus[] = [...ORDER_STATUS_SEQUENCE, 'CANCELLED'];
  if (!status || !allowedStatuses.includes(status)) {
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
  const updateRes = await withStockLock(async () => {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND status = $3 RETURNING id',
      [status, row.id, row.status]
    );
    if (result.rows.length > 0 && status === 'CANCELLED') {
      await restockOrderItems(row.id);
    }
    return result;
  });
  if (updateRes.rows.length === 0) {
    return res.status(409).json({ error: 'This order was already updated. Please refresh and try again.' });
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
    ...(status === 'DELIVERED' ? [notifyAdminOrderDelivered(row.id, row.order_number)] : []),
    logAudit(req, 'UPDATE_ORDER_STATUS', 'ORDER', row.id, row.order_number, `${row.status} -> ${status}`),
  ]);

  const db = await loadDatabase();
  const updatedRes = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
  const order = await buildOrderFromRow(updatedRes.rows[0], db);
  res.json({ order });
});

// --- Return requests ---
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
router.post('/admin/products', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newProduct: Product = {
    ...req.body,
    id: req.body.id || 'prod-' + Date.now(),
  };

  db.products.push(newProduct);
  await saveDatabase(db);
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

  db.products[idx] = {
    ...db.products[idx],
    ...req.body,
  };

  await saveDatabase(db);
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

  const duplicated: Product = {
    ...JSON.parse(JSON.stringify(original)),
    id: original.id + '-copy-' + Date.now(),
    name: `${original.name} (Copy)`,
  };

  db.products.push(duplicated);
  await saveDatabase(db);
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

  const { title, image } = req.body || {};
  if (title !== undefined && !String(title).trim()) {
    return res.status(400).json({ error: 'Title cannot be empty.' });
  }
  if (image !== undefined && !String(image).trim()) {
    return res.status(400).json({ error: 'Image cannot be empty.' });
  }

  const oldLook = db.looks[idx];
  db.looks[idx] = { ...oldLook, ...req.body };

  await releaseReplacedMedia(db, oldLook.image, db.looks[idx].image);
  await releaseReplacedMedia(db, oldLook.video, db.looks[idx].video);

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

  db.looks = db.looks.filter((l) => l.id !== req.params.id);
  await releaseReplacedMedia(db, look.image, undefined);
  await releaseReplacedMedia(db, look.video, undefined);
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
  const oldHero = db.heroContent;
  const newHero = req.body;

  // Assign the prospective final state first — releaseReplacedMedia scans the
  // whole document to make sure an asset isn't still referenced elsewhere
  // before deleting it, so `db` must already reflect the new content.
  db.heroContent = newHero;

  await releaseReplacedMedia(db, oldHero?.image, newHero?.image);

  // Slides and backgrounds are id-keyed lists — release an image whenever its
  // slot was replaced in place, or the slot itself was removed entirely.
  const oldSlides = oldHero?.slides || [];
  const newSlidesById = new Map<string, any>((newHero?.slides || []).map((s: any) => [s.id, s]));
  for (const oldSlide of oldSlides) {
    await releaseReplacedMedia(db, oldSlide.image, newSlidesById.get(oldSlide.id)?.image);
  }

  const oldBackgrounds = oldHero?.backgrounds || [];
  const newBackgroundsById = new Map<string, any>((newHero?.backgrounds || []).map((b: any) => [b.id, b]));
  for (const oldBg of oldBackgrounds) {
    await releaseReplacedMedia(db, oldBg.image, newBackgroundsById.get(oldBg.id)?.image);
  }

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_HERO', 'HERO', 'hero-main', 'Homepage Hero Content Updated');
  broadcastEvent('CMS_UPDATE', 'heroContent', db.heroContent);

  res.json(db.heroContent);
});

// --- Homepage Promotional Banner Popup ---
router.put('/admin/promo-banners', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const oldConfig = db.promoBanners;
  const newConfig = req.body;

  db.promoBanners = newConfig;

  // Release any banner image replaced in place (same id, different url) or
  // whose slot was removed entirely.
  const oldBanners = oldConfig?.banners || [];
  const newBannersById = new Map<string, any>((newConfig?.banners || []).map((b: any) => [b.id, b]));
  for (const oldBanner of oldBanners) {
    await releaseReplacedMedia(db, oldBanner.image, newBannersById.get(oldBanner.id)?.image);
  }

  await saveDatabase(db);
  await logAudit(req, 'UPDATE_PROMO_BANNERS', 'PROMO_BANNERS', 'promo-banners-main', 'Promotional Banner Popup Updated');
  broadcastEvent('CMS_UPDATE', 'promoBanners', db.promoBanners);

  res.json(db.promoBanners);
});

// --- Homepage Shade Intelligence Teaser ---
router.put('/admin/shade-finder-teaser', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const oldTeaser = db.shadeFinderTeaser;
  const newTeaser = req.body;

  db.shadeFinderTeaser = newTeaser;

  const oldProfiles = oldTeaser?.profiles || [];
  const newProfilesById = new Map<string, any>((newTeaser?.profiles || []).map((p: any) => [p.id, p]));
  for (const oldProfile of oldProfiles) {
    await releaseReplacedMedia(db, oldProfile.visual, newProfilesById.get(oldProfile.id)?.visual);
  }

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
router.post('/admin/articles', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const newArticle: JournalArticle = {
    ...req.body,
    id: req.body.id || req.body.slug || 'art-' + Date.now(),
  };

  db.journalArticles.push(newArticle);
  await saveDatabase(db);
  await logAudit(req, 'CREATE_ARTICLE', 'ARTICLE', newArticle.id, newArticle.title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', newArticle);

  res.json(newArticle);
});

router.put('/admin/articles/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const db = await loadDatabase();
  const idx = db.journalArticles.findIndex((a) => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Article not found' });
  }

  db.journalArticles[idx] = { ...db.journalArticles[idx], ...req.body };
  await saveDatabase(db);
  await logAudit(req, 'UPDATE_ARTICLE', 'ARTICLE', db.journalArticles[idx].id, db.journalArticles[idx].title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', db.journalArticles[idx]);

  res.json(db.journalArticles[idx]);
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
  const oldLogoUrl = db.globalSettings?.logoUrl;
  db.globalSettings = { ...db.globalSettings, ...req.body };
  await releaseReplacedMedia(db, oldLogoUrl, db.globalSettings.logoUrl);
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

router.post(
  '/admin/media/upload',
  requireAdmin,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let uploaded: { url: string; publicId: string };
    try {
      uploaded = await uploadBufferToCloudinary(req.file.buffer);
    } catch (err) {
      console.error('Cloudinary upload failed:', err);
      return res.status(502).json({ error: 'Failed to upload file to storage' });
    }

    const db = await loadDatabase();
    const mediaItem: CMSMediaItem = {
      id: 'med-' + Date.now(),
      name: req.body.name || req.file.originalname,
      url: uploaded.url,
      publicId: uploaded.publicId,
      size: req.file.size,
      mimeType: req.file.mimetype,
      altText: req.body.altText || req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };

    db.media.unshift(mediaItem);
    await saveDatabase(db);
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

  // Remove the asset from Cloudinary if it was uploaded there
  if (item.publicId) {
    try {
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.mimeType?.startsWith('video/') ? 'video' : 'image',
      });
    } catch (err) {
      console.warn('Could not delete asset from Cloudinary:', err);
    }
  }

  db.media = db.media.filter((m) => m.id !== req.params.id);
  await saveDatabase(db);
  await logAudit(req, 'DELETE_MEDIA', 'MEDIA', item.id, item.name);
  broadcastEvent('CMS_UPDATE', 'media', { deletedId: item.id });

  res.json({ success: true, id: req.params.id });
});

export default router;
