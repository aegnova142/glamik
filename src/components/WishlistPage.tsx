import React from 'react';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { Product, Shade } from '../types';
import { Heart, ShoppingBag, Trash2, ArrowRight, Sparkles } from 'lucide-react';

interface WishlistPageProps {
  wishlist: string[];
  onRemoveFromWishlist: (productId: string) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onSelectProduct: (product: Product) => void;
  onExploreShop: () => void;
}

export const WishlistPage: React.FC<WishlistPageProps> = ({
  wishlist,
  onRemoveFromWishlist,
  onQuickAdd,
  onSelectProduct,
  onExploreShop,
}) => {
  const wishlistedProducts = GLAMIRK_PRODUCTS.filter((p) => wishlist.includes(p.id));

  return (
    <div className="bg-[#FAF9F6] min-h-screen">
      {/* Header */}
      <div className="bg-[#0B0B0B] text-[#FAF9F6] py-14 sm:py-20 px-4 sm:px-6 lg:px-8 border-b border-[#171717] relative overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-2 relative z-10">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-[#C9972B] fill-[#C9972B]" />
            <span className="text-[10.5px] font-semibold tracking-[0.26em] uppercase text-[#C9972B]">
              YOUR PRIVATE SELECTION
            </span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl text-[#FAF9F6] tracking-tight">
            YOUR BEAUTY EDIT
          </h1>

          <p className="text-xs sm:text-sm text-[#C9972B] font-light max-w-xl">
            {wishlistedProducts.length} saved creation{wishlistedProducts.length === 1 ? '' : 's'} waiting for your vanity.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {wishlistedProducts.length === 0 ? (
          <div className="py-20 text-center space-y-4 max-w-md mx-auto bg-[#FAF9F6] border border-[#E8D5A8] p-8 sm:p-12">
            <div className="w-16 h-16 bg-[#FAF9F6] rounded-full flex items-center justify-center mx-auto text-[#6B6B6B]">
              <Heart className="w-8 h-8 stroke-[1.2]" />
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">
              YOUR BEAUTY EDIT IS EMPTY.
            </h2>

            <p className="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed">
              Your beauty edit is currently empty. Tap the heart icon on any liquid lipstick, ceremonial sindoor, or ritual cleanser to save it here.
            </p>

            <button
              onClick={onExploreShop}
              className="mt-4 px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors inline-flex items-center gap-2"
            >
              <span>EXPLORE GLAMIRK</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {wishlistedProducts.map((product) => (
              <div
                key={product.id}
                className="bg-[#FAF9F6] border border-[#E8D5A8] p-4 flex flex-col justify-between group"
              >
                <div>
                  <div
                    className="aspect-[4/5] bg-[#FAF9F6] overflow-hidden mb-4 cursor-pointer"
                    onClick={() => onSelectProduct(product)}
                  >
                    <img
                      src={product.images.primary}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>

                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
                        {product.subCategory}
                      </span>
                      <h3
                        onClick={() => onSelectProduct(product)}
                        className="font-serif text-lg text-[#121212] font-medium leading-snug cursor-pointer hover:text-[#C9972B] transition-colors"
                      >
                        {product.name}
                      </h3>
                    </div>

                    <button
                      onClick={() => onRemoveFromWishlist(product.id)}
                      className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors"
                      title="Remove from wishlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-[#6B6B6B] line-clamp-1 font-light mt-1">
                    {product.subtitle}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-[#E8D5A8] flex items-center justify-between">
                  <span className="font-serif text-base font-medium text-[#121212]">
                    {product.currency}{product.price}
                  </span>

                  <button
                    onClick={() => {
                      onQuickAdd(product, product.shades?.[0], product.selectedSize || product.sizes?.[0]);
                    }}
                    className="px-4 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-[10.5px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                    <span>MOVE TO BAG</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
