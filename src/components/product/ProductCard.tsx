import React, { useState } from 'react';
import { Heart, Sparkles, ShoppingBag, Star, Check, ShieldCheck } from 'lucide-react';
import { Product, Shade, CartItem } from '../../types';

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

const LOW_STOCK_THRESHOLD = 5;

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
  const [selectedShade, setSelectedShade] = useState<Shade | undefined>(
    product.shades ? product.shades[0] : undefined
  );
  const [isHovered, setIsHovered] = useState(false);

  const resolvedSize = product.selectedSize || (product.sizes ? product.sizes[0] : undefined);
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

  const displayImage = isHovered && product.images.secondary
    ? product.images.secondary
    : product.images.primary;

  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0;

  const isLowStock = product.inStock && typeof product.stock === 'number' && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;

  const ImageArea = (
    <div className={`relative shrink-0 overflow-hidden rounded-lg bg-[#FCE8ED] ${viewMode === 'list' ? 'aspect-square w-28 sm:w-40' : 'aspect-[4/3] w-full'}`}>
      <img
        src={displayImage}
        alt={product.name}
        loading="lazy"
        className="h-full w-full object-contain object-center transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />

      {!product.inStock && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
          <span className="rounded-full border border-[#E8D5A8] bg-white px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wider text-[#121212]">
            Out of Stock
          </span>
        </div>
      )}

      {product.tag && (
        <div className="absolute left-2 top-2 z-10">
          <span className="rounded-full border border-[#E8D5A8] bg-white/95 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#F05A7E] shadow-sm">
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
        className="absolute right-2 top-2 z-10 rounded-full border border-[#E8D5A8] bg-white/90 p-1.5 shadow-sm backdrop-blur-xs transition-all hover:scale-110 hover:bg-white sm:p-2"
        aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
      >
        <Heart
          className={`h-3.5 w-3.5 transition-colors sm:h-4 sm:w-4 ${
            isWishlisted ? 'fill-[#F05A7E] text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#F05A7E]'
          }`}
        />
      </button>

      {viewMode === 'grid' && product.shades && product.enableTryOn !== false && (
        <div className="absolute inset-x-2 bottom-2 z-10 flex opacity-100 transition-all duration-200 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
          <button
            id={`tryon-btn-${product.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onTryItOn(product);
            }}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#E8D5A8] bg-white/95 px-2.5 py-2 text-[10px] font-bold text-[#F05A7E] shadow-sm transition-colors hover:bg-[#FCE8ED]"
            title="Virtual Try-On"
          >
            <Sparkles className="h-3 w-3 text-[#F05A7E]" />
            <span>Try On</span>
          </button>
        </div>
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

  const ShadeRow = product.shades && product.shades.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
      {product.shades.slice(0, 6).map((shade) => (
        <button
          key={shade.id}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedShade(shade);
          }}
          className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${
            selectedShade?.id === shade.id
              ? 'border-[#F05A7E] scale-125 ring-2 ring-[#F05A7E]/25'
              : 'border-[#0B0B0B]/15 hover:scale-110'
          }`}
          style={{ backgroundColor: shade.hex }}
          title={`${shade.name} (${shade.undertone} undertone)`}
          aria-label={`Select shade ${shade.name}`}
        />
      ))}
      {product.shades.length > 6 && (
        <span className="text-[10px] font-medium text-[#6B6B6B]">+{product.shades.length - 6}</span>
      )}
    </div>
  );

  const PriceRow = (
    <div className={`flex items-center gap-2.5 ${viewMode === 'list' ? '' : 'flex-wrap'}`}>
      <span className="text-base font-bold text-[#121212] sm:text-lg">
        {product.currency}{product.price}
      </span>
      {discountPercent > 0 && (
        <>
          <span className="text-xs text-[#6B6B6B] line-through">
            {product.currency}{product.originalPrice}
          </span>
          <span className="text-[10.5px] font-bold text-[#F05A7E]">{discountPercent}% OFF</span>
        </>
      )}
    </div>
  );

  const AddToCartButton = (
    <button
      id={`quickadd-btn-${product.id}`}
      disabled={!product.inStock}
      onClick={
        !product.inStock
          ? undefined
          : isInCart
          ? (e) => {
              e.stopPropagation();
              onGoToCart();
            }
          : handleAddToCartClick
      }
      className={`flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold shadow-sm transition-all active:scale-95 ${
        !product.inStock
          ? 'cursor-not-allowed bg-[#E8D5A8]/50 text-[#6B6B6B]'
          : isInCart
          ? 'cursor-pointer border border-[#0B0B0B] bg-white text-[#121212] hover:bg-[#FAF9F6]'
          : 'cursor-pointer bg-[#F05A7E] text-white hover:bg-[#e0496c]'
      } ${viewMode === 'list' ? 'w-full sm:w-auto sm:flex-1' : 'flex-1'}`}
    >
      {!product.inStock ? (
        <>
          <ShoppingBag className="h-3.5 w-3.5" />
          <span>Out of Stock</span>
        </>
      ) : isInCart ? (
        <>
          <Check className="h-3.5 w-3.5" />
          <span>Go to Cart</span>
        </>
      ) : (
        <>
          <ShoppingBag className="h-3.5 w-3.5" />
          <span>Add to Cart</span>
        </>
      )}
    </button>
  );

  const BuyNowButton = (
    <button
      id={`buynow-btn-${product.id}`}
      disabled={!product.inStock}
      onClick={handleBuyNowClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#E8D5A8] bg-white px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-[#121212] shadow-sm transition-all hover:border-[#F05A7E] hover:bg-[#FCE8ED] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E8D5A8] disabled:hover:bg-white"
    >
      <ShieldCheck className="h-3.5 w-3.5 text-[#F05A7E]" />
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
      className="group relative flex h-full cursor-pointer flex-col rounded-xl border border-[#E8D5A8] bg-white p-4 shadow-[0_1px_6px_rgba(11,11,11,0.03)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#FCE8ED] hover:shadow-[0_10px_24px_rgba(240,90,126,0.10)] sm:p-5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {ImageArea}

      <div className="flex flex-1 flex-col justify-between pt-3.5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-medium text-[#6B6B6B]">{product.subCategory}</span>
            {RatingRow}
          </div>

          <h3 className="mt-0.5 line-clamp-2 min-h-[2.5em] text-sm font-bold leading-snug text-[#121212] transition-colors group-hover:text-[#F05A7E] sm:text-base">
            {product.name}
          </h3>

          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#6B6B6B]">
            {product.subtitle}
          </p>

          {ShadeRow}

          {product.sizes && !product.shades && (
            <div className="flex items-center gap-1.5 pt-1.5 text-[11px] text-[#6B6B6B]">
              <span className="rounded-full border border-[#E8D5A8] bg-[#FCE8ED] px-2 py-0.5 text-[10px] font-bold text-[#F05A7E]">
                {product.selectedSize || '30g & 50g'}
              </span>
              <span>Solid Balm To Water</span>
            </div>
          )}

          {isLowStock && (
            <p className="pt-1.5 text-[10.5px] font-semibold text-[#F05A7E]">Only {product.stock} left</p>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2.5 border-t border-[#E8D5A8]/60 pt-3">
          {PriceRow}
          <div className="flex gap-2">
            {BuyNowButton}
            {AddToCartButton}
          </div>
        </div>
      </div>
    </div>
  );
};
