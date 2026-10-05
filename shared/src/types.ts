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
  | 'payments'
  | 'profile'
  | 'glam-profile'
  | 'shade-history'
  | 'try-on-history'
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
  'payments',
  'profile',
  'glam-profile',
  'shade-history',
  'try-on-history',
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
  /** Default *shipping* address — what checkout preselects. At most one per
   * customer, enforced by a partial unique index. */
  isDefault?: boolean;
  /** Default *billing* address. Independent of isDefault: one address can be
   * both, and when none is marked the billing address falls back to the
   * shipping one. Also at most one per customer. */
  isBillingDefault?: boolean;
}

export type PaymentMethodType = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod' | 'online';

// ==========================================
// THE THREE LIFECYCLES
//
// An order carries three independent states, and conflating them is what
// makes fulfilment systems lie to customers. A payment can fail without the
// order ceasing to exist; a courier can mark an RTO on an order that is
// otherwise perfectly fine; an order can be cancelled while its refund is
// still in flight. Each gets its own vocabulary and its own column.
// ==========================================

/** Where the money is. Independent of fulfilment. */
export type PaymentStatus =
  /** Online order created, customer has not completed payment yet. */
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  /** Customer abandoned the gateway checkout deliberately. */
  | 'CANCELLED'
  /** Gateway order outlived its window without being paid. */
  | 'EXPIRED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  /** Cash on Delivery: nothing is owed to us until the courier collects. */
  | 'COD_PENDING';

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'COD_PENDING',
];

/** Payment states from which no further money movement is expected. */
export const TERMINAL_PAYMENT_STATUSES: PaymentStatus[] = ['FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

/** Where the parcel is. Mirrors the courier aggregator's own vocabulary so a
 * webhook maps onto it without inventing intermediate states. */
export type ShippingStatus =
  | 'NOT_SHIPPED'
  | 'PICKUP_SCHEDULED'
  | 'AWB_ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  /** Return to origin — the courier is bringing it back to us. */
  | 'RTO_INITIATED'
  | 'RTO_DELIVERED'
  | 'CANCELLED';

export const SHIPPING_STATUSES: ShippingStatus[] = [
  'NOT_SHIPPED',
  'PICKUP_SCHEDULED',
  'AWB_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED_DELIVERY',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'CANCELLED',
];

export interface PaymentDetails {
  method: PaymentMethodType;
  status: PaymentStatus;
  upiId?: string;
  cardLast4?: string;
  cardNetwork?: string;
  bankName?: string;
  walletProvider?: string;
  paidAt?: string;
  /** Gateway handles, for support and reconciliation. Never a card number —
   * the gateway only ever returns a masked or tokenised instrument. */
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
}

export type OrderStatus =
  /** Online order awaiting payment. Nothing is reserved or fulfilled yet. */
  | 'PENDING_PAYMENT'
  /** Legacy: what every pre-gateway COD order was created as. Still valid and
   * still rendered; equivalent to CONFIRMED for transition purposes. */
  | 'PLACED'
  | 'CONFIRMED'
  | 'PROCESSING'
  /** Legacy synonym of READY_TO_SHIP, kept for orders already in that state. */
  | 'PACKED'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  /** Returned to origin without being delivered. */
  | 'RTO';

/**
 * The forward fulfilment ladder.
 *
 * PLACED and PACKED are deliberately absent: they are legacy spellings of
 * CONFIRMED and READY_TO_SHIP, normalised through ORDER_STATUS_ALIASES below
 * before any transition check. Keeping them out of the sequence means there is
 * exactly one canonical ladder, while LEGACY_ORDER_STATUSES keeps the old
 * values renderable and advanceable.
 */
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/** Statuses that exist only on rows written before the lifecycle split. */
export const LEGACY_ORDER_STATUSES: OrderStatus[] = ['PLACED', 'PACKED'];

/** Legacy spelling → its position on the canonical ladder. */
export const ORDER_STATUS_ALIASES: Partial<Record<OrderStatus, OrderStatus>> = {
  PLACED: 'CONFIRMED',
  PACKED: 'READY_TO_SHIP',
};

/** Resolves a stored status to its canonical ladder equivalent. Safe to call
 * on any status — non-legacy values pass through unchanged. */
export function canonicalOrderStatus(status: OrderStatus): OrderStatus {
  return ORDER_STATUS_ALIASES[status] || status;
}

/** Every value the status column may legally hold. */
export const ORDER_STATUSES: OrderStatus[] = [
  ...ORDER_STATUS_SEQUENCE,
  ...LEGACY_ORDER_STATUSES,
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'RTO',
];

/**
 * An order may still be cancelled while it is this far along.
 *
 * PENDING_PAYMENT is cancellable (the customer walked away from the gateway);
 * SHIPPED is not — once a courier has it, the resolution is a return or an
 * RTO, not a cancellation.
 */
export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'READY_TO_SHIP',
];

