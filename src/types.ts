/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Shade {
  id: string;
  name: string;
  hex: string;
  undertone: 'Warm' | 'Cool' | 'Neutral' | 'Olive' | 'Universal' | string;
  description: string;
  swatchImage?: string;
}

export type ProductCategory = 'Makeup' | 'Skin' | 'Nails' | 'Discover';
export type ProductSubCategory =
  | 'Lips'
  | 'Eyes'
  | 'Face'
  | 'Cleansing'
  | 'Skincare Essentials'
  | 'Nail Products'
  | 'Nail Care'
  | 'New'
  | 'Bestsellers';

export interface ProductDetails {
  overview: string;
  howToUse: string;
  ingredientsList: string;
  shippingReturns: string;
  coverage?: string;
  finish?: string;
  texture?: string;
  skinType?: string;
  suitableOccasions?: string[];
}

export interface Product {
  id: string;
  name: string;
  slug?: string;
  category: 'Makeup' | 'Skin' | 'Nails';
  subCategory: string;
  subtitle: string;
  description: string;
  ritual: string;
  tag?: 'NEW' | 'BESTSELLER' | 'LIMITED' | "EDITOR'S PICK" | 'SIGNATURE';
  price: number; // Verified pricing
  originalPrice?: number;
  currency: string;
  sizes?: string[];
  selectedSize?: string;
  images: {
    primary: string;
    secondary: string;
    detail?: string;
    texture?: string;
    lifestyle?: string;
    swatch?: string;
  };
  shades?: Shade[];
  benefits: string[];
  isVerified?: boolean;
  inStock: boolean;
  stock: number;
  rating?: number;
  reviewCount?: number;
  finish?: 'Matte' | 'Velvet' | 'Natural Melting' | 'Glossy' | 'Satin' | string;
  coverage?: 'Full Saturated' | 'Buildable' | 'Universal Cleansing' | 'Medium' | string;
  texture?: string;
  skinType?: string[];
  details: ProductDetails;
  relatedProductIds: string[];
  completeTheLookProductIds: string[];
  enableQuickView?: boolean;
  enableTryOn?: boolean;
  isBestSeller?: boolean;
}

export interface CartItem {
  product: Product;
  selectedShade?: Shade;
  selectedSize?: string;
  quantity: number;
}

export interface FilterState {
  category?: string | null;
  subCategory?: string | null;
  /** null = no floor/ceiling set by the shopper; the dual-range slider's own
   * catalog-derived min/max bounds apply instead. */
  priceMin: number | null;
  priceMax: number | null;
  undertones: string[];
  finishes: string[];
  skinTypes: string[];
  coverages: string[];
  shades: string[];
  ratings: string[];
  discounts: string[];
  inStockOnly: boolean;
}

export type SortOption =
  | 'featured'
  | 'bestsellers'
  | 'price-asc'
  | 'price-desc'
  | 'rating'
  | 'newest'
  | 'discount';

export interface LookProductItem {
  productId: string;
  productName: string;
  shadeName?: string;
  role: string;
}

export interface Look {
  id: string;
  title: string;
  tagline: string;
  description: string;
  /** Poster/fallback image — also used as the video's poster frame when a video is set. */
  image: string;
  /** Optional looping video shown instead of the static image on the card. */
  video?: string;
  category: 'EVERYDAY GLAM' | 'DATE NIGHT' | 'WEDDING GLAM' | 'MINIMAL GLAM' | string;
  productsUsed: LookProductItem[];
}

export interface ArticleSection {
  heading?: string;
  subheading?: string;
  paragraphs: string[];
  image?: string;
  imageCaption?: string;
  pullQuote?: string;
  shoppableProductId?: string;
  shoppableShadeId?: string;
  tipBox?: {
    title: string;
    text: string;
  };
}

export type JournalCategory =
  | 'BEAUTY GUIDES'
  | 'MAKEUP'
  | 'SKIN'
  | 'NAILS'
  | 'TRENDS'
  | 'GLAMIRK STORIES'
  | 'Color Theory & Tone'
  | 'Skin Intelligence'
  | 'Rituals & Application'
  | string;

