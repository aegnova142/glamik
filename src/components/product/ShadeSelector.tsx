import React from 'react';
import { Shade } from '../../types';
import { Sparkles } from 'lucide-react';

interface ShadeSelectorProps {
  shades: Shade[];
  selectedShade: Shade;
  onSelectShade: (shade: Shade) => void;
  onOpenShadeFinder: () => void;
}

export const ShadeSelector: React.FC<ShadeSelectorProps> = ({
  shades,
  selectedShade,
  onSelectShade,
  onOpenShadeFinder,
}) => {
  // Hide shades the admin has paused — unless that would hide every shade
  // (e.g. legacy data with no isActive field set), in which case show them
  // all rather than leave the selector empty.
  const visibleShades = shades.some((s) => s.isActive !== false)
    ? shades.filter((s) => s.isActive !== false)
    : shades;
  const selectedStock = selectedShade.stock;
  const isLowStock = typeof selectedStock === 'number' && selectedStock > 0 && selectedStock <= 5;
  const isOutOfStock = typeof selectedStock === 'number' && selectedStock <= 0;

  return (
    <div className="space-y-3.5 py-4 border-t border-b border-[#E8D5A8]">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#6B6B6B] block">
            CHOOSE YOUR SHADE
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-base text-[#121212] font-bold">
              {selectedShade.name}
            </span>
            <span className="text-xs px-2.5 py-0.5 bg-[#FCE8ED] text-[#F05A7E] border border-[#E8D5A8] font-bold rounded-full">
              {selectedShade.undertone} Undertone
            </span>
          </div>
        </div>

        {/* Entry point to Shade Intelligence */}
        <button
          onClick={onOpenShadeFinder}
          className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-[#F05A7E] hover:text-[#F05A7E] font-bold transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
          <span>FIND MY MATCH</span>
        </button>
      </div>

      {/* Swatches Grid */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        {visibleShades.map((shade) => {
          const isSelected = selectedShade.id === shade.id;
          return (
            <button
              key={shade.id}
              onClick={() => onSelectShade(shade)}
              className={`relative w-8 h-8 rounded-full border transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-[#F05A7E] scale-115 ring-2 ring-[#F05A7E] ring-offset-2 shadow-md'
                  : 'border-[#0B0B0B]/15 hover:scale-105 opacity-85 hover:opacity-100'
              }`}
              style={{ backgroundColor: shade.hex }}
              title={`${shade.name} (${shade.undertone} undertone)`}
              aria-label={`Select shade ${shade.name}`}
            />
          );
        })}
      </div>

      {/* Shade description */}
      <p className="text-xs text-[#6B6B6B] bg-[#FCE8ED] p-3 rounded-2xl border border-[#E8D5A8] leading-relaxed">
        {selectedShade.description}
      </p>

      {(isLowStock || isOutOfStock) && (
        <p className={`text-[11px] font-bold ${isOutOfStock ? 'text-[#F05A7E]' : 'text-[#C9972B]'}`}>
          {isOutOfStock ? 'Out of stock' : `Only ${selectedStock} left`}
        </p>
      )}
    </div>
  );
};

