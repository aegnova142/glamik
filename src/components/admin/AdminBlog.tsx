/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { JournalArticle, CMSJournalSectionCopy } from '../../types';
import { Plus, Trash2, Save, Check, ArrowLeft } from 'lucide-react';
import { ImageCropUploadModal } from './ImageCropUploadModal';
import { useSyncOnce } from '../../hooks/useSyncOnce';

const CATEGORY_OPTIONS = ['BEAUTY GUIDES', 'MAKEUP', 'SKIN', 'NAILS', 'GLAMIRK STORIES', 'TRENDS'];

const DEFAULT_SECTION_COPY: CMSJournalSectionCopy = {
  badgeText: 'Editorial Perspectives',
  heading: 'The Glamirk Journal',
  subtitle: 'Perspectives on color theory, formulation mastery, and modern rituals crafted for Indian complexions.',
};

export const AdminBlog: React.FC = () => {
  const { journalArticles, saveArticle, deleteArticle, journalSectionCopy, saveJournalSectionCopy } = useCMS();
  const [editingArticle, setEditingArticle] = useState<JournalArticle | null>(null);
  const [contentDraft, setContentDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const [sectionCopyState, setSectionCopyState] = useState<CMSJournalSectionCopy>(journalSectionCopy || DEFAULT_SECTION_COPY);
  const [isSavingCopy, setIsSavingCopy] = useState(false);
  const [copySaveSuccess, setCopySaveSuccess] = useState(false);
  useSyncOnce(journalSectionCopy, setSectionCopyState);

  const handleSaveSectionCopy = async () => {
    setIsSavingCopy(true);
    const ok = await saveJournalSectionCopy(sectionCopyState);
    setIsSavingCopy(false);
    if (ok) {
      setCopySaveSuccess(true);
      setTimeout(() => setCopySaveSuccess(false), 1500);
    }
  };

  const openEditor = (art: JournalArticle) => {
    setEditingArticle(art);
    setContentDraft((art.content || []).join('\n\n'));
  };

  const handleCreateArticle = () => {
    const uid = Date.now();
    const newArt: JournalArticle = {
      id: 'article-' + uid,
      // Unique per article — a repeated hardcoded slug here previously
      // meant every new article silently collided with the last one on
      // any slug-based lookup/route.
      slug: 'new-editorial-study-' + uid,
      status: 'draft',
      title: 'The Chemistry of Warm Lip Pigmentation',
      subtitle: '',
      category: 'BEAUTY GUIDES',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      readTime: '4 min read',
      author: 'Glamirk Atelier Formulation Lab',
      authorRole: '',
      excerpt: 'Exploring how micronized red iron oxides interact with melanin undertones.',
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
      isEditorsPick: false,
      isHero: false,
      isTrending: false,
      content: [
        'When formulating velvet lip colors for melanin-rich complexions, standard titanium dioxide ratios often cause ashen cast.',
      ],
    };
    openEditor(newArt);
  };

  const handleSave = async () => {
    if (!editingArticle) return;
    setIsSaving(true);
    const articleToSave: JournalArticle = {
      ...editingArticle,
      content: contentDraft
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    };
    const ok = await saveArticle(articleToSave);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingArticle(null);
      }, 700);
    }
  };

  const handleDelete = (art: JournalArticle) => {
    if (window.confirm(`Delete "${art.title}"? This cannot be undone.`)) {
      deleteArticle(art.id);
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

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Subtitle
            </label>
            <input
              type="text"
              value={editingArticle.subtitle || ''}
              onChange={(e) => setEditingArticle({ ...editingArticle, subtitle: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Category
              </label>
              <select
                value={editingArticle.category}
                onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Author
              </label>
              <input
                type="text"
                value={editingArticle.author}
                onChange={(e) => setEditingArticle({ ...editingArticle, author: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Author Role
              </label>
              <input
                type="text"
                value={editingArticle.authorRole || ''}
                onChange={(e) => setEditingArticle({ ...editingArticle, authorRole: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Publish Date
              </label>
              <input
                type="text"
                value={editingArticle.date}
                onChange={(e) => setEditingArticle({ ...editingArticle, date: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={editingArticle.status || 'published'}
                onChange={(e) => setEditingArticle({ ...editingArticle, status: e.target.value as 'draft' | 'published' })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              >
                <option value="draft">Draft (hidden from storefront)</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Slug <span className="normal-case text-[#6B6B6B]">(used in the article URL)</span>
            </label>
            <input
              type="text"
              value={editingArticle.slug || ''}
              onChange={(e) =>
                setEditingArticle({ ...editingArticle, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })
              }
              placeholder="e.g. find-your-signature-shade"
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Cover Image <span className="normal-case text-[#6B6B6B]">(locked to 4:3 — matches the Journal card)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editingArticle.image}
                onChange={(e) => setEditingArticle({ ...editingArticle, image: e.target.value })}
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
            {editingArticle.image && (
              <div className="mt-2 w-full h-28 rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#0B0B0B]">
                <img src={editingArticle.image} alt="Cover" className="w-full h-full object-cover" />
              </div>
            )}
            {isUploadOpen && (
              <ImageCropUploadModal
                isOpen
                onClose={() => setIsUploadOpen(false)}
                title="Upload Article Cover Image"
                aspectRatio={4 / 3}
                minWidth={600}
                minHeight={450}
                recommendedWidth={1200}
                recommendedHeight={900}
                outputWidth={1200}
                outputHeight={900}
                onUploaded={({ url }) => setEditingArticle((prev) => (prev ? { ...prev, image: url } : prev))}
              />
            )}
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

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Full Article Content <span className="normal-case text-[#6B6B6B]">(separate paragraphs with a blank line)</span>
            </label>
            <textarea
              rows={8}
              value={contentDraft}
              onChange={(e) => setContentDraft(e.target.value)}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E8D5A8]/10">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                SEO Title <span className="normal-case text-[#6B6B6B]">(optional — falls back to Article Title)</span>
              </label>
              <input
                type="text"
                value={editingArticle.seoTitle || ''}
                onChange={(e) => setEditingArticle({ ...editingArticle, seoTitle: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                SEO Description <span className="normal-case text-[#6B6B6B]">(optional — falls back to Excerpt)</span>
              </label>
              <input
                type="text"
                value={editingArticle.seoDescription || ''}
                onChange={(e) => setEditingArticle({ ...editingArticle, seoDescription: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[#E8D5A8]/10">
            <label className="flex items-center gap-2 text-xs text-[#FAF9F6] cursor-pointer">
              <input
                type="checkbox"
                checked={!!editingArticle.isEditorsPick}
                onChange={(e) => setEditingArticle({ ...editingArticle, isEditorsPick: e.target.checked })}
                className="accent-[#C9972B]"
              />
              Editor's Pick
            </label>
            <label className="flex items-center gap-2 text-xs text-[#FAF9F6] cursor-pointer">
              <input
                type="checkbox"
                checked={!!editingArticle.isHero}
                onChange={(e) => setEditingArticle({ ...editingArticle, isHero: e.target.checked })}
                className="accent-[#C9972B]"
              />
              Featured Hero Story <span className="normal-case text-[#6B6B6B]">(only one article can be featured at a time — saving this unfeatures any other)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#FAF9F6] cursor-pointer">
              <input
                type="checkbox"
                checked={!!editingArticle.isTrending}
                onChange={(e) => setEditingArticle({ ...editingArticle, isTrending: e.target.checked })}
                className="accent-[#C9972B]"
              />
              Trending
            </label>
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

      {/* Homepage "The Glamirk Journal" Section Heading */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Homepage Section Heading</h3>
            <p className="text-[11px] text-[#6B6B6B] mt-0.5">
              The "The Glamirk Journal" preview section on the homepage — the 3 articles shown there come from the list below.
            </p>
          </div>
          <button
            onClick={handleSaveSectionCopy}
            disabled={isSavingCopy}
            className="flex items-center gap-2 px-4 py-2 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 shrink-0"
          >
            {copySaveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{copySaveSuccess ? 'Saved!' : isSavingCopy ? 'Saving...' : 'Save'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Badge Text</label>
            <input
              type="text"
              value={sectionCopyState.badgeText}
              onChange={(e) => setSectionCopyState({ ...sectionCopyState, badgeText: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Heading</label>
            <input
              type="text"
              value={sectionCopyState.heading}
              onChange={(e) => setSectionCopyState({ ...sectionCopyState, heading: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Subtitle</label>
          <input
            type="text"
            value={sectionCopyState.subtitle}
            onChange={(e) => setSectionCopyState({ ...sectionCopyState, subtitle: e.target.value })}
            className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(journalArticles || []).map((art) => (
          <div
            key={art.id}
            className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden flex flex-col justify-between"
          >
            <div className="h-44 relative bg-[#0B0B0B]">
              <img src={art.image} alt={art.title} className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 flex gap-1.5">
                {art.status === 'draft' && (
                  <span className="px-2 py-0.5 bg-[#6B6B6B] text-white text-[9px] font-bold uppercase tracking-wider rounded-full">Draft</span>
                )}
                {art.isHero && (
                  <span className="px-2 py-0.5 bg-[#F05A7E] text-white text-[9px] font-bold uppercase tracking-wider rounded-full">Hero</span>
                )}
                {art.isEditorsPick && (
                  <span className="px-2 py-0.5 bg-[#C9972B] text-[#0B0B0B] text-[9px] font-bold uppercase tracking-wider rounded-full">Editor's Pick</span>
                )}
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[10px] text-[#6B6B6B] font-mono">{art.date} · {art.readTime} · {art.category}</span>
                <h3 className="font-serif text-base text-[#FAF9F6] mt-1">{art.title}</h3>
                <p className="text-xs text-[#6B6B6B] line-clamp-2 mt-2">{art.excerpt}</p>
              </div>

              <div className="pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-end gap-2">
                <button
                  onClick={() => openEditor(art)}
                  className="px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(art)}
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