export interface JournalArticle {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  category: JournalCategory;
  readTime: string;
  excerpt: string;
  author: string;
  authorRole?: string;
  date: string;
  image: string;
  heroImageLarge?: string;
  isHero?: boolean;
  isEditorsPick?: boolean;
  isTrending?: boolean;
  content: string[]; // For basic backwards compatibility
  sections?: ArticleSection[];
  tableOfContents?: { id: string; label: string }[];
  shoppableProductIds?: string[];
  relatedArticleIds?: string[];
  relatedLookIds?: string[];
  seoTitle?: string;
  seoDescription?: string;
}

export interface BeautyGuideStep {
  stepNumber: number;
  title: string;
  description: string;
  proTip?: string;
  recommendedProductId?: string;
  recommendedShadeId?: string;
  image?: string;
}

export interface BeautyGuide {
  id: string;
  title: string;
  subtitle: string;
  category:
    | 'UNDERTONES'
    | 'LIP MATCHING'
    | 'EVERYDAY GLAM'
    | 'WEDDING & FESTIVE'
    | 'SKIN RITUALS'
    | 'FINISH & TEXTURE'
    | string;
  readTime: string;
  heroImage: string;
  overview: string;
  videoUrl?: string;
  videoPoster?: string;
  steps: BeautyGuideStep[];
  shoppableProductIds: string[];
  relatedGuideIds?: string[];
  relatedLookIds?: string[];
  faqs?: { question: string; answer: string }[];
}

export interface SocialPost {
  id: string;
  creatorName: string;
  creatorHandle: string;
  creatorAvatar?: string;
  isVerified?: boolean;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  posterUrl?: string;
  aspectRatio: 'portrait' | 'square' | 'landscape';
  caption: string;
  lookTitle?: string;
  lookId?: string;
  taggedProducts: {
    productId: string;
    productName: string;
    shadeName?: string;
    price: number;
    image: string;
  }[];
  date: string;
  platform?: 'Instagram' | 'Editorial Atelier' | 'Community UGC' | string;
}

export interface Creator {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  coverImage: string;
  bio: string;
  beautyAesthetic: string;
  signatureLookId?: string;
  curatedProductIds: string[];
  isVerified: boolean;
}

export interface Campaign {
  id: string;
  title: string;
  subtitle: string;
  tagline: string;
  heroImage: string;
  themeBadge: string;
  brandStory: string;
  whyItExists: string;
  featuredProductIds: string[];
  lookId?: string;
  isActive?: boolean;
  videoUrl?: string;
  ritualSteps?: { step: string; title: string; desc: string }[];
}

export interface QuizOption {
  id: string;
  label: string;
  description?: string;
  swatchOrIcon?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  subtitle: string;
  options: QuizOption[];
}

export interface QuizResult {
  title: string;
  description: string;
  archetype: string;
  matchedProductId: string;
  matchedShadeId?: string;
  matchedLookId: string;
  matchedGuideId: string;
}

export type PageRoute =
  | { page: 'home' }
  | { page: 'about' }
  | { page: 'shop'; category?: string | null; subCategory?: string | null }
  | { page: 'product'; productId: string }
  | { page: 'shop-the-look'; lookId?: string }
  | { page: 'wishlist' }
  | { page: 'find-my-shade'; fromProductId?: string }
  | { page: 'try-on'; productId?: string; shadeId?: string }
  | {
      page: 'my-glam';
      initialTab?:
        | 'PROFILE'
        | 'ORDERS'
        | 'SHADES'
        | 'WISHLIST'
        | 'ADDRESSES'
        | 'PRIVÉ'
        | 'REVIEWS'
        | 'RETURNS'
        | 'SUPPORT';
    }
  | { page: 'cart' }
  | { page: 'checkout'; step?: 'details' | 'delivery' | 'payment' | 'review' }
  | { page: 'order-confirmation'; orderId: string }
  | { page: 'order-tracking'; orderId?: string }
  | { page: 'order-detail'; orderId: string }
  | { page: 'support' }
  | { page: 'journal'; category?: string }
  | { page: 'article'; articleId: string }
  | { page: 'beauty-guides'; guideId?: string }
  | { page: 'social-commerce'; postId?: string }
  | { page: 'campaign'; campaignId: string }
  | { page: 'new-launch' }
  | { page: 'legal'; policy?: 'privacy' | 'terms' | 'shipping' | 'returns' | 'cookies' }
  | { page: 'dynamic-page'; slug: string }
  | { page: 'admin'; subTab?: string; editId?: string; previewMode?: boolean }
  | { page: '404' };

