import React from 'react';
import { ChevronLeft, ChevronRight, Diamond } from 'lucide-react';
import { Product, Shade, CartItem } from '@glamirk/shared/types';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { ProductCard } from './ProductCard';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { useSnapCarousel } from '../../hooks/useSnapCarousel';

interface RelatedProductsProps {
  currentProduct: Product;
  wishlist: string[];
  cartItems: CartItem[];
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  onBuyNow: (product: Product, shade?: Shade, size?: string) => void;
}

/** Five fit at 1440px; the carousel holds more. */
const MAX_PICKS = 10;

const arrowClass =
  'hidden sm:flex absolute top-[38%] -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white border border-[#E8D5A8] shadow-sm items-center justify-center text-[#F05A7E] hover:border-[#F05A7E] transition-colors cursor-pointer disabled:opacity-0 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[#F05A7E]';

export const RelatedProducts: React.FC<RelatedProductsProps> = ({
  currentProduct,
  wishlist,
  cartItems,
  onToggleWishlist,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onGoToCart,
  onBuyNow,
}) => {
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;

  // The admin's own picks (relatedProductIds) always lead, in their order.
  // When there are fewer than fit a row, in-stock products from the same
  // category, then the rest of the catalogue, top it up — never the current
  // product, never a repeat.
  const curated = currentProduct.relatedProductIds
    .map((id) => catalogProducts.find((p) => p.id === id))
    .filter((p): p is Product => !!p && p.id !== currentProduct.id);
  const taken = new Set([currentProduct.id, ...curated.map((p) => p.id)]);
  const fillers = catalogProducts
    .filter((p) => !taken.has(p.id) && p.inStock !== false)
    .sort((a, b) => Number(b.category === currentProduct.category) - Number(a.category === currentProduct.category));
  const picks = [...curated, ...fillers].slice(0, MAX_PICKS);

  const { trackRef, page, pageCount, goTo, onScroll } = useSnapCarousel(picks.length);

  if (picks.length === 0) return null;

  return (
    <section className="my-16" aria-labelledby="related-products-heading">
      <div className="text-center mb-8 sm:mb-10">
        <Diamond className="mx-auto w-5 h-5 text-[#C9972B]" strokeWidth={1.5} aria-hidden="true" />
        <p className="mt-2 flex items-center justify-center gap-4 text-[11px] sm:text-xs uppercase tracking-[0.3em] font-medium text-[#6B6B6B]">
          <span aria-hidden="true" className="w-10 sm:w-20 h-px bg-[#C9972B]/50" />
          Curated Harmony
          <span aria-hidden="true" className="w-10 sm:w-20 h-px bg-[#C9972B]/50" />
        </p>
        {/* Playfair is named directly: the base layer maps .font-serif to the sans stack. */}
        <h2
          id="related-products-heading"
          className="mt-3 font-['Playfair_Display',Georgia,serif] text-3xl sm:text-4xl lg:text-5xl font-medium text-[#121212] leading-tight"
        >
          You May <span className="text-[#F05A7E]">Also Like</span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-[#6B6B6B]">
          Picked to pair beautifully — because great beauty choices go together.
        </p>
      </div>

      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          role="region"
          aria-roledescription="carousel"
          aria-label="You may also like"
          className="no-scrollbar flex justify-center-safe gap-4 overflow-x-auto snap-x snap-mandatory motion-safe:scroll-smooth py-2"
        >
          {picks.map((product) => (
            <div
              key={product.id}
              className="snap-start shrink-0 basis-[78%] min-[640px]:basis-[calc((100%-1rem)/2)] min-[1024px]:basis-[calc((100%-2rem)/3)] min-[1280px]:basis-[calc((100%-3rem)/4)] min-[1400px]:basis-[calc((100%-4rem)/5)]"
            >
              <ProductCard
                product={product}
                isWishlisted={wishlist.includes(product.id)}
                cartItems={cartItems}
                onToggleWishlist={onToggleWishlist}
                onSelectProduct={onSelectProduct}
                onTryItOn={onTryItOn}
                onQuickAdd={onQuickAdd}
                onGoToCart={onGoToCart}
                onBuyNow={onBuyNow}
                secondaryAction="viewDetails"
              />
            </div>
          ))}
        </div>

        {pageCount > 1 && (
          <>
            <button type="button" onClick={() => goTo(page - 1)} disabled={page === 0} aria-label="Previous products" className={`${arrowClass} left-0 -translate-x-1/2 min-[1400px]:-translate-x-[150%]`}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => goTo(page + 1)} disabled={page >= pageCount - 1} aria-label="Next products" className={`${arrowClass} right-0 translate-x-1/2 min-[1400px]:translate-x-[150%]`}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {pageCount > 1 && (
        <div className="mt-6 flex flex-wrap justify-center gap-1">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show products page ${i + 1} of ${pageCount}`}
              aria-current={i === page ? 'true' : undefined}
              className="w-6 h-6 flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F05A7E]"
            >
              <span className={`w-2.5 h-2.5 rounded-full transition-colors ${i === page ? 'bg-[#F05A7E]' : 'bg-[#F5CCD7]'}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
