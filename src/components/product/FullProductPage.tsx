import React, { useState, useEffect } from 'react';
import { ProductGallery } from './ProductGallery';
import { ShadeSelector } from './ShadeSelector';
import { CompleteTheLook } from './CompleteTheLook';
import { RelatedProducts } from './RelatedProducts';
import { RecentlyViewed } from './RecentlyViewed';
import { ProductReviews } from './ProductReviews';
import { DeliveryCheck } from './DeliveryCheck';
import { WatchTheGlamModal } from '../social/WatchTheGlamModal';
import { Product, Shade, CartItem } from '../../types';
import { GLAMIRK_JOURNAL_ARTICLES_EXTENDED, GLAMIRK_BEAUTY_GUIDES } from '../../data/editorial';
import { resolveVariantGallery, variantGalleryResetKey, getCurrentPrice, getCurrentCompareAtPrice, getDefaultShade, getActiveSizeOptions } from '../../utils/productVariant';
import { useCMS } from '../../context/CMSContext';

/** The size to preselect for a given shade: that shade's own first size
 * option if it has any (a shade with exactly one size just uses it
 * silently), else the product-level default for shade-less products. */
function defaultSizeFor(product: Product, shade: Shade | undefined): string | undefined {
  const options = getActiveSizeOptions(product, shade);
  if (options.length > 0) return options[0].label;
  if (shade) return undefined;
  return product.selectedSize || (product.sizes ? product.sizes[0] : undefined);
}
import {
  Heart,
  ShoppingBag,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Truck,
  RotateCcw,
  Check,
  ArrowLeft,
  Share2,
  Play,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

interface FullProductPageProps {
  product: Product;
  wishlist: string[];
  cartItems: CartItem[];
  recentlyViewedIds: string[];
  onToggleWishlist: (productId: string) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onBuyNow: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  onOpenShadeFinder: () => void;
  onSelectProduct: (product: Product) => void;
  onBackToShop: () => void;
  onAddLookToBag: (items: { product: Product; shade?: Shade; size?: string }[]) => void;
  onOpenArticle?: (articleId: string) => void;
}

export const FullProductPage: React.FC<FullProductPageProps> = ({
  product,
  wishlist,
  cartItems,
  recentlyViewedIds,
  onToggleWishlist,
  onAddToBag,
  onBuyNow,
  onGoToCart,
  onOpenShadeFinder,
  onSelectProduct,
  onBackToShop,
  onAddLookToBag,
  onOpenArticle,
}) => {
  const [selectedShade, setSelectedShade] = useState<Shade | undefined>(getDefaultShade(product));
  const [selectedSize, setSelectedSize] = useState<string | undefined>(() =>
    defaultSizeFor(product, getDefaultShade(product))
  );
  const [quantity, setQuantity] = useState(1);

  // A shade can carry its own size list (one shade only in 50g, another in
  // 30g and 50g) — switching shades must re-derive which size is selected
  // rather than carrying over a label that may not exist for the new shade.
  const handleSelectShade = (shade: Shade) => {
    setSelectedShade(shade);
    setSelectedSize(defaultSizeFor(product, shade));
  };
  const [isWatchVideoOpen, setIsWatchVideoOpen] = useState(false);

  // Accordion open states
  const [openAccordions, setOpenAccordions] = useState<{ [key: string]: boolean }>({
    overview: true,
    details: false,
    howToUse: false,
    ingredients: false,
    shipping: false,
  });

  useEffect(() => {
    const defaultShade = getDefaultShade(product);
    setSelectedShade(defaultShade);
    setSelectedSize(defaultSizeFor(product, defaultShade));
    setQuantity(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [product]);

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isWishlisted = wishlist.includes(product.id);
  const currentPrice = getCurrentPrice(product, selectedShade, selectedSize);
  const currentCompareAtPrice = getCurrentCompareAtPrice(product, selectedShade, selectedSize);
  const galleryImages = resolveVariantGallery(product, selectedShade);
  const galleryResetKey = variantGalleryResetKey(product, selectedShade);
  const activeSizeOptions = getActiveSizeOptions(product, selectedShade);
  const { globalSettings } = useCMS();

  // Each content section prefers the new admin-managed structured data;
  // falls back to the legacy single-field content for products saved
  // before that structure existed; hides entirely if neither is set,
  // instead of rendering an empty accordion.
  const hasOverviewContent = !!product.details.overview || product.benefits.length > 0;

  const legacyAttributeRows = [
    product.finish ? { name: 'Finish', value: product.finish } : null,
    product.coverage ? { name: 'Coverage', value: product.coverage } : null,
    product.texture ? { name: 'Texture', value: product.texture } : null,
    product.skinType && product.skinType.length > 0 ? { name: 'Suitability', value: product.skinType.join(', ') } : null,
  ].filter((row): row is { name: string; value: string } => !!row);
  const displayAttributes =
    product.attributes && product.attributes.length > 0
      ? [...product.attributes].sort((a, b) => a.sortOrder - b.sortOrder)
      : legacyAttributeRows;

  const usageStepsSorted =
    product.usageSteps && product.usageSteps.length > 0
      ? [...product.usageSteps].sort((a, b) => a.sortOrder - b.sortOrder)
      : null;
  const hasHowToUse = !!usageStepsSorted || !!product.details.howToUse;

  const displayIngredients = product.ingredients && product.ingredients.length > 0 ? product.ingredients : null;
  const hasIngredients = !!displayIngredients || !!product.details.ingredientsList;

  const shippingReturnsText =
    product.details.shippingReturns ||
    globalSettings?.shippingNotice ||
    'Complimentary shipping across India on orders above ₹999. 7-day hassle-free returns on unopened goods.';

  // Filter relevant journal articles
  const relatedJournalArticles = GLAMIRK_JOURNAL_ARTICLES_EXTENDED.filter((art) =>
    art.shoppableProductIds?.includes(product.id)
  ).slice(0, 2);

  return (
    <div className="bg-[#FCE8ED]/40 min-h-screen pb-12">
      {/* Breadcrumb Navigation Bar */}
      <div className="border-b border-[#E8D5A8] bg-white/90 sticky top-16 z-20 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-xs text-[#6B6B6B]">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
            <button onClick={onBackToShop} className="hover:text-[#F05A7E] transition-colors flex items-center gap-1 cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Shop All</span>
            </button>
            <span>/</span>
            <span className="hover:text-[#F05A7E] cursor-pointer" onClick={onBackToShop}>
              {product.category}
            </span>
            <span>/</span>
            <span className="hover:text-[#F05A7E] cursor-pointer" onClick={onBackToShop}>
              {product.subCategory}
            </span>
            <span>/</span>
            <span className="text-[#121212] font-semibold truncate max-w-[200px] sm:max-w-none">
              {product.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsWatchVideoOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] hover:bg-[#FCE8ED] border border-[#E8D5A8] text-[#F05A7E] text-[10.5px] font-bold tracking-wider uppercase rounded-full transition-colors cursor-pointer"
            >
              <Play className="w-3 h-3 text-[#F05A7E] fill-current" />
              <span>Watch Video</span>
            </button>

            <button
              onClick={() => onToggleWishlist(product.id)}
              className="flex items-center gap-1.5 text-xs text-[#121212] hover:text-[#F05A7E] transition-colors font-medium flex-shrink-0 cursor-pointer"
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-[#F05A7E] text-[#F05A7E]' : ''}`} />
              <span className="hidden sm:inline">{isWishlisted ? 'Saved' : 'Wishlist'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main PDP Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column: Image Gallery (7 cols on lg) */}
          <div className="lg:col-span-7">
            <ProductGallery
              images={galleryImages}
              resetKey={galleryResetKey}
              productName={product.name}
              tag={product.tag}
            />
          </div>

          {/* Right Column: Product Information & Purchase Hub (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-5 bg-white p-6 sm:p-8 rounded-3xl border border-[#E8D5A8] shadow-xs">
            
            {/* Header / Titles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] tracking-[0.2em] uppercase text-[#6B6B6B]">
                <span className="font-bold text-[#F05A7E]">{product.subCategory}</span>
                {product.rating && (
                  <span className="flex items-center gap-1 text-[#F05A7E] font-bold">
                    ★ {product.rating}{' '}
                    <span className="text-[10px] text-[#6B6B6B] font-normal">({product.reviewCount} reviews)</span>
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#121212] leading-tight tracking-tight">
                {product.name}
              </h1>

              <p className="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed">
                {product.subtitle}
              </p>
            </div>

            {/* Price Display */}
            <div className="pt-3 pb-2 border-t border-[#E8D5A8] flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl text-[#121212] font-extrabold">
                {product.currency}{currentPrice}
              </span>
              {currentCompareAtPrice && currentCompareAtPrice > currentPrice && (
                <span className="text-sm text-[#6B6B6B] line-through">
                  {product.currency}{currentCompareAtPrice}
                </span>
              )}
              <span className="text-[11px] text-[#6B6B6B] ml-auto">
                Inclusive of all taxes
              </span>
            </div>

            {/* Shade Selector for Lipsticks & Sindoor */}
            {product.shades && selectedShade && (
              <ShadeSelector
                shades={product.shades}
                selectedShade={selectedShade}
                onSelectShade={handleSelectShade}
                onOpenShadeFinder={onOpenShadeFinder}
              />
            )}

            {/* Size Selector — options come from the selected shade when it
                has its own (some shades offer one size, others several), or
                from the product directly for shade-less products like the
                cleanser jars. A single available size needs no picker. */}
            {activeSizeOptions.length > 1 && (
              <div className="space-y-2.5 pt-2">
                <label className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#121212] block">
                  Select Format / Size:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {activeSizeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedSize(opt.label)}
                      className={`p-3.5 text-left rounded-2xl border transition-all cursor-pointer ${
                        selectedSize === opt.label
                          ? 'border-[#F05A7E] bg-[#FCE8ED] ring-2 ring-[#F05A7E]/30 shadow-xs'
                          : 'border-[#E8D5A8] bg-white text-[#6B6B6B] hover:border-[#F05A7E]'
                      }`}
                    >
                      <span className="text-xs font-bold text-[#121212] block">{opt.label}</span>
                      <span className="text-[11px] text-[#F05A7E] font-semibold block mt-0.5">
                        {product.currency}{opt.price}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeSizeOptions.length === 1 && (
              <p className="text-[11px] text-[#6B6B6B] pt-1">
                Size: <span className="font-bold text-[#121212]">{activeSizeOptions[0].label}</span>
              </p>
            )}

            {/* Delivery Availability */}
            <DeliveryCheck />

            {/* Purchase Controls */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                {/* Quantity Stepper */}
                <div className="flex items-center border border-[#E8D5A8] bg-[#FCE8ED] rounded-full overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3.5 py-3 text-xs text-[#121212] font-bold hover:bg-[#FCE8ED] transition-colors cursor-pointer"
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <span className="px-3.5 text-xs font-bold text-[#121212]">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="px-3.5 py-3 text-xs text-[#121212] font-bold hover:bg-[#FCE8ED] transition-colors cursor-pointer"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                {/* Add to Bag CTA */}
                <button
                  id="pdp-add-to-bag-btn"
                  onClick={() => onAddToBag(product, selectedShade, selectedSize, quantity)}
                  className="flex-1 py-3.5 px-6 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-[12px] font-bold tracking-wider uppercase rounded-full transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(240, 90, 126,0.25)] hover:scale-102 active:scale-95 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-white" />
                  <span>ADD TO BAG • ₹{currentPrice * quantity}</span>
                </button>
              </div>

              {/* Buy Now & Try On Secondary Row */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onBuyNow(product, selectedShade, selectedSize)}
                  className="py-3 px-4 bg-white text-[#121212] border border-[#E8D5A8] hover:border-[#F05A7E] hover:bg-[#FCE8ED] text-[11px] font-bold tracking-wider uppercase rounded-full transition-all flex items-center justify-center cursor-pointer"
                >
                  BUY NOW
                </button>

                {product.shades ? (
                  <button
                    onClick={onOpenShadeFinder}
                    className="py-3 px-4 bg-[#FCE8ED] text-[#F05A7E] border border-[#E8D5A8] text-[11px] font-bold tracking-wider uppercase rounded-full hover:bg-[#FCE8ED] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
                    <span>TRY IT ON</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onToggleWishlist(product.id)}
                    className="py-3 px-4 bg-[#FCE8ED] text-[#121212] border border-[#E8D5A8] text-[11px] font-bold tracking-wider uppercase rounded-full hover:bg-[#FCE8ED] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-[#F05A7E] text-[#F05A7E]' : ''}`} />
                    <span>{isWishlisted ? 'SAVED' : 'SAVE WISHLIST'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Trust Assurances */}
            <div className="p-4 bg-[#FCE8ED] rounded-2xl border border-[#E8D5A8] space-y-2 text-xs text-[#6B6B6B]">
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-[#F05A7E] flex-shrink-0" />
                <span>Complimentary delivery across India on orders above ₹999</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#F05A7E] flex-shrink-0" />
                <span>100% Authentic formula calibrated for Indian complexions</span>
              </div>
            </div>

            {/* Product Information Hierarchy Accordions */}
            <div className="pt-2 border-t border-[#E8D5A8] space-y-2.5">
              
              {/* 1. Overview */}
              {hasOverviewContent && (
                <div className="border border-[#E8D5A8] rounded-2xl bg-[#FCE8ED] overflow-hidden">
                  <button
                    onClick={() => toggleAccordion('overview')}
                    className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold tracking-wider uppercase text-[#121212] cursor-pointer"
                  >
                    <span>PRODUCT OVERVIEW</span>
                    {openAccordions.overview ? <ChevronUp className="w-4 h-4 text-[#F05A7E]" /> : <ChevronDown className="w-4 h-4 text-[#6B6B6B]" />}
                  </button>
                  {openAccordions.overview && (
                    <div className="px-4 pb-4 text-xs text-[#6B6B6B] leading-relaxed border-t border-[#E8D5A8]/60 pt-3 space-y-3">
                      {product.details.overview && <p>{product.details.overview}</p>}
                      <ul className="space-y-1.5 pt-1">
                        {product.benefits.map((b, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[#F05A7E] flex-shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Details & Specifications */}
              {displayAttributes.length > 0 && (
                <div className="border border-[#E8D5A8] rounded-2xl bg-[#FCE8ED] overflow-hidden">
                  <button
                    onClick={() => toggleAccordion('details')}
                    className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold tracking-wider uppercase text-[#121212] cursor-pointer"
                  >
                    <span>DETAILS &amp; ATTRIBUTES</span>
                    {openAccordions.details ? <ChevronUp className="w-4 h-4 text-[#F05A7E]" /> : <ChevronDown className="w-4 h-4 text-[#6B6B6B]" />}
                  </button>
                  {openAccordions.details && (
                    <div className="px-4 pb-4 text-xs text-[#6B6B6B] leading-relaxed border-t border-[#E8D5A8]/60 pt-3 space-y-2">
                      {displayAttributes.map((row, i) => (
                        <div key={i} className="flex justify-between py-1 border-b border-[#E8D5A8]/40 last:border-b-0">
                          <span className="text-[#6B6B6B] uppercase tracking-wider text-[11px]">{row.name}:</span>
                          <span className="font-bold text-[#121212]">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. How to Use / The Ritual */}
              {hasHowToUse && (
                <div className="border border-[#E8D5A8] rounded-2xl bg-[#FCE8ED] overflow-hidden">
                  <button
                    onClick={() => toggleAccordion('howToUse')}
                    className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold tracking-wider uppercase text-[#121212] cursor-pointer"
                  >
                    <span>HOW TO USE / THE RITUAL</span>
                    {openAccordions.howToUse ? <ChevronUp className="w-4 h-4 text-[#F05A7E]" /> : <ChevronDown className="w-4 h-4 text-[#6B6B6B]" />}
                  </button>
                  {openAccordions.howToUse && (
                    <div className="px-4 pb-4 text-xs text-[#6B6B6B] leading-relaxed border-t border-[#E8D5A8]/60 pt-3">
                      {usageStepsSorted ? (
                        <ol className="space-y-3">
                          {usageStepsSorted.map((step, i) => (
                            <li key={step.id} className="flex gap-3">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-[#F05A7E] text-white text-[10px] font-bold flex items-center justify-center">
                                {i + 1}
                              </span>
                              <div className="space-y-2">
                                <p>{step.text}</p>
                                {step.image && (
                                  <img src={step.image} alt={`Step ${i + 1}`} className="w-20 h-20 rounded-xl object-cover border border-[#E8D5A8]" />
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>{product.details.howToUse}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Clean Ingredients */}
              {hasIngredients && (
                <div className="border border-[#E8D5A8] rounded-2xl bg-[#FCE8ED] overflow-hidden">
                  <button
                    onClick={() => toggleAccordion('ingredients')}
                    className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold tracking-wider uppercase text-[#121212] cursor-pointer"
                  >
                    <span>CLEAN INGREDIENTS LIST</span>
                    {openAccordions.ingredients ? <ChevronUp className="w-4 h-4 text-[#F05A7E]" /> : <ChevronDown className="w-4 h-4 text-[#6B6B6B]" />}
                  </button>
                  {openAccordions.ingredients && (
                    <div className="px-4 pb-4 text-xs text-[#6B6B6B] leading-relaxed border-t border-[#E8D5A8]/60 pt-3">
                      {displayIngredients ? (
                        <div className="flex flex-wrap gap-1.5">
                          {displayIngredients.map((ing, i) => (
                            <span key={i} className="px-2.5 py-1 bg-white rounded-full border border-[#E8D5A8]">
                              {ing}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p>{product.details.ingredientsList}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 5. Shipping & Returns */}
              <div className="border border-[#E8D5A8] rounded-2xl bg-[#FCE8ED] overflow-hidden">
                <button
                  onClick={() => toggleAccordion('shipping')}
                  className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold tracking-wider uppercase text-[#121212] cursor-pointer"
                >
                  <span>SHIPPING &amp; RETURNS</span>
                  {openAccordions.shipping ? <ChevronUp className="w-4 h-4 text-[#F05A7E]" /> : <ChevronDown className="w-4 h-4 text-[#6B6B6B]" />}
                </button>
                {openAccordions.shipping && (
                  <div className="px-4 pb-4 text-xs text-[#6B6B6B] leading-relaxed border-t border-[#E8D5A8]/60 pt-3">
                    <p>{shippingReturnsText}</p>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>

        {/* Ratings & Reviews */}
        <ProductReviews
          productId={product.id}
          fallbackRating={product.rating}
          fallbackReviewCount={product.reviewCount}
        />

        {/* Complete The Look Cross-Selling */}
        <CompleteTheLook
          currentProduct={product}
          onAddLookToBag={onAddLookToBag}
          onSelectProduct={onSelectProduct}
        />

        {/* Editorial Cross-Selling */}
        {relatedJournalArticles.length > 0 && onOpenArticle && (
          <div className="pt-10 border-t border-[#E8D5A8] space-y-6">
            <div>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block">
                Atelier Editorial
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-[#121212]">
                Stories &amp; Guides Featuring {product.name}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relatedJournalArticles.map((art) => (
                <div
                  key={art.id}
                  onClick={() => onOpenArticle(art.id)}
                  className="group cursor-pointer bg-white border border-[#E8D5A8] p-4 rounded-2xl flex gap-4 items-center hover:border-[#F05A7E] transition-all shadow-xs"
                >
                  <div className="w-20 h-24 overflow-hidden rounded-xl bg-[#FCE8ED] flex-shrink-0">
                    <img
                      src={art.image}
                      alt={art.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9.5px] uppercase tracking-wider text-[#F05A7E] font-bold">
                      {art.category} • {art.readTime}
                    </span>
                    <h4 className="text-sm font-bold text-[#121212] group-hover:text-[#F05A7E] transition-colors leading-snug">
                      {art.title}
                    </h4>
                    <p className="text-xs text-[#6B6B6B] line-clamp-1">
                      {art.excerpt}
                    </p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#F05A7E] block pt-1">
                      READ STORY →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Products */}
        <RelatedProducts
          currentProduct={product}
          wishlist={wishlist}
          cartItems={cartItems}
          onToggleWishlist={onToggleWishlist}
          onSelectProduct={onSelectProduct}
          onTryItOn={onOpenShadeFinder}
          onQuickAdd={(p, s, sz) => onAddToBag(p, s, sz, 1)}
          onGoToCart={onGoToCart}
          onBuyNow={(p, s, sz) => onBuyNow(p, s, sz)}
        />
      </div>

      {/* Recently Viewed Strip */}
      <RecentlyViewed
        recentlyViewedIds={recentlyViewedIds}
        onSelectProduct={onSelectProduct}
      />

      {/* Watch The Glam Video Modal */}
      <WatchTheGlamModal
        isOpen={isWatchVideoOpen}
        onClose={() => setIsWatchVideoOpen(false)}
        product={product}
        onAddToCart={(p, s) => onAddToBag(p, s, selectedSize, 1)}
      />

      {/* Sticky Mobile Purchase Bar (Fixed above MobileBottomNav on small screens) */}
      <div className="md:hidden fixed bottom-16 inset-x-0 bg-white/95 backdrop-blur-md border-t border-[#E8D5A8] px-4 py-2.5 z-30 shadow-[0_-4px_20px_rgba(240, 90, 126,0.1)] flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-[#121212] block truncate">
            {product.name}
          </span>
          <span className="text-xs text-[#F05A7E] font-bold">
            ₹{currentPrice} {selectedShade ? `• ${selectedShade.name}` : ''}
          </span>
        </div>

        <button
          onClick={() => onAddToBag(product, selectedShade, selectedSize, quantity)}
          className="py-2.5 px-5 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold tracking-wider uppercase rounded-full flex items-center gap-1.5 shadow-[0_4px_12px_rgba(240, 90, 126,0.25)] flex-shrink-0 cursor-pointer active:scale-95 transition-all"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-white" />
          <span>ADD TO BAG</span>
        </button>
      </div>
    </div>
  );
};