// Phase 3: Skin Tone, Undertone & Personalization Types
export type SkinToneType = 'Fair' | 'Light' | 'Medium' | 'Tan' | 'Deep' | 'Rich' | string;
export type UndertoneType = 'Warm' | 'Cool' | 'Neutral' | 'Olive' | 'Universal' | string;
export type BeautyStyleType =
  | 'Classic Elegance'
  | 'Modern Minimalist'
  | 'High Glamour'
  | 'Effortless Natural'
  | 'Editorial Bold'
  | 'Bold'
  | 'Minimal'
  | 'Soft'
  | 'Natural'
  | 'Glam'
  | string;
export type OccasionType =
  | 'Daily Atelier'
  | 'Evening & Gala'
  | 'Wedding Celebrations'
  | 'Work & Executive'
  | 'Wedding'
  | 'Party'
  | 'Date Night'
  | 'Everyday'
  | 'Office'
  | 'Festive'
  | string;
export type FinishPreferenceType =
  | 'Velvet Matte'
  | 'Hydrating Satin'
  | 'Natural Melting'
  | 'Glossy Luminous'
  | 'Matte'
  | 'Natural'
  | 'Glossy'
  | 'Open'
  | string;

export interface BeautyProfile {
  skinTone: SkinToneType;
  undertone: UndertoneType;
  primaryConcern?: string;
  finishPreference?: FinishPreferenceType;
  finish?: FinishPreferenceType;
  stylePreference?: BeautyStyleType;
  style?: BeautyStyleType;
  occasion: OccasionType;
  createdAt?: string;
  savedAt?: string;
  recommendedProductIds?: string[];
  notes?: string;
  capturedPhoto?: string;
}

export interface RecommendationMatch {
  primaryProduct?: Product;
  product?: Product;
  primaryShade?: Shade;
  matchedShade?: Shade;
  matchScoreTag?: string;
  matchScore?: number;
  matchReason: string;
  whyWePickedIt?: string;
  suitabilityTags?: string[];
  alternativeShades?: {
    product: Product;
    shade: Shade;
    matchReason: string;
  }[];
  complementaryProducts?: Product[];
}

export interface AssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedPrompts?: string[];
  suggestedAction?: {
    type: 'shade_finder' | 'try_on' | 'product_view' | 'category_view' | 'add_to_cart';
    label: string;
    payload?: any;
  };
  recommendedProducts?: {
    product: Product;
    shade?: Shade;
    suggestedShade?: Shade;
    reason?: string;
  }[];
  actionPrompt?: {
    type?: 'try_on' | 'shade_finder' | 'shop' | 'product' | string;
    action?: 'try_on' | 'shade_finder' | 'shop' | 'product' | string;
    label: string;
    product?: Product;
    productId?: string;
    shade?: Shade;
    shadeId?: string;
  };
  productCards?: Product[];
}

export interface TryOnModelPreset {
  id: string;
  name: string;
  skinTone: SkinToneType;
  undertone: UndertoneType;
  image: string;
  description?: string;
}

// Phase 4: Conversion, Checkout & Retention Types
export interface Address {
  id: string;
  name: string;
  type: 'Home' | 'Studio' | 'Work';
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault?: boolean;
}

export type PaymentMethodType = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod' | 'online';

export interface PaymentDetails {
  method: PaymentMethodType;
  status: 'COD_PENDING' | 'PAID';
  upiId?: string;
  cardLast4?: string;
  cardNetwork?: string;
  bankName?: string;
  walletProvider?: string;
  paidAt?: string;
}

export type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED';

