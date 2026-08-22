import React, { useState, useMemo } from 'react';
import { CategoryHeader } from './CategoryHeader';
import { FilterPanel } from './FilterPanel';
import { SortSelector } from './SortSelector';
import { ProductGrid } from './ProductGrid';
import { RecentlyViewed } from './RecentlyViewed';
import { Product, Shade, FilterState, SortOption } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { Filter as FilterIcon, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

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

const EMPTY_FILTERS: FilterState = {
  category: null,
  subCategory: null,
  priceRanges: [],
  undertones: [],
  finishes: [],
  skinTypes: [],
  coverages: [],
  shades: [],
  inStockOnly: false,
};

const PRICE_LABELS: Record<string, string> = {
  'under-500': 'Under ₹600',
  '500-750': '₹600 – ₹750',
  '750-plus': '₹750 & Above',
};

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
  const { products: cmsProducts } = useCMS();
  const allProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    ...EMPTY_FILTERS,
    category: initialCategory,
    subCategory: initialSubCategory,
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
    return allProducts.filter((product) => {
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
        const matchesUndertone = product.shades.some((s) => filters.undertones.includes(s.undertone));
        if (!matchesUndertone) return false;
      }

      // Finish filter
      if (filters.finishes.length > 0) {
        if (!product.finish) return false;
        if (!filters.finishes.includes(product.finish)) return false;
      }

      // Skin Type filter
      if (filters.skinTypes.length > 0) {
        if (!product.skinType) return false;
        const matchesSkinType = product.skinType.some((s) => filters.skinTypes.includes(s));
        if (!matchesSkinType) return false;
      }

      // Coverage filter
      if (filters.coverages.length > 0) {
        if (!product.coverage) return false;
        if (!filters.coverages.includes(product.coverage)) return false;
      }

      // Shade filter (by shade id)
      if (filters.shades.length > 0) {
        if (!product.shades) return false;
        const matchesShade = product.shades.some((s) => filters.shades.includes(s.id));
        if (!matchesShade) return false;
      }

      // In-stock only
      if (filters.inStockOnly && !product.inStock) {
        return false;
      }

      return true;
    });
  }, [filters, allProducts]);

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
      case 'featured':
      default:
        return list;
    }
  }, [filteredProducts, sortOption]);

  const handleResetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
  };

  const handleSelectPill = (category: string | null, subCategory: string | null) => {
    setFilters((prev) => ({
      ...prev,
      category,
      subCategory,
    }));
    onCategoryNavigate(category, subCategory);
  };

  // Active filter chips — every checked filter appears here as a removable pill, right below the top bar.
  type ActiveChip = { key: string; label: string; onRemove: () => void };
  const activeChips: ActiveChip[] = useMemo(() => {
    const chips: ActiveChip[] = [];
    if (filters.category) {
      chips.push({
        key: 'category',
        label: filters.subCategory ? `${filters.category} · ${filters.subCategory}` : filters.category,
        onRemove: () => setFilters((prev) => ({ ...prev, category: null, subCategory: null })),
      });
    }
    filters.priceRanges.forEach((id) => {
      chips.push({
        key: `price-${id}`,
        label: PRICE_LABELS[id] || id,
        onRemove: () => setFilters((prev) => ({ ...prev, priceRanges: prev.priceRanges.filter((p) => p !== id) })),
      });
    });
    filters.undertones.forEach((u) => {
      chips.push({
        key: `undertone-${u}`,
        label: `${u} Undertone`,
        onRemove: () => setFilters((prev) => ({ ...prev, undertones: prev.undertones.filter((x) => x !== u) })),
      });
    });
    filters.finishes.forEach((f) => {
      chips.push({
        key: `finish-${f}`,
        label: f,
        onRemove: () => setFilters((prev) => ({ ...prev, finishes: prev.finishes.filter((x) => x !== f) })),
      });
    });
    filters.skinTypes.forEach((s) => {
      chips.push({
        key: `skintype-${s}`,
        label: s,
        onRemove: () => setFilters((prev) => ({ ...prev, skinTypes: prev.skinTypes.filter((x) => x !== s) })),
      });
    });
    filters.coverages.forEach((c) => {
      chips.push({
        key: `coverage-${c}`,
        label: c,
        onRemove: () => setFilters((prev) => ({ ...prev, coverages: prev.coverages.filter((x) => x !== c) })),
      });
    });
    filters.shades.forEach((shadeId) => {
      const shadeName = allProducts.flatMap((p) => p.shades || []).find((s) => s.id === shadeId)?.name || shadeId;
      chips.push({
        key: `shade-${shadeId}`,
        label: shadeName,
        onRemove: () => setFilters((prev) => ({ ...prev, shades: prev.shades.filter((x) => x !== shadeId) })),
      });
    });
    if (filters.inStockOnly) {
      chips.push({
        key: 'instock',
        label: 'In Stock Only',
        onRemove: () => setFilters((prev) => ({ ...prev, inStockOnly: false })),
      });
    }
    return chips;
  }, [filters, allProducts]);

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
        <div className="flex items-center justify-between pb-4 border-b border-[#E8D5A8] gap-4 flex-wrap">
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
            {allProducts.length} curated creations
          </div>

          {/* Desktop Sort Selector */}
          <div className="ml-auto">
            <SortSelector
              currentSort={sortOption}
              onSortChange={(sort) => setSortOption(sort)}
            />
          </div>
        </div>

        {/* Active Filter Chips — shows right below the top bar whenever any filter is checked */}
        {activeChips.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap py-4 mb-4 border-b border-[#E8D5A8]">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onRemove}
                className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-[#FCE8ED] border border-[#E8D5A8] text-[#F05A7E] text-xs font-semibold rounded-full hover:bg-[#F05A7E] hover:text-white hover:border-[#F05A7E] transition-colors cursor-pointer"
              >
                <span>{chip.label}</span>
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold text-[#F05A7E] hover:underline cursor-pointer px-2"
            >
              Clear All
            </button>
          </div>
        )}

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
            products={allProducts}
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
