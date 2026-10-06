import fs from 'fs';
import { Pool } from 'pg';
import { env } from '../config/env';
import { PATHS } from '../config/paths';
import {
  classifyDatabaseTarget,
  buildAutoMigrationRefusal,
  type DatabaseTarget,
} from '../config/databaseTarget';
import { runMigrations } from './migrate';
import bcrypt from 'bcryptjs';
import {
  CMSDatabaseSchema,
  CMSUser,
  CMSPage,
  CMSNavigationItem,
  CMSFooterConfig,
  CMSOffer,
  CMSCategory,
  CMSMediaItem,
  CMSGlobalSettings,
  CMSAuditLog,
  CMSHeroContent,
  CMSAboutContent,
  CMSBenefit,
  CMSBenefitsSection,
  CMSShadeJourney,
  CMSShadeFinderTeaser,
  CMSPromoBannerConfig,
  CMSJournalSectionCopy,
  CMSFindMyShadeResultsCopy,
  CMSFindMyShadeHero,
  CMSPersonalizedBeauty,
  CMSShopMegaMenu,
  Product,
  JournalArticle,
  SupportFaq,
} from '@glamirk/shared/types';
import { GLAMIRK_LOOKS } from '@glamirk/shared/data/looks';
import { TRY_ON_MODELS } from '@glamirk/shared/data/models';

// Initial seed data imports
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import {
  GLAMIRK_JOURNAL_ARTICLES_EXTENDED,
  GLAMIRK_CAMPAIGNS,
} from '@glamirk/shared/data/editorial';
import { SUPPORT_FAQS } from '@glamirk/shared/data/commerce';

// Neon Postgres connection. DATABASE_URL must be a Neon connection string
// (postgresql://user:pass@ep-xxxx.neon.tech/dbname?sslmode=require).
//
// Read through config/env rather than process.env directly: importing that
// module is what loads the repo-root .env, so any entry point that reaches
// this file (the server, but also the migrate and seed scripts) gets a
// configured environment without having to remember to set one up.
const connectionString = env.databaseUrl;

/**
 * Whether to negotiate TLS for this connection.
 *
 * Managed providers (Neon, Supabase, RDS) require it. A local Postgres — a
 * container for running migrations against, or a developer's own instance —
 * usually has TLS switched off entirely, and forcing it there fails the
 * connection outright. Decided from the host so both work without config.
 */
function shouldUseSsl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get('sslmode') === 'disable') return false;
    const host = parsed.hostname;
    return !(host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost'));
  } catch {
    // Unparseable connection string — assume a managed provider and keep TLS
    // on, because failing closed is the safe direction here.
    return true;
  }
}

const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
  // Neon can be slow to wake a suspended endpoint or briefly unreachable;
  // without these, a stalled connection/query hangs the pool client forever
  // and every request waiting on it (e.g. admin media upload) never
  // resolves or rejects — it just spins.
  connectionTimeoutMillis: 10000,
  query_timeout: 15000,
});

// Neon suspends/drops idle connections; without this handler an idle
// client's ECONNRESET crashes the whole process (unhandled 'error' event).
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client:', err);
});

const STATE_ROW_ID = 'main';

// Single source of truth for the JWT signing secret — routes.ts, commerce.ts,
// and socket.ts all verify/sign tokens and previously each redeclared this
// same literal independently. That's a silent-drift trap: if one copy were
// ever updated (e.g. rotating the fallback), auth would go out of sync
// across admin/customer/socket auth with no error, just silently mismatched
// verification.
export const JWT_SECRET = env.jwtSecret;

let schemaReady: Promise<void> | null = null;

/**
 * Guarantees the schema is present before any query runs.
 *
 * The SQL that used to live here inline now lives in database/migrations as
 * numbered, forward-only files.
 *
 * IN PRODUCTION THIS NO LONGER APPLIES THEM.
 *
 * It used to, and that turned out to be a live hazard: this function is called
 * on every server boot and from several CLI entry points, all of which read
 * DATABASE_URL from the repo-root .env — which points at production. Starting a
 * local dev server, or running any script that touched the database, applied
 * whatever migration files happened to be sitting in that developer's working
 * tree. Migrations reached production that way with no review, no deploy step
 * and nobody intending it; migration 012 arrived on production exactly like
 * this, before it had been validated against production data.
 *
 * Production now verifies rather than applies: if migrations are outstanding it
 * says so and fails fast, so the deploy is fixed rather than the schema being
 * silently reshaped under a running application.
 *
 * Outside production the old behaviour is kept, because a fresh clone or a
 * throwaway test database should just work without a separate setup step.
 *
 * Apply migrations deliberately, through the deployment process:
 *
 *     npm run migrate
 *
 * Memoised so concurrent callers share a single run rather than racing.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    // Decided by the TARGET, not by NODE_ENV.
    //
    // NODE_ENV was the wrong signal: the case that actually went wrong twice
    // was NODE_ENV=development on a laptop whose .env pointed at production.
    // A dev-mode process has no business auto-migrating a production database
    // just because it considers itself development.
    const target = classifyDatabaseTarget(connectionString);
    schemaReady = target.allowsAutoMigration
      ? runMigrations(pool).then(() => undefined)
      : assertSchemaUpToDate(target);

    // A failure must not stay cached as "done", or every later caller would
    // resolve happily against a schema that was never applied or checked.
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  return schemaReady;
}

/**
 * Production check: are there migration files that have not been applied?
 *
 * Read-only — it compares the files on disk against the schema_migrations
 * table and never writes. Throwing is deliberate: an application running
 * against a schema older than its code will fail in confusing ways later
 * (missing columns, missing tables), and failing at boot with an actionable
 * message is far easier to diagnose than a 500 from one unlucky endpoint.
 */
async function assertSchemaUpToDate(target: DatabaseTarget): Promise<void> {
  // The table itself may not exist on a brand-new database, which is a
  // legitimate "nothing has ever been applied" rather than an error.
  const tableExists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'`
  );

  const applied = new Set<string>();
  if (tableExists.rows.length > 0) {
    const rows = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
    for (const row of rows.rows) applied.add(row.version);
  }

  const files = fs.existsSync(PATHS.migrations)
    ? fs.readdirSync(PATHS.migrations).filter((f) => f.endsWith('.sql')).sort()
    : [];
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length > 0) {
    throw new Error(buildAutoMigrationRefusal(target, pending));
  }

  // Host only, never the connection string — a password in a log is a leaked
  // password, and logs outlive the process that wrote them.
  console.log(
    `[db] schema up to date (${applied.size} migration(s) applied) — ${target.host}, auto-migration disabled (${target.reason})`
  );
}

export { pool };

// Simple in-process mutex so concurrent checkout requests never race on
// reading/decrementing the same product's stock (cachedDb is shared across
// requests in this single Node process).
let stockLockChain: Promise<any> = Promise.resolve();

/**
 * Arbitrary but fixed key identifying the stock critical section. Postgres
 * advisory locks are namespaced by a single bigint, so this just has to be a
 * constant nothing else in the system uses.
 */
const STOCK_ADVISORY_LOCK_KEY = 8421507;

/**
 * Serialises the stock read-modify-write critical section.
 *
 * Two layers, because they guard different failure modes:
 *
 *   1. The in-process promise chain. Stock lives in the cms_state JSONB
 *      document, cached by reference and shared across every request in this
 *      process — two concurrent checkouts reading the same cached array and
 *      both writing back would lose one of the decrements regardless of what
 *      the database does.
 *
 *   2. A Postgres session-level advisory lock. The chain above only orders
 *      work *within one process*, and ecosystem.config.cjs pins the app to a
 *      single pm2 fork precisely because of that. This second layer removes
 *      the silent dependency on that setting: if the app is ever clustered,
 *      run on two hosts, or has a one-off script run against the same
 *      database, the advisory lock still serialises them. Without it, the
 *      first person to add `instances: 2` reintroduces overselling with no
 *      error to warn them.
 *
 * Uses a dedicated client (not pool.query) because an advisory lock is held by
 * the *session*: acquiring and releasing on two different pooled connections
 * would release a lock this caller never held.
 */
export function withStockLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = stockLockChain.then(
    () => withAdvisoryLock(fn),
    () => withAdvisoryLock(fn)
  );
  stockLockChain = run.catch(() => undefined);
  return run;
}

/**
 * Namespace for per-order shipment booking locks. Distinct from
 * STOCK_ADVISORY_LOCK_KEY so the two critical sections can never collide — a
 * booking that waited on the stock lock would deadlock against a checkout.
 */
const SHIPMENT_ADVISORY_LOCK_NAMESPACE = 8421508;

/**
 * Serialises courier booking for ONE order across every process.
 *
 * Unlike withStockLock this does not queue: a second caller for the same order
 * is told the lock is busy and gives up. That is the correct answer here —
 * booking is not a read-modify-write that must eventually run, it is a call
 * that creates a physical parcel, and "wait and then do it too" is exactly how
 * one order ends up with two.
 *
 * Keyed on the order id via hashtext(), so unrelated orders book in parallel.
 * Takes a dedicated client because an advisory lock belongs to the session —
 * acquiring and releasing on two different pooled connections would release a
 * lock this caller never held.
 */
