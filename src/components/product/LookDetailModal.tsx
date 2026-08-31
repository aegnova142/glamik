import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Sparkles, ArrowRight } from 'lucide-react';
import { Look, Product, Shade } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { useCMS } from '../../context/CMSContext';

interface LookDetailModalProps {
  look: Look | null;
  isOpen: boolean;
  onClose: () => void;
  onAddLookToBag: (products: { product: Product; shade?: Shade; size?: string }[]) => void;
}

export const LookDetailModal: React.FC<LookDetailModalProps> = ({
  look,
  isOpen,
  onClose,
  onAddLookToBag
}) => {
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;

  if (!look) return null;

  const resolvedProducts = look.productsUsed.map((item) => {
    const prod = catalogProducts.find((p) => p.id === item.productId) || catalogProducts[0];
    const matchingShade = prod.shades?.find((s) => s.name === item.shadeName) || prod.shades?.[0];
    return {
      product: prod,
      role: item.role,
      shade: matchingShade,
      size: prod.selectedSize || prod.sizes?.[0]
    };
  });

  const lookTotalPrice = resolvedProducts.reduce((sum, item) => sum + (item.product.price || 0), 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0B0B0B]/70 backdrop-blur-xs transition-opacity"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto z-10 grid grid-cols-1 md:grid-cols-12"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 p-2 bg-[#FAF9F6]/80 hover:bg-[#0B0B0B] hover:text-white text-[#121212] transition-colors rounded-full border border-[#E8D5A8]"
              aria-label="Close look view"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Image */}
            <div className="md:col-span-5 relative aspect-[3/4] md:aspect-auto overflow-hidden bg-[#FAF9F6] flex items-center justify-center">
              <img
                src={look.image}
                alt={look.title}
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B]/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <span className="text-[10px] tracking-widest uppercase text-[#C9972B] block">
                  {look.category}
                </span>
                <h3 className="font-serif text-2xl text-white">
                  {look.title}
                </h3>
              </div>
            </div>

            {/* Right Breakdown */}
            <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10.5px] uppercase tracking-[0.24em] text-[#C9972B] font-semibold">
                    LOOK BREAKDOWN
                  </span>
                  <h2 className="font-serif text-2xl text-[#121212]">
                    {look.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#6B6B6B] font-light leading-relaxed">
                    {look.description}
                  </p>
                </div>

                {/* Products List */}
                <div className="space-y-3 pt-2">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-[#121212] block">
                    Products in This Look:
                  </span>

                  {resolvedProducts.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-14 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                          <img
                            src={item.product.images.primary}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <span className="text-[9.5px] tracking-wider uppercase text-[#C9972B] block font-semibold">
                            {item.role}
                          </span>
                          <h4 className="font-serif text-sm font-medium text-[#121212]">
                            {item.product.name}
                          </h4>
                          {item.shade && (
                            <span className="text-[11px] text-[#6B6B6B]">
                              Shade: {item.shade.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-serif text-sm text-[#121212] font-medium flex-shrink-0">
                        ₹{item.product.price}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & Action */}
              <div className="pt-4 border-t border-[#E8D5A8] space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs uppercase tracking-wider text-[#6B6B6B]">
                    Look Total ({resolvedProducts.length} Items):
                  </span>
                  <span className="font-serif text-xl font-medium text-[#121212]">
                    ₹{lookTotalPrice}
                  </span>
                </div>

                <button
                  onClick={() => {
                    onAddLookToBag(resolvedProducts.map(p => ({ product: p.product, shade: p.shade, size: p.size })));
                    onClose();
                  }}
                  className="w-full py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-[11.5px] font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-[#C9972B]" />
                  <span>ADD FULL LOOK TO BAG</span>
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
