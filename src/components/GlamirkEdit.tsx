import React, { useState } from 'react';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { ProductCard } from './ProductCard';
import { Product, Shade } from '../types';
import { Sparkles, ArrowRight } from 'lucide-react';

interface GlamirkEditProps {
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
  onQuickView: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onOpenShadeFinder: () => void;
  onExploreShop?: () => void;
}

export const GlamirkEdit: React.FC<GlamirkEditProps> = ({
  wishlist,
  onToggleWishlist,
  onQuickView,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onOpenShadeFinder,
  onExploreShop,
}) => {
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'MAKEUP' | 'SKIN'>('ALL');

  const filteredProducts = GLAMIRK_PRODUCTS.filter((product) => {
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'MAKEUP') return product.category === 'Makeup';
    if (activeCategory === 'SKIN') return product.category === 'Skin';
    return true;
  });

  return (
    <section id="the-glamirk-edit" className="py-16 sm:py-24 bg-[#FCE8ED]/40 border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 sm:mb-14 gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
              <span className="w-2 h-2 rounded-full bg-[#F05A7E]"></span>
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#F05A7E]">
                Most Loved Creations
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] leading-tight">
              Best Sellers
            </h2>
            <p className="text-sm sm:text-base text-[#6B6B6B] font-normal leading-relaxed">
              Our most-coveted cosmetic icons and skincare essentials. Weightless velvet lip pigments, ceremonial sindoor, and melt-away cleansers.
            </p>
          </div>

          {/* Category Filter Pills & Explore Link */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-white border border-[#E8D5A8] rounded-full shadow-xs">
              {(['ALL', 'MAKEUP', 'SKIN'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                    activeCategory === cat
                      ? 'bg-[#F05A7E] text-white shadow-xs'
                      : 'text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FCE8ED]'
                  }`}
                >
                  {cat === 'ALL' ? 'All Products' : cat === 'MAKEUP' ? 'Makeup' : 'Skincare'}
                </button>
              ))}
            </div>

            {onExploreShop && (
              <button
                onClick={onExploreShop}
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-bold text-[#F05A7E] hover:text-[#F05A7E] transition-colors ml-2 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isWishlisted={wishlist.includes(product.id)}
              onToggleWishlist={onToggleWishlist}
              onQuickView={onQuickView}
              onSelectProduct={onSelectProduct}
              onTryItOn={onTryItOn}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </div>

        {/* Bottom Banner Teaser inside The Edit */}
        <div className="mt-12 bg-white p-6 sm:p-8 rounded-3xl border border-[#E8D5A8] shadow-[0_8px_30px_rgba(240, 90, 126,0.06)] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <span className="text-[10.5px] tracking-wider uppercase text-[#F05A7E] font-bold">
              Unsure About Your Undertone?
            </span>
            <h3 className="text-xl sm:text-2xl font-bold text-[#121212]">
              Match Your Shade with Precision
            </h3>
            <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-xl">
              Explore our shade intelligence algorithm to find your exact match across liquid lipsticks and ceremonial sindoor.
            </p>
          </div>

          <button
            onClick={onOpenShadeFinder}
            className="flex-shrink-0 px-6 py-3 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold rounded-full transition-all flex items-center gap-2 shadow-[0_4px_12px_rgba(240, 90, 126,0.25)] hover:scale-102 active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Find My Shade</span>
          </button>
        </div>

      </div>
    </section>
  );
};

