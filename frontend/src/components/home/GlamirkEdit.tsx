import React, { useState } from 'react';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { ProductCard } from '../product/ProductCard';
import { Product, Shade, CartItem } from '@glamirk/shared/types';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { SectionBackground } from './SectionBackground';

const Sparkle: React.FC<{ className?: string; color?: string; style?: React.CSSProperties }> = ({ className = '', color = '#D8B36A', style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} fill={color} aria-hidden="true">
    <path d="M12 0c1 8 3 11 12 12-9 1-11 4-12 12-1-8-3-11-12-12 9-1 11-4 12-12Z" />
  </svg>
);

interface GlamirkEditProps {
  wishlist: string[];
  cartItems: CartItem[];
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  onBuyNow: (product: Product, shade?: Shade, size?: string) => void;
  onExploreShop?: () => void;
}

export const GlamirkEdit: React.FC<GlamirkEditProps> = ({
  wishlist,
  cartItems,
  onToggleWishlist,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onGoToCart,
  onBuyNow,
  onExploreShop,
}) => {
  const { products: cmsProducts } = useCMS();
  const allProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const bestSellers = allProducts.filter((p) => p.isBestSeller || p.tag === 'BESTSELLER');
  const sourceProducts = bestSellers.length >= 3 ? bestSellers : allProducts;

  const [activeCategory, setActiveCategory] = useState<'ALL' | 'MAKEUP' | 'SKIN'>('ALL');
  const [showAll, setShowAll] = useState(false);
  const CARDS_PER_ROW = 3;

  const filteredProducts = sourceProducts.filter((product) => {
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'MAKEUP') return product.category === 'Makeup';
    if (activeCategory === 'SKIN') return product.category === 'Skin';
    return true;
  });

  const visibleProducts = showAll ? filteredProducts : filteredProducts.slice(0, CARDS_PER_ROW);
  const hasMore = filteredProducts.length > CARDS_PER_ROW;

  return (
    <section id="the-glamirk-edit" className="relative overflow-hidden py-16 sm:py-24 bg-[#FFFBF9] border-b border-[#F3E3E6]">
      {/* Admin-managed background (renders only when configured; else the
          atmospheric art direction below is the fallback). */}
      <SectionBackground sectionKey="best-sellers" className="z-[1]" />
      {/* [Glamik] 2026-10-06 — Best Sellers art direction, rebuilt from scratch.
          Seamless atmospheric luxury background: soft pigment/champagne washes +
          film-grain powder + one hairline. No object PNGs, no clipart, no crops —
          pure CSS/gradient so there are zero sticker/rectangle edges. Edge-weighted,
          center clean. All absolute / pointer-events-none; never affects layout. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* abstract rose pigment wash — left (hero side, slightly stronger) */}
        <div className="absolute -left-48 top-[8%] h-[600px] w-[680px] rounded-full blur-[30px] opacity-90"
             style={{ background: 'radial-gradient(closest-side, rgba(233,107,148,0.17), rgba(233,107,148,0.05) 55%, transparent 72%)' }} />
        {/* champagne illumination — right (quieter) */}
        <div className="absolute -right-40 top-[28%] h-[560px] w-[600px] rounded-full blur-[30px] opacity-90"
             style={{ background: 'radial-gradient(closest-side, rgba(216,179,106,0.13), rgba(216,179,106,0.04) 55%, transparent 72%)' }} />
        {/* bottom blush haze */}
        <div className="absolute inset-x-0 -bottom-28 h-80"
             style={{ background: 'radial-gradient(ellipse at bottom, rgba(252,231,236,0.75), transparent 70%)' }} />
        {/* bright, clean center so content reads crisp */}
        <div className="absolute left-1/2 top-2 h-52 w-[760px] -translate-x-1/2 rounded-full bg-white/70 blur-3xl" />
        {/* one ultra-thin champagne hairline near the far-left edge (desktop) */}
        <svg className="absolute left-7 top-0 hidden h-full w-16 opacity-25 lg:block" viewBox="0 0 60 600" preserveAspectRatio="none">
          <path d="M42 0 C6 160 6 440 46 600" fill="none" stroke="#D8B36A" strokeWidth="1" />
        </svg>
        {/* faint editorial film-grain / powder texture */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.045] mix-blend-multiply">
          <filter id="bsGrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#bsGrain)" />
        </svg>
      </div>

      {/* Soft warm halo directly behind the product grid — cards feel elevated */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-14 top-56 mx-auto max-w-6xl rounded-[3rem] bg-[#FFF4F6]/60 blur-2xl" />

      <div className="relative z-[2] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 sm:mb-14 gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#FCECEF] border border-[#EAD9C8] rounded-full shadow-[0_1px_4px_rgba(201,54,93,0.05)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F34F78]"></span>
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#F34F78]">
                Most Loved Creations
              </span>
            </div>
            <h2 className="relative inline-flex items-start font-serif text-4xl sm:text-5xl md:text-[3.4rem] font-bold leading-[1.05] tracking-tight text-[#171717]">
              Best&nbsp;<span className="text-[#F34F78]">Sellers</span>
              <Sparkle className="ml-1 mt-1 w-5 opacity-80" />
            </h2>
            <p className="text-sm sm:text-base text-[#524C4C] font-normal leading-relaxed max-w-xl">
              Our most-coveted cosmetic icons and skincare essentials. Weightless velvet lip pigments, ceremonial sindoor, and melt-away cleansers.
            </p>
          </div>

          {/* Category Filter Pills & Explore Link */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-white border border-[#EAD9C8] rounded-full shadow-[0_2px_8px_rgba(201,54,93,0.05)]">
              {(['ALL', 'MAKEUP', 'SKIN'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    setShowAll(false);
                  }}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                    activeCategory === cat
                      ? 'bg-[#F34F78] text-white shadow-[0_2px_8px_rgba(243,79,120,0.3)]'
                      : 'text-[#524C4C] hover:text-[#171717] hover:bg-[#FCECEF]'
                  }`}
                >
                  {cat === 'ALL' ? 'All Products' : cat === 'MAKEUP' ? 'Makeup' : 'Skincare'}
                </button>
              ))}
            </div>

            {onExploreShop && (
              <button
                onClick={onExploreShop}
                className="group hidden md:inline-flex items-center gap-1.5 text-xs font-bold text-[#F34F78] hover:text-[#C9365D] transition-colors ml-2 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[30px]">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isWishlisted={wishlist.includes(product.id)}
              cartItems={cartItems}
              onToggleWishlist={onToggleWishlist}
              onSelectProduct={onSelectProduct}
              onTryItOn={onTryItOn}
              onQuickAdd={onQuickAdd}
              onGoToCart={onGoToCart}
              onBuyNow={onBuyNow}
            />
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-[#EAD9C8] rounded-full text-xs font-semibold text-[#171717] hover:border-[#F34F78] hover:text-[#F34F78] transition-colors bg-white shadow-[0_2px_8px_rgba(201,54,93,0.05)]"
            >
              <span>{showAll ? 'View Less' : `View More (${filteredProducts.length - CARDS_PER_ROW})`}</span>
              {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

      </div>
    </section>
  );
};

