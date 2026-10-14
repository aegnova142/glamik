/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { Look, LookProductItem } from '@glamirk/shared/types';
import {
  Plus,
  Trash2,
  Save,
  Check,
  ArrowLeft,
  Video,
  Loader2,
  UploadCloud,
  RotateCcw,
  Crop,
  Crosshair,
  AlertCircle,
  ImageOff,
} from 'lucide-react';
import { ImageCropUploadModal } from './ImageCropUploadModal';
import { useFileUpload } from '../../hooks/useFileUpload';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

const CATEGORY_OPTIONS = ['EVERYDAY GLAM', 'DATE NIGHT', 'WEDDING GLAM', 'MINIMAL GLAM'];

/** Matches what the server accepts (MEDIA_MAX_IMAGE_MB, default 20). The
 * server re-checks the real bytes; this only saves a pointless upload. */
const IMAGE_MAX_MB = 20;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const DEFAULT_FOCUS = '50% 50%';

const emptyProductItem: LookProductItem = { productId: '', productName: '', shadeName: '', role: '' };

const inputClass =
  'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B] focus-visible:ring-2 focus-visible:ring-[#C9972B]/40';
const labelClass = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9972B]/60';

function parseFocus(focus?: string): [number, number] {
  const m = /^([\d.]+)% ([\d.]+)%$/.exec(focus || '');
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

const formatUpdated = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';

export const AdminLooks: React.FC = () => {
  const { looks, products, saveLook, deleteLook } = useCMS();
  const [editingLook, setEditingLook] = useState<Look | null>(null);
  /** The look as it was when the editor opened — the "discard" baseline. */
  const [savedLook, setSavedLook] = useState<Look | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { upload: uploadVideo, isUploading: isVideoUploading, error: videoError } = useFileUpload({
    acceptedTypes: ['video/'],
    maxSizeBytes: 60 * 1024 * 1024, // 60MB — keep card autoplay clips short
    typeErrorMessage: 'Please choose a video file (MP4, WebM, or MOV).',
  });

  const isDirty = !!editingLook && JSON.stringify(editingLook) !== JSON.stringify(savedLook);

  const openEditor = (look: Look) => {
    setEditingLook(look);
    setSavedLook(look);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const closeEditor = () => {
    if (isDirty && !window.confirm('Discard your unsaved changes to this look?')) return;
    setEditingLook(null);
    setSavedLook(null);
    setSaveError(null);
  };

  const handleCreateLook = () => {
    const newLook: Look = {
      id: 'look-' + Date.now(),
      title: 'NEW SIGNATURE LOOK',
      tagline: 'A short, evocative one-line description of this look.',
      description: 'A fuller description of the styling, mood, and products used to create this look.',
      image: '',
      category: 'EVERYDAY GLAM',
      productsUsed: [{ ...emptyProductItem }],
    };
    openEditor(newLook);
    // A brand-new look has no saved baseline, so it is always "unsaved".
    setSavedLook(null);
  };

  const handleSave = async () => {
    if (!editingLook) return;
    setSaveError(null);
    setIsSaving(true);
    const result = await saveLook({
      ...editingLook,
      productsUsed: editingLook.productsUsed.filter((p) => p.productId.trim()),
    });
    setIsSaving(false);
    if (!result.success) {
      setSaveError(result.error || 'The look could not be saved. Please try again.');
      return;
    }
    // The just-saved state is the new baseline, so a second click during the
    // success flash is a no-op instead of a duplicate POST.
    setSavedLook(editingLook);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setEditingLook(null);
      setSavedLook(null);
    }, 900);
  };

  const handleDelete = (look: Look) => {
    if (window.confirm(`Delete "${look.title}"? This cannot be undone.`)) {
      deleteLook(look.id);
    }
  };

  const updateProductItem = (idx: number, patch: Partial<LookProductItem>) => {
    if (!editingLook) return;
    const next = [...editingLook.productsUsed];
    next[idx] = { ...next[idx], ...patch };
    setEditingLook({ ...editingLook, productsUsed: next });
  };

  const removeProductItem = (idx: number) => {
    if (!editingLook) return;
    setEditingLook({ ...editingLook, productsUsed: editingLook.productsUsed.filter((_, i) => i !== idx) });
  };

  const handleVideoFileSelect = async (file: File | undefined) => {
    const mediaItem = await uploadVideo(file);
    if (mediaItem) setEditingLook((prev) => (prev ? { ...prev, video: mediaItem.url } : prev));
  };

  if (editingLook) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={closeEditor}
              aria-label="Back to all looks"
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9972B]/60"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h2 className="font-serif text-xl text-[#FAF9F6] truncate">{editingLook.title || 'Untitled look'}</h2>
              <p className="text-[11px] text-[#B5B0AA]">
                {isDirty ? 'Unsaved changes — saving publishes them to the Shop the Look page.' : 'No unsaved changes.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={closeEditor} className={secondaryButtonClass}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || saveSuccess || !isDirty}
              aria-busy={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D5A8]"
            >
              {saveSuccess ? (
                <Check className="w-4 h-4" />
              ) : isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saveSuccess ? 'Saved & published' : isSaving ? 'Saving…' : 'Save Look'}</span>
            </button>
          </div>
        </div>

        <div role="status" aria-live="polite">
          {saveError && (
            <p className="flex items-start gap-2 p-3 rounded-lg border border-[#F05A7E]/40 bg-[#F05A7E]/10 text-xs text-[#FF9AB2] max-w-3xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </p>
          )}
          {saveSuccess && <span className="sr-only">Look saved and published.</span>}
        </div>

        <div className="p-4 sm:p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 max-w-3xl space-y-4">
          <div>
            <label htmlFor="look-title" className={labelClass}>
              Look Title
            </label>
            <input
              id="look-title"
              type="text"
              maxLength={120}
              value={editingLook.title}
              onChange={(e) => setEditingLook({ ...editingLook, title: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="look-category" className={labelClass}>
              Category
            </label>
            <select
              id="look-category"
              value={editingLook.category}
              onChange={(e) => setEditingLook({ ...editingLook, category: e.target.value })}
              className={inputClass}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="look-tagline" className={labelClass}>
              Tagline <span className="normal-case font-normal text-[#B5B0AA]">(shown in italics under the title)</span>
            </label>
            <input
              id="look-tagline"
              type="text"
              maxLength={300}
              value={editingLook.tagline}
              onChange={(e) => setEditingLook({ ...editingLook, tagline: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="look-description" className={labelClass}>
              Description
            </label>
            <textarea
              id="look-description"
              rows={3}
              maxLength={2000}
              value={editingLook.description}
              onChange={(e) => setEditingLook({ ...editingLook, description: e.target.value })}
              className={inputClass}
            />
          </div>

          <LookImageField
            look={editingLook}
            savedImage={savedLook?.image}
            savedFocus={savedLook?.imageFocus}
            onChange={(patch) => setEditingLook((prev) => (prev ? { ...prev, ...patch } : prev))}
            onOpenCrop={() => setIsUploadOpen(true)}
          />
          {isUploadOpen && (
            <ImageCropUploadModal
              isOpen
              onClose={() => setIsUploadOpen(false)}
              title="Upload & Crop Look Image"
              aspectRatio={3 / 4}
              minWidth={600}
              minHeight={800}
              recommendedWidth={900}
              recommendedHeight={1200}
              outputWidth={900}
              outputHeight={1200}
              onUploaded={({ url }) =>
                setEditingLook((prev) => (prev ? { ...prev, image: url, imageFocus: '' } : prev))
              }
            />
          )}

          <div>
            <span className={labelClass}>
              Video <span className="normal-case font-normal text-[#B5B0AA]">(optional — plays instead of the image, loops continuously)</span>
            </span>

            {videoError && <p className="mb-2 text-[11px] text-[#FF9AB2]">{videoError}</p>}

            {editingLook.video ? (
              <div className="space-y-2">
                <video
                  src={editingLook.video}
                  className="w-full h-40 object-contain bg-[#0B0B0B] rounded-lg border border-[#E8D5A8]/20"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
                <div className="flex gap-2">
                  <label className={`${secondaryButtonClass} flex-1`}>
                    {isVideoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                    <span>{isVideoUploading ? 'Uploading...' : 'Replace Video'}</span>
                    <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={isVideoUploading} onChange={(e) => handleVideoFileSelect(e.target.files?.[0])} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingLook((prev) => (prev ? { ...prev, video: '' } : prev))}
                    className={secondaryButtonClass}
                    aria-label="Remove video — the card falls back to the image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <label className={`${secondaryButtonClass} w-full py-3 border-dashed`}>
                {isVideoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                <span>{isVideoUploading ? 'Uploading...' : 'Upload Video'}</span>
                <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={isVideoUploading} onChange={(e) => handleVideoFileSelect(e.target.files?.[0])} />
              </label>
            )}
          </div>

          <div className="pt-2 border-t border-[#E8D5A8]/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">Products Used In This Look</span>
              <button
                type="button"
                onClick={() =>
                  setEditingLook({ ...editingLook, productsUsed: [...editingLook.productsUsed, { ...emptyProductItem }] })
                }
                className={secondaryButtonClass}
              >
                <Plus className="w-3 h-3" />
                <span>Add Product</span>
              </button>
            </div>

            {editingLook.productsUsed.map((item, idx) => {
              const product = products.find((p) => p.id === item.productId);
              const isMissing = !!item.productId && !product;
              return (
                <div key={idx} className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 grid grid-cols-1 sm:grid-cols-2 gap-2 relative">
                  <button
                    type="button"
                    onClick={() => removeProductItem(idx)}
                    aria-label={`Remove product ${idx + 1}`}
                    className="absolute top-2 right-2 p-1 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <div className="sm:col-span-2 pr-8">
                    <label htmlFor={`look-product-${idx}`} className="sr-only">
                      Product {idx + 1}
                    </label>
                    <select
                      id={`look-product-${idx}`}
                      value={item.productId}
                      onChange={(e) => {
                        const chosen = products.find((p) => p.id === e.target.value);
                        updateProductItem(idx, {
                          productId: e.target.value,
                          productName: chosen?.name || '',
                          shadeName: chosen?.shades?.[0]?.name || '',
                        });
                      }}
                      className={inputClass}
                    >
                      <option value="">Choose a product from the catalogue…</option>
                      {isMissing && <option value={item.productId}>Missing product: {item.productId}</option>}
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — ₹{p.price.toLocaleString('en-IN')}
                        </option>
                      ))}
                    </select>
                    {isMissing && (
                      <p className="mt-1 text-[11px] text-[#FF9AB2]">
                        This product is no longer in the catalogue and is hidden on the public page. Choose a replacement.
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`look-shade-${idx}`} className="sr-only">
                      Shade for product {idx + 1}
                    </label>
                    <select
                      id={`look-shade-${idx}`}
                      value={item.shadeName || ''}
                      disabled={!product?.shades?.length}
                      onChange={(e) => updateProductItem(idx, { shadeName: e.target.value })}
                      className={`${inputClass} disabled:opacity-50`}
                    >
                      <option value="">{product?.shades?.length ? 'Default shade' : 'No shades'}</option>
                      {(product?.shades || []).map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`look-role-${idx}`} className="sr-only">
                      Role of product {idx + 1}
                    </label>
                    <input
                      id={`look-role-${idx}`}
                      type="text"
                      placeholder="Role (e.g. Lip Focus)"
                      value={item.role}
                      onChange={(e) => updateProductItem(idx, { role: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Shop The Look</h2>
          <p className="text-xs text-[#B5B0AA] mt-0.5">
            Curate editorial looks — the image, products and shades shown under the category filters on the public page.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreateLook}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>New Look</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(looks || []).map((look) => (
          <div
            key={look.id}
            className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden flex flex-col justify-between"
          >
            <div className="h-44 relative bg-[#0B0B0B] flex items-center justify-center">
              {look.image ? (
                <img
                  src={cloudinaryImageUrl(look.image, 'tile')}
                  alt={`${look.title} — current editorial image`}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: look.imageFocus || DEFAULT_FOCUS }}
                />
              ) : (
                <span className="flex flex-col items-center gap-1 text-[11px] text-[#B5B0AA]">
                  <ImageOff className="w-5 h-5" />
                  No image — public page shows a placeholder
                </span>
              )}
              <span className="absolute top-2 left-2 px-2 py-0.5 bg-[#C9972B] text-[#0B0B0B] text-[9px] font-bold uppercase tracking-wider rounded-full">
                {look.category}
              </span>
              {look.video && (
                <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-[#0B0B0B]/80 text-[#FAF9F6] text-[9px] font-bold uppercase tracking-wider rounded-full border border-[#E8D5A8]/30">
                  <Video className="w-2.5 h-2.5" />
                  <span>Video</span>
                </span>
              )}
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="font-serif text-base text-[#FAF9F6]">{look.title}</h3>
                <p className="text-xs text-[#B5B0AA] line-clamp-2 mt-2">{look.tagline}</p>
                <span className="text-[11px] text-[#B5B0AA] block mt-2">
                  {look.productsUsed.length} product{look.productsUsed.length === 1 ? '' : 's'} tagged · Published ·
                  Updated {formatUpdated(look.updatedAt)}
                </span>
              </div>

              <div className="pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-end gap-2">
                <a
                  href="/shop-the-look"
                  target="_blank"
                  rel="noreferrer"
                  className={secondaryButtonClass}
                >
                  Preview
                </a>
                <button type="button" onClick={() => openEditor(look)} className={secondaryButtonClass}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(look)}
                  aria-label={`Delete ${look.title}`}
                  className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

/**
 * The main editorial image — the one under the category filters on the
 * public Shop the Look page. Uploads keep the original's aspect ratio; the
 * public card crops with object-cover around `imageFocus`, and the two
 * previews here use the exact same crop so what the admin sees is what ships.
 */
const LookImageField: React.FC<{
  look: Look;
  savedImage?: string;
  savedFocus?: string;
  onChange: (patch: Partial<Look>) => void;
  onOpenCrop: () => void;
}> = ({ look, savedImage, savedFocus, onChange, onOpenCrop }) => {
  const { upload, isUploading, phase, progress, error } = useFileUpload({
    acceptedTypes: IMAGE_TYPES,
    maxSizeBytes: IMAGE_MAX_MB * 1024 * 1024,
    typeErrorMessage: 'Please choose a JPEG, PNG or WebP image.',
  });
  const [isDragging, setIsDragging] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fx, fy] = parseFocus(look.imageFocus);
  const changed = look.image !== (savedImage ?? look.image) || (look.imageFocus || '') !== (savedFocus || '');

  const handleFile = async (file: File | undefined) => {
    setJustUploaded(false);
    const item = await upload(file);
    if (item) {
      // A new picture has a new subject position; start centred.
      onChange({ image: item.url, imageFocus: '' });
      setJustUploaded(true);
    }
  };

  const setFocus = (x: number, y: number) => {
    const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)));
    onChange({ imageFocus: `${clamp(x)}% ${clamp(y)}%` });
  };

  const focusStyle = { objectPosition: look.imageFocus || DEFAULT_FOCUS };
  const preview = look.image ? cloudinaryImageUrl(look.image, 'gallery') : '';

  return (
    <div className="space-y-3">
      <div>
        <span className={labelClass}>Main editorial image</span>
        <p className="text-[11px] text-[#B5B0AA]">
          Shown beside the products under the category filters. JPEG, PNG or WebP, up to {IMAGE_MAX_MB} MB. Best at
          least 1200 × 1500 px with the face in the upper-middle; the original proportions are kept and the card crops
          around the focal point you set below.
        </p>
      </div>

      {/* Drop zone — also a plain button for keyboard and screen-reader users. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-lg border border-dashed p-4 text-center transition-colors ${
          isDragging ? 'border-[#C9972B] bg-[#C9972B]/10' : 'border-[#E8D5A8]/30 bg-[#0B0B0B]'
        }`}
      >
        <UploadCloud className="w-6 h-6 mx-auto text-[#C9972B]" aria-hidden="true" />
        <p className="text-xs text-[#FAF9F6] mt-2">Drag an image here, or</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={secondaryButtonClass}
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            {look.image ? 'Replace image' : 'Choose image'}
          </button>
          <button type="button" onClick={onOpenCrop} disabled={isUploading} className={secondaryButtonClass}>
            <Crop className="w-3.5 h-3.5" />
            Upload &amp; crop to 3:4
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div role="status" aria-live="polite" className="mt-3 text-[11px] min-h-[1rem]">
          {isUploading && (
            <div className="space-y-1.5">
              <div className="h-1.5 rounded-full bg-[#E8D5A8]/15 overflow-hidden">
                <div className="h-full bg-[#C9972B] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[#E8D5A8]">
                {phase === 'processing' ? 'Processing image…' : `Uploading… ${progress}%`}
              </span>
            </div>
          )}
          {!isUploading && error && (
            <span className="inline-flex items-center gap-1.5 text-[#FF9AB2]">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
          {!isUploading && !error && justUploaded && (
            <span className="inline-flex items-center gap-1.5 text-[#8FD3A6]">
              <Check className="w-3.5 h-3.5" /> Uploaded. Set the focal point, then Save Look to publish.
            </span>
          )}
        </div>
      </div>

      {look.image ? (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
          <figure className="space-y-1">
            <button
              type="button"
              aria-label={`Set focal point. Currently ${fx}% across, ${fy}% down. Click the image or use arrow keys.`}
              onClick={(e) => {
                // Enter/Space also fire click, with no pointer position —
                // leave the point where it is (arrow keys move it).
                if (e.detail === 0) return;
                const r = e.currentTarget.getBoundingClientRect();
                setFocus(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 10 : 2;
                const moves: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0],
                  ArrowRight: [step, 0],
                  ArrowUp: [0, -step],
                  ArrowDown: [0, step],
                };
                const m = moves[e.key];
                if (!m) return;
                e.preventDefault();
                setFocus(fx + m[0], fy + m[1]);
              }}
              className="relative block w-full aspect-[8/7] overflow-hidden rounded-lg border border-[#E8D5A8]/30 bg-[#0B0B0B] cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9972B]"
            >
              <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" style={focusStyle} />
              <span
                aria-hidden="true"
                className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]"
                style={{ left: `${fx}%`, top: `${fy}%` }}
              />
            </button>
            <figcaption className="flex items-center gap-1.5 text-[11px] text-[#B5B0AA]">
              <Crosshair className="w-3 h-3" /> Desktop card crop — click to set the focal point
            </figcaption>
          </figure>
          <figure className="space-y-1">
            <div className="relative w-full aspect-[4/5] overflow-hidden rounded-lg border border-[#E8D5A8]/30 bg-[#0B0B0B]">
              <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" style={focusStyle} />
            </div>
            <figcaption className="text-[11px] text-[#B5B0AA]">Mobile crop</figcaption>
          </figure>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 h-32 rounded-lg border border-[#E8D5A8]/20 bg-[#0B0B0B] text-[11px] text-[#B5B0AA]">
          <ImageOff className="w-5 h-5" />
          No image yet. A new look needs one before it can be saved; an existing look shows a placeholder until one is added.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {look.imageFocus && (
          <button type="button" onClick={() => onChange({ imageFocus: '' })} className={secondaryButtonClass}>
            <Crosshair className="w-3.5 h-3.5" /> Centre focal point
          </button>
        )}
        {changed && savedImage !== undefined && (
          <button
            type="button"
            onClick={() => {
              onChange({ image: savedImage, imageFocus: savedFocus ?? '' });
              setJustUploaded(false);
            }}
            className={secondaryButtonClass}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Revert to saved image
          </button>
        )}
        {look.image && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Remove this image? The public card will show a placeholder until a new one is saved.')) {
                onChange({ image: '', imageFocus: '' });
                setJustUploaded(false);
              }
            }}
            className={secondaryButtonClass}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove image
          </button>
        )}
      </div>

      <details className="text-[11px] text-[#B5B0AA]">
        <summary className="cursor-pointer select-none">Advanced: use an existing image URL</summary>
        <label htmlFor="look-image-url" className="sr-only">
          Image URL
        </label>
        <input
          id="look-image-url"
          type="url"
          value={look.image}
          onChange={(e) => onChange({ image: e.target.value })}
          placeholder="https://res.cloudinary.com/…"
          className={`${inputClass} mt-2`}
        />
      </details>
    </div>
  );
};
