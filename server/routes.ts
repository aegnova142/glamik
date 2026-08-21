import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  loadDatabase,
  saveDatabase,
  evaluateOffers,
  subscribeToEvents,
  broadcastEvent,
  StoredUser,
} from './db';
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
} from '../src/types';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'glamirk_luxury_atelier_jwt_secret_2026';

// Media uploads directory setup
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF, SVG) are supported'));
    }
  },
});

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
function logAudit(
  req: AuthenticatedRequest,
  action: string,
  objectType: string,
  objectId: string,
  objectTitle: string,
  details?: string
) {
  const db = loadDatabase();
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
  saveDatabase(db);
}

// ==========================================
// REAL-TIME SERVER-SENT EVENTS (SSE)
// ==========================================

router.get('/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: ' + JSON.stringify({ type: 'CONNECTED', message: 'Glamirk Real-time CMS Connected' }) + '\n\n');

  const unsubscribe = subscribeToEvents((event) => {
    res.write('data: ' + JSON.stringify(event) + '\n\n');
  });

  req.on('close', () => {
    unsubscribe();
  });
});

// ==========================================
// AUTH ROUTES
// ==========================================

router.post('/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = loadDatabase();
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

router.get('/auth/me', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

router.post('/auth/change-password', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 5) {
    return res.status(400).json({ error: 'New password must be at least 5 characters' });
  }

  const db = loadDatabase();
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
  saveDatabase(db);

  logAudit(req, 'CHANGE_PASSWORD', 'USER', user.id, user.email, 'Admin password successfully updated');
  res.json({ success: true, message: 'Password updated successfully' });
});

// ==========================================
// PUBLIC CMS CONTENT ROUTES
// ==========================================

router.get('/cms/content', (req: Request, res: Response) => {
  const db = loadDatabase();
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
    serverTime: new Date().toISOString(),
  };

  res.json(publicData);
});

router.get('/cms/page/:slug', (req: Request, res: Response) => {
  const db = loadDatabase();
  const slug = req.params.slug === 'home' || req.params.slug === '_' ? '' : req.params.slug;
  const page = db.pages.find((p) => p.slug === slug && p.status === 'published');

  if (!page) {
    return res.status(404).json({ error: 'Page not found or not published' });
  }

  res.json(page);
});

router.get('/cms/offers/active', (req: Request, res: Response) => {
  const db = loadDatabase();
  const evaluatedOffers = evaluateOffers(db.offers);
  const activeOffers = evaluatedOffers.filter((o) => o.status === 'active');
  res.json({
    offers: activeOffers,
    serverTime: new Date().toISOString(),
  });
});

// ==========================================
// PROTECTED ADMIN CMS ROUTES
// ==========================================

router.get('/admin/overview', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
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

router.get('/admin/full-state', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
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

// --- Pages Management ---
router.post('/admin/pages', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const newPage: CMSPage = {
    ...req.body,
    id: req.body.id || 'page-' + Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.pages.push(newPage);
  saveDatabase(db);
  logAudit(req, 'CREATE_PAGE', 'PAGE', newPage.id, newPage.title);
  broadcastEvent('CMS_UPDATE', 'pages', newPage);

  res.json(newPage);
});

router.put('/admin/pages/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const idx = db.pages.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Page not found' });
  }

  db.pages[idx] = {
    ...db.pages[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  saveDatabase(db);
  logAudit(req, 'UPDATE_PAGE', 'PAGE', db.pages[idx].id, db.pages[idx].title);
  broadcastEvent('CMS_UPDATE', 'pages', db.pages[idx]);

  res.json(db.pages[idx]);
});

router.delete('/admin/pages/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const page = db.pages.find((p) => p.id === req.params.id);
  if (!page) {
    return res.status(404).json({ error: 'Page not found' });
  }
  if (page.isSystemPage) {
    return res.status(400).json({ error: 'Cannot delete system core homepage' });
  }

  db.pages = db.pages.filter((p) => p.id !== req.params.id);
  saveDatabase(db);
  logAudit(req, 'DELETE_PAGE', 'PAGE', page.id, page.title);
  broadcastEvent('CMS_UPDATE', 'pages', { deletedId: page.id });

  res.json({ success: true, id: req.params.id });
});

// --- Products Management ---
router.post('/admin/products', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const newProduct: Product = {
    ...req.body,
    id: req.body.id || 'prod-' + Date.now(),
  };

  db.products.push(newProduct);
  saveDatabase(db);
  logAudit(req, 'CREATE_PRODUCT', 'PRODUCT', newProduct.id, newProduct.name);
  broadcastEvent('CMS_UPDATE', 'products', newProduct);

  res.json(newProduct);
});

