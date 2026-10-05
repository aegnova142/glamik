/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** One gallery image belonging to a specific product variant/shade. */
export interface VariantImage {
  id: string;
  url: string;
  /** Cloudinary public ID, used to delete the asset on removal (mirrors CMSMediaItem). */
  publicId?: string;
  alt?: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface Shade {
  id: string;
  name: string;
  hex: string;
  undertone: 'Warm' | 'Cool' | 'Neutral' | 'Olive' | 'Universal' | string;
  description: string;
  /** Legacy single swatch-dot image (kept for backward compatibility). */
  swatchImage?: string;
  shortDescription?: string;
  sku?: string;
  /** Overrides product.price when set. */
  price?: number;
  /** Overrides product.originalPrice when set. */
  compareAtPrice?: number;
  /** Overrides product.stock when set. */
  stock?: number;
  /** Defaults to true when undefined — lets old data keep working unchanged. */
  isActive?: boolean;
  /** Variant-specific gallery. Falls back to product.images when empty/absent. */
  images?: VariantImage[];
  /** Per-shade size/weight options (e.g. this shade only comes in "50g",
   * another comes in "30g" and "50g"). When set and non-empty, the
   * customer must pick one of these and its price/stock apply instead of
   * this shade's own price/stock. Absent/empty means this shade has no
   * size dimension — its own price/stock apply directly, same as before
   * this field existed. */
  sizes?: SizeOption[];
}

/** A single size/weight option, either on a Shade (per-variant sizing) or
 * resolved from Product.sizes/sizePricing (product-level sizing, used by
 * products with no shades at all). */
export interface SizeOption {
  id: string;
  label: string;
  price: number;
  compareAtPrice?: number;
  stock?: number;
  isActive?: boolean;
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
  /** Legacy free-text usage instructions. Kept as a display fallback for
   * products saved before `usageSteps` existed — new content should use
   * `Product.usageSteps` instead. */
  howToUse: string;
  /** Legacy comma-separated ingredients. Kept as a display fallback for
   * products saved before `Product.ingredients` existed. */
  ingredientsList: string;
  /** Per-product shipping/returns override. Empty means the storefront
   * falls back to the global shipping/returns copy (globalSettings). */
  shippingReturns: string;
  coverage?: string;
  finish?: string;
  texture?: string;
  skinType?: string;
  suitableOccasions?: string[];
}

/** One row in the dynamic "Details & Attributes" table — different product
 * types need different attributes (a lipstick needs Finish/Coverage, a
 * cleanser needs Skin Type/Texture), so this is a free-form name/value
 * list rather than a fixed set of fields. */
export interface ProductAttribute {
  id: string;
  name: string;
  value: string;
  sortOrder: number;
}

/** One step in the "How to Use / The Ritual" instructions. */
export interface UsageStep {
  id: string;
  text: string;
  image?: string;
  sortOrder: number;
}

export type TryOnType =
  | 'lipstick'
  | 'kajal'
  | 'eyeliner'
  | 'foundation'
  | 'concealer'
  | 'blush'
  | 'highlighter'
  | 'skin'
  | 'other';

export type TryOnRegion = 'lips' | 'eyes' | 'fullFace' | 'cheeks' | 'underEyes' | 'custom';

/** Admin-configured Virtual Try-On behavior for a product. Color always
 * comes from the selected shade's own hex (never configured separately —
 * a shade's Try-On color and its swatch color must never disagree), so
 * this only holds *how* that color gets applied. Absent means Try-On
 * falls back to a subCategory-based default (Lips→lipstick, Eyes→kajal,
 * Face→foundation) rather than being unavailable. */
export interface TryOnConfig {
  enabled: boolean;
  type: TryOnType;
  region: TryOnRegion;
  /** 0-100. How strong the mask/stroke effect is (e.g. eyeliner thickness). */
  intensity: number;
  /** 0-100. How opaque the applied color is. */
  opacity: number;
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
  /** Per-size price/stock overrides, keyed by the exact label in `sizes[]`
   * (e.g. "30g"). Admin-controlled — falls back to `price`/`stock` above
   * for any size with no entry here. */
  sizePricing?: Record<string, { price: number; compareAtPrice?: number; stock?: number }>;
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
  /** Dynamic "Details & Attributes" rows. Takes precedence over the legacy
   * finish/coverage/texture/skinType fields above when non-empty. */
  attributes?: ProductAttribute[];
  /** Structured "How to Use" steps. Takes precedence over
   * `details.howToUse` when non-empty. */
  usageSteps?: UsageStep[];
  /** Structured ingredients list. Takes precedence over
   * `details.ingredientsList` when non-empty. */
  ingredients?: string[];
  /** Admin-configured Virtual Try-On behavior — see TryOnConfig. */
  tryOnConfig?: TryOnConfig;
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
  /** Defaults to 'published' when absent, so articles saved before this
   * field existed keep showing exactly as before. */
  status?: 'draft' | 'published';
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

/** The sections of the customer account area. Each maps 1:1 to a real
 * /account/... URL — see routeToPath/pathToRoute in src/utils/routing.ts. */
export type AccountSection =
  | 'overview'
  | 'orders'
  | 'wishlist'
  | 'rewards'
  | 'addresses'
  | 'profile'
  | 'glam-profile'
  | 'shade-history'
  | 'reviews'
  | 'recently-viewed'
  | 'help'
  | 'notifications'
  | 'settings';

export const ACCOUNT_SECTIONS: AccountSection[] = [
  'overview',
  'orders',
  'wishlist',
  'rewards',
  'addresses',
  'profile',
  'glam-profile',
  'shade-history',
  'reviews',
  'recently-viewed',
  'help',
  'notifications',
  'settings',
];

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
  | { page: 'account'; section?: AccountSection; orderId?: string; track?: boolean }
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
  // '/admin' is intentionally NOT a storefront route. The admin is its own
  // application (workspace `admin/`), served by the backend at /admin, so it
  // is reached by navigation rather than by the storefront router.
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
  isActive?: boolean;
  sortOrder?: number;
}

// Phase 4: Conversion, Checkout & Retention Types
// 'Studio' predates the account system and is kept so addresses already
// saved with that label keep rendering; new addresses are labelled
// Home/Work/Other.
export type AddressType = 'Home' | 'Work' | 'Other' | 'Studio';

export const ADDRESS_TYPE_OPTIONS: Exclude<AddressType, 'Studio'>[] = ['Home', 'Work', 'Other'];

export interface Address {
  id: string;
  name: string;
  type: AddressType;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  /** Locality / sector / area — kept separate from the street line so it can
   * be used for serviceability lookups, not just display. */
  area?: string;
  landmark?: string;
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
  // Carried on the session so the navbar and bottom nav can render the
  // avatar and verification state without a second request.
  avatarUrl?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

export interface ServerCartItem {
  id: string;
  productId: string;
  variantId: string | null;
  selectedSize?: string | null;
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

// Admin-configurable copy shown to shoppers for this promotion's lifecycle
// events. `enabled: false` (or a blank field) means fall back to the
// hardcoded system default for that message — this lets an admin override
// just one message without having to fill in all four.
// Supported placeholder tokens, substituted at render time: {code},
// {minOrder}, {amountNeeded}.
export interface PromotionNotificationSettings {
  enabled: boolean;
  successMessage?: string;
  eligibilityWarningMessage?: string;
  autoRemovalMessage?: string;
  errorMessage?: string;
}

export const DEFAULT_PROMO_NOTIFICATION_MESSAGES: Required<Omit<PromotionNotificationSettings, 'enabled'>> = {
  successMessage: '🎉 Offer applied successfully!',
  eligibilityWarningMessage: 'Add ₹{amountNeeded} more to unlock this offer.',
  autoRemovalMessage: 'Your cart no longer qualifies for this offer.',
  errorMessage: 'This promotion code is invalid or unavailable.',
};

// Substitutes {code}/{minOrder}/{amountNeeded} tokens in an admin-authored
// promotion message template. Shared shape used both for the live rendered
// toast/error text and the admin panel's message preview, so what an admin
// sees while editing always matches what shoppers actually see.
export function applyPromoMessageTemplate(
  template: string,
  vars: { code?: string; minOrder?: number; subtotal?: number }
): string {
  const amountNeeded = Math.max(0, (vars.minOrder || 0) - (vars.subtotal || 0));
  return template
    .replace(/\{code\}/g, vars.code || '')
    .replace(/\{minOrder\}/g, String(vars.minOrder ?? ''))
    .replace(/\{amountNeeded\}/g, String(amountNeeded));
}

export interface Coupon {
  code: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'flat';
  discountValue: number; // e.g. 10 for 10% or 150 for ₹150
  minOrderValue?: number;
  tag?: string;
  notificationSettings?: PromotionNotificationSettings;
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

// ==========================================
// ACCOUNT SYSTEM
// ==========================================

/** The full profile behind a signed-in customer. CustomerUser stays the
 * lightweight session shape every existing caller already uses; this is the
 * richer record the account area reads and writes. */
export interface CustomerProfile {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  deletionRequestedAt?: string;
}

export interface CustomerSession {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  lastSeenAt: string;
  /** True for the session the request itself was made from. */
  isCurrent: boolean;
}

export type SkinTypeOption = 'Oily' | 'Dry' | 'Combination' | 'Normal' | 'Sensitive';

export const SKIN_TYPE_OPTIONS: SkinTypeOption[] = ['Oily', 'Dry', 'Combination', 'Normal', 'Sensitive'];

export const MAKEUP_PREFERENCE_OPTIONS = [
  'Everyday Minimal',
  'Bold Lip',
  'Full Glam',
  'Dewy Skin',
  'Matte Finish',
  'Bridal',
  'Festive',
] as const;

export const BEAUTY_INTEREST_OPTIONS = [
  'Lipsticks',
  'Skincare',
  'Nails',
  'Eyes',
  'Face',
  'Fragrance-free',
  'Clean Beauty',
] as const;

/** Stored per authenticated customer and used to personalise recommendations.
 * Deliberately preference-only — Glamirk makes no medical or diagnostic
 * claims about anyone's skin. */
export interface GlamProfile {
  skinTone?: string;
  undertone?: string;
  skinType?: SkinTypeOption | string;
  primaryConcern?: string;
  finishPreference?: string;
  stylePreference?: string;
  occasion?: string;
  makeupPreferences: string[];
  beautyInterests: string[];
  preferredLooks: string[];
  preferredShadeIds: string[];
  notes?: string;
  updatedAt?: string;
}

export interface ShadeHistoryEntry {
  id: string;
  createdAt: string;
  skinTone?: string;
  undertone?: string;
  occasion?: string;
  finishPreference?: string;
  stylePreference?: string;
  answers: Record<string, string>;
  recommendedProductId?: string;
  recommendedShadeId?: string;
  recommendedShadeName?: string;
  recommendedShadeHex?: string;
  matchReason?: string;
  recommendedProductIds: string[];
}

export type NotificationChannel = 'inApp' | 'email' | 'sms' | 'whatsapp' | 'push';

export type NotificationTopic =
  | 'orderUpdates'
  | 'deliveryUpdates'
  | 'offers'
  | 'priceDrops'
  | 'backInStock'
  | 'recommendations'
  | 'newLaunches'
  | 'reviewReminders'
  | 'glamirkNews';

export interface NotificationTopicPreference {
  enabled: boolean;
  channels: NotificationChannel[];
}

export type NotificationPreferences = Record<NotificationTopic, NotificationTopicPreference>;

export const NOTIFICATION_TOPIC_META: {
  id: NotificationTopic;
  label: string;
  description: string;
  /** Transactional topics can't be switched off entirely — a customer must
   * always be reachable about an order they actually placed. */
  required?: boolean;
}[] = [
  { id: 'orderUpdates', label: 'Order Updates', description: 'Confirmations, packing and dispatch updates for orders you place.', required: true },
  { id: 'deliveryUpdates', label: 'Delivery Updates', description: 'Out-for-delivery and delivered alerts.', required: true },
  { id: 'offers', label: 'Offers & Discounts', description: 'Seasonal campaigns and promotional codes.' },
  { id: 'priceDrops', label: 'Wishlist Price Drops', description: 'When something saved to your wishlist drops in price.' },
  { id: 'backInStock', label: 'Back in Stock', description: 'When a sold-out shade or size returns.' },
  { id: 'recommendations', label: 'Beauty Recommendations', description: 'Shade and routine suggestions based on your Glam profile.' },
  { id: 'newLaunches', label: 'New Product Launches', description: 'First access to new formulations and shade drops.' },
  { id: 'reviewReminders', label: 'Reviews & Feedback', description: 'Gentle reminders to review what you have received.' },
  { id: 'glamirkNews', label: 'Glamirk News', description: 'Editorial stories and atelier announcements.' },
];

/** Privacy-conscious defaults: everything transactional is on, everything
 * marketing is off until the customer opts in, and the only default channel
 * is in-app (no unsolicited email/SMS/WhatsApp). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  orderUpdates: { enabled: true, channels: ['inApp', 'email'] },
  deliveryUpdates: { enabled: true, channels: ['inApp', 'email'] },
  offers: { enabled: false, channels: ['inApp'] },
  priceDrops: { enabled: false, channels: ['inApp'] },
  backInStock: { enabled: false, channels: ['inApp'] },
  recommendations: { enabled: false, channels: ['inApp'] },
  newLaunches: { enabled: false, channels: ['inApp'] },
  reviewReminders: { enabled: false, channels: ['inApp'] },
  glamirkNews: { enabled: false, channels: ['inApp'] },
};

export interface RewardTransaction {
  id: string;
  points: number;
  type: 'ORDER' | 'REVIEW' | 'SIGNUP' | 'REDEEM' | 'ADJUSTMENT';
  description: string;
  orderId?: string;
  createdAt: string;
}

export interface RewardsSummary {
  /** Always the sum of the ledger below — never an independently stored number. */
  points: number;
  tier: LoyaltyTier;
  lifetimeSpend: number;
  nextTierThreshold: number;
  pointsToNextTier: number;
  transactions: RewardTransaction[];
}

export type CouponAvailability = 'available' | 'used' | 'expired' | 'ineligible';

export interface AccountCoupon extends Omit<Coupon, 'discountType'> {
  // Wider than Coupon's, because an account lists every published promotion —
  // including gift offers, which checkout's coupon path never produces.
  discountType: Coupon['discountType'] | 'gift' | 'gift_with_purchase';
  availability: CouponAvailability;
  startDate?: string;
  endDate?: string;
  usedOn?: string;
  usedOrderId?: string;
  /** Why this code can't be used right now — only set for 'ineligible'. */
  ineligibleReason?: string;
}

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export const SUPPORT_TICKET_TOPICS = [
  'Where is my order?',
  'Cancel order',
  'Return / replace',
  'Payment issue',
  'Damaged product',
  'Wrong product',
  'Other',
] as const;

export type SupportTicketTopic = (typeof SUPPORT_TICKET_TOPICS)[number];

export interface SupportTicket {
  id: string;
  orderId?: string;
  orderNumber?: string;
  topic: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  adminResponse?: string;
  createdAt: string;
  updatedAt: string;
}

/** What the account dashboard's summary strip renders. Every number is
 * computed server-side from the customer's own rows. */
export interface AccountOverview {
  totalOrders: number;
  activeOrders: number;
  wishlistCount: number;
  rewardPoints: number;
  availableCoupons: number;
  unreadNotifications: number;
  pendingReviews: number;
}

/** A product the customer has actually received and may therefore review. */
export interface ReviewableProduct {
  productId: string;
  productName: string;
  productImage: string;
  orderId: string;
  orderNumber: string;
  deliveredAt: string;
  existingReview?: Review;
}

/** Shipment state for the tracking screen. `source` is explicit so the UI
 * never presents an internal status as if it were a live courier scan. */
export interface OrderTracking {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  timeline: OrderTimelineEvent[];
  estimatedDelivery: string;
  trackingNumber?: string;
  courierPartner?: string;
  courierTrackingUrl?: string;
  source: 'internal' | 'courier';
  /** Human-readable note explaining what `source` means for this order. */
  sourceNote: string;
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
  notificationSettings?: PromotionNotificationSettings;
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
  /** Independent from `logoUrl` (navbar) — the footer is dark-background and
   * often needs a light/reversed variant of the mark rather than the same file. */
  footerLogoUrl?: string;
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
// [Glamik CMS] 2026-10-03 — Find Your Perfect Match: look-types + undertone×look
// matrix (extends CMSShadeFinderTeaser; all new fields optional for back-compat).
/** One "looking for" option (Lip Shade / Sindoor / Complete Look / Occasion). */
export interface CMSShadeLookType {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CMSShadeMatchSwatch {
  color: string;
  name?: string;
}

/** One cell of the undertone × look-type personalization matrix. Any empty
 * field falls back to the undertone profile's own value on the frontend. */
export interface CMSShadeMatchConfig {
  undertoneId: string;
  lookTypeId: string;
  matchTitle?: string;
  matchDescription?: string;
  primaryLabel?: string;
  primary?: string;
  secondaryLabel?: string;
  secondary?: string;
  beforeImage?: string;
  afterImage?: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** Title under the before/after visual, e.g. "Warm & Golden Spectrum". */
  visualTitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  swatches?: CMSShadeMatchSwatch[];
  isActive: boolean;
}

export interface CMSShadeFinderTeaser {
  badgeText: string;
  heading: string;
  subheading: string;
  description: string;
  ctaText: string;
  profiles: CMSShadeUndertoneProfile[];
  /** Highlighted part of the heading, e.g. "Perfect Match". Optional (back-compat). */
  highlight?: string;
  /** Label above the look-type selector, e.g. "Choose what you're looking for:". */
  chooseLabel?: string;
  /** The four "looking for" options. Optional for back-compat. */
  lookTypes?: CMSShadeLookType[];
  /** undertone × look-type configurations (the 16-cell matrix). */
  configs?: CMSShadeMatchConfig[];
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

// [Glamik CMS] 2026-10-03 — Personalized Beauty section types (homepage).
/** One of the two preview cards (Recommended Lip Shade / Ceremonial Pairing)
 * shown for a selected undertone in the homepage Personalized Beauty section.
 * Media can be a still image or a muted autoplay video — the frontend renders
 * the correct element from mediaType. */
export interface CMSPersonalizedBeautyCard {
  title: string;
  description: string;
  mediaType: 'image' | 'video';
  /** Cloudinary URL for the image or video. */
  mediaUrl: string;
  /** Poster frame for video (optional); ignored for images. */
  posterUrl?: string;
  /** Optional corner tag, e.g. "HERITAGE". */
  badge?: string;
  ctaLabel: string;
  ctaUrl: string;
}

/** A selectable undertone. Its two content cards are embedded (not a separate
 * joined collection) because the UI always shows exactly these two per
 * undertone — one row, no join logic, lazier to edit and render. */
export interface CMSPersonalizedUndertone {
  id: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  /** Swatch/accent color for the selected state, e.g. "#C9972B". */
  accentColor: string;
  /** Short note shown in the Match Preview header, e.g. "Best for balanced neutral undertones". */
  tag?: string;
  sortOrder: number;
  isActive: boolean;
  lipShade: CMSPersonalizedBeautyCard;
  pairing: CMSPersonalizedBeautyCard;
}

/** Homepage "Personalized Beauty" section — fully admin-editable copy plus the
 * undertone selector and its per-undertone preview cards. */
export interface CMSPersonalizedBeauty {
  badgeText: string;
  heading: string;
  /** Italic/accent word in the heading, e.g. "Beauty". */
  headingHighlight: string;
  description: string;
  stepNumber: string;
  stepLabel: string;
  selectHeading: string;
  selectSubtext: string;
  aiCtaLabel: string;
  aiCtaUrl: string;
  matchPreviewLabel: string;
  formulationHeading: string;
  lipShadeLabel: string;
  pairingLabel: string;
  quizPrompt: string;
  quizCtaLabel: string;
  quizCtaUrl: string;
  undertones: CMSPersonalizedUndertone[];
}

// [Glamik CMS] 2026-10-03 — Shop mega-menu types (header dropdown).
/** One link row inside a Shop mega-menu column (e.g. "Matte Liquid Lipsticks"). */
export interface CMSShopMegaMenuItem {
  id: string;
  name: string;
  subtitle?: string;
  /** Where the item navigates, e.g. "/shop/makeup" or "#find-my-shade". */
  url: string;
  /** Small product swatch/thumbnail; falls back to a placeholder when empty. */
  imageUrl?: string;
  altText?: string;
  /** Optional pill shown next to the item, e.g. "Bestseller". */
  badge?: string;
  isActive: boolean;
  sortOrder: number;
}

/** A column in the Shop mega-menu (e.g. "Lips & Makeup"). */
export interface CMSShopMegaMenuColumn {
  id: string;
  title: string;
  /** Uploaded icon image shown in the circular badge; falls back to a default. */
  iconUrl?: string;
  badge?: string;
  badgeEnabled: boolean;
  viewAllLabel: string;
  viewAllUrl: string;
  isActive: boolean;
  sortOrder: number;
  items: CMSShopMegaMenuItem[];
}

/** The promotional card on the right of the Shop mega-menu. Image or video. */
export interface CMSShopPromoBanner {
  label: string;
  title: string;
  description: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  posterUrl?: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  badge?: string;
  isActive: boolean;
}

/** Admin-managed Shop mega-menu (header dropdown). */
export interface CMSShopMegaMenu {
  enabled: boolean;
  columns: CMSShopMegaMenuColumn[];
  promo: CMSShopPromoBanner;
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
  /** Admin-managed Virtual Try-On standard model presets — replaces the
   * static src/data/models.ts list as the source of truth once populated. */
  tryOnModels: TryOnModelPreset[];
  /** Homepage Personalized Beauty section (undertone selector + preview cards). */
  personalizedBeauty: CMSPersonalizedBeauty;
  /** Header Shop mega-menu (columns, items, promo card). */
  shopMegaMenu: CMSShopMegaMenu;
}

