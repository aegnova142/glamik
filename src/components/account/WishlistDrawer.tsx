import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { Product, Shade } from '../../types';

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wishlist: string[];
  onRemoveFromWishlist: (productId: string) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onQuickView: (product: Product) => void;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  isOpen,
  onClose,
  wishlist,
  onRemoveFromWishlist,
  onQuickAdd,
  onQuickView
}) => {
  const wishlistedProducts = GLAMIRK_PRODUCTS.filter((p) => wishlist.includes(p.id));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl z-50 flex flex-col justify-between border-l border-[#E8D5A8]"
          >
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-[#E8D5A8] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#FCE8ED] text-[#F05A7E] rounded-xl">
                  <Heart className="w-5 h-5 fill-[#F05A7E]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#121212]">
                    Saved Favorites
                  </h3>
                  <span className="text-xs text-[#6B6B6B]">
                    {wishlistedProducts.length} {wishlistedProducts.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-[#121212] hover:text-[#F05A7E] hover:bg-[#FCE8ED] transition-colors rounded-full cursor-pointer"
                aria-label="Close wishlist"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-grow space-y-5">
              {wishlistedProducts.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <div className="w-16 h-16 bg-[#FCE8ED] rounded-full flex items-center justify-center mx-auto text-[#F05A7E]">
                    <Heart className="w-8 h-8 stroke-[1.5]" />
                  </div>
                  <h4 className="text-xl font-bold text-[#121212]">
                    Your wishlist is empty
                  </h4>
                  <p className="text-xs text-[#6B6B6B] max-w-xs mx-auto leading-relaxed">
                    Save your desired liquid lipsticks, ritual cleansers, and ceremonial sindoor for effortless access.
                  </p>
                </div>
              ) : (
                wishlistedProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex gap-4 pb-5 border-b border-[#E8D5A8] last:border-none"
                  >
                    <div
                      className="w-20 h-24 bg-[#FCE8ED] rounded-2xl overflow-hidden flex-shrink-0 border border-[#E8D5A8] cursor-pointer"
                      onClick={() => {
                        onClose();
                        onQuickView(product);
                      }}
                    >
                      <img
                        src={product.images.primary}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-grow flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between">
                          <h4
                            onClick={() => {
                              onClose();
                              onQuickView(product);
                            }}
                            className="text-sm font-bold text-[#121212] leading-snug cursor-pointer hover:text-[#F05A7E] transition-colors"
                          >
                            {product.name}
                          </h4>
                          <button
                            onClick={() => onRemoveFromWishlist(product.id)}
                            className="text-[#6B6B6B] hover:text-[#F05A7E] transition-colors p-1 cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[11px] text-[#6B6B6B] block mt-0.5">
                          {product.subtitle}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <span className="text-sm font-extrabold text-[#121212]">
                          {product.currency}{product.price}
                        </span>
                        <button
                          onClick={() => {
                            onQuickAdd(product, product.shades?.[0], product.selectedSize || product.sizes?.[0]);
                          }}
                          className="px-3.5 py-1.5 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-[10px] font-bold tracking-wider uppercase rounded-full transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                        >
                          <ShoppingBag className="w-3 h-3" />
                          <span>MOVE TO BAG</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {wishlistedProducts.length > 0 && (
              <div className="p-5 sm:p-6 bg-[#FCE8ED]/60 border-t border-[#E8D5A8]">
                <button
                  onClick={onClose}
                  className="w-full py-3.5 bg-white border border-[#E8D5A8] text-[#121212] hover:border-[#F05A7E] hover:bg-[#FCE8ED] text-xs font-bold tracking-wider uppercase rounded-full transition-colors cursor-pointer"
                >
                  CONTINUE SHOPPING
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
