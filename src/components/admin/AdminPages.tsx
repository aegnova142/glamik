/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSPage, CMSPageSection, CMSSectionType } from '../../types';
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
  Copy,
  Check,
  Save,
  Globe,
  Layers,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';

const AVAILABLE_SECTION_TYPES: { type: CMSSectionType; label: string; description: string }[] = [
  { type: 'hero', label: 'Hero Atelier Showcase', description: 'Large luxury editorial banner with heading, description, CTAs, and image' },
  { type: 'promotional_banner', label: 'Promotional Offer Banner', description: 'Highlight campaign banner with coupon code and countdown' },
  { type: 'category_grid', label: 'Category Discovery Grid', description: 'Interactive luxury category tiles (Makeup, Skin, Nails)' },
  { type: 'glamirk_edit', label: 'The Glamirk Edit (Bestsellers)', description: 'Curated carousel or grid of best-selling luxury lipsticks & cleansers' },
  { type: 'cleanser_showcase', label: 'Cleanser Formula Spotlight', description: 'In-depth ingredient & botanical transformation showcase' },
  { type: 'shade_finder_teaser', label: 'AI Shade Finder Diagnostic', description: 'Interactive AI undertone diagnostic invite' },
  { type: 'shop_the_look', label: 'Curated Runway Looks', description: 'Editorial beauty looks with tagged shoppable products' },
  { type: 'glamirk_on_you', label: 'Social Commerce & UGC', description: 'Real complexions, video swatches, and community creator looks' },
  { type: 'journal_section', label: 'The Glamirk Journal Articles', description: 'Editorial beauty guides and skin barrier studies' },
  { type: 'trust_quality_strip', label: 'Trust & Quality Guarantees', description: 'Cruelty-free, vegan, dermatologically tested badges' },
  { type: 'faq_section', label: 'FAQ Accordions', description: 'Categorized client care answers & policies' },
  { type: 'brand_statement', label: 'Brand Philosophy', description: 'Luxury manifesto and formulation philosophy' },
  { type: 'rich_text', label: 'Custom Rich Text Block', description: 'Flexible custom editorial typography and content block' },
];

