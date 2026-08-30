import React from 'react';
import { Coupon } from '../../types';
import { X, Tag, Check, ArrowRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OffersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  offers: Coupon[];
  appliedCoupon: Coupon | null;
  onApplyCoupon: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveCoupon: () => void;
  cartTotal: number;
}

export const OffersDrawer: React.FC<OffersDrawerProps> = ({
  isOpen,
  onClose,
  offers,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  cartTotal,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#0B0B0B]/60 backdrop-blur-xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="w-screen max-w-md bg-[#FAF9F6] shadow-2xl flex flex-col border-l border-[#E8D5A8]"
            >
              {/* Header */}
              <div className="p-6 border-b border-[#E8D5A8] flex items-center justify-between bg-[#FAF9F6]">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[#C9972B]" />
                  <h2 className="font-serif text-xl text-[#121212] tracking-wide">
                    OFFERS FOR YOU
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-[#6B6B6B] hover:text-[#121212] transition-colors cursor-pointer"
                  aria-label="Close offers drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Offer List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                  Apply available privileges and editorial promotional codes to your shopping bag.
                </p>

                <div className="space-y-3.5">
                  {offers.length === 0 && (
                    <p className="text-xs text-[#6B6B6B] text-center py-6">No active offers right now — check back soon.</p>
                  )}
                  {offers.map((coupon) => {
                    const isApplied = appliedCoupon?.code === coupon.code;
                    const isEligible = !coupon.minOrderValue || cartTotal >= coupon.minOrderValue;

                    return (
                      <div
                        key={coupon.code}
                        className={`p-5 border transition-all ${
                          isApplied
                            ? 'bg-[#FAF9F6] border-[#C9972B] ring-1 ring-[#C9972B]/50'
                            : 'bg-white border-[#E8D5A8] hover:border-[#C9972B]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold tracking-wider text-[#121212] bg-[#FAF9F6] px-2.5 py-1 border border-[#E8D5A8]">
                                {coupon.code}
                              </span>
                              {coupon.tag && (
                                <span className="text-[9.5px] tracking-widest uppercase font-semibold text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5">
                                  {coupon.tag}
                                </span>
                              )}
                            </div>
                            <h3 className="font-serif text-base text-[#121212] mt-2.5">
                              {coupon.title}
                            </h3>
                            <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">
                              {coupon.description}
                            </p>
                            {coupon.minOrderValue && coupon.minOrderValue > 0 && (
                              <p className="text-[10.5px] text-[#6B6B6B] mt-1.5 font-mono">
                                Minimum bag value: ₹{coupon.minOrderValue}
                              </p>
                            )}
                          </div>

                          <div className="flex-shrink-0">
                            {isApplied ? (
                              <button
                                onClick={onRemoveCoupon}
                                className="text-[11px] font-semibold tracking-wider text-[#F05A7E] uppercase hover:underline cursor-pointer"
                              >
                                REMOVE
                              </button>
                            ) : (
                              <button
                                disabled={!isEligible}
                                onClick={async () => {
                                  const res = await onApplyCoupon(coupon.code);
                                  if (res.success) onClose();
                                }}
                                className={`px-4 py-2 text-[11px] font-semibold tracking-widest uppercase transition-colors cursor-pointer ${
                                  isEligible
                                    ? 'bg-[#0B0B0B] text-[#FAF9F6] hover:bg-[#0B0B0B]'
                                    : 'bg-[#E8D5A8] text-[#6B6B6B] cursor-not-allowed'
                                }`}
                              >
                                {isEligible ? 'APPLY' : 'LOCKED'}
                              </button>
                            )}
                          </div>
                        </div>

                        {!isEligible && coupon.minOrderValue && (
                          <div className="mt-3 pt-2.5 border-t border-[#FAF9F6] text-[11px] text-[#F05A7E] flex items-center gap-1.5">
                            <span>Add ₹{coupon.minOrderValue - cartTotal} more to unlock this code.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Subtle Luxury Note */}
                <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] mt-6 flex items-start gap-2.5 text-xs text-[#6B6B6B]">
                  <Sparkles className="w-4 h-4 text-[#C9972B] flex-shrink-0 mt-0.5" />
                  <p>
                    Glamirk Privé members receive exclusive auto-credited rewards at checkout based on their tier.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-[#E8D5A8] bg-[#FAF9F6]">
                <button
                  onClick={onClose}
                  className="w-full py-3 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
                >
                  DONE
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
