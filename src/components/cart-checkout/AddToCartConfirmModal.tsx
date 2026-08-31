import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ShoppingBag, X, Loader2 } from 'lucide-react';
import { Product, Shade } from '../../types';
import { getCurrentPrice } from '../../utils/productVariant';

interface AddToCartConfirmModalProps {
  isOpen: boolean;
  /** "confirm" — nothing has been added yet; shows Cancel + Add to Cart.
   * "success" — the add already happened server-side; shows Continue
   * Shopping + Go to Cart. Closing/Cancel in "confirm" mode must never
   * touch the cart — see handleCancelAddToCart in App.tsx. */
  mode: 'confirm' | 'success';
  product: Product | null;
  shade?: Shade;
  size?: string;
  quantity: number;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onGoToCart: () => void;
}

export const AddToCartConfirmModal: React.FC<AddToCartConfirmModalProps> = ({
  isOpen,
  mode,
  product,
  shade,
  size,
  quantity,
  isSubmitting = false,
  onClose,
  onConfirm,
  onGoToCart,
}) => {
  if (!product) return null;
  const price = getCurrentPrice(product, shade, size);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0B0B0B]/50 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-white border border-[#E8D5A8] shadow-2xl max-w-sm w-full z-10 p-6 space-y-5"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 text-[#6B6B6B] hover:text-[#121212] cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-[#C9972B]">
              <div className="w-7 h-7 rounded-full bg-[#0B0B0B] flex items-center justify-center shrink-0">
                {mode === 'success' ? (
                  <Check className="w-4 h-4 text-[#C9972B]" />
                ) : (
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                )}
              </div>
              <span className="text-xs font-semibold tracking-[0.18em] uppercase text-[#121212]">
                {mode === 'success' ? 'Added to Your Bag' : 'Add This to Your Bag?'}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <img
                src={product.images.primary}
                alt={product.name}
                className="w-16 h-20 object-cover border border-[#E8D5A8] shrink-0"
              />
              <div className="min-w-0 space-y-0.5">
                <h4 className="font-serif text-sm text-[#121212] truncate">{product.name}</h4>
                {shade && <p className="text-xs text-[#6B6B6B]">Shade: {shade.name}</p>}
                {size && <p className="text-xs text-[#6B6B6B]">Size: {size}</p>}
                <p className="text-xs text-[#6B6B6B]">Qty: {quantity}</p>
                <p className="text-sm font-semibold text-[#121212]">{product.currency}{price * quantity}</p>
              </div>
            </div>

            {mode === 'confirm' ? (
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 py-3 border border-[#E8D5A8] text-xs font-semibold tracking-wider uppercase text-[#121212] hover:bg-[#FAF9F6] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue Shopping
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#171717] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-wait"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-[#C9972B] animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                      <span>Add to Cart</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 border border-[#E8D5A8] text-xs font-semibold tracking-wider uppercase text-[#121212] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                >
                  Continue Shopping
                </button>
                <button
                  onClick={onGoToCart}
                  className="flex-1 py-3 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#171717] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>Go to Cart</span>
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
