import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Heart, Share2, Check, Sparkles, ExternalLink, BadgeCheck } from 'lucide-react';
import { SocialPost, Product, Shade } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { trackEvent } from '../../utils/analytics';

interface SocialPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: SocialPost | null;
  onOpenProduct: (product: Product) => void;
  onOpenLook: (lookId: string) => void;
  onAddToCart: (product: Product, shade?: Shade) => void;
}

export const SocialPostModal: React.FC<SocialPostModalProps> = ({
  isOpen,
  onClose,
  post,
  onOpenProduct,
  onOpenLook,
  onAddToCart,
}) => {
  const [isCopied, setIsCopied] = React.useState(false);

  if (!isOpen || !post) return null;

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.3 }}
          className="relative max-w-4xl w-full bg-[#FAF9F6] shadow-2xl border border-[#E8D5A8] z-50 overflow-hidden grid grid-cols-1 md:grid-cols-12 max-h-[90vh]"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 bg-black/40 hover:bg-black/70 text-white rounded-full transition-colors md:hidden"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Left Media Column */}
          <div className="md:col-span-7 bg-[#0B0B0B] relative flex items-center justify-center min-h-[300px] md:min-h-[520px] overflow-hidden">
            <img
              src={post.mediaUrl}
              alt={post.caption}
              className="w-full h-full object-cover"
            />
            {post.lookTitle && (
              <div className="absolute bottom-4 left-4 bg-[#0B0B0B]/85 backdrop-blur-xs px-3 py-1 text-[10px] font-semibold tracking-widest uppercase text-[#FAF9F6] border border-[#171717]">
                {post.lookTitle}
              </div>
            )}
          </div>

          {/* Right Editorial Info Column */}
          <div className="md:col-span-5 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto bg-[#FAF9F6]">
            <div className="space-y-6">
              {/* Creator Header */}
              <div className="flex items-center justify-between border-b border-[#E8D5A8] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#E8D5A8] overflow-hidden border border-[#E8D5A8] flex-shrink-0">
                    <img
                      src={post.creatorAvatar || post.mediaUrl}
                      alt={post.creatorName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-serif text-sm font-semibold text-[#121212]">
                        {post.creatorName}
                      </span>
                      {post.isVerified && (
                        <BadgeCheck className="w-4 h-4 text-[#C9972B] fill-[#C9972B]/20" />
                      )}
                    </div>
                    <span className="text-[11px] text-[#6B6B6B] font-mono">
                      {post.creatorHandle}
                    </span>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="hidden md:block p-1 text-[#6B6B6B] hover:text-[#121212] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <p className="text-xs sm:text-sm text-[#171717] leading-relaxed font-light">
                  {post.caption}
                </p>
                <div className="flex items-center justify-between text-[11px] text-[#6B6B6B] pt-2">
                  <span>{post.date}</span>
                  <span className="uppercase tracking-wider">{post.platform || 'Instagram'}</span>
                </div>
              </div>

              {/* Tagged Shoppable Products */}
              <div className="space-y-3 pt-4 border-t border-[#E8D5A8]">
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#C9972B] block">
                  FEATURED IN THIS LOOK
                </span>

                <div className="space-y-3">
                  {post.taggedProducts.map((tp) => {
                    const fullProduct = GLAMIRK_PRODUCTS.find((p) => p.id === tp.productId);
                    const shadeMatch = fullProduct?.shades?.find((s) => s.name === tp.shadeName) || fullProduct?.shades?.[0];

                    return (
                      <div
                        key={tp.productId}
                        className="p-3 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between gap-3"
                      >
                        <div
                          onClick={() => fullProduct && onOpenProduct(fullProduct)}
                          className="flex items-center gap-3 cursor-pointer group flex-grow"
                        >
                          <div className="w-12 h-14 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                            <img
                              src={tp.image}
                              alt={tp.productName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <h5 className="font-serif text-xs text-[#121212] group-hover:text-[#C9972B] transition-colors font-medium">
                              {tp.productName}
                            </h5>
                            {tp.shadeName && (
                              <span className="text-[10px] text-[#6B6B6B] block">
                                Shade: {tp.shadeName}
                              </span>
                            )}
                            <span className="text-xs font-serif font-semibold text-[#121212] block">
                              ₹{tp.price}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => fullProduct && onAddToCart(fullProduct, shadeMatch)}
                          className="px-3 py-2 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold uppercase tracking-wider hover:bg-[#0B0B0B] transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0"
                        >
                          <ShoppingBag className="w-3 h-3 text-[#C9972B]" />
                          <span>BAG</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-6 border-t border-[#E8D5A8] mt-6 flex items-center justify-between gap-3">
              {post.lookId && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenLook(post.lookId!);
                  }}
                  className="text-xs font-semibold tracking-widest uppercase text-[#121212] hover:text-[#C9972B] transition-colors flex items-center gap-1.5"
                >
                  <span>EXPLORE COMPLETE LOOK</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={handleShare}
                className="text-xs text-[#6B6B6B] hover:text-[#121212] flex items-center gap-1.5 ml-auto"
              >
                {isCopied ? (
                  <span className="text-[#C9972B] font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Copied
                  </span>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
