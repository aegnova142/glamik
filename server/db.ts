import { Pool } from 'pg';
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
  Product,
  JournalArticle,
  SupportFaq,
} from '../src/types';
import { GLAMIRK_LOOKS } from '../src/data/looks';

// Initial seed data imports
import { GLAMIRK_PRODUCTS } from '../src/data/products';
import {
  GLAMIRK_JOURNAL_ARTICLES_EXTENDED,
  GLAMIRK_CAMPAIGNS,
} from '../src/data/editorial';
import { SUPPORT_FAQS } from '../src/data/commerce';

// Neon Postgres connection. DATABASE_URL must be a Neon connection string
// (postgresql://user:pass@ep-xxxx.neon.tech/dbname?sslmode=require).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Add your Neon Postgres connection string to .env (see .env.example).'
  );
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// Neon suspends/drops idle connections; without this handler an idle
// client's ECONNRESET crashes the whole process (unhandled 'error' event).
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client:', err);
});

const STATE_ROW_ID = 'main';

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS cms_state (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        password_hash TEXT NOT NULL,
        reset_token TEXT,
        reset_token_expiry TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS wishlist_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS cart_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, product_id, variant_id)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id),
        order_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'CONFIRMED',
        subtotal NUMERIC NOT NULL,
        total NUMERIC NOT NULL,
        shipping_address JSONB,
        idempotency_key TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `).then(() => undefined);
  }
  return schemaReady;
}

export { pool };

// Simple in-process mutex so concurrent checkout requests never race on
// reading/decrementing the same product's stock (cachedDb is shared across
// requests in this single Node process).
let stockLockChain: Promise<any> = Promise.resolve();
export function withStockLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = stockLockChain.then(fn, fn);
  stockLockChain = run.catch(() => undefined);
  return run;
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

function getInitialDatabase(): InternalCMSDatabaseSchema {
  const salt = bcrypt.genSaltSync(10);
  const demoAdminPasswordHash = bcrypt.hashSync('12345', salt);

  const initialUsers: StoredUser[] = [
    {
      id: 'usr-admin-1',
      email: 'tryweb@gmail.com',
      name: 'Glamirk Executive Admin',
      role: 'admin',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      passwordHash: demoAdminPasswordHash,
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

  const initialAuditLogs: CMSAuditLog[] = [
    {
      id: 'log-1',
      userId: 'usr-admin-1',
      userEmail: 'tryweb@gmail.com',
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
    shadeJourney: initialShadeJourney,
  };
}

export async function loadDatabase(): Promise<InternalCMSDatabaseSchema> {
  if (cachedDb) return cachedDb;

  await ensureSchema();

  try {
    const result = await pool.query('SELECT data FROM cms_state WHERE id = $1', [STATE_ROW_ID]);
    if (result.rows.length > 0) {
      cachedDb = result.rows[0].data as InternalCMSDatabaseSchema;

      // Ensure footer and legalPolicies have robust structure if upgrading
      const initial = getInitialDatabase();
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
      // Backfill stock on products persisted before the stock field existed
      cachedDb.products = cachedDb.products.map((p) => {
        if (typeof p.stock === 'number') return p;
        const seedMatch = initial.products.find((sp) => sp.id === p.id);
        return { ...p, stock: seedMatch ? seedMatch.stock : p.inStock ? 50 : 0 };
      });
      return cachedDb!;
    }
  } catch (err) {
    console.error('Error reading CMS database from Postgres, reinitializing:', err);
  }

  const initial = getInitialDatabase();
  await saveDatabase(initial);
  return initial;
}

export async function saveDatabase(data: InternalCMSDatabaseSchema): Promise<void> {
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
