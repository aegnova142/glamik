import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Check, HelpCircle, Sun, Gem, Activity } from 'lucide-react';
import { UndertoneType } from '../types';

interface UndertoneGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUndertone: (undertone: UndertoneType) => void;
}

export const UndertoneGuideModal: React.FC<UndertoneGuideModalProps> = ({
  isOpen,
  onClose,
  onSelectUndertone,
}) => {
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
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl max-w-2xl w-full p-6 sm:p-10 z-10 max-h-[90vh] overflow-y-auto"
          >
            {/* Close Button */}
            <button
              id="undertone-guide-close-btn"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FAF9F6] rounded-full transition-colors cursor-pointer"
              aria-label="Close undertone guide"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="text-center space-y-2 mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                <Sparkles className="w-3 h-3" />
                <span>CONSULTATION GUIDE</span>
              </div>
              <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">
                FIND YOUR UNDERTONE
              </h2>
              <p className="text-xs sm:text-sm text-[#6B6B6B] font-light max-w-md mx-auto leading-relaxed">
                Undertone is the subtle, natural hue beneath your surface skin. Identifying it helps ensure lipsticks and complexion cosmetics complement you seamlessly.
              </p>
            </div>

            {/* 3 Quick Guidance Indicators */}
            <div className="space-y-4 mb-8">
              
              {/* Indicator 1: Veins */}
              <div className="p-4 sm:p-5 bg-[#FAF9F6] border border-[#E8D5A8] flex items-start gap-4">
                <div className="p-2.5 bg-[#FAF9F6] border border-[#E8D5A8] text-[#C9972B] shrink-0 mt-0.5">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold tracking-wider uppercase text-[#121212]">
                    1. The Wrist Vein Indicator
                  </h3>
                  <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                    Under natural daylight, look at the veins inside your wrist. Greenish or olive veins often indicate a <strong className="text-[#121212]">Warm</strong> undertone. Blue or purplish veins often indicate a <strong className="text-[#121212]">Cool</strong> undertone. A mix of blue-green often suggests a <strong className="text-[#121212]">Neutral</strong> undertone.
                  </p>
                </div>
              </div>

              {/* Indicator 2: Jewellery */}
              <div className="p-4 sm:p-5 bg-[#FAF9F6] border border-[#E8D5A8] flex items-start gap-4">
                <div className="p-2.5 bg-[#FAF9F6] border border-[#E8D5A8] text-[#C9972B] shrink-0 mt-0.5">
                  <Gem className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold tracking-wider uppercase text-[#121212]">
                    2. The Jewellery Test
                  </h3>
                  <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                    Yellow gold jewellery typically illuminates and flatters <strong className="text-[#121212]">Warm</strong> undertones. Silver and platinum jewellery highlights <strong className="text-[#121212]">Cool</strong> undertones. If you look equally radiant in both, you are likely <strong className="text-[#121212]">Neutral</strong>.
                  </p>
                </div>
              </div>

              {/* Indicator 3: Sunlight */}
              <div className="p-4 sm:p-5 bg-[#FAF9F6] border border-[#E8D5A8] flex items-start gap-4">
                <div className="p-2.5 bg-[#FAF9F6] border border-[#E8D5A8] text-[#C9972B] shrink-0 mt-0.5">
                  <Sun className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold tracking-wider uppercase text-[#121212]">
                    3. Sun Exposure
                  </h3>
                  <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                    If your skin tans easily with golden warmth, you lean <strong className="text-[#121212]">Warm</strong>. If your skin burns or flushes pink before tanning, you lean <strong className="text-[#121212]">Cool</strong>. If it tans gradually with mild initial flush, you lean <strong className="text-[#121212]">Neutral</strong>.
                  </p>
                </div>
              </div>

            </div>

            {/* Direct Selection Options inside Modal */}
            <div className="space-y-3 pt-4 border-t border-[#E8D5A8]">
              <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#6B6B6B] block text-center">
                Select Your Undertone
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    onSelectUndertone('WARM' as any);
                    onClose();
                  }}
                  className="p-3.5 bg-[#FAF9F6] border border-[#E8D5A8] hover:border-[#0B0B0B] hover:bg-[#FAF9F6] text-left transition-all group cursor-pointer"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-[#121212] block">
                    Warm
                  </span>
                  <span className="text-[11px] text-[#6B6B6B] block mt-0.5 font-light">
                    Golden, peachy, honey or olive nuances.
                  </span>
                </button>

                <button
                  onClick={() => {
                    onSelectUndertone('COOL' as any);
                    onClose();
                  }}
                  className="p-3.5 bg-[#FAF9F6] border border-[#E8D5A8] hover:border-[#0B0B0B] hover:bg-[#FAF9F6] text-left transition-all group cursor-pointer"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-[#121212] block">
                    Cool
                  </span>
                  <span className="text-[11px] text-[#6B6B6B] block mt-0.5 font-light">
                    Rose, berry, pink or bluish nuances.
                  </span>
                </button>

                <button
                  onClick={() => {
                    onSelectUndertone('NEUTRAL' as any);
                    onClose();
                  }}
                  className="p-3.5 bg-[#FAF9F6] border border-[#E8D5A8] hover:border-[#0B0B0B] hover:bg-[#FAF9F6] text-left transition-all group cursor-pointer"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-[#121212] block">
                    Neutral
                  </span>
                  <span className="text-[11px] text-[#6B6B6B] block mt-0.5 font-light">
                    Balanced mix of warm and cool tones.
                  </span>
                </button>
              </div>

              <div className="pt-2 text-center">
                <button
                  onClick={() => {
                    onSelectUndertone('NEUTRAL' as any);
                    onClose();
                  }}
                  className="text-xs text-[#6B6B6B] hover:text-[#121212] underline underline-offset-4 font-light cursor-pointer"
                >
                  I'm still not sure (Default to universal neutral formulation)
                </button>
              </div>
            </div>

            {/* Note */}
            <p className="text-[10.5px] text-[#6B6B6B] text-center mt-6 italic">
              *Glamirk beauty guidelines are curated for personalized aesthetic styling and are not medical diagnoses.
            </p>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
