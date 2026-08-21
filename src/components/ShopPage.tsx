import React, { useState, useMemo } from 'react';
import { CategoryHeader } from './CategoryHeader';
import { FilterPanel } from './FilterPanel';
import { SortSelector } from './SortSelector';
import { ProductGrid } from './ProductGrid';
import { RecentlyViewed } from './RecentlyViewed';
import { Product, Shade, FilterState, SortOption } from '../types';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { Filter as FilterIcon, SlidersHorizontal, Sparkles } from 'lucide-react';

interface ShopPageProps {
  initialCategory?: string | null;
  initialSubCategory?: string | null;
  wishlist: string[];
  recentlyViewedIds: string[];
  onToggleWishlist: (productId: string) => void;
  onQuickView: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onOpenShadeFinder: () => void;
  onCategoryNavigate: (category: string | null, subCategory: string | null) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({
  initialCategory = null,
  initialSubCategory = null,
  wishlist,
  recentlyViewedIds,
  onToggleWishlist,
  onQuickView,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onOpenShadeFinder,
  onCategoryNavigate,
}) => {
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    category: initialCategory,
    subCategory: initialSubCategory,
    priceRanges: [],
    undertones: [],
    finishes: [],
    inStockOnly: false,
  });

  // Sort state
  const [sortOption, setSortOption] = useState<SortOption>('featured');

  // Mobile filter drawer state
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Quick category pills
  const categoryPills = [
    { label: 'All Products', category: null, subCategory: null },
    { label: 'Matte Lipsticks', category: 'Makeup', subCategory: 'Lips' },
    { label: 'Luxury Sindoor', category: 'Makeup', subCategory: 'Face' },
    { label: 'Cleansing Rituals', category: 'Skin', subCategory: 'Cleansing' },
    { label: 'New Launches', category: 'Makeup', subCategory: null, isNew: true },
  ];

  // Filtering logic
  const filteredProducts = useMemo(() => {
    return GLAMIRK_PRODUCTS.filter((product) => {
      // Category filter
      if (filters.category && product.category !== filters.category) {
        return false;
      }
      // Subcategory filter
      if (filters.subCategory && product.subCategory !== filters.subCategory) {
        return false;
      }

      // Price filter
      if (filters.priceRanges.length > 0) {
        const matchesPrice = filters.priceRanges.some((range) => {
          if (range === 'under-500') return product.price < 600;
          if (range === '500-750') return product.price >= 600 && product.price <= 750;
          if (range === '750-plus') return product.price > 750;
          return true;
        });
        if (!matchesPrice) return false;
      }

      // Undertone filter
      if (filters.undertones.length > 0) {
        if (!product.shades) return false;
        const matchesUndertone = product.shades.some((s) =>
          filters.undertones.includes(s.undertone)
        );
        if (!matchesUndertone) return false;
      }

      // Finish filter
      if (filters.finishes.length > 0) {
        if (!product.finish) return false;
        if (!filters.finishes.includes(product.finish)) return false;
      }

      // In-stock only
      if (filters.inStockOnly && !product.inStock) {
        return false;
      }

      return true;
    });
  }, [filters]);

  // Sorting logic
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    switch (sortOption) {
      case 'newest':
        return list.filter((p) => p.tag === 'NEW').concat(list.filter((p) => p.tag !== 'NEW'));
      case 'price-asc':
        return list.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return list.sort((a, b) => b.price - a.price);
      case 'rating':
        return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'featured':
      default:
        return list;
    }
  }, [filteredProducts, sortOption]);

  const handleResetFilters = () => {
    setFilters({
      category: null,
      subCategory: null,
      priceRanges: [],
      undertones: [],
      finishes: [],
      inStockOnly: false,
    });
  };

  const handleSelectPill = (category: string | null, subCategory: string | null) => {
    setFilters((prev) => ({
      ...prev,
      category,
      subCategory,
    }));
    onCategoryNavigate(category, subCategory);
  };

  return (
    <div className="bg-[#FAF9F6] min-h-screen">
      {/* Category Hero / Editorial Header */}
      <CategoryHeader
        category={filters.category}
        subCategory={filters.subCategory}
        totalCount={sortedProducts.length}
      />

      {/* Visual Category Sub-Navigation Pills */}
      <div className="bg-[#FAF9F6] border-b border-[#E8D5A8] sticky top-16 z-20 backdrop-blur-md bg-[#FAF9F6]/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 flex-shrink-0">
            {categoryPills.map((pill, idx) => {
              const isActive =
                (!pill.category && !filters.category && !filters.subCategory) ||
                (filters.category === pill.category && (!pill.subCategory || filters.subCategory === pill.subCategory));

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectPill(pill.category, pill.subCategory)}
                  className={`px-3.5 py-1.5 text-xs tracking-wider uppercase font-medium transition-all ${
                    isActive
                      ? 'bg-[#0B0B0B] text-[#FAF9F6] shadow-xs'
                      : 'bg-[#FAF9F6] text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FAF9F6] border border-[#E8D5A8]'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2 flex-shrink-0 text-xs text-[#6B6B6B]">
            <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
            <span className="uppercase tracking-widest text-[10.5px]">Authentic Formulations</span>
          </div>
        </div>
      </div>

      {/* Main Listing Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Top Filter & Sort Bar */}
        <div className="flex items-center justify-between pb-6 mb-8 border-b border-[#E8D5A8] gap-4 flex-wrap">
          {/* Mobile Filter Trigger */}
          <button
            onClick={() => setIsMobileFilterOpen(true)}
            className="lg:hidden flex items-center gap-2 px-4 py-2 bg-[#FAF9F6] border border-[#E8D5A8] text-xs font-semibold tracking-wider uppercase text-[#121212]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>FILTER + SORT</span>
          </button>

          {/* Product Count Display */}
          <div className="text-xs text-[#6B6B6B] font-light">
            Showing <strong className="text-[#121212] font-semibold">{sortedProducts.length}</strong> of{' '}
            {GLAMIRK_PRODUCTS.length} curated creations
          </div>

          {/* Desktop Sort Selector */}
          <div className="ml-auto">
            <SortSelector
              currentSort={sortOption}
              onSortChange={(sort) => setSortOption(sort)}
            />
          </div>
        </div>

        {/* 2-Column Desktop Grid: Left Sidebar Filters + Right Product Grid */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Filter Panel (Desktop sidebar + Mobile drawer) */}
          <FilterPanel
            filters={filters}
            onFilterChange={setFilters}
            onResetFilters={handleResetFilters}
            isMobileOpen={isMobileFilterOpen}
            onCloseMobile={() => setIsMobileFilterOpen(false)}
            totalFilteredCount={sortedProducts.length}
          />

          {/* Right Product Grid Area */}
          <div className="flex-1 w-full">
            <ProductGrid
              products={sortedProducts}
              wishlist={wishlist}
              onToggleWishlist={onToggleWishlist}
              onQuickView={onQuickView}
              onSelectProduct={onSelectProduct}
              onTryItOn={onTryItOn}
              onQuickAdd={onQuickAdd}
              onOpenShadeFinder={onOpenShadeFinder}
              onResetFilters={handleResetFilters}
            />
          </div>
        </div>
      </div>

      {/* Recently Viewed Products */}
      <RecentlyViewed
        recentlyViewedIds={recentlyViewedIds}
        onSelectProduct={onSelectProduct}
      />
    </div>
  );
};