/**
 * Order states that fulfilment has finished with.
 *
 * Used to stop a late courier scan dragging an order backwards — nothing
 * should un-deliver a delivered order. DELIVERED belongs here for that
 * purpose, but note it is NOT closed: see CLOSED_ORDER_STATUSES.
 */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'RETURNED', 'RTO'];

/**
 * Order states from which no transition of any kind is legal.
 *
 * Deliberately narrower than TERMINAL_ORDER_STATUSES: a DELIVERED order is
 * done being fulfilled but can still have a return raised against it, so
 * treating "fulfilment finished" as "nothing may ever happen again" would
 * make returns impossible to start.
 */
export const CLOSED_ORDER_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED', 'RTO'];

/**
 * Maps a courier shipping status onto the order status it implies.
 *
 * Only the states where fulfilment genuinely drives the order forward are
 * listed; everything else leaves the order status alone. This is what lets a
 * shipping webhook update the order without the two vocabularies having to
 * know about each other anywhere else.
 */
export const SHIPPING_TO_ORDER_STATUS: Partial<Record<ShippingStatus, OrderStatus>> = {
  PICKED_UP: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RTO_INITIATED: 'RTO',
  RTO_DELIVERED: 'RTO',
};

export interface PaymentRecordDetail {
  id: string;
  orderId: string;
  provider: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  /** Rupees, not paise — converted at the edge so no UI ever divides by 100. */
  amount: number;
  currency: string;
  status: PaymentStatus;
  method?: string;
  errorCode?: string;
  errorDescription?: string;
  refundedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentDetail {
  id: string;
  orderId: string;
  provider: string;
  providerOrderId?: string;
  providerShipmentId?: string;
  awbCode?: string;
  courierName?: string;
  trackingUrl?: string;
  labelUrl?: string;
  manifestUrl?: string;
  status: ShippingStatus;
  freightCharge?: number;
  appliedWeight?: number;
  isCod: boolean;
  pickupScheduledAt?: string;
  deliveredAt?: string;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerUser {
  id: string;
  name: string;
  // Optional: an account created through mobile + OTP has no email address
  // until the customer adds one in their profile.
  email?: string;
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
  /** Furthest-along return state across this order's return requests, or
   * absent if nothing was returned. The order's own `status` stops at
   * RETURN_REQUESTED, so this is what distinguishes "return raised" from
   * "money actually back". */
  refundStatus?: ReturnStatus;

  // --- The other two lifecycles (see PaymentStatus / ShippingStatus) ---
  /** Authoritative payment state. `payment.status` carries the same value for
   * the existing callers that read the nested object. */
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  /** Rupees actually collected and actually sent back. */
  amountPaid: number;
  amountRefunded: number;
  cancelledAt?: string;
  cancellationReason?: string;
  /** Present once a shipment exists with the courier aggregator. */
  shipment?: ShipmentDetail;
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
  /** Legacy single image. Reviews written before multi-media support still
   * carry their photo here; the API surfaces it as the first `media` entry so
   * renderers only ever need to read `media`. */
  photoUrl?: string;
  media?: ReviewMedia[];
}

export type ReviewMediaType = 'image' | 'video';

export interface ReviewMedia {
  type: ReviewMediaType;
  url: string;
  /** Cloudinary public_id, kept so a removed item can actually be deleted
   * from storage rather than just unlinked. Absent on legacy photoUrl rows,
   * whose public_id was never recorded. */
  publicId?: string;
}

/** Caps enforced on the server — exported so the composer can disable the
 * upload button at the same limit the API rejects at, instead of letting
 * someone pick ten files and fail on the last one. */
export const REVIEW_MEDIA_MAX_ITEMS = 5;
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_VIDEO_MAX_BYTES = 25 * 1024 * 1024;

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
  gender?: Gender;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  deletionRequestedAt?: string;
}

/** 'prefer_not_to_say' is a stored value rather than an absence, so
 * "declined to answer" stays distinguishable from "never asked". */
export type Gender = 'female' | 'male' | 'other' | 'prefer_not_to_say';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

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
  recentlyViewedCount: number;
  openSupportTickets: number;
  /** Returns raised but not yet settled — the dashboard's "money on its way
   * back to you" card. */
  pendingRefunds: number;
}

