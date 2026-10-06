// [Glamik CMS] 2026-10-06 — Homepage Background Manager (simple mode): per
// section, upload one decorative image + a "halka↔strong" strength slider +
// active toggle. It appears softly behind the section with a gentle fade.
// (Data model still supports rotation/schedule; this UI keeps it one-image-simple.)
import React, { useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSHomepageBackgrounds, CMSBackgroundItem } from '@glamirk/shared/types';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { MediaUploadField } from './MediaUploadField';
import { Save, Check, Eye, EyeOff, Trash2, Image as ImageIcon } from 'lucide-react';

export const AdminBackgroundManager: React.FC = () => {
  const { homepageBackgrounds, saveHomepageBackgrounds } = useCMS();
  const [state, setState] = useState<CMSHomepageBackgrounds>(homepageBackgrounds || { sections: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useSyncOnce(homepageBackgrounds, setState);

  // Each section is managed as ONE primary image (items[0]) for simplicity.
  const setPrimary = (key: string, patch: Partial<CMSBackgroundItem>) =>
    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) => {
        if (sec.sectionKey !== key) return sec;
        const existing = sec.items[0];
        const base: CMSBackgroundItem = existing || {
          id: `bg-${Date.now()}`,
          name: `${sec.displayName} Background`,
          desktopImage: '',
          isActive: true,
          opacity: 25,
          fit: 'cover',
          position: 'center',
          overlay: 'none',
          overlayOpacity: 0,
          priority: 0,
        };
        return { ...sec, items: [{ ...base, ...patch }] };
      }),
    }));

  const clearPrimary = (key: string) => {
    if (!window.confirm('Remove this background image?')) return;
    setState((s) => ({ ...s, sections: s.sections.map((sec) => (sec.sectionKey === key ? { ...sec, items: [] } : sec)) }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveHomepageBackgrounds(state);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Homepage Backgrounds</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Har section ke liye ek image upload karo — wo peeche <span className="text-[#E8D5A8]">halka (faded)</span> dikhegi, soft fade ke saath. Empty = built-in design.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 shrink-0"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save & Publish'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {state.sections.map((sec) => {
          const bg = sec.items[0];
          const strength = bg?.opacity ?? 25;
          return (
            <div key={sec.sectionKey} className="p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#FAF9F6]">{sec.displayName}</h3>
                {bg?.desktopImage && (
                  <button
                    onClick={() => setPrimary(sec.sectionKey, { isActive: !bg.isActive })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${bg.isActive ? 'bg-[#2E7D32]/20 border-[#2E7D32]/40 text-[#7BD389]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B]'}`}
                  >
                    {bg.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {bg.isActive ? 'On' : 'Off'}
                  </button>
                )}
              </div>

              {/* Soft preview */}
              <div className="relative h-28 rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-gradient-to-br from-[#FFF7F7] to-[#FCE7EC] flex items-center justify-center">
                {bg?.desktopImage ? (
                  <img src={bg.desktopImage} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: (bg.isActive ? 1 : 0.4) * (strength / 100) }} />
                ) : (
                  <span className="text-[11px] text-[#6B6B6B]">No image — built-in design</span>
                )}
              </div>

              <MediaUploadField
                kind="image"
                label={bg?.desktopImage ? 'Replace Image' : 'Upload Background Image'}
                value={bg?.desktopImage || ''}
                onChange={(url) => setPrimary(sec.sectionKey, { desktopImage: url })}
              />

              {bg?.desktopImage && (
                <>
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                      <span>Strength (halka → strong)</span>
                      <span className="text-[#C9972B]">{strength}%</span>
                    </label>
                    <input type="range" min={5} max={100} value={strength} onChange={(e) => setPrimary(sec.sectionKey, { opacity: Number(e.target.value) })} className="w-full accent-[#F05A7E]" />
                  </div>
                  <button onClick={() => clearPrimary(sec.sectionKey)} className="inline-flex items-center gap-1.5 text-[11px] text-[#6B6B6B] hover:text-[#F05A7E] cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /> Remove image
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
