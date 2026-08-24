import React, { useState } from 'react';
import { Plus, Trash2, Save, Check, GripVertical, Eye, EyeOff, Link2, ImageOff, Loader2 } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { CMSPromoBannerConfig, CMSPromoBanner } from '../../types';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { useDragReorder } from '../../hooks/useDragReorder';
import { useFileUpload } from '../../hooks/useFileUpload';

const MAX_BANNERS = 15;

const DEFAULT_CONFIG: CMSPromoBannerConfig = { enabled: false, banners: [], intervalMs: 4000 };

export const AdminPromoBanners: React.FC = () => {
  const { promoBanners, savePromoBanners } = useCMS();
  const [state, setState] = useState<CMSPromoBannerConfig>(promoBanners || DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // null while adding a brand-new banner; a banner index while replacing that slot's image.
  const [replaceTarget, setReplaceTarget] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useSyncOnce(promoBanners, setState);

  const { upload, isUploading, error: uploadError } = useFileUpload({
    acceptedTypes: ['image/'],
    maxSizeBytes: 8 * 1024 * 1024,
    typeErrorMessage: 'Please choose an image file (JPG, PNG, or WebP).',
  });

  const banners = state.banners || [];

  const updateField = <K extends keyof CMSPromoBannerConfig>(field: K, value: CMSPromoBannerConfig[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await savePromoBanners(state);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleUpdateBanner = (idx: number, updates: Partial<CMSPromoBanner>) => {
    const updated = [...banners];
    updated[idx] = { ...updated[idx], ...updates };
    updateField('banners', updated);
  };

  const handleDeleteBanner = (idx: number) => {
    if (!window.confirm('Delete this promotional banner?')) return;
    updateField('banners', banners.filter((_, i) => i !== idx));
  };

  const { dragIndex, setDragIndex, handleDrop: handleBannerDrop } = useDragReorder<CMSPromoBanner>(
    banners,
    (next) => updateField('banners', next)
  );

  const handleAddFile = async (file: File | undefined) => {
    setIsAdding(true);
    const mediaItem = await upload(file);
    setIsAdding(false);
    if (mediaItem) {
      updateField('banners', [...banners, { id: `promo-${Date.now()}`, image: mediaItem.url, isActive: true }]);
    }
  };

  const handleReplaceFile = async (idx: number, file: File | undefined) => {
    setReplaceTarget(idx);
    const mediaItem = await upload(file);
    setReplaceTarget(null);
    if (mediaItem) {
      handleUpdateBanner(idx, { image: mediaItem.url });
    }
  };

  const intervalSeconds = ((state.intervalMs ?? 4000) / 1000).toString();
  const atLimit = banners.length >= MAX_BANNERS;

  const inputClass =
    'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none';
  const labelClass = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

  return (
    <div className="space-y-6">
      {/* Header with Save */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E8D5A8]/20">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl text-[#FAF9F6]">Promotional Banner Popup</h2>
          <p className="text-xs text-[#6B6B6B] mt-1">
            A premium campaign popup carousel shown ~800ms after the homepage loads. Only banners with an uploaded image appear live.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          type="button"
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#F05A7E] hover:bg-[#F05A7E] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-[0_4px_14px_rgba(240,90,126,0.3)] disabled:opacity-50"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved Live!' : isSaving ? 'Saving...' : 'Save & Publish Live'}</span>
        </button>
      </div>

      {/* Master toggle + interval */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Popup Status</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">Must be ON and have at least one active banner to appear on the live site.</p>
          </div>
          <button
            type="button"
            onClick={() => updateField('enabled', !state.enabled)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              state.enabled
                ? 'bg-[#F05A7E]/15 text-[#F05A7E] border border-[#F05A7E]/40'
                : 'bg-[#0B0B0B] text-[#6B6B6B] border border-[#E8D5A8]/30'
            }`}
          >
            {state.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{state.enabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div>
          <label className={labelClass}>Auto-Slide Interval</label>
          <select
            value={intervalSeconds}
            onChange={(e) => updateField('intervalMs', Number(e.target.value) * 1000)}
            className="w-44 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
          >
            {['3', '4', '5', '6'].map((s) => (
              <option key={s} value={s}>
                {s} seconds{s === '4' ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Banners list */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">
              Banners <span className="text-[#6B6B6B] font-normal">({banners.length}/{MAX_BANNERS})</span>
            </h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              Original image proportions are preserved — no forced cropping. Drag to reorder.
            </p>
          </div>
          <label
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
              atLimit || isUploading
                ? 'bg-[#0B0B0B] text-[#6B6B6B] border border-[#E8D5A8]/20 cursor-not-allowed'
                : 'bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 cursor-pointer'
            }`}
          >
            {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F05A7E]" /> : <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />}
            <span>{atLimit ? 'Limit Reached' : 'Add Banner'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={atLimit || isUploading}
              onChange={(e) => {
                handleAddFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {uploadError && <p className="text-xs text-[#F05A7E]">{uploadError}</p>}

        {banners.length === 0 && (
          <div className="p-6 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl">
            No banners yet. Add one to enable the popup carousel.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {banners.map((banner, idx) => (
            <div
              key={banner.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleBannerDrop(idx)}
              className={`p-3 bg-[#0B0B0B] border rounded-xl space-y-2 transition-colors ${
                dragIndex === idx ? 'border-[#F05A7E]/60 opacity-60' : 'border-[#E8D5A8]/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <GripVertical className="w-4 h-4 text-[#6B6B6B] cursor-grab active:cursor-grabbing" title="Drag to reorder" />
                  <span className="text-[11px] font-bold text-[#E3B84B] uppercase tracking-wider">Banner {idx + 1}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateBanner(idx, { isActive: banner.isActive === false ? true : false })}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                    banner.isActive === false
                      ? 'bg-[#171717] text-[#6B6B6B] border border-[#E8D5A8]/30'
                      : 'bg-[#F05A7E]/15 text-[#F05A7E] border border-[#F05A7E]/40'
                  }`}
                  title={banner.isActive === false ? 'Disabled — hidden from the live popup' : 'Active — visible on the live site'}
                >
                  {banner.isActive === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{banner.isActive === false ? 'Disabled' : 'Active'}</span>
                </button>
              </div>

              <div className="aspect-video w-full rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#171717] flex items-center justify-center">
                {banner.image ? (
                  <img
                    src={banner.image}
                    alt={banner.altText || `Banner ${idx + 1} preview`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <ImageOff className="w-5 h-5 text-[#6B6B6B]" />
                )}
              </div>

              <input
                type="text"
                value={banner.altText || ''}
                onChange={(e) => handleUpdateBanner(idx, { altText: e.target.value })}
                placeholder="Alt text (accessibility)"
                className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[11px] text-[#FAF9F6]"
              />

              <div className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-[#6B6B6B] shrink-0" />
                <input
                  type="text"
                  value={banner.link || ''}
                  onChange={(e) => handleUpdateBanner(idx, { link: e.target.value || undefined })}
                  placeholder="Optional link (/shop or https://...)"
                  className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[11px] text-[#FAF9F6]"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[10px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer">
                  {replaceTarget === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Replace'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      handleReplaceFile(idx, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handleDeleteBanner(idx)}
                  className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                  title="Delete banner"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
