import React, { useState, useMemo } from 'react';
import { Heart, Sparkles, ShoppingBag, ShoppingCart, Star, Check, Gem } from 'lucide-react';
import { Product, Shade, CartItem } from '@glamirk/shared/types';
import { ProductImage } from './ProductImage';
import {
  isProductSellable,
  LOW_STOCK_THRESHOLD,
  resolveVariantGallery,
  summarizeShade,
  getDiscountPercent,
  getDefaultShade,
  getCurrentStock,
  resolveSizeSelection,
  selectableShades,
} from '@glamirk/shared/utils/productVariant';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  viewMode?: 'grid' | 'list';
  /** Used only to check whether this exact product+shade+size is already in
   * the bag, so Add to Cart can't silently add a duplicate — see AddToCartButton. */
  cartItems: CartItem[];
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  /** Opens the shared Add-to-Cart confirmation dialog — this alone never
   * touches the cart. The dialog's own "Add to Cart" button is what actually
   * calls the server (see AddToCartConfirmModal / handleConfirmAddToCart in
   * App.tsx), so a Cancel/close there leaves the cart untouched. */
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  /** Adds this exact shade/size straight to the bag and jumps to checkout —
   * skips the Add-to-Cart confirm dialog entirely, same as the PDP's own
   * Buy Now button (see handleBuyNow in App.tsx). */
  onBuyNow: (product: Product, shade?: Shade, size?: string) => void;
}


