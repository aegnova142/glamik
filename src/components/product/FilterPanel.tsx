import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown, Filter as FilterIcon, Check } from 'lucide-react';
import { FilterState, Product } from '../../types';

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onResetFilters: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  totalFilteredCount: number;
  totalCount: number;
  products: Product[];
}

// Sticky offset for the desktop sidebar — clears the fixed navbar (h-16) plus
// the sticky category pill bar rendered above it in ShopPage.
const SIDEBAR_TOP_OFFSET = 'lg:top-[7.5rem]';

// Matches ProductCard.tsx's own RATINGS_ENABLED flag — rating display is on
// hold for a future release; flip both flags together to bring it back.
const RATINGS_ENABLED = false;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Accordion section shell — consistent header/spacing/animation used by every filter group. */
const AccordionSection: React.FC<{
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, count, isOpen, onToggle, children }) => (
  <div className="border-b border-[#E8D5A8]/70 last:border-b-0">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex w-full items-center justify-between py-3.5 text-left cursor-pointer group"
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-[#121212]">
        {title}
        {!!count && (
          <span className="rounded-full bg-[#FCE8ED] px-1.5 py-0.5 text-[9.5px] font-bold text-[#F05A7E] normal-case tracking-normal">
            {count}
          </span>
        )}
      </span>
      <ChevronDown
        className={`h-3.5 w-3.5 text-[#6B6B6B] transition-transform duration-200 group-hover:text-[#121212] ${
          isOpen ? 'rotate-180' : ''
        }`}
      />
    </button>
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="pb-4 pt-0.5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const CheckboxRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: () => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-xs text-[#6B6B6B] transition-colors hover:text-[#121212]">
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        checked ? 'border-[#F05A7E] bg-[#F05A7E]' : 'border-[#E8D5A8] bg-white'
      }`}
    >
      {checked && <Check className="h-2.5 w-2.5 text-white stroke-[3]" />}
    </span>
    <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
    <span>{label}</span>
  </label>
);

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  isMobileOpen,
  onCloseMobile,
  totalFilteredCount,
  totalCount,
  products,
}) => {
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    category: true,
    price: true,
    rating: false,
    productType: false,
    shade: false,
    availability: true,
    discount: false,
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

  const categoryCounts = useMemo(() => {
    return categories.map((cat) => {
      if (!cat.category) return products.length;
      return products.filter(
        (p) => p.category === cat.category && (!cat.subCategory || p.subCategory === cat.subCategory)
      ).length;
    });
  }, [products]);

  // Catalog-derived price bounds — always reflects the real product range,
  // so the slider/presets never go stale as the admin adds/edits products.
  const { catalogMin, catalogMax } = useMemo(() => {
    if (products.length === 0) return { catalogMin: 0, catalogMax: 1000 };
    const prices = products.map((p) => p.price);
    return {
      catalogMin: Math.max(0, Math.floor(Math.min(...prices) / 50) * 50),
      catalogMax: Math.ceil(Math.max(...prices) / 50) * 50 + 50,
    };
  }, [products]);

  const priceMin = filters.priceMin ?? catalogMin;
  const priceMax = filters.priceMax ?? catalogMax;

  const pricePresets = useMemo(() => {
    const span = catalogMax - catalogMin;
    const p1 = roundTo(catalogMin + span * 0.33, 50);
    const p2 = roundTo(catalogMin + span * 0.66, 50);
    return [
      { label: `Under ₹${p1}`, min: catalogMin, max: p1 },
      { label: `₹${p1} – ₹${p2}`, min: p1, max: p2 },
      { label: `₹${p2} & Above`, min: p2, max: catalogMax },
    ];
  }, [catalogMin, catalogMax]);

  const ratingOptions = [
    { id: '4-plus', label: '4★ & Above' },
    { id: '3-plus', label: '3★ & Above' },
  ];

  const discountOptions = [
    { id: '10-plus', label: '10% Off or More' },
    { id: '20-plus', label: '20% Off or More' },
    { id: '30-plus', label: '30% Off or More' },
  ];

  const undertoneOptions = [
    { id: 'Warm', label: 'Warm (Golden / Terracotta)' },
    { id: 'Neutral', label: 'Neutral (Balanced Rose)' },
    { id: 'Cool', label: 'Cool (Berry / Wine)' },
    { id: 'Universal', label: 'Universal (Flattering Classic)' },
  ];

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

  const handleToggle = (
    field: 'undertones' | 'finishes' | 'skinTypes' | 'coverages' | 'shades' | 'ratings' | 'discounts',
    value: string
  ) => {
    const current = filters[field];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onFilterChange({ ...filters, [field]: next });
  };

  const handlePriceInput = (which: 'min' | 'max', raw: number) => {
    const clamped = Math.min(Math.max(raw, catalogMin), catalogMax);
    if (which === 'min') {
      onFilterChange({ ...filters, priceMin: Math.min(clamped, priceMax) });
    } else {
      onFilterChange({ ...filters, priceMax: Math.max(clamped, priceMin) });
    }
  };

  const applyPricePreset = (preset: { min: number; max: number }) => {
    const isActive = priceMin === preset.min && priceMax === preset.max;
    onFilterChange({
      ...filters,
      priceMin: isActive ? null : preset.min,
      priceMax: isActive ? null : preset.max,
    });
  };

  const isPriceActive = filters.priceMin !== null || filters.priceMax !== null;

  const activeFiltersCount =
    (filters.category ? 1 : 0) +
    (isPriceActive ? 1 : 0) +
    filters.undertones.length +
    filters.finishes.length +
    filters.skinTypes.length +
    filters.coverages.length +
    filters.shades.length +
    filters.ratings.length +
    filters.discounts.length +
    (filters.inStockOnly ? 1 : 0);

  // Min-thumb gets priority z-index once the two handles are close together,
  // so its handle stays reachable instead of hiding underneath the max thumb.
  // This only has to resolve the rare case where the two invisible native
  // thumbs' hit areas actually overlap — see the `.range-thumb` CSS rule
  // (index.css) that gives each input's own box `pointer-events: none` and
  // only its `::-webkit-slider-thumb`/`::-moz-range-thumb` `pointer-events:
  // auto`. Without that, both full-width transparent inputs would capture
  // clicks across their ENTIRE track (not just near their own thumb), so
  // whichever had the higher z-index would swallow every click/drag no
  // matter where the other thumb visually was — making it ungrabbable
  // whenever the values were more than 10% apart (the common case).
  const thumbsAreClose = catalogMax > catalogMin && (priceMax - priceMin) / (catalogMax - catalogMin) < 0.1;

  const filterContent = (
    <div>
      {/* Category */}
      <AccordionSection
        title="Category / Collection"
        isOpen={openSections.category}
        onToggle={() => toggleSection('category')}
      >
        <div className="space-y-0.5">
          {categories.map((cat, idx) => {
            const isSelected =
              (!cat.category && !filters.category) ||
              (filters.category === cat.category && (!cat.subCategory || filters.subCategory === cat.subCategory));
            return (
              <button
                key={idx}
                onClick={() => handleCategorySelect(cat.category, cat.subCategory)}
                className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  isSelected ? 'bg-[#FCE8ED] font-bold text-[#F05A7E]' : 'text-[#6B6B6B] hover:bg-[#FAF9F6] hover:text-[#121212]'
                }`}
              >
                <span>{cat.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-[#6B6B6B]">{categoryCounts[idx]}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-[#F05A7E]" />}
                </span>
              </button>
            );
          })}
        </div>
      </AccordionSection>

      {/* Price Range */}
      <AccordionSection title="Price Range" isOpen={openSections.price} onToggle={() => toggleSection('price')}>
        <div className="space-y-4 px-0.5">
          {/* Dual range slider. The two native <input type=range> elements
              are fully transparent and span the full width — they only
              exist to own the drag/click/keyboard interaction. The visible
              track and thumbs are separate plain <div>s positioned by the
              same value→percent math, because native ::-webkit-slider-thumb
              styling proved unreliable in this environment: even with
              -webkit-appearance:none on the thumb, some Chromium builds
              still paint their own default thumb icon layered underneath,
              which renders as a distorted/notched ring instead of a clean
              circle once the custom border is added on top. Decorative divs
              sidestep native form-control rendering entirely. */}
          <div className="relative pt-2 pb-1">
            <div className="relative mx-2 h-1 rounded-full bg-[#E8D5A8]">
              {/* Only draws once the shopper has actually narrowed the range —
                  left at full width by default it would render solid pink
                  end-to-end, visually swallowing the thumbs sitting on it. */}
              {isPriceActive && (
                <div
                  className="absolute h-1 rounded-full bg-[#F05A7E]"
                  style={{
                    left: `${((priceMin - catalogMin) / (catalogMax - catalogMin || 1)) * 100}%`,
                    right: `${100 - ((priceMax - catalogMin) / (catalogMax - catalogMin || 1)) * 100}%`,
                  }}
                />
              )}
              {/* Decorative thumb dots — purely visual, non-interactive. */}
              <span
                className="pointer-events-none absolute top-1/2 h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#F05A7E] bg-white shadow-[0_1px_3px_rgba(11,11,11,0.2)]"
                style={{ left: `${((priceMin - catalogMin) / (catalogMax - catalogMin || 1)) * 100}%` }}
              />
              <span
                className="pointer-events-none absolute top-1/2 h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#F05A7E] bg-white shadow-[0_1px_3px_rgba(11,11,11,0.2)]"
                style={{ left: `${((priceMax - catalogMin) / (catalogMax - catalogMin || 1)) * 100}%` }}
              />
            </div>
            <input
              type="range"
              min={catalogMin}
              max={catalogMax}
              step={10}
              value={priceMin}
              onChange={(e) => handlePriceInput('min', Number(e.target.value))}
              aria-label="Minimum price"
              style={{ zIndex: thumbsAreClose ? 5 : 3 }}
              className="range-thumb absolute inset-x-2 top-0 h-4 -translate-y-1.5 cursor-pointer appearance-none bg-transparent opacity-0"
            />
            <input
              type="range"
              min={catalogMin}
              max={catalogMax}
              step={10}
              value={priceMax}
              onChange={(e) => handlePriceInput('max', Number(e.target.value))}
              aria-label="Maximum price"
              style={{ zIndex: 4 }}
              className="range-thumb absolute inset-x-2 top-0 h-4 -translate-y-1.5 cursor-pointer appearance-none bg-transparent opacity-0"
            />
          </div>

          {/* Min/Max numeric inputs */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Min</label>
              <div className="flex items-center gap-1 rounded-lg border border-[#E8D5A8] bg-white px-2 py-1.5">
                <span className="text-[11px] text-[#6B6B6B]">₹</span>
                <input
                  type="number"
                  value={priceMin}
                  min={catalogMin}
                  max={priceMax}
                  onChange={(e) => handlePriceInput('min', Number(e.target.value))}
                  className="w-full min-w-0 bg-transparent text-xs text-[#121212] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>
            <span className="mt-4 text-[#E8D5A8]">—</span>
            <div className="flex-1">
              <label className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Max</label>
              <div className="flex items-center gap-1 rounded-lg border border-[#E8D5A8] bg-white px-2 py-1.5">
                <span className="text-[11px] text-[#6B6B6B]">₹</span>
                <input
                  type="number"
                  value={priceMax}
                  min={priceMin}
                  max={catalogMax}
                  onChange={(e) => handlePriceInput('max', Number(e.target.value))}
                  className="w-full min-w-0 bg-transparent text-xs text-[#121212] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          {/* Popular price presets */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {pricePresets.map((preset) => {
              const isActive = priceMin === preset.min && priceMax === preset.max;
              return (
                <button
                  key={preset.label}
                  onClick={() => applyPricePreset(preset)}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors ${
                    isActive
                      ? 'border-[#F05A7E] bg-[#FCE8ED] text-[#F05A7E]'
                      : 'border-[#E8D5A8] bg-white text-[#6B6B6B] hover:border-[#C9972B] hover:text-[#121212]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </AccordionSection>

      {/* Customer Rating — on hold for a future release alongside the
          product-card rating display (see RATINGS_ENABLED in
          ProductCard.tsx); filters.ratings/handleToggle stay wired so this
          is a one-line flip to bring back. */}
      {RATINGS_ENABLED && (
      <AccordionSection title="Customer Rating" isOpen={openSections.rating} onToggle={() => toggleSection('rating')}>
        <div>
          {ratingOptions.map((opt) => (
            <CheckboxRow
              key={opt.id}
              label={opt.label}
              checked={filters.ratings.includes(opt.id)}
              onChange={() => handleToggle('ratings', opt.id)}
            />
          ))}
        </div>
      </AccordionSection>
      )}

      {/* Product Type — undertone / finish / skin type / coverage grouped together */}
      <AccordionSection
        title="Product Type"
        isOpen={openSections.productType}
        onToggle={() => toggleSection('productType')}
      >
        <div className="space-y-3.5">
          <div>
            <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#C9972B]">Undertone</p>
            {undertoneOptions.map((opt) => (
              <CheckboxRow
                key={opt.id}
                label={opt.label}
                checked={filters.undertones.includes(opt.id)}
                onChange={() => handleToggle('undertones', opt.id)}
              />
            ))}
          </div>

          {finishOptions.length > 0 && (
            <div className="border-t border-[#E8D5A8]/60 pt-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#C9972B]">Finish & Texture</p>
              {finishOptions.map((opt) => (
                <CheckboxRow
                  key={opt.id}
                  label={opt.label}
                  checked={filters.finishes.includes(opt.id)}
                  onChange={() => handleToggle('finishes', opt.id)}
                />
              ))}
            </div>
          )}

          {skinTypeOptions.length > 0 && (
            <div className="border-t border-[#E8D5A8]/60 pt-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#C9972B]">Skin Type</p>
              {skinTypeOptions.map((opt) => (
                <CheckboxRow
                  key={opt.id}
                  label={opt.label}
                  checked={filters.skinTypes.includes(opt.id)}
                  onChange={() => handleToggle('skinTypes', opt.id)}
                />
              ))}
            </div>
          )}

          {coverageOptions.length > 0 && (
            <div className="border-t border-[#E8D5A8]/60 pt-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#C9972B]">Coverage</p>
              {coverageOptions.map((opt) => (
                <CheckboxRow
                  key={opt.id}
                  label={opt.label}
                  checked={filters.coverages.includes(opt.id)}
                  onChange={() => handleToggle('coverages', opt.id)}
                />
              ))}
            </div>
          )}
        </div>
      </AccordionSection>

      {/* Shade / Color */}
      {shadeOptions.length > 0 && (
        <AccordionSection title="Shade / Color" isOpen={openSections.shade} onToggle={() => toggleSection('shade')}>
          <div className="flex flex-wrap gap-2.5 pt-1">
            {shadeOptions.map((shade) => {
              const isSelected = filters.shades.includes(shade.id);
              return (
                <button
                  key={shade.id}
                  onClick={() => handleToggle('shades', shade.id)}
                  title={shade.name}
                  aria-label={`Filter by shade ${shade.name}`}
                  className="group/shade relative flex flex-col items-center gap-1"
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
                      isSelected ? 'border-[#F05A7E] shadow-[0_0_0_2px_rgba(240,90,126,0.18)]' : 'border-[#0B0B0B]/10 hover:border-[#C9972B]'
                    }`}
                    style={{ backgroundColor: shade.hex }}
                  >
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 stroke-[3]"
                        style={{ color: isLightHex(shade.hex) ? '#0B0B0B' : '#FFFFFF' }}
                      />
                    )}
                  </span>
                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#0B0B0B] px-2 py-1 text-[9.5px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/shade:opacity-100 z-10">
                    {shade.name}
                  </span>
                </button>
              );
            })}
          </div>
        </AccordionSection>
      )}

      {/* Availability */}
      <AccordionSection
        title="Availability"
        isOpen={openSections.availability}
        onToggle={() => toggleSection('availability')}
      >
        <label className="flex cursor-pointer items-center justify-between py-1">
          <span className="text-xs font-semibold text-[#121212]">In Stock Only</span>
          <button
            type="button"
            role="switch"
            aria-checked={filters.inStockOnly}
            onClick={() => onFilterChange({ ...filters, inStockOnly: !filters.inStockOnly })}
            className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
              filters.inStockOnly ? 'bg-[#F05A7E]' : 'bg-[#E8D5A8]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                filters.inStockOnly ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </AccordionSection>

      {/* Discount */}
      <AccordionSection title="Discount" isOpen={openSections.discount} onToggle={() => toggleSection('discount')}>
        <div>
          {discountOptions.map((opt) => (
            <CheckboxRow
              key={opt.id}
              label={opt.label}
              checked={filters.discounts.includes(opt.id)}
              onChange={() => handleToggle('discounts', opt.id)}
            />
          ))}
        </div>
      </AccordionSection>
    </div>
  );

  const SidebarHeader: React.FC<{ onClose?: () => void }> = ({ onClose }) => (
    <div className="border-b border-[#E8D5A8] px-4 py-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-[#F05A7E]" />
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#121212]">Filters</h3>
          {activeFiltersCount > 0 && (
            <span className="rounded-full bg-[#F05A7E] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeFiltersCount > 0 && (
            <button
              onClick={onResetFilters}
              className="cursor-pointer text-[10.5px] font-bold uppercase tracking-wider text-[#F05A7E] hover:underline"
            >
              Clear All
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close filters"
              className="cursor-pointer rounded-full p-1 text-[#121212] transition-colors hover:bg-[#FCE8ED] hover:text-[#F05A7E]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-[#6B6B6B]">
        <strong className="font-semibold text-[#121212]">{totalFilteredCount}</strong> of {totalCount} products match
      </p>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar — position:sticky + align-self:flex-start applied
          directly to this element, which must be a DIRECT flex child of the
          sidebar/grid row in ShopPage (no wrapping <aside> in between). A
          sticky element's travel range is bounded by its own parent's box;
          an intermediate wrapper here would only ever be as tall as this
          element itself, giving it nowhere to "release" from — it would
          stay pinned indefinitely and could scroll straight through the
          footer. As a direct flex child, its parent is the row itself,
          which is exactly as tall as the taller product-grid column, so it
          naturally stops at the row's bottom instead. */}
      <aside
        className={`hidden lg:block w-[272px] shrink-0 self-start sticky ${SIDEBAR_TOP_OFFSET} max-h-[calc(100vh-8.5rem)] overflow-y-auto rounded-xl border border-[#E8D5A8] bg-white shadow-[0_2px_12px_rgba(11,11,11,0.04)]`}
      >
        <SidebarHeader />
        <div className="px-4">{filterContent}</div>
      </aside>

      {/* Mobile Bottom Sheet */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-50 bg-[#0B0B0B]/60 backdrop-blur-xs lg:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-[#E8D5A8] bg-white shadow-2xl lg:hidden"
            >
              <SidebarHeader onClose={onCloseMobile} />
              <div className="flex-1 overflow-y-auto px-4">{filterContent}</div>
              <div className="grid grid-cols-2 gap-3 border-t border-[#E8D5A8] bg-[#FAF9F6] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <button
                  onClick={onResetFilters}
                  className="cursor-pointer rounded-full border border-[#E8D5A8] bg-white py-3 text-xs font-bold uppercase tracking-wider text-[#121212] transition-colors hover:bg-[#FCE8ED]"
                >
                  Clear All
                </button>
                <button
                  onClick={onCloseMobile}
                  className="cursor-pointer rounded-full bg-[#F05A7E] py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-[#e0496c]"
                >
                  Apply ({totalFilteredCount})
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

// Rough perceived-brightness check so the shade-swatch checkmark stays legible
// against both very light and very dark hex fills.
function isLightHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
}
