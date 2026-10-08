import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Check, GripVertical, Eye, EyeOff, ImageOff, Loader2, Monitor, Smartphone, AlertTriangle } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSHomeBanner, CMSHomeBannerConfig, CMSHomeBannerTargetType } from '@glamirk/shared/types';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';
import {
  DEFAULT_HOME_BANNER_INTERVAL_MS,
  MAX_HOME_BANNERS,
  isHomeBannerLive,
  validateHomeBannerConfig,
} from '@glamirk/shared/utils/homeBanners';
import { useDragReorder } from '../../hooks/useDragReorder';
import { useFileUpload } from '../../hooks/useFileUpload';

/** Must match the frames in the storefront's HomeBannerCarousel. */
const SLOTS = {
  desktopImage: { label: 'Desktop', icon: Monitor, ratio: 8 / 3, size: '1920 × 720 px (8:3)', frame: 'aspect-[8/3]' },
  mobileImage: { label: 'Mobile', icon: Smartphone, ratio: 4 / 5, size: '1080 × 1350 px (4:5)', frame: 'aspect-[4/5] max-w-[180px]' },
} as const;
type Slot = keyof typeof SLOTS;
/** Beyond this the storefront's object-cover crops visibly. */
const RATIO_TOLERANCE = 0.1;

const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

const statusOf = (b: CMSHomeBanner) => {
  if (!b.desktopImage) return { label: 'Needs desktop image', cls: 'text-[#E3B84B] border-[#E3B84B]/40' };
  if (b.isActive === false) return { label: 'Hidden', cls: 'text-[#6B6B6B] border-[#E8D5A8]/30' };
  if (isHomeBannerLive(b)) return { label: 'Live', cls: 'text-[#4ADE80] border-[#4ADE80]/40' };
  if (b.startDate && Date.parse(b.startDate) > Date.now()) return { label: 'Scheduled', cls: 'text-[#60A5FA] border-[#60A5FA]/40' };
  return { label: 'Expired', cls: 'text-[#6B6B6B] border-[#E8D5A8]/30' };
};

