import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Product, Shade } from '../../types';
import { Sparkles, ShoppingBag, Check, Layers, ArrowRight } from 'lucide-react';

interface ShadeComparisonProps {
  product: Product;
  selectedShadeIds: string[];
  onToggleShadeSelection: (shadeId: string) => void;
  onTryShade: (shade: Shade) => void;
  onAddShadeToBag: (shade: Shade) => void;
}

export const ShadeComparison: React.FC<ShadeComparisonProps> = ({
  product,
  selectedShadeIds,
  onToggleShadeSelection,
  onTryShade,
  onAddShadeToBag,
}) => {
  const allShades = product.shades || [];
  const comparedShades = allShades.filter((s) => selectedShadeIds.includes(s.id));

  return (
    <div className="bg-[#FAF9F6] border border-[#E8D5A8] p-6 sm:p-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E8D5A8] pb-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            <Layers className="w-3.5 h-3.5" />
            <span>SIDE-BY-SIDE EVALUATION</span>
          </div>
          <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
            COMPARE YOUR MATCHES
          </h3>
          <p className="text-xs sm:text-sm text-[#6B6B6B] font-light max-w-xl">
            Select up to 3 shades to compare undertone nuances, suggested styling occasions, and depth characteristics.
          </p>
        </div>

        {/* Shade Chip Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {allShades.map((shade) => {
            const isSelected = selectedShadeIds.includes(shade.id);
            return (
              <button
                key={shade.id}
                onClick={() => onToggleShadeSelection(shade.id)}
                className={`px-3 py-1.5 text-xs font-medium tracking-wider uppercase border transition-all flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'border-[#0B0B0B] bg-[#0B0B0B] text-[#FAF9F6]'
                    : 'border-[#E8D5A8] bg-[#FAF9F6] text-[#6B6B6B] hover:border-[#0B0B0B]'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: shade.hex }}
                />
                <span>{shade.name}</span>
                {isSelected && <Check className="w-3 h-3 text-[#C9972B]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparison Grid Matrix */}
      {comparedShades.length === 0 ? (
        <div className="text-center py-12 bg-[#FAF9F6] border border-[#E8D5A8]">
          <p className="text-xs text-[#6B6B6B] uppercase tracking-wider">
            Select at least one shade above to view side-by-side comparison.
          </p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-${comparedShades.length} gap-6`}>
          {comparedShades.map((shade) => (
            <motion.div
              key={shade.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#FAF9F6] border border-[#E8D5A8] p-6 space-y-6 flex flex-col justify-between"
            >
              {/* Swatch & Title */}
              <div className="space-y-4 text-center">
                <div
                  className="w-16 h-16 rounded-full mx-auto border-2 border-white shadow-md ring-1 ring-[#C9972B]"
                  style={{ backgroundColor: shade.hex }}
                />
                <div>
                  <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-[#C9972B] block">
                    {shade.undertone} UNDERTONE
                  </span>
                  <h4 className="font-serif text-xl text-[#121212] mt-0.5">
                    {shade.name}
                  </h4>
                </div>
              </div>

              {/* Attributes Comparison */}
              <div className="space-y-3 text-xs text-[#6B6B6B] pt-4 border-t border-[#E8D5A8]">
                <div className="flex justify-between py-1.5 border-b border-[#E8D5A8]">
                  <span className="text-[#6B6B6B] uppercase tracking-wider text-[10px] font-semibold">
                    Finish:
                  </span>
                  <span className="text-[#121212] font-medium">
                    {product.finish || 'Velvet Matte'}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#E8D5A8]">
                  <span className="text-[#6B6B6B] uppercase tracking-wider text-[10px] font-semibold">
                    Coverage:
                  </span>
                  <span className="text-[#121212] font-medium">
                    One-Stroke Opaque
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#E8D5A8]">
                  <span className="text-[#6B6B6B] uppercase tracking-wider text-[10px] font-semibold">
                    Best For:
                  </span>
                  <span className="text-[#121212] font-medium">
                    {shade.undertone === 'Warm'
                      ? 'Golden & Warm Tones'
                      : shade.undertone === 'Cool'
                      ? 'Rose & Berry Lovers'
                      : 'All Complexions'}
                  </span>
                </div>

                <div className="py-2">
                  <span className="text-[#6B6B6B] uppercase tracking-wider text-[10px] font-semibold block mb-1">
                    Editorial Notes:
                  </span>
                  <p className="text-[11.5px] italic text-[#6B6B6B] font-light leading-relaxed">
                    "{shade.description}"
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-4 border-t border-[#E8D5A8]">
                <button
                  onClick={() => onTryShade(shade)}
                  className="w-full py-2.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>TRY ON</span>
                </button>

                <button
                  onClick={() => onAddShadeToBag(shade)}
                  className="w-full py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>ADD TO BAG • ₹{product.price}</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
