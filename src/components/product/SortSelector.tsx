import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, ArrowUpDown } from 'lucide-react';
import { SortOption } from '../../types';
import { useClickOutside } from '../../hooks/useClickOutside';

interface SortSelectorProps {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'New Arrivals' },
  { value: 'bestsellers', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'discount', label: 'Biggest Discount' },
];

export const SortSelector: React.FC<SortSelectorProps> = ({ currentSort, onSortChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const currentLabel = SORT_OPTIONS.find((o) => o.value === currentSort)?.label || 'Featured';

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <label className="mr-2 hidden text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#6B6B6B] sm:inline">
        Sort By
      </label>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#E8D5A8] bg-white px-3.5 py-2 text-xs font-medium uppercase tracking-wide text-[#121212] transition-colors hover:border-[#0B0B0B]"
      >
        <ArrowUpDown className="h-3.5 w-3.5 text-[#C9972B]" />
        <span>{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#6B6B6B] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 overflow-hidden rounded-lg border border-[#E8D5A8] bg-white shadow-[0_8px_24px_rgba(11,11,11,0.10)]"
          >
            {SORT_OPTIONS.map((opt) => {
              const isActive = opt.value === currentSort;
              return (
                <button
                  key={opt.value}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onSortChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors ${
                    isActive ? 'bg-[#FCE8ED] font-semibold text-[#F05A7E]' : 'text-[#121212] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isActive && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