// Single source of truth for the order lifecycle — imported by both the
// server (which enforces it) and admin/customer order UIs (which need it
// synchronously to decide what buttons to render, before any request).
// Forward-only: CANCELLED is reachable as a side transition from any status
// in CANCELLABLE_STATUSES, never from further along the sequence.
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED'];

export interface CustomerUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
}

export interface ServerCartItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  product: Product;
  selectedShade?: Shade;
  lineTotal: number;
  unavailable?: boolean;
  maxAvailable?: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  shade?: Shade;
  size?: string;
  price: number;
  quantity: number;
}

export interface OrderTimelineEvent {
  status: OrderStatus;
  timestamp: string;
  note: string;
  completed: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  deliveryAddress: Address;
  payment: PaymentDetails;
  estimatedDelivery: string;
  trackingNumber?: string;
  courierPartner?: string;
  timeline: OrderTimelineEvent[];
  giftPackaging?: boolean;
  giftMessage?: string;
}

export interface Coupon {
  code: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'flat';
  discountValue: number; // e.g. 10 for 10% or 150 for ₹150
  minOrderValue?: number;
  tag?: string;
}

export type LoyaltyTier = 'MEMBER' | 'SIGNATURE' | 'PRIVÉ';

export interface LoyaltyHistoryItem {
  id: string;
  date: string;
  description: string;
  points: number;
  type: 'earn' | 'redeem';
}

export interface LoyaltyAccount {
  tier: LoyaltyTier;
  points: number;
  lifetimeSpend: number;
  nextTierThreshold: number;
  referralCode: string;
  history: LoyaltyHistoryItem[];
}

export interface Review {
  id: string;
  productId: string;
  productName: string;
  shadeName?: string;
  rating: number; // 1-5
  customerName: string;
  date: string;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  skinTone?: string;
  undertone?: string;
  photoUrl?: string;
}

export type ReturnStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'PICKUP_SCHEDULED' | 'REFUNDED';

export const RETURN_STATUSES: ReturnStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PICKUP_SCHEDULED', 'REFUNDED'];

export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  productImage: string;
  reason: string;
  status: ReturnStatus;
  requestedAt: string;
  comment?: string;
  photoUrl?: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  orderId?: string;
}

export interface SupportFaq {
  id: string;
  category:
    | 'ORDERS'
    | 'DELIVERY'
    | 'PAYMENTS'
    | 'RETURNS'
    | 'PRODUCTS'
    | 'FIND MY SHADE'
    | 'ACCOUNT';
  question: string;
  answer: string;
  order?: number;
  isVisible?: boolean;
}

// ==========================================
// CMS (CONTENT MANAGEMENT SYSTEM) INTERFACES
// ==========================================

export type CMSContentStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export type CMSSectionType =
  | 'hero'
  | 'promotional_banner'
  | 'category_grid'
  | 'glamirk_edit'
  | 'product_grid'
  | 'cleanser_showcase'
  | 'shade_finder_teaser'
  | 'shop_the_look'
  | 'glamirk_on_you'
  | 'journal_section'
  | 'trust_quality_strip'
  | 'faq_section'
  | 'brand_statement'
  | 'brand_intro'
  | 'rich_text'
  | 'custom_cta'
  | 'video_section'
  | 'testimonials';

export interface CMSPageSection {
  id: string;
  type: CMSSectionType;
  title: string;
  order: number;
  isVisible: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
  props: Record<string, any>;
}

export interface CMSPage {
  id: string;
  title: string;
  slug: string;
  status: CMSContentStatus;
  scheduleStart?: string;
  scheduleEnd?: string;
  seoTitle: string;
  seoDescription: string;
  ogImage?: string;
  isSystemPage?: boolean;
  sections: CMSPageSection[];
  createdAt: string;
  updatedAt: string;
}

export interface CMSNavigationDropdownItem {
  id: string;
  label: string;
  url: string;
  order: number;
  isVisible: boolean;
  description?: string;
  badge?: string;
}

export interface CMSNavigationItem {
  id: string;
  label: string;
  url: string;
  type: 'internal' | 'category' | 'page' | 'external';
  order: number;
  isVisible: boolean;
  badge?: string;
  children?: CMSNavigationDropdownItem[];
}

