import React from 'react';
import { ChevronDown } from 'lucide-react';
import { SortOption } from '../types';

interface SortSelectorProps {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export const SortSelector: React.FC<SortSelectorProps> = ({ currentSort, onSortChange }) => {
  return (
    <div className="relative inline-flex items-center">
      <label htmlFor="shop-sort-selector" className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#6B6B6B] mr-2.5 hidden sm:inline">
        SORT BY:
      </label>
      <div className="relative">
        <select
          id="shop-sort-selector"
          value={currentSort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="appearance-none bg-[#FAF9F6] border border-[#E8D5A8] hover:border-[#0B0B0B] px-3.5 py-2 pr-8 text-xs text-[#121212] font-medium tracking-wide uppercase focus:outline-none focus:border-[#C9972B] cursor-pointer transition-colors"
        >
          <option value="featured">Featured Curations</option>
          <option value="newest">Newest Launches</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="rating">Highest Rated</option>
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-[#6B6B6B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
};
