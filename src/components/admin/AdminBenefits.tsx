import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSBenefit, CMSBenefitsSection } from '../../types';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import {
  Plus,
  Trash2,
  Save,
  Check,
  ArrowLeft,
  Sparkles,
  Shield,
  Feather,
  Award,
  Heart,
  ShieldCheck,
  Leaf,
  ImageUp,
  X,
} from 'lucide-react';
import { ImageCropUploadModal } from './ImageCropUploadModal';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Shield,
  Feather,
  Award,
  Heart,
  ShieldCheck,
  Leaf,
};
const AVAILABLE_ICONS = Object.keys(ICON_MAP);

const DEFAULT_SECTION: CMSBenefitsSection = { eyebrow: 'OUR PROMISE', title: 'Beauty you can ', titleHighlight: 'trust.' };

export const AdminBenefits: React.FC = () => {
  const { benefits, saveBenefit, deleteBenefit, benefitsSection, saveBenefitsSection } = useCMS();
  const [editing, setEditing] = useState<CMSBenefit | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [sectionState, setSectionState] = useState<CMSBenefitsSection>(benefitsSection || DEFAULT_SECTION);
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [sectionSaveSuccess, setSectionSaveSuccess] = useState(false);

  useSyncOnce(benefitsSection, setSectionState);

  const handleSaveSection = async () => {
    setIsSavingSection(true);
    const ok = await saveBenefitsSection(sectionState);
    setIsSavingSection(false);
    if (ok) {
      setSectionSaveSuccess(true);
      setTimeout(() => setSectionSaveSuccess(false), 1500);
    }
  };

  const sortedBenefits = [...(benefits || [])].sort((a, b) => a.displayOrder - b.displayOrder);

  const handleCreate = () => {
    setError(null);
    setEditing({
      id: '',
      title: '',
      description: '',
      icon: 'Sparkles',
      displayOrder: sortedBenefits.reduce((max, b) => Math.max(max, b.displayOrder || 0), 0) + 1,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!editing.description.trim()) {
      setError('Description is required.');
      return;
    }
    setError(null);
    setIsSaving(true);
    const ok = await saveBenefit(editing);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditing(null);
      }, 700);
    } else {
      setError('Save failed. Please try again.');
    }
  };

  const handleDelete = async (benefit: CMSBenefit) => {
    if (!window.confirm(`Delete this benefit?\n\n"${benefit.title}"\n\nThis action cannot be undone.`)) return;
    await deleteBenefit(benefit.id);
  };

  const handleToggleActive = async (benefit: CMSBenefit) => {
    await saveBenefit({ id: benefit.id, isActive: !benefit.isActive });
  };

  if (editing) {
    const PreviewIcon = ICON_MAP[editing.icon] || Sparkles;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-xl text-[#FAF9F6]">{editing.id ? 'Edit Benefit' : 'Add Benefit'}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : editing.id ? 'Update' : 'Create'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 max-w-4xl">
          <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
            {error && (
              <div className="p-3 bg-[#F05A7E]/10 border border-[#F05A7E]/30 rounded-lg text-xs text-[#F05A7E]">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Title *
              </label>
              <input
                type="text"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Description *
              </label>
              <textarea
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Icon
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {AVAILABLE_ICONS.map((iconName) => {
                  const Icon = ICON_MAP[iconName];
                  const isSelected = editing.icon === iconName && !editing.imageUrl;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setEditing({ ...editing, icon: iconName, imageUrl: undefined, imagePublicId: undefined })}
                      className={`p-2.5 rounded-lg border transition-colors cursor-pointer ${
                        isSelected ? 'bg-[#C9972B] border-[#C9972B] text-[#0B0B0B]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B] hover:border-[#C9972B]'
                      }`}
                      title={iconName}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#6B6B6B] mb-2">Or upload a custom icon image instead:</p>
              {editing.imageUrl ? (
                <div className="flex items-center gap-2">
                  <img src={editing.imageUrl} alt="Custom icon" className="w-10 h-10 rounded-lg object-cover border border-[#E8D5A8]/30" />
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, imageUrl: undefined, imagePublicId: undefined })}
                    className="flex items-center gap-1 text-[11px] text-[#F05A7E] hover:underline cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Remove custom image
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ImageUp className="w-3.5 h-3.5 text-[#F05A7E]" />
                  <span>Upload Custom Icon Image</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  min={1}
                  value={editing.displayOrder}
                  onChange={(e) => setEditing({ ...editing, displayOrder: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Status
                </label>
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, isActive: !editing.isActive })}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors ${
                    editing.isActive
                      ? 'bg-[#C9972B]/10 text-[#E3B84B] border-[#C9972B]/40'
                      : 'bg-[#F05A7E]/10 text-[#F05A7E] border-[#F05A7E]/30'
                  }`}
                >
                  {editing.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          </div>

          {/* Live preview — exactly how this renders on the public website */}
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-[#6B6B6B] uppercase tracking-wider">Live Preview</span>
            <div className="flex items-start gap-4 p-6 bg-white rounded-3xl border border-[#E8D5A8] shadow-[0_4px_16px_rgba(240,90,126,0.04)]">
              <div className="p-3 bg-[#FCE8ED] text-[#F05A7E] rounded-2xl flex-shrink-0 border border-[#E8D5A8] overflow-hidden w-11 h-11 flex items-center justify-center">
                {editing.imageUrl ? (
                  <img src={editing.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <PreviewIcon className="w-5 h-5 stroke-[2]" />
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-base font-bold text-[#121212] break-words">{editing.title || 'Benefit Title'}</h3>
                <p className="text-xs text-[#6B6B6B] leading-relaxed break-words">
                  {editing.description || 'Benefit description will appear here.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <ImageCropUploadModal
          isOpen={showUpload}
          onClose={() => setShowUpload(false)}
          title="Upload Custom Icon Image"
          aspectRatio={1}
          minWidth={200}
          minHeight={200}
          recommendedWidth={400}
          recommendedHeight={400}
          outputWidth={400}
          outputHeight={400}
          onUploaded={({ url, publicId }) => setEditing((prev) => (prev ? { ...prev, imageUrl: url, imagePublicId: publicId } : prev))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Benefits &amp; Optimization</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Manage the trust/benefit pillars shown on the homepage. Only active items appear on the site, ordered by Display Order.
          </p>
        </div>

        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Add Benefit</span>
        </button>
      </div>

      <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#FAF9F6] uppercase tracking-wider">Section Heading</h3>
          <button
            onClick={handleSaveSection}
            disabled={isSavingSection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:opacity-50"
          >
            {sectionSaveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{sectionSaveSuccess ? 'Saved!' : isSavingSection ? 'Saving...' : 'Save Heading'}</span>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Eyebrow</label>
            <input
              type="text"
              value={sectionState.eyebrow}
              onChange={(e) => setSectionState({ ...sectionState, eyebrow: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Title</label>
            <input
              type="text"
              value={sectionState.title}
              onChange={(e) => setSectionState({ ...sectionState, title: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Title Highlight</label>
            <input
              type="text"
              value={sectionState.titleHighlight}
              onChange={(e) => setSectionState({ ...sectionState, titleHighlight: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E8D5A8]/30 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-[#171717] text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B]">
              <th className="p-4">Title</th>
              <th className="p-4 w-20">Order</th>
              <th className="p-4 w-28">Status</th>
              <th className="p-4 w-40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedBenefits.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B]">
                  No benefits yet. Click "Add Benefit" to create one.
                </td>
              </tr>
            )}
            {sortedBenefits.map((benefit) => {
              const Icon = ICON_MAP[benefit.icon] || Sparkles;
              return (
                <tr key={benefit.id} className="bg-[#0B0B0B] border-t border-[#E8D5A8]/10">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#FCE8ED]/10 border border-[#E8D5A8]/20 flex items-center justify-center text-[#C9972B] shrink-0 overflow-hidden">
                        {benefit.imageUrl ? (
                          <img src={benefit.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#FAF9F6]">{benefit.title}</p>
                        <p className="text-[11px] text-[#6B6B6B] line-clamp-1">{benefit.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-xs text-[#FAF9F6] font-mono">{benefit.displayOrder}</td>
                  <td className="p-4">
                    <button
                      onClick={() => handleToggleActive(benefit)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                        benefit.isActive
                          ? 'bg-[#C9972B]/10 text-[#E3B84B] border border-[#C9972B]/40'
                          : 'bg-[#6B6B6B]/10 text-[#6B6B6B] border border-[#6B6B6B]/30'
                      }`}
                    >
                      {benefit.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditing(benefit)}
                        className="px-3 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(benefit)}
                        className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
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
      </div>
    </div>
  );
};