export interface CMSFooterLink {
  id: string;
  label: string;
  url: string;
  isExternal?: boolean;
  actionKey?: string;
}

export interface CMSFooterColumn {
  id: string;
  title: string;
  icon?: string;
  order: number;
  links: CMSFooterLink[];
}

export interface CMSLegalPolicySection {
  heading: string;
  body: string;
}

export interface CMSLegalPolicyContent {
  id: string;
  title: string;
  subtitle?: string;
  effectiveDate?: string;
  content?: string;
  sections?: CMSLegalPolicySection[];
}

export interface CMSFooterConfig {
  brandDescription?: string;
  tagline?: string;
  newsletterTitle?: string;
  newsletterSubtitle?: string;
  columns: CMSFooterColumn[];
  socialLinks: { platform: string; url: string; handle?: string }[];
  contactEmail?: string;
  contactPhone?: string;
  copyrightText?: string;
  copyright?: string;
  legalLinks: { id: string; label: string; url: string; policyKey?: string }[];
  legalPolicies?: Record<string, CMSLegalPolicyContent>;
  paymentMethods?: string[];
  trustBadges?: { id: string; icon: string; title: string; subtitle: string }[];
}

export interface CMSOffer {
  id: string;
  name: string;
  publicTitle: string;
  tag: string;
  description: string;
  bannerImage?: string;
  discountType: 'percentage' | 'flat' | 'gift' | 'gift_with_purchase';
  discountValue: number;
  minOrderValue: number;
  couponCode?: string;
  startDate: string; // ISO 8601 or YYYY-MM-DDTHH:mm
  endDate: string; // ISO 8601 or YYYY-MM-DDTHH:mm
  timezone: string; // 'Asia/Kolkata'
  status: 'draft' | 'scheduled' | 'active' | 'expired' | 'archived';
  showCountdown: boolean;
  ctaText?: string;
  ctaUrl?: string;
  applicableProductIds?: string[];
  applicableCategoryIds?: string[];
  isSitewide?: boolean;
  bannerBgColor?: string;
  bannerTextColor?: string;
  applicableCategory?: string;
  isStackable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CMSCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  order: number;
  isVisible: boolean;
  subCategories: string[];
}

export interface CMSMediaItem {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  altText: string;
  dimensions?: string;
  uploadedAt: string;
  publicId?: string;
}

export interface CMSAnnouncementMessage {
  id: string;
  text: string;
  link?: string;
  isVisible: boolean;
}

export interface CMSGlobalSettings {
  brandName: string;
  tagline: string;
  logoText: string;
  logoUrl?: string;
  contactEmail: string;
  contactPhone: string;
  /** WhatsApp number that receives new-order notifications, e.g. "+919876543210". Leave blank to disable the WhatsApp step at checkout. */
  whatsappOrderNumber?: string;
  address: string;
  currency: string;
  currencySymbol: string;
  storeTimezone: string; // 'Asia/Kolkata'
  freeShippingThreshold: number;
  shippingNotice: string;
  announcementBarMessages: CMSAnnouncementMessage[];
  defaultSeoTitle: string;
  defaultSeoDescription: string;
  approvedPalette: {
    primaryLuxuryBlack: string;
    primarySoftBlack: string;
    primaryGold: string;
    primaryBrightGold: string;
    secondaryPink: string;
    secondarySoftPink: string;
    secondaryWhite: string;
    backgroundWarmWhite: string;
    textRichBlack: string;
    mutedTextGrey: string;
    borderSoftGold: string;
  };
  /** Server-enforced Cash on Delivery eligibility — the frontend never decides this on its own. */
  codRules: CODRules;
}

export interface CODRules {
  /** Order total (after discount) below which COD is refused. 0 = no minimum. */
  minOrderAmount: number;
  /** Order total (after discount) above which COD is refused. 0 = no maximum. */
  maxOrderAmount: number;
  /** Pin codes COD can be delivered to. Empty array = every pin code is serviceable. */
  serviceablePinCodes: string[];
  /** Pin codes COD is explicitly refused for, even if serviceablePinCodes is empty. */
  blockedPinCodes: string[];
  /** Product IDs that can only be bought via a future online-payment method, never COD. */
  codDisabledProductIds: string[];
}

