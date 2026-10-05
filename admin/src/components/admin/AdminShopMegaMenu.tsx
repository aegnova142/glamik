// [Glamik CMS] Added 2026-10-03 — admin editor for the header Shop mega-menu
// (columns, items with swatches, promo card with image/video).
import React, { useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import {
  CMSShopMegaMenu,
  CMSShopMegaMenuColumn,
  CMSShopMegaMenuItem,
  CMSShopPromoBanner,
} from '@glamirk/shared/types';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { MediaUploadField } from './MediaUploadField';
import { Plus, Trash2, Save, Check, Eye, EyeOff, Image as ImageIcon, Film, ArrowRight } from 'lucide-react';

const inputCls = 'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]';
const labelCls = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

const DEFAULT_PROMO: CMSShopPromoBanner = {
  label: 'The Glamirk Atelier',
  title: 'Tailored for Indian undertones.',
  description: 'Precision shade matching for warm, neutral, cool, and olive complexions.',
  mediaType: 'image',
  mediaUrl: '',
  posterUrl: '',
  primaryCtaLabel: 'Shop Entire Catalog',
  primaryCtaUrl: '/shop',
  secondaryCtaLabel: 'Start Diagnostic',
  secondaryCtaUrl: '#find-my-shade',
  badge: '',
  isActive: true,
};

const DEFAULT_MENU: CMSShopMegaMenu = { enabled: true, columns: [], promo: DEFAULT_PROMO };

export const AdminShopMegaMenu: React.FC = () => {
  const { shopMegaMenu, saveShopMegaMenu } = useCMS();
  const [state, setState] = useState<CMSShopMegaMenu>(shopMegaMenu || DEFAULT_MENU);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSyncOnce(shopMegaMenu, setState);

  const setPromo = (patch: Partial<CMSShopPromoBanner>) =>
    setState((s) => ({ ...s, promo: { ...s.promo, ...patch } }));

  const updateColumn = (id: string, patch: Partial<CMSShopMegaMenuColumn>) =>
    setState((s) => ({ ...s, columns: s.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const updateItem = (colId: string, itemId: string, patch: Partial<CMSShopMegaMenuItem>) =>
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) =>
        c.id === colId ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : c
      ),
    }));

  const addColumn = () =>
    setState((s) => ({
      ...s,
      columns: [
        ...s.columns,
        {
          id: `col-${Date.now()}`,
          title: 'New Column',
          iconUrl: '',
          badge: '',
          badgeEnabled: false,
          viewAllLabel: 'Explore All',
          viewAllUrl: '/shop',
          isActive: true,
          sortOrder: s.columns.length,
          items: [],
        },
      ],
    }));

  const deleteColumn = (id: string) => {
    if (!window.confirm('Delete this column and its items?')) return;
    setState((s) => ({ ...s, columns: s.columns.filter((c) => c.id !== id) }));
  };

  const moveColumn = (index: number, dir: -1 | 1) => {
    const ni = index + dir;
    setState((s) => {
      if (ni < 0 || ni >= s.columns.length) return s;
      const arr = [...s.columns];
      [arr[index], arr[ni]] = [arr[ni], arr[index]];
      return { ...s, columns: arr.map((c, i) => ({ ...c, sortOrder: i })) };
    });
  };

  const addItem = (colId: string) =>
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) =>
        c.id === colId
          ? {
              ...c,
              items: [
                ...c.items,
                { id: `item-${Date.now()}`, name: 'New Item', url: '/shop', imageUrl: '', altText: '', badge: '', isActive: true, sortOrder: c.items.length },
              ],
            }
          : c
      ),
    }));

  const deleteItem = (colId: string, itemId: string) =>
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => (c.id === colId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c)),
    }));

  const moveItem = (colId: string, index: number, dir: -1 | 1) =>
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => {
        if (c.id !== colId) return c;
        const ni = index + dir;
        if (ni < 0 || ni >= c.items.length) return c;
        const arr = [...c.items];
        [arr[index], arr[ni]] = [arr[ni], arr[index]];
        return { ...c, items: arr.map((i, k) => ({ ...i, sortOrder: k })) };
      }),
    }));

  const handleSave = async () => {
    setError(null);
    if (state.columns.some((c) => !c.title.trim())) {
      setError('Every column needs a title.');
      return;
    }
    if (state.columns.some((c) => c.items.some((i) => !i.name.trim()))) {
      setError('Every item needs a name.');
      return;
    }
    const payload: CMSShopMegaMenu = {
      ...state,
      columns: state.columns.map((c, ci) => ({
        ...c,
        sortOrder: ci,
        items: c.items.map((i, ii) => ({ ...i, sortOrder: ii })),
      })),
    };
    setIsSaving(true);
    const ok = await saveShopMegaMenu(payload);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } else {
      setError('Save failed. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Shop Mega-Menu</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Header "Shop" dropdown — columns, item links with swatches, badges, and the promotional card (image or video). Changes appear live after saving.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 shrink-0"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      {error && <div className="p-3 bg-[#F05A7E]/10 border border-[#F05A7E]/30 rounded-lg text-xs text-[#F05A7E]">{error}</div>}

      {/* Enabled toggle */}
      <div className="p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#FAF9F6]">Mega-menu enabled</h3>
          <p className="text-[11px] text-[#6B6B6B]">When off, hovering "Shop" just navigates to the shop page without the dropdown.</p>
        </div>
        <button
          onClick={() => setState((s) => ({ ...s, enabled: !s.enabled }))}
          className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
            state.enabled ? 'bg-[#2E7D32]/20 border-[#2E7D32]/40 text-[#7BD389]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B]'
          }`}
        >
          {state.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {state.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* Columns */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Columns ({state.columns.length})</h3>
          <button onClick={addColumn} className="flex items-center gap-2 px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Column</span>
          </button>
        </div>

        {state.columns.map((col, ci) => (
          <div key={col.id} className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-[#0B0B0B] border border-[#E8D5A8]/30 overflow-hidden shrink-0 flex items-center justify-center">
                {col.iconUrl ? <img src={col.iconUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-[#6B6B6B]" />}
              </span>
              <input type="text" value={col.title} onChange={(e) => updateColumn(col.id, { title: e.target.value })} placeholder="Column title" className="flex-1 min-w-[160px] px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-sm font-serif text-[#FAF9F6]" />
              <div className="flex items-center gap-1">
                <button onClick={() => moveColumn(ci, -1)} disabled={ci === 0} className="px-2 py-1.5 text-xs bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↑</button>
                <button onClick={() => moveColumn(ci, 1)} disabled={ci === state.columns.length - 1} className="px-2 py-1.5 text-xs bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↓</button>
              </div>
              <button
                onClick={() => updateColumn(col.id, { isActive: !col.isActive })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${col.isActive ? 'bg-[#2E7D32]/20 border-[#2E7D32]/40 text-[#7BD389]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B]'}`}
              >
                {col.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {col.isActive ? 'Active' : 'Hidden'}
              </button>
              <button onClick={() => deleteColumn(col.id)} className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <MediaUploadField kind="image" label="Column Icon (small image)" value={col.iconUrl || ''} onChange={(url) => updateColumn(col.id, { iconUrl: url })} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Badge</label>
                <input type="text" value={col.badge || ''} onChange={(e) => updateColumn(col.id, { badge: e.target.value })} className={inputCls} />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => updateColumn(col.id, { badgeEnabled: !col.badgeEnabled })}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${col.badgeEnabled ? 'bg-[#C9972B] border-[#C9972B] text-[#0B0B0B]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B]'}`}
                >
                  Badge {col.badgeEnabled ? 'Shown' : 'Hidden'}
                </button>
              </div>
              <div>
                <label className={labelCls}>View-All Label</label>
                <input type="text" value={col.viewAllLabel} onChange={(e) => updateColumn(col.id, { viewAllLabel: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>View-All URL</label>
                <input type="text" value={col.viewAllUrl} onChange={(e) => updateColumn(col.id, { viewAllUrl: e.target.value })} placeholder="/shop/makeup" className={inputCls} />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2 pt-2 border-t border-[#E8D5A8]/15">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#FAF9F6] uppercase tracking-wider">Items ({col.items.length})</span>
                <button onClick={() => addItem(col.id)} className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0B0B0B] hover:bg-[#262626] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer">
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>

              {col.items.map((item, ii) => (
                <div key={item.id} className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-lg bg-[#171717] border border-[#E8D5A8]/20 overflow-hidden shrink-0 flex items-center justify-center">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-3.5 h-3.5 text-[#6B6B6B]" />}
                    </span>
                    <input type="text" value={item.name} onChange={(e) => updateItem(col.id, item.id, { name: e.target.value })} placeholder="Item name" className="flex-1 px-3 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]" />
                    <button onClick={() => moveItem(col.id, ii, -1)} disabled={ii === 0} className="px-2 py-1 text-xs bg-[#171717] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↑</button>
                    <button onClick={() => moveItem(col.id, ii, 1)} disabled={ii === col.items.length - 1} className="px-2 py-1 text-xs bg-[#171717] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↓</button>
                    <button
                      onClick={() => updateItem(col.id, item.id, { isActive: !item.isActive })}
                      title={item.isActive ? 'Active' : 'Hidden'}
                      className={`p-1.5 rounded border cursor-pointer ${item.isActive ? 'border-[#2E7D32]/40 text-[#7BD389]' : 'border-[#E8D5A8]/30 text-[#6B6B6B]'}`}
                    >
                      {item.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => deleteItem(col.id, item.id)} className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input type="text" value={item.subtitle || ''} onChange={(e) => updateItem(col.id, item.id, { subtitle: e.target.value })} placeholder="Subtitle (optional)" className="px-3 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]" />
                    <input type="text" value={item.url} onChange={(e) => updateItem(col.id, item.id, { url: e.target.value })} placeholder="/shop/makeup/lips" className="px-3 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]" />
                    <input type="text" value={item.badge || ''} onChange={(e) => updateItem(col.id, item.id, { badge: e.target.value })} placeholder="Badge (e.g. Bestseller)" className="px-3 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]" />
                  </div>
                  <MediaUploadField kind="image" label="Item Image / Swatch" value={item.imageUrl || ''} onChange={(url) => updateItem(col.id, item.id, { imageUrl: url })} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Promo banner */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Promotional Banner</h3>
          <button
            onClick={() => setPromo({ isActive: !state.promo.isActive })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${state.promo.isActive ? 'bg-[#2E7D32]/20 border-[#2E7D32]/40 text-[#7BD389]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B]'}`}
          >
            {state.promo.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {state.promo.isActive ? 'Active' : 'Hidden'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Small Label</label>
            <input type="text" value={state.promo.label} onChange={(e) => setPromo({ label: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Heading</label>
            <input type="text" value={state.promo.title} onChange={(e) => setPromo({ title: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea value={state.promo.description} onChange={(e) => setPromo({ description: e.target.value })} rows={2} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Media Type</label>
          <div className="flex gap-2 max-w-xs">
            {(['image', 'video'] as const).map((mt) => (
              <button
                key={mt}
                onClick={() => setPromo({ mediaType: mt })}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${state.promo.mediaType === mt ? 'bg-[#C9972B] border-[#C9972B] text-[#0B0B0B]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#FAF9F6] hover:border-[#C9972B]'}`}
              >
                {mt === 'video' ? <Film className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                {mt === 'video' ? 'Video' : 'Image'}
              </button>
            ))}
          </div>
        </div>

        <MediaUploadField kind={state.promo.mediaType} label={state.promo.mediaType === 'video' ? 'Promo Video' : 'Promo Image'} value={state.promo.mediaUrl} onChange={(url) => setPromo({ mediaUrl: url })} />
        {state.promo.mediaType === 'video' && (
          <MediaUploadField kind="image" label="Video Poster" value={state.promo.posterUrl || ''} onChange={(url) => setPromo({ posterUrl: url })} />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Primary Button Label</label>
            <input type="text" value={state.promo.primaryCtaLabel} onChange={(e) => setPromo({ primaryCtaLabel: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Primary Button URL</label>
            <input type="text" value={state.promo.primaryCtaUrl} onChange={(e) => setPromo({ primaryCtaUrl: e.target.value })} placeholder="/shop" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Secondary Button Label</label>
            <input type="text" value={state.promo.secondaryCtaLabel} onChange={(e) => setPromo({ secondaryCtaLabel: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Secondary Button URL</label>
            <input type="text" value={state.promo.secondaryCtaUrl} onChange={(e) => setPromo({ secondaryCtaUrl: e.target.value })} placeholder="#find-my-shade" className={inputCls} />
          </div>
        </div>

        {/* Live preview */}
        <div className="pt-3 border-t border-[#E8D5A8]/15">
          <span className="text-[10px] text-[#6B6B6B] uppercase tracking-wider">Live Preview</span>
          <div className="mt-2 relative overflow-hidden rounded-2xl border border-[#F3D9E0] bg-gradient-to-br from-[#FDE7EE] via-[#FBD9E4] to-[#F6C6D5] p-5 max-w-sm">
            {state.promo.mediaUrl && (
              <div className="pointer-events-none absolute -right-2 bottom-0 top-8 w-1/2">
                {state.promo.mediaType === 'video' ? (
                  <video src={state.promo.mediaUrl} poster={state.promo.posterUrl || undefined} muted loop autoPlay playsInline className="w-full h-full object-contain object-bottom" />
                ) : (
                  <img src={state.promo.mediaUrl} alt="" className="w-full h-full object-contain object-bottom" />
                )}
              </div>
            )}
            <div className="relative max-w-[62%]">
              <span className="text-[9px] tracking-[0.18em] uppercase text-[#C23B63] font-bold">{state.promo.label}</span>
              <h3 className="mt-1 font-serif text-lg font-bold text-[#2B1016] leading-snug">{state.promo.title}</h3>
              <p className="mt-1 text-[11px] text-[#6B4A52]">{state.promo.description}</p>
            </div>
            <div className="relative mt-4 space-y-2 max-w-[80%]">
              <div className="py-2 bg-[#E0265F] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5">
                {state.promo.primaryCtaLabel} <ArrowRight className="w-3 h-3" />
              </div>
              <div className="py-2 bg-white/90 text-[#2B1016] text-[10px] font-bold uppercase tracking-wider rounded-lg text-center">{state.promo.secondaryCtaLabel}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
