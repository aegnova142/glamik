/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { JournalArticle } from '../../types';
import { Layers, Plus, Trash2, Edit2, Save, Check, ArrowLeft, BookOpen } from 'lucide-react';

export const AdminBlog: React.FC = () => {
  const { journalArticles, saveArticle, deleteArticle } = useCMS();
  const [editingArticle, setEditingArticle] = useState<JournalArticle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleCreateArticle = () => {
    const newArt: JournalArticle = {
      id: 'article-' + Date.now(),
      slug: 'new-editorial-study',
      title: 'The Chemistry of Warm Lip Pigmentation',
      category: 'Ingredient Science',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      readTime: '4 min read',
      author: 'Glamirk Atelier Formulation Lab',
      excerpt: 'Exploring how micronized red iron oxides interact with melanin undertones.',
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
      content: [
        'When formulating velvet lip colors for melanin-rich complexions, standard titanium dioxide ratios often cause ashen cast.',
        'At Glamirk, our chemists hand-balance yellow and warm ochre undertones with cold red iron oxides to ensure vibrant payoff on every skin tone.',
      ],
      sections: [
        {
          heading: 'Balancing the Base Matrix',
          paragraphs: [
            'Our proprietary wax matrix maintains moisture while binding intense pigments to prevent feathering.',
          ],
        },
      ],
    };
    setEditingArticle(newArt);
  };

  const handleSave = async () => {
    if (!editingArticle) return;
    setIsSaving(true);
    const ok = await saveArticle(editingArticle);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingArticle(null);
      }, 700);
    }
  };

  if (editingArticle) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingArticle(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-xl text-[#FAF9F6]">{editingArticle.title}</h2>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Article'}</span>
          </button>
        </div>

        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 max-w-3xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Article Title
            </label>
            <input
              type="text"
              value={editingArticle.title}
              onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Category
              </label>
              <input
                type="text"
                value={editingArticle.category}
                onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Read Time
              </label>
              <input
                type="text"
                value={editingArticle.readTime}
                onChange={(e) => setEditingArticle({ ...editingArticle, readTime: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Cover Image URL
            </label>
            <input
              type="text"
              value={editingArticle.image}
              onChange={(e) => setEditingArticle({ ...editingArticle, image: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Excerpt / Summary
            </label>
            <textarea
              rows={3}
              value={editingArticle.excerpt}
              onChange={(e) => setEditingArticle({ ...editingArticle, excerpt: e.target.value })}
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
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Editorial Journal & Guides</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Publish skin science articles, undertone diagnostics, and beauty guides.
          </p>
        </div>

        <button
          onClick={handleCreateArticle}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>New Article</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(journalArticles || []).map((art) => (
          <div
            key={art.id}
            className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden flex flex-col justify-between"
          >
            <div className="h-44 relative bg-[#0B0B0B]">
              <img src={art.image} alt={art.title} className="w-full h-full object-cover" />
              <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#0B0B0B]/80 text-[#C9972B] border border-[#C9972B]/30">
                {art.category}
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[10px] text-[#6B6B6B] font-mono">{art.date} · {art.readTime}</span>
                <h3 className="font-serif text-base text-[#FAF9F6] mt-1">{art.title}</h3>
                <p className="text-xs text-[#6B6B6B] line-clamp-2 mt-2">{art.excerpt}</p>
              </div>

              <div className="pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditingArticle(art)}
                  className="px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteArticle(art.id)}
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
