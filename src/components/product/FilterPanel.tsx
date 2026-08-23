import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown, ChevronUp, RotateCcw, Filter as FilterIcon, Check } from 'lucide-react';
import { FilterState, Product } from '../../types';

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onResetFilters: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  totalFilteredCount: number;
  products: Product[];
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  isMobileOpen,
  onCloseMobile,
  totalFilteredCount,
  products,
}) => {
  // Accordion state
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    category: true,
    price: true,
    undertone: true,
    finish: true,
    skinType: false,
    coverage: false,
    shade: false,
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

  // Live counts, computed from the actual admin-managed product catalogue
  const categoryCounts = useMemo(() => {
    return categories.map((cat) => {
      if (!cat.category) return products.length;
      return products.filter(
        (p) => p.category === cat.category && (!cat.subCategory || p.subCategory === cat.subCategory)
      ).length;
    });
  }, [products]);

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

  // Finish, Skin Type, Coverage, and Shade options are all derived live from the actual
  // product catalogue — whatever admin adds/edits/removes shows up here automatically.
  const finishOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.finish && set.add(p.finish));
    return Array.from(set).map((f) => ({ id: f, label: f }));
  }, [products]);

  const skinTypeOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.skinType?.forEach((s) => set.add(s)));
    return Array.from(set).map((s) => ({ id: s, label: s }));
  }, [products]);

  const coverageOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.coverage && set.add(p.coverage));
    return Array.from(set).map((c) => ({ id: c, label: c }));
  }, [products]);

  const shadeOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; hex: string }>();
    products.forEach((p) => p.shades?.forEach((s) => {
      if (!map.has(s.id)) map.set(s.id, { id: s.id, name: s.name, hex: s.hex });
    }));
    return Array.from(map.values());
  }, [products]);

  const handleCategorySelect = (category: string | null, subCategory: string | null) => {
    onFilterChange({ ...filters, category, subCategory });
  };

  const handleToggle = (field: 'priceRanges' | 'undertones' | 'finishes' | 'skinTypes' | 'coverages' | 'shades', value: string) => {
    const current = filters[field];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onFilterChange({ ...filters, [field]: next });
  };

  const activeFiltersCount =
    (filters.category ? 1 : 0) +
    filters.priceRanges.length +
    filters.undertones.length +
    filters.finishes.length +
    filters.skinTypes.length +
    filters.coverages.length +
    filters.shades.length +
    (filters.inStockOnly ? 1 : 0);

  const Section: React.FC<{ id: string; title: string; count?: number; children: React.ReactNode }> = ({ id, title, count, children }) => (
    <div className="border-b border-[#E8D5A8] pb-4">
      <button
        onClick={() => toggleSection(id)}
        className="flex items-center justify-between w-full text-left text-xs uppercase tracking-wider font-bold text-[#121212] cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <span>{title}</span>
          {!!count && <span className="text-[10px] font-mono text-[#F05A7E] normal-case">({count})</span>}
        </span>
        {openSections[id] ? (
          <ChevronUp className="w-3.5 h-3.5 text-[#6B6B6B]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[#6B6B6B]" />
        )}
      </button>
      {openSections[id] && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );

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
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-[#6B6B6B]">{categoryCounts[idx]}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#F05A7E]" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Price Range */}
      <Section id="price" title="Price">
        {priceOptions.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]">
            <input
              type="checkbox"
              checked={filters.priceRanges.includes(opt.id)}
              onChange={() => handleToggle('priceRanges', opt.id)}
              className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </Section>

      {/* Undertone Palette */}
      <Section id="undertone" title="Undertone">
        {undertoneOptions.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]">
            <input
              type="checkbox"
              checked={filters.undertones.includes(opt.id)}
              onChange={() => handleToggle('undertones', opt.id)}
              className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </Section>

      {/* Finish & Texture */}
      {finishOptions.length > 0 && (
        <Section id="finish" title="Finish & Texture">
          {finishOptions.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]">
              <input
                type="checkbox"
                checked={filters.finishes.includes(opt.id)}
                onChange={() => handleToggle('finishes', opt.id)}
                className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </Section>
      )}

      {/* Skin Type */}
      {skinTypeOptions.length > 0 && (
        <Section id="skinType" title="Skin Type">
          {skinTypeOptions.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]">
              <input
                type="checkbox"
                checked={filters.skinTypes.includes(opt.id)}
                onChange={() => handleToggle('skinTypes', opt.id)}
                className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </Section>
      )}

      {/* Coverage */}
      {coverageOptions.length > 0 && (
        <Section id="coverage" title="Coverage">
          {coverageOptions.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2.5 text-xs text-[#6B6B6B] cursor-pointer hover:text-[#121212]">
              <input
                type="checkbox"
                checked={filters.coverages.includes(opt.id)}
                onChange={() => handleToggle('coverages', opt.id)}
                className="rounded border-[#E8D5A8] text-[#F05A7E] focus:ring-[#F05A7E] w-4 h-4 accent-[#F05A7E]"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </Section>
      )}

      {/* Shade */}
      {shadeOptions.length > 0 && (
        <div className="border-b border-[#E8D5A8] pb-4">
          <button
            onClick={() => toggleSection('shade')}
            className="flex items-center justify-between w-full text-left text-xs uppercase tracking-wider font-bold text-[#121212] cursor-pointer"
          >
            <span>Shade</span>
            {openSections.shade ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#6B6B6B]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#6B6B6B]" />
            )}
          </button>
          {openSections.shade && (
            <div className="mt-3 flex flex-wrap gap-2">
              {shadeOptions.map((shade) => {
                const isSelected = filters.shades.includes(shade.id);
                return (
                  <button
                    key={shade.id}
                    onClick={() => handleToggle('shades', shade.id)}
                    title={shade.name}
                    className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                      isSelected ? 'border-[#F05A7E] scale-110 ring-2 ring-[#F05A7E]/30' : 'border-[#0B0B0B]/10 hover:scale-105'
                    }`}
                    style={{ backgroundColor: shade.hex }}
                    aria-label={`Filter by shade ${shade.name}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

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
        <div className="sticky top-28 space-y-5 bg-white p-5 rounded-3xl border border-[#E8D5A8] shadow-[0_4px_20px_rgba(240,90,126,0.04)] max-h-[calc(100vh-8rem)] overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-[#E8D5A8] sticky -top-5 bg-white pt-1">
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
              className="fixed inset-0 bg-[#0B0B0B]/60 backdrop-blur-xs z-50 transition-opacity lg:hidden"
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
