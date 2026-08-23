import React, { useState } from 'react';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { ProductCard } from '../product/ProductCard';
import { Product, Shade } from '../../types';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface GlamirkEditProps {
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
  onQuickView: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onExploreShop?: () => void;
}

export const GlamirkEdit: React.FC<GlamirkEditProps> = ({
  wishlist,
  onToggleWishlist,
  onQuickView,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
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
                  onClick={() => {
                    setActiveCategory(cat);
                    setShowAll(false);
                  }}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[30px]">
          {visibleProducts.map((product) => (
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

        {hasMore && (
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-[#E8D5A8] rounded-full text-xs font-semibold text-[#121212] hover:border-[#F05A7E] hover:text-[#F05A7E] transition-colors bg-white"
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

