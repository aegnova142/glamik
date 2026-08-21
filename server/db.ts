import fs from 'fs';
import path from 'path';
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
  Product,
  JournalArticle,
  SupportFaq,
} from '../src/types';

// Initial seed data imports
import { GLAMIRK_PRODUCTS } from '../src/data/products';
import {
  GLAMIRK_JOURNAL_ARTICLES_EXTENDED,
  GLAMIRK_CAMPAIGNS,
} from '../src/data/editorial';
import { SUPPORT_FAQS } from '../src/data/commerce';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cms-database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
          { id: 'l1', label: 'Matte Liquid Lipsticks', url: '/shop?category=Makeup&sub=Lips', actionKey: 'shop-lips' },
          { id: 'l2', label: 'Luxury Sindoor', url: '/shop?category=Makeup&sub=Face', actionKey: 'shop-sindoor' },
          { id: 'l3', label: 'Balm To Water Cleanser', url: '/shop?category=Skin&sub=Cleansing', actionKey: 'shop-cleanser' },
          { id: 'l4', label: 'Shop All Creations', url: '/shop', actionKey: 'shop-all' },
        ],
      },
      {
        id: 'col-editorial',
        title: 'Editorial & Journal',
        order: 2,
        links: [
          { id: 'l5', label: 'The Glamirk Journal', url: '/journal', actionKey: 'journal' },
          { id: 'l6', label: 'Beauty Guides & Rituals', url: '/beauty-guides', actionKey: 'guides' },
          { id: 'l7', label: 'Glamirk On You (Social)', url: '/social-commerce', actionKey: 'social' },
          { id: 'l8', label: 'Sovereign Velvet Campaign', url: '/campaign/sovereign-velvet-festive', actionKey: 'campaign' },
        ],
      },
      {
        id: 'col-discovery',
        title: 'Discovery & AI',
        order: 3,
        links: [
          { id: 'l9', label: 'Find Your Shade Diagnostic', url: '/find-my-shade', actionKey: 'shade-finder' },
          { id: 'l10', label: 'Shop The Look', url: '/looks', actionKey: 'looks' },
          { id: 'l11', label: 'Glamirk Privé Loyalty', url: '/my-glam', actionKey: 'loyalty' },
          { id: 'l12', label: 'Atelier Philosophy', url: '/#philosophy', actionKey: 'philosophy' },
        ],
      },
      {
        id: 'col-care',
        title: 'Client Care',
        order: 4,
        links: [
          { id: 'l13', label: 'Concierge Support & FAQ', url: '/support', actionKey: 'support' },
          { id: 'l14', label: 'Track Your Order', url: '/order-tracking', actionKey: 'tracking' },
          { id: 'l15', label: 'Shipping & Returns', url: '/legal?policy=shipping', actionKey: 'legal-shipping' },
          { id: 'l16', label: 'My Glam Account', url: '/my-glam', actionKey: 'my-glam' },
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
    copyrightText: '© 2026 Glamirk Beauty Private Limited. All rights reserved.',
    copyright: '© 2026 Glamirk Beauty Private Limited. All rights reserved.',
    legalLinks: [
      { id: 'leg-priv', label: 'Privacy Policy', url: '/legal?policy=privacy', policyKey: 'privacy' },
      { id: 'leg-term', label: 'Terms of Service', url: '/legal?policy=terms', policyKey: 'terms' },
      { id: 'leg-ship', label: 'Shipping Policy', url: '/legal?policy=shipping', policyKey: 'shipping' },
      { id: 'leg-cook', label: 'Cookie Policy', url: '/legal?policy=cookies', policyKey: 'cookies' },
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
  };
}

export function loadDatabase(): InternalCMSDatabaseSchema {
  if (cachedDb) return cachedDb;

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      cachedDb = JSON.parse(raw);
      
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
      return cachedDb!;
    } catch (err) {
      console.error('Error reading CMS database file, reinitializing:', err);
    }
  }

  const initial = getInitialDatabase();
  saveDatabase(initial);
  return initial;
}

export function saveDatabase(data: InternalCMSDatabaseSchema): void {
  cachedDb = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write CMS database to disk:', err);
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
