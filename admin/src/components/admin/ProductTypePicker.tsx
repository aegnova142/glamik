/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { Check, Loader2, Plus, Search, X, AlertTriangle } from 'lucide-react';
import { ProductType } from '@glamirk/shared/types';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { normalizeTypeName, TYPE_NAME_MAX_LENGTH } from '@glamirk/shared/utils/productType';

interface ProductTypePickerProps {
  /** Currently assigned type id, if any. */
  value?: string;
  /** The product's legacy subCategory, used to show what an untyped product
   *  currently resolves to so the admin is not told "none" about a product
   *  that is in fact filtering perfectly well. */
  legacySubCategory?: string;
  onChange: (typeId: string | undefined, typeName: string | undefined) => void;
}

/**
 * Searchable product-type picker with inline creation.
 *
 * Creating a type from inside the product form is the point: the alternative
 * is leaving the half-filled product, going to another screen, making the
 * type, and coming back — which is how people end up typing a near-duplicate
 * instead ("Lip care", "Lip Care "). The create row is pre-filled with the
 * search text for the same reason.
 *
 * Duplicate names are refused by the server (a case-insensitive unique index),
 * and this shows the match BEFORE the request so the usual outcome is picking
 * the existing type rather than being told off for typing it.
 */
export const ProductTypePicker: React.FC<ProductTypePickerProps> = ({
  value,
  legacySubCategory,
  onChange,
}) => {
  const { productTypes, saveProductType } = useCMS();
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listboxId = useRef(`ptype-list-${Math.random().toString(36).slice(2, 8)}`).current;

  const selected = productTypes.find((t) => t.id === value);

  // An untyped product still resolves through its subCategory name, so show
  // which type that lands on rather than implying it is unassigned.
  const resolvedLegacy = useMemo(() => {
    if (selected || !legacySubCategory) return undefined;
    return productTypes.find((t) => normalizeTypeName(t.name) === normalizeTypeName(legacySubCategory));
  }, [selected, legacySubCategory, productTypes]);

  const query = search.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = query
      ? productTypes.filter((t) => t.name.toLowerCase().includes(query))
      : productTypes;
    // Active first, then alphabetical — a deactivated type is still
    // assignable (an admin may be preparing a relaunch) but should not be the
    // first thing offered.
    return [...list].sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)
    );
  }, [productTypes, query]);

  const exactExists = useMemo(
    () => productTypes.some((t) => normalizeTypeName(t.name) === normalizeTypeName(search)),
    [productTypes, search]
  );
  const canCreate = search.trim().length > 0 && !exactExists;

  const handleCreate = async () => {
    const name = search.trim();
    if (!name) return;
    setIsCreating(true);
    setError(null);
    const result = await saveProductType({ name, isActive: true });
    setIsCreating(false);
    if (!result.ok) {
      setError(result.error || 'Could not create this type.');
      return;
    }
    if (result.type) {
      onChange(result.type.id, result.type.name);
      setSearch('');
    }
  };

  return (
    <div>
      <label
        htmlFor={`${listboxId}-search`}
        className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1"
      >
        Product Type
      </label>

      {/* Current assignment, stated plainly before any searching happens. */}
      <div className="mb-2 flex items-center gap-2 text-[11px]">
        {selected ? (
          <>
            <span className="px-2 py-0.5 rounded bg-[#C9972B] text-[#0B0B0B] font-bold">{selected.name}</span>
            {!selected.isActive && (
              <span className="px-1.5 py-0.5 rounded bg-[#F05A7E]/20 text-[#F05A7E] font-bold uppercase text-[9px]">
                Paused
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(undefined, undefined)}
              className="text-[#6B6B6B] hover:text-[#F05A7E] cursor-pointer inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </>
        ) : resolvedLegacy ? (
          <span className="text-[#6B6B6B]">
            Currently filtering as{' '}
            <strong className="text-[#E8D5A8]">{resolvedLegacy.name}</strong> via its sub-category.
            Pick it below to pin it.
          </span>
        ) : (
          <span className="text-[#6B6B6B]">No type assigned — this product won't appear under any Shop type.</span>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6B6B6B]" />
        <input
          id={`${listboxId}-search`}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setError(null);
          }}
          maxLength={TYPE_NAME_MAX_LENGTH}
          placeholder="Search types, or type a new name…"
          className="w-full pl-8 pr-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]"
        />
      </div>

      <ul
        id={listboxId}
        role="listbox"
        aria-label="Product types"
        className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-[#E8D5A8]/20 divide-y divide-[#E8D5A8]/10"
      >
        {matches.length === 0 && (
          <li className="px-3 py-3 text-[11px] text-[#6B6B6B]">
            {productTypes.length === 0
              ? 'No product types yet — type a name above to create the first one.'
              : `No type matches "${search.trim()}".`}
          </li>
        )}
        {matches.map((type: ProductType) => {
          const isSelected = type.id === value;
          return (
            <li key={type.id}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(type.id, type.name)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#C9972B]/20 text-[#E3B84B] font-bold' : 'text-[#FAF9F6] hover:bg-[#E8D5A8]/10'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{type.name}</span>
                  {!type.isActive && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#F05A7E]/20 text-[#F05A7E] font-bold uppercase text-[9px]">
                      Paused
                    </span>
                  )}
                  {type.category && <span className="shrink-0 text-[10px] text-[#6B6B6B]">{type.category}</span>}
                </span>
                {isSelected && <Check className="shrink-0 w-3.5 h-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>

      {canCreate && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreating}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] disabled:opacity-60 cursor-pointer"
        >
          {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {isCreating ? 'Creating…' : `Create "${search.trim()}"`}
        </button>
      )}

      {exactExists && search.trim() && (
        <p className="mt-1.5 text-[10px] text-[#6B6B6B]">
          That type already exists — select it from the list above.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[10px] text-[#F05A7E]">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
          {error}
        </p>
      )}

      <p className="text-[10px] text-[#6B6B6B] mt-1.5">
        Drives Shop's category filter. Renaming a type later keeps this product attached to it.
      </p>
    </div>
  );
};
