/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ProductTypeWithUsage } from '@glamirk/shared/types';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { TYPE_NAME_MAX_LENGTH, TYPE_DESCRIPTION_MAX_LENGTH } from '@glamirk/shared/utils/productType';


/**
 * Manage product types: create, rename, describe, pause, reassign, delete.
 *
 * Lives inside Categories & Taxonomy rather than as a new nav entry, because
 * "what kinds of product do we sell" is the same question that screen already
 * answers — a separate screen would be a second taxonomy system to keep in
 * your head.
 *
 * Usage counts come from a dedicated admin endpoint rather than the public
 * content payload: the public one carries only the types, and counting here
 * would mean this screen quietly disagreeing with the server about what is
 * safe to delete.
 */
export const ProductTypeManager: React.FC = () => {
  const { saveProductType, deleteProductType, reassignProductType, productTypes, productSections } = useCMS();

  const [rows, setRows] = useState<ProductTypeWithUsage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; category: string }>({
    name: '',
    description: '',
    category: '',
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [reassigning, setReassigning] = useState<{ fromId: string; toId: string } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    const res = await apiFetch<{ types: ProductTypeWithUsage[] }>('/api/admin/product-types');
    if (res.status >= 400 || !res.data) {
      setLoadError(res.error || 'Could not load product types.');
      setRows([]);
      return;
    }
    setRows(res.data.types);
  };

  // Keyed on the list IDENTITY, not its length.
  //
  // Every mutation in CMSContext re-reads the public content, which replaces
  // this array — so depending on identity catches the changes a length check
  // cannot: a rename (same count), and, more importantly, assigning a product
  // to a type from the product form. That changes productCount here while
  // leaving the number of types alone, and the counts are exactly what the
  // delete/deactivate decisions below are made from. Stale ones would offer a
  // "0 products" delete for a type that just gained one.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productTypes]);

  const reassignTargets = useMemo(
    () => (rows || []).filter((t) => t.id !== reassigning?.fromId),
    [rows, reassigning]
  );

  const beginEdit = (type: ProductTypeWithUsage) => {
    setEditingId(type.id);
    setRowError(null);
    setDraft({ name: type.name, description: type.description, category: type.category ?? '' });
  };

  const commitEdit = async (id: string) => {
    setBusyId(id);
    setRowError(null);
    const result = await saveProductType({
      id,
      name: draft.name,
      description: draft.description,
      category: (draft.category || null) as any,
    });
    setBusyId(null);
    if (!result.ok) {
      setRowError({ id, message: result.error || 'Could not save.' });
      return;
    }
    setEditingId(null);
    await load();
  };

  const togglePaused = async (type: ProductTypeWithUsage) => {
    setBusyId(type.id);
    setRowError(null);
    const result = await saveProductType({ id: type.id, isActive: !type.isActive });
    setBusyId(null);
    if (!result.ok) setRowError({ id: type.id, message: result.error || 'Could not change status.' });
    else await load();
  };

  const handleDelete = async (type: ProductTypeWithUsage) => {
    setBusyId(type.id);
    setRowError(null);
    const result = await deleteProductType(type.id);
    setBusyId(null);
    if (!result.ok) {
      setRowError({ id: type.id, message: result.error || 'Could not delete.' });
      // The refusal means products still point at it; open the reassign row so
      // the next step is in front of them instead of in the message.
      if (type.productCount > 0) setReassigning({ fromId: type.id, toId: '' });
      return;
    }
    await load();
  };

  const handleReassign = async (deleteAfter: boolean) => {
    if (!reassigning?.toId) return;
    setBusyId(reassigning.fromId);
    const result = await reassignProductType(reassigning.fromId, reassigning.toId, deleteAfter);
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
    const result = await saveProductType({ name: newName, isActive: true });
    if (!result.ok) {
      setCreateError(result.error || 'Could not create this type.');
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
          <h3 className="text-sm font-bold text-[#E8D5A8] uppercase tracking-wider">Product Types</h3>
          <p className="text-[11px] text-[#6B6B6B] mt-0.5">
            Drives Shop's category filter. Active types with at least one product appear to customers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen((v) => !v)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> New Type
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
            placeholder="e.g. Lip Care"
            aria-label="New product type name"
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

      {/* Loading / error / empty — each stated, never a blank panel. */}
      {rows === null && (
        <p className="mt-4 flex items-center gap-2 text-xs text-[#6B6B6B]" aria-live="polite">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading product types…
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
        <p className="mt-4 text-xs text-[#6B6B6B]">
          No product types yet. Create one above, or add one while editing a product.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {(rows || []).map((type) => (
          <div key={type.id} className="rounded-lg border border-[#E8D5A8]/15 bg-[#0B0B0B] p-3">
            {editingId === type.id ? (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={draft.name}
                    maxLength={TYPE_NAME_MAX_LENGTH}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    aria-label="Type name"
                    className="flex-1 px-3 py-2 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    aria-label="Section"
                    className="px-3 py-2 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  >
                    <option value="">No section</option>
                    {/* Sections are rows now (migration 022), so this offers
                        whatever the admin has created rather than a fixed trio. */}
                    {productSections
                      .filter((sec) => sec.isActive || sec.name === draft.category)
                      .map((sec) => (
                        <option key={sec.id} value={sec.name}>
                          {sec.name}
                        </option>
                      ))}
                  </select>
                </div>
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
                    onClick={() => commitEdit(type.id)}
                    disabled={busyId === type.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] disabled:opacity-60 cursor-pointer"
                  >
                    {busyId === type.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
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
                    <span className="text-xs font-bold text-[#FAF9F6]">{type.name}</span>
                    {type.category && (
                      <span className="px-1.5 py-0.5 rounded bg-[#E8D5A8]/10 text-[#E8D5A8] text-[9px] font-bold uppercase">
                        {type.category}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        type.isActive ? 'bg-[#C9972B]/20 text-[#E3B84B]' : 'bg-[#F05A7E]/20 text-[#F05A7E]'
                      }`}
                    >
                      {type.isActive ? 'Active' : 'Paused'}
                    </span>
                    <span className="text-[10px] text-[#6B6B6B]">
                      {type.productCount} product{type.productCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {type.description && (
                    <p className="text-[10px] text-[#6B6B6B] mt-0.5 truncate">{type.description}</p>
                  )}
                  {type.isActive && type.productCount === 0 && (
                    <p className="text-[10px] text-[#6B6B6B] mt-0.5">
                      Hidden from Shop until a product uses it.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => beginEdit(type)}
                    title="Rename or describe"
                    className="p-1.5 rounded text-[#E8D5A8] hover:bg-[#E8D5A8]/10 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePaused(type)}
                    disabled={busyId === type.id}
                    className="px-2 py-1 rounded border border-[#E8D5A8]/30 text-[10px] font-bold text-[#E8D5A8] hover:bg-[#E8D5A8]/10 disabled:opacity-60 cursor-pointer"
                  >
                    {type.isActive ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReassigning({ fromId: type.id, toId: '' })}
                    className="px-2 py-1 rounded border border-[#E8D5A8]/30 text-[10px] font-bold text-[#E8D5A8] hover:bg-[#E8D5A8]/10 cursor-pointer"
                  >
                    Reassign
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(type)}
                    disabled={busyId === type.id}
                    title={
                      type.productCount > 0
                        ? `${type.productCount} product(s) still use this — reassign them first`
                        : 'Delete this type'
                    }
                    className="p-1.5 rounded text-[#F05A7E] hover:bg-[#F05A7E]/10 disabled:opacity-60 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {rowError?.id === type.id && (
              <p role="alert" className="mt-2 flex items-start gap-1.5 text-[10px] text-[#F05A7E]">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                {rowError.message}
              </p>
            )}

            {reassigning?.fromId === type.id && (
              <div className="mt-2 rounded-lg border border-[#E8D5A8]/20 bg-[#171717] p-2.5">
                <p className="text-[10px] text-[#6B6B6B] mb-2">
                  Move all {type.productCount} product{type.productCount === 1 ? '' : 's'} from{' '}
                  <strong className="text-[#E8D5A8]">{type.name}</strong> to:
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={reassigning.toId}
                    onChange={(e) => setReassigning({ ...reassigning, toId: e.target.value })}
                    aria-label="Target product type"
                    className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  >
                    <option value="">Choose a type…</option>
                    {reassignTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleReassign(false)}
                    disabled={!reassigning.toId || busyId === type.id}
                    className="px-3 py-2 rounded-lg bg-[#C9972B] text-[#0B0B0B] text-xs font-bold hover:bg-[#E3B84B] disabled:opacity-50 cursor-pointer"
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReassign(true)}
                    disabled={!reassigning.toId || busyId === type.id}
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
