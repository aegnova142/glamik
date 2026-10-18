import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Product } from '@glamirk/shared/types';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { ArrowRight, ChevronLeft, ChevronRight, Eye, Heart, Star } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { ProductImage } from './ProductImage';
import { RATINGS_ENABLED } from './ProductCard';

interface RecentlyViewedProps {
  recentlyViewedIds: string[];
  onSelectProduct: (product: Product) => void;
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
}

const arrowClass =
  'hidden sm:flex absolute top-[38%] -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white border border-[#E8D5A8] shadow-sm items-center justify-center text-[#121212] hover:text-[#F05A7E] hover:border-[#F05A7E] transition-colors cursor-pointer disabled:opacity-0 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[#F05A7E]';

const RecentlyViewedCard: React.FC<{
  product: Product;
  isWishlisted: boolean;
  onSelect: () => void;
  onToggleWishlist: () => void;
}> = ({ product, isWishlisted, onSelect, onToggleWishlist }) => (
  <article className="h-full flex flex-col bg-white border border-[#E8D5A8] rounded-2xl overflow-hidden transition-shadow hover:shadow-[0_12px_30px_rgba(240,90,126,0.10)]">
    {/* Image surface is the card's own (same pink the old card used), never the page's. */}
    <div className="relative aspect-[16/9] lg:aspect-[2/1] bg-[#FCE8ED]">
      <button type="button" onClick={onSelect} tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-pointer">
        <ProductImage src={product.images.primary} alt="" className="w-full h-full object-contain" />
      </button>
      <span className="absolute top-3 left-3 sm:top-4 sm:left-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FCE8ED]/95 border border-white text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-[#D63B63]">
        <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Recently Viewed
      </span>
      <button
        type="button"
        onClick={onToggleWishlist}
        aria-pressed={isWishlisted}
        aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        className="absolute top-3 right-3 sm:top-4 sm:right-4 w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#D63B63] hover:scale-105 transition-transform cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F05A7E]"
      >
        <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-[#F05A7E] text-[#F05A7E]' : ''}`} />
      </button>
    </div>

    <div className="flex-1 flex flex-col p-5 sm:p-6 sm:pb-5">
      <span className="text-[11px] uppercase tracking-wider text-[#6B6B6B]">{product.subCategory || product.category}</span>
      <h3 className="mt-1 font-serif text-xl sm:text-2xl text-[#121212] leading-snug line-clamp-1">{product.name}</h3>
      {RATINGS_ENABLED && product.reviewCount > 0 && (
        <p className="mt-2 flex items-center gap-2 text-sm text-[#6B6B6B]">
          <span className="relative inline-flex" role="img" aria-label={`${product.rating} out of 5 stars`}>
            <span className="flex gap-0.5 text-[#E8D5A8]">
              {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="w-4 h-4" />)}
            </span>
            <span className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ width: `${(product.rating / 5) * 100}%` }}>
              {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="w-4 h-4 shrink-0 fill-[#C9972B] text-[#C9972B]" />)}
            </span>
          </span>
          {product.rating.toFixed(1)} ({product.reviewCount} review{product.reviewCount === 1 ? '' : 's'})
        </p>
      )}

      <div className="mt-auto pt-4">
        <div className="pt-4 border-t border-[#E8D5A8]/70 flex items-center justify-between gap-3">
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-xl sm:text-2xl font-bold text-[#121212]">
              {product.currency}{product.price}
            </span>
            {product.originalPrice && product.originalPrice > product.price && (
              <span className="text-xs text-[#6B6B6B] line-through">
                {product.currency}{product.originalPrice}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onSelect}
            aria-label={`View ${product.name}`}
            className="shrink-0 inline-flex items-center gap-2 px-5 sm:px-8 py-3 rounded-full bg-[#F05A7E] hover:bg-[#E04A6E] text-white text-xs sm:text-sm font-semibold uppercase tracking-wide transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05A7E]"
          >
            View Product <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </article>
);

export const RecentlyViewed: React.FC<RecentlyViewedProps> = ({
  recentlyViewedIds,
  onSelectProduct,
  wishlist,
  onToggleWishlist,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const trackRef = useRef<HTMLDivElement>(null);
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;

  // Ids for products that no longer exist are simply skipped.
  const products = recentlyViewedIds
    .map((id) => catalogProducts.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  const syncEdges = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    setEdges({ start: t.scrollLeft <= 2, end: t.scrollLeft >= t.scrollWidth - t.clientWidth - 2 });
  }, []);

  useEffect(() => {
    syncEdges();
    window.addEventListener('resize', syncEdges);
    return () => window.removeEventListener('resize', syncEdges);
  }, [syncEdges, products.length, showAll]);

  if (products.length === 0) return null;

  // One card's width per click; scroll-snap lands it exactly, and the track's
  // motion-safe:scroll-smooth makes reduced motion an instant jump.
  const scrollByCard = (dir: 1 | -1) => {
    const t = trackRef.current;
    const card = t?.firstElementChild as HTMLElement | null;
    if (!t || !card) return;
    t.scrollBy({ left: dir * (card.offsetWidth + parseFloat(getComputedStyle(t).columnGap || '0')) });
  };

  const renderCard = (product: Product) => (
    <RecentlyViewedCard
      product={product}
      isWishlisted={wishlist.includes(product.id)}
      onSelect={() => onSelectProduct(product)}
      onToggleWishlist={() => onToggleWishlist(product.id)}
    />
  );

  return (
    <section className="py-12 border-t border-[#E8D5A8] bg-[#FAF9F6]" aria-labelledby="recently-viewed-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <p className="flex items-center gap-3 whitespace-nowrap text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.24em] font-semibold text-[#6B6B6B]">
              Your Browsing History <span aria-hidden="true" className="hidden min-[400px]:block w-12 sm:w-16 h-px bg-[#C9972B]/70" />
            </p>
            <h2 id="recently-viewed-heading" className="mt-2 font-serif text-3xl sm:text-4xl lg:text-[2.75rem] text-[#121212] leading-tight">
              Recently Viewed
            </h2>
          </div>
          {products.length > 2 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="shrink-0 inline-flex items-center gap-2 text-sm sm:text-base text-[#121212] hover:text-[#F05A7E] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F05A7E] rounded"
            >
              {showAll ? 'Show Less' : `View All (${products.length})`}
              <ArrowRight className={`w-4 h-4 transition-transform ${showAll ? '-rotate-90' : ''}`} aria-hidden="true" />
            </button>
          )}
        </div>

        {showAll ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {products.map((product) => <div key={product.id}>{renderCard(product)}</div>)}
          </div>
        ) : (
          <div className="relative">
            <div
              ref={trackRef}
              onScroll={syncEdges}
              role="region"
              aria-roledescription="carousel"
              aria-label="Recently viewed products"
              className="no-scrollbar flex gap-5 overflow-x-auto snap-x snap-mandatory motion-safe:scroll-smooth"
            >
              {products.map((product) => (
                <div key={product.id} className="snap-start shrink-0 basis-[88%] sm:basis-[70%] lg:basis-[calc((100%-1.25rem)/2)]">
                  {renderCard(product)}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => scrollByCard(-1)} disabled={edges.start} aria-label="Previous products" className={`${arrowClass} left-0 -translate-x-1/2 min-[1400px]:-translate-x-[150%]`}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => scrollByCard(1)} disabled={edges.end} aria-label="Next products" className={`${arrowClass} right-0 translate-x-1/2 min-[1400px]:translate-x-[150%]`}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