router.put('/admin/products/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const idx = db.products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  db.products[idx] = {
    ...db.products[idx],
    ...req.body,
  };

  saveDatabase(db);
  logAudit(req, 'UPDATE_PRODUCT', 'PRODUCT', db.products[idx].id, db.products[idx].name);
  broadcastEvent('CMS_UPDATE', 'products', db.products[idx]);

  res.json(db.products[idx]);
});

router.post('/admin/products/duplicate/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
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
  saveDatabase(db);
  logAudit(req, 'DUPLICATE_PRODUCT', 'PRODUCT', duplicated.id, duplicated.name);
  broadcastEvent('CMS_UPDATE', 'products', duplicated);

  res.json(duplicated);
});

router.delete('/admin/products/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const prod = db.products.find((p) => p.id === req.params.id);
  if (!prod) {
    return res.status(404).json({ error: 'Product not found' });
  }

  db.products = db.products.filter((p) => p.id !== req.params.id);
  saveDatabase(db);
  logAudit(req, 'DELETE_PRODUCT', 'PRODUCT', prod.id, prod.name);
  broadcastEvent('CMS_UPDATE', 'products', { deletedId: prod.id });

  res.json({ success: true, id: req.params.id });
});

// --- Categories Management ---
router.post('/admin/categories', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const newCategory: CMSCategory = {
    ...req.body,
    id: req.body.id || 'cat-' + Date.now(),
  };

  db.categories.push(newCategory);
  saveDatabase(db);
  logAudit(req, 'CREATE_CATEGORY', 'CATEGORY', newCategory.id, newCategory.name);
  broadcastEvent('CMS_UPDATE', 'categories', newCategory);

  res.json(newCategory);
});

router.put('/admin/categories/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const idx = db.categories.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }

  db.categories[idx] = { ...db.categories[idx], ...req.body };
  saveDatabase(db);
  logAudit(req, 'UPDATE_CATEGORY', 'CATEGORY', db.categories[idx].id, db.categories[idx].name);
  broadcastEvent('CMS_UPDATE', 'categories', db.categories[idx]);

  res.json(db.categories[idx]);
});

router.delete('/admin/categories/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const cat = db.categories.find((c) => c.id === req.params.id);
  if (!cat) {
    return res.status(404).json({ error: 'Category not found' });
  }

  db.categories = db.categories.filter((c) => c.id !== req.params.id);
  saveDatabase(db);
  logAudit(req, 'DELETE_CATEGORY', 'CATEGORY', cat.id, cat.name);
  broadcastEvent('CMS_UPDATE', 'categories', { deletedId: cat.id });

  res.json({ success: true, id: req.params.id });
});

// --- Offers Management ---
router.post('/admin/offers', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const newOffer: CMSOffer = {
    ...req.body,
    id: req.body.id || 'off-' + Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.offers.push(newOffer);
  saveDatabase(db);
  logAudit(req, 'CREATE_OFFER', 'OFFER', newOffer.id, newOffer.name);
  broadcastEvent('CMS_UPDATE', 'offers', newOffer);

  res.json(newOffer);
});

router.put('/admin/offers/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const idx = db.offers.findIndex((o) => o.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Offer not found' });
  }

  db.offers[idx] = {
    ...db.offers[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  saveDatabase(db);
  logAudit(req, 'UPDATE_OFFER', 'OFFER', db.offers[idx].id, db.offers[idx].name);
  broadcastEvent('CMS_UPDATE', 'offers', db.offers[idx]);

  res.json(db.offers[idx]);
});

router.delete('/admin/offers/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const off = db.offers.find((o) => o.id === req.params.id);
  if (!off) {
    return res.status(404).json({ error: 'Offer not found' });
  }

  db.offers = db.offers.filter((o) => o.id !== req.params.id);
  saveDatabase(db);
  logAudit(req, 'DELETE_OFFER', 'OFFER', off.id, off.name);
  broadcastEvent('CMS_UPDATE', 'offers', { deletedId: off.id });

  res.json({ success: true, id: req.params.id });
});

// --- Navigation & Footer ---
router.put('/admin/navigation', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  db.navigation = req.body;
  saveDatabase(db);
  logAudit(req, 'UPDATE_NAVIGATION', 'NAVIGATION', 'nav-main', 'Header Navigation Updated');
  broadcastEvent('CMS_UPDATE', 'navigation', db.navigation);

  res.json(db.navigation);
});

router.put('/admin/footer', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  db.footer = req.body;
  saveDatabase(db);
  logAudit(req, 'UPDATE_FOOTER', 'FOOTER', 'footer-main', 'Footer Configuration Updated');
  broadcastEvent('CMS_UPDATE', 'footer', db.footer);

  res.json(db.footer);
});

