/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ==========================================
// SHADE EDITOR
//
// The product editor's Shades section, lifted out of AdminProducts into its
// own file. It is the SAME editor — same Shade model, same Cloudinary upload
// hook, same handlers — reorganised so a shade reads as one manageable
// variant: a card you can collapse, duplicate, pause, reorder and search,
// with its pricing, sizes, stock, SKUs and gallery inside it.
//
// It owns no data. Every change goes back through `onChange(shades)` into the
// product being edited, and nothing is persisted until the admin saves the
// product — which is what makes Duplicate and Delete cheap to undo (leave
// without saving) and what keeps a half-finished shade out of the catalogue.
//
// DERIVED, NEVER STORED: starting price, total stock, discount percentage and
// the readiness warnings are all computed from the shade by the shared
// resolvers (summarizeShade / getDiscountPercent). None of them is a field.
// A stored discount is a number that goes stale the first time someone edits a
// price without editing it, and then the page advertises a saving the till
// does not give.
// ==========================================

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Upload,
  GripVertical,
  X,
  ImageOff,
  RefreshCw,
  Link,
  Star,
  ChevronDown,
  ChevronRight,
  Search,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Loader2,
} from 'lucide-react';
import { Product, Shade, SizeOption, VariantImage } from '@glamirk/shared/types';
import {
  summarizeShade,
  getDiscountPercent,
  stockStatus,
  getActiveSizeOptions,
  duplicateShade,
  duplicateSize,
} from '@glamirk/shared/utils/productVariant';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useDragReorder } from '../../hooks/useDragReorder';

const newVariantImageId = () => 'vimg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
const newShadeId = () => 'shade-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
const newSizeId = () => 'size-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

/** The reference counts behind one sellable unit. Shades and sizes are both
 * deletable business data and both get the same four questions asked of them. */
interface UsageCounts {
  orderCount: number;
  orderLineCount: number;
  cartLineCount: number;
  inventoryAvailable: number;
  inventoryReserved: number;
  inventorySold: number;
}

/** What the delete confirmation shows. Fetched per product, not per shade, so
 * one request covers every card and every size inside them. */
interface VariantUsage extends UsageCounts {
  variantId: string;
  name: string;
  sizes?: (UsageCounts & { sizeId: string; label: string })[];
}

/** Which thing a confirmation is about. Sizes carry their own references —
 * `selected_size` is how an order line names which jar shipped — so deleting
 * one is asked about exactly as deleting a shade is. */
type PendingDelete =
  | { kind: 'shade'; index: number; shade: Shade }
  | { kind: 'size'; index: number; shade: Shade; size: SizeOption };

/** True when removing this would orphan something that already happened —
 * a sale, or stock a live order is holding. Not a block: an admin clearing a
 * variant that never sold should not have to argue with the UI. It decides
 * whether pausing is offered as the better answer. */
const touchesHistory = (u: UsageCounts | undefined): boolean =>
  !!u && (u.orderLineCount > 0 || u.inventorySold > 0 || u.inventoryReserved > 0);

const INPUT = 'w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]';
// No width of its own: the size table sets one per column. Baking `w-full` in
// and overriding it per cell would leave two width utilities on the element,
// and which one wins is decided by stylesheet order rather than by the order
// they are written here.
const INPUT_DARK = 'px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]';
const LABEL = 'block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';
const MICRO_LABEL = 'block text-[9.5px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

const STATUS_STYLES: Record<string, string> = {
  'in-stock': 'bg-[#C9972B]/10 text-[#E3B84B] border-[#C9972B]/40',
  'low-stock': 'bg-[#E3B84B]/15 text-[#E3B84B] border-[#E3B84B]/50',
  'out-of-stock': 'bg-[#F05A7E]/15 text-[#F05A7E] border-[#F05A7E]/40',
};
const STATUS_TEXT: Record<string, string> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
};

interface ShadeEditorProps {
  product: Product;
  /** When SQL inventory owns stock, every stock input here is read-only —
   * corrections go through the Inventory panel, which locks the row and
   * records who changed it. Mirrors the product-level stock field. */
  sqlInventoryMode: boolean;
  onChange: (shades: Shade[]) => void;
}