// Rating display is on hold for a future release — hidden rather than
// deleted so it's a one-line flip to bring back. Matching flag in
// FilterPanel.tsx controls the "Customer Rating" filter section.
const RATINGS_ENABLED = false;

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isWishlisted,
  viewMode = 'grid',
  cartItems,
  onToggleWishlist,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onGoToCart,
  onBuyNow,
}) => {
  // getDefaultShade, not shades[0] — the first shade may be paused, and
  // preselecting one the server will refuse to sell is how this card ended up
  // offering an Add to Cart that could only fail.
  const [selectedShade, setSelectedShade] = useState<Shade | undefined>(getDefaultShade(product));
  const [isHovered, setIsHovered] = useState(false);

  // The size this card will actually add.
  //
  // This used to read product.sizes alone, which is blind to the per-shade
  // sizes a variant carries: for a shade sold in 3ml and 6ml it resolved to
  // undefined, so Add to Cart posted no size and the server rejected the whole
  // request ("Please select a size for … before adding to bag"). The listing
  // card's Add to Cart simply did not work for any product whose shades carry
  // sizes.
  //
  // resolveSizeSelection is the same function the product page resolves its
  // own default with, so the card and the page agree on what "this product,
  // this shade" means — which is also what lets the already-in-cart check
  // below match a line the page created. Honouring the product's own
  // selectedSize is that function's job, not this one's.
  const resolvedSize = useMemo(
    () => resolveSizeSelection(product, selectedShade, undefined),
    [product, selectedShade]
  );
  // "Already in cart" means this exact product+shade+size combo — a
  // different shade of the same product is a different line item, so it
  // should still read as addable rather than already-in-cart.
  const isInCart = cartItems.some(
    (item) =>
      item.product.id === product.id &&
      (item.selectedShade?.id || null) === (selectedShade?.id || null) &&
      (item.selectedSize || null) === (resolvedSize || null)
  );

  const handleAddToCartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickAdd(product, selectedShade, resolvedSize);
  };

  const handleBuyNowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBuyNow(product, selectedShade, resolvedSize);
  };

  // The card shows the shade the shopper has picked, not a fixed product shot
  // — clicking a swatch repaints the image the same way the product page does.
  //
  // resolveVariantGallery is what makes that a one-liner rather than a second
  // rule: it already returns the shade's own images (primary first, then
  // sortOrder) and falls back to the product's set when the shade has none. So
  // a shade with no gallery of its own, and every product with no shades at
  // all, render exactly what they rendered before — the fallback's first two
  // entries ARE images.primary and images.secondary, in that order.
  //
  // Hover keeps its meaning of "show me the next picture", which for a shade
  // with its own gallery is that shade's second image rather than the
  // product's. A single-image shade simply has nothing to swap to and holds
  // still, which is the same thing a product with no secondary image does.
  // Memoised on [product, selectedShade] so that hovering — which toggles
  // isHovered and re-renders the whole card — only re-picks which of the two
  // already-resolved images to show, instead of rebuilding the gallery.
  const galleryImages = useMemo(
    () => resolveVariantGallery(product, selectedShade),
    [product, selectedShade]
  );
  const displayImage = (isHovered && galleryImages[1]) || galleryImages[0];

  // Price follows the selected shade, the same way the image above does — a
  // card that repaints to a shade but keeps quoting the product's base price
  // contradicts the product page the swatch leads to.
  //
  // For a shade sold in several sizes the card states its STARTING price: one
  // card has room for one number, and a shade available in 3ml and 6ml has
  // two. summarizeShade is what already resolves that, and the reason to go
  // through it rather than min() here is the compare-at — it takes the
  // strike-through from whichever unit set the starting price, so the two
  // numbers always describe the same jar instead of advertising a saving that
  // no single purchase can produce.
  //
  // A product with no shades is deliberately untouched and keeps quoting its
  // own price exactly as before.
  //
  // Memoised because summarizeShade walks enumerateStockUnits(product), which
  // expands EVERY shade and size of the product before discarding all but this
  // one shade's units. The live catalog has a 50-shade product; unmemoised,
  // every mouseenter and mouseleave on its card paid for that full expansion
  // to recompute a price that cannot have changed.
  const shadeSummary = useMemo(
    () => (selectedShade ? summarizeShade(product, selectedShade) : undefined),
    [product, selectedShade]
  );
  const displayPrice = shadeSummary ? shadeSummary.startingPrice : product.price;
  const displayCompareAtPrice = shadeSummary ? shadeSummary.startingCompareAtPrice : product.originalPrice;
  // Derived, never stored — and null rather than a negative for a compare-at
  // at or below the price, which the inline arithmetic this replaces turned
  // into a wrong badge instead of no badge.
  const discountPercent = getDiscountPercent(displayPrice, displayCompareAtPrice) ?? 0;

  // Availability is resolved across every sellable unit, not from the
  // product-level pool alone: a shaded product whose pool has drained is
  // still buyable while its shades have stock, and must not be greyed out.
  // A second full enumerateStockUnits pass, for the same reason as above.
  const sellable = useMemo(() => isProductSellable(product), [product]);
  // …but the button adds ONE unit, so it answers the narrower question: is the
  // shade and size this card has selected in stock? Without this, picking a
  // sold-out shade of an otherwise healthy product left an enabled button
  // whose only outcome was "Only 0 available" from the server. The product
  // page already gates its own Add to Bag this way.
  const selectedUnitStock = useMemo(
    () => getCurrentStock(product, selectedShade, resolvedSize),
    [product, selectedShade, resolvedSize]
  );
  const canAddSelectedUnit = sellable && selectedUnitStock > 0;
  const isLowStock = sellable && typeof product.stock === 'number' && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;

  const ImageArea = (
    <div className={`relative shrink-0 overflow-hidden rounded-xl bg-gradient-to-b from-[#FCE8ED] to-[#F9DDE4] ${viewMode === 'list' ? 'aspect-square w-28 sm:w-40' : 'aspect-[10/11] w-full'}`}>
      <ProductImage
        src={displayImage?.url}
        // Names the shade when the picture is of a shade, so a screen reader
        // hears which one is on screen rather than the product name repeated
        // for every swatch. Falls back to the product name, which is what the
        // gallery's own alt resolves to for an unshaded product anyway.
        alt={displayImage?.alt || product.name}
        loading="lazy"
        // A card is at most half the viewport on a phone and roughly a
        // quarter of it on desktop, where the grid is 3-4 across. Telling the
        // browser that is what lets it pick a 320px variant on mobile instead
        // of assuming the image spans the full width.
        sizes={
          viewMode === 'list'
            ? '(max-width: 640px) 112px, 160px'
            : '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'
        }
        className="h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />

      {!sellable && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
          <span className="rounded-full border border-[#E8D5A8] bg-white px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wider text-[#121212]">
            Out of Stock
          </span>
        </div>
      )}

      {product.tag && (
        <div className="absolute left-2.5 top-2.5 z-10 sm:left-3 sm:top-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#F05A7E] shadow-[0_2px_8px_rgba(240,90,126,0.12)] sm:text-[10px]">
            {/new/i.test(product.tag) ? <Sparkles className="h-3 w-3" /> : <Gem className="h-3 w-3" />}
            {product.tag}
          </span>
        </div>
      )}

      <button
        id={`wishlist-btn-${product.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleWishlist(product.id);
        }}
        className="absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-[0_2px_10px_rgba(18,18,18,0.08)] transition-all hover:scale-110 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05A7E] sm:right-3 sm:top-3 sm:h-9 sm:w-9"
        aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
      >
        <Heart
          className={`h-3.5 w-3.5 transition-colors sm:h-4 sm:w-4 ${
            isWishlisted ? 'fill-[#F05A7E] text-[#F05A7E]' : 'text-[#121212] hover:text-[#F05A7E]'
          }`}
        />
      </button>

      {/* Try-on: a floating circular action in the opposite corner to the
          wishlist, sharing its token vocabulary (gold border, white wash,
          soft shadow, pink accent) so the two read as one pair rather than
          two unrelated controls. It was a full-width bar across the foot of
          the image, which covered the product at the exact moment a shopper
          was looking at it.

          Sized 40/44px rather than matching the wishlist's 26/32px: this one
          is revealed on hover and sits over the artwork, so it needs a real
          touch target. The wishlist is deliberately left as it is.

          Visibility rules are unchanged — always shown on touch, revealed on
          hover on desktop — with focus-visible added to both, because the
          previous `sm:opacity-0` made the button invisible to a keyboard user
          who had tabbed onto it. */}
      {viewMode === 'grid' && product.shades && product.enableTryOn !== false && (
        <button
          id={`tryon-btn-${product.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onTryItOn(product);
          }}
          className="absolute bottom-2 right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#E8D5A8] bg-white/90 shadow-sm backdrop-blur-xs transition-all duration-200 hover:scale-110 hover:bg-white focus-visible:scale-110 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05A7E] focus-visible:ring-offset-1 sm:h-11 sm:w-11 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:focus-visible:translate-y-0 sm:focus-visible:opacity-100"
          title="Try on this product"
          aria-label={`Try on ${product.name}`}
        >
          <Sparkles className="h-4 w-4 text-[#F05A7E] sm:h-5 sm:w-5" />
        </button>
      )}
    </div>
  );

  const RatingRow = RATINGS_ENABLED && (product.rating || product.reviewCount) && (
    <div className="flex items-center gap-1 text-[11px] text-[#6B6B6B]">
      <Star className="h-3 w-3 fill-[#C9972B] text-[#C9972B]" />
      <span className="font-semibold text-[#121212]">{(product.rating ?? 0).toFixed(1)}</span>
      {typeof product.reviewCount === 'number' && <span>({product.reviewCount})</span>}
    </div>
  );

  // Only shades a customer may actually pick. The row used to render
  // product.shades directly, so a paused shade appeared here as a swatch while
  // the product page correctly hid it — and selecting one produced an Add to
  // Cart the server answered with "… is no longer available". selectableShades
  // is the same rule the page's selector and the cart endpoint both read, so a
  // swatch shown here can always be bought.
  // Resolved once per product rather than per render, and the sold-out flag is
  // computed here too — it ran resolveSizeSelection + getCurrentStock for each
  // of the six visible swatches on every hover.
  const visibleShades = useMemo(() => {
    return selectableShades(product)
      .slice(0, 7)
      .map((shade) => ({
        shade,
        soldOut: getCurrentStock(product, shade, resolveSizeSelection(product, shade, undefined)) <= 0,
      }));
  }, [product]);
  const totalSelectableShades = useMemo(() => selectableShades(product).length, [product]);

  const ShadeRow = visibleShades.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 pt-3 @[250px]:gap-2.5">
      {visibleShades.slice(0, 6).map(({ shade, soldOut }) => {
        return (
          <button
            key={shade.id}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedShade(shade);
            }}
            className={`h-6 w-6 rounded-full border border-[#0B0B0B]/10 transition-all duration-150 focus-visible:outline-none @[250px]:h-7 @[250px]:w-7 ${
              selectedShade?.id === shade.id
                ? 'ring-2 ring-[#F05A7E] ring-offset-2'
                : 'hover:scale-110 focus-visible:ring-2 focus-visible:ring-[#F05A7E]/50 focus-visible:ring-offset-2'
            } ${soldOut ? 'opacity-40' : ''}`}
            style={{ backgroundColor: shade.hex }}
            title={`${shade.name} (${shade.undertone} undertone)${soldOut ? ' — out of stock' : ''}`}
            // Sold-out is in the label rather than only in the dimming, so it
            // reaches a screen reader too. Matches the product page's swatches.
            aria-label={`Select shade ${shade.name}${soldOut ? ', out of stock' : ''}`}
          />
        );
      })}
      {totalSelectableShades > 6 && (
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FCE8ED] px-1.5 text-[10.5px] font-semibold text-[#121212] @[250px]:h-7 @[250px]:min-w-7">+{totalSelectableShades - 6}</span>
      )}
    </div>
  );

  const PriceRow = (
    <div className={`flex items-center gap-2.5 ${viewMode === 'list' ? '' : 'flex-wrap'}`}>
      <span className="text-xl font-bold tracking-tight text-[#121212] sm:text-2xl">
        {product.currency}{displayPrice}
      </span>
      {discountPercent > 0 && (
        <>
          <span className="text-[13px] text-[#6B6B6B] line-through">
            {product.currency}{displayCompareAtPrice}
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-[#F05A7E]">{discountPercent}% OFF</span>
        </>
      )}
    </div>
  );

  // isInCart is checked BEFORE stock: a line already in the bag stays
  // reachable even if that shade has since sold out — "Go to Cart" navigates
  // rather than adding, so there is nothing for stock to refuse.
  // One base so both CTAs share height, type and never wrap — "Add to Cart"
  // used to break onto two lines in narrow grid cards.
  const CTA_BASE =
    'inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[12.5px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05A7E] focus-visible:ring-offset-2 active:scale-[0.97] sm:text-[13px]';

  const AddToCartButton = (
    <button
      id={`quickadd-btn-${product.id}`}
      disabled={!isInCart && !canAddSelectedUnit}
      onClick={
        isInCart
          ? (e) => {
              e.stopPropagation();
              onGoToCart();
            }
          : canAddSelectedUnit
          ? handleAddToCartClick
          : undefined
      }
      className={`${CTA_BASE} ${
        isInCart
          ? 'cursor-pointer border border-[#121212] bg-[#121212] text-white hover:bg-[#2a2a2a]'
          : !canAddSelectedUnit
          ? 'cursor-not-allowed border border-[#E8D5A8] bg-[#FAF6EC] text-[#9A9A9A]'
          : 'cursor-pointer border border-transparent bg-[#F05A7E] text-white shadow-[0_8px_18px_-8px_rgba(240,90,126,0.6)] hover:bg-[#E54D72] hover:shadow-[0_12px_24px_-10px_rgba(240,90,126,0.7)]'
      } ${viewMode === 'list' ? 'flex-1 sm:min-w-[132px]' : 'flex-auto'}`}
    >
      {isInCart ? (
        <>
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span>Go to Cart</span>
        </>
      ) : !canAddSelectedUnit ? (
        <>
          <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
          <span>Out of Stock</span>
        </>
      ) : (
        <>
          <ShoppingCart className="h-4 w-4 shrink-0" />
          <span>Add to Cart</span>
        </>
      )}
    </button>
  );

  const BuyNowButton = (
    <button
      id={`buynow-btn-${product.id}`}
      // Buy Now adds the same unit as Add to Cart and then jumps to checkout,
      // so it has to answer the same question — gating it on the product alone
      // let a sold-out shade reach the server and fail there instead.
      disabled={!canAddSelectedUnit}
      onClick={handleBuyNowClick}
      className={`${CTA_BASE} ${viewMode === 'list' ? 'flex-1' : 'flex-auto'} border border-[#E3C98F] bg-white uppercase tracking-[0.04em] text-[#121212] hover:border-[#C9972B] hover:bg-[#FFFBF3] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E3C98F] disabled:hover:bg-white ${viewMode === 'list' ? 'sm:min-w-[112px]' : ''}`}
    >
      <ShoppingBag className="h-4 w-4 shrink-0 text-[#F05A7E]" />
      <span>Buy Now</span>
    </button>
  );

  if (viewMode === 'list') {
    return (
      <div
        id={`product-card-${product.id}`}
        onClick={() => onSelectProduct(product)}
        className="group relative flex cursor-pointer gap-4 rounded-xl border border-[#E8D5A8] bg-white p-3.5 shadow-[0_1px_6px_rgba(11,11,11,0.03)] transition-all duration-300 hover:border-[#FCE8ED] hover:shadow-[0_8px_20px_rgba(240,90,126,0.10)] sm:p-4"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {ImageArea}

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-medium text-[#6B6B6B]">{product.subCategory}</p>
                <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-[#121212] transition-colors group-hover:text-[#F05A7E] sm:text-base">
                  {product.name}
                </h3>
              </div>
              {RatingRow}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#6B6B6B]">{product.description || product.subtitle}</p>
            {ShadeRow}
            {isLowStock && (
              <p className="mt-1.5 text-[10.5px] font-semibold text-[#F05A7E]">Only {product.stock} left</p>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2.5 border-t border-[#E8D5A8]/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
            {PriceRow}
            <div className="flex w-full gap-2 sm:w-auto">
              {BuyNowButton}
              {AddToCartButton}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`product-card-${product.id}`}
      onClick={() => onSelectProduct(product)}
      className="@container group relative flex h-full cursor-pointer flex-col rounded-2xl border border-[#EBD9B4] bg-[#FFFDFB] p-3 shadow-[0_2px_14px_rgba(201,151,43,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#E3C98F] hover:shadow-[0_16px_34px_-12px_rgba(240,90,126,0.18)] sm:p-3.5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {ImageArea}

      <div className="flex flex-1 flex-col justify-between px-1.5 pt-4 sm:px-2">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#F05A7E] sm:text-[11px]">{product.subCategory}</span>
            {RatingRow}
          </div>

          {/* Playfair is already loaded in index.html; the base layer maps
              .font-serif to the sans stack, so it is named directly here. */}
          <h3 className="mt-1.5 line-clamp-2 font-['Playfair_Display',Georgia,serif] text-[19px] [font-variant-numeric:lining-nums] font-medium leading-[1.2] text-[#121212] transition-colors group-hover:text-[#F05A7E] @[250px]:text-[21px]">
            {product.name}
          </h3>

          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#6B6B6B] sm:text-sm">
            {product.subtitle}
          </p>

          {ShadeRow}

          {product.sizes && !product.shades && (
            <div className="flex items-center gap-2.5 pt-3 text-[12.5px] text-[#6B6B6B] sm:text-[13px]">
              <span className="rounded-full border border-[#F05A7E]/60 bg-[#FCE8ED] px-3 py-1 text-[12px] font-semibold text-[#F05A7E]">
                {product.selectedSize || '30g & 50g'}
              </span>
              <span className="h-4 w-px bg-[#E8D5A8]" aria-hidden="true" />
              <span>Solid Balm To Water</span>
            </div>
          )}

          {isLowStock && (
            <p className="pt-2 text-[11px] font-semibold text-[#F05A7E]">Only {product.stock} left</p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-[#E8D5A8]/80 pb-1 pt-4">
          {PriceRow}
          <div className="flex flex-col gap-2 @[250px]:flex-row">
            {BuyNowButton}
            {AddToCartButton}
          </div>
        </div>
      </div>
    </div>
  );
};
