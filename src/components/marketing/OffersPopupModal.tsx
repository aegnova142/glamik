import React, { useState } from 'react';
import { CMSOffer } from '../../types';
import { X, Tag, Check, Copy, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OffersPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  offers: CMSOffer[];
}

export const OffersPopupModal: React.FC<OffersPopupModalProps> = ({ isOpen, onClose, offers }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0B0B0B]/70 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="relative w-full max-w-lg max-h-[90vh] bg-[#FAF9F6] border border-[#E8D5A8] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-[#E8D5A8] shrink-0 bg-white">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F05A7E]" />
                <h2 className="font-serif text-lg text-[#121212]">Live Privileges For You</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close offers popup"
                className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 overflow-y-auto min-h-0">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="p-4 bg-white border border-[#E8D5A8] hover:border-[#C9972B] transition-colors rounded-lg"
                >
                  <div className="flex items-center justify-between gap-2">
                    {offer.tag && (
                      <span className="text-[9.5px] tracking-widest uppercase font-semibold text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5 rounded">
                        {offer.tag}
                      </span>
                    )}
                    {offer.couponCode && (
                      <button
                        onClick={() => handleCopyCode(offer.couponCode!)}
                        className="flex items-center gap-1 font-mono text-xs font-semibold tracking-wider text-[#121212] bg-[#FAF9F6] px-2 py-1 border border-[#E8D5A8] rounded hover:border-[#C9972B] transition-colors cursor-pointer"
                      >
                        {copiedCode === offer.couponCode ? (
                          <Check className="w-3 h-3 text-[#C9972B]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {offer.couponCode}
                      </button>
                    )}
                  </div>
                  <h3 className="font-serif text-base text-[#121212] mt-2">
                    {offer.publicTitle || offer.name}
                  </h3>
                  <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">{offer.description}</p>
                  {offer.minOrderValue > 0 && (
                    <p className="text-[10.5px] text-[#6B6B6B] mt-1.5 font-mono">
                      Minimum bag value: ₹{offer.minOrderValue}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[#E8D5A8] bg-white shrink-0">
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-widest uppercase hover:bg-[#171717] transition-colors cursor-pointer rounded-lg flex items-center justify-center gap-2"
              >
                <Tag className="w-3.5 h-3.5 text-[#C9972B]" />
                Continue Shopping
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
