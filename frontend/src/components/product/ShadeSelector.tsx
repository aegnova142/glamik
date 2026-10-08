import React from 'react';
import { Product, Shade } from '@glamirk/shared/types';
import { selectableShades, getVariantStock, stockStatus } from '@glamirk/shared/utils/productVariant';
import { Sparkles } from 'lucide-react';

interface ShadeSelectorProps {
  product: Product;
  shades: Shade[];
  selectedShade: Shade;
  /**
   * Stock for what is actually selected — resolved by the caller through the
   * size → shade → product chain. A shade that sells in 30g and 50g has no
   * single stock number of its own, so reading `selectedShade.stock` here
   * would announce the wrong figure (or none) the moment sizes exist.
   */
  selectedStock: number;
  onSelectShade: (shade: Shade) => void;
  onOpenShadeFinder: () => void;
}

export const ShadeSelector: React.FC<ShadeSelectorProps> = ({
  product,
  shades,
  selectedShade,
  selectedStock,
  onSelectShade,
  onOpenShadeFinder,
}) => {
  // Which shades a customer may pick — including the "every shade is paused"
  // fallback — is decided by the shared helper rather than re-derived here,
  // because the cart endpoint admits exactly this set. A swatch on this row is
  // always one the server will accept.
  const visibleShades = selectableShades({ ...product, shades });
  const status = stockStatus(selectedStock);

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
          // A sold-out shade stays selectable — the customer can still look at
          // it, read its description and see its photographs — but says so,
          // rather than letting them find out at the Add to Bag button.
          const soldOut = getVariantStock(product, shade) <= 0 && (shade.sizes || []).length === 0;
          return (
            <button
              key={shade.id}
              onClick={() => onSelectShade(shade)}
              className={`relative w-8 h-8 rounded-full border transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-[#F05A7E] scale-115 ring-2 ring-[#F05A7E] ring-offset-2 shadow-md'
                  : 'border-[#0B0B0B]/15 hover:scale-105 opacity-85 hover:opacity-100'
              } ${soldOut ? 'opacity-40' : ''}`}
              style={{ backgroundColor: shade.hex }}
              title={`${shade.name} (${shade.undertone} undertone)${soldOut ? ' — out of stock' : ''}`}
              aria-label={`Select shade ${shade.name}${soldOut ? ', out of stock' : ''}`}
            >
              {soldOut && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-full h-px bg-[#121212]/70 rotate-45" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Shade description */}
      <p className="text-xs text-[#6B6B6B] bg-[#FCE8ED] p-3 rounded-2xl border border-[#E8D5A8] leading-relaxed">
        {selectedShade.description}
      </p>

      {status !== 'in-stock' && (
        <p className={`text-[11px] font-bold ${status === 'out-of-stock' ? 'text-[#F05A7E]' : 'text-[#C9972B]'}`}>
          {status === 'out-of-stock' ? 'Out of stock' : `Only ${selectedStock} left`}
        </p>
      )}
    </div>
  );
};
