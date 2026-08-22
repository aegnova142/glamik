import React, { useState } from 'react';
import { CartItem, Product, Shade, Coupon } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE, GLAMIRK_COUPONS } from '../../data/commerce';
import { OffersDrawer } from '../marketing/OffersDrawer';
import {
  ShoppingBag,
  Trash2,
  Heart,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Truck,
  Tag,
  Check,
  Gift,
  ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShoppingBagPageProps {
  cartItems: CartItem[];
  wishlist: string[];
  appliedCoupon: Coupon | null;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onMoveToWishlist: (index: number, product: Product) => void;
  onApplyCoupon: (coupon: Coupon) => void;
  onRemoveCoupon: () => void;
  onProceedToCheckout: () => void;
  onContinueShopping: () => void;
  onOpenProduct: (product: Product) => void;
  onOpenAssistant: () => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
}

export const ShoppingBagPage: React.FC<ShoppingBagPageProps> = ({
  cartItems,
  wishlist,
  appliedCoupon,
  onUpdateQuantity,
  onRemoveItem,
  onMoveToWishlist,
  onApplyCoupon,
  onRemoveCoupon,
  onProceedToCheckout,
  onContinueShopping,
  onOpenProduct,
  onOpenAssistant,
  onQuickAdd,
}) => {
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isOffersDrawerOpen, setIsOffersDrawerOpen] = useState(false);

  // Gifting Option State
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');

  // Calculate financials
  const subtotal = cartItems.reduce((acc, item) => {
    const itemPrice = item.selectedSize === '30g' ? 549 : item.product.price;
    return acc + itemPrice * item.quantity;
  }, 0);

  const discountAmount = appliedCoupon
    ? appliedCoupon.discountType === 'percentage'
      ? Math.round((subtotal * appliedCoupon.discountValue) / 100)
      : appliedCoupon.discountValue
    : 0;

  const isShippingFree = subtotal >= FREE_SHIPPING_THRESHOLD || appliedCoupon?.code === 'PRIVESHIP';
  const shippingFee = cartItems.length === 0 ? 0 : isShippingFree ? 0 : STANDARD_SHIPPING_FEE;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const shippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  const handleApplyPromoCode = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError(null);

    const clean = promoInput.trim().toUpperCase();
    if (!clean) {
      setPromoError('Please enter a valid promotion code.');
      return;
    }

    const matched = GLAMIRK_COUPONS.find((c) => c.code.toUpperCase() === clean);
    if (!matched) {
      setPromoError('Invalid promotional code. Tap "View Available Offers" to inspect active privileges.');
      return;
    }

    if (matched.minOrderValue && subtotal < matched.minOrderValue) {
      setPromoError(`Code requires a minimum bag value of ₹${matched.minOrderValue}.`);
      return;
    }

    onApplyCoupon(matched);
    setPromoInput('');
  };

  // Smart Cart Recommendations: Find complementary products not currently in bag
  const cartProductIds = cartItems.map((item) => item.product.id);
  const smartRecommendations = GLAMIRK_PRODUCTS.filter(
    (p) => !cartProductIds.includes(p.id)
  ).slice(0, 3);

  return (
    <div className="bg-[#FAF9F6] min-h-screen py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Breadcrumb / Top Navigation */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onContinueShopping}
            className="flex items-center gap-1.5 text-xs text-[#6B6B6B] hover:text-[#121212] font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>CONTINUE SHOPPING</span>
          </button>
          <span className="text-xs text-[#6B6B6B] font-mono">
            BAG SUMMARY ({cartItems.reduce((sum, item) => sum + item.quantity, 0)} ITEMS)
          </span>
        </div>

        {/* Page Header */}
        <div className="mb-8 border-b border-[#E8D5A8] pb-5">
          <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            ATELIER CHECKOUT
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#121212] mt-1">
            YOUR GLAM
          </h1>
          <p className="text-xs text-[#6B6B6B] font-light mt-1">
            Carefully curated formulations reserved in your bag.
          </p>
        </div>

        {cartItems.length === 0 ? (
          /* Empty Bag State */
          <div className="py-20 text-center space-y-6 max-w-md mx-auto border border-[#E8D5A8] bg-white p-10">
            <ShoppingBag className="w-12 h-12 text-[#C9972B] mx-auto stroke-[1.2]" />
            <div className="space-y-2">
              <h2 className="font-serif text-2xl text-[#121212]">
                YOUR SHOPPING BAG IS WAITING
              </h2>
              <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                Discover velvet pigments, ceremonial formulations, and sensorial cleansing rituals formulated for Indian skin.
              </p>
            </div>
            <button
              onClick={onContinueShopping}
              className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer"
            >
              EXPLORE THE EDIT
            </button>
          </div>
        ) : (
          /* 2-Column Luxury Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            
            {/* Left Column: Products List & Cart Enhancements (8 Cols) */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-6">
              
              {/* 1. Free Shipping Progress Bar */}
              <div className="p-4 sm:p-5 bg-white border border-[#E8D5A8]">
                <div className="flex items-center justify-between text-xs mb-2.5">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#C9972B]" />
                    <span className="font-medium text-[#121212]">
                      {isShippingFree ? (
                        <span className="text-[#C9972B] font-semibold">
                          COMPLIMENTARY LUXURY DELIVERY UNLOCKED
                        </span>
                      ) : (
                        <span>
                          YOU'RE <strong className="text-[#C9972B]">₹{remainingForFreeShipping}</strong> AWAY FROM FREE SHIPPING
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6B6B6B] font-mono">
                    ₹{subtotal} / ₹{FREE_SHIPPING_THRESHOLD}
                  </span>
                </div>
                
                {/* Progress bar line */}
                <div className="w-full h-1.5 bg-[#FAF9F6] overflow-hidden rounded-full">
                  <div
                    className="h-full bg-[#C9972B] transition-all duration-500 rounded-full"
                    style={{ width: `${shippingProgress}%` }}
                  />
                </div>
                {!isShippingFree && (
                  <p className="text-[11px] text-[#6B6B6B] mt-2 font-light">
                    Add ₹{remainingForFreeShipping} more to unlock complimentary air courier across India.
                  </p>
                )}
              </div>

              {/* 2. Items List */}
              <div className="space-y-4">
                {cartItems.map((item, index) => {
                  const itemPrice = item.selectedSize === '30g' ? 549 : item.product.price;
                  const itemTotal = itemPrice * item.quantity;
                  const isWishlisted = wishlist.includes(item.product.id);

                  return (
                    <motion.div
                      layout
                      key={`${item.product.id}-${item.selectedShade?.id}-${item.selectedSize}-${index}`}
                      className="p-4 sm:p-6 bg-white border border-[#E8D5A8] flex flex-col sm:flex-row gap-5 items-start relative group"
                    >
                      {/* Product Thumbnail */}
                      <div
                        onClick={() => onOpenProduct(item.product)}
                        className="w-24 h-28 sm:w-28 sm:h-32 bg-[#FAF9F6] border border-[#E8D5A8] overflow-hidden flex-shrink-0 cursor-pointer relative"
                      >
                        <img
                          src={item.product.images.primary}
                          alt={item.product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {item.product.tag && (
                          <span className="absolute top-1 left-1 bg-[#0B0B0B] text-[#FAF9F6] text-[8px] font-semibold tracking-widest px-1.5 py-0.5">
                            {item.product.tag}
                          </span>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] tracking-[0.2em] uppercase text-[#6B6B6B] font-semibold">
                              {item.product.subCategory}
                            </span>
                            <h3
                              onClick={() => onOpenProduct(item.product)}
                              className="font-serif text-lg text-[#121212] hover:text-[#C9972B] transition-colors cursor-pointer"
                            >
                              {item.product.name}
                            </h3>
                          </div>

                          <span className="font-serif text-base sm:text-lg text-[#121212] font-medium flex-shrink-0">
                            ₹{itemTotal}
                          </span>
                        </div>

                        {/* Shade / Size Indicator */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6B6B]">
                          {item.selectedShade && (
                            <div className="flex items-center gap-1.5 bg-[#FAF9F6] px-2.5 py-1 border border-[#E8D5A8]">
                              <span
                                className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                                style={{ backgroundColor: item.selectedShade.hex }}
                              />
                              <span className="font-medium text-[#121212]">
                                Shade: {item.selectedShade.name}
                              </span>
                              <span className="text-[10px] text-[#6B6B6B]">
                                ({item.selectedShade.undertone})
                              </span>
                            </div>
                          )}

                          {item.selectedSize && (
                            <div className="bg-[#FAF9F6] px-2.5 py-1 border border-[#E8D5A8] font-medium text-[#121212]">
                              Size: {item.selectedSize}
                            </div>
                          )}

                          <span className="text-[11px] text-[#6B6B6B] font-mono">
                            ₹{itemPrice} each
                          </span>
                        </div>

                        {/* Quantity Stepper & Secondary Actions */}
                        <div className="pt-3 border-t border-[#FAF9F6] flex flex-wrap items-center justify-between gap-4">
                          
                          {/* Stepper */}
                          <div className="flex items-center border border-[#E8D5A8] bg-[#FAF9F6]">
                            <button
                              onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                              className="px-3 py-1.5 text-xs text-[#121212] hover:bg-[#E8D5A8] transition-colors cursor-pointer"
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="px-3.5 text-xs font-semibold text-[#121212] font-mono">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                              className="px-3 py-1.5 text-xs text-[#121212] hover:bg-[#E8D5A8] transition-colors cursor-pointer"
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>

                          {/* Move to Wishlist & Remove */}
                          <div className="flex items-center gap-4 text-xs font-medium tracking-wider uppercase">
                            <button
                              onClick={() => onMoveToWishlist(index, item.product)}
                              className="text-[#6B6B6B] hover:text-[#C9972B] flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-[#C9972B] text-[#C9972B]' : ''}`} />
                              <span>MOVE TO WISHLIST</span>
                            </button>

                            <button
                              onClick={() => onRemoveItem(index)}
                              className="text-[#6B6B6B] hover:text-[#F05A7E] flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>REMOVE</span>
                            </button>
                          </div>

                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* 3. Luxury Gifting Foundation */}
              <div className="p-5 bg-white border border-[#E8D5A8] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[#121212]">
                    <input
                      type="checkbox"
                      checked={isGift}
                      onChange={(e) => setIsGift(e.target.checked)}
                      className="w-4 h-4 accent-[#C9972B] rounded-none cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-[#C9972B]" />
                      <span>THIS ORDER IS A LUXURY GIFT</span>
                    </div>
                  </label>
                  <span className="text-[10px] uppercase font-semibold text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5">
                    COMPLIMENTARY
                  </span>
                </div>

                {isGift && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="pt-3 border-t border-[#FAF9F6] space-y-2"
                  >
                    <label className="text-[11px] text-[#6B6B6B] block">
                      Include a handwritten calligraphy gift message (max 180 characters):
                    </label>
                    <textarea
                      rows={2}
                      maxLength={180}
                      value={giftMessage}
                      onChange={(e) => setGiftMessage(e.target.value)}
                      placeholder="e.g. For Dearest Diya, celebrating your graceful radiance..."
                      className="w-full p-3 text-xs bg-[#FAF9F6] border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                    />
                    <p className="text-[10px] text-[#6B6B6B]">
                      Includes signature Glamirk matte black box with champagne wax seal and omitted price tags.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* 4. AI Cart Assistant Concierge Strip */}
              <div className="p-5 bg-[#FAF9F6] border border-[#E8D5A8] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-[#C9972B] flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-serif text-sm text-[#121212]">
                      ✨ ASK GLAMIRK BEAUTY ASSISTANT
                    </h4>
                    <p className="text-xs text-[#6B6B6B] mt-0.5">
                      Need shade harmony, undertone guidance, or look pairing advice for your current bag?
                    </p>
                  </div>
                </div>

                <button
                  onClick={onOpenAssistant}
                  className="px-4 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-[11px] font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] transition-colors flex-shrink-0 cursor-pointer"
                >
                  CONSULT ASSISTANT
                </button>
              </div>

              {/* 5. Smart Cart Recommendations: COMPLETE YOUR GLAM */}
              {smartRecommendations.length > 0 && (
                <div className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                        COMPLEMENTARY CREATIONS
                      </span>
                      <h3 className="font-serif text-xl text-[#121212]">
                        COMPLETE YOUR GLAM
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {smartRecommendations.map((rec) => {
                      const firstShade = rec.shades?.[0];
                      return (
                        <div
                          key={rec.id}
                          className="p-4 bg-white border border-[#E8D5A8] flex flex-col justify-between space-y-3 group"
                        >
                          <div
                            onClick={() => onOpenProduct(rec)}
                            className="aspect-square bg-[#FAF9F6] overflow-hidden cursor-pointer relative"
                          >
                            <img
                              src={rec.images.primary}
                              alt={rec.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] tracking-widest uppercase text-[#6B6B6B]">
                              {rec.subCategory}
                            </span>
                            <h4
                              onClick={() => onOpenProduct(rec)}
                              className="font-serif text-sm text-[#121212] truncate hover:text-[#C9972B] cursor-pointer"
                            >
                              {rec.name}
                            </h4>
                            <span className="text-xs font-semibold text-[#121212] font-serif block">
                              ₹{rec.price}
                            </span>
                          </div>

                          <button
                            onClick={() => onQuickAdd(rec, firstShade)}
                            className="w-full py-2 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-[10.5px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <span>+ ADD TO BAG</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Sticky Order Summary & Checkout (4-5 Cols) */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-6 lg:sticky lg:top-24">
              
              {/* Order Summary Card */}
              <div className="p-6 bg-white border border-[#E8D5A8] space-y-5 shadow-xs">
                <h2 className="font-serif text-xl text-[#121212] border-b border-[#E8D5A8] pb-3">
                  ORDER SUMMARY
                </h2>

                {/* Promo Code Input & Available Offers */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
                    HAVE A PROMO CODE?
                  </label>
                  
                  {appliedCoupon ? (
                    <div className="p-3 bg-[#FAF9F6] border border-[#C9972B]/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-[#C9972B]" />
                        <div>
                          <span className="font-mono text-xs font-semibold text-[#121212]">
                            {appliedCoupon.code}
                          </span>
                          <span className="text-[11px] text-[#C9972B] block font-medium">
                            -₹{discountAmount} applied ({appliedCoupon.title})
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={onRemoveCoupon}
                        className="text-[11px] font-semibold text-[#F05A7E] uppercase hover:underline cursor-pointer"
                      >
                        REMOVE
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyPromoCode} className="flex gap-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => {
                          setPromoInput(e.target.value);
                          setPromoError(null);
                        }}
                        placeholder="ENTER PROMO CODE"
                        className="flex-1 px-3 py-2.5 text-xs bg-[#FAF9F6] border border-[#E8D5A8] uppercase placeholder:normal-case focus:border-[#0B0B0B] focus:outline-hidden font-mono"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer"
                      >
                        APPLY
                      </button>
                    </form>
                  )}

                  {promoError && (
                    <p className="text-[11px] text-[#F05A7E]">{promoError}</p>
                  )}

                  <button
                    onClick={() => setIsOffersDrawerOpen(true)}
                    className="text-[11px] font-semibold tracking-wider text-[#C9972B] hover:underline uppercase flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>VIEW AVAILABLE OFFERS</span>
                  </button>
                </div>

                {/* Price Breakdown */}
                <div className="space-y-2.5 pt-3 border-t border-[#E8D5A8] text-xs text-[#6B6B6B]">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="text-[#121212] font-medium font-mono">₹{subtotal}</span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-[#C9972B] font-medium">
                      <span>Privilege Discount</span>
                      <span className="font-mono">-₹{discountAmount}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>Estimated Shipping</span>
                    <span className="text-[#121212] font-medium">
                      {shippingFee === 0 ? (
                        <span className="text-[#C9972B] uppercase font-semibold">FREE</span>
                      ) : (
                        `₹${shippingFee}`
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-[11px] text-[#6B6B6B]">
                    <span>Taxes & GST</span>
                    <span>Included in prices</span>
                  </div>

                  {/* Grand Total */}
                  <div className="pt-3 border-t border-[#E8D5A8] flex justify-between items-baseline">
                    <span className="font-serif text-base text-[#121212] font-medium">
                      Total Payable
                    </span>
                    <span className="font-serif text-2xl text-[#121212] font-semibold">
                      ₹{grandTotal}
                    </span>
                  </div>
                </div>

                {/* Checkout Primary CTA */}
                <button
                  id="shopping-bag-proceed-checkout-btn"
                  onClick={onProceedToCheckout}
                  className="w-full py-4 bg-[#0B0B0B] text-[#FAF9F6] text-xs sm:text-[13px] font-semibold tracking-[0.22em] uppercase hover:bg-[#0B0B0B] active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <span>PROCEED TO CHECKOUT</span>
                  <ArrowRight className="w-4 h-4 text-[#C9972B]" />
                </button>

                {/* Trust & Guarantee Strip */}
                <div className="pt-3 space-y-2 border-t border-[#FAF9F6] text-[11px] text-[#6B6B6B]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#C9972B] flex-shrink-0" />
                    <span>100% Authentic formulations crafted for Indian skin</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-[#C9972B] flex-shrink-0" />
                    <span>Dispatched via Blue Dart & Delhivery Express</span>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* Bottom Trust Badge Strip */}
        {cartItems.length > 0 && (
          <div className="mt-10 pt-8 border-t border-[#E8D5A8] grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { icon: ShieldCheck, title: '100% Authentic', subtitle: 'Sourced Directly' },
              { icon: Heart, title: 'Cruelty-Free', subtitle: 'We never test on animals' },
              { icon: Sparkles, title: 'Clean & Safe Ingredients', subtitle: 'Gentle on your skin' },
              { icon: Check, title: 'Dermatologist Approved', subtitle: 'Trusted & tested' },
            ].map((badge) => (
              <div key={badge.title} className="flex items-center gap-2.5 text-center sm:text-left flex-col sm:flex-row">
                <badge.icon className="w-5 h-5 text-[#C9972B] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[#121212]">{badge.title}</p>
                  <p className="text-[10px] text-[#6B6B6B]">{badge.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Sticky Mobile Checkout CTA Bar */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E8D5A8] p-4 shadow-2xl z-30 flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
              TOTAL PAYABLE
            </span>
            <span className="font-serif text-xl font-semibold text-[#121212]">
              ₹{grandTotal}
            </span>
          </div>

          <button
            onClick={onProceedToCheckout}
            className="flex-1 py-3.5 px-6 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>CHECKOUT</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#C9972B]" />
          </button>
        </div>
      )}

      {/* Offers Slide-over Drawer */}
      <OffersDrawer
        isOpen={isOffersDrawerOpen}
        onClose={() => setIsOffersDrawerOpen(false)}
        appliedCoupon={appliedCoupon}
        onApplyCoupon={onApplyCoupon}
        onRemoveCoupon={onRemoveCoupon}
        cartTotal={subtotal}
      />

    </div>
  );
};
