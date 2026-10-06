import React, { useState } from 'react';
import { Save, Check, Plus, Trash2, GripVertical, ImageOff, Eye, EyeOff } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSShadeFinderTeaser, CMSShadeUndertoneProfile, CMSShadeLookType, CMSShadeMatchConfig } from '@glamirk/shared/types';
import { ImageCropUploadModal } from './ImageCropUploadModal';
import { MediaUploadField } from './MediaUploadField';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { useDragReorder } from '../../hooks/useDragReorder';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

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
  const [matrixCell, setMatrixCell] = useState<{ undertoneId: string; lookTypeId: string } | null>(null);

  useSyncOnce(shadeFinderTeaser, setState);

  // [Glamik CMS] 2026-10-03 — look-types + undertone×look-type matrix editor
  // (match content, before/after images, swatches, CTA per cell).
  const lookTypes = state.lookTypes || [];
  const configs = state.configs || [];

  // ----- Look types -----
  const addLookType = () => {
    const lt: CMSShadeLookType = { id: `look-${Date.now()}`, name: 'New Option', description: '', iconUrl: '', sortOrder: lookTypes.length, isActive: true };
    setState((s) => ({ ...s, lookTypes: [...(s.lookTypes || []), lt] }));
  };
  const updateLookType = (id: string, patch: Partial<CMSShadeLookType>) =>
    setState((s) => ({ ...s, lookTypes: (s.lookTypes || []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const deleteLookType = (id: string) => {
    if (!window.confirm('Delete this look-type and its matrix cells?')) return;
    setState((s) => ({
      ...s,
      lookTypes: (s.lookTypes || []).filter((l) => l.id !== id),
      configs: (s.configs || []).filter((c) => c.lookTypeId !== id),
    }));
  };
  const moveLookType = (index: number, dir: -1 | 1) =>
    setState((s) => {
      const arr = [...(s.lookTypes || [])];
      const ni = index + dir;
      if (ni < 0 || ni >= arr.length) return s;
      [arr[index], arr[ni]] = [arr[ni], arr[index]];
      return { ...s, lookTypes: arr.map((l, i) => ({ ...l, sortOrder: i })) };
    });

  // ----- Matrix configs -----
  const getConfig = (undertoneId: string, lookTypeId: string): CMSShadeMatchConfig =>
    configs.find((c) => c.undertoneId === undertoneId && c.lookTypeId === lookTypeId) || {
      undertoneId,
      lookTypeId,
      beforeLabel: 'Before',
      afterLabel: 'After',
      swatches: [],
      isActive: true,
    };
  const updateConfig = (undertoneId: string, lookTypeId: string, patch: Partial<CMSShadeMatchConfig>) =>
    setState((s) => {
      const existing = (s.configs || []).find((c) => c.undertoneId === undertoneId && c.lookTypeId === lookTypeId);
      const next = existing
        ? (s.configs || []).map((c) => (c.undertoneId === undertoneId && c.lookTypeId === lookTypeId ? { ...c, ...patch } : c))
        : [...(s.configs || []), { ...getConfig(undertoneId, lookTypeId), ...patch }];
      return { ...s, configs: next };
    });

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Highlighted Heading Part (pink)</label>
            <input type="text" value={state.highlight || ''} onChange={(e) => updateField('highlight', e.target.value)} placeholder="Perfect Match" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Look-Type Selector Label</label>
            <input type="text" value={state.chooseLabel || ''} onChange={(e) => updateField('chooseLabel', e.target.value)} placeholder="Choose what you're looking for:" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>CTA Button Text</label>
          <input type="text" value={state.ctaText} onChange={(e) => updateField('ctaText', e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* Look Types */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Looking-For Options</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">The selectable categories (Lip Shade, Sindoor, etc.). Each undertone × option has its own matrix cell below.</p>
          </div>
          <button onClick={addLookType} type="button" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#262626] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0">
            <Plus className="w-3.5 h-3.5 text-[#F05A7E]" /> Add Option
          </button>
        </div>

        {lookTypes.length === 0 && (
          <div className="p-5 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl">
            No options yet — add some to enable the "Choose what you're looking for" selector and the matrix.
          </div>
        )}

        {lookTypes.map((lt, idx) => (
          <div key={lt.id} className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-[#171717] border border-[#E8D5A8]/20 overflow-hidden shrink-0 flex items-center justify-center">
                {lt.iconUrl ? <img src={cloudinaryImageUrl(lt.iconUrl, 'thumb')} alt="" className="w-full h-full object-cover" /> : <ImageOff className="w-3.5 h-3.5 text-[#6B6B6B]" />}
              </span>
              <input type="text" value={lt.name} onChange={(e) => updateLookType(lt.id, { name: e.target.value })} placeholder="Option name" className="flex-1 min-w-[140px] px-3 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
              <button onClick={() => moveLookType(idx, -1)} disabled={idx === 0} className="px-2 py-1 text-xs bg-[#171717] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↑</button>
              <button onClick={() => moveLookType(idx, 1)} disabled={idx === lookTypes.length - 1} className="px-2 py-1 text-xs bg-[#171717] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↓</button>
              <button onClick={() => updateLookType(lt.id, { isActive: !lt.isActive })} className={`p-1.5 rounded border cursor-pointer ${lt.isActive ? 'border-[#2E7D32]/40 text-[#7BD389]' : 'border-[#E8D5A8]/30 text-[#6B6B6B]'}`} title={lt.isActive ? 'Active' : 'Hidden'}>
                {lt.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => deleteLookType(lt.id)} className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" value={lt.description || ''} onChange={(e) => updateLookType(lt.id, { description: e.target.value })} placeholder="Short description" className="px-3 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
            </div>
            <MediaUploadField kind="image" label="Option Icon (small image)" value={lt.iconUrl || ''} onChange={(url) => updateLookType(lt.id, { iconUrl: url })} />
          </div>
        ))}
      </div>

      {/* Personalization Matrix */}
      {lookTypes.length > 0 && profiles.length > 0 && (
        <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Personalization Matrix</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">Each cell = one undertone × one look-type. Click a cell to edit its match content and before/after images. Empty fields fall back to the undertone profile.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left text-[#6B6B6B] font-semibold"></th>
                  {lookTypes.map((lt) => (
                    <th key={lt.id} className="p-2 text-center text-[#E8D5A8] font-semibold whitespace-nowrap">{lt.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="p-2 text-[#FAF9F6] font-semibold whitespace-nowrap">{p.title}</td>
                    {lookTypes.map((lt) => {
                      const cfg = configs.find((c) => c.undertoneId === p.id && c.lookTypeId === lt.id);
                      const isOpen = matrixCell?.undertoneId === p.id && matrixCell?.lookTypeId === lt.id;
                      const configured = cfg && (cfg.beforeImage || cfg.afterImage || cfg.matchTitle);
                      return (
                        <td key={lt.id} className="p-1.5">
                          <button
                            onClick={() => setMatrixCell(isOpen ? null : { undertoneId: p.id, lookTypeId: lt.id })}
                            className={`w-full px-2 py-2 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                              isOpen ? 'bg-[#F05A7E] border-[#F05A7E] text-white' : configured ? 'bg-[#0B0B0B] border-[#2E7D32]/40 text-[#7BD389] hover:border-[#F05A7E]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B] hover:border-[#F05A7E]'
                            }`}
                          >
                            {isOpen ? 'Editing' : configured ? 'Edit ✓' : 'Edit'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cell editor */}
          {matrixCell && (() => {
            const p = profiles.find((x) => x.id === matrixCell.undertoneId);
            const lt = lookTypes.find((x) => x.id === matrixCell.lookTypeId);
            if (!p || !lt) return null;
            const cfg = getConfig(matrixCell.undertoneId, matrixCell.lookTypeId);
            const up = (patch: Partial<CMSShadeMatchConfig>) => updateConfig(matrixCell.undertoneId, matrixCell.lookTypeId, patch);
            const swatches = cfg.swatches || [];
            return (
              <div className="p-5 rounded-xl bg-[#0B0B0B] border border-[#F05A7E]/40 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">{p.title} × {lt.name}</h4>
                  <button onClick={() => updateConfig(matrixCell.undertoneId, matrixCell.lookTypeId, { isActive: !cfg.isActive })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border cursor-pointer ${cfg.isActive ? 'bg-[#2E7D32]/20 border-[#2E7D32]/40 text-[#7BD389]' : 'bg-[#171717] border-[#E8D5A8]/30 text-[#6B6B6B]'}`}>
                    {cfg.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}{cfg.isActive ? 'Active' : 'Hidden'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Match Title</label>
                    <input type="text" value={cfg.matchTitle || ''} onChange={(e) => up({ matchTitle: e.target.value })} placeholder={`${p.title} Match`} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Visual Title (under image)</label>
                    <input type="text" value={cfg.visualTitle || ''} onChange={(e) => up({ visualTitle: e.target.value })} placeholder={`${p.title} Spectrum`} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Match Description</label>
                  <textarea rows={2} value={cfg.matchDescription || ''} onChange={(e) => up({ matchDescription: e.target.value })} className={inputClass} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Primary Label</label>
                    <input type="text" value={cfg.primaryLabel || ''} onChange={(e) => up({ primaryLabel: e.target.value })} placeholder="Lip" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Primary Recommendation</label>
                    <input type="text" value={cfg.primary || ''} onChange={(e) => up({ primary: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Secondary Label</label>
                    <input type="text" value={cfg.secondaryLabel || ''} onChange={(e) => up({ secondaryLabel: e.target.value })} placeholder="Sindoor" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Secondary Recommendation</label>
                    <input type="text" value={cfg.secondary || ''} onChange={(e) => up({ secondary: e.target.value })} className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E8D5A8]/15">
                  <div className="space-y-2">
                    <MediaUploadField kind="image" label="Before Image" value={cfg.beforeImage || ''} onChange={(url) => up({ beforeImage: url })} />
                    <input type="text" value={cfg.beforeLabel || ''} onChange={(e) => up({ beforeLabel: e.target.value })} placeholder="Before label (e.g. Original)" className={inputClass} />
                    {cfg.beforeImage && <img src={cloudinaryImageUrl(cfg.beforeImage, 'thumb')} alt="" className="w-full h-28 object-cover rounded-lg border border-[#E8D5A8]/20" />}
                  </div>
                  <div className="space-y-2">
                    <MediaUploadField kind="image" label="After Image" value={cfg.afterImage || ''} onChange={(url) => up({ afterImage: url })} />
                    <input type="text" value={cfg.afterLabel || ''} onChange={(e) => up({ afterLabel: e.target.value })} placeholder="After label (e.g. Matched)" className={inputClass} />
                    {cfg.afterImage && <img src={cloudinaryImageUrl(cfg.afterImage, 'thumb')} alt="" className="w-full h-28 object-cover rounded-lg border border-[#E8D5A8]/20" />}
                  </div>
                </div>

                {/* Swatches */}
                <div className="pt-2 border-t border-[#E8D5A8]/15">
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelClass + ' mb-0'}>Swatches</label>
                    <button onClick={() => up({ swatches: [...swatches, { color: '#E0265F', name: '' }] })} className="text-[11px] px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[#FAF9F6] cursor-pointer inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
                  </div>
                  <div className="space-y-2">
                    {swatches.map((sw, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <input type="color" value={/^#([0-9a-fA-F]{6})$/.test(sw.color) ? sw.color : '#E0265F'} onChange={(e) => up({ swatches: swatches.map((x, i) => (i === si ? { ...x, color: e.target.value } : x)) })} className="w-8 h-8 rounded cursor-pointer bg-transparent border border-[#E8D5A8]/30" />
                        <input type="text" value={sw.color} onChange={(e) => up({ swatches: swatches.map((x, i) => (i === si ? { ...x, color: e.target.value } : x)) })} className="w-24 px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[10px] font-mono text-[#FAF9F6]" />
                        <input type="text" value={sw.name || ''} onChange={(e) => up({ swatches: swatches.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) })} placeholder="Name (optional)" className="flex-1 px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                        <button onClick={() => up({ swatches: swatches.filter((_, i) => i !== si) })} className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E8D5A8]/15">
                  <div>
                    <label className={labelClass}>CTA Label (optional override)</label>
                    <input type="text" value={cfg.ctaLabel || ''} onChange={(e) => up({ ctaLabel: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>CTA URL (optional)</label>
                    <input type="text" value={cfg.ctaUrl || ''} onChange={(e) => up({ ctaUrl: e.target.value })} className={inputClass} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => setMatrixCell(null)} className="px-4 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] hover:bg-[#262626] cursor-pointer">Close Cell</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

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
                  <span title="Drag to reorder" className="inline-flex"><GripVertical className="w-4 h-4 text-[#6B6B6B] cursor-grab active:cursor-grabbing" /></span>
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
                    <img src={cloudinaryImageUrl(profile.visual, 'tile')} alt="Visual preview" className="w-full h-full object-contain" />
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
