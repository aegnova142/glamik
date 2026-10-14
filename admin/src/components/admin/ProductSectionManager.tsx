/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ProductSectionWithUsage } from '@glamirk/shared/types';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { TYPE_NAME_MAX_LENGTH, TYPE_DESCRIPTION_MAX_LENGTH } from '@glamirk/shared/utils/productType';

/**
 * Manage sections — the level above product types.
 *
 * Deliberately the same panel shape as ProductTypeManager: an admin who has
 * learned one has learned the other. The only visible difference is that a
 * section reports TWO usage numbers, because a section with no products but
 * types underneath is still load-bearing.
 */
export const ProductSectionManager: React.FC = () => {
  const { saveProductSection, deleteProductSection, reassignProductSection, productSections } = useCMS();

  const [rows, setRows] = useState<ProductSectionWithUsage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [reassigning, setReassigning] = useState<{ fromId: string; toId: string } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    const res = await apiFetch<{ sections: ProductSectionWithUsage[] }>('/api/admin/product-sections');
    if (res.status >= 400 || !res.data) {
      setLoadError(res.error || 'Could not load categories.');
      setRows([]);
      return;
    }
    setRows(res.data.sections);
  };

  // Identity, not length — see ProductTypeManager for why: assigning a product
  // changes a count here while leaving the number of sections alone.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSections]);

  const reassignTargets = useMemo(
    () => (rows || []).filter((s) => s.id !== reassigning?.fromId),
    [rows, reassigning]
  );

  const commitEdit = async (id: string) => {
    setBusyId(id);
    setRowError(null);
    const result = await saveProductSection({ id, name: draft.name, description: draft.description });
    setBusyId(null);
    if (!result.ok) {
      setRowError({ id, message: result.error || 'Could not save.' });
      return;
    }
    setEditingId(null);
    await load();
  };

  const togglePaused = async (section: ProductSectionWithUsage) => {
    setBusyId(section.id);
    setRowError(null);
    const result = await saveProductSection({ id: section.id, isActive: !section.isActive });
    setBusyId(null);
    if (!result.ok) setRowError({ id: section.id, message: result.error || 'Could not change status.' });
    else await load();
  };

  const handleDelete = async (section: ProductSectionWithUsage) => {
    setBusyId(section.id);
    setRowError(null);
    const result = await deleteProductSection(section.id);
    setBusyId(null);
    if (!result.ok) {
      setRowError({ id: section.id, message: result.error || 'Could not delete.' });
      if (section.productCount > 0 || section.typeCount > 0) {
        setReassigning({ fromId: section.id, toId: '' });
      }
      return;
    }
    await load();
  };

  const handleReassign = async (deleteAfter: boolean) => {
    if (!reassigning?.toId) return;
    setBusyId(reassigning.fromId);
    const result = await reassignProductSection(reassigning.fromId, reassigning.toId, deleteAfter);
    setBusyId(null);
    if (!result.ok) {
      setRowError({ id: reassigning.fromId, message: result.error || 'Could not reassign.' });
      return;
    }
    setReassigning(null);
    await load();
  };

  const handleCreate = async () => {
    setCreateError(null);
    const result = await saveProductSection({ name: newName, isActive: true });
    if (!result.ok) {
      setCreateError(result.error || 'Could not create this category.');
      return;
    }
    setNewName('');
    setIsCreateOpen(false);
    await load();
  };

  return (
    <section className="bg-[#171717] border border-[#E8D5A8]/20 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h3 className="text-sm font-bold text-[#E8D5A8] uppercase tracking-wider">Categories</h3>
          <p className="text-[11px] text-[#6B6B6B] mt-0.5">
            The top level — Makeup, Skin, Nails, or anything you add. Product types nest under these.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen((v) => !v)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> New Category
        </button>
      </div>

      {isCreateOpen && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            autoFocus
            value={newName}
            maxLength={TYPE_NAME_MAX_LENGTH}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. Fragrance"
            aria-label="New category name"
            className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="px-3 py-2 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] cursor-pointer"
          >
            Create
          </button>
        </div>
      )}
      {createError && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#F05A7E]">
          <AlertTriangle className="w-3 h-3" />
          {createError}
        </p>
      )}

      {rows === null && (
        <p className="mt-4 flex items-center gap-2 text-xs text-[#6B6B6B]" aria-live="polite">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading categories…
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-xs text-[#F05A7E]">
          <AlertTriangle className="w-3.5 h-3.5" /> {loadError}{' '}
          <button onClick={load} className="underline cursor-pointer">
            Retry
          </button>
        </p>
      )}
      {rows?.length === 0 && !loadError && (
        <p className="mt-4 text-xs text-[#6B6B6B]">No categories yet. Create one above.</p>
      )}

      <div className="mt-3 space-y-2">
        {(rows || []).map((section) => (
          <div key={section.id} className="rounded-lg border border-[#E8D5A8]/15 bg-[#0B0B0B] p-3">
            {editingId === section.id ? (
              <div className="space-y-2">
                <input
                  value={draft.name}
                  maxLength={TYPE_NAME_MAX_LENGTH}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  aria-label="Category name"
                  className="w-full px-3 py-2 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
                <input
                  value={draft.description}
                  maxLength={TYPE_DESCRIPTION_MAX_LENGTH}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Optional description"
                  aria-label="Description"
                  className="w-full px-3 py-2 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => commitEdit(section.id)}
                    disabled={busyId === section.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] disabled:opacity-60 cursor-pointer"
                  >
                    {busyId === section.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8D5A8]/30 text-xs text-[#E8D5A8] cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#FAF9F6]">{section.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        section.isActive ? 'bg-[#C9972B]/20 text-[#E3B84B]' : 'bg-[#F05A7E]/20 text-[#F05A7E]'
                      }`}
                    >
                      {section.isActive ? 'Active' : 'Paused'}
                    </span>
                    <span className="text-[10px] text-[#6B6B6B]">
                      {section.productCount} product{section.productCount === 1 ? '' : 's'} ·{' '}
                      {section.typeCount} type{section.typeCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {section.description && (
                    <p className="text-[10px] text-[#6B6B6B] mt-0.5 truncate">{section.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(section.id);
                      setRowError(null);
                      setDraft({ name: section.name, description: section.description });
                    }}
                    title="Rename or describe"
                    className="p-1.5 rounded text-[#E8D5A8] hover:bg-[#E8D5A8]/10 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePaused(section)}
                    disabled={busyId === section.id}
                    className="px-2 py-1 rounded border border-[#E8D5A8]/30 text-[10px] font-bold text-[#E8D5A8] hover:bg-[#E8D5A8]/10 disabled:opacity-60 cursor-pointer"
                  >
                    {section.isActive ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReassigning({ fromId: section.id, toId: '' })}
                    className="px-2 py-1 rounded border border-[#E8D5A8]/30 text-[10px] font-bold text-[#E8D5A8] hover:bg-[#E8D5A8]/10 cursor-pointer"
                  >
                    Reassign
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(section)}
                    disabled={busyId === section.id}
                    title={
                      section.productCount > 0 || section.typeCount > 0
                        ? 'Still in use — reassign first'
                        : 'Delete this category'
                    }
                    className="p-1.5 rounded text-[#F05A7E] hover:bg-[#F05A7E]/10 disabled:opacity-60 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {rowError?.id === section.id && (
              <p role="alert" className="mt-2 flex items-start gap-1.5 text-[10px] text-[#F05A7E]">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                {rowError.message}
              </p>
            )}

            {reassigning?.fromId === section.id && (
              <div className="mt-2 rounded-lg border border-[#E8D5A8]/20 bg-[#171717] p-2.5">
                <p className="text-[10px] text-[#6B6B6B] mb-2">
                  Move all {section.productCount} product{section.productCount === 1 ? '' : 's'} and{' '}
                  {section.typeCount} type{section.typeCount === 1 ? '' : 's'} from{' '}
                  <strong className="text-[#E8D5A8]">{section.name}</strong> to:
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={reassigning.toId}
                    onChange={(e) => setReassigning({ ...reassigning, toId: e.target.value })}
                    aria-label="Target category"
                    className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  >
                    <option value="">Choose a category…</option>
                    {reassignTargets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleReassign(false)}
                    disabled={!reassigning.toId || busyId === section.id}
                    className="px-3 py-2 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] disabled:opacity-50 cursor-pointer"
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReassign(true)}
                    disabled={!reassigning.toId || busyId === section.id}
                    className="px-3 py-2 rounded-lg border border-[#F05A7E]/50 text-[#F05A7E] text-xs font-bold hover:bg-[#F05A7E]/10 disabled:opacity-50 cursor-pointer"
                  >
                    Move &amp; Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setReassigning(null)}
                    className="px-3 py-2 rounded-lg border border-[#E8D5A8]/30 text-[#E8D5A8] text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
