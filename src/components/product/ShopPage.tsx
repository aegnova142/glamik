import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CategoryHeader } from './CategoryHeader';
import { FilterPanel } from './FilterPanel';
import { SortSelector, SORT_OPTIONS } from './SortSelector';
import { ProductGrid } from './ProductGrid';
import { RecentlyViewed } from './RecentlyViewed';
import { Product, Shade, FilterState, SortOption, CartItem } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { SlidersHorizontal, Sparkles, X, LayoutGrid, List, ArrowUpDown, Check } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface ShopPageProps {
  initialCategory?: string | null;
  initialSubCategory?: string | null;
  wishlist: string[];
  cartItems: CartItem[];
  recentlyViewedIds: string[];
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  onBuyNow: (product: Product, shade?: Shade, size?: string) => void;
  onOpenShadeFinder: () => void;
  onCategoryNavigate: (category: string | null, subCategory: string | null) => void;
}

const EMPTY_FILTERS: FilterState = {
  category: null,
  subCategory: null,
  priceMin: null,
  priceMax: null,
  undertones: [],
  finishes: [],
  skinTypes: [],
  coverages: [],
  shades: [],
  ratings: [],
  discounts: [],
  inStockOnly: false,
};

const RATING_LABELS: Record<string, string> = {
  '4-plus': '4★ & Above',
  '3-plus': '3★ & Above',
};

const DISCOUNT_LABELS: Record<string, string> = {
  '10-plus': '10% Off or More',
  '20-plus': '20% Off or More',
  '30-plus': '30% Off or More',
};

function productDiscountPercent(product: Product): number {
  if (!product.originalPrice || product.originalPrice <= product.price) return 0;
  return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
}