export const AdminPages: React.FC = () => {
  const { pages, savePage, deletePage } = useCMS();
  const [selectedPage, setSelectedPage] = useState<CMSPage | null>(null);
  const [editingSection, setEditingSection] = useState<CMSPageSection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'sections' | 'seo' | 'settings'>('sections');

  // New Page creation state
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPageTitle.trim()) return;

    const slug = newPageSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || newPageTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const newPage: Partial<CMSPage> = {
      id: 'page-' + Date.now(),
      title: newPageTitle,
      slug,
      status: 'draft',
      seoTitle: `${newPageTitle} | Glamirk Beauty Atelier`,
      seoDescription: `Discover luxury beauty formulations on ${newPageTitle} at Glamirk.`,
      sections: [
        {
          id: 'sec-hero-' + Date.now(),
          type: 'hero',
          title: 'Main Hero',
          order: 1,
          isVisible: true,
          props: {
            eyebrow: 'GLAMIRK ATELIER',
            heading: newPageTitle.toUpperCase(),
            description: 'Luxury formulations calibrated for warm, olive and golden undertones.',
            primaryCtaText: 'EXPLORE NOW',
            primaryCtaUrl: '/shop',
            image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&q=85',
          },
        },
      ],
    };

    setIsSaving(true);
    await savePage(newPage);
    setIsSaving(false);
    setIsCreatingPage(false);
    setNewPageTitle('');
    setNewPageSlug('');
  };

  const handleSaveCurrentPage = async () => {
    if (!selectedPage) return;
    setIsSaving(true);
    const ok = await savePage(selectedPage);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleAddSection = (type: CMSSectionType) => {
    if (!selectedPage) return;
    const newSection: CMSPageSection = {
      id: 'sec-' + type + '-' + Date.now(),
      type,
      title: type.replace(/_/g, ' ').toUpperCase(),
      order: (selectedPage.sections?.length || 0) + 1,
      isVisible: true,
      props: {
        heading: 'SECTION TITLE',
        description: 'Section editorial description.',
      },
    };

    const updated = {
      ...selectedPage,
      sections: [...(selectedPage.sections || []), newSection],
    };
    setSelectedPage(updated);
    setEditingSection(newSection);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    if (!selectedPage || !selectedPage.sections) return;
    const newSections = [...selectedPage.sections];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newSections.length) return;

    const temp = newSections[index];
    newSections[index] = newSections[targetIdx];
    newSections[targetIdx] = temp;

    // reindex order
    newSections.forEach((s, idx) => {
      s.order = idx + 1;
    });

    setSelectedPage({ ...selectedPage, sections: newSections });
  };

  const handleDeleteSection = (secId: string) => {
    if (!selectedPage) return;
    const updated = {
      ...selectedPage,
      sections: selectedPage.sections.filter((s) => s.id !== secId),
    };
    setSelectedPage(updated);
    if (editingSection?.id === secId) {
      setEditingSection(null);
    }
  };

  const handleToggleSectionVisibility = (secId: string) => {
    if (!selectedPage) return;
    const updated = {
      ...selectedPage,
      sections: selectedPage.sections.map((s) =>
        s.id === secId ? { ...s, isVisible: !s.isVisible } : s
      ),
    };
    setSelectedPage(updated);
  };

  const handleUpdateSectionProps = (key: string, value: any) => {
    if (!editingSection || !selectedPage) return;
    const updatedSec = {
      ...editingSection,
      props: {
        ...editingSection.props,
        [key]: value,
      },
    };
    setEditingSection(updatedSec);
    setSelectedPage({
      ...selectedPage,
      sections: selectedPage.sections.map((s) => (s.id === updatedSec.id ? updatedSec : s)),
    });
  };

  // If a page is selected for editing
  if (selectedPage) {
    return (
      <div className="space-y-6">
        {/* Page Editor Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedPage(null);
                setEditingSection(null);
              }}
              className="p-2 rounded-lg bg-[#0B0B0B] hover:bg-[#171717] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl text-[#FAF9F6]">{selectedPage.title}</h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    selectedPage.status === 'published'
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                      : 'bg-[#6B6B6B]/20 text-[#E8D5A8] border border-[#E8D5A8]/30'
                  }`}
                >
                  {selectedPage.status}
                </span>
              </div>
              <p className="text-xs text-[#6B6B6B] font-mono">
                URL: /{selectedPage.slug || ' (Homepage)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedPage.status}
              onChange={(e) =>
                setSelectedPage({ ...selectedPage, status: e.target.value as any })
              }
              className="px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[#FAF9F6] text-xs focus:outline-none"
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
            </select>

            <button
              onClick={handleSaveCurrentPage}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save & Publish'}</span>
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-[#E8D5A8]/20 gap-6 text-xs font-semibold uppercase tracking-wider">
          <button
            onClick={() => setActiveTab('sections')}
            className={`pb-3 cursor-pointer transition-colors ${
              activeTab === 'sections' ? 'text-[#C9972B] border-b-2 border-[#C9972B]' : 'text-[#6B6B6B] hover:text-[#FAF9F6]'
            }`}
          >
            Page Sections ({selectedPage.sections?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('seo')}
            className={`pb-3 cursor-pointer transition-colors ${
              activeTab === 'seo' ? 'text-[#C9972B] border-b-2 border-[#C9972B]' : 'text-[#6B6B6B] hover:text-[#FAF9F6]'
            }`}
          >
            SEO & Social Metadata
          </button>
        </div>

        {/* Tab: Sections Page Builder */}
        {activeTab === 'sections' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Sections List & Add Block */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#E8D5A8]">
                  Layout Order
                </span>
              </div>

              <div className="space-y-2">
                {selectedPage.sections?.map((section, idx) => (
                  <div
                    key={section.id}
                    onClick={() => setEditingSection(section)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      editingSection?.id === section.id
                        ? 'bg-[#0B0B0B] border-[#C9972B] ring-1 ring-[#C9972B]'
                        : 'bg-[#171717] border-[#E8D5A8]/20 hover:border-[#E8D5A8]/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-[11px] font-mono text-[#6B6B6B] w-5">
                        #{idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-[#FAF9F6] truncate">
                          {section.title || section.type}
                        </p>
                        <span className="text-[10px] uppercase font-mono text-[#C9972B]">
                          {section.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSectionVisibility(section.id);
                        }}
                        className={`p-1.5 rounded hover:bg-[#0B0B0B] ${
                          section.isVisible ? 'text-emerald-400' : 'text-[#6B6B6B]'
                        }`}
                        title={section.isVisible ? 'Visible' : 'Hidden'}
                      >
                        {section.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveSection(idx, 'up');
                        }}
                        disabled={idx === 0}
                        className="p-1.5 rounded hover:bg-[#0B0B0B] text-[#E8D5A8] disabled:opacity-20 cursor-pointer"
                        title="Move Up"
                      >
                        <MoveUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveSection(idx, 'down');
                        }}
                        disabled={idx === (selectedPage.sections?.length || 0) - 1}
                        className="p-1.5 rounded hover:bg-[#0B0B0B] text-[#E8D5A8] disabled:opacity-20 cursor-pointer"
                        title="Move Down"
                      >
                        <MoveDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSection(section.id);
                        }}
                        className="p-1.5 rounded hover:bg-[#F05A7E]/20 text-[#F05A7E] cursor-pointer"
                        title="Delete Section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Section Dropdown / Drawer */}
              <div className="p-4 rounded-xl bg-[#0B0B0B] border border-[#E8D5A8]/20 space-y-3">
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#C9972B]">
                  + Add Reusable Section Block
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {AVAILABLE_SECTION_TYPES.map((sec) => (
                    <button
                      key={sec.type}
                      type="button"
                      onClick={() => handleAddSection(sec.type)}
                      className="p-2 text-left rounded-lg bg-[#171717] hover:bg-[#0B0B0B] border border-[#E8D5A8]/20 hover:border-[#C9972B] transition-colors cursor-pointer text-xs group"
                    >
                      <p className="font-semibold text-[#FAF9F6] group-hover:text-[#C9972B] truncate">{sec.label}</p>
                      <p className="text-[10px] text-[#6B6B6B] truncate">{sec.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Section Properties Editor */}
            <div className="lg:col-span-7">
              {editingSection ? (
                <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E8D5A8]/15">
                    <div>
                      <h3 className="font-semibold text-sm text-[#FAF9F6]">
                        Edit Section: {editingSection.title}
                      </h3>
                      <span className="text-[10px] font-mono text-[#C9972B] uppercase">
                        Type: {editingSection.type}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingSection(null)}
                      className="text-xs text-[#6B6B6B] hover:text-[#FAF9F6]"
                    >
                      Close Editor
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                        Section Admin Title
                      </label>
                      <input
                        type="text"
                        value={editingSection.title}
                        onChange={(e) => {
                          const updated = { ...editingSection, title: e.target.value };
                          setEditingSection(updated);
                          setSelectedPage({
                            ...selectedPage,
                            sections: selectedPage.sections.map((s) =>
                              s.id === updated.id ? updated : s
                            ),
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                      />
                    </div>

                    {/* Common fields based on section properties */}
                    {editingSection.props.eyebrow !== undefined && (
                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Eyebrow / Subtitle
                        </label>
                        <input
                          type="text"
                          value={editingSection.props.eyebrow || ''}
                          onChange={(e) => handleUpdateSectionProps('eyebrow', e.target.value)}
                          className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                        />
                      </div>
                    )}

                    {editingSection.props.heading !== undefined && (
                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Heading
                        </label>
                        <input
                          type="text"
                          value={editingSection.props.heading || ''}
                          onChange={(e) => handleUpdateSectionProps('heading', e.target.value)}
                          className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                        />
                      </div>
                    )}

                    {editingSection.props.highlightText !== undefined && (
                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Highlighted Heading Text (Gold)
                        </label>
                        <input
                          type="text"
                          value={editingSection.props.highlightText || ''}
                          onChange={(e) => handleUpdateSectionProps('highlightText', e.target.value)}
                          className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                        />
                      </div>
                    )}

                    {editingSection.props.description !== undefined && (
                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Paragraph Description
                        </label>
                        <textarea
                          rows={3}
                          value={editingSection.props.description || ''}
                          onChange={(e) => handleUpdateSectionProps('description', e.target.value)}
                          className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                        />
                      </div>
                    )}

                    {editingSection.props.primaryCtaText !== undefined && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                            Primary CTA Text
                          </label>
                          <input
                            type="text"
                            value={editingSection.props.primaryCtaText || ''}
                            onChange={(e) => handleUpdateSectionProps('primaryCtaText', e.target.value)}
                            className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                            Primary CTA Link
                          </label>
                          <input
                            type="text"
                            value={editingSection.props.primaryCtaUrl || ''}
                            onChange={(e) => handleUpdateSectionProps('primaryCtaUrl', e.target.value)}
                            className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                          />
                        </div>
                      </div>
                    )}

                    {editingSection.props.image !== undefined && (
                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Image URL (or select from Media Library)
                        </label>
                        <input
                          type="text"
                          value={editingSection.props.image || ''}
                          onChange={(e) => handleUpdateSectionProps('image', e.target.value)}
                          className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                        />
                        {editingSection.props.image && (
                          <div className="mt-2 w-full h-32 rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#0B0B0B]">
                            <img
                              src={editingSection.props.image}
                              alt="Section Preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {editingSection.props.badgeText !== undefined && (
                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Badge Text
                        </label>
                        <input
                          type="text"
                          value={editingSection.props.badgeText || ''}
                          onChange={(e) => handleUpdateSectionProps('badgeText', e.target.value)}
                          className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-64 rounded-xl bg-[#171717] border border-dashed border-[#E8D5A8]/30 flex flex-col items-center justify-center text-center p-6 text-[#6B6B6B]">
                  <Layers className="w-8 h-8 text-[#C9972B] mb-2 opacity-50" />
                  <p className="text-xs">Click any section on the left to edit its headings, copy, CTAs, and images.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: SEO & Social */}
        {activeTab === 'seo' && (
          <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 max-w-2xl space-y-4">
            <h3 className="font-serif text-lg text-[#FAF9F6]">Search Engine & Social Sharing Optimization</h3>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#E8D5A8] mb-1">
                SEO Title
              </label>
              <input
                type="text"
                value={selectedPage.seoTitle || ''}
                onChange={(e) => setSelectedPage({ ...selectedPage, seoTitle: e.target.value })}
                className="w-full px-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#E8D5A8] mb-1">
                Meta Description
              </label>
              <textarea
                rows={3}
                value={selectedPage.seoDescription || ''}
                onChange={(e) => setSelectedPage({ ...selectedPage, seoDescription: e.target.value })}
                className="w-full px-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#E8D5A8] mb-1">
                Social Sharing Image (OG:Image) URL
              </label>
              <input
                type="text"
                value={selectedPage.ogImage || ''}
                onChange={(e) => setSelectedPage({ ...selectedPage, ogImage: e.target.value })}
                className="w-full px-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default Page List View
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Pages & Page Builder</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Create, edit, reorder sections, and schedule publication for all storefront pages.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingPage(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Page</span>
        </button>
      </div>

      {/* Create New Page Modal */}
      {isCreatingPage && (
        <div className="p-6 rounded-xl bg-[#171717] border border-[#C9972B] space-y-4">
          <h3 className="font-serif text-lg text-[#FAF9F6]">Create New Dynamic Page</h3>
          <form onSubmit={handleCreatePage} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] mb-1">Page Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Atelier Masterclass"
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] mb-1">URL Slug</label>
                <div className="flex items-center">
                  <span className="px-2 py-2 bg-[#0B0B0B] border border-r-0 border-[#E8D5A8]/30 rounded-l-lg text-xs text-[#6B6B6B]">
                    glamirk.com/
                  </span>
                  <input
                    type="text"
                    placeholder="atelier-masterclass"
                    value={newPageSlug}
                    onChange={(e) => setNewPageSlug(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-r-lg text-xs text-[#FAF9F6]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-semibold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                {isSaving ? 'Creating...' : 'Create & Open Builder'}
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingPage(false)}
                className="text-xs text-[#6B6B6B] hover:text-[#FAF9F6] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pages Table */}
      <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0B0B] border-b border-[#E8D5A8]/20 text-[#E8D5A8] uppercase tracking-wider font-mono">
              <tr>
                <th className="p-4">Page Title</th>
                <th className="p-4">URL Slug</th>
                <th className="p-4">Sections</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8D5A8]/10 text-[#FAF9F6]">
              {(pages || []).map((p) => (
                <tr key={p.id} className="hover:bg-[#0B0B0B]/50 transition-colors">
                  <td className="p-4 font-semibold">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#C9972B]" />
                      <span>{p.title}</span>
                      {p.isSystemPage && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#C9972B]/20 text-[#C9972B]">
                          CORE
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-mono text-[#6B6B6B]">
                    /{p.slug || '(homepage)'}
                  </td>
                  <td className="p-4 text-[#E8D5A8]">
                    {p.sections?.length || 0} blocks
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        p.status === 'published'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                          : 'bg-[#6B6B6B]/20 text-[#E8D5A8] border border-[#E8D5A8]/30'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => setSelectedPage(p)}
                      className="px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Open Builder
                    </button>
                    {!p.isSystemPage && (
                      <button
                        onClick={() => deletePage(p.id)}
                        className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                        title="Delete Page"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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
