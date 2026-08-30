import React from 'react';
import { ProductCard } from './ProductCard';
import { ProductDiscoveryBanner } from './ProductDiscoveryBanner';
import { Product, Shade, CartItem } from '../../types';
import { Sparkles, RotateCcw } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  wishlist: string[];
  cartItems: CartItem[];
  viewMode?: 'grid' | 'list';
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  onBuyNow: (product: Product, shade?: Shade, size?: string) => void;
  onOpenShadeFinder: () => void;
  onResetFilters: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  wishlist,
  cartItems,
  viewMode = 'grid',
  onToggleWishlist,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onGoToCart,
  onBuyNow,
  onOpenShadeFinder,
  onResetFilters,
}) => {
  if (products.length === 0) {
    return (
      <div className="space-y-4 rounded-xl border border-[#E8D5A8] bg-white/60 p-8 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8D5A8] text-[#6B6B6B]">
          <Sparkles className="h-6 w-6 stroke-[1.2]" />
        </div>
        <h3 className="font-serif text-2xl text-[#121212]">
          WE COULDN&apos;T FIND THAT
        </h3>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-[#6B6B6B]">
          No Glamirk creations currently match your selected filters. Try adjusting price, undertone, or finish preferences.
        </p>
        <button
          onClick={onResetFilters}
          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#0B0B0B] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#FAF9F6] transition-colors hover:bg-[#171717]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>RESET ALL FILTERS</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div
        className={
          viewMode === 'list'
            ? 'flex flex-col gap-3.5'
            : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4'
        }
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            viewMode={viewMode}
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

      {/* Editorial Merchandising Banner */}
      <ProductDiscoveryBanner onOpenShadeFinder={onOpenShadeFinder} />
    </div>
  );
};
