import React, { useState } from 'react';
import { Save, Check, Plus, Trash2, GripVertical, ImageOff } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { CMSShadeFinderTeaser, CMSShadeUndertoneProfile } from '../../types';
import { ImageCropUploadModal } from './ImageCropUploadModal';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { useDragReorder } from '../../hooks/useDragReorder';

const DEFAULT_TEASER: CMSShadeFinderTeaser = {
  badgeText: 'Shade Intelligence',
  heading: 'Find Your Perfect Match',
  subheading: 'Formulated precisely for Indian skin tones.',
  description: 'Every skin tone carries a unique melody of melanin and undertone depth.',
  ctaText: 'Find My Signature Shade',
  profiles: [],
};

export const AdminShadeIntelligence: React.FC = () => {
  const { shadeFinderTeaser, saveShadeFinderTeaser } = useCMS();
  const [state, setState] = useState<CMSShadeFinderTeaser>(shadeFinderTeaser || DEFAULT_TEASER);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<number | null>(null);

  useSyncOnce(shadeFinderTeaser, setState);

  const updateField = <K extends keyof CMSShadeFinderTeaser>(field: K, value: CMSShadeFinderTeaser[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveShadeFinderTeaser(state);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const profiles = state.profiles || [];

  const handleAddProfile = () => {
    const newProfile: CMSShadeUndertoneProfile = {
      id: `profile-${Date.now()}`,
      label: 'New',
      title: 'New Undertone',
      description: 'Describe this undertone profile.',
      recommendedLip: '',
      recommendedSindoor: '',
      swatchHexes: ['#C9972B', '#E8D5A8', '#F05A7E'],
      visual: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=85',
    };
    updateField('profiles', [...profiles, newProfile]);
  };

  const handleUpdateProfile = (idx: number, updates: Partial<CMSShadeUndertoneProfile>) => {
    const updated = [...profiles];
    updated[idx] = { ...updated[idx], ...updates };
    updateField('profiles', updated);
  };

  const handleUpdateSwatch = (idx: number, swatchIdx: number, hex: string) => {
    const updated = [...profiles];
    const swatches = [...updated[idx].swatchHexes];
    swatches[swatchIdx] = hex;
    updated[idx] = { ...updated[idx], swatchHexes: swatches };
    updateField('profiles', updated);
  };

  const handleDeleteProfile = (idx: number) => {
    if (!window.confirm('Delete this undertone profile?')) return;
    updateField('profiles', profiles.filter((_, i) => i !== idx));
  };

  const { dragIndex, setDragIndex, handleDrop: handleProfileDrop } = useDragReorder<CMSShadeUndertoneProfile>(
    profiles,
    (next) => updateField('profiles', next)
  );

  const inputClass =
    'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none';
  const labelClass = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

  return (
    <div className="space-y-6">
      {/* Header with Save */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E8D5A8]/20">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl text-[#FAF9F6]">Shade Intelligence (Homepage)</h2>
          <p className="text-xs text-[#6B6B6B] mt-1">
            The "Find Your Perfect Match" undertone teaser shown on the homepage — separate from the Find My Shade Journey page.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          type="button"
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#F05A7E] hover:bg-[#F05A7E] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-[0_4px_14px_rgba(240,90,126,0.3)] disabled:opacity-50"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved Live!' : isSaving ? 'Saving...' : 'Save & Publish Live'}</span>
        </button>
      </div>

      {/* Section copy */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <h3 className="font-serif text-base text-[#FAF9F6]">Section Copy</h3>

        <div>
          <label className={labelClass}>Badge Text</label>
          <input type="text" value={state.badgeText} onChange={(e) => updateField('badgeText', e.target.value)} className={inputClass} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Heading</label>
            <input type="text" value={state.heading} onChange={(e) => updateField('heading', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Subheading (pink line)</label>
            <input type="text" value={state.subheading} onChange={(e) => updateField('subheading', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea rows={3} value={state.description} onChange={(e) => updateField('description', e.target.value)} className={`${inputClass} leading-relaxed`} />
        </div>

        <div>
          <label className={labelClass}>CTA Button Text</label>
          <input type="text" value={state.ctaText} onChange={(e) => updateField('ctaText', e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* Undertone Profiles */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Undertone Profiles</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              Each pill in the selector below maps to one of these profiles. Drag to reorder.
            </p>
          </div>
          <button onClick={handleAddProfile} type="button" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0">
            <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span>Add Profile</span>
          </button>
        </div>

        {profiles.length === 0 && (
          <div className="p-6 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl">
            No profiles yet — the section stays hidden on the live site until at least one is added.
          </div>
        )}

        <div className="space-y-4">
          {profiles.map((profile, idx) => (
            <div
              key={profile.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleProfileDrop(idx)}
              className={`p-4 bg-[#0B0B0B] border rounded-xl space-y-3 transition-colors ${
                dragIndex === idx ? 'border-[#F05A7E]/60 opacity-60' : 'border-[#E8D5A8]/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-[#6B6B6B] cursor-grab active:cursor-grabbing" title="Drag to reorder" />
                  <span className="text-xs font-bold text-[#E3B84B] uppercase tracking-wider">Profile {idx + 1}</span>
                </div>
                <button onClick={() => handleDeleteProfile(idx)} className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer" title="Remove profile">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Pill Label (short)</label>
                  <input type="text" value={profile.label} onChange={(e) => handleUpdateProfile(idx, { label: e.target.value })} placeholder="Warm" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Match Card Title</label>
                  <input type="text" value={profile.title} onChange={(e) => handleUpdateProfile(idx, { title: e.target.value })} placeholder="Warm & Golden" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                </div>
              </div>

              <textarea
                rows={2}
                value={profile.description}
                onChange={(e) => handleUpdateProfile(idx, { description: e.target.value })}
                placeholder="Description"
                className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] leading-relaxed"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="text" value={profile.recommendedLip} onChange={(e) => handleUpdateProfile(idx, { recommendedLip: e.target.value })} placeholder="Recommended lip shade(s)" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                <input type="text" value={profile.recommendedSindoor} onChange={(e) => handleUpdateProfile(idx, { recommendedSindoor: e.target.value })} placeholder="Recommended sindoor shade(s)" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5">Swatch Dots</label>
                <div className="flex items-center gap-3">
                  {[0, 1, 2].map((swatchIdx) => (
                    <div key={swatchIdx} className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={/^#([0-9a-fA-F]{6})$/.test(profile.swatchHexes[swatchIdx] || '') ? profile.swatchHexes[swatchIdx] : '#F05A7E'}
                        onChange={(e) => handleUpdateSwatch(idx, swatchIdx, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-[#E8D5A8]/30"
                        title={`Swatch ${swatchIdx + 1}`}
                      />
                      <input
                        type="text"
                        value={profile.swatchHexes[swatchIdx] || ''}
                        onChange={(e) => handleUpdateSwatch(idx, swatchIdx, e.target.value)}
                        className="w-20 px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[10px] font-mono text-[#FAF9F6]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-16 aspect-[4/5] rounded-lg overflow-hidden border border-[#E8D5A8]/30 bg-[#171717] shrink-0 flex items-center justify-center">
                  {profile.visual ? (
                    <img src={profile.visual} alt="Visual preview" className="w-full h-full object-contain" />
                  ) : (
                    <ImageOff className="w-4 h-4 text-[#6B6B6B]" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B]">Right-Column Visual</label>
                  <input type="text" value={profile.visual} onChange={(e) => handleUpdateProfile(idx, { visual: e.target.value })} placeholder="Image URL" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                  <button
                    type="button"
                    onClick={() => setUploadTarget(idx)}
                    className="px-3 py-1 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[10px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Upload &amp; Crop
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {uploadTarget !== null && (
        <ImageCropUploadModal
          isOpen
          onClose={() => setUploadTarget(null)}
          title={`Upload Visual for Profile ${uploadTarget + 1}`}
          aspectRatio={4 / 5}
          minWidth={640}
          minHeight={800}
          recommendedWidth={800}
          recommendedHeight={1000}
          outputWidth={800}
          outputHeight={1000}
          onUploaded={({ url }) => handleUpdateProfile(uploadTarget, { visual: url })}
        />
      )}
    </div>
  );
};
