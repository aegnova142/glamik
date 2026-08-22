import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';
import { CartItem } from '../../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onCheckout: () => void;
  onViewFullBag?: () => void;
  onOpenProduct: (product: any) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  onViewFullBag,
}) => {
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  const subtotal = cartItems.reduce((sum, item) => {
    const price = item.product.price || 0;
    return sum + price * item.quantity;
  }, 0);

  const freeShippingThreshold = 999;
  const progressToFreeShipping = Math.min(100, (subtotal / freeShippingThreshold) * 100);
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal - discount;

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (promoCode.trim().toUpperCase() === 'GLAMIRK10' || promoCode.trim().length > 0) {
      setPromoApplied(true);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
          />

          {/* Slide-over Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl z-50 flex flex-col justify-between border-l border-[#E8D5A8]"
          >
            {/* Drawer Header */}
            <div className="p-5 sm:p-6 border-b border-[#E8D5A8] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#FCE8ED] text-[#F05A7E] rounded-xl">
                  <ShoppingBag className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#121212]">
                    Shopping Bag
                  </h3>
                  <span className="text-xs text-[#6B6B6B]">
                    {cartItems.reduce((acc, item) => acc + item.quantity, 0)} {cartItems.reduce((acc, item) => acc + item.quantity, 0) === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
              <button
                id="cart-drawer-close-btn"
                onClick={onClose}
                className="p-2 text-[#121212] hover:text-[#F05A7E] hover:bg-[#FCE8ED] transition-colors rounded-full cursor-pointer"
                aria-label="Close bag"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Free Shipping Progress Bar */}
            <div className="bg-[#FCE8ED] px-6 py-3 border-b border-[#E8D5A8]">
              <div className="flex items-center justify-between text-xs font-semibold text-[#6B6B6B] mb-1.5">
                {remainingForFreeShipping > 0 ? (
                  <span>
                    Add <strong className="text-[#F05A7E]">₹{remainingForFreeShipping}</strong> more for free delivery
                  </span>
                ) : (
                  <span className="text-[#F05A7E] flex items-center gap-1 font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    You unlocked complimentary shipping!
                  </span>
                )}
              </div>
              <div className="w-full bg-[#E8D5A8] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#F05A7E] h-full transition-all duration-500 rounded-full"
                  style={{ width: `${progressToFreeShipping}%` }}
                />
              </div>
            </div>

            {/* Cart Items List */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-grow space-y-4">
              {cartItems.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <div className="w-16 h-16 bg-[#FCE8ED] text-[#F05A7E] rounded-full flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
                  </div>
                  <h4 className="text-xl font-bold text-[#121212]">
                    Your bag is empty
                  </h4>
                  <p className="text-xs text-[#6B6B6B] max-w-xs mx-auto leading-relaxed">
                    Discover our curated collection of velvet lipsticks, ceremonial sindoor, and melting cleanser rituals.
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-2 px-6 py-2.5 bg-[#F05A7E] text-white text-xs font-bold rounded-full hover:bg-[#F05A7E] transition-colors shadow-sm cursor-pointer"
                  >
                    Explore The Edit
                  </button>
                </div>
              ) : (
                cartItems.map((item, idx) => (
                  <div
                    key={`${item.product.id}-${item.selectedShade?.id || ''}-${item.selectedSize || ''}-${idx}`}
                    className="flex gap-4 p-3.5 bg-[#FCE8ED]/40 rounded-2xl border border-[#E8D5A8]"
                  >
                    {/* Item Thumbnail */}
                    <div className="w-20 h-24 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                      <img
                        src={item.product.images.primary}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-grow flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-xs sm:text-sm font-bold text-[#121212] leading-snug">
                            {item.product.name}
                          </h4>
                          <button
                            onClick={() => onRemoveItem(idx)}
                            className="text-[#6B6B6B] hover:text-[#F05A7E] transition-colors p-1 cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {item.selectedShade && (
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#6B6B6B]">
                            <span
                              className="w-3 h-3 rounded-full border border-black/10 inline-block"
                              style={{ backgroundColor: item.selectedShade.hex }}
                            />
                            <span>Shade: {item.selectedShade.name}</span>
                          </div>
                        )}

                        {item.selectedSize && (
                          <span className="text-[11px] text-[#6B6B6B] block mt-0.5">
                            Size: {item.selectedSize}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        {/* Quantity Stepper */}
                        <div className="flex items-center border border-[#E8D5A8] rounded-full bg-white px-1">
                          <button
                            onClick={() => onUpdateQuantity(idx, item.quantity - 1)}
                            className="w-6 h-6 flex items-center justify-center text-[#121212] hover:bg-[#FCE8ED] rounded-full transition-colors cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-[#121212]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(idx, item.quantity + 1)}
                            className="w-6 h-6 flex items-center justify-center text-[#121212] hover:bg-[#FCE8ED] rounded-full transition-colors cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="text-sm font-bold text-[#121212]">
                          {item.product.currency || '₹'}{(item.product.price || 0) * item.quantity}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer & Checkout */}
            {cartItems.length > 0 && (
              <div className="p-5 sm:p-6 bg-[#FCE8ED]/60 border-t border-[#E8D5A8] space-y-3.5">
                {/* Promo Code Accordion */}
                <form onSubmit={handleApplyPromo} className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Privilege Code (GLAMIRK10)"
                    className="flex-grow px-3 py-2 bg-white rounded-full border border-[#E8D5A8] text-xs text-[#121212] uppercase focus:outline-none focus:border-[#F05A7E]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#F05A7E] text-white text-xs font-bold rounded-full hover:bg-[#F05A7E] transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </form>

                {promoApplied && (
                  <div className="text-xs text-[#F05A7E] font-bold flex items-center justify-between bg-[#FCE8ED] p-2 rounded-xl border border-[#E8D5A8]">
                    <span>10% Luxury Privilege Applied</span>
                    <span>-₹{discount}</span>
                  </div>
                )}

                <div className="space-y-1.5 text-xs text-[#6B6B6B] pt-1">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-bold text-[#121212]">₹{subtotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span className="font-bold text-[#121212]">
                      {remainingForFreeShipping === 0 ? 'Free' : '₹99'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-[#121212] font-extrabold pt-2 border-t border-[#E8D5A8]">
                    <span>Estimated Total</span>
                    <span className="text-[#F05A7E]">₹{total + (remainingForFreeShipping === 0 ? 0 : 99)}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    id="checkout-bag-btn"
                    onClick={onCheckout}
                    className="w-full py-3.5 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold rounded-full transition-all flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(240, 90, 126,0.3)] hover:scale-102 active:scale-95 cursor-pointer"
                  >
                    <span>Proceed To Secure Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {onViewFullBag && (
                    <button
                      id="view-full-bag-btn"
                      onClick={onViewFullBag}
                      className="w-full py-2 bg-white border border-[#E8D5A8] text-[#121212] text-xs font-bold rounded-full hover:bg-[#FCE8ED] transition-colors cursor-pointer text-center"
                    >
                      View Full Bag
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#6B6B6B]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#F05A7E]" />
                  <span>100% Authentic Glamirk Formulations</span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