export const ShopPage: React.FC<ShopPageProps> = ({
  initialCategory = null,
  initialSubCategory = null,
  wishlist,
  cartItems,
  recentlyViewedIds,
  onToggleWishlist,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onGoToCart,
  onBuyNow,
  onOpenShadeFinder,
  onCategoryNavigate,
}) => {
  const { products: cmsProducts } = useCMS();
  const allProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;

  const [filters, setFilters] = useState<FilterState>({
    ...EMPTY_FILTERS,
    category: initialCategory,
    subCategory: initialSubCategory,
  });

  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isMobileSortOpen, setIsMobileSortOpen] = useState(false);

  const categoryPills = [
    { label: 'All Products', category: null, subCategory: null },
    { label: 'Matte Lipsticks', category: 'Makeup', subCategory: 'Lips' },
    { label: 'Luxury Sindoor', category: 'Makeup', subCategory: 'Face' },
    { label: 'Cleansing Rituals', category: 'Skin', subCategory: 'Cleansing' },
    { label: 'New Launches', category: 'Makeup', subCategory: null, isNew: true },
  ];

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      if (filters.category && product.category !== filters.category) return false;
      if (filters.subCategory && product.subCategory !== filters.subCategory) return false;

      if (filters.priceMin !== null && product.price < filters.priceMin) return false;
      if (filters.priceMax !== null && product.price > filters.priceMax) return false;

      if (filters.undertones.length > 0) {
        if (!product.shades) return false;
        const matchesUndertone = product.shades.some((s) => filters.undertones.includes(s.undertone));
        if (!matchesUndertone) return false;
      }

      if (filters.finishes.length > 0) {
        if (!product.finish) return false;
        if (!filters.finishes.includes(product.finish)) return false;
      }

      if (filters.skinTypes.length > 0) {
        if (!product.skinType) return false;
        const matchesSkinType = product.skinType.some((s) => filters.skinTypes.includes(s));
        if (!matchesSkinType) return false;
      }

      if (filters.coverages.length > 0) {
        if (!product.coverage) return false;
        if (!filters.coverages.includes(product.coverage)) return false;
      }

      if (filters.shades.length > 0) {
        if (!product.shades) return false;
        const matchesShade = product.shades.some((s) => filters.shades.includes(s.id));
        if (!matchesShade) return false;
      }

      if (filters.ratings.length > 0) {
        const matchesRating = filters.ratings.some((r) => {
          if (r === '4-plus') return (product.rating || 0) >= 4;
          if (r === '3-plus') return (product.rating || 0) >= 3;
          return true;
        });
        if (!matchesRating) return false;
      }

      if (filters.discounts.length > 0) {
        const discountPercent = productDiscountPercent(product);
        const matchesDiscount = filters.discounts.some((d) => {
          if (d === '10-plus') return discountPercent >= 10;
          if (d === '20-plus') return discountPercent >= 20;
          if (d === '30-plus') return discountPercent >= 30;
          return true;
        });
        if (!matchesDiscount) return false;
      }

      if (filters.inStockOnly && !product.inStock) return false;

      return true;
    });
  }, [filters, allProducts]);

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
      case 'bestsellers':
        return list.filter((p) => p.isBestSeller).concat(list.filter((p) => !p.isBestSeller));
      case 'discount':
        return list.sort((a, b) => productDiscountPercent(b) - productDiscountPercent(a));
      case 'featured':
      default:
        return list;
    }
  }, [filteredProducts, sortOption]);

  const handleResetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
  };

  const handleSelectPill = (category: string | null, subCategory: string | null) => {
    setFilters((prev) => ({ ...prev, category, subCategory }));
    onCategoryNavigate(category, subCategory);
  };

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
    if (filters.priceMin !== null || filters.priceMax !== null) {
      const lo = filters.priceMin !== null ? `₹${filters.priceMin}` : 'Any';
      const hi = filters.priceMax !== null ? `₹${filters.priceMax}` : 'Any';
      chips.push({
        key: 'price',
        label: `${lo} – ${hi}`,
        onRemove: () => setFilters((prev) => ({ ...prev, priceMin: null, priceMax: null })),
      });
    }
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
    filters.ratings.forEach((r) => {
      chips.push({
        key: `rating-${r}`,
        label: RATING_LABELS[r] || r,
        onRemove: () => setFilters((prev) => ({ ...prev, ratings: prev.ratings.filter((x) => x !== r) })),
      });
    });
    filters.discounts.forEach((d) => {
      chips.push({
        key: `discount-${d}`,
        label: DISCOUNT_LABELS[d] || d,
        onRemove: () => setFilters((prev) => ({ ...prev, discounts: prev.discounts.filter((x) => x !== d) })),
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
      <CategoryHeader
        category={filters.category}
        subCategory={filters.subCategory}
        totalCount={sortedProducts.length}
      />

      {/* Category Chips — horizontally scrollable, never wraps, no truncation */}
      <div className="sticky top-16 z-20 border-b border-[#E8D5A8] bg-[#FAF9F6]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 overflow-x-auto no-scrollbar px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-shrink-0 items-center gap-2">
            {categoryPills.map((pill, idx) => {
              const isActive =
                (!pill.category && !filters.category && !filters.subCategory) ||
                (filters.category === pill.category && (!pill.subCategory || filters.subCategory === pill.subCategory));

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectPill(pill.category, pill.subCategory)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0B0B0B] text-[#FAF9F6] shadow-sm'
                      : 'border border-[#E8D5A8] bg-white text-[#6B6B6B] hover:border-[#C9972B] hover:text-[#121212]'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          <div className="hidden flex-shrink-0 items-center gap-2 text-xs text-[#6B6B6B] md:flex">
            <Sparkles className="h-3.5 w-3.5 text-[#C9972B]" />
            <span className="text-[10.5px] uppercase tracking-widest">Authentic Formulations</span>
          </div>
        </div>
      </div>

      {/* Main Listing Layout */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <p className="text-xs text-[#6B6B6B]">
              Showing <strong className="font-semibold text-[#121212]">{sortedProducts.length}</strong> of {allProducts.length} products
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Mobile filter trigger — supplements the sticky bottom bar for quick access from the top */}
            <button
              onClick={() => setIsMobileFilterOpen(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E8D5A8] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#121212] lg:hidden"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filter</span>
              {activeChips.length > 0 && (
                <span className="rounded-full bg-[#F05A7E] px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                  {activeChips.length}
                </span>
              )}
            </button>

            {/* Grid / List view toggle */}
            <div className="flex items-center rounded-lg border border-[#E8D5A8] bg-white p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                className={`cursor-pointer rounded-md p-1.5 transition-colors ${
                  viewMode === 'grid' ? 'bg-[#FCE8ED] text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                aria-label="List view"
                className={`cursor-pointer rounded-md p-1.5 transition-colors ${
                  viewMode === 'list' ? 'bg-[#FCE8ED] text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            <div className="hidden sm:block">
              <SortSelector currentSort={sortOption} onSortChange={setSortOption} />
            </div>
          </div>
        </div>

        {/* Active Filter Chips */}
        {activeChips.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 border-t border-[#E8D5A8] py-3.5">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onRemove}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E8D5A8] bg-[#FCE8ED] py-1.5 pl-3 pr-2 text-xs font-semibold text-[#F05A7E] transition-colors hover:border-[#F05A7E] hover:bg-[#F05A7E] hover:text-white"
              >
                <span>{chip.label}</span>
                <X className="h-3 w-3" />
              </button>
            ))}
            <button
              onClick={handleResetFilters}
              className="cursor-pointer px-2 text-xs font-bold text-[#F05A7E] hover:underline"
            >
              Clear All
            </button>
          </div>
        )}

        {/* Sidebar + Product Grid */}
        <div className="flex flex-col items-start gap-8 lg:flex-row">
          <FilterPanel
            filters={filters}
            onFilterChange={setFilters}
            onResetFilters={handleResetFilters}
            isMobileOpen={isMobileFilterOpen}
            onCloseMobile={() => setIsMobileFilterOpen(false)}
            totalFilteredCount={sortedProducts.length}
            totalCount={allProducts.length}
            products={allProducts}
          />

          <div className="w-full flex-1 pb-36 md:pb-24 lg:pb-0">
            <ProductGrid
              products={sortedProducts}
              wishlist={wishlist}
              cartItems={cartItems}
              viewMode={viewMode}
              onToggleWishlist={onToggleWishlist}
              onSelectProduct={onSelectProduct}
              onTryItOn={onTryItOn}
              onQuickAdd={onQuickAdd}
              onGoToCart={onGoToCart}
              onBuyNow={onBuyNow}
              onOpenShadeFinder={onOpenShadeFinder}
              onResetFilters={handleResetFilters}
            />
          </div>
        </div>
      </div>

      <RecentlyViewed
        recentlyViewedIds={recentlyViewedIds}
        onSelectProduct={onSelectProduct}
      />

      {/* Mobile Sticky Bottom Bar — Filter + Sort, always reachable while browsing.
          Sits above the app's own MobileBottomNav (h-16, "md:hidden") below the
          md breakpoint so the two don't stack on top of each other; from md up
          to lg that nav hides itself, so this bar can sit flush at the bottom. */}
      <div className="fixed inset-x-0 bottom-16 z-40 grid grid-cols-2 gap-2 border-t border-[#E8D5A8] bg-white p-3 shadow-[0_-4px_16px_rgba(11,11,11,0.06)] md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <button
          onClick={() => setIsMobileFilterOpen(true)}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[#0B0B0B] py-2.5 text-xs font-semibold uppercase tracking-wider text-white"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filter</span>
          {activeChips.length > 0 && (
            <span className="rounded-full bg-[#F05A7E] px-1.5 py-0.5 text-[9.5px] font-bold">{activeChips.length}</span>
          )}
        </button>
        <button
          onClick={() => setIsMobileSortOpen(true)}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[#E8D5A8] bg-white py-2.5 text-xs font-semibold uppercase tracking-wider text-[#121212]"
        >
          <ArrowUpDown className="h-3.5 w-3.5 text-[#C9972B]" />
          <span>Sort</span>
        </button>
      </div>

      {/* Mobile Sort Sheet */}
      <AnimatePresence>
        {isMobileSortOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSortOpen(false)}
              className="fixed inset-0 z-50 bg-[#0B0B0B]/60 backdrop-blur-xs lg:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-[#E8D5A8] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-[#E8D5A8] px-4 py-3.5">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#121212]">Sort By</h3>
                <button
                  onClick={() => setIsMobileSortOpen(false)}
                  className="cursor-pointer rounded-full p-1 text-[#121212] hover:bg-[#FCE8ED] hover:text-[#F05A7E]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2 py-2">
                {SORT_OPTIONS.map((opt) => {
                  const isActive = opt.value === sortOption;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortOption(opt.value);
                        setIsMobileSortOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3.5 py-3 text-left text-sm transition-colors ${
                        isActive ? 'bg-[#FCE8ED] font-semibold text-[#F05A7E]' : 'text-[#121212] hover:bg-[#FAF9F6]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isActive && <Check className="h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
