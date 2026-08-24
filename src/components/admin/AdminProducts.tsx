/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { Product, Shade } from '../../types';
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
} from 'lucide-react';
import { useFileUpload } from '../../hooks/useFileUpload';

type ProductImageSlot = 'primary' | 'secondary' | 'detail' | 'texture' | 'lifestyle' | 'swatch';

export const AdminProducts: React.FC = () => {
  const { products, categories, saveProduct, deleteProduct, duplicateProduct } = useCMS();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<ProductImageSlot | null>(null);

  const { upload, error: uploadError } = useFileUpload({
    acceptedTypes: ['image/'],
    maxSizeBytes: 8 * 1024 * 1024,
    typeErrorMessage: 'Please choose an image file (JPG, PNG, or WebP).',
  });

  const handleSlotUpload = async (slot: ProductImageSlot, file: File | undefined) => {
    setUploadingSlot(slot);
    const mediaItem = await upload(file);
    setUploadingSlot(null);
    if (mediaItem) {
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

  const handleSaveProduct = async () => {
    if (!editingProduct) return;
    if (!editingProduct.name.trim()) {
      window.alert('Product Name is required before saving.');
      return;
    }
    setIsSaving(true);
    const ok = await saveProduct(editingProduct);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingProduct(null);
      }, 800);
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
    };
    setEditingProduct({
      ...editingProduct,
      shades: [...(editingProduct.shades || []), newShade],
    });
  };

  const handleUpdateShade = (index: number, key: keyof Shade, val: string) => {
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

              <div className="space-y-3">
                {editingProduct.shades?.map((shade, idx) => (
                  <div
                    key={shade.id || idx}
                    className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 w-full sm:w-auto">
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
                        placeholder="Shade Name"
                        onChange={(e) => handleUpdateShade(idx, 'name', e.target.value)}
                        className="px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] w-32"
                      />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                      <select
                        value={shade.undertone}
                        onChange={(e) => handleUpdateShade(idx, 'undertone', e.target.value)}
                        className="px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                      >
                        <option value="Warm">Warm</option>
                        <option value="Cool">Cool</option>
                        <option value="Neutral">Neutral</option>
                        <option value="Olive">Olive</option>
                        <option value="Universal">Universal</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDeleteShade(idx)}
                        className="p-1.5 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
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
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, category: e.target.value as any })
                  }
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
                <input
                  type="text"
                  value={editingProduct.subCategory}
                  onChange={(e) => setEditingProduct({ ...editingProduct, subCategory: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
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
                { key: 'primary', label: 'Primary Image (card + hover default)', uploadable: true, required: true },
                { key: 'secondary', label: 'Secondary / Hover Image', uploadable: true, required: false },
                { key: 'detail', label: 'Detail Shot (product page gallery)', uploadable: false, required: false },
                { key: 'texture', label: 'Texture Shot (product page gallery)', uploadable: false, required: false },
                { key: 'lifestyle', label: 'Lifestyle Shot (product page gallery)', uploadable: false, required: false },
                { key: 'swatch', label: 'Swatch Shot (product page gallery)', uploadable: false, required: false },
              ] as { key: ProductImageSlot; label: string; uploadable: boolean; required: boolean }[]).map((slot) => {
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
                      {slot.uploadable && (
                        <label className="px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap">
                          {uploadingSlot === slot.key ? 'Uploading...' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingSlot !== null}
                            onChange={(e) => {
                              handleSlotUpload(slot.key, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {url && (
                      <div className="mt-2 w-full h-28 rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#0B0B0B] flex items-center justify-center">
                        <img src={url} alt={slot.label} className="w-full h-full object-contain" />
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
