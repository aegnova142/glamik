/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { Product, Shade, VariantImage, SizeOption, ProductAttribute, UsageStep } from '../../types';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  Copy,
  Check,
  Save,
  Image as ImageIcon,
  ArrowLeft,
  Tag,
  Sparkles,
  Star,
  Upload,
  GripVertical,
  X,
  ImageOff,
  RefreshCw,
  Link,
} from 'lucide-react';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useDragReorder } from '../../hooks/useDragReorder';
import { PRODUCT_TAXONOMY } from '../../data/taxonomy';

type ProductImageSlot = 'primary' | 'secondary' | 'detail' | 'texture' | 'lifestyle' | 'swatch';

const newVariantImageId = () => 'vimg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

export const AdminProducts: React.FC = () => {
  const { products, categories, saveProduct, deleteProduct, duplicateProduct } = useCMS();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<ProductImageSlot | null>(null);
  const [uploadingShadeIndex, setUploadingShadeIndex] = useState<number | null>(null);
  const [dragImage, setDragImage] = useState<{ shadeIdx: number; imgIdx: number } | null>(null);
  const [brokenVariantImageIds, setBrokenVariantImageIds] = useState<Set<string>>(new Set());
  const [brokenSlotKeys, setBrokenSlotKeys] = useState<Set<ProductImageSlot>>(new Set());
  const [variantImageUrlDraft, setVariantImageUrlDraft] = useState<Record<number, string>>({});
  const [replacingVariantImageId, setReplacingVariantImageId] = useState<string | null>(null);
  const [editingUrlImageId, setEditingUrlImageId] = useState<string | null>(null);
  const [editingUrlDraft, setEditingUrlDraft] = useState('');
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);

  const { upload, error: uploadError } = useFileUpload({
    acceptedTypes: ['image/'],
    maxSizeBytes: 8 * 1024 * 1024,
    typeErrorMessage: 'Please choose an image file (JPG, PNG, or WebP).',
  });

  // Product Details & Content — reorder handles for the four dynamic lists.
  // Hooks must run unconditionally every render, so these are declared here
  // (not inside the `if (editingProduct)` branch below) and simply no-op
  // via the `?? []` fallback while there's nothing being edited.
  const { dragIndex: benefitDragIndex, setDragIndex: setBenefitDragIndex, handleDrop: handleBenefitDrop } = useDragReorder<string>(
    editingProduct?.benefits ?? [],
    (next) => editingProduct && setEditingProduct({ ...editingProduct, benefits: next })
  );
  const { dragIndex: attrDragIndex, setDragIndex: setAttrDragIndex, handleDrop: handleAttrDrop } = useDragReorder<ProductAttribute>(
    editingProduct?.attributes ?? [],
    (next) => editingProduct && setEditingProduct({ ...editingProduct, attributes: next.map((a, i) => ({ ...a, sortOrder: i })) })
  );
  const { dragIndex: stepDragIndex, setDragIndex: setStepDragIndex, handleDrop: handleStepDrop } = useDragReorder<UsageStep>(
    editingProduct?.usageSteps ?? [],
    (next) => editingProduct && setEditingProduct({ ...editingProduct, usageSteps: next.map((s, i) => ({ ...s, sortOrder: i })) })
  );
  const { dragIndex: ingredientDragIndex, setDragIndex: setIngredientDragIndex, handleDrop: handleIngredientDrop } = useDragReorder<string>(
    editingProduct?.ingredients ?? [],
    (next) => editingProduct && setEditingProduct({ ...editingProduct, ingredients: next })
  );

  const handleAddBenefit = () => {
    if (!editingProduct) return;
    setEditingProduct({ ...editingProduct, benefits: [...editingProduct.benefits, ''] });
  };
  const handleUpdateBenefit = (idx: number, text: string) => {
    if (!editingProduct) return;
    const updated = [...editingProduct.benefits];
    updated[idx] = text;
    setEditingProduct({ ...editingProduct, benefits: updated });
  };
  const handleDeleteBenefit = (idx: number) => {
    if (!editingProduct) return;
    setEditingProduct({ ...editingProduct, benefits: editingProduct.benefits.filter((_, i) => i !== idx) });
  };

  const newAttributeId = () => 'attr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const handleAddAttribute = () => {
    if (!editingProduct) return;
    const attrs = editingProduct.attributes ?? [];
    setEditingProduct({
      ...editingProduct,
      attributes: [...attrs, { id: newAttributeId(), name: '', value: '', sortOrder: attrs.length }],
    });
  };
  const handleUpdateAttribute = (idx: number, key: 'name' | 'value', val: string) => {
    if (!editingProduct || !editingProduct.attributes) return;
    const updated = [...editingProduct.attributes];
    updated[idx] = { ...updated[idx], [key]: val };
    setEditingProduct({ ...editingProduct, attributes: updated });
  };
  const handleDeleteAttribute = (idx: number) => {
    if (!editingProduct || !editingProduct.attributes) return;
    setEditingProduct({ ...editingProduct, attributes: editingProduct.attributes.filter((_, i) => i !== idx) });
  };

  const newStepId = () => 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const handleAddStep = () => {
    if (!editingProduct) return;
    const steps = editingProduct.usageSteps ?? [];
    setEditingProduct({
      ...editingProduct,
      usageSteps: [...steps, { id: newStepId(), text: '', sortOrder: steps.length }],
    });
  };
  const handleUpdateStepText = (idx: number, text: string) => {
    if (!editingProduct || !editingProduct.usageSteps) return;
    const updated = [...editingProduct.usageSteps];
    updated[idx] = { ...updated[idx], text };
    setEditingProduct({ ...editingProduct, usageSteps: updated });
  };
  const handleDeleteStep = (idx: number) => {
    if (!editingProduct || !editingProduct.usageSteps) return;
    setEditingProduct({ ...editingProduct, usageSteps: editingProduct.usageSteps.filter((_, i) => i !== idx) });
  };
  const handleUploadStepImage = async (idx: number, file: File | undefined) => {
    if (!editingProduct || !editingProduct.usageSteps) return;
    const step = editingProduct.usageSteps[idx];
    setUploadingStepId(step.id);
    const mediaItem = await upload(file);
    setUploadingStepId(null);
    if (!mediaItem) return;
    setEditingProduct((prev) => {
      if (!prev || !prev.usageSteps) return prev;
      const updated = [...prev.usageSteps];
      updated[idx] = { ...updated[idx], image: mediaItem.url };
      return { ...prev, usageSteps: updated };
    });
  };

  const handleAddIngredient = () => {
    if (!editingProduct) return;
    setEditingProduct({ ...editingProduct, ingredients: [...(editingProduct.ingredients ?? []), ''] });
  };
  const handleUpdateIngredient = (idx: number, text: string) => {
    if (!editingProduct || !editingProduct.ingredients) return;
    const updated = [...editingProduct.ingredients];
    updated[idx] = text;
    setEditingProduct({ ...editingProduct, ingredients: updated });
  };
  const handleDeleteIngredient = (idx: number) => {
    if (!editingProduct || !editingProduct.ingredients) return;
    setEditingProduct({ ...editingProduct, ingredients: editingProduct.ingredients.filter((_, i) => i !== idx) });
  };

  const handleSlotUpload = async (slot: ProductImageSlot, file: File | undefined) => {
    setUploadingSlot(slot);
    const mediaItem = await upload(file);
    setUploadingSlot(null);
    if (mediaItem) {
      setBrokenSlotKeys((prev) => {
        if (!prev.has(slot)) return prev;
        const next = new Set(prev);
        next.delete(slot);
        return next;
      });
      setEditingProduct((prev) => (prev ? { ...prev, images: { ...prev.images, [slot]: mediaItem.url } } : prev));
    }
  };

  const filteredProducts = (products || []).filter((p) => {
    const matchesSearch =
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.subCategory || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'ALL' || (p.category || '').toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCat;
  });

  const handleCreateNewProduct = () => {
    const newProd: Product = {
      id: 'prod-' + Date.now(),
      name: '',
      category: 'Makeup',
      subCategory: 'Lips',
      subtitle: '',
      description: '',
      ritual: '',
      price: 1299,
      originalPrice: 1599,
      currency: '₹',
      inStock: true,
      stock: 50,
      tag: 'NEW',
      benefits: ['12H Transfer-Proof', 'Weightless Velvet', 'Non-Drying Botanical Base'],
      images: {
        primary: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=1200&q=80',
        secondary: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
      },
      shades: [
        {
          id: 'shade-' + Date.now(),
          name: 'Royal Terracotta',
          hex: '#C9972B',
          undertone: 'Warm',
          description: 'Warm burnt saffron and cinnamon nude.',
          isActive: true,
          images: [],
        },
      ],
      details: {
        overview: 'Richly pigmented formula designed for South Asian undertones.',
        howToUse: 'Glide onto lips with the precision doe-foot applicator.',
        ingredientsList: 'Isododecane, Dimethicone, Jojoba Esters, Tocopherol Acetate, CI 77491.',
        shippingReturns: 'Complimentary shipping above ₹999. 7-day hassle-free returns on unopened goods.',
      },
      relatedProductIds: [],
      completeTheLookProductIds: [],
    };
    setEditingProduct(newProd);
  };

  const validateProduct = (product: Product): string | null => {
    if (!product.name.trim()) return 'Product Name is required before saving.';
    if (!(product.shades || []).every((s) => s.name.trim())) {
      return 'Every variant needs a name before saving.';
    }
    const skus = (product.shades || []).map((s) => s.sku?.trim()).filter((sku): sku is string => !!sku);
    if (new Set(skus).size !== skus.length) {
      return 'Two variants on this product share the same SKU. SKUs must be unique per product.';
    }
    for (const s of product.shades || []) {
      if (s.price !== undefined && (isNaN(s.price) || s.price < 0)) {
        return `${s.name || 'A variant'} has an invalid price.`;
      }
      if (s.stock !== undefined && (isNaN(s.stock) || s.stock < 0)) {
        return `${s.name || 'A variant'} has an invalid stock quantity.`;
      }
      if (s.sizes && s.sizes.length > 0) {
        const labels = s.sizes.map((sz) => sz.label.trim());
        for (const sz of s.sizes) {
          if (!sz.label.trim()) return `A size on variant "${s.name}" needs a label.`;
          if (isNaN(sz.price) || sz.price < 0) return `Size "${sz.label}" on variant "${s.name}" has an invalid price.`;
          if (sz.stock !== undefined && (isNaN(sz.stock) || sz.stock < 0)) return `Size "${sz.label}" on variant "${s.name}" has an invalid stock quantity.`;
        }
        if (new Set(labels).size !== labels.length) return `Variant "${s.name}" has duplicate size labels.`;
      }
    }
    if (product.sizePricing) {
      for (const [label, entry] of Object.entries(product.sizePricing)) {
        if (isNaN(entry.price) || entry.price < 0) return `Size "${label}" has an invalid price.`;
        if (entry.stock !== undefined && (isNaN(entry.stock) || entry.stock < 0)) return `Size "${label}" has an invalid stock quantity.`;
      }
    }
    if ((product.benefits || []).some((b) => !b.trim())) {
      return 'Remove empty benefit entries before saving (or fill them in).';
    }
    for (const attr of product.attributes || []) {
      if (!attr.name.trim() || !attr.value.trim()) {
        return 'Every attribute needs both a name and a value.';
      }
    }
    for (const step of product.usageSteps || []) {
      if (!step.text.trim()) return 'Every How-to-Use step needs instruction text.';
    }
    if ((product.ingredients || []).some((i) => !i.trim())) {
      return 'Remove empty ingredient entries before saving (or fill them in).';
    }
    return null;
  };

  const handleSaveProduct = async () => {
    if (!editingProduct) return;
    const validationError = validateProduct(editingProduct);
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    const ok = await saveProduct(editingProduct);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingProduct(null);
      }, 800);
    } else {
      setSaveError('Save failed. Please try again.');
    }
  };

  const handleAddShade = () => {
    if (!editingProduct) return;
    const newShade: Shade = {
      id: 'shade-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: 'New Shade',
      hex: '#F05A7E',
      undertone: 'Warm',
      description: 'Calibrated luxury pigment.',
      isActive: true,
      images: [],
    };
    setEditingProduct({
      ...editingProduct,
      shades: [...(editingProduct.shades || []), newShade],
    });
  };

  const handleUpdateShade = (index: number, key: keyof Shade, val: any) => {
    if (!editingProduct || !editingProduct.shades) return;
    const updated = [...editingProduct.shades];
    updated[index] = { ...updated[index], [key]: val };
    setEditingProduct({ ...editingProduct, shades: updated });
  };

  const handleDeleteShade = (index: number) => {
    if (!editingProduct || !editingProduct.shades) return;
    const updated = editingProduct.shades.filter((_, i) => i !== index);
    setEditingProduct({ ...editingProduct, shades: updated });
  };

  const updateShadeSizes = (shadeIndex: number, updater: (sizes: SizeOption[]) => SizeOption[]) => {
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      shades[shadeIndex] = { ...shade, sizes: updater(shade.sizes || []) };
      return { ...prev, shades };
    });
  };

  const handleAddShadeSize = (shadeIndex: number) => {
    if (!editingProduct) return;
    const shade = editingProduct.shades?.[shadeIndex];
    if (!shade) return;
    const existingLabels = (shade.sizes || []).map((s) => s.label);
    let label = 'New Size';
    let n = 2;
    while (existingLabels.includes(label)) label = `New Size ${n++}`;
    const newSize: SizeOption = {
      id: 'size-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      label,
      price: shade.price ?? editingProduct.price,
    };
    updateShadeSizes(shadeIndex, (sizes) => [...sizes, newSize]);
  };

  const handleRenameShadeSize = (shadeIndex: number, sizeId: string, newLabel: string) => {
    if (!newLabel.trim()) return;
    updateShadeSizes(shadeIndex, (sizes) => sizes.map((s) => (s.id === sizeId ? { ...s, label: newLabel.trim() } : s)));
  };

  const handleUpdateShadeSizeField = (
    shadeIndex: number,
    sizeId: string,
    key: 'price' | 'compareAtPrice' | 'stock',
    val: number | undefined
  ) => {
    updateShadeSizes(shadeIndex, (sizes) => sizes.map((s) => (s.id === sizeId ? { ...s, [key]: val } : s)));
  };

  const handleDeleteShadeSize = (shadeIndex: number, sizeId: string) => {
    updateShadeSizes(shadeIndex, (sizes) => sizes.filter((s) => s.id !== sizeId));
  };

  const handleAddVariantImages = async (shadeIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingShadeIndex(shadeIndex);
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
    setUploadingShadeIndex(null);
    if (uploaded.length === 0) return;
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      const merged = [...(shade.images || []), ...uploaded].map((img, i) => ({ ...img, sortOrder: i }));
      if (!merged.some((img) => img.isPrimary)) merged[0].isPrimary = true;
      shades[shadeIndex] = { ...shade, images: merged };
      return { ...prev, shades };
    });
  };

  const handleAddVariantImageUrl = (shadeIndex: number, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      const newImage: VariantImage = {
        id: newVariantImageId(),
        url: trimmed,
        publicId: '',
        alt: '',
        sortOrder: 0,
        isPrimary: false,
      };
      const merged = [...(shade.images || []), newImage].map((img, i) => ({ ...img, sortOrder: i }));
      if (!merged.some((img) => img.isPrimary)) merged[0].isPrimary = true;
      shades[shadeIndex] = { ...shade, images: merged };
      return { ...prev, shades };
    });
    setVariantImageUrlDraft((prev) => ({ ...prev, [shadeIndex]: '' }));
  };

  const handleReplaceVariantImage = async (shadeIndex: number, imageId: string, file: File | undefined) => {
    if (!file) return;
    setReplacingVariantImageId(imageId);
    const mediaItem = await upload(file);
    setReplacingVariantImageId(null);
    if (!mediaItem) return;
    setBrokenVariantImageIds((prev) => {
      if (!prev.has(imageId)) return prev;
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      shades[shadeIndex] = {
        ...shade,
        images: (shade.images || []).map((img) =>
          img.id === imageId ? { ...img, url: mediaItem.url, publicId: mediaItem.publicId } : img
        ),
      };
      return { ...prev, shades };
    });
  };

  const handleUpdateVariantImageUrl = (shadeIndex: number, imageId: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBrokenVariantImageIds((prev) => {
      if (!prev.has(imageId)) return prev;
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      shades[shadeIndex] = {
        ...shade,
        images: (shade.images || []).map((img) =>
          img.id === imageId ? { ...img, url: trimmed, publicId: '' } : img
        ),
      };
      return { ...prev, shades };
    });
    setEditingUrlImageId(null);
    setEditingUrlDraft('');
  };

  const handleDeleteVariantImage = (shadeIndex: number, imageId: string) => {
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      const wasPrimary = shade.images?.find((img) => img.id === imageId)?.isPrimary;
      const remaining = (shade.images || [])
        .filter((img) => img.id !== imageId)
        .map((img, i) => ({ ...img, sortOrder: i }));
      if (wasPrimary && remaining.length > 0) remaining[0].isPrimary = true;
      shades[shadeIndex] = { ...shade, images: remaining };
      return { ...prev, shades };
    });
  };

  const handleSetPrimaryVariantImage = (shadeIndex: number, imageId: string) => {
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      shades[shadeIndex] = {
        ...shade,
        images: (shade.images || []).map((img) => ({ ...img, isPrimary: img.id === imageId })),
      };
      return { ...prev, shades };
    });
  };

  const handleAddSize = () => {
    if (!editingProduct) return;
    let label = 'New Size';
    let n = 2;
    const existing = editingProduct.sizes || [];
    while (existing.includes(label)) {
      label = `New Size ${n++}`;
    }
    setEditingProduct({
      ...editingProduct,
      sizes: [...existing, label],
      sizePricing: { ...(editingProduct.sizePricing || {}), [label]: { price: editingProduct.price } },
      selectedSize: editingProduct.selectedSize || label,
    });
  };

  const handleRenameSize = (oldLabel: string, newLabel: string) => {
    if (!editingProduct || !newLabel.trim() || oldLabel === newLabel) return;
    const sizes = (editingProduct.sizes || []).map((s) => (s === oldLabel ? newLabel : s));
    const sizePricing = { ...(editingProduct.sizePricing || {}) };
    if (sizePricing[oldLabel]) {
      sizePricing[newLabel] = sizePricing[oldLabel];
      delete sizePricing[oldLabel];
    }
    setEditingProduct({
      ...editingProduct,
      sizes,
      sizePricing,
      selectedSize: editingProduct.selectedSize === oldLabel ? newLabel : editingProduct.selectedSize,
    });
  };

  const handleUpdateSizePricing = (label: string, key: 'price' | 'compareAtPrice' | 'stock', val: number | undefined) => {
    if (!editingProduct) return;
    const sizePricing = { ...(editingProduct.sizePricing || {}) };
    const entry = sizePricing[label] || { price: editingProduct.price };
    sizePricing[label] = { ...entry, [key]: val };
    setEditingProduct({ ...editingProduct, sizePricing });
  };

  const handleDeleteSize = (label: string) => {
    if (!editingProduct) return;
    const sizes = (editingProduct.sizes || []).filter((s) => s !== label);
    const sizePricing = { ...(editingProduct.sizePricing || {}) };
    delete sizePricing[label];
    setEditingProduct({
      ...editingProduct,
      sizes,
      sizePricing,
      selectedSize: editingProduct.selectedSize === label ? sizes[0] : editingProduct.selectedSize,
    });
  };

  const handleVariantImageDrop = (shadeIndex: number, targetIdx: number) => {
    if (!dragImage || dragImage.shadeIdx !== shadeIndex || dragImage.imgIdx === targetIdx) {
      setDragImage(null);
      return;
    }
    setEditingProduct((prev) => {
      if (!prev || !prev.shades) return prev;
      const shades = [...prev.shades];
      const shade = shades[shadeIndex];
      const images = [...(shade.images || [])];
      const [moved] = images.splice(dragImage.imgIdx, 1);
      images.splice(targetIdx, 0, moved);
      shades[shadeIndex] = { ...shade, images: images.map((img, i) => ({ ...img, sortOrder: i })) };
      return { ...prev, shades };
    });
    setDragImage(null);
  };

  // If editing a product
  if (editingProduct) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingProduct(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="font-serif text-xl text-[#FAF9F6]">{editingProduct.name}</h2>
              <span className="text-xs text-[#6B6B6B] font-mono">ID: {editingProduct.id}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {saveError && <span className="text-xs text-[#F05A7E] max-w-xs text-right">{saveError}</span>}
            <button
              onClick={handleSaveProduct}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Product'}</span>
            </button>
          </div>
        </div>

        {/* Product Edit Fields */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-8 space-y-5">
            <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <h3 className="font-serif text-base text-[#FAF9F6]">Product Details</h3>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder="e.g. Velvet Matte Liquid Lipstick"
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={editingProduct.subtitle}
                  onChange={(e) => setEditingProduct({ ...editingProduct, subtitle: e.target.value })}
                  placeholder="e.g. Formulated with high-potency micro-pigments"
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editingProduct.description}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder="e.g. Velvet soft matte formulation designed for 12-hour weightless comfort."
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Application Ritual
                </label>
                <textarea
                  rows={2}
                  value={editingProduct.ritual}
                  onChange={(e) => setEditingProduct({ ...editingProduct, ritual: e.target.value })}
                  placeholder="e.g. Apply directly onto clean, exfoliated lips starting from the center outward."
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]"
                />
              </div>
            </div>

            {/* Product Details & Content — everything the PDP accordions render */}
            <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-5">
              <div>
                <h3 className="font-serif text-base text-[#FAF9F6]">Product Details &amp; Content</h3>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                  Drives the Overview, Details &amp; Attributes, How to Use, Ingredients, and Shipping &amp; Returns
                  accordions on the product page. Leave a section empty to hide it on the storefront.
                </p>
              </div>

              {/* Overview */}
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Product Overview
                </label>
                <textarea
                  rows={2}
                  value={editingProduct.details.overview}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, details: { ...editingProduct.details, overview: e.target.value } })
                  }
                  placeholder="e.g. Richly pigmented formula designed for South Asian undertones."
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]"
                />
              </div>

              {/* Benefits */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">
                    Key Benefits ({editingProduct.benefits.length})
                  </label>
                  <button type="button" onClick={handleAddBenefit} className="flex items-center gap-1 text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Benefit</span>
                  </button>
                </div>
                {editingProduct.benefits.map((b, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => setBenefitDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleBenefitDrop(idx)}
                    className="flex items-center gap-2"
                  >
                    <GripVertical className="w-3.5 h-3.5 text-[#6B6B6B] cursor-grab shrink-0" />
                    <input
                      type="text"
                      value={b}
                      onChange={(e) => handleUpdateBenefit(idx, e.target.value)}
                      placeholder="e.g. 12H Transfer-Proof"
                      className="flex-1 px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                    />
                    <button type="button" onClick={() => handleDeleteBenefit(idx)} className="p-1.5 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {editingProduct.benefits.length === 0 && (
                  <p className="text-[10.5px] text-[#6B6B6B] italic">No benefits yet — this list appears as checkmarks under the overview.</p>
                )}
              </div>

              {/* Attributes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">
                    Details &amp; Attributes ({(editingProduct.attributes || []).length})
                  </label>
                  <button type="button" onClick={handleAddAttribute} className="flex items-center gap-1 text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Attribute</span>
                  </button>
                </div>
                <p className="text-[10.5px] text-[#6B6B6B]">
                  Free-form — different product types need different rows (a lipstick needs Finish/Coverage; a cleanser needs Skin Type/Texture).
                </p>
                {(editingProduct.attributes || []).map((attr, idx) => (
                  <div
                    key={attr.id}
                    draggable
                    onDragStart={() => setAttrDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleAttrDrop(idx)}
                    className="flex items-center gap-2"
                  >
                    <GripVertical className="w-3.5 h-3.5 text-[#6B6B6B] cursor-grab shrink-0" />
                    <input
                      type="text"
                      value={attr.name}
                      onChange={(e) => handleUpdateAttribute(idx, 'name', e.target.value)}
                      placeholder="Attribute (e.g. Finish)"
                      className="w-32 px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                    />
                    <input
                      type="text"
                      value={attr.value}
                      onChange={(e) => handleUpdateAttribute(idx, 'value', e.target.value)}
                      placeholder="Value (e.g. Velvet Matte)"
                      className="flex-1 px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                    />
                    <button type="button" onClick={() => handleDeleteAttribute(idx)} className="p-1.5 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* How to Use Steps */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">
                    How to Use / The Ritual ({(editingProduct.usageSteps || []).length} steps)
                  </label>
                  <button type="button" onClick={handleAddStep} className="flex items-center gap-1 text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Step</span>
                  </button>
                </div>
                {(editingProduct.usageSteps || []).map((step, idx) => (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={() => setStepDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleStepDrop(idx)}
                    className="flex items-start gap-2"
                  >
                    <GripVertical className="w-3.5 h-3.5 text-[#6B6B6B] cursor-grab shrink-0 mt-2" />
                    <span className="w-5 h-5 rounded-full bg-[#C9972B]/20 text-[#E3B84B] text-[10px] font-bold flex items-center justify-center shrink-0 mt-1">
                      {idx + 1}
                    </span>
                    <textarea
                      rows={1}
                      value={step.text}
                      onChange={(e) => handleUpdateStepText(idx, e.target.value)}
                      placeholder="e.g. Glide onto lips with the precision doe-foot applicator."
                      className="flex-1 px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                    />
                    {step.image && (
                      <img src={step.image} alt="" className="w-9 h-9 rounded object-cover border border-[#E8D5A8]/30 shrink-0" />
                    )}
                    <label className="px-2 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap shrink-0">
                      {uploadingStepId === step.id ? '...' : step.image ? 'Replace' : 'Image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingStepId === step.id}
                        onChange={(e) => {
                          handleUploadStepImage(idx, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button type="button" onClick={() => handleDeleteStep(idx)} className="p-1.5 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {(!editingProduct.usageSteps || editingProduct.usageSteps.length === 0) && editingProduct.details.howToUse && (
                  <p className="text-[10.5px] text-[#6B6B6B] italic">
                    Legacy text currently shown on the storefront: "{editingProduct.details.howToUse}". Add steps above to replace it.
                  </p>
                )}
              </div>

              {/* Ingredients */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">
                    Clean Ingredients List ({(editingProduct.ingredients || []).length})
                  </label>
                  <button type="button" onClick={handleAddIngredient} className="flex items-center gap-1 text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Ingredient</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editingProduct.ingredients || []).map((ing, idx) => (
                    <div
                      key={idx}
                      draggable
                      onDragStart={() => setIngredientDragIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleIngredientDrop(idx)}
                      className="flex items-center gap-1 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-full pl-2.5 pr-1 py-1"
                    >
                      <input
                        type="text"
                        value={ing}
                        onChange={(e) => handleUpdateIngredient(idx, e.target.value)}
                        placeholder="e.g. Dimethicone"
                        size={Math.max(8, ing.length)}
                        className="bg-transparent text-xs text-[#FAF9F6] outline-none"
                      />
                      <button type="button" onClick={() => handleDeleteIngredient(idx)} className="p-1 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded-full cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {(!editingProduct.ingredients || editingProduct.ingredients.length === 0) && editingProduct.details.ingredientsList && (
                  <p className="text-[10.5px] text-[#6B6B6B] italic">
                    Legacy text currently shown on the storefront: "{editingProduct.details.ingredientsList}". Add ingredients above to replace it.
                  </p>
                )}
              </div>

              {/* Shipping & Returns override */}
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Shipping &amp; Returns (optional override)
                </label>
                <p className="text-[10.5px] text-[#6B6B6B] mb-1">
                  Leave blank to use the store's global shipping notice instead of repeating it on every product.
                </p>
                <textarea
                  rows={2}
                  value={editingProduct.details.shippingReturns}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, details: { ...editingProduct.details, shippingReturns: e.target.value } })
                  }
                  placeholder="Leave blank for the global default"
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B]"
                />
              </div>
            </div>

            {/* Shades Builder */}
            <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-base text-[#FAF9F6]">
                  Shade Swatches ({editingProduct.shades?.length || 0})
                </h3>
                <button
                  type="button"
                  onClick={handleAddShade}
                  className="flex items-center gap-1 text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Shade</span>
                </button>
              </div>

              <div className="space-y-4">
                {editingProduct.shades?.map((shade, idx) => {
                  const shadeImages = [...(shade.images || [])].sort((a, b) => a.sortOrder - b.sortOrder);
                  const duplicateSku =
                    !!shade.sku?.trim() &&
                    (editingProduct.shades || []).filter((s, i) => i !== idx && s.sku?.trim() === shade.sku?.trim()).length > 0;
                  return (
                    <div key={shade.id || idx} className="p-4 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 space-y-3 text-xs">
                      {/* Identity row */}
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="color"
                          value={/^#([0-9a-fA-F]{6})$/.test(shade.hex) ? shade.hex : '#F05A7E'}
                          onChange={(e) => handleUpdateShade(idx, 'hex', e.target.value)}
                          title="Pick a color"
                          className="w-8 h-8 rounded border border-[#E8D5A8]/30 cursor-pointer bg-transparent shrink-0"
                        />
                        <input
                          type="text"
                          value={shade.hex}
                          placeholder="#RRGGBB"
                          maxLength={7}
                          onChange={(e) => {
                            const v = '#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                            handleUpdateShade(idx, 'hex', v);
                          }}
                          title="Type an exact hex code, e.g. #FCE8ED"
                          className="px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] w-20 font-mono uppercase"
                        />
                        <input
                          type="text"
                          value={shade.name}
                          placeholder="Variant / Shade Name"
                          onChange={(e) => handleUpdateShade(idx, 'name', e.target.value)}
                          className="flex-1 min-w-[140px] px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] font-semibold"
                        />
                        <select
                          value={shade.undertone}
                          onChange={(e) => handleUpdateShade(idx, 'undertone', e.target.value)}
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
                          onClick={() => handleUpdateShade(idx, 'isActive', shade.isActive === false)}
                          className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                            shade.isActive === false
                              ? 'bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30'
                              : 'bg-[#C9972B]/10 text-[#E3B84B] border border-[#C9972B]/40'
                          }`}
                          title="Toggle whether shoppers can select this variant"
                        >
                          {shade.isActive === false ? 'Paused' : 'Active'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteShade(idx)}
                          className="p-1.5 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer ml-auto"
                          title="Delete variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Pricing / inventory row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">SKU</label>
                          <input
                            type="text"
                            value={shade.sku || ''}
                            placeholder="Optional"
                            onChange={(e) => handleUpdateShade(idx, 'sku', e.target.value)}
                            className={`w-full px-2 py-1.5 bg-[#171717] border rounded text-xs text-[#FAF9F6] ${duplicateSku ? 'border-[#F05A7E]' : 'border-[#E8D5A8]/30'}`}
                          />
                          {duplicateSku && <p className="text-[9.5px] text-[#F05A7E] mt-0.5">Duplicate SKU</p>}
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                            Price (₹) <span className="normal-case text-[#6B6B6B]">override</span>
                          </label>
                          <input
                            type="number"
                            value={shade.price ?? ''}
                            placeholder={String(editingProduct.price)}
                            onChange={(e) => handleUpdateShade(idx, 'price', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                            Compare-At (₹)
                          </label>
                          <input
                            type="number"
                            value={shade.compareAtPrice ?? ''}
                            placeholder="Optional"
                            onChange={(e) => handleUpdateShade(idx, 'compareAtPrice', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                            Stock <span className="normal-case text-[#6B6B6B]">override</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={shade.stock ?? ''}
                            placeholder={String(editingProduct.stock ?? 0)}
                            onChange={(e) => handleUpdateShade(idx, 'stock', e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                          />
                        </div>
                      </div>

                      {/* Descriptions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Short Description</label>
                          <input
                            type="text"
                            value={shade.shortDescription || ''}
                            placeholder="e.g. Classic warm red"
                            onChange={(e) => handleUpdateShade(idx, 'shortDescription', e.target.value)}
                            className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Description</label>
                          <input
                            type="text"
                            value={shade.description}
                            placeholder="Shown on the product page under the swatches"
                            onChange={(e) => handleUpdateShade(idx, 'description', e.target.value)}
                            className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                          />
                        </div>
                      </div>

                      {/* Per-shade sizes — leave empty if this shade sells at
                          a single price; add entries if it comes in more
                          than one size/weight (each shade can differ). */}
                      <div className="pt-1 border-t border-[#E8D5A8]/10">
                        <div className="flex items-center justify-between pt-2 mb-2">
                          <span className="text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider">
                            Sizes for this shade ({(shade.sizes || []).length})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddShadeSize(idx)}
                            className="flex items-center gap-1 text-[10.5px] text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Size</span>
                          </button>
                        </div>
                        {(shade.sizes || []).length === 0 ? (
                          <p className="text-[10.5px] text-[#6B6B6B] italic">
                            No sizes — this shade sells at the single price above. Add sizes only if this shade comes in multiple weights/formats.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {(shade.sizes || []).map((sizeOpt) => (
                              <div key={sizeOpt.id} className="p-2.5 rounded-lg bg-[#171717] border border-[#E8D5A8]/20 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                                <div className="col-span-2 sm:col-span-1">
                                  <label className="block text-[9.5px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Label</label>
                                  <input
                                    type="text"
                                    defaultValue={sizeOpt.label}
                                    onBlur={(e) => handleRenameShadeSize(idx, sizeOpt.id, e.target.value.trim() || sizeOpt.label)}
                                    placeholder="e.g. 50g"
                                    className="w-full px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9.5px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Price (₹)</label>
                                  <input
                                    type="number"
                                    value={sizeOpt.price ?? ''}
                                    onChange={(e) => handleUpdateShadeSizeField(idx, sizeOpt.id, 'price', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9.5px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Compare-At (₹)</label>
                                  <input
                                    type="number"
                                    value={sizeOpt.compareAtPrice ?? ''}
                                    placeholder="Optional"
                                    onChange={(e) => handleUpdateShadeSizeField(idx, sizeOpt.id, 'compareAtPrice', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                    className="w-full px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9.5px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Stock</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={sizeOpt.stock ?? ''}
                                    placeholder="Optional"
                                    onChange={(e) => handleUpdateShadeSizeField(idx, sizeOpt.id, 'stock', e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="w-full px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteShadeSize(idx, sizeOpt.id)}
                                  className="p-1.5 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer justify-self-end"
                                  title="Delete size"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Variant image gallery */}
                      <div className="pt-1 border-t border-[#E8D5A8]/10">
                        <div className="flex items-center justify-between pt-2 mb-2 gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider">
                            Variant Images ({shadeImages.length})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={variantImageUrlDraft[idx] || ''}
                              onChange={(e) =>
                                setVariantImageUrlDraft((prev) => ({ ...prev, [idx]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddVariantImageUrl(idx, variantImageUrlDraft[idx] || '');
                                }
                              }}
                              placeholder="https://... image URL"
                              className="w-40 px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10.5px] text-[#FAF9F6]"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddVariantImageUrl(idx, variantImageUrlDraft[idx] || '')}
                              disabled={!(variantImageUrlDraft[idx] || '').trim()}
                              className="px-2.5 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10.5px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Add URL
                            </button>
                            <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10.5px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer">
                              <Upload className="w-3 h-3" />
                              <span>{uploadingShadeIndex === idx ? 'Uploading...' : 'Upload Images'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={uploadingShadeIndex === idx}
                                onChange={(e) => {
                                  handleAddVariantImages(idx, e.target.files);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        {shadeImages.length === 0 ? (
                          <p className="text-[10.5px] text-[#6B6B6B] italic">
                            No variant images yet — the storefront will fall back to this product's default images for this shade.
                          </p>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {shadeImages.map((img, imgIdx) => (
                              <div
                                key={img.id}
                                draggable
                                onDragStart={() => setDragImage({ shadeIdx: idx, imgIdx })}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => handleVariantImageDrop(idx, imgIdx)}
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
                                          handleUpdateVariantImageUrl(idx, img.id, editingUrlDraft);
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
                                        onClick={() => handleUpdateVariantImageUrl(idx, img.id, editingUrlDraft)}
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
                                ) : replacingVariantImageId === img.id ? (
                                  <div className="flex flex-col items-center gap-1 text-[#E8D5A8] px-1 text-center">
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span className="text-[8.5px] leading-tight">Replacing...</span>
                                  </div>
                                ) : brokenVariantImageIds.has(img.id) ? (
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
                                    src={img.url}
                                    alt={img.alt || shade.name}
                                    className="w-full h-full object-contain cursor-pointer"
                                    onClick={() => {
                                      setEditingUrlDraft(img.url);
                                      setEditingUrlImageId(img.id);
                                    }}
                                    onError={() =>
                                      setBrokenVariantImageIds((prev) => new Set(prev).add(img.id))
                                    }
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
                                      : brokenVariantImageIds.has(img.id)
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
                                      disabled={replacingVariantImageId === img.id}
                                      onChange={(e) => {
                                        handleReplaceVariantImage(idx, img.id, e.target.files?.[0]);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  {!img.isPrimary && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetPrimaryVariantImage(idx, img.id)}
                                      className="p-1 bg-[#0B0B0B]/80 hover:bg-[#C9972B] hover:text-[#0B0B0B] text-[#E8D5A8] rounded cursor-pointer"
                                      title="Set as primary image"
                                    >
                                      <Star className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteVariantImage(idx, img.id)}
                                    className="p-1 bg-[#0B0B0B]/80 hover:bg-[#F05A7E] text-[#E8D5A8] hover:text-white rounded cursor-pointer"
                                    title="Delete image"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {uploadError && <p className="text-[11px] text-[#F05A7E]">{uploadError}</p>}
              </div>
            </div>

            {/* Sizes / Weight Options Builder */}
            <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-base text-[#FAF9F6]">
                    Sizes / Weight Options ({editingProduct.sizes?.length || 0})
                  </h3>
                  <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                    e.g. 30g / 50g jars — each size gets its own admin-controlled price, so a smaller size can cost less.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddSize}
                  className="flex items-center gap-1 text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Size</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {(editingProduct.sizes || []).map((label) => {
                  const pricing = editingProduct.sizePricing?.[label];
                  return (
                    <div key={label} className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-end text-xs">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Label</label>
                        <input
                          type="text"
                          defaultValue={label}
                          onBlur={(e) => handleRenameSize(label, e.target.value.trim() || label)}
                          placeholder="e.g. 30g"
                          className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Price (₹)</label>
                        <input
                          type="number"
                          value={pricing?.price ?? ''}
                          placeholder={String(editingProduct.price)}
                          onChange={(e) => handleUpdateSizePricing(label, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Compare-At (₹)</label>
                        <input
                          type="number"
                          value={pricing?.compareAtPrice ?? ''}
                          placeholder="Optional"
                          onChange={(e) => handleUpdateSizePricing(label, 'compareAtPrice', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                          className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Stock</label>
                        <input
                          type="number"
                          min={0}
                          value={pricing?.stock ?? ''}
                          placeholder={String(editingProduct.stock ?? 0)}
                          onChange={(e) => handleUpdateSizePricing(label, 'stock', e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-full px-2 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSize(label)}
                        className="p-1.5 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer justify-self-end"
                        title="Delete size"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {(!editingProduct.sizes || editingProduct.sizes.length === 0) && (
                  <p className="text-[11px] text-[#6B6B6B] italic">No size options — this product sells at a single fixed price.</p>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar: Pricing, Category, Stock, Images */}
          <div className="lg:col-span-4 space-y-5">
            {/* Pricing & Stock */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <h3 className="font-serif text-base text-[#FAF9F6]">Pricing & Inventory</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Compare Price (₹) <span className="normal-case text-[#6B6B6B]">(original, before discount)</span>
                  </label>
                  <input
                    type="number"
                    value={editingProduct.originalPrice || ''}
                    onChange={(e) => {
                      const originalPrice = parseFloat(e.target.value) || undefined;
                      setEditingProduct((prev) => (prev ? { ...prev, originalPrice } : prev));
                    }}
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Discount % <span className="normal-case text-[#6B6B6B]">(auto-computes final price)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={!editingProduct.originalPrice}
                    value={
                      editingProduct.originalPrice
                        ? Math.round(((editingProduct.originalPrice - editingProduct.price) / editingProduct.originalPrice) * 100)
                        : ''
                    }
                    onChange={(e) => {
                      const pct = Math.min(99, Math.max(0, parseFloat(e.target.value) || 0));
                      const originalPrice = editingProduct.originalPrice;
                      if (!originalPrice) return;
                      const nextPrice = Math.round(originalPrice * (1 - pct / 100));
                      setEditingProduct((prev) => (prev ? { ...prev, price: nextPrice } : prev));
                    }}
                    placeholder={editingProduct.originalPrice ? '0' : 'Set compare price first'}
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] disabled:opacity-40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Final Selling Price (₹)
                </label>
                <input
                  type="number"
                  value={editingProduct.price}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#C9972B]/50 rounded-lg text-xs text-[#FAF9F6] font-bold"
                />
                <p className="text-[10px] text-[#6B6B6B] mt-1">
                  Editable directly, or set via Discount % above. This is the price shown on the storefront and used at checkout.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={editingProduct.category}
                  onChange={(e) => {
                    const nextCategory = e.target.value as 'Makeup' | 'Skin' | 'Nails';
                    const validSubs = PRODUCT_TAXONOMY[nextCategory] || [];
                    setEditingProduct({
                      ...editingProduct,
                      category: nextCategory as any,
                      // The old sub-category almost certainly doesn't belong to the
                      // new category — falling back to its first valid sub-category
                      // keeps the product filterable on Shop instead of silently
                      // carrying over a mismatched value (the original bug here).
                      subCategory: validSubs.includes(editingProduct.subCategory) ? editingProduct.subCategory : validSubs[0] || '',
                    });
                  }}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                >
                  <option value="Makeup">Makeup</option>
                  <option value="Skin">Skin</option>
                  <option value="Nails">Nails</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Sub-Category
                </label>
                <select
                  value={editingProduct.subCategory}
                  onChange={(e) => setEditingProduct({ ...editingProduct, subCategory: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                >
                  {(() => {
                    const validSubs = PRODUCT_TAXONOMY[editingProduct.category as 'Makeup' | 'Skin' | 'Nails'] || [];
                    // Surface a currently-saved value that isn't in the valid list
                    // instead of hiding it — a silent mismatch here is exactly
                    // what made this product invisible to the Shop filter.
                    const options = validSubs.includes(editingProduct.subCategory)
                      ? validSubs
                      : [editingProduct.subCategory, ...validSubs].filter(Boolean);
                    return options.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                        {!validSubs.includes(sub) ? ' (not in Shop taxonomy — please reselect)' : ''}
                      </option>
                    ));
                  })()}
                </select>
                <p className="text-[10px] text-[#6B6B6B] mt-1">
                  This list drives Shop's category filter — a value not on it (shown with a warning above) won't be filterable by customers until you reselect a valid one.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Badge Tag
                </label>
                <select
                  value={editingProduct.tag || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, tag: (e.target.value || undefined) as any })
                  }
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                >
                  <option value="">None</option>
                  <option value="NEW">NEW</option>
                  <option value="BESTSELLER">BESTSELLER</option>
                  <option value="LIMITED">LIMITED</option>
                  <option value="SIGNATURE">SIGNATURE</option>
                  <option value="EDITOR'S PICK">EDITOR'S PICK</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Stock Quantity
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingProduct.stock ?? 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, stock: Math.max(0, parseInt(e.target.value, 10) || 0) })
                  }
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
                <p className="text-[10px] text-[#6B6B6B] mt-1">
                  This is the real, decremented-on-order quantity used by cart &amp; checkout validation.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-[#E8D5A8]/10">
                <span className="text-xs font-semibold text-[#FAF9F6]">Stock Status</span>
                <button
                  type="button"
                  onClick={() => setEditingProduct({ ...editingProduct, inStock: !editingProduct.inStock })}
                  className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider cursor-pointer ${
                    editingProduct.inStock
                      ? 'bg-[#C9972B]/10 text-[#E3B84B] border border-[#C9972B]/40'
                      : 'bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30'
                  }`}
                >
                  {editingProduct.inStock ? 'In Stock' : 'Out of Stock'}
                </button>
              </div>
            </div>

            {/* Images */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <h3 className="font-serif text-base text-[#FAF9F6]">Product Media</h3>
              <p className="text-[11px] text-[#6B6B6B]">
                Primary &amp; Secondary drive the shop/best-seller card. Upload any size or ratio — the card automatically fits the full image without cropping.
              </p>
              {uploadError && <p className="text-[11px] text-[#F05A7E]">{uploadError}</p>}

              {([
                { key: 'primary', label: 'Primary Image (card + hover default)', required: true },
                { key: 'secondary', label: 'Secondary / Hover Image', required: false },
                { key: 'detail', label: 'Detail Shot (product page gallery)', required: false },
                { key: 'texture', label: 'Texture Shot (product page gallery)', required: false },
                { key: 'lifestyle', label: 'Lifestyle Shot (product page gallery)', required: false },
                { key: 'swatch', label: 'Swatch Shot (product page gallery)', required: false },
              ] as { key: ProductImageSlot; label: string; required: boolean }[]).map((slot) => {
                const url = (editingProduct.images as any)[slot.key] || '';
                return (
                  <div key={slot.key}>
                    <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                      {slot.label}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={url}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            images: { ...editingProduct.images, [slot.key]: e.target.value },
                          })
                        }
                        placeholder="https://... or use Upload"
                        className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                      />
                      <label className="px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap">
                        {uploadingSlot === slot.key ? 'Uploading...' : 'Upload'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingSlot === slot.key}
                          onChange={(e) => {
                            handleSlotUpload(slot.key, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {url && (
                      <div className="mt-2 w-full h-28 rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#0B0B0B] flex items-center justify-center">
                        {brokenSlotKeys.has(slot.key) ? (
                          <div className="flex flex-col items-center gap-1 text-[#6B6B6B] px-1 text-center">
                            <ImageOff className="w-4 h-4" />
                            <span className="text-[8.5px] leading-tight">
                              Failed to load — the uploaded image was removed from storage. Re-upload or fix the URL above.
                            </span>
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={slot.label}
                            className="w-full h-full object-contain"
                            onError={() => setBrokenSlotKeys((prev) => new Set(prev).add(slot.key))}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Card Button Visibility */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-3">
              <h3 className="font-serif text-base text-[#FAF9F6]">Card Button Visibility</h3>
              <p className="text-[11px] text-[#6B6B6B]">
                Control which hover actions appear on this product's card across Best Sellers, Shop, and related-product grids.
              </p>
              <label className="flex items-center gap-2.5 text-xs text-[#FAF9F6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!editingProduct.isBestSeller}
                  onChange={(e) => setEditingProduct({ ...editingProduct, isBestSeller: e.target.checked })}
                  className="accent-[#C9972B]"
                />
                Show in "Best Sellers" (homepage)
              </label>
              <label className="flex items-center gap-2.5 text-xs text-[#FAF9F6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.enableQuickView !== false}
                  onChange={(e) => setEditingProduct({ ...editingProduct, enableQuickView: e.target.checked })}
                  className="accent-[#C9972B]"
                />
                Show "Quick View" button on card
              </label>
              <label className="flex items-center gap-2.5 text-xs text-[#FAF9F6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.enableTryOn !== false}
                  onChange={(e) => setEditingProduct({ ...editingProduct, enableTryOn: e.target.checked })}
                  disabled={!editingProduct.shades || editingProduct.shades.length === 0}
                  className="accent-[#C9972B] disabled:opacity-40"
                />
                <span className={!editingProduct.shades || editingProduct.shades.length === 0 ? 'opacity-40' : ''}>
                  Show "Try On" button on card {(!editingProduct.shades || editingProduct.shades.length === 0) && '(requires at least one shade)'}
                </span>
              </label>
            </div>

            {/* Virtual Try-On Configuration */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-3">
              <h3 className="font-serif text-base text-[#FAF9F6]">Virtual Try-On</h3>
              <p className="text-[11px] text-[#6B6B6B]">
                Controls how the selected shade's color is applied in the Virtual Try-On camera/photo/model preview.
                Color always comes from the shade's own swatch — only how it's applied is configured here. Leave
                unset to use a sensible default based on this product's sub-category.
              </p>
              <label className="flex items-center gap-2.5 text-xs text-[#FAF9F6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.tryOnConfig?.enabled ?? true}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      tryOnConfig: {
                        enabled: e.target.checked,
                        type: editingProduct.tryOnConfig?.type || 'lipstick',
                        region: editingProduct.tryOnConfig?.region || 'lips',
                        intensity: editingProduct.tryOnConfig?.intensity ?? 70,
                        opacity: editingProduct.tryOnConfig?.opacity ?? 85,
                      },
                    })
                  }
                  className="accent-[#C9972B]"
                />
                Enable Virtual Try-On for this product
              </label>

              {editingProduct.tryOnConfig?.enabled !== false && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Try-On Type</label>
                    <select
                      value={editingProduct.tryOnConfig?.type || 'lipstick'}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          tryOnConfig: {
                            enabled: editingProduct.tryOnConfig?.enabled ?? true,
                            type: e.target.value as any,
                            region: editingProduct.tryOnConfig?.region || 'lips',
                            intensity: editingProduct.tryOnConfig?.intensity ?? 70,
                            opacity: editingProduct.tryOnConfig?.opacity ?? 85,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                    >
                      <option value="lipstick">Lipstick</option>
                      <option value="kajal">Kajal</option>
                      <option value="eyeliner">Eyeliner</option>
                      <option value="foundation">Foundation</option>
                      <option value="concealer">Concealer</option>
                      <option value="blush">Blush</option>
                      <option value="highlighter">Highlighter</option>
                      <option value="skin">Skin / Cream</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Application Region</label>
                    <select
                      value={editingProduct.tryOnConfig?.region || 'lips'}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          tryOnConfig: {
                            enabled: editingProduct.tryOnConfig?.enabled ?? true,
                            type: editingProduct.tryOnConfig?.type || 'lipstick',
                            region: e.target.value as any,
                            intensity: editingProduct.tryOnConfig?.intensity ?? 70,
                            opacity: editingProduct.tryOnConfig?.opacity ?? 85,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                    >
                      <option value="lips">Lips</option>
                      <option value="eyes">Eyes</option>
                      <option value="underEyes">Under Eyes</option>
                      <option value="fullFace">Full Face</option>
                      <option value="cheeks">Cheeks</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                      Intensity ({editingProduct.tryOnConfig?.intensity ?? 70}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={editingProduct.tryOnConfig?.intensity ?? 70}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          tryOnConfig: {
                            enabled: editingProduct.tryOnConfig?.enabled ?? true,
                            type: editingProduct.tryOnConfig?.type || 'lipstick',
                            region: editingProduct.tryOnConfig?.region || 'lips',
                            intensity: parseInt(e.target.value, 10),
                            opacity: editingProduct.tryOnConfig?.opacity ?? 85,
                          },
                        })
                      }
                      className="w-full accent-[#C9972B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                      Opacity ({editingProduct.tryOnConfig?.opacity ?? 85}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={editingProduct.tryOnConfig?.opacity ?? 85}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          tryOnConfig: {
                            enabled: editingProduct.tryOnConfig?.enabled ?? true,
                            type: editingProduct.tryOnConfig?.type || 'lipstick',
                            region: editingProduct.tryOnConfig?.region || 'lips',
                            intensity: editingProduct.tryOnConfig?.intensity ?? 70,
                            opacity: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-[#C9972B]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Product List Table
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Product Catalogue</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Manage luxury formulations, shade swatches, prices, stock availability, and imagery.
          </p>
        </div>

        <button
          onClick={handleCreateNewProduct}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-xl bg-[#171717] border border-[#E8D5A8]/20">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Search products by name, subcategory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="Makeup">Makeup</option>
            <option value="Skin">Skin</option>
            <option value="Nails">Nails</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0B0B] border-b border-[#E8D5A8]/20 text-[#E8D5A8] uppercase tracking-wider font-mono">
              <tr>
                <th className="p-4">Product</th>
                <th className="p-4">Category</th>
                <th className="p-4">Price</th>
                <th className="p-4">Shades</th>
                <th className="p-4">Stock</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8D5A8]/10 text-[#FAF9F6]">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-[#0B0B0B]/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#0B0B0B] shrink-0 flex items-center justify-center">
                        <img
                          src={p.images.primary}
                          alt={p.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div>
                        <p className="font-semibold text-xs text-[#FAF9F6] line-clamp-1">{p.name}</p>
                        <span className="text-[10px] text-[#6B6B6B]">{p.subCategory}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-[#C9972B]">{p.category}</td>
                  <td className="p-4 font-mono font-semibold">
                    ₹{p.price}
                    {p.originalPrice && (
                      <span className="ml-1.5 text-[10px] text-[#6B6B6B] line-through">
                        ₹{p.originalPrice}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {p.shades && p.shades.length > 0 ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          {p.shades.slice(0, 4).map((s) => (
                            <div
                              key={s.id}
                              className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                              style={{ backgroundColor: s.hex }}
                              title={s.name}
                            />
                          ))}
                          {p.shades.length > 4 && (
                            <span className="text-[10px] text-[#6B6B6B]">+{p.shades.length - 4}</span>
                          )}
                        </div>
                        <span className="block text-[10px] text-[#6B6B6B]">
                          {p.shades.length} variant{p.shades.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#6B6B6B] text-[10px]">Universal</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        p.inStock
                          ? 'bg-[#C9972B]/10 text-[#E3B84B] border border-[#C9972B]/40'
                          : 'bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30'
                      }`}
                    >
                      {p.inStock ? 'In Stock' : 'Out of Stock'}
                    </span>
                    <span className="block mt-1 text-[10px] text-[#6B6B6B]">Qty: {p.stock ?? 0}</span>
                  </td>
                  <td className="p-4 text-right space-x-1.5">
                    <button
                      onClick={() => setEditingProduct(p)}
                      className="px-2.5 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => duplicateProduct(p.id)}
                      className="p-1.5 hover:bg-[#C9972B]/20 text-[#C9972B] rounded transition-colors cursor-pointer"
                      title="Duplicate Product"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteProduct(p.id)}
                      className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                      title="Delete Product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
