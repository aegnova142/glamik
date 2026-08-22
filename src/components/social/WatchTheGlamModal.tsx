import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, Volume2, VolumeX, Sparkles, ShoppingBag, ArrowRight } from 'lucide-react';
import { Product, Shade } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';

interface WatchTheGlamModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  videoTitle?: string;
  onAddToCart?: (product: Product, shade?: Shade) => void;
}

export const WatchTheGlamModal: React.FC<WatchTheGlamModalProps> = ({
  isOpen,
  onClose,
  product = GLAMIRK_PRODUCTS[0],
  videoTitle,
  onAddToCart,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  if (!isOpen || !product) return null;

  const title = videoTitle || `${product.name} — In Action`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative max-w-2xl w-full bg-[#0B0B0B] text-[#FAF9F6] border border-[#171717] shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-[#171717] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C9972B]" />
              <span className="text-[10.5px] font-semibold tracking-[0.2em] uppercase text-[#C9972B]">
                WATCH THE GLAM
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-[#C9972B] hover:text-[#FAF9F6] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Video Player Visual Canvas */}
          <div className="relative aspect-[16/9] bg-[#0B0B0B] overflow-hidden flex items-center justify-center">
            <img
              src={product.images.detail || product.images.primary}
              alt={title}
              className="w-full h-full object-cover opacity-90"
            />

            {/* Video Overlay Info */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex flex-col justify-between p-6">
              <div>
                <h4 className="font-serif text-xl text-[#FAF9F6]">{title}</h4>
                <p className="text-xs text-[#C9972B] mt-0.5">High-Definition Application Tutorial</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-xs rounded-full transition-colors text-white"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-xs rounded-full transition-colors text-white"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>

                <span className="text-[11px] text-[#C9972B] font-mono">0:45 / 1:20</span>
              </div>
            </div>
          </div>

          {/* Footer with Product Details & Add to Bag */}
          <div className="p-5 bg-[#0B0B0B] border-t border-[#171717] flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h5 className="font-serif text-sm text-[#FAF9F6]">{product.name}</h5>
              <span className="text-xs font-serif text-[#C9972B]">₹{product.price}</span>
            </div>

            {onAddToCart && (
              <button
                onClick={() => {
                  onAddToCart(product, product.shades?.[0]);
                  onClose();
                }}
                className="px-6 py-2.5 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-widest uppercase hover:bg-[#E8D5A8] transition-colors flex items-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>ADD TO BAG</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
