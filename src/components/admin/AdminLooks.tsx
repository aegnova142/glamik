/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { Look, LookProductItem } from '../../types';
import { Plus, Trash2, Save, Check, ArrowLeft } from 'lucide-react';
import { ImageCropUploadModal } from './ImageCropUploadModal';

const CATEGORY_OPTIONS = ['EVERYDAY GLAM', 'DATE NIGHT', 'WEDDING GLAM', 'MINIMAL GLAM'];

const emptyProductItem: LookProductItem = { productId: '', productName: '', shadeName: '', role: '' };

export const AdminLooks: React.FC = () => {
  const { looks, saveLook, deleteLook } = useCMS();
  const [editingLook, setEditingLook] = useState<Look | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handleCreateLook = () => {
    const newLook: Look = {
      id: 'look-' + Date.now(),
      title: 'NEW SIGNATURE LOOK',
      tagline: 'A short, evocative one-line description of this look.',
      description: 'A fuller description of the styling, mood, and products used to create this look.',
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=85',
      category: 'EVERYDAY GLAM',
      productsUsed: [{ ...emptyProductItem }],
    };
    setEditingLook(newLook);
  };

  const handleSave = async () => {
    if (!editingLook) return;
    setIsSaving(true);
    const ok = await saveLook({
      ...editingLook,
      productsUsed: editingLook.productsUsed.filter((p) => p.productId.trim() && p.productName.trim()),
    });
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingLook(null);
      }, 700);
    }
  };

  const handleDelete = (look: Look) => {
    if (window.confirm(`Delete "${look.title}"? This cannot be undone.`)) {
      deleteLook(look.id);
    }
  };

  const updateProductItem = (idx: number, field: keyof LookProductItem, val: string) => {
    if (!editingLook) return;
    const next = [...editingLook.productsUsed];
    next[idx] = { ...next[idx], [field]: val };
    setEditingLook({ ...editingLook, productsUsed: next });
  };

  const removeProductItem = (idx: number) => {
    if (!editingLook) return;
    setEditingLook({ ...editingLook, productsUsed: editingLook.productsUsed.filter((_, i) => i !== idx) });
  };

  if (editingLook) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingLook(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-xl text-[#FAF9F6]">{editingLook.title}</h2>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Look'}</span>
          </button>
        </div>

        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 max-w-3xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Look Title
            </label>
            <input
              type="text"
              value={editingLook.title}
              onChange={(e) => setEditingLook({ ...editingLook, title: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={editingLook.category}
              onChange={(e) => setEditingLook({ ...editingLook, category: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Tagline
            </label>
            <input
              type="text"
              value={editingLook.tagline}
              onChange={(e) => setEditingLook({ ...editingLook, tagline: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={editingLook.description}
              onChange={(e) => setEditingLook({ ...editingLook, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Image <span className="normal-case text-[#6B6B6B]">(locked to 3:4 portrait — matches the Shop the Look card)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editingLook.image}
                onChange={(e) => setEditingLook({ ...editingLook, image: e.target.value })}
                placeholder="https://... or use Upload & Crop"
                className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap"
              >
                Upload &amp; Crop
              </button>
            </div>
            {editingLook.image && (
              <img src={editingLook.image} alt="" className="mt-2 w-full h-40 object-cover rounded-lg border border-[#E8D5A8]/20" />
            )}
            {isUploadOpen && (
              <ImageCropUploadModal
                isOpen
                onClose={() => setIsUploadOpen(false)}
                title="Upload Look Image"
                aspectRatio={3 / 4}
                minWidth={600}
                minHeight={800}
                recommendedWidth={900}
                recommendedHeight={1200}
                outputWidth={900}
                outputHeight={1200}
                onUploaded={({ url }) => setEditingLook((prev) => (prev ? { ...prev, image: url } : prev))}
              />
            )}
          </div>

          <div className="pt-2 border-t border-[#E8D5A8]/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">
                Products Used In This Look
              </label>
              <button
                type="button"
                onClick={() =>
                  setEditingLook({ ...editingLook, productsUsed: [...editingLook.productsUsed, { ...emptyProductItem }] })
                }
                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[10px] font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Product</span>
              </button>
            </div>

            {editingLook.productsUsed.map((item, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 grid grid-cols-2 gap-2 relative">
                <button
                  type="button"
                  onClick={() => removeProductItem(idx)}
                  className="absolute top-2 right-2 p-1 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <input
                  type="text"
                  placeholder="Product ID (e.g. matte-liquid-lipstick-collection)"
                  value={item.productId}
                  onChange={(e) => updateProductItem(idx, 'productId', e.target.value)}
                  className="col-span-2 px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/20 rounded text-[11px] text-[#FAF9F6] font-mono"
                />
                <input
                  type="text"
                  placeholder="Product Name"
                  value={item.productName}
                  onChange={(e) => updateProductItem(idx, 'productName', e.target.value)}
                  className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/20 rounded text-[11px] text-[#FAF9F6]"
                />
                <input
                  type="text"
                  placeholder="Shade (optional)"
                  value={item.shadeName || ''}
                  onChange={(e) => updateProductItem(idx, 'shadeName', e.target.value)}
                  className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/20 rounded text-[11px] text-[#FAF9F6]"
                />
                <input
                  type="text"
                  placeholder="Role (e.g. Lip Focus)"
                  value={item.role}
                  onChange={(e) => updateProductItem(idx, 'role', e.target.value)}
                  className="col-span-2 px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/20 rounded text-[11px] text-[#FAF9F6]"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Shop The Look</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Curate editorial looks with the products and shades used to create them.
          </p>
        </div>

        <button
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
            <div className="h-44 relative bg-[#0B0B0B]">
              <img src={look.image} alt={look.title} className="w-full h-full object-cover" />
              <span className="absolute top-2 left-2 px-2 py-0.5 bg-[#C9972B] text-[#0B0B0B] text-[9px] font-bold uppercase tracking-wider rounded-full">
                {look.category}
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="font-serif text-base text-[#FAF9F6]">{look.title}</h3>
                <p className="text-xs text-[#6B6B6B] line-clamp-2 mt-2">{look.tagline}</p>
                <span className="text-[10px] text-[#6B6B6B] font-mono block mt-2">
                  {look.productsUsed.length} product{look.productsUsed.length === 1 ? '' : 's'} tagged
                </span>
              </div>

              <div className="pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditingLook(look)}
                  className="px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(look)}
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
