import React from 'react';
import { ProductCard } from './ProductCard';
import { ProductDiscoveryBanner } from './ProductDiscoveryBanner';
import { Product, Shade } from '../../types';
import { Sparkles, RotateCcw } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
  onQuickView: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onOpenShadeFinder: () => void;
  onResetFilters: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  wishlist,
  onToggleWishlist,
  onQuickView,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onOpenShadeFinder,
  onResetFilters,
}) => {
  if (products.length === 0) {
    return (
      <div className="py-20 text-center space-y-4 bg-[#FAF9F6]/50 border border-[#E8D5A8] p-8">
        <div className="w-14 h-14 bg-[#E8D5A8] rounded-full flex items-center justify-center mx-auto text-[#6B6B6B]">
          <Sparkles className="w-6 h-6 stroke-[1.2]" />
        </div>
        <h3 className="font-serif text-2xl text-[#121212]">
          WE COULDN&apos;T FIND THAT
        </h3>
        <p className="text-xs text-[#6B6B6B] max-w-md mx-auto leading-relaxed">
          No Glamirk creations currently match your selected filters. Try adjusting price, undertone, or finish preferences.
        </p>
        <button
          onClick={onResetFilters}
          className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>RESET ALL FILTERS</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[30px]">
        {products.map((product, idx) => (
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

      {/* Editorial Merchandising Banner */}
      <ProductDiscoveryBanner onOpenShadeFinder={onOpenShadeFinder} />
    </div>
  );
};