export async function withOrderShipmentLock<T>(
  orderId: string,
  fn: () => Promise<T>
): Promise<{ acquired: boolean; value?: T }> {
  const client = await pool.connect();
  try {
    const got = await client.query('SELECT pg_try_advisory_lock($1::int, hashtext($2)) AS acquired', [
      SHIPMENT_ADVISORY_LOCK_NAMESPACE,
      orderId,
    ]);
    if (!got.rows[0]?.acquired) return { acquired: false };
    try {
      return { acquired: true, value: await fn() };
    } finally {
      // Best-effort, in a finally: a throw inside the critical section must not
      // strand the lock and wedge every later attempt on this order.
      await client
        .query('SELECT pg_advisory_unlock($1::int, hashtext($2))', [SHIPMENT_ADVISORY_LOCK_NAMESPACE, orderId])
        .catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

async function withAdvisoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [STOCK_ADVISORY_LOCK_KEY]);
    try {
      return await fn();
    } finally {
      // Released in a finally so a throw inside the critical section cannot
      // strand the lock and wedge every subsequent checkout. Releasing is
      // best-effort: if the connection itself died, the lock is already gone
      // with the session, and surfacing that error here would mask whatever
      // actually failed inside fn().
      await client.query('SELECT pg_advisory_unlock($1)', [STOCK_ADVISORY_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

// User with hashed password storage (internal)
export interface StoredUser extends CMSUser {
  passwordHash: string;
}

export interface InternalCMSDatabaseSchema extends Omit<CMSDatabaseSchema, 'users'> {
  users: StoredUser[];
}

let cachedDb: InternalCMSDatabaseSchema | null = null;
const eventSubscribers: Array<(event: { type: string; entity: string; data?: any }) => void> = [];

export function subscribeToEvents(callback: (event: { type: string; entity: string; data?: any }) => void) {
  eventSubscribers.push(callback);
  return () => {
    const idx = eventSubscribers.indexOf(callback);
    if (idx !== -1) eventSubscribers.splice(idx, 1);
  };
}

export function broadcastEvent(type: string, entity: string, data?: any) {
  eventSubscribers.forEach((cb) => {
    try {
      cb({ type, entity, data });
    } catch (e) {
      console.error('SSE dispatch error:', e);
    }
  });
}

export function getInitialDatabase(): InternalCMSDatabaseSchema {
  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync('QAZPLMoknwsx$#@980', salt);

  const initialUsers: StoredUser[] = [
    {
      id: 'usr-admin-1',
      email: 'shelja.sharma@glamirk.com',
      name: 'Glamirk Executive Admin',
      role: 'admin',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      passwordHash: adminPasswordHash,
      createdAt: new Date().toISOString(),
    },
  ];

  const initialCategories: CMSCategory[] = [
    {
      id: 'cat-makeup',
      name: 'Makeup',
      slug: 'makeup',
      description: 'High-pigment, weightless formulations calibrated for warm and olive complexions.',
      image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=1200&q=80',
      order: 1,
      isVisible: true,
      subCategories: ['Lips', 'Eyes', 'Face'],
    },
    {
      id: 'cat-skin',
      name: 'Skin',
      slug: 'skin',
      description: 'Balm-to-water botanical cleansers and nourishing barrier elixirs.',
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80',
      order: 2,
      isVisible: true,
      subCategories: ['Cleansing', 'Skincare Essentials'],
    },
    {
      id: 'cat-nails',
      name: 'Nails',
      slug: 'nails',
      description: 'Ultra-pigmented gel-shine lacquers with breathable formula.',
      image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80',
      order: 3,
      isVisible: true,
      subCategories: ['Nail Products', 'Nail Care'],
    },
  ];

  const initialNavigation: CMSNavigationItem[] = [
    {
      id: 'nav-shop',
      label: 'Shop',
      url: '/shop',
      type: 'internal',
      order: 1,
      isVisible: true,
      children: [
        { id: 'sub-all', label: 'All Collections', url: '/shop', order: 1, isVisible: true },
        { id: 'sub-makeup', label: 'Makeup', url: '/shop?category=Makeup', order: 2, isVisible: true },
        { id: 'sub-skin', label: 'Skin', url: '/shop?category=Skin', order: 3, isVisible: true },
        { id: 'sub-nails', label: 'Nails', url: '/shop?category=Nails', order: 4, isVisible: true },
        { id: 'sub-new', label: 'New Arrivals', url: '/new-launch', order: 5, isVisible: true, badge: 'NEW' },
      ],
    },
    {
      id: 'nav-shade-finder',
      label: 'Find My Shade',
      url: '/find-my-shade',
      type: 'internal',
      order: 2,
      isVisible: true,
      badge: 'AI MATCH',
    },
    {
      id: 'nav-looks',
      label: 'Looks & Edits',
      url: '/looks',
      type: 'internal',
      order: 3,
      isVisible: true,
    },
    {
      id: 'nav-journal',
      label: 'Journal',
      url: '/journal',
      type: 'internal',
      order: 4,
      isVisible: true,
    },
    {
      id: 'nav-beauty-guides',
      label: 'Beauty Guides',
      url: '/beauty-guides',
      type: 'internal',
      order: 5,
      isVisible: true,
    },
    {
      id: 'nav-support',
      label: 'Support',
      url: '/support',
      type: 'internal',
      order: 6,
      isVisible: true,
    },
  ];

  const initialFooter: CMSFooterConfig = {
    brandDescription:
      'Glamirk Beauty Private Limited is dedicated to modern luxury beauty, thoughtful formulations, and intelligent color personalization calibrated for Indian complexions.',
    tagline: 'Intelligent color personalization and modern luxury cosmetics calibrated for Indian complexions.',
    newsletterTitle: 'Enter The Glam',
    newsletterSubtitle: 'Be the first to discover new cosmetic launches, private shade previews, and editorial beauty rituals.',
    columns: [
      {
        id: 'col-shop',
        title: 'Shop',
        order: 1,
        links: [
          { id: 'l1', label: 'All Products', url: '/shop', actionKey: 'shop-all' },
          { id: 'l2', label: 'Best Sellers', url: '/shop', actionKey: 'shop-all' },
          { id: 'l3', label: 'New Arrivals', url: '/shop', actionKey: 'shop-all' },
          { id: 'l4', label: 'Personalized Kit', url: '/find-my-shade', actionKey: 'shade-finder' },
        ],
      },
      {
        id: 'col-about',
        title: 'About',
        order: 2,
        links: [
          { id: 'l5', label: 'Our Story', url: '/about', actionKey: 'about' },
          { id: 'l6', label: 'Our Mission', url: '/about', actionKey: 'about' },
          { id: 'l7', label: 'Our Values', url: '/about', actionKey: 'about' },
        ],
      },
      {
        id: 'col-help',
        title: 'Help',
        order: 3,
        links: [
          { id: 'l8', label: 'FAQ', url: '/support', actionKey: 'support' },
          { id: 'l9', label: 'Contact', url: '/support', actionKey: 'support' },
          { id: 'l10', label: 'Shipping', url: '/legal?policy=shipping', actionKey: 'legal-shipping' },
          { id: 'l11', label: 'Returns', url: '/legal?policy=returns', actionKey: 'legal-returns' },
          { id: 'l12', label: 'Track Order', url: '/order-tracking', actionKey: 'tracking' },
        ],
      },
      {
        id: 'col-legal',
        title: 'Legal',
        order: 4,
        links: [
          { id: 'l13', label: 'Privacy Policy', url: '/legal?policy=privacy', actionKey: 'legal-privacy' },
          { id: 'l14', label: 'Terms of Use', url: '/legal?policy=terms', actionKey: 'legal-terms' },
          { id: 'l15', label: 'Refund Policy', url: '/legal?policy=returns', actionKey: 'legal-returns' },
        ],
      },
    ],
    socialLinks: [
      { platform: 'Instagram', url: 'https://instagram.com/glamirkbeauty', handle: '@glamirkbeauty' },
      { platform: 'YouTube', url: 'https://youtube.com/@glamirkbeauty', handle: 'Glamirk Atelier' },
      { platform: 'Pinterest', url: 'https://pinterest.com/glamirkbeauty', handle: 'Glamirk Beauty' },
      { platform: 'LinkedIn', url: 'https://linkedin.com/company/glamirkbeauty', handle: 'Glamirk Beauty' },
      { platform: 'X', url: 'https://x.com/glamirkbeauty', handle: '@glamirkbeauty' },
    ],
    contactEmail: 'care@glamirk.com',
    contactPhone: '+91 800 452 6475',
    copyrightText: '© 2026 Glamirk Luxury Beauty. All rights reserved.',
    copyright: '© 2026 Glamirk Luxury Beauty. All rights reserved.',
    legalLinks: [
      { id: 'leg-priv', label: 'Privacy Policy', url: '/legal?policy=privacy', policyKey: 'privacy' },
      { id: 'leg-term', label: 'Terms of Service', url: '/legal?policy=terms', policyKey: 'terms' },
      { id: 'leg-ship', label: 'Shipping Policy', url: '/legal?policy=shipping', policyKey: 'shipping' },
      { id: 'leg-cook', label: 'Cookie Policy', url: '/legal?policy=cookies', policyKey: 'cookies' },
    ],
    paymentMethods: ['Visa', 'Mastercard', 'RuPay', 'UPI', 'Amex'],
    trustBadges: [
      { id: 'tb-secure', icon: 'ShieldCheck', title: '100% Secure', subtitle: 'Payments' },
      { id: 'tb-returns', icon: 'RotateCcw', title: 'Easy Returns', subtitle: 'Hassle-free' },
      { id: 'tb-support', icon: 'Headphones', title: 'Customer Support', subtitle: 'Mon - Sat | 10AM - 7PM' },
    ],
    legalPolicies: {
      privacy: {
        id: 'privacy',
        title: 'Privacy & Data Protection Policy',
        subtitle: 'Data protection, camera privacy & client confidentiality',
        effectiveDate: '2026 Current Production Release',
        content: 'Glamirk Beauty Private Limited respects the personal privacy of our patrons. We design all client interactions, shade discovery consultations, and shopping flows with privacy-by-design principles.',
        sections: [
          {
            heading: '1. Our Privacy Philosophy',
            body: 'Glamirk Beauty Private Limited respects the personal privacy of our patrons. We design all client interactions, shade discovery consultations, and shopping flows with privacy-by-design principles. We collect only the information necessary to fulfill orders, personalize shade selections, and maintain client loyalty relationships.',
          },
          {
            heading: '2. Virtual Try-On & Camera Image Processing',
            body: 'Our Virtual Try-On and Find My Shade camera diagnostics process facial geometry and skin tone cues purely locally within your browser session using real-time canvas calculations. We do not upload, retain, distribute, or sell your biometric facial data or uploaded photos to external servers.',
          },
          {
            heading: '3. Information We Collect',
            body: 'When you place an order or create a Glamirk Privé profile, we collect contact details (name, email address, phone number for courier notifications), delivery coordinates (shipping address and postal PIN code), and transaction references.',
          },
          {
            heading: '4. Security & Data Protection',
            body: 'All communications are protected via 256-bit TLS encryption. Client profile data is stored on secure, monitored infrastructure compliant with ISO 27001 standards.',
          },
        ],
      },
      terms: {
        id: 'terms',
        title: 'Terms of Service & Atelier Conditions',
        subtitle: 'Atelier standards, intellectual property & order terms',
        effectiveDate: '2026 Current Production Release',
        content: 'Welcome to Glamirk Beauty. By accessing our atelier website, diagnostic tools, or purchasing our luxury cosmetic creations, you agree to the following terms and conditions.',
        sections: [
          {
            heading: '1. Acceptance of Terms',
            body: 'By accessing or ordering from Glamirk Beauty Private Limited, you confirm that you are at least 18 years of age or possess legal parental consent.',
          },
          {
            heading: '2. Intellectual Property & Formulation Integrity',
            body: 'All formulations, shade names (e.g. Sovereign Velvet, Royal Ochre), packaging architecture, visual assets, and diagnostic algorithms are the exclusive intellectual property of Glamirk Beauty Private Limited.',
          },
          {
            heading: '3. Orders, Pricing & Authenticity',
            body: 'All prices listed on Glamirk.com are in Indian Rupees (INR) inclusive of applicable GST taxes. We guarantee 100% authentic, tamper-evident sealed luxury products dispatched directly from our certified facilities.',
          },
          {
            heading: '4. Cosmetic Safety & Patch Testing',
            body: 'While our products undergo rigorous dermatological testing for sensitive complexions, we recommend performing a 24-hour patch test before full application.',
          },
        ],
      },
      shipping: {
        id: 'shipping',
        title: 'Luxury Shipping & White-Glove Delivery',
        subtitle: 'Pan-India transit, temperature control & dispatch times',
        effectiveDate: '2026 Current Production Release',
        content: 'We take extraordinary care to ensure your Glamirk creations arrive in flawless, pristine condition through temperature-regulated logistics across India.',
        sections: [
          {
            heading: '1. Complimentary Shipping Privilege',
            body: 'We offer complimentary expedited express shipping across all pin codes in India on all orders valued at ₹999 and above. Orders below ₹999 incur a flat nominal courier fee of ₹99.',
          },
          {
            heading: '2. Dispatch Timelines',
            body: 'Orders placed before 2:00 PM IST on business days are prepared and handed to our premium courier partners within 24 hours. Metro deliveries typically arrive within 2-3 business days.',
          },
          {
            heading: '3. Temperature-Safe Packaging',
            body: 'To protect delicate botanicals and velvety lip pigments from thermal degradation during transit, every order is cushioned in insulated, eco-conscious bespoke protective casing.',
          },
          {
            heading: '4. Real-Time Tracking & Notifications',
            body: 'Once dispatched, you will receive real-time SMS and WhatsApp notifications with live GPS tracking links to monitor your courier.',
          },
        ],
      },
      cookies: {
        id: 'cookies',
        title: 'Cookie Preference & Technology Transparency',
        subtitle: 'Session state, shade preferences & analytical tracking',
        effectiveDate: '2026 Current Production Release',
        content: 'Our cookie notice outlines how we utilize cookies and local browser storage to provide personalized beauty recommendations.',
        sections: [
          {
            heading: '1. What Are Cookies',
            body: 'Cookies are small text identifiers stored on your device that enable our atelier website to remember your diagnostic shade matches, bag items, and language preferences.',
          },
          {
            heading: '2. Essential Functional Cookies',
            body: 'These cookies are required for fundamental e-commerce operations such as retaining items in your shopping bag, secure checkout authentication, and currency formatting.',
          },
          {
            heading: '3. Personalization & Diagnostic Cookies',
            body: 'With your consent, these cookies retain your undertone diagnostic results (e.g. Deep Olive, Warm Golden) so you never need to re-calibrate when browsing new launches.',
          },
          {
            heading: '4. Managing Preferences',
            body: 'You may adjust or clear your cookie preferences anytime via your browser settings without affecting core order fulfillment.',
          },
        ],
      },
      returns: {
        id: 'returns',
        title: 'Returns, Exchanges & Quality Guarantee',
        subtitle: 'Hygiene standards, replacements & claims procedure',
        effectiveDate: '2026 Current Production Release',
        content: 'Because our cosmetics are crafted with uncompromised hygiene standards, we uphold clear guidelines regarding returns and exchanges.',
        sections: [
          {
            heading: '1. 7-Day Replacement Guarantee',
            body: 'If your order arrives damaged, defective, or incorrect, notify our Concierge team within 7 days of delivery for an immediate complimentary express replacement.',
          },
          {
            heading: '2. Hygiene Safety Standards',
            body: 'Due to cosmetic health and safety standards, opened or used makeup and skincare items cannot be accepted for routine return once safety seals are broken.',
          },
          {
            heading: '3. Claim Resolution',
            body: 'Simply share photos of the damaged unit to care@glamirk.com or WhatsApp +91 800 452 6475 for instant priority processing.',
          },
        ],
      },
    },
  };

  const initialGlobalSettings: CMSGlobalSettings = {
    brandName: 'Glamirk Beauty',
    tagline: 'Luxury Atelier for Melanin-Rich Beauty',
    logoText: 'GLAMIRK',
    logoUrl: '',
    footerLogoUrl: '',
    contactEmail: 'care@glamirk.com',
    contactPhone: '+91 800 452 6475',
    address: 'Atelier 08, Lodha World Towers, Lower Parel, Mumbai, Maharashtra 400013',
    currency: 'INR',
    currencySymbol: '₹',
    storeTimezone: 'Asia/Kolkata',
    freeShippingThreshold: 999,
    shippingNotice: 'Complimentary shipping across India on all orders above ₹999.',
    announcementBarMessages: [
      { id: 'ann-1', text: 'Complimentary luxury courier on all orders above ₹999', isVisible: true },
      { id: 'ann-2', text: 'New: Balm-to-Water Cleanser with Sea Buckthorn is now live', isVisible: true },
      { id: 'ann-3', text: 'Find your calibrated lip undertone with our AI Diagnostic Tool', link: '/find-my-shade', isVisible: true },
    ],
    defaultSeoTitle: 'Glamirk Beauty | Luxury Makeup & Skincare Atelier',
    defaultSeoDescription: 'Discover high-pigment, weightless lip colors and botanical cleansing balms meticulously calibrated for warm, olive, and South Asian skin tones.',
    approvedPalette: {
      primaryLuxuryBlack: '#0B0B0B',
      primarySoftBlack: '#171717',
      primaryGold: '#C9972B',
      primaryBrightGold: '#E3B84B',
      secondaryPink: '#F05A7E',
      secondarySoftPink: '#FCE8ED',
      secondaryWhite: '#FFFFFF',
      backgroundWarmWhite: '#FAF9F6',
      textRichBlack: '#121212',
      mutedTextGrey: '#6B6B6B',
      borderSoftGold: '#E8D5A8',
    },
    codRules: {
      minOrderAmount: 0,
      maxOrderAmount: 0,
      serviceablePinCodes: [],
      blockedPinCodes: [],
      codDisabledProductIds: [],
    },
  };

  // Pre-configured homepage sections representing current layout
  const homeSections = [
    {
      id: 'sec-hero',
      type: 'hero' as const,
      title: 'Hero Atelier Showcase',
      order: 1,
      isVisible: true,
      props: {
        eyebrow: 'THE ARCHITECTURE OF MELANIN HARMONY',
        heading: 'PIGMENTS CALIBRATED FOR TRUE DEPTH',
        highlightText: 'TRUE DEPTH',
        description:
          'Weightless, transfer-resistant matte formulas crafted to illuminate warm, olive, and golden undertones with zero chalkiness.',
        primaryCtaText: 'EXPLORE SHADES',
        primaryCtaUrl: '/shop',
        secondaryCtaText: 'FIND MY SHADE',
        secondaryCtaUrl: '/find-my-shade',
        badgeText: 'NEW FORMULA: 12H COMFORT MATTE',
        image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1800&q=85',
      },
    },
    {
      id: 'sec-promo-banner',
      type: 'promotional_banner' as const,
      title: 'Promotional Offer Banner',
      order: 2,
      isVisible: true,
      props: {
        heading: 'FESTIVE BEAUTY PRIVILEGE',
        subheading: 'Complimentary full-size Cleansing Balm on all orders above ₹1,999.',
        code: 'GLAMFESTIVE',
        ctaText: 'SHOP PRIVILEGE',
        ctaUrl: '/shop',
      },
    },
    {
      id: 'sec-category-grid',
      type: 'category_grid' as const,
      title: 'Category Discovery Grid',
      order: 3,
      isVisible: true,
      props: {
        title: 'DISCOVER BY CATEGORY',
        subtitle: 'Meticulously crafted formulations for lips, skin, and nail artistry.',
      },
    },
    {
      id: 'sec-glamirk-edit',
      type: 'glamirk_edit' as const,
      title: 'The Glamirk Edit (Curated Bestsellers)',
      order: 4,
      isVisible: true,
      props: {
        title: 'THE GLAMIRK EDIT',
        subtitle: 'Our signature formulations formulated for maximum wear and velvety comfort.',
      },
    },
    {
      id: 'sec-cleanser-showcase',
      type: 'cleanser_showcase' as const,
      title: 'Cleanser Formula Spotlight',
      order: 5,
      isVisible: true,
      props: {
        eyebrow: 'THE BOTANICAL CLEANSING RITUAL',
        title: 'BALM-TO-WATER TRANSFORMATION',
        description: 'Dissolves waterproof pigment in 30 seconds without stripping your lipid barrier.',
        productId: 'balm-to-water-cleanser-50g',
      },
    },
    {
      id: 'sec-shade-finder-teaser',
      type: 'shade_finder_teaser' as const,
      title: 'AI Shade Finder Teaser',
      order: 6,
      isVisible: true,
      props: {
        title: 'AI UNDERTONE DIAGNOSTIC',
        subtitle: 'Take our 60-second diagnostic to unlock your exact lip shade and finish match.',
        ctaText: 'BEGIN DIAGNOSTIC',
        ctaUrl: '/find-my-shade',
      },
    },
    {
      id: 'sec-shop-the-look',
      type: 'shop_the_look' as const,
      title: 'Curated Runway Looks',
      order: 7,
      isVisible: true,
      props: {
        title: 'SHOP THE ATELIER LOOKS',
        subtitle: 'Complete beauty edits paired by our lead color strategists.',
      },
    },
    {
      id: 'sec-glamirk-on-you',
      type: 'glamirk_on_you' as const,
      title: 'Social Commerce & Community',
      order: 8,
      isVisible: true,
      props: {
        title: 'GLAMIRK ON YOU',
        subtitle: 'Real complexions, unretouched swatches, and community favorites.',
      },
    },
    {
      id: 'sec-journal',
      type: 'journal_section' as const,
      title: 'The Glamirk Journal',
      order: 9,
      isVisible: true,
      props: {
        title: 'THE GLAMIRK JOURNAL',
        subtitle: 'Studies in pigment architecture, skin barrier preservation, and application rituals.',
      },
    },
    {
      id: 'sec-trust-strip',
      type: 'trust_quality_strip' as const,
      title: 'Trust & Quality Guarantees',
      order: 10,
      isVisible: true,
      props: {
        items: [
          { title: '100% Cruelty Free & Vegan', desc: 'No animal testing or animal-derived ingredients' },
          { title: 'Dermatologically Tested', desc: 'Calibrated for sensitive and reactive complexions' },
          { title: 'Zero Harmful Parabens', desc: 'Clean, non-toxic cosmetic chemistry' },
          { title: 'Pan-India Express Courier', desc: 'Complimentary shipping above ₹999' },
        ],
      },
    },
  ];

  const initialPages: CMSPage[] = [
    {
      id: 'page-home',
      title: 'Homepage',
      slug: '',
      status: 'published',
      seoTitle: 'Glamirk Beauty | Luxury Makeup & Skin Atelier',
      seoDescription: 'Discover high-pigment, transfer-proof luxury lipsticks and barrier-safe cleansing balms calibrated for warm and South Asian complexions.',
      ogImage: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
      isSystemPage: true,
      sections: homeSections,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'page-about',
      title: 'About Glamirk',
      slug: 'about-glamirk',
      status: 'published',
      seoTitle: 'About Glamirk Beauty | Melanin-Rich Color Architecture',
      seoDescription: 'The story and cosmetic science behind Glamirk Beauty Private Limited.',
      isSystemPage: false,
      sections: [
        {
          id: 'about-hero',
          type: 'hero',
          title: 'About Hero',
          order: 1,
          isVisible: true,
          props: {
            eyebrow: 'OUR ATELIER HERITAGE',
            heading: 'REDEFINING MELANIN COLOR HARMONY',
            description: 'Founded with a singular vision: to eliminate the compromises South Asian and warm-toned complexions face in luxury beauty.',
            image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1600&q=85',
          },
        },
        {
          id: 'about-brand-statement',
          type: 'brand_statement',
          title: 'Brand Philosophy',
          order: 2,
          isVisible: true,
          props: {
            heading: 'THE GLAMIRK PROMISE',
            description: 'Every formula is micro-milled with high refractive index oils that prevent ashy reflection under ambient daylight.',
          },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Scheduled & Active Offers
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const initialOffers: CMSOffer[] = [
    {
      id: 'off-festive-edit',
      name: 'Festive Beauty Edit',
      publicTitle: 'Festive Beauty Privilege',
      tag: 'LIMITED PRIVILEGE',
      description: 'Enjoy 15% privilege across all luxury lip collections with code GLAMFESTIVE.',
      bannerImage: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
      discountType: 'percentage',
      discountValue: 15,
      minOrderValue: 999,
      couponCode: 'GLAMFESTIVE',
      startDate: oneWeekAgo.toISOString(),
      endDate: nextMonth.toISOString(),
      timezone: 'Asia/Kolkata',
      status: 'active',
      showCountdown: true,
      ctaText: 'SHOP FESTIVE EDIT',
      ctaUrl: '/shop',
      isSitewide: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'off-welcome',
      name: 'First Order Privilege',
      publicTitle: 'Welcome to the Atelier',
      tag: 'WELCOME',
      description: 'Receive 10% complimentary privilege on your first beauty order.',
      bannerImage: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=1200&q=80',
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 799,
      couponCode: 'GLAMWELCOME',
      startDate: oneWeekAgo.toISOString(),
      endDate: nextMonth.toISOString(),
      timezone: 'Asia/Kolkata',
      status: 'active',
      showCountdown: false,
      ctaText: 'EXPLORE CATALOG',
      ctaUrl: '/shop',
      isSitewide: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const initialMedia: CMSMediaItem[] = [
    {
      id: 'med-hero-1',
      name: 'Hero Editorial Model - Melanin Harmony',
      url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1800&q=85',
      size: 482910,
      mimeType: 'image/jpeg',
      altText: 'Glamirk Atelier Editorial model showcasing velvet matte lips',
      uploadedAt: new Date().toISOString(),
    },
    {
      id: 'med-cleanser-1',
      name: 'Balm-to-Water Cleanser Product Bottle',
      url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80',
      size: 320140,
      mimeType: 'image/jpeg',
      altText: 'Glamirk Balm-to-Water Cleanser 50g jar',
      uploadedAt: new Date().toISOString(),
    },
    {
      id: 'med-lipstick-1',
      name: 'Matte Liquid Lipstick Flatlay',
      url: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=1200&q=80',
      size: 389200,
      mimeType: 'image/jpeg',
      altText: 'Glamirk Matte Liquid Lipstick luxury tube with gold applicator cap',
      uploadedAt: new Date().toISOString(),
    },
  ];

  const initialHeroContent: CMSHeroContent = {
    badgeText: 'Radiate Confidence Every Day',
    headingLine1: 'Beauty & Radiance',
    headingPrefix: 'for a ',
    headingHighlight: 'Better You',
    description: 'Discover premium beauty essentials and shade-matching formulations engineered to amplify your natural glow.',
    primaryCtaText: 'Shop Now',
    secondaryCtaText: 'Find My Shade',
    trustIndicators: [
      { id: 'ti-1', icon: 'ShieldCheck', text: 'Dermatologist Approved' },
      { id: 'ti-2', icon: 'Sparkles', text: 'Formulated for Indian Skin' },
      { id: 'ti-3', icon: 'ShieldCheck', text: '100% Vegan & Cruelty-Free' },
    ],
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85',
    imageBadgeLabel: 'SIGNATURE COLLECTION',
    imageProductName: 'Matte Liquid & Cleansing Balm',
    imagePrice: '₹299+',
    trustBar: [
      { id: 'tb-1', icon: 'ShieldCheck', title: '100% Authentic', subtitle: 'Certified original beauty' },
      { id: 'tb-2', icon: 'Sparkles', title: 'Expert Approved', subtitle: 'Dermatologically safe' },
      { id: 'tb-3', icon: 'Truck', title: 'Fast Delivery', subtitle: 'Express pan-India transit' },
    ],
  };

  const initialAboutContent: CMSAboutContent = {
    statementParagraphs: [
      "At Glamirk, we believe that true beauty shouldn't demand a compromise between instant impact and long-term skin health. We are a team of Beauty Advisors, creators, strategists, and beauty enthusiasts united by a single conviction: everyday routines should feel effortless, ethical, and deeply transformative.",
      'Bare skin should look better after you take your makeup off than before you put it on. By combining active botanical extracts, bio-fermented ingredients, and zero-irritation pigments, Glamirk delivers instant aesthetic impact paired with active skin therapy as a makeup brand.',
    ],
    brandSnapshot: [
      { id: 'bs-1', title: 'Brand Name', description: 'Glamirk' },
      { id: 'bs-2', title: 'One-Line Description', description: 'Radiance without compromise. Amplify your beauty.' },
      { id: 'bs-3', title: 'What We Sell', description: 'Premium, affordable, multi-use color cosmetics and tailored personal care formulations.' },
      { id: 'bs-4', title: 'Overall Philosophy', description: 'Beauty should be effortless, ethical, and effective&mdash;bridging clinical-grade ingredients with luxurious self-care.' },
    ],
    founders: [
      { id: 'f-1', name: 'Digangana Suryavanshi', title: 'Chief Customer Officer', focus: "Champions every client's journey — from first shade match to lifelong loyalty.", image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=400&q=80' },
      { id: 'f-2', name: 'Aqueel Ahmed', title: 'Chief Financial Officer', focus: 'Stewards sustainable growth, from ethical sourcing to accessible pricing.', image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80' },
      { id: 'f-3', name: 'Vijay Laxmi Sharma', title: 'Chief Growth Officer', focus: "Drives Glamirk's expansion into new markets and beauty rituals.", image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80' },
      { id: 'f-4', name: 'Poonam Dadhich', title: 'Chief Marketing Officer', focus: 'Shapes the Glamirk voice — editorial storytelling rooted in inclusivity.', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80' },
    ],
    founderStoryAccordion: [
      { id: 'founder-story', label: 'The Founder Story', content: "After years of navigating sensitive skin reactions while working in fast-paced creative environments, we partnered with leading cosmetic chemists to create high-performing, skin-first makeup. As someone who lived in high-stress, fast-paced creative spaces, my skin was constantly paying the price. Heavy studio makeup and long hours kept triggering reactions, but 'gentle' alternatives just couldn't last through the day. That frustration became Glamirk. We partnered with leading cosmetic chemists to create a new standard: makeup that delivers vibrant, high-impact results while actively respecting and supporting sensitive skin." },
      { id: 'founder-why', label: 'Why Glamirk Was Created', content: 'Glamirk was founded to eliminate the compromise between instant cosmetic impact and long-term skin health. It answers the need for high-performance makeup infused with clinical-grade skincare.' },
      { id: 'founder-problem', label: 'The Problem Solved', content: 'Traditional cosmetics often act as a mask that clogs pores and degrades skin quality over time, forcing consumers into a cycle of using more makeup to cover skin damage caused by their makeup.' },
      { id: 'founder-exist', label: 'Why Glamirk Needs to Exist', content: 'Most beauty brands fall into one of two extremes: "clean" natural products that lack vibrancy and longevity, or high-pigment cosmetics packed with harsh synthetic fillers. Glamirk exists as the bio-compatible bridge where high pigment meets active dermal repair.' },
      { id: 'founder-name', label: 'What "Glamirk" Means', content: 'A blend of Glamour (expressive, high-impact aesthetics) and Smirk (a smile which you have when you are pleased with yourself).' },
      { id: 'founder-pitch', label: 'The Elevator Pitch', content: 'Glamirk is the hybrid beauty brand that gives you immediate editorial-level color while actively repairing your skin barrier.' },
    ],
    ourStoryAccordion: [
      { id: 'story-start', label: 'How It Started', content: 'Born in a small laboratory setting out of a passion for functional aesthetics, Glamirk began as an answer to overly complicated, multi-step routines that yielded minimal results.' },
      { id: 'story-why', label: 'Why It Was Created', content: 'To strip away unnecessary fillers and toxic additives, replacing them with concentrated, bio-compatible ingredients.' },
      { id: 'story-problem', label: 'The Problem Solved', content: 'The market was divided between high-performing chemicals that irritated the skin barrier and "clean" natural products that lacked visible results. Glamirk offers the sweet spot: active performance with gentle ingredients.' },
      { id: 'story-milestones', label: 'Milestones', content: 'Formulated the flagship barrier-repair serum; sold more than 100,000 products; transitioned to 100% post-consumer recycled glass packaging.' },
    ],
    mission: 'To empower individuals through simple, highly effective beauty rituals that nurture skin health, enhance confidence, and celebrate individuality.',
    vision: 'To become a global icon in sustainable luxury, setting new standards for clean science and skin inclusivity worldwide.',
    values: [
      { id: 'v-1', icon: 'ShieldCheck', title: 'Quality', description: 'Medical-grade purity in every batch, rigorously batch-tested for potency.' },
      { id: 'v-2', icon: 'Eye', title: 'Transparency', description: 'Full ingredient lists with explicit percentages for key actives.' },
      { id: 'v-3', icon: 'Users', title: 'Inclusivity', description: 'Formulations designed to perform across diverse skin tones, textures, and age groups.' },
      { id: 'v-4', icon: 'Leaf', title: 'Sustainability', description: 'Sourcing ethically, minimizing plastic, and prioritizing refillable designs.' },
      { id: 'v-5', icon: 'FlaskConical', title: 'Innovation', description: 'Utilizing bio-fermented actives and micro-encapsulation for deep delivery.' },
      { id: 'v-6', icon: 'Heart', title: 'Customer-First', description: 'Responsive formulation updates directly driven by community feedback.' },
    ],
    premiumStandardIntro: 'Glamirk achieves its premium status through uncompromising ingredient integrity and tactile design. Rapid-absorbing silk textures of our formulas, every touchpoint delivers a sensory, high-performance experience.',
    premiumStandardCards: [
      { id: 'ps-1', title: 'Ingredients & Formulation', description: 'Key Actives: Niacinamide, bio-fermented hyaluronic acid, squalane, and botanical peptides. Free-From: 0% parabens, phthalates, synthetic fragrance, sulfates, or mineral oil.' },
      { id: 'ps-2', title: 'Quality, Safety & Sustainability', description: 'Testing: Clinical third-party testing, dermatologist-approved, non-irritating certification. Eco-Footprint: 100% recyclable glass containers, soy-based inks, FSC-certified paper cartons, and an active refill scheme.' },
      { id: 'ps-3', title: 'Inclusivity', description: 'Skin Tones: Non-ashy mineral pigments for rich color payoff on deep skin tones. Skin Types: Adaptive formulas for oil-control, dry barrier repair, and balanced hydration.' },
    ],
    differentiators: [
      { id: 'd-1', title: 'Active-Infused Pigments', description: 'Every color product contains therapeutic percentages of skincare actives (e.g., niacinamide, ceramide complexes, peptides) rather than token trace amounts.' },
      { id: 'd-2', title: 'Skin Barrier First', description: 'Formulated without common sensitizers, synthetic heavy fragrances, or silicones that trap impurities.' },
      { id: 'd-3', title: 'Zero-G Texture Technology', description: 'Formulations engineered to feel weightless on the skin while providing buildable, full-spectrum coverage.' },
    ],
    neverBecome: [
      { id: 'nb-1', text: 'A trend-chasing brand dropping low-quality products every month that end up in landfills.' },
      { id: 'nb-2', text: 'A brand using buzzword ingredients at non-functional levels just for marketing claims.' },
      { id: 'nb-3', text: 'An exclusive club that over-complicates routines or prices out consumers seeking genuine quality and skin inclusivity.' },
    ],
    futureVisionAccordion: [
      { id: 'future-vision', label: 'Product Innovation, Digital Dominance & Retention', content: 'Executing this vision requires focusing on three fundamental pillars: product innovation, digital dominance, and customer retention. Digitally, growth relies on optimizing direct-to-consumer channels with AI-driven recommendations and immersive try-on experiences, while tapping into social commerce and creator partnerships on platforms like Facebook and Instagram. Customer retention then ties the ecosystem together through VIP loyalty structures, exclusive perks, and tailored lifecycle marketing that converts casual buyers into brand advocates.' },
    ],
    elevatorPitchQuote: 'Glamirk is the hybrid beauty brand that gives you immediate editorial-level color while actively repairing your skin barrier.',
    primaryCtaText: 'Shop Glamirk',
    secondaryCtaText: 'Contact Us',
  };

  const nowIso = new Date().toISOString();
  const initialBenefits: CMSBenefit[] = [
    { id: 'ben-1', title: 'Thoughtfully Crafted', description: 'Carefully calibrated cosmetic formulations designed for weightless, comfortable daily wear.', icon: 'Feather', displayOrder: 1, isActive: true, createdAt: nowIso, updatedAt: nowIso },
    { id: 'ben-2', title: 'Beauty Meets Technology', description: 'Personalized shade intelligence engineered specifically around Indian skin tones and undertones.', icon: 'Sparkles', displayOrder: 2, isActive: true, createdAt: nowIso, updatedAt: nowIso },
    { id: 'ben-3', title: 'Premium Experience', description: 'Sensorial textures, enduring pigments, and seamless ritual luxury from packaging to application.', icon: 'Shield', displayOrder: 3, isActive: true, createdAt: nowIso, updatedAt: nowIso },
  ];

  const initialShadeJourney: CMSShadeJourney = {
    eyebrow: 'YOUR BEAUTY JOURNEY',
    title: 'Find Your Match in ',
    titleHighlight: '7 Simple Steps',
    steps: [
      { id: 'step-1', icon: 'Sparkles', title: 'Discover Yourself', description: 'Tell us about your skin, preferences & style' },
      { id: 'step-2', icon: 'Palette', title: 'Beauty Consultation', description: 'We analyze your skin, undertone, concerns & goals' },
      { id: 'step-3', icon: 'Camera', title: 'Skin & Undertone Detection', description: 'Smart analysis for accurate results' },
      { id: 'step-4', icon: 'Wand2', title: 'Personalized Recommendations', description: 'We handpick the best matches for you' },
      { id: 'step-5', icon: 'ShoppingBag', title: 'Your Complete Beauty Kit', description: 'All your essentials, perfectly curated' },
      { id: 'step-6', icon: 'Settings2', title: 'Customize Every Product', description: 'Change shades, replace or remove' },
      { id: 'step-7', icon: 'Heart', title: 'See Total & Savings', description: 'Add your complete kit to cart & glow!' },
    ],
  };

  const initialBenefitsSection: CMSBenefitsSection = {
    eyebrow: 'OUR PROMISE',
    title: 'Beauty you can ',
    titleHighlight: 'trust.',
  };

  const initialPromoBanners: CMSPromoBannerConfig = {
    enabled: false,
    banners: [],
    intervalMs: 4000,
  };

  const initialJournalSectionCopy: CMSJournalSectionCopy = {
    badgeText: 'Editorial Perspectives',
    heading: 'The Glamirk Journal',
    subtitle: 'Perspectives on color theory, formulation mastery, and modern rituals crafted for Indian complexions.',
  };

  const initialFindMyShadeResultsCopy: CMSFindMyShadeResultsCopy = {
    resultsBadge: 'YOUR GLAMIRK MATCH',
    resultsHeading: 'YOUR PERSONAL BEAUTY EDIT',
    resultsSubtitle: 'Calibrated for your verified undertone, signature aesthetic, and occasion.',
    alternativesEyebrow: 'CURATED VARIATIONS',
    alternativesHeading: 'MORE SHADES YOU MAY LOVE',
  };

  const initialFindMyShadeHero: CMSFindMyShadeHero = {
    badgeText: 'INTELLIGENT SHADE DISCOVERY',
    headingLine1: 'FIND YOUR',
    headingHighlight: 'PERFECT SHADE',
    description: 'Beauty is personal. Your shade should be too. Let Glamirk curate your ideal lip & cosmetic matches based on your unique undertone, aesthetic style, and everyday rituals.',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85',
    primaryCtaText: 'START FINDING MY SHADE',
    secondaryCtaText: 'I ALREADY KNOW MY SHADE',
    captionLabel: 'Undertone Precision',
    captionText: 'Warm, Cool & Neutral pigments crafted for lasting wear.',
  };

  const initialShadeFinderTeaser: CMSShadeFinderTeaser = {
    badgeText: 'Shade Intelligence',
    heading: 'Find Your Perfect Match',
    subheading: 'Formulated precisely for Indian skin tones.',
    description: 'Every skin tone carries a unique melody of melanin and undertone depth. Glamirk’s color curation removes the guesswork, recommending precision velvet lipsticks and ceremonial sindoor tailored to your exact profile.',
    ctaText: 'Find My Signature Shade',
    profiles: [
      {
        id: 'warm',
        label: 'Warm',
        title: 'Warm & Golden',
        description: 'Your skin glows with golden, peachy, or caramel undertones. Rich terracotta, toasted cinnamon, and spiced rose create radiant warmth.',
        recommendedLip: 'Spice Velvet & Nude Suede',
        recommendedSindoor: 'Ceremonial Scarlet',
        swatchHexes: ['#C9972B', '#E8D5A8', '#F05A7E'],
        visual: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=85',
      },
      {
        id: 'neutral',
        label: 'Neutral',
        title: 'Balanced Neutral',
        description: 'A harmonious balance of warm and cool notes. You can effortlessly carry dusty rose, classic ruby, and muted crimson pigments.',
        recommendedLip: 'Royal Rose & Crimson Sovereign',
        recommendedSindoor: 'Ceremonial Scarlet & Heritage Maroon',
        swatchHexes: ['#F05A7E', '#171717', '#F05A7E'],
        visual: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=85',
      },
      {
        id: 'cool',
        label: 'Cool',
        title: 'Cool & Roseate',
        description: 'Hints of blue, pink, or deep berry undertones. Deep berry wines, blue-based red lips, and heritage maroon sindoor illuminate your complexion.',
        recommendedLip: 'Plum Opulence & Crimson Sovereign',
        recommendedSindoor: 'Heritage Maroon',
        swatchHexes: ['#121212', '#171717', '#121212'],
        visual: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=85',
      },
      {
        id: 'olive',
        label: 'Olive',
        title: 'Olive & Earthy',
        description: 'Subtle greenish-gold or neutral undertones that require depth. Earthy terracottas, toasted nudes, and opulent scarlet create striking definition.',
        recommendedLip: 'Spice Velvet & Plum Opulence',
        recommendedSindoor: 'Ceremonial Scarlet',
        swatchHexes: ['#C9972B', '#121212', '#F05A7E'],
        visual: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=800&q=85',
      },
    ],
    // [Glamik CMS] 2026-10-03 — Find Your Perfect Match: look-types + 16-cell
    // (4 undertones × 4 look-types) matrix. "before" seed URL fixed 2026-10-05.
    highlight: 'Perfect Match',
    chooseLabel: "Choose what you're looking for:",
    lookTypes: [
      { id: 'lip-shade', name: 'Lip Shade', description: 'Find your signature lip colour.', iconUrl: '', sortOrder: 0, isActive: true },
      { id: 'sindoor-shade', name: 'Sindoor Shade', description: 'Ceremonial sindoor matched to your tone.', iconUrl: '', sortOrder: 1, isActive: true },
      { id: 'complete-look', name: 'Complete Look', description: 'A coordinated lip + sindoor edit.', iconUrl: '', sortOrder: 2, isActive: true },
      { id: 'occasion-based', name: 'Occasion Based', description: 'Looks tuned to the moment.', iconUrl: '', sortOrder: 3, isActive: true },
    ],
    // 16 cells (4 undertones × 4 look types) computed from the profiles above.
    // Seed uses a shared neutral "before" and each profile's visual as "after"
    // so the slider shows a real difference; admins upload real pairs later.
    configs: (() => {
      const beforeSeed = 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=85';
      const undertones = [
        { id: 'warm', title: 'Warm & Golden', description: 'Your skin glows with golden, peachy, or caramel undertones. Rich terracotta, toasted cinnamon, and spiced rose create radiant warmth.', lip: 'Spice Velvet & Nude Suede', sindoor: 'Ceremonial Scarlet', swatchHexes: ['#C9972B', '#E8D5A8', '#F05A7E'], visual: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=85' },
        { id: 'neutral', title: 'Balanced Neutral', description: 'A harmonious balance of warm and cool notes. You can effortlessly carry dusty rose, classic ruby, and muted crimson pigments.', lip: 'Royal Rose & Crimson Sovereign', sindoor: 'Ceremonial Scarlet & Heritage Maroon', swatchHexes: ['#F05A7E', '#171717', '#F05A7E'], visual: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=85' },
        { id: 'cool', title: 'Cool & Roseate', description: 'Hints of blue, pink, or deep berry undertones. Deep berry wines, blue-based red lips, and heritage maroon sindoor illuminate your complexion.', lip: 'Plum Opulence & Crimson Sovereign', sindoor: 'Heritage Maroon', swatchHexes: ['#9B2D4F', '#171717', '#C23B63'], visual: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=85' },
        { id: 'olive', title: 'Olive & Earthy', description: 'Subtle greenish-gold or neutral undertones that require depth. Earthy terracottas, toasted nudes, and opulent scarlet create striking definition.', lip: 'Spice Velvet & Plum Opulence', sindoor: 'Ceremonial Scarlet', swatchHexes: ['#8A7B2B', '#121212', '#F05A7E'], visual: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=800&q=85' },
      ];
      const looks = [
        { id: 'lip-shade', primaryLabel: 'Lip', secondaryLabel: 'Sindoor', kind: 'lip' as const },
        { id: 'sindoor-shade', primaryLabel: 'Sindoor', secondaryLabel: 'Lip', kind: 'sindoor' as const },
        { id: 'complete-look', primaryLabel: 'Lip', secondaryLabel: 'Sindoor', kind: 'complete' as const },
        { id: 'occasion-based', primaryLabel: 'Occasion', secondaryLabel: 'Pairing', kind: 'occasion' as const },
      ];
      return undertones.flatMap((u) =>
        looks.map((lt) => ({
          undertoneId: u.id,
          lookTypeId: lt.id,
          matchTitle: `${u.title} Match`,
          matchDescription: u.description,
          primaryLabel: lt.primaryLabel,
          primary: lt.kind === 'sindoor' ? u.sindoor : u.lip,
          secondaryLabel: lt.secondaryLabel,
          secondary: lt.kind === 'sindoor' ? u.lip : u.sindoor,
          beforeImage: beforeSeed,
          afterImage: u.visual,
          beforeLabel: 'Before',
          afterLabel: 'After',
          visualTitle: `${u.title} Spectrum`,
          ctaLabel: '',
          ctaUrl: '',
          swatches: u.swatchHexes.map((c) => ({ color: c })),
          isActive: true,
        }))
      );
    })(),
  };

  // [Glamik CMS] 2026-10-03 — seed for the homepage Personalized Beauty section.
  const initialPersonalizedBeauty: CMSPersonalizedBeauty = {
    badgeText: 'Intelligent Color Calibration',
    heading: 'Personalized',
    headingHighlight: 'Beauty',
    description:
      'Formulations engineered precisely for Indian complexions. Select your undertone or take our 30-second AI diagnostic to receive your bespoke shade matches.',
    stepNumber: '01',
    stepLabel: 'Step One',
    selectHeading: 'Select Your Undertone',
    selectSubtext: 'Choose the undertone that best describes your natural complexion.',
    aiCtaLabel: 'Start AI Shade Diagnostic',
    aiCtaUrl: '#shade-finder',
    matchPreviewLabel: 'Match Preview',
    formulationHeading: 'Your Personalized Formulation Edit',
    lipShadeLabel: 'Recommended Lip Shade',
    pairingLabel: 'Ceremonial Pairing',
    quizPrompt: 'Want a 4-question lifestyle quiz instead?',
    quizCtaLabel: 'Take Beauty Quiz',
    quizCtaUrl: '#beauty-quiz',
    undertones: [
      {
        id: 'warm-golden',
        name: 'Warm & Golden',
        description: 'Golden, peachy, or caramel base.',
        thumbnailUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=400&q=80',
        accentColor: '#C9972B',
        tag: 'Best for golden yellow undertones',
        sortOrder: 0,
        isActive: true,
        lipShade: {
          title: 'Spice Velvet',
          description: 'Weightless matte liquid pigment formulated with warm terracotta depth.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=85',
          badge: '',
          ctaLabel: 'Try On In Live AR',
          ctaUrl: '#shade-finder',
        },
        pairing: {
          title: 'Ceremonial Scarlet',
          description: 'Enriched with 24K gold micro-shimmer and sacred saffron extract.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=85',
          badge: 'HERITAGE',
          ctaLabel: 'View Product Details',
          ctaUrl: '#',
        },
      },
      {
        id: 'balanced-neutral',
        name: 'Balanced Neutral',
        description: 'Balanced mix of warm & cool nuances.',
        thumbnailUrl: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=400&q=80',
        accentColor: '#C97B63',
        tag: 'Best for balanced neutral undertones',
        sortOrder: 1,
        isActive: true,
        lipShade: {
          title: 'Spice Velvet',
          description: 'Weightless matte liquid pigment formulated with sophisticated neutral pigments.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=85',
          badge: '',
          ctaLabel: 'Try On In Live AR',
          ctaUrl: '#shade-finder',
        },
        pairing: {
          title: 'Ceremonial Scarlet',
          description: 'Enriched with 24K gold micro-shimmer and a refined balanced pigment.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=85',
          badge: 'HERITAGE',
          ctaLabel: 'View Product Details',
          ctaUrl: '#',
        },
      },
      {
        id: 'cool-roseate',
        name: 'Cool & Roseate',
        description: 'Blue, rosy, or deep berry undertones.',
        thumbnailUrl: 'https://images.unsplash.com/photo-1583241800698-e8ab01830a07?auto=format&fit=crop&w=400&q=80',
        accentColor: '#9B2D4F',
        tag: 'Illuminated by rich berry & ruby tones',
        sortOrder: 2,
        isActive: true,
        lipShade: {
          title: 'Plum Opulence',
          description: 'Deep berry-wine pigment that illuminates cool, roseate complexions.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1631214540553-ff044a3ff1d4?auto=format&fit=crop&w=800&q=85',
          badge: '',
          ctaLabel: 'Try On In Live AR',
          ctaUrl: '#shade-finder',
        },
        pairing: {
          title: 'Heritage Maroon',
          description: 'A blue-based ceremonial maroon with a refined, long-wear finish.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=85',
          badge: 'HERITAGE',
          ctaLabel: 'View Product Details',
          ctaUrl: '#',
        },
      },
      {
        id: 'olive-earthy',
        name: 'Olive & Earthy',
        description: 'Greenish-gold or neutral earthy depth.',
        thumbnailUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=400&q=80',
        accentColor: '#8A7B2B',
        tag: 'Flourishes with terracotta & rich plums',
        sortOrder: 3,
        isActive: true,
        lipShade: {
          title: 'Spice Velvet',
          description: 'Earthy terracotta pigment that adds striking definition to olive depth.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=85',
          badge: '',
          ctaLabel: 'Try On In Live AR',
          ctaUrl: '#shade-finder',
        },
        pairing: {
          title: 'Ceremonial Scarlet',
          description: 'Opulent scarlet with 24K gold micro-shimmer for earthy, neutral depth.',
          mediaType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=85',
          badge: 'HERITAGE',
          ctaLabel: 'View Product Details',
          ctaUrl: '#',
        },
      },
    ],
  };

  // [Glamik CMS] 2026-10-03 — seed for the header Shop mega-menu. (Broken seed
  // image for Travel Cleanser replaced 2026-10-05 after a link-check pass.)
  const initialShopMegaMenu: CMSShopMegaMenu = {
    enabled: true,
    columns: [
      {
        id: 'col-lips-makeup',
        title: 'Lips & Makeup',
        iconUrl: '',
        badge: '8 Shades',
        badgeEnabled: true,
        viewAllLabel: 'Explore All Makeup',
        viewAllUrl: '/shop/makeup',
        isActive: true,
        sortOrder: 0,
        items: [
          {
            id: 'item-matte-lip',
            name: 'Matte Liquid Lipsticks',
            url: '/shop/makeup/lips',
            imageUrl: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=200&q=80',
            altText: 'Matte liquid lipstick',
            badge: 'Bestseller',
            isActive: true,
            sortOrder: 0,
          },
          {
            id: 'item-velvet-lip',
            name: 'Velvet Lip Stains & Liners',
            url: '/shop/makeup/lips',
            imageUrl: 'https://images.unsplash.com/photo-1631214540553-ff044a3ff1d4?auto=format&fit=crop&w=200&q=80',
            altText: 'Velvet lip stain',
            badge: '',
            isActive: true,
            sortOrder: 1,
          },
          {
            id: 'item-sindoor',
            name: 'Luxury Sindoor',
            subtitle: 'Scarlet & Maroon',
            url: '/shop/makeup/face',
            imageUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=200&q=80',
            altText: 'Luxury sindoor',
            badge: '',
            isActive: true,
            sortOrder: 2,
          },
        ],
      },
      {
        id: 'col-skin-cleansing',
        title: 'Skin & Cleansing',
        iconUrl: '',
        badge: 'Balm',
        badgeEnabled: true,
        viewAllLabel: 'Explore All Skincare',
        viewAllUrl: '/shop/skin',
        isActive: true,
        sortOrder: 1,
        items: [
          {
            id: 'item-balm-50',
            name: 'Balm To Water Cleanser (50g)',
            url: '/shop/skin/cleansing',
            imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=200&q=80',
            altText: 'Balm to water cleanser',
            badge: 'Hero',
            isActive: true,
            sortOrder: 0,
          },
          {
            id: 'item-travel-30',
            name: 'Travel Cleanser Format (30g)',
            url: '/shop/skin/cleansing',
            imageUrl: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=200&q=80',
            altText: 'Travel cleanser',
            badge: '',
            isActive: true,
            sortOrder: 1,
          },
          {
            id: 'item-barrier',
            name: 'Skin Barrier & Ceramide Formulations',
            url: '/shop/skin',
            imageUrl: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=200&q=80',
            altText: 'Skin barrier formulation',
            badge: '',
            isActive: true,
            sortOrder: 2,
          },
        ],
      },
    ],
    promo: {
      label: 'The Glamirk Atelier',
      title: 'Tailored for Indian undertones.',
      description: 'Precision shade matching for warm, neutral, cool, and olive complexions.',
      mediaType: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=85',
      posterUrl: '',
      primaryCtaLabel: 'Shop Entire Catalog',
      primaryCtaUrl: '/shop',
      secondaryCtaLabel: 'Start Diagnostic',
      secondaryCtaUrl: '#find-my-shade',
      badge: '',
      isActive: true,
    },
  };

  const initialAuditLogs: CMSAuditLog[] = [
    {
      id: 'log-1',
      userId: 'usr-admin-1',
      userEmail: 'shelja.sharma@glamirk.com',
      action: 'SYSTEM_BOOTSTRAP',
      objectType: 'DATABASE',
      objectId: 'cms-database',
      objectTitle: 'Glamirk Beauty Central CMS Data Initialized',
      details: 'Initialized persistent CMS models with 11-color theme, catalog, and admin credentials.',
      timestamp: new Date().toISOString(),
    },
  ];

  return {
    users: initialUsers,
    pages: initialPages,
    products: GLAMIRK_PRODUCTS,
    categories: initialCategories,
    navigation: initialNavigation,
    footer: initialFooter,
    offers: initialOffers,
    journalArticles: GLAMIRK_JOURNAL_ARTICLES_EXTENDED,
    faqs: SUPPORT_FAQS.map((faq, i) => ({ ...faq, order: i + 1, isVisible: true })),
    media: initialMedia,
    globalSettings: initialGlobalSettings,
    auditLogs: initialAuditLogs,
    heroContent: initialHeroContent,
    aboutContent: initialAboutContent,
    benefits: initialBenefits,
    benefitsSection: initialBenefitsSection,
    looks: GLAMIRK_LOOKS,
    tryOnModels: TRY_ON_MODELS.map((m, i) => ({ ...m, isActive: true, sortOrder: i })),
    shadeJourney: initialShadeJourney,
    promoBanners: initialPromoBanners,
    shadeFinderTeaser: initialShadeFinderTeaser,
    journalSectionCopy: initialJournalSectionCopy,
    findMyShadeResultsCopy: initialFindMyShadeResultsCopy,
    findMyShadeHero: initialFindMyShadeHero,
    personalizedBeauty: initialPersonalizedBeauty,
    shopMegaMenu: initialShopMegaMenu,
  };
}

/**
 * Drops the in-process cache so the next loadDatabase() re-reads from
 * Postgres.
 *
 * Exists for the data-loss regression tests, which need to exercise the read
 * path repeatedly against deliberately malformed stored documents. Nothing in
 * the running application calls it — saveDatabase keeps the cache in sync.
 */
export function __resetCmsCacheForTests(): void {
  cachedDb = null;
}

export async function loadDatabase(): Promise<InternalCMSDatabaseSchema> {
  // Serve from the in-process cache once loaded — saveDatabase() keeps it in
  // sync on every admin save/delete, so reads never hit Postgres on the hot
  // path. This is only safe because the app runs as a single server process
  // (WEB_CONCURRENCY=1); it does NOT sync across two separately-running
  // processes (e.g. a local dev server and the deployed instance pointed at
  // the same database) — each keeps its own cache until restarted.
  if (cachedDb) return cachedDb;

  await ensureSchema();

  // ------------------------------------------------------------------
  // Read the stored document.
  //
  // This is deliberately its own try/catch, separate from the normalisation
  // below, and it RE-THROWS.
  //
  // The two used to share one catch that fell through to
  // `saveDatabase(getInitialDatabase())`. That meant a failed *read* produced
  // a destructive *write*: a transient Neon connection reset — which the
  // comment at the top of server.ts notes is common — would replace the whole
  // catalogue, every price, offer, COD rule and page of CMS copy with seed
  // data. Recovery was a point-in-time restore.
  //
  // Failing the request is always the right answer here. An error surfaces,
  // gets retried, and nothing is lost; silently reseeding loses everything
  // and looks like success.
  // ------------------------------------------------------------------
  let storedRow: { data: InternalCMSDatabaseSchema } | undefined;
  try {
    const result = await pool.query('SELECT data FROM cms_state WHERE id = $1', [STATE_ROW_ID]);
    storedRow = result.rows[0];
  } catch (err) {
    console.error('[db] could not read cms_state — refusing to reseed over existing data:', err);
    throw err;
  }

  if (storedRow) {
    // A stored document is normalised in place. Any failure here is a bug in
    // the normalisation, not a reason to discard the customer's data, so this
    // also re-throws rather than falling through to a reseed.
    try {
      cachedDb = storedRow.data as InternalCMSDatabaseSchema;

      // Ensure footer and legalPolicies have robust structure if upgrading
      const initial = getInitialDatabase();

      // Defensive rather than assumed. `globalSettings` in particular was read
      // through unguarded (`!cachedDb.globalSettings.codRules`), so a document
      // without it threw a TypeError — and under the old shared catch, that
      // TypeError silently reseeded the entire CMS.
      if (!cachedDb || typeof cachedDb !== 'object') {
        throw new Error('cms_state.data is not an object');
      }
      if (!cachedDb.globalSettings) cachedDb.globalSettings = initial.globalSettings;
      if (!Array.isArray(cachedDb.products)) cachedDb.products = initial.products;
      if (!cachedDb?.footer || !cachedDb.footer.columns || cachedDb.footer.columns.length === 0) {
        cachedDb!.footer = initial.footer;
      } else {
        if (!cachedDb.footer.legalLinks || cachedDb.footer.legalLinks.length === 0) {
          cachedDb.footer.legalLinks = initial.footer.legalLinks;
        }
        if (!cachedDb.footer.legalPolicies) {
          cachedDb.footer.legalPolicies = initial.footer.legalPolicies;
        }
      }
      if (!cachedDb.heroContent) {
        cachedDb.heroContent = initial.heroContent;
      }
      if (!cachedDb.aboutContent) {
        cachedDb.aboutContent = initial.aboutContent;
      }
      if (!cachedDb.benefits || cachedDb.benefits.length === 0) {
        cachedDb.benefits = initial.benefits;
      }
      if (!cachedDb.shadeJourney) {
        cachedDb.shadeJourney = initial.shadeJourney;
      }
      if (!cachedDb.benefitsSection) {
        cachedDb.benefitsSection = initial.benefitsSection;
      }
      if (!cachedDb.looks || cachedDb.looks.length === 0) {
        cachedDb.looks = initial.looks;
      }
      if (!cachedDb.promoBanners) {
        cachedDb.promoBanners = initial.promoBanners;
      }
      if (!cachedDb.shadeFinderTeaser) {
        cachedDb.shadeFinderTeaser = initial.shadeFinderTeaser;
      } else {
        // [Glamik CMS] 2026-10-03 — backfill the look-type matrix onto teasers saved before it existed.
        if (!cachedDb.shadeFinderTeaser.lookTypes || cachedDb.shadeFinderTeaser.lookTypes.length === 0) {
          cachedDb.shadeFinderTeaser.lookTypes = initial.shadeFinderTeaser.lookTypes;
        }
        if (!cachedDb.shadeFinderTeaser.configs || cachedDb.shadeFinderTeaser.configs.length === 0) {
          cachedDb.shadeFinderTeaser.configs = initial.shadeFinderTeaser.configs;
        }
        if (!cachedDb.shadeFinderTeaser.highlight) {
          cachedDb.shadeFinderTeaser.highlight = initial.shadeFinderTeaser.highlight;
        }
        if (!cachedDb.shadeFinderTeaser.chooseLabel) {
          cachedDb.shadeFinderTeaser.chooseLabel = initial.shadeFinderTeaser.chooseLabel;
        }
      }
      if (!cachedDb.journalSectionCopy) {
        cachedDb.journalSectionCopy = initial.journalSectionCopy;
      }
      if (!cachedDb.findMyShadeResultsCopy) {
        cachedDb.findMyShadeResultsCopy = initial.findMyShadeResultsCopy;
      }
      if (!cachedDb.findMyShadeHero) {
        cachedDb.findMyShadeHero = initial.findMyShadeHero;
      }
      // [Glamik CMS] 2026-10-03 — backfill new sections onto existing cms_state
      // rows (no DB migration: cms_state is a single JSONB document).
      if (!cachedDb.personalizedBeauty || !cachedDb.personalizedBeauty.undertones?.length) {
        cachedDb.personalizedBeauty = initial.personalizedBeauty;
      }
      if (!cachedDb.shopMegaMenu || !cachedDb.shopMegaMenu.columns?.length) {
        cachedDb.shopMegaMenu = initial.shopMegaMenu;
      }
      if (!cachedDb.globalSettings.codRules) {
        cachedDb.globalSettings.codRules = initial.globalSettings.codRules;
      }
      if (!cachedDb.tryOnModels || cachedDb.tryOnModels.length === 0) {
        cachedDb.tryOnModels = initial.tryOnModels;
      }
      // Backfill stock on products persisted before the stock field existed
      cachedDb.products = cachedDb.products.map((p) => {
        if (typeof p.stock === 'number') return p;
        const seedMatch = initial.products.find((sp) => sp.id === p.id);
        return { ...p, stock: seedMatch ? seedMatch.stock : p.inStock ? 50 : 0 };
      });
      // Trim stray whitespace on category/subCategory — free-text admin
      // edits (before the Sub-Category field was a taxonomy-constrained
      // dropdown) could save values like "Eyes " that then silently failed
      // the Shop page's exact-match category filter. Whitespace is never
      // semantically meaningful here, so trimming is always safe; it does
      // NOT reassign a product to a different category/subcategory.
      cachedDb.products = cachedDb.products.map((p) => {
        const trimmedCategory = typeof p.category === 'string' ? (p.category.trim() as typeof p.category) : p.category;
        const trimmedSubCategory = typeof p.subCategory === 'string' ? p.subCategory.trim() : p.subCategory;
        if (trimmedCategory === p.category && trimmedSubCategory === p.subCategory) return p;
        return { ...p, category: trimmedCategory, subCategory: trimmedSubCategory };
      });
      // One-time correction for these two specific, already-identified
      // products: free-text admin edits (before Sub-Category became a
      // constrained dropdown) had drifted their taxonomy to values outside
      // PRODUCT_TAXONOMY ("Makeup Remover", and one even moved to
      // Makeup/Eyes), which silently removed them from the Shop "Cleansing"
      // filter. Both are cleansing balms — Skin/Cleansing is unambiguous.
      // This does not touch any other product's category/subCategory.
      const CLEANSER_IDS = ['balm-to-water-cleanser-30g', 'balm-to-water-cleanser-50g'];
      cachedDb.products = cachedDb.products.map((p) =>
        CLEANSER_IDS.includes(p.id) && (p.category !== 'Skin' || p.subCategory !== 'Cleansing')
          ? { ...p, category: 'Skin', subCategory: 'Cleansing' }
          : p
      );
      return cachedDb!;
    } catch (err) {
      console.error('[db] cms_state failed to normalise — refusing to reseed over existing data:', err);
      cachedDb = null;
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // No row at all: a genuinely empty database (first boot, or a fresh local
  // clone). This is the ONLY path that may seed, and it is reached only when
  // the SELECT succeeded and returned nothing — never because something went
  // wrong while reading or processing an existing document.
  // ------------------------------------------------------------------
  console.log('[db] no cms_state row found — seeding initial content for a fresh database');
  const initial = getInitialDatabase();
  await seedInitialDatabase(initial);
  return cachedDb || initial;
}

/**
 * Writes the seed document, but only if no row exists.
 *
 * ON CONFLICT DO NOTHING rather than the usual upsert: this is the one write
 * that carries whole-catalogue blast radius, so it is made structurally
 * incapable of overwriting. If two processes boot against the same empty
 * database, one seeds and the other reads what was seeded — neither clobbers.
 */
async function seedInitialDatabase(initial: InternalCMSDatabaseSchema): Promise<void> {
  await ensureSchema();
  const inserted = await pool.query(
    `INSERT INTO cms_state (id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [STATE_ROW_ID, JSON.stringify(initial)]
  );

  if (inserted.rows.length > 0) {
    cachedDb = initial;
    return;
  }

  // Another process seeded first. Read back what it wrote rather than assuming
  // ours is authoritative.
  const existing = await pool.query('SELECT data FROM cms_state WHERE id = $1', [STATE_ROW_ID]);
  cachedDb = (existing.rows[0]?.data as InternalCMSDatabaseSchema) || initial;
}

export async function saveDatabase(data: InternalCMSDatabaseSchema): Promise<void> {
  // Last line of defence against a whole-catalogue overwrite.
  //
  // Every legitimate caller is saving an edit to a document it just loaded, so
  // it always has products. A call carrying an empty catalogue means something
  // upstream lost the data — and writing that would replace the real one. The
  // seed path does not come through here (it uses seedInitialDatabase, which
  // can only insert), so there is no legitimate empty-catalogue write.
  if (!data || !Array.isArray(data.products)) {
    throw new Error('Refusing to save a CMS document with no products array — this would destroy the catalogue.');
  }
  if (data.products.length === 0) {
    const existing = await pool.query(
      `SELECT jsonb_array_length(COALESCE(data->'products', '[]'::jsonb)) AS n FROM cms_state WHERE id = $1`,
      [STATE_ROW_ID]
    );
    const storedCount = Number(existing.rows[0]?.n) || 0;
    if (storedCount > 0) {
      throw new Error(
        `Refusing to overwrite ${storedCount} stored product(s) with an empty catalogue. ` +
          'Delete products individually if that is genuinely intended.'
      );
    }
  }

  cachedDb = data;
  await ensureSchema();
  try {
    await pool.query(
      `INSERT INTO cms_state (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`,
      [STATE_ROW_ID, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('Failed to write CMS database to Postgres:', err);
    throw err;
  }
}

// Compute live offer validity based on server timezone & current timestamp
export function evaluateOffers(offers: CMSOffer[]): CMSOffer[] {
  const now = new Date().getTime();

  return offers.map((offer) => {
    if (offer.status === 'draft' || offer.status === 'archived') {
      return offer;
    }

    const start = offer.startDate ? new Date(offer.startDate).getTime() : 0;
    const end = offer.endDate ? new Date(offer.endDate).getTime() : Infinity;

    if (now < start) {
      return { ...offer, status: 'scheduled' };
    } else if (now >= start && now <= end) {
      return { ...offer, status: 'active' };
    } else {
      return { ...offer, status: 'expired' };
    }
  });
}