// ==========================================
// PAYMENTS & REFUNDS
// ==========================================

/**
 * One payment event in the account's Payments section.
 *
 * Derived entirely from the customer's own orders — there is no separate
 * payments table, because Glamirk has no payment gateway yet and every order
 * is Cash on Delivery. This is a truthful view of what was actually charged
 * and collected, not a stand-in for a provider's ledger.
 */
export interface PaymentRecord {
  orderId: string;
  orderNumber: string;
  placedAt: string;
  amount: number;
  method: PaymentMethodType;
  status: PaymentDetails['status'];
  /** Masked identifier for the instrument, e.g. "•••• 4242" or a UPI handle.
   * Never a full card number — only ever what was already stored masked. */
  instrumentLabel?: string;
  paidAt?: string;
  orderStatus: OrderStatus;
}

/** Progress of money going back to the customer, derived from their return
 * requests joined to the originating order. */
export interface RefundRecord {
  returnId: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  productImage?: string;
  /** The line amount being refunded, from the original order item. */
  amount: number;
  status: ReturnStatus;
  requestedAt: string;
  updatedAt: string;
  /** How the money comes back. COD orders have no instrument to reverse to,
   * so these are settled manually — stated plainly rather than implying an
   * automatic reversal that isn't happening. */
  method: PaymentMethodType;
}

export interface PaymentsSummary {
  payments: PaymentRecord[];
  refunds: RefundRecord[];
  totalPaid: number;
  totalRefunded: number;
  /** Amount on COD orders not yet delivered — owed but not yet collected. */
  pendingCod: number;
}

// ==========================================
// VIRTUAL TRY-ON HISTORY
// ==========================================

/** A shade the customer has tried on. No captured frame is stored — see the
 * note in migration 010. */
export interface TryOnHistoryEntry {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  shadeId?: string;
  shadeName?: string;
  shadeHex?: string;
  mode: TryOnMode;
  triedAt: string;
  /** False when the product has since been delisted — the entry still shows,
   * but try-on/add-to-bag are disabled rather than erroring on click. */
  isAvailable: boolean;
}

/** Mirrors the three ways the try-on modal can run: the live camera, a
 * standard model preset, or a photo the customer uploaded. */
export type TryOnMode = 'live' | 'model' | 'upload';

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
  /** Admin-managed Virtual Try-On standard model presets — replaces the
   * static src/data/models.ts list as the source of truth once populated. */
  tryOnModels: TryOnModelPreset[];
}