// --- Journal / Blog CMS ---
router.post('/admin/articles', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const newArticle: JournalArticle = {
    ...req.body,
    id: req.body.id || req.body.slug || 'art-' + Date.now(),
  };

  db.journalArticles.push(newArticle);
  saveDatabase(db);
  logAudit(req, 'CREATE_ARTICLE', 'ARTICLE', newArticle.id, newArticle.title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', newArticle);

  res.json(newArticle);
});

router.put('/admin/articles/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const idx = db.journalArticles.findIndex((a) => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Article not found' });
  }

  db.journalArticles[idx] = { ...db.journalArticles[idx], ...req.body };
  saveDatabase(db);
  logAudit(req, 'UPDATE_ARTICLE', 'ARTICLE', db.journalArticles[idx].id, db.journalArticles[idx].title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', db.journalArticles[idx]);

  res.json(db.journalArticles[idx]);
});

router.delete('/admin/articles/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const art = db.journalArticles.find((a) => a.id === req.params.id);
  if (!art) {
    return res.status(404).json({ error: 'Article not found' });
  }

  db.journalArticles = db.journalArticles.filter((a) => a.id !== req.params.id);
  saveDatabase(db);
  logAudit(req, 'DELETE_ARTICLE', 'ARTICLE', art.id, art.title);
  broadcastEvent('CMS_UPDATE', 'journalArticles', { deletedId: art.id });

  res.json({ success: true, id: req.params.id });
});

// --- FAQs CMS ---
router.post('/admin/faqs', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const newFaq: SupportFaq = {
    ...req.body,
    id: req.body.id || 'faq-' + Date.now(),
  };

  db.faqs.push(newFaq);
  saveDatabase(db);
  logAudit(req, 'CREATE_FAQ', 'FAQ', newFaq.id, newFaq.question);
  broadcastEvent('CMS_UPDATE', 'faqs', newFaq);

  res.json(newFaq);
});

router.put('/admin/faqs/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const idx = db.faqs.findIndex((f) => f.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'FAQ not found' });
  }

  db.faqs[idx] = { ...db.faqs[idx], ...req.body };
  saveDatabase(db);
  logAudit(req, 'UPDATE_FAQ', 'FAQ', db.faqs[idx].id, db.faqs[idx].question);
  broadcastEvent('CMS_UPDATE', 'faqs', db.faqs[idx]);

  res.json(db.faqs[idx]);
});

router.delete('/admin/faqs/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const faq = db.faqs.find((f) => f.id === req.params.id);
  if (!faq) {
    return res.status(404).json({ error: 'FAQ not found' });
  }

  db.faqs = db.faqs.filter((f) => f.id !== req.params.id);
  saveDatabase(db);
  logAudit(req, 'DELETE_FAQ', 'FAQ', faq.id, faq.question);
  broadcastEvent('CMS_UPDATE', 'faqs', { deletedId: faq.id });

  res.json({ success: true, id: req.params.id });
});

// --- Global Settings ---
router.put('/admin/settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  db.globalSettings = { ...db.globalSettings, ...req.body };
  saveDatabase(db);
  logAudit(req, 'UPDATE_SETTINGS', 'GLOBAL_SETTINGS', 'settings', 'Global Store Settings Updated');
  broadcastEvent('CMS_UPDATE', 'globalSettings', db.globalSettings);

  res.json(db.globalSettings);
});

// --- Media Upload & Library ---
router.get('/admin/media', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  res.json(db.media || []);
});

router.post(
  '/admin/media/upload',
  requireAdmin,
  upload.single('file'),
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const db = loadDatabase();
    const mediaItem: CMSMediaItem = {
      id: 'med-' + Date.now(),
      name: req.body.name || req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mimeType: req.file.mimetype,
      altText: req.body.altText || req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };

    db.media.unshift(mediaItem);
    saveDatabase(db);
    logAudit(req, 'UPLOAD_MEDIA', 'MEDIA', mediaItem.id, mediaItem.name);
    broadcastEvent('CMS_UPDATE', 'media', mediaItem);

    res.json(mediaItem);
  }
);

router.delete('/admin/media/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const db = loadDatabase();
  const item = db.media.find((m) => m.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Media not found' });
  }

  // Remove local file if stored in /uploads
  if (item.url.startsWith('/uploads/')) {
    const filename = path.basename(item.url);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Could not delete file from disk:', err);
      }
    }
  }

  db.media = db.media.filter((m) => m.id !== req.params.id);
  saveDatabase(db);
  logAudit(req, 'DELETE_MEDIA', 'MEDIA', item.id, item.name);
  broadcastEvent('CMS_UPDATE', 'media', { deletedId: item.id });

  res.json({ success: true, id: req.params.id });
});

export default router;
