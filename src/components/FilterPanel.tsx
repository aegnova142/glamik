import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown, ChevronUp, RotateCcw, Filter as FilterIcon, Check } from 'lucide-react';
import { FilterState } from '../types';

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onResetFilters: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  totalFilteredCount: number;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  isMobileOpen,
  onCloseMobile,
  totalFilteredCount,
}) => {
  // Accordion state
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    category: true,
    price: true,
    undertone: true,
    finish: true,
    availability: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const categories = [
    { label: 'All Creations', category: null, subCategory: null },
    { label: 'Lips (Lipsticks)', category: 'Makeup', subCategory: 'Lips' },
    { label: 'Face (Luxury Sindoor)', category: 'Makeup', subCategory: 'Face' },
    { label: 'Cleansing (Balm To Water)', category: 'Skin', subCategory: 'Cleansing' },
  ];

  const priceOptions = [
    { id: 'under-500', label: 'Under ₹600' },
    { id: '500-750', label: '₹600 – ₹750' },
    { id: '750-plus', label: '₹750 & Above' },
  ];

  const undertoneOptions = [
    { id: 'Warm', label: 'Warm (Golden / Terracotta)' },
    { id: 'Neutral', label: 'Neutral (Balanced Rose)' },
    { id: 'Cool', label: 'Cool (Berry / Wine)' },
    { id: 'Universal', label: 'Universal (Flattering Classic)' },
  ];

  const finishOptions = [
    { id: 'Matte', label: 'Velvet Matte' },
    { id: 'Natural Melting', label: 'Natural Melting Emulsion' },
  ];

  const handleCategorySelect = (category: string | null, subCategory: string | null) => {
    onFilterChange({
      ...filters,
      category,
      subCategory,
    });
  };

  const handlePriceToggle = (priceId: string) => {
    const nextPrices = filters.priceRanges.includes(priceId)
      ? filters.priceRanges.filter((p) => p !== priceId)
      : [...filters.priceRanges, priceId];
    onFilterChange({ ...filters, priceRanges: nextPrices });
  };

  const handleUndertoneToggle = (undertone: string) => {
    const nextUndertones = filters.undertones.includes(undertone)
      ? filters.undertones.filter((u) => u !== undertone)
      : [...filters.undertones, undertone];
    onFilterChange({ ...filters, undertones: nextUndertones });
  };

  const handleFinishToggle = (finish: string) => {
    const nextFinishes = filters.finishes.includes(finish)
      ? filters.finishes.filter((f) => f !== finish)
      : [...filters.finishes, finish];
    onFilterChange({ ...filters, finishes: nextFinishes });
  };

  const activeFiltersCount =
    (filters.category ? 1 : 0) +
    filters.priceRanges.length +
    filters.undertones.length +
    filters.finishes.length +
    (filters.inStockOnly ? 1 : 0);

  const filterContent = (
    <div className="space-y-5">
      {/* Category Section */}
      <div className="border-b border-[#E8D5A8] pb-4">
        <button
          onClick={() => toggleSection('category')}
          className="flex items-center justify-between w-full text-left text-xs uppercase tracking-wider font-bold text-[#121212] cursor-pointer"
        >
          <span>Collection & Category</span>
          {openSections.category ? (
            <ChevronUp className="w-3.5 h-3.5 text-[#6B6B6B]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[#6B6B6B]" />
          )}
        </button>

        {openSections.category && (
          <div className="mt-3 space-y-1">
            {categories.map((cat, idx) => {
              const isSelected =
                (!cat.category && !filters.category) ||
                (filters.category === cat.category && (!cat.subCategory || filters.subCategory === cat.subCategory));

              return (
                <button
                  key={idx}
                  onClick={() => handleCategorySelect(cat.category, cat.subCategory)}
                  className={`w-full text-left text-xs py-2 px-3 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'font-bold text-[#F05A7E] bg-[#FCE8ED]'
                      : 'text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FCE8ED]/60'
                  }`}
                >
                  <span>{cat.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#F05A7E]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div className="border-b border-[#E8D5A8] pb-4">
        <button
          onClick={() => toggleSection('price')}
          className="flex items-center justify-between w-full text-left text-xs uppercase tracking-wider font-bold text-[#121212] cursor-pointer"
        >
          <span>Price</span>
          {openSections.price ? (
            <ChevronUp className="w-3.5 h-3.5 text-[#6B6B6B]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[#6B6B6B]" />
          )}
        </button>

        {openSections.price && (
          <div className="mt-3 space-y-2">
            {priceOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]"
              >
                <input
                  type="checkbox"
                  checked={filters.priceRanges.includes(opt.id)}
                  onChange={() => handlePriceToggle(opt.id)}
                  className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Undertone Palette */}
      <div className="border-b border-[#E8D5A8] pb-4">
        <button
          onClick={() => toggleSection('undertone')}
          className="flex items-center justify-between w-full text-left text-xs uppercase tracking-wider font-bold text-[#121212] cursor-pointer"
        >
          <span>Undertone</span>
          {openSections.undertone ? (
            <ChevronUp className="w-3.5 h-3.5 text-[#6B6B6B]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[#6B6B6B]" />
          )}
        </button>

        {openSections.undertone && (
          <div className="mt-3 space-y-2">
            {undertoneOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]"
              >
                <input
                  type="checkbox"
                  checked={filters.undertones.includes(opt.id)}
                  onChange={() => handleUndertoneToggle(opt.id)}
                  className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Finish */}
      <div className="border-b border-[#E8D5A8] pb-4">
        <button
          onClick={() => toggleSection('finish')}
          className="flex items-center justify-between w-full text-left text-xs uppercase tracking-wider font-bold text-[#121212] cursor-pointer"
        >
          <span>Finish & Texture</span>
          {openSections.finish ? (
            <ChevronUp className="w-3.5 h-3.5 text-[#6B6B6B]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[#6B6B6B]" />
          )}
        </button>

        {openSections.finish && (
          <div className="mt-3 space-y-2">
            {finishOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]"
              >
                <input
                  type="checkbox"
                  checked={filters.finishes.includes(opt.id)}
                  onChange={() => handleFinishToggle(opt.id)}
                  className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="pb-2">
        <label className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]">
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(e) => onFilterChange({ ...filters, inStockOnly: e.target.checked })}
            className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
          />
          <span className="font-semibold text-[#121212]">In Stock Only</span>
        </label>
      </div>

      {/* Reset Action */}
      {activeFiltersCount > 0 && (
        <button
          onClick={onResetFilters}
          className="w-full py-2.5 px-4 bg-[#FCE8ED] hover:bg-[#FCE8ED] text-[#F05A7E] text-xs font-bold tracking-wider uppercase rounded-xl transition-colors flex items-center justify-center gap-2 border border-[#E8D5A8] cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset All Filters</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Left column) */}
      <aside className="hidden lg:block w-64 flex-shrink-0 pr-8">
        <div className="sticky top-28 space-y-5 bg-white p-5 rounded-3xl border border-[#E8D5A8] shadow-[0_4px_20px_rgba(240, 90, 126,0.04)]">
          <div className="flex items-center justify-between pb-3 border-b border-[#E8D5A8]">
            <div className="flex items-center gap-2">
              <FilterIcon className="w-4 h-4 text-[#F05A7E]" />
              <h3 className="text-base font-bold text-[#121212] tracking-tight">
                Refine Selection
              </h3>
            </div>
            {activeFiltersCount > 0 && (
              <span className="text-[10px] px-2 py-0.5 bg-[#F05A7E] text-white font-bold rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </div>
          {filterContent}
        </div>
      </aside>

      {/* Mobile Drawer / Bottom Sheet */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity lg:hidden"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 max-h-[85vh] bg-white z-50 rounded-t-3xl shadow-2xl flex flex-col justify-between lg:hidden border-t border-[#E8D5A8]"
            >
              {/* Mobile Filter Header */}
              <div className="p-5 border-b border-[#E8D5A8] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FilterIcon className="w-4 h-4 text-[#F05A7E]" />
                  <h3 className="text-lg font-bold text-[#121212]">
                    Filter & Refine
                  </h3>
                  {activeFiltersCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 bg-[#F05A7E] text-white font-bold rounded-full">
                      {activeFiltersCount} active
                    </span>
                  )}
                </div>
                <button
                  onClick={onCloseMobile}
                  className="p-1.5 text-[#121212] hover:text-[#F05A7E] rounded-full hover:bg-[#FCE8ED] transition-colors"
                  aria-label="Close filters"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Filter List */}
              <div className="p-6 overflow-y-auto flex-grow">
                {filterContent}
              </div>

              {/* Mobile Bottom Action Bar */}
              <div className="p-4 bg-[#FCE8ED] border-t border-[#E8D5A8] grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    onResetFilters();
                  }}
                  className="py-3 bg-white border border-[#E8D5A8] text-[#121212] text-xs font-bold tracking-wider uppercase rounded-full hover:bg-[#FCE8ED] transition-colors"
                >
                  Clear All
                </button>
                <button
                  onClick={onCloseMobile}
                  className="py-3 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold tracking-wider uppercase rounded-full flex items-center justify-center gap-1.5 shadow-md transition-colors"
                >
                  <span>Apply ({totalFilteredCount})</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