export interface CMSAuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  objectType: string;
  objectId: string;
  objectTitle: string;
  details?: string;
  timestamp: string;
}

export interface CMSUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'customer';
  avatar?: string;
  createdAt: string;
}

export interface CMSAboutAccordionItem {
  id: string;
  label: string;
  content: string;
}

export interface CMSAboutFounder {
  id: string;
  name: string;
  title: string;
  focus: string;
  image: string;
  imagePublicId?: string;
}

export interface CMSAboutFactCard {
  id: string;
  title: string;
  description: string;
}

export interface CMSAboutValue {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface CMSAboutPremiumCard {
  id: string;
  title: string;
  description: string;
}

export interface CMSAboutDifferentiator {
  id: string;
  title: string;
  description: string;
}

export interface CMSAboutNeverItem {
  id: string;
  text: string;
}

export interface CMSAboutContent {
  statementParagraphs: string[];
  brandSnapshot: CMSAboutFactCard[];
  founders: CMSAboutFounder[];
  founderStoryAccordion: CMSAboutAccordionItem[];
  ourStoryAccordion: CMSAboutAccordionItem[];
  mission: string;
  vision: string;
  values: CMSAboutValue[];
  premiumStandardIntro: string;
  premiumStandardCards: CMSAboutPremiumCard[];
  differentiators: CMSAboutDifferentiator[];
  neverBecome: CMSAboutNeverItem[];
  futureVisionAccordion: CMSAboutAccordionItem[];
  elevatorPitchQuote: string;
  primaryCtaText: string;
  secondaryCtaText: string;
}

export interface CMSBenefit {
  id: string;
  title: string;
  description: string;
  icon: string;
  imageUrl?: string;
  imagePublicId?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CMSHeroTrustItem {
  id: string;
  icon: string;
  text: string;
}

export interface CMSHeroTrustBarItem {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}

export type CMSHeroHPosition = 'left' | 'center' | 'right';

/** Portion 2 — one image in the independent decorative background carousel
 * behind the hero. Array order is display order (same convention as slides). */
export interface CMSHeroBackground {
  id: string;
  image: string;
  /** Whether this background appears in the live carousel. Default true. */
  isActive?: boolean;
}

/** Layout controls shared by the primary slide and every additional slide. */
export interface CMSHeroLayout {
  /** Where the main image sits within the hero. Default: 'right'. */
  outerImagePosition?: CMSHeroHPosition;
  /** Alignment of the heading/description/CTA block. Default: 'left'. */
  textPosition?: CMSHeroHPosition;
}

export interface CMSHeroSlide extends CMSHeroLayout {
  id: string;
  badgeText: string;
  headingLine1: string;
  headingPrefix: string;
  headingHighlight: string;
  description: string;
  primaryCtaText: string;
  secondaryCtaText: string;
  image: string;
  imageBadgeLabel: string;
  imageProductName: string;
  imagePrice: string;
  /** Optional destination for the primary CTA on this slide. External (http/https) opens a new tab; internal paths navigate in-app. Omit to keep the default Shop action. */
  primaryCtaLink?: string;
  /** Whether this slide appears in the live carousel. Default true. */
  isActive?: boolean;
}

export interface CMSHeroContent extends CMSHeroLayout {
  badgeText: string;
  headingLine1: string;
  headingPrefix: string;
  headingHighlight: string;
  description: string;
  primaryCtaText: string;
  secondaryCtaText: string;
  trustIndicators: CMSHeroTrustItem[];
  image: string;
  imageBadgeLabel: string;
  imageProductName: string;
  imagePrice: string;
  primaryCtaLink?: string;
  trustBar: CMSHeroTrustBarItem[];
  slides?: CMSHeroSlide[];
  /** Whether slide 1 appears in the live carousel. Default true. */
  isActive?: boolean;
  /** Portion 2 — independent decorative background carousel behind the hero. */
  backgrounds?: CMSHeroBackground[];
  /** Portion 2 crossfade interval in ms. Default 3000. Independent of the Portion 1 slide timer. */
  backgroundIntervalMs?: number;
}

export interface CMSJourneyStep {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface CMSShadeJourney {
  eyebrow: string;
  title: string;
  titleHighlight: string;
  steps: CMSJourneyStep[];
}

/** One selectable undertone profile in the homepage Shade Intelligence teaser. */
export interface CMSShadeUndertoneProfile {
  id: string;
  /** Short pill label, e.g. "Warm". */
  label: string;
  title: string;
  description: string;
  recommendedLip: string;
  recommendedSindoor: string;
  /** Exactly the swatch dots shown next to the match card title. */
  swatchHexes: string[];
  /** Right-column visual for this profile. */
  visual: string;
}

/** Homepage "Shade Intelligence" teaser section — distinct from CMSShadeJourney,
 * which powers the separate /find-my-shade page's step-by-step journey. */
export interface CMSShadeFinderTeaser {
  badgeText: string;
  heading: string;
  subheading: string;
  description: string;
  ctaText: string;
  profiles: CMSShadeUndertoneProfile[];
}

export interface CMSBenefitsSection {
  eyebrow: string;
  title: string;
  titleHighlight: string;
}

/** One slide in the homepage promotional popup carousel. Only created once an
 * image is uploaded, so there is no "empty slot" state to filter out. */
export interface CMSPromoBanner {
  id: string;
  image: string;
  altText?: string;
  /** Optional destination — external (http/https) opens a new tab, internal navigates in-app. */
  link?: string;
  /** Whether this banner appears in the live popup. Default true. */
  isActive?: boolean;
}

export interface CMSPromoBannerConfig {
  /** Master on/off switch — popup never shows when false, regardless of banners. */
  enabled: boolean;
  banners: CMSPromoBanner[];
  /** Auto-advance interval in ms. Default 4000. */
  intervalMs?: number;
}

/** Homepage "The Glamirk Journal" section heading — the 3 preview articles
 * themselves are already CMS-managed via journalArticles. */
export interface CMSJournalSectionCopy {
  badgeText: string;
  heading: string;
  subtitle: string;
}

/** Headings on the Find My Shade quiz results view (Step 8 of FindMyShadePage) —
 * distinct from CMSShadeJourney, which covers the "how it works" steps shown
 * before the quiz starts. */
export interface CMSFindMyShadeResultsCopy {
  resultsBadge: string;
  resultsHeading: string;
  resultsSubtitle: string;
  alternativesEyebrow: string;
  alternativesHeading: string;
}

/** The landing hero at the very top of the Find My Shade page (Step 0,
 * before the quiz starts) — badge/heading/description/photo and its small
 * caption overlay. Distinct from CMSShadeJourney (the steps below it) and
 * CMSFindMyShadeResultsCopy (shown after the quiz completes). */
export interface CMSFindMyShadeHero {
  badgeText: string;
  headingLine1: string;
  headingHighlight: string;
  description: string;
  image: string;
  primaryCtaText: string;
  secondaryCtaText: string;
  captionLabel: string;
  captionText: string;
}

export interface CMSDatabaseSchema {
  users: CMSUser[];
  pages: CMSPage[];
  products: Product[];
  categories: CMSCategory[];
  navigation: CMSNavigationItem[];
  footer: CMSFooterConfig;
  offers: CMSOffer[];
  journalArticles: JournalArticle[];
  faqs: SupportFaq[];
  media: CMSMediaItem[];
  globalSettings: CMSGlobalSettings;
  auditLogs: CMSAuditLog[];
  heroContent: CMSHeroContent;
  aboutContent: CMSAboutContent;
  benefits: CMSBenefit[];
  benefitsSection: CMSBenefitsSection;
  looks: Look[];
  shadeJourney: CMSShadeJourney;
  promoBanners: CMSPromoBannerConfig;
  shadeFinderTeaser: CMSShadeFinderTeaser;
  journalSectionCopy: CMSJournalSectionCopy;
  findMyShadeResultsCopy: CMSFindMyShadeResultsCopy;
  findMyShadeHero: CMSFindMyShadeHero;
}

