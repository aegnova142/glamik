/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, X } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { normalizeSectionName, selectableSections } from '@glamirk/shared/utils/productSection';
import { TYPE_NAME_MAX_LENGTH } from '@glamirk/shared/utils/productType';

interface ProductSectionPickerProps {
  /** Currently assigned section id, if any. */
  value?: string;
  /** The product's legacy `category` name, so an unsectioned product shows
   *  what it currently resolves to rather than reading as unassigned. */
  legacyCategory?: string;
  onChange: (sectionId: string | undefined, sectionName: string | undefined) => void;
}

/**
 * Section picker with inline creation.
 *
 * Replaces a `<select>` hardcoded to Makeup / Skin / Nails. That dropdown sat
 * directly above a type picker an admin COULD extend, with no visible reason
 * why one was open and the other closed.
 *
 * A `<select>` with an "add new" row is awkward to build accessibly, so this
 * is a plain list plus a create button — the same shape as ProductTypePicker,
 * because they are the same kind of choice at two levels.
 */
export const ProductSectionPicker: React.FC<ProductSectionPickerProps> = ({
  value,
  legacyCategory,
  onChange,
}) => {
  const { productSections, saveProductSection } = useCMS();
  const [draft, setDraft] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const selected = productSections.find((s) => s.id === value);
  const options = useMemo(() => selectableSections(productSections), [productSections]);

  // An unsectioned product still resolves through its category name — show
  // which section that lands on instead of implying it has none.
  const resolvedLegacy = useMemo(() => {
    if (selected || !legacyCategory) return undefined;
    return productSections.find((s) => normalizeSectionName(s.name) === normalizeSectionName(legacyCategory));
  }, [selected, legacyCategory, productSections]);

  const exists = useMemo(
    () => productSections.some((s) => normalizeSectionName(s.name) === normalizeSectionName(draft)),
    [productSections, draft]
  );

  const handleCreate = async () => {
    const name = draft.trim();
    if (!name) return;
    setIsCreating(true);
    setError(null);
    const result = await saveProductSection({ name, isActive: true });
    setIsCreating(false);
    if (!result.ok) {
      setError(result.error || 'Could not create this section.');
      return;
    }
    if (result.section) {
      onChange(result.section.id, result.section.name);
      setDraft('');
      setIsAdding(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">
          Category
        </label>
        <button
          type="button"
          onClick={() => {
            setIsAdding((v) => !v);
            setError(null);
          }}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#C9972B] hover:text-[#E3B84B] cursor-pointer"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      {/* Current assignment, stated before anything else. */}
      <div className="mb-2 text-[11px]">
        {selected ? (
          <span className="inline-flex items-center gap-2">
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
          </span>
        ) : resolvedLegacy ? (
          <span className="text-[#6B6B6B]">
            Currently <strong className="text-[#E8D5A8]">{resolvedLegacy.name}</strong> via its category
            name. Pick it below to pin it.
          </span>
        ) : (
          <span className="text-[#6B6B6B]">No category assigned.</span>
        )}
      </div>

      <ul
        role="listbox"
        aria-label="Product category"
        className="max-h-36 overflow-y-auto rounded-lg border border-[#E8D5A8]/20 divide-y divide-[#E8D5A8]/10"
      >
        {options.length === 0 && (
          <li className="px-3 py-3 text-[11px] text-[#6B6B6B]">
            No categories yet — use “New” above to create the first one.
          </li>
        )}
        {options.map((section) => {
          const isSelected = section.id === value;
          return (
            <li key={section.id}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(section.id, section.name)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#C9972B]/20 text-[#E3B84B] font-bold' : 'text-[#FAF9F6] hover:bg-[#E8D5A8]/10'
                }`}
              >
                <span className="truncate">{section.name}</span>
                {isSelected && <Check className="shrink-0 w-3.5 h-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>

      {isAdding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={TYPE_NAME_MAX_LENGTH}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && !exists && handleCreate()}
            placeholder="e.g. Fragrance"
            aria-label="New category name"
            className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || !draft.trim() || exists}
            className="px-3 py-2 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] disabled:opacity-50 cursor-pointer"
          >
            {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
          </button>
        </div>
      )}

      {isAdding && exists && draft.trim() && (
        <p className="mt-1 text-[10px] text-[#6B6B6B]">That category already exists — pick it from the list.</p>
      )}

      {error && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[10px] text-[#F05A7E]">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
          {error}
        </p>
      )}
    </div>
  );
};
