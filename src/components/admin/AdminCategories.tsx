/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSCategory } from '../../types';
import { Layers, Plus, Trash2, Edit2, Save, Check, ArrowLeft } from 'lucide-react';
import { ImageCropUploadModal } from './ImageCropUploadModal';

export const AdminCategories: React.FC = () => {
  const { categories, saveCategory, deleteCategory } = useCMS();
  const [editingCategory, setEditingCategory] = useState<CMSCategory | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handleCreateCategory = () => {
    const newCat: CMSCategory = {
      id: 'cat-' + Date.now(),
      name: 'New Collection',
      slug: 'new-collection',
      description: 'Handcrafted luxury formulation line.',
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
      order: categories.reduce((max, c) => Math.max(max, c.order || 0), 0) + 1,
      isVisible: true,
      subCategories: ['Essential Editions'],
    };
    setEditingCategory(newCat);
  };

  const handleSave = async () => {
    if (!editingCategory) return;
    setIsSaving(true);
    const ok = await saveCategory(editingCategory);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingCategory(null);
      }, 700);
    }
  };

  if (editingCategory) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingCategory(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-xl text-[#FAF9F6]">{editingCategory.name}</h2>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Category'}</span>
          </button>
        </div>

        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 max-w-2xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Category Name
            </label>
            <input
              type="text"
              value={editingCategory.name}
              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Slug
            </label>
            <input
              type="text"
              value={editingCategory.slug}
              onChange={(e) => setEditingCategory({ ...editingCategory, slug: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Editorial Description
            </label>
            <textarea
              rows={3}
              value={editingCategory.description || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Cover Image <span className="normal-case text-[#6B6B6B]">(locked to 4:3 — matches the Shop by Category card)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editingCategory.image || ''}
                onChange={(e) => setEditingCategory({ ...editingCategory, image: e.target.value })}
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
            {editingCategory.image && (
              <div className="mt-2 w-full h-28 rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#0B0B0B]">
                <img src={editingCategory.image} alt="Cover" className="w-full h-full object-cover" />
              </div>
            )}
            {isUploadOpen && (
              <ImageCropUploadModal
                isOpen
                onClose={() => setIsUploadOpen(false)}
                title="Upload Category Cover Image"
                aspectRatio={4 / 3}
                minWidth={600}
                minHeight={450}
                recommendedWidth={1200}
                recommendedHeight={900}
                outputWidth={1200}
                outputHeight={900}
                onUploaded={({ url }) => setEditingCategory((prev) => (prev ? { ...prev, image: url } : prev))}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Subcategories (comma separated)
            </label>
            <input
              type="text"
              value={editingCategory.subCategories?.join(', ') || ''}
              onChange={(e) =>
                setEditingCategory({
                  ...editingCategory,
                  subCategories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Product Categories & Taxonomy</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Organize the atelier catalogue into luxury collections.
          </p>
        </div>

        <button
          onClick={handleCreateCategory}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>New Category</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {(categories || []).map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden flex flex-col justify-between"
          >
            <div className="h-40 relative bg-[#0B0B0B]">
              {cat.image ? (
                <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#6B6B6B]">
                  No Image
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#171717] to-transparent" />
              <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#0B0B0B]/80 text-[#C9972B] border border-[#C9972B]/30">
                Order #{cat.order}
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="font-serif text-lg text-[#FAF9F6]">{cat.name}</h3>
                <p className="text-xs text-[#6B6B6B] line-clamp-2 mt-1">{cat.description}</p>
                <div className="flex flex-wrap gap-1 mt-3">
                  {cat.subCategories?.map((sub) => (
                    <span
                      key={sub}
                      className="px-2 py-0.5 rounded text-[10px] bg-[#0B0B0B] border border-[#E8D5A8]/20 text-[#FAF9F6]"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditingCategory(cat)}
                  className="px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteCategory(cat.id)}
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