export const ShadeEditor: React.FC<ShadeEditorProps> = ({ product, sqlInventoryMode, onChange }) => {
  const shades = product.shades || [];

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [usage, setUsage] = useState<VariantUsage[] | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const [uploadingShadeId, setUploadingShadeId] = useState<string | null>(null);
  const [dragImage, setDragImage] = useState<{ shadeId: string; imgIdx: number } | null>(null);
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());
  const [imageUrlDraft, setImageUrlDraft] = useState<Record<string, string>>({});
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);
  const [editingUrlImageId, setEditingUrlImageId] = useState<string | null>(null);
  const [editingUrlDraft, setEditingUrlDraft] = useState('');

  const { upload, error: uploadError } = useFileUpload({
    acceptedTypes: ['image/'],
    maxSizeBytes: 8 * 1024 * 1024,
    typeErrorMessage: 'Please choose an image file (JPG, PNG, or WebP).',
  });

  // Reordering acts on the real list even while a search is narrowing what is
  // shown — dragging is therefore disabled during a search, because dropping
  // card 2 of 3 visible onto card 1 of 3 visible has no honest meaning in a
  // list of twelve.
  const { dragIndex, setDragIndex, handleDrop } = useDragReorder<Shade>(shades, onChange);

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const updateShade = (index: number, patch: Partial<Shade>) => {
    const next = [...shades];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const updateSizes = (index: number, updater: (sizes: SizeOption[]) => SizeOption[]) => {
    const next = [...shades];
    next[index] = { ...next[index], sizes: updater(next[index].sizes || []) };
    onChange(next);
  };

  const updateImages = (index: number, updater: (images: VariantImage[]) => VariantImage[]) => {
    const next = [...shades];
    next[index] = { ...next[index], images: updater(next[index].images || []) };
    onChange(next);
  };

  const handleAddShade = () => {
    const shade: Shade = {
      id: newShadeId(),
      name: 'New Shade',
      hex: '#F05A7E',
      undertone: 'Warm',
      description: 'Calibrated luxury pigment.',
      isActive: true,
      images: [],
    };
    onChange([...shades, shade]);
    setExpandedIds((prev) => new Set(prev).add(shade.id));
  };

  /** Cloning rules live in the shared module — what a duplicate must NOT
   * carry over (ids, SKUs) is asserted there rather than trusted to a
   * click-through. See duplicateShade. */
  const handleDuplicateShade = (index: number) => {
    const clone = duplicateShade(shades[index]);
    const next = [...shades];
    next.splice(index + 1, 0, clone);
    onChange(next);
    setExpandedIds((prev) => new Set(prev).add(clone.id));
  };

  /**
   * Open the confirmation for a shade or one of its sizes.
   *
   * The references are fetched once per product and cover every shade and
   * size, so expanding a second card or deleting a second size does not
   * re-query. A product that has never been saved has no rows anywhere and
   * the endpoint correctly 404s — that is "no references", not an error.
   */
  const openDeleteConfirm = async (pending: PendingDelete) => {
    setPendingDelete(pending);
    setUsage(null);
    setUsageLoading(true);
    const res = await apiFetch<{ variants: VariantUsage[] }>(`/api/admin/products/${product.id}/variant-usage`);
    setUsageLoading(false);
    setUsage(res.data?.variants ?? []);
  };

  const closeDeleteConfirm = () => {
    setPendingDelete(null);
    setUsage(null);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'shade') {
      onChange(shades.filter((_, i) => i !== pendingDelete.index));
    } else {
      const sizeId = pendingDelete.size.id;
      updateSizes(pendingDelete.index, (sizes) => sizes.filter((s) => s.id !== sizeId));
    }
    closeDeleteConfirm();
  };

  /** The reversible alternative: the unit stops being selectable but stays
   * resolvable, so past orders can still name what was shipped. */
  const pauseInsteadOfDeleting = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'shade') {
      updateShade(pendingDelete.index, { isActive: false });
    } else {
      updateSizeField(pendingDelete.index, pendingDelete.size.id, { isActive: false });
    }
    closeDeleteConfirm();
  };

  // --- sizes -------------------------------------------------------------

  const handleAddSize = (index: number) => {
    const shade = shades[index];
    const existing = (shade.sizes || []).map((s) => s.label);
    let label = 'New Size';
    let n = 2;
    while (existing.includes(label)) label = `New Size ${n++}`;
    updateSizes(index, (sizes) => [
      ...sizes,
      { id: newSizeId(), label, price: shade.price ?? product.price, isActive: true },
    ]);
  };

  /** Same rules as duplicating a shade, one level down — see duplicateSize. */
  const handleDuplicateSize = (index: number, sizeId: string) =>
    updateSizes(index, (sizes) => duplicateSize(sizes, sizeId));

  const updateSizeField = (index: number, sizeId: string, patch: Partial<SizeOption>) =>
    updateSizes(index, (sizes) => sizes.map((s) => (s.id === sizeId ? { ...s, ...patch } : s)));

  // --- images ------------------------------------------------------------

  /** Keeps sortOrder contiguous and guarantees exactly one primary — the
   * storefront reads primary-first, so a gallery with none would silently
   * reorder itself on the product page. */
  const normalizeImages = (images: VariantImage[]): VariantImage[] => {
    const ordered = images.map((img, i) => ({ ...img, sortOrder: i }));
    if (ordered.length > 0 && !ordered.some((img) => img.isPrimary)) ordered[0].isPrimary = true;
    return ordered;
  };

  const handleUploadImages = async (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const shadeId = shades[index].id;
    setUploadingShadeId(shadeId);
    const uploaded: VariantImage[] = [];
    for (const file of Array.from(files)) {
      const mediaItem = await upload(file);
      if (mediaItem) {
        uploaded.push({
          id: newVariantImageId(),
          url: mediaItem.url,
          publicId: mediaItem.publicId,
          alt: '',
          sortOrder: 0,
          isPrimary: false,
        });
      }
    }
    setUploadingShadeId(null);
    if (uploaded.length === 0) return;
    updateImages(index, (images) => normalizeImages([...images, ...uploaded]));
  };

  const handleAddImageUrl = (index: number) => {
    const shadeId = shades[index].id;
    const url = (imageUrlDraft[shadeId] || '').trim();
    if (!url) return;
    updateImages(index, (images) =>
      normalizeImages([...images, { id: newVariantImageId(), url, publicId: '', alt: '', sortOrder: 0, isPrimary: false }])
    );
    setImageUrlDraft((prev) => ({ ...prev, [shadeId]: '' }));
  };

  /**
   * Replace one image's file.
   *
   * Upload first, and only swap the URL once the new asset exists. The old
   * Cloudinary asset is deliberately left in place: it may still be referenced
   * by the Media Library or by another shade, and nothing here can see the
   * saved state of the product it is replacing in — DELETE /admin/media is the
   * single place that destroys an asset, and it refuses while anything still
   * points at it.
   */
  const handleReplaceImage = async (index: number, imageId: string, file: File | undefined) => {
    if (!file) return;
    setReplacingImageId(imageId);
    const mediaItem = await upload(file);
    setReplacingImageId(null);
    if (!mediaItem) return;
    setBrokenImageIds((prev) => {
      if (!prev.has(imageId)) return prev;
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
    updateImages(index, (images) =>
      images.map((img) => (img.id === imageId ? { ...img, url: mediaItem.url, publicId: mediaItem.publicId } : img))
    );
  };

  const handleUpdateImageUrl = (index: number, imageId: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBrokenImageIds((prev) => {
      if (!prev.has(imageId)) return prev;
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
    updateImages(index, (images) =>
      images.map((img) => (img.id === imageId ? { ...img, url: trimmed, publicId: '' } : img))
    );
    setEditingUrlImageId(null);
    setEditingUrlDraft('');
  };

  const handleDeleteImage = (index: number, imageId: string) =>
    updateImages(index, (images) => normalizeImages(images.filter((img) => img.id !== imageId)));

  const handleSetPrimary = (index: number, imageId: string) =>
    updateImages(index, (images) => images.map((img) => ({ ...img, isPrimary: img.id === imageId })));

  const handleImageDrop = (index: number, targetIdx: number) => {
    const shadeId = shades[index].id;
    if (!dragImage || dragImage.shadeId !== shadeId || dragImage.imgIdx === targetIdx) {
      setDragImage(null);
      return;
    }
    updateImages(index, (images) => {
      const next = [...images];
      const [moved] = next.splice(dragImage.imgIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next.map((img, i) => ({ ...img, sortOrder: i }));
    });
    setDragImage(null);
  };

  // --- render ------------------------------------------------------------

  const query = search.trim().toLowerCase();
  const matchesSearch = (shade: Shade) =>
    !query ||
    shade.name.toLowerCase().includes(query) ||
    (shade.sku || '').toLowerCase().includes(query) ||
    (shade.undertone || '').toLowerCase().includes(query) ||
    (shade.hex || '').toLowerCase().includes(query) ||
    (shade.sizes || []).some(
      (s) => s.label.toLowerCase().includes(query) || (s.sku || '').toLowerCase().includes(query)
    );

  const visible = shades.map((shade, index) => ({ shade, index })).filter(({ shade }) => matchesSearch(shade));
  // The counts for whichever unit the confirmation is about — the shade
  // itself, or the one size inside it.
  const pendingShadeUsage = pendingDelete ? usage?.find((u) => u.variantId === pendingDelete.shade.id) : undefined;
  const pendingUsage: UsageCounts | undefined =
    pendingDelete?.kind === 'size'
      ? pendingShadeUsage?.sizes?.find((s) => s.label === pendingDelete.size.label)
      : pendingShadeUsage;
  const hasHistory = touchesHistory(pendingUsage);
  const pendingLabel =
    pendingDelete?.kind === 'size'
      ? `${pendingDelete.size.label} — ${pendingDelete.shade.name}`
      : pendingDelete?.shade.name || '';

  return (
    <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#FAF9F6]">Shades &amp; Variants ({shades.length})</h3>
          <p className="text-[11px] text-[#6B6B6B] mt-0.5">
            Each shade is a complete variant — its own price, stock, sizes, SKUs and gallery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shades.length > 3 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B6B6B] absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search shades or SKUs"
                className="pl-7 pr-2 py-1.5 w-44 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[11px] text-[#FAF9F6] placeholder:text-[#6B6B6B]"
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleAddShade}
            className="flex items-center gap-1 text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Shade</span>
          </button>
        </div>
      </div>

      {shades.length === 0 && (
        <p className="text-[11px] text-[#6B6B6B] italic">
          No shades — this product sells at its single product-level price. Add a shade only if it comes in more than one colour or variant.
        </p>
      )}
      {shades.length > 0 && visible.length === 0 && (
        <p className="text-[11px] text-[#6B6B6B] italic">No shade matches "{search}".</p>
      )}

      <div className="space-y-3">
        {visible.map(({ shade, index }) => {
          const expanded = expandedIds.has(shade.id);
          const summary = summarizeShade(product, shade);
          const sizes = shade.sizes || [];
          const activeSizes = getActiveSizeOptions(product, shade);
          const images = [...(shade.images || [])].sort((a, b) => a.sortOrder - b.sortOrder);
          const thumb = images.find((img) => img.isPrimary) || images[0];
          const shadeDiscount = getDiscountPercent(shade.price ?? product.price, shade.compareAtPrice);
          const paused = shade.isActive === false;
          const canDrag = !query;

          return (
            <div
              key={shade.id}
              draggable={canDrag}
              onDragStart={() => canDrag && setDragIndex(index)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => canDrag && handleDrop(index)}
              className={`rounded-lg bg-[#0B0B0B] border text-xs transition-colors ${
                dragIndex === index ? 'border-[#C9972B]' : 'border-[#E8D5A8]/20'
              } ${paused ? 'opacity-70' : ''}`}
            >
              {/* ---- Collapsed summary row (always visible) ---- */}
              <div className="flex items-center gap-3 p-3">
                {canDrag && (
                  <GripVertical className="w-3.5 h-3.5 text-[#6B6B6B] shrink-0 cursor-grab active:cursor-grabbing" />
                )}
                <button
                  type="button"
                  onClick={() => toggleExpanded(shade.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                >
                  {/* A thumbnail, never the full-size original: a product with
                      twelve shades would otherwise pull twelve gallery images
                      before the admin has expanded anything. */}
                  {thumb ? (
                    <img
                      src={cloudinaryImageUrl(thumb.url, { width: 64, quality: 'auto:good' })}
                      alt=""
                      loading="lazy"
                      className="w-8 h-8 rounded object-cover border border-[#E8D5A8]/20 shrink-0"
                    />
                  ) : (
                    <span
                      className="w-8 h-8 rounded border border-[#E8D5A8]/30 shrink-0"
                      style={{ backgroundColor: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(shade.hex) ? shade.hex : '#171717' }}
                    />
                  )}
                  <span className="font-semibold text-[#FAF9F6] truncate max-w-[12rem]">{shade.name || 'Untitled shade'}</span>
                  <span className="px-2 py-0.5 rounded-full border border-[#E8D5A8]/30 text-[9.5px] uppercase tracking-wider text-[#E8D5A8] shrink-0">
                    {shade.undertone}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[9.5px] font-bold uppercase tracking-wider shrink-0 ${
                      paused
                        ? 'bg-[#F05A7E]/15 text-[#F05A7E] border-[#F05A7E]/40'
                        : 'bg-[#C9972B]/10 text-[#E3B84B] border-[#C9972B]/40'
                    }`}
                  >
                    {paused ? 'Paused' : 'Active'}
                  </span>
                </button>

                <div className="hidden md:flex items-center gap-3 text-[10.5px] text-[#6B6B6B] shrink-0">
                  <span className="text-[#FAF9F6] font-semibold">
                    {summary.sizeCount > 1 ? 'from ' : ''}₹{summary.startingPrice}
                  </span>
                  {/* Compare-at and the saving it implies, derived from the
                      same pair of prices the storefront shows. Rendered only
                      when there is a real markdown — a compare-at equal to or
                      below the price states nothing. */}
                  {summary.startingCompareAtPrice !== undefined && summary.startingDiscountPercent !== null && (
                    <>
                      <span className="line-through">₹{summary.startingCompareAtPrice}</span>
                      <span className="text-[#E3B84B] font-bold">{summary.startingDiscountPercent}% off</span>
                    </>
                  )}
                  <span>{summary.totalStock} in stock</span>
                  <span>
                    {summary.imageCount} image{summary.imageCount === 1 ? '' : 's'}
                  </span>
                  {summary.sizeCount > 0 && (
                    <span>
                      {summary.sizeCount} size{summary.sizeCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full border text-[9.5px] font-bold uppercase tracking-wider shrink-0 ${
                    STATUS_STYLES[summary.status]
                  }`}
                >
                  {STATUS_TEXT[summary.status]}
                </span>

                <button
                  type="button"
                  onClick={() => toggleExpanded(shade.id)}
                  className="p-1 text-[#E8D5A8] hover:text-[#E3B84B] cursor-pointer shrink-0"
                  aria-label={expanded ? 'Collapse shade' : 'Expand shade'}
                >
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {/* Readiness chips — advisory, never blocking. A shade that
                  inherits the product price is a valid configuration, not a
                  mistake, so these inform rather than warn-and-stop. */}
              <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
                {summary.ready ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#C9972B]/10 border border-[#C9972B]/40 text-[9.5px] font-semibold text-[#E3B84B]">
                    <Check className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  summary.warnings.map((w) => (
                    <span
                      key={w}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#171717] border border-[#E8D5A8]/20 text-[9.5px] text-[#6B6B6B]"
                    >
                      <AlertTriangle className="w-3 h-3 text-[#E3B84B]" /> {w}
                    </span>
                  ))
                )}
              </div>

              {expanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-[#E8D5A8]/10 pt-3">
                  {/* ---- Identity ---- */}
                  <div>
                    <span className={LABEL}>Shade identity</span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <input
                        type="color"
                        value={/^#([0-9a-fA-F]{6})$/.test(shade.hex) ? shade.hex : '#F05A7E'}
                        onChange={(e) => updateShade(index, { hex: e.target.value })}
                        title="Pick a colour"
                        className="w-8 h-8 rounded border border-[#E8D5A8]/30 cursor-pointer bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={shade.hex}
                        placeholder="#RRGGBB"
                        maxLength={7}
                        onChange={(e) => updateShade(index, { hex: '#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6) })}
                        title="Type an exact hex code, e.g. #FCE8ED"
                        className="px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] w-20 font-mono uppercase"
                      />
                      <input
                        type="text"
                        value={shade.name}
                        placeholder="Variant / Shade Name"
                        onChange={(e) => updateShade(index, { name: e.target.value })}
                        className="flex-1 min-w-[140px] px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] font-semibold"
                      />
                      <select
                        value={shade.undertone}
                        onChange={(e) => updateShade(index, { undertone: e.target.value })}
                        className="px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                      >
                        <option value="Warm">Warm</option>
                        <option value="Cool">Cool</option>
                        <option value="Neutral">Neutral</option>
                        <option value="Olive">Olive</option>
                        <option value="Universal">Universal</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => updateShade(index, { isActive: paused })}
                        className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                          paused
                            ? 'bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30'
                            : 'bg-[#C9972B]/10 text-[#E3B84B] border border-[#C9972B]/40'
                        }`}
                        title="Toggle whether shoppers can select this variant"
                      >
                        {paused ? 'Paused' : 'Active'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className={MICRO_LABEL}>Shade SKU</label>
                      <input
                        type="text"
                        value={shade.sku || ''}
                        placeholder="Optional"
                        onChange={(e) => updateShade(index, { sku: e.target.value })}
                        className={INPUT}
                      />
                      {/* Which code actually ships is the resolved one: a
                          size's own SKU wins over the shade's, so a shade whose
                          sizes all carry codes never uses this field. */}
                      <p className="text-[9.5px] text-[#6B6B6B] mt-0.5">
                        {(shade.sizes || []).some((s) => s.sku?.trim())
                          ? 'Sizes below carry their own SKUs — those are used instead'
                          : shade.sku?.trim()
                          ? 'Identifies every unit of this shade'
                          : 'No SKU set for this variant'}
                      </p>
                    </div>
                    <div>
                      <label className={MICRO_LABEL}>Short Description</label>
                      <input
                        type="text"
                        value={shade.shortDescription || ''}
                        placeholder="e.g. Classic warm red"
                        onChange={(e) => updateShade(index, { shortDescription: e.target.value })}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={MICRO_LABEL}>Description</label>
                      <input
                        type="text"
                        value={shade.description}
                        placeholder="Shown on the product page under the swatches"
                        onChange={(e) => updateShade(index, { description: e.target.value })}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  {/* ---- Pricing ---- */}
                  <div className="pt-2 border-t border-[#E8D5A8]/10">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className={LABEL + ' mb-0'}>Pricing</span>
                      <span className="text-[10px] text-[#6B6B6B]">
                        Product base price: <span className="text-[#E8D5A8] font-semibold">₹{product.price}</span>
                        {product.originalPrice ? ` · compare-at ₹${product.originalPrice}` : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className={MICRO_LABEL}>Price (₹)</label>
                        <input
                          type="number"
                          min={0}
                          value={shade.price ?? ''}
                          placeholder={String(product.price)}
                          onChange={(e) =>
                            updateShade(index, { price: e.target.value === '' ? undefined : parseFloat(e.target.value) })
                          }
                          className={INPUT}
                        />
                        <p className="text-[9.5px] text-[#6B6B6B] mt-0.5">
                          {shade.price === undefined ? `Inherits product price (₹${product.price})` : 'Overrides product price'}
                        </p>
                      </div>
                      <div>
                        <label className={MICRO_LABEL}>Compare-At (₹)</label>
                        <input
                          type="number"
                          min={0}
                          value={shade.compareAtPrice ?? ''}
                          placeholder={product.originalPrice ? String(product.originalPrice) : 'Optional'}
                          onChange={(e) =>
                            updateShade(index, {
                              compareAtPrice: e.target.value === '' ? undefined : parseFloat(e.target.value),
                            })
                          }
                          className={`${INPUT} ${
                            shade.compareAtPrice !== undefined && shade.compareAtPrice < (shade.price ?? product.price)
                              ? 'border-[#F05A7E]'
                              : ''
                          }`}
                        />
                        {shade.compareAtPrice !== undefined &&
                          shade.compareAtPrice < (shade.price ?? product.price) && (
                            <p className="text-[9.5px] text-[#F05A7E] mt-0.5">Must be ≥ the selling price</p>
                          )}
                      </div>
                      <div>
                        <label className={MICRO_LABEL}>Discount</label>
                        {/* Calculated, not editable — there is no discount
                            field on a shade and this does not add one. */}
                        <div className="px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/20 rounded text-xs">
                          {shadeDiscount !== null ? (
                            <span className="text-[#E3B84B] font-bold">{shadeDiscount}% OFF</span>
                          ) : (
                            <span className="text-[#6B6B6B]">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className={MICRO_LABEL}>Stock</label>
                        <input
                          type="number"
                          min={0}
                          value={shade.stock ?? ''}
                          placeholder={String(product.stock ?? 0)}
                          onChange={(e) =>
                            updateShade(index, {
                              stock: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          disabled={sqlInventoryMode}
                          title={sqlInventoryMode ? 'SQL inventory owns this number — adjust it in the Inventory panel' : undefined}
                          className={`${INPUT} ${sqlInventoryMode ? 'cursor-not-allowed opacity-50' : ''}`}
                        />
                        <p className="text-[9.5px] text-[#6B6B6B] mt-0.5">
                          {sizes.length > 0
                            ? 'Fallback — the selected size’s stock applies first'
                            : shade.stock === undefined
                            ? `Inherits product stock (${product.stock ?? 0})`
                            : 'Overrides product stock'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ---- Sizes ---- */}
                  <div className="pt-2 border-t border-[#E8D5A8]/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className={LABEL + ' mb-0'}>Sizes for this shade ({sizes.length})</span>
                      <button
                        type="button"
                        onClick={() => handleAddSize(index)}
                        className="flex items-center gap-1 text-[10.5px] text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Size</span>
                      </button>
                    </div>

                    {sizes.length === 0 ? (
                      <p className="text-[10.5px] text-[#6B6B6B] italic">
                        No sizes — this shade sells at the single price above. Shades do not have to match: one can offer 30g and 50g while another offers only 50g.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-[10.5px]">
                          <thead>
                            <tr className="text-left text-[#E8D5A8] uppercase tracking-wider text-[9.5px]">
                              <th className="py-1 pr-2 font-semibold">Size</th>
                              <th className="py-1 pr-2 font-semibold">Price</th>
                              <th className="py-1 pr-2 font-semibold">Compare-at</th>
                              <th className="py-1 pr-2 font-semibold">Discount</th>
                              <th className="py-1 pr-2 font-semibold">Stock</th>
                              <th className="py-1 pr-2 font-semibold">SKU</th>
                              <th className="py-1 pr-2 font-semibold">Status</th>
                              <th className="py-1 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sizes.map((size) => {
                              const sizePaused = size.isActive === false;
                              const effectiveStock = size.stock ?? shade.stock ?? product.stock ?? 0;
                              const status = sizePaused ? 'out-of-stock' : stockStatus(effectiveStock);
                              const discount = getDiscountPercent(size.price, size.compareAtPrice);
                              const badCompareAt = size.compareAtPrice !== undefined && size.compareAtPrice < size.price;
                              return (
                                <tr key={size.id} className="border-t border-[#E8D5A8]/10">
                                  <td className="py-1.5 pr-2">
                                    <input
                                      type="text"
                                      defaultValue={size.label}
                                      onBlur={(e) =>
                                        updateSizeField(index, size.id, { label: e.target.value.trim() || size.label })
                                      }
                                      placeholder="e.g. 50g"
                                      className={`${INPUT_DARK} w-24 font-semibold`}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <input
                                      type="number"
                                      min={0}
                                      value={size.price ?? ''}
                                      onChange={(e) =>
                                        updateSizeField(index, size.id, { price: parseFloat(e.target.value) || 0 })
                                      }
                                      className={`${INPUT_DARK} w-20`}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <input
                                      type="number"
                                      min={0}
                                      value={size.compareAtPrice ?? ''}
                                      placeholder="Optional"
                                      onChange={(e) =>
                                        updateSizeField(index, size.id, {
                                          compareAtPrice: e.target.value === '' ? undefined : parseFloat(e.target.value),
                                        })
                                      }
                                      className={`${INPUT_DARK} w-20 ${badCompareAt ? 'border-[#F05A7E]' : ''}`}
                                      title={badCompareAt ? 'Compare-at must be ≥ the selling price' : undefined}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {discount !== null ? (
                                      <span className="text-[#E3B84B] font-bold">{discount}%</span>
                                    ) : (
                                      <span className="text-[#6B6B6B]">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <input
                                      type="number"
                                      min={0}
                                      value={size.stock ?? ''}
                                      placeholder={String(shade.stock ?? product.stock ?? 0)}
                                      onChange={(e) =>
                                        updateSizeField(index, size.id, {
                                          stock: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0),
                                        })
                                      }
                                      disabled={sqlInventoryMode}
                                      title={
                                        sqlInventoryMode
                                          ? 'SQL inventory owns this number — adjust it in the Inventory panel'
                                          : 'Blank falls back to the shade, then the product'
                                      }
                                      className={`${INPUT_DARK} w-16 ${sqlInventoryMode ? 'cursor-not-allowed opacity-50' : ''}`}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <input
                                      type="text"
                                      value={size.sku || ''}
                                      placeholder="Optional"
                                      onChange={(e) => updateSizeField(index, size.id, { sku: e.target.value })}
                                      className={`${INPUT_DARK} w-28`}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${STATUS_STYLES[status]}`}
                                    >
                                      {sizePaused ? 'Paused' : STATUS_TEXT[status]}
                                    </span>
                                  </td>
                                  <td className="py-1.5">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => updateSizeField(index, size.id, { isActive: sizePaused })}
                                        className="p-1 text-[#E8D5A8] hover:text-[#E3B84B] cursor-pointer"
                                        title={sizePaused ? 'Make this size selectable' : 'Pause this size'}
                                      >
                                        {sizePaused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDuplicateSize(index, size.id)}
                                        className="p-1 text-[#E8D5A8] hover:text-[#E3B84B] cursor-pointer"
                                        title="Duplicate this size"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openDeleteConfirm({ kind: 'size', index, shade, size })}
                                        className="p-1 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer"
                                        title="Remove this size"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {activeSizes.length === 0 && sizes.length > 0 && (
                          <p className="text-[9.5px] text-[#F05A7E] mt-1.5">
                            Every size is paused — this shade falls back to its own price and stock above.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ---- Gallery ---- */}
                  <div className="pt-2 border-t border-[#E8D5A8]/10">
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <span className={LABEL + ' mb-0'}>Variant Images ({images.length})</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={imageUrlDraft[shade.id] || ''}
                          onChange={(e) => setImageUrlDraft((prev) => ({ ...prev, [shade.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddImageUrl(index);
                            }
                          }}
                          placeholder="https://... image URL"
                          className="w-40 px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10.5px] text-[#FAF9F6]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddImageUrl(index)}
                          disabled={!(imageUrlDraft[shade.id] || '').trim()}
                          className="px-2.5 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10.5px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Add URL
                        </button>
                        <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10.5px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer">
                          <Upload className="w-3 h-3" />
                          <span>{uploadingShadeId === shade.id ? 'Uploading...' : 'Upload Images'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            disabled={uploadingShadeId === shade.id}
                            onChange={(e) => {
                              handleUploadImages(index, e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {images.length === 0 ? (
                      <p className="text-[10.5px] text-[#6B6B6B] italic">
                        No variant images yet — the storefront falls back to this product's default images for this shade.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {images.map((img, imgIdx) => (
                          <div
                            key={img.id}
                            draggable
                            onDragStart={() => setDragImage({ shadeId: shade.id, imgIdx })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleImageDrop(index, imgIdx)}
                            className={`relative aspect-square rounded-lg overflow-hidden border bg-[#0B0B0B] flex items-center justify-center group cursor-grab active:cursor-grabbing ${
                              img.isPrimary ? 'border-[#C9972B] ring-1 ring-[#C9972B]' : 'border-[#E8D5A8]/20'
                            }`}
                            title="Drag to reorder"
                          >
                            {editingUrlImageId === img.id ? (
                              <div
                                className="absolute inset-0 z-20 flex flex-col items-stretch justify-center gap-1.5 bg-[#0B0B0B]/95 p-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingUrlDraft}
                                  onChange={(e) => setEditingUrlDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleUpdateImageUrl(index, img.id, editingUrlDraft);
                                    } else if (e.key === 'Escape') {
                                      setEditingUrlImageId(null);
                                    }
                                  }}
                                  placeholder="https://... image URL"
                                  className="w-full px-1.5 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[9.5px] text-[#FAF9F6]"
                                />
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateImageUrl(index, img.id, editingUrlDraft)}
                                    disabled={!editingUrlDraft.trim()}
                                    className="p-1 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] text-[#E8D5A8] rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Save URL"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingUrlImageId(null)}
                                    className="p-1 bg-[#171717] hover:bg-[#F05A7E] hover:text-white text-[#E8D5A8] rounded cursor-pointer"
                                    title="Cancel"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ) : replacingImageId === img.id ? (
                              <div className="flex flex-col items-center gap-1 text-[#E8D5A8] px-1 text-center">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span className="text-[8.5px] leading-tight">Replacing...</span>
                              </div>
                            ) : brokenImageIds.has(img.id) ? (
                              <div
                                className="flex flex-col items-center gap-1 text-[#6B6B6B] px-1 text-center cursor-pointer"
                                onClick={() => {
                                  setEditingUrlDraft(img.url);
                                  setEditingUrlImageId(img.id);
                                }}
                              >
                                <ImageOff className="w-4 h-4" />
                                <span className="text-[8.5px] leading-tight">Failed to load — click to fix URL</span>
                              </div>
                            ) : (
                              <img
                                src={cloudinaryImageUrl(img.url, 'thumb')}
                                alt={img.alt || shade.name}
                                loading="lazy"
                                className="w-full h-full object-contain cursor-pointer"
                                onClick={() => {
                                  setEditingUrlDraft(img.url);
                                  setEditingUrlImageId(img.id);
                                }}
                                onError={() => setBrokenImageIds((prev) => new Set(prev).add(img.id))}
                              />
                            )}
                            <div className="absolute top-1 left-1 p-0.5 bg-[#0B0B0B]/70 rounded text-[#E8D5A8]">
                              <GripVertical className="w-3 h-3" />
                            </div>
                            {img.isPrimary && (
                              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-[#C9972B] text-[#0B0B0B] text-[8.5px] font-bold uppercase rounded">
                                Primary
                              </span>
                            )}
                            <div
                              className={`absolute top-1 right-1 flex items-center gap-1 transition-opacity ${
                                editingUrlImageId === img.id
                                  ? 'hidden'
                                  : brokenImageIds.has(img.id)
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUrlDraft(img.url);
                                  setEditingUrlImageId(img.id);
                                }}
                                className="p-1 bg-[#0B0B0B]/80 hover:bg-[#C9972B] hover:text-[#0B0B0B] text-[#E8D5A8] rounded cursor-pointer"
                                title="Change image URL"
                              >
                                <Link className="w-3 h-3" />
                              </button>
                              <label
                                className="p-1 bg-[#0B0B0B]/80 hover:bg-[#C9972B] hover:text-[#0B0B0B] text-[#E8D5A8] rounded cursor-pointer"
                                title="Replace this image"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={replacingImageId === img.id}
                                  onChange={(e) => {
                                    handleReplaceImage(index, img.id, e.target.files?.[0]);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {!img.isPrimary && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimary(index, img.id)}
                                  className="p-1 bg-[#0B0B0B]/80 hover:bg-[#C9972B] hover:text-[#0B0B0B] text-[#E8D5A8] rounded cursor-pointer"
                                  title="Set as primary image"
                                >
                                  <Star className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteImage(index, img.id)}
                                className="p-1 bg-[#0B0B0B]/80 hover:bg-[#F05A7E] text-[#E8D5A8] hover:text-white rounded cursor-pointer"
                                title="Remove from this shade"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ---- Card actions ---- */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E8D5A8]/10">
                    <button
                      type="button"
                      onClick={() => updateShade(index, { isActive: paused })}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#171717] border border-[#E8D5A8]/30 text-[10.5px] font-semibold text-[#FAF9F6] hover:bg-[#C9972B] hover:text-[#0B0B0B] transition-colors cursor-pointer"
                    >
                      {paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                      <span>{paused ? 'Activate Shade' : 'Pause Shade'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateShade(index)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#171717] border border-[#E8D5A8]/30 text-[10.5px] font-semibold text-[#FAF9F6] hover:bg-[#C9972B] hover:text-[#0B0B0B] transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicate Shade</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openDeleteConfirm({ kind: 'shade', index, shade })}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#171717] border border-[#F05A7E]/40 text-[10.5px] font-semibold text-[#F05A7E] hover:bg-[#F05A7E] hover:text-white transition-colors cursor-pointer ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Shade</span>
                    </button>
                  </div>
                  <p className="text-[9.5px] text-[#6B6B6B]">
                    Changes are applied when you save the product.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {uploadError && <p className="text-[11px] text-[#F05A7E]">{uploadError}</p>}

      {/* ---- Delete confirmation ---------------------------------------
          A shade id is the variant identity on order lines and inventory
          rows. Deleting is allowed, but never without saying what is
          already pointing at it, and never without offering the reversible
          alternative first. */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0B0B]/80 p-4">
          <div className="w-full max-w-md p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F05A7E] shrink-0 mt-0.5" />
              <div>
                <h4 className="font-serif text-base text-[#FAF9F6]">Delete "{pendingLabel}"?</h4>
                <p className="text-[11px] text-[#6B6B6B] mt-1">
                  {pendingDelete.kind === 'shade'
                    ? 'This removes the shade from the product when you save. Past orders keep their line items either way — but they will no longer be able to name which shade was shipped.'
                    : 'This removes the size from this shade when you save. Past orders keep their line items either way — but they will no longer be able to name which size was shipped.'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 text-[11px] space-y-1">
              {usageLoading ? (
                <span className="flex items-center gap-2 text-[#6B6B6B]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking what references this{' '}
                  {pendingDelete.kind === 'shade' ? 'shade' : 'size'}...
                </span>
              ) : !pendingUsage ? (
                <span className="text-[#6B6B6B]">
                  Nothing references this {pendingDelete.kind === 'shade' ? 'shade' : 'size'} yet.
                </span>
              ) : (
                <>
                  <p className={pendingUsage.orderLineCount > 0 ? 'text-[#E3B84B]' : 'text-[#6B6B6B]'}>
                    {pendingUsage.orderLineCount} order line{pendingUsage.orderLineCount === 1 ? '' : 's'} across{' '}
                    {pendingUsage.orderCount} order{pendingUsage.orderCount === 1 ? '' : 's'}
                  </p>
                  <p className={pendingUsage.cartLineCount > 0 ? 'text-[#E3B84B]' : 'text-[#6B6B6B]'}>
                    {pendingUsage.cartLineCount} shopper bag{pendingUsage.cartLineCount === 1 ? '' : 's'} currently holding it
                  </p>
                  <p className={pendingUsage.inventoryReserved > 0 ? 'text-[#E3B84B]' : 'text-[#6B6B6B]'}>
                    Inventory — {pendingUsage.inventoryAvailable} available, {pendingUsage.inventoryReserved} reserved,{' '}
                    {pendingUsage.inventorySold} sold
                  </p>
                </>
              )}
            </div>

            {hasHistory && (
              <p className="text-[11px] text-[#F05A7E]">
                This {pendingDelete.kind === 'shade' ? 'shade' : 'size'} has sales or reservations against it. Pausing
                keeps that history readable and still removes it from the storefront.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="px-3 py-2 rounded bg-[#0B0B0B] border border-[#E8D5A8]/30 text-[11px] font-semibold text-[#FAF9F6] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={pauseInsteadOfDeleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#C9972B] text-[#0B0B0B] text-[11px] font-bold uppercase tracking-wider cursor-pointer"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>Pause Instead</span>
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#F05A7E] text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{pendingDelete.kind === 'shade' ? 'Delete Shade' : 'Delete Size'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