export const AdminHomeBanners: React.FC = () => {
  const { fetchFullAdminState, saveHomeBanners, products, categories } = useCMS();
  const [state, setState] = useState<CMSHomeBannerConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  // Ratio warnings keyed by `${bannerId}:${slot}`, computed from the loaded preview image.
  const [ratioWarnings, setRatioWarnings] = useState<Record<string, string>>({});

  // The public payload only carries live banners, so editing from it would
  // silently drop hidden/scheduled ones on save. Load the full set instead.
  useEffect(() => {
    fetchFullAdminState().then((full) => {
      setState(full?.homeBanners || { banners: [], intervalMs: DEFAULT_HOME_BANNER_INTERVAL_MS });
    });
  }, []);

  const { upload, isUploading, error: uploadError } = useFileUpload({
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    maxSizeBytes: 20 * 1024 * 1024,
    typeErrorMessage: 'Please choose a JPG, PNG, WebP or AVIF image.',
  });

  const banners = state?.banners || [];
  const setBanners = (next: CMSHomeBanner[]) => setState((prev) => ({ ...(prev || {}), banners: next }));
  const { dragIndex, setDragIndex, handleDrop } = useDragReorder<CMSHomeBanner>(banners, setBanners);

  if (!state) {
    return (
      <div className="flex items-center gap-2 p-6 text-xs text-[#6B6B6B]">
        <Loader2 className="h-4 w-4 animate-spin text-[#F05A7E]" /> Loading banners…
      </div>
    );
  }

  // Functional update keyed by id: an upload resolves seconds after it starts,
  // and must not overwrite edits (or a reorder) made in the meantime.
  const updateBanner = (id: string, updates: Partial<CMSHomeBanner>) => {
    setState((prev) => prev && { ...prev, banners: prev.banners.map((b) => (b.id === id ? { ...b, ...updates } : b)) });
  };

  const addBanner = () => {
    setBanners([
      ...banners,
      { id: `hb-${Date.now()}`, name: `Banner ${banners.length + 1}`, desktopImage: '', targetType: 'none', isActive: true },
    ]);
  };

  const deleteBanner = (idx: number) => {
    if (!window.confirm('Delete this banner? To hide it temporarily, switch it to Hidden instead.')) return;
    setBanners(banners.filter((_, i) => i !== idx));
  };

  const handleUpload = async (id: string, slot: Slot, file: File | undefined) => {
    setUploadTarget(`${id}:${slot}`);
    const item = await upload(file);
    setUploadTarget(null);
    if (item) updateBanner(id, { [slot]: item.url });
  };

  const checkRatio = (key: string, slot: Slot, img: HTMLImageElement) => {
    const actual = img.naturalWidth / img.naturalHeight;
    const off = Math.abs(actual - SLOTS[slot].ratio) / SLOTS[slot].ratio > RATIO_TOLERANCE;
    setRatioWarnings((prev) => {
      const next = { ...prev };
      if (off) next[key] = `This image is ${img.naturalWidth}×${img.naturalHeight}. Recommended ${SLOTS[slot].size} — edges will be cropped.`;
      else delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    // Same validator the server runs, so the admin sees problems before a round-trip.
    const errors = validateHomeBannerConfig(state);
    if (errors.length) {
      setSaveError(errors.join(' · '));
      return;
    }
    setIsSaving(true);
    const err = await saveHomeBanners(state);
    setIsSaving(false);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const inputClass =
    'w-full px-3 py-2 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none';
  const labelClass = 'block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';
  const atLimit = banners.length >= MAX_HOME_BANNERS;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E8D5A8]/20">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl text-[#FAF9F6]">Homepage Banner Carousel</h2>
          <p className="text-xs text-[#6B6B6B] mt-1 max-w-2xl">
            Large clickable promotional banners shown directly above the homepage hero. Upload a wide creative for
            desktop and a tall one for mobile. With no live banners, the section disappears and the hero moves up.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || isUploading}
          type="button"
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#F05A7E] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-[0_4px_14px_rgba(240,90,126,0.3)] disabled:opacity-50"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved Live!' : isSaving ? 'Saving...' : 'Save & Publish Live'}</span>
        </button>
      </div>

      {saveError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#F05A7E]/10 border border-[#F05A7E]/40 text-xs text-[#F05A7E]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <label className={labelClass}>Auto-Slide Interval</label>
          <select
            value={String((state.intervalMs ?? DEFAULT_HOME_BANNER_INTERVAL_MS) / 1000)}
            onChange={(e) => setState({ ...state, intervalMs: Number(e.target.value) * 1000 })}
            className="w-44 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
          >
            {['4', '5', '6', '8'].map((s) => (
              <option key={s} value={s}>
                {s} seconds{s === '5' ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={addBanner}
          disabled={atLimit}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0B0B0B] text-[#FAF9F6] border border-[#E8D5A8]/30 hover:border-[#F05A7E]/60 cursor-pointer disabled:cursor-not-allowed disabled:text-[#6B6B6B]"
        >
          <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
          <span>{atLimit ? `Limit reached (${MAX_HOME_BANNERS})` : 'Add Banner'}</span>
        </button>
      </div>

      {uploadError && <p className="text-xs text-[#F05A7E]">{uploadError}</p>}

      {banners.length === 0 && (
        <div className="p-8 text-center text-xs text-[#6B6B6B] bg-[#171717] border border-[#E8D5A8]/20 rounded-2xl">
          No banners yet. The homepage currently starts with the hero section.
        </div>
      )}

      <div className="space-y-4">
        {banners.map((banner, idx) => {
          const status = statusOf(banner);
          return (
            <div
              key={banner.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className={`p-5 rounded-2xl bg-[#171717] border space-y-4 transition-colors ${
                dragIndex === idx ? 'border-[#F05A7E]/60 opacity-60' : 'border-[#E8D5A8]/25'
              }`}
            >
              {/* Header row */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragEnd={() => setDragIndex(null)}
                  title="Drag to reorder"
                  className="inline-flex cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-4 h-4 text-[#6B6B6B]" />
                </span>
                <span className="text-[11px] font-bold text-[#E3B84B] uppercase tracking-wider">#{idx + 1}</span>
                <input
                  type="text"
                  value={banner.name}
                  onChange={(e) => updateBanner(banner.id, { name: e.target.value })}
                  placeholder="Banner name (internal)"
                  className={`${inputClass} flex-1 min-w-[160px]`}
                />
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
                <button
                  type="button"
                  onClick={() => updateBanner(banner.id, { isActive: banner.isActive === false })}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer border ${
                    banner.isActive === false
                      ? 'bg-[#0B0B0B] text-[#6B6B6B] border-[#E8D5A8]/30'
                      : 'bg-[#F05A7E]/15 text-[#F05A7E] border-[#F05A7E]/40'
                  }`}
                >
                  {banner.isActive === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {banner.isActive === false ? 'Hidden' : 'Active'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteBanner(idx)}
                  title="Delete banner"
                  className="p-1.5 rounded-lg border border-[#E8D5A8]/30 text-[#6B6B6B] hover:text-[#F05A7E] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Images — each preview uses the exact frame the storefront crops to */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                {(Object.keys(SLOTS) as Slot[]).map((slot) => {
                  const cfg = SLOTS[slot];
                  const key = `${banner.id}:${slot}`;
                  const url = banner[slot];
                  const Icon = cfg.icon;
                  return (
                    <div key={slot} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={labelClass + ' !mb-0 flex items-center gap-1.5'}>
                          <Icon className="w-3.5 h-3.5" /> {cfg.label} {slot === 'desktopImage' ? '(required)' : ''}
                        </span>
                        <span className="text-[10px] text-[#6B6B6B]">{cfg.size}</span>
                      </div>
                      <div className={`${cfg.frame} w-full rounded-xl overflow-hidden border border-[#E8D5A8]/20 bg-[#0B0B0B] flex items-center justify-center`}>
                        {url ? (
                          <img
                            src={cloudinaryImageUrl(url, 'tile')}
                            alt=""
                            onLoad={(e) => checkRatio(key, slot, e.currentTarget)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-[10px] text-[#6B6B6B] p-2 text-center">
                            <ImageOff className="w-5 h-5" />
                            {slot === 'mobileImage' ? 'Uses desktop image' : 'No image'}
                          </div>
                        )}
                      </div>
                      {ratioWarnings[key] && (
                        <p className="text-[10px] text-[#E3B84B] max-w-[360px]">{ratioWarnings[key]}</p>
                      )}
                      {slot === 'mobileImage' && !url && banner.desktopImage && (
                        <p className="text-[10px] text-[#E3B84B] max-w-[180px]">Add a mobile image — without one, phones show the wide desktop banner.</p>
                      )}
                      <div className="flex gap-2">
                        <label className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-[#0B0B0B] hover:border-[#F05A7E]/60 border border-[#E8D5A8]/30 rounded-lg text-[10px] font-semibold text-[#FAF9F6] cursor-pointer">
                          {uploadTarget === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : url ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              handleUpload(banner.id, slot, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {url && slot === 'mobileImage' && (
                          <button
                            type="button"
                            onClick={() => updateBanner(banner.id, { mobileImage: undefined })}
                            className="px-2.5 py-1.5 border border-[#E8D5A8]/30 rounded-lg text-[10px] text-[#6B6B6B] hover:text-[#F05A7E] cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Destination + details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className={labelClass}>Click destination</label>
                  <select
                    value={banner.targetType}
                    onChange={(e) =>
                      updateBanner(banner.id, { targetType: e.target.value as CMSHomeBannerTargetType, targetId: undefined, targetUrl: undefined })
                    }
                    className={inputClass}
                  >
                    <option value="none">No link</option>
                    <option value="product">Product</option>
                    <option value="category">Category</option>
                    <option value="url">Custom link</option>
                  </select>
                </div>
                <div>
                  {banner.targetType === 'product' && (
                    <>
                      <label className={labelClass}>Product</label>
                      <select value={banner.targetId || ''} onChange={(e) => updateBanner(banner.id, { targetId: e.target.value || undefined })} className={inputClass}>
                        <option value="">Choose a product…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </>
                  )}
                  {banner.targetType === 'category' && (
                    <>
                      <label className={labelClass}>Category</label>
                      <select value={banner.targetId || ''} onChange={(e) => updateBanner(banner.id, { targetId: e.target.value || undefined })} className={inputClass}>
                        <option value="">Choose a category…</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </>
                  )}
                  {banner.targetType === 'url' && (
                    <>
                      <label className={labelClass}>Link</label>
                      <input
                        type="text"
                        value={banner.targetUrl || ''}
                        onChange={(e) => updateBanner(banner.id, { targetUrl: e.target.value || undefined })}
                        placeholder="/campaign/diwali or https://…"
                        className={inputClass}
                      />
                    </>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Show from (optional)</label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(banner.startDate)}
                    onChange={(e) => updateBanner(banner.id, { startDate: fromLocalInput(e.target.value) })}
                    className={inputClass + ' [color-scheme:dark]'}
                  />
                </div>
                <div>
                  <label className={labelClass}>Show until (optional)</label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(banner.endDate)}
                    onChange={(e) => updateBanner(banner.id, { endDate: fromLocalInput(e.target.value) })}
                    className={inputClass + ' [color-scheme:dark]'}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className={labelClass}>Alt text (describe the banner for screen readers & SEO)</label>
                  <input
                    type="text"
                    value={banner.altText || ''}
                    onChange={(e) => updateBanner(banner.id, { altText: e.target.value })}
                    placeholder="e.g. Festive Glow Sale — up to 30% off matte lipsticks"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
