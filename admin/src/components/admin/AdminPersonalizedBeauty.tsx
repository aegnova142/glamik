// [Glamik CMS] Added 2026-10-03 — admin editor for the homepage Personalized
// Beauty section (undertones + lip-shade/pairing cards, image/video).
import React, { useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import {
  CMSPersonalizedBeauty,
  CMSPersonalizedUndertone,
  CMSPersonalizedBeautyCard,
} from '@glamirk/shared/types';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { MediaUploadField } from './MediaUploadField';
import { Plus, Trash2, Save, Check, Image as ImageIcon, Film, Eye, EyeOff, ArrowRight } from 'lucide-react';

const DEFAULT_CARD = (badge = ''): CMSPersonalizedBeautyCard => ({
  title: '',
  description: '',
  mediaType: 'image',
  mediaUrl: '',
  posterUrl: '',
  badge,
  ctaLabel: badge ? 'View Product Details' : 'Try On In Live AR',
  ctaUrl: badge ? '#' : '#shade-finder',
});

const DEFAULT_PB: CMSPersonalizedBeauty = {
  badgeText: 'Intelligent Color Calibration',
  heading: 'Personalized',
  headingHighlight: 'Beauty',
  description:
    'Formulations engineered precisely for Indian complexions. Select your undertone or take our 30-second AI diagnostic to receive your bespoke shade matches.',
  stepNumber: '01',
  stepLabel: 'Step One',
  selectHeading: 'Select Your Undertone',
  selectSubtext: 'Choose the undertone that best describes your natural complexion.',
  aiCtaLabel: 'Start AI Shade Diagnostic',
  aiCtaUrl: '#shade-finder',
  matchPreviewLabel: 'Match Preview',
  formulationHeading: 'Your Personalized Formulation Edit',
  lipShadeLabel: 'Recommended Lip Shade',
  pairingLabel: 'Ceremonial Pairing',
  quizPrompt: 'Want a 4-question lifestyle quiz instead?',
  quizCtaLabel: 'Take Beauty Quiz',
  quizCtaUrl: '#beauty-quiz',
  undertones: [],
};

const inputCls = 'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]';
const labelCls = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

/** Admin-side mirror of the storefront preview card, so the admin can verify
 * before saving (spec #11). */
const LivePreview: React.FC<{ label: string; card: CMSPersonalizedBeautyCard; accent: string }> = ({ label, card, accent }) => (
  <div className="bg-white p-3 rounded-xl border border-[#E8D5A8] flex flex-col gap-2 w-full max-w-[220px]">
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-bold text-[#9B2D4F] uppercase tracking-wider">{label}</span>
      {card.badge ? (
        <span className="text-[8px] bg-[#FCE8ED] text-[#9B2D4F] px-1.5 py-0.5 rounded-full font-bold">{card.badge}</span>
      ) : (
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: accent }} />
      )}
    </div>
    <div className="relative w-full aspect-[16/10] overflow-hidden rounded-lg bg-[#FCE8ED] flex items-center justify-center">
      {card.mediaUrl && card.mediaType === 'video' ? (
        <video src={card.mediaUrl} poster={card.posterUrl || undefined} muted loop autoPlay playsInline className="w-full h-full object-cover" />
      ) : card.mediaUrl ? (
        <img src={card.mediaUrl} alt={card.title} className="w-full h-full object-cover" />
      ) : (
        <ImageIcon className="w-5 h-5 text-[#C9972B]/40" />
      )}
    </div>
    <h4 className="font-serif text-sm font-bold text-[#121212]">{card.title || 'Untitled'}</h4>
    {card.description && <p className="text-[10px] text-[#6B6B6B] leading-snug">{card.description}</p>}
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#9B2D4F]">
      {card.ctaLabel || 'Learn more'} <ArrowRight className="w-3 h-3" />
    </span>
  </div>
);

const CardEditor: React.FC<{
  title: string;
  card: CMSPersonalizedBeautyCard;
  accent: string;
  onChange: (patch: Partial<CMSPersonalizedBeautyCard>) => void;
}> = ({ title, card, accent, onChange }) => (
  <div className="p-4 rounded-xl bg-[#0B0B0B] border border-[#E8D5A8]/20 space-y-3">
    <h5 className="text-xs font-bold text-[#FAF9F6] uppercase tracking-wider">{title}</h5>

    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Title *</label>
            <input type="text" value={card.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Badge (optional)</label>
            <input type="text" value={card.badge || ''} onChange={(e) => onChange({ badge: e.target.value })} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea value={card.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Media Type</label>
          <div className="flex gap-2">
            {(['image', 'video'] as const).map((mt) => (
              <button
                key={mt}
                type="button"
                onClick={() => onChange({ mediaType: mt })}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  card.mediaType === mt
                    ? 'bg-[#C9972B] border-[#C9972B] text-[#0B0B0B]'
                    : 'bg-[#171717] border-[#E8D5A8]/30 text-[#FAF9F6] hover:border-[#C9972B]'
                }`}
              >
                {mt === 'video' ? <Film className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                {mt === 'video' ? 'Video' : 'Image'}
              </button>
            ))}
          </div>
        </div>

        <MediaUploadField
          kind={card.mediaType}
          label={card.mediaType === 'video' ? 'Video File / URL' : 'Image File / URL'}
          value={card.mediaUrl}
          onChange={(url) => onChange({ mediaUrl: url })}
        />

        {card.mediaType === 'video' && (
          <MediaUploadField
            kind="image"
            label="Video Poster (thumbnail)"
            value={card.posterUrl || ''}
            onChange={(url) => onChange({ posterUrl: url })}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>CTA Label</label>
            <input type="text" value={card.ctaLabel} onChange={(e) => onChange({ ctaLabel: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>CTA URL / Action</label>
            <input type="text" value={card.ctaUrl} onChange={(e) => onChange({ ctaUrl: e.target.value })} placeholder="#shade-finder, /products/.., https://.." className={inputCls} />
          </div>
        </div>
      </div>

      <div className="flex lg:flex-col items-start gap-2">
        <span className="text-[9px] text-[#6B6B6B] uppercase tracking-wider">Live Preview</span>
        <LivePreview label={title} card={card} accent={accent} />
      </div>
    </div>
  </div>
);

export const AdminPersonalizedBeauty: React.FC = () => {
  const { personalizedBeauty, savePersonalizedBeauty } = useCMS();
  const [state, setState] = useState<CMSPersonalizedBeauty>(personalizedBeauty || DEFAULT_PB);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSyncOnce(personalizedBeauty, setState);

  const set = (patch: Partial<CMSPersonalizedBeauty>) => setState((s) => ({ ...s, ...patch }));

  const updateUndertone = (id: string, patch: Partial<CMSPersonalizedUndertone>) =>
    setState((s) => ({ ...s, undertones: s.undertones.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));

  const updateCard = (id: string, key: 'lipShade' | 'pairing', patch: Partial<CMSPersonalizedBeautyCard>) =>
    setState((s) => ({
      ...s,
      undertones: s.undertones.map((u) => (u.id === id ? { ...u, [key]: { ...u[key], ...patch } } : u)),
    }));

  const addUndertone = () => {
    const u: CMSPersonalizedUndertone = {
      id: `undertone-${Date.now()}`,
      name: 'New Undertone',
      description: '',
      thumbnailUrl: '',
      accentColor: '#C9972B',
      tag: '',
      sortOrder: state.undertones.length,
      isActive: true,
      lipShade: DEFAULT_CARD(''),
      pairing: DEFAULT_CARD('HERITAGE'),
    };
    setState((s) => ({ ...s, undertones: [...s.undertones, u] }));
  };

  const deleteUndertone = (id: string) => {
    if (!window.confirm('Delete this undertone and its content?')) return;
    setState((s) => ({ ...s, undertones: s.undertones.filter((u) => u.id !== id) }));
  };

  const moveUndertone = (index: number, dir: -1 | 1) => {
    const ni = index + dir;
    if (ni < 0 || ni >= state.undertones.length) return;
    const arr = [...state.undertones];
    [arr[index], arr[ni]] = [arr[ni], arr[index]];
    setState((s) => ({ ...s, undertones: arr.map((u, i) => ({ ...u, sortOrder: i })) }));
  };

  const handleSave = async () => {
    setError(null);
    if (state.undertones.some((u) => !u.name.trim())) {
      setError('Every undertone needs a name.');
      return;
    }
    if (state.undertones.some((u) => !u.lipShade.title.trim() || !u.pairing.title.trim())) {
      setError('Each content card (Lip Shade & Pairing) needs a title.');
      return;
    }
    // normalize sortOrder before saving
    const payload: CMSPersonalizedBeauty = {
      ...state,
      undertones: state.undertones.map((u, i) => ({ ...u, sortOrder: i })),
    };
    setIsSaving(true);
    const ok = await savePersonalizedBeauty(payload);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } else {
      setError('Save failed. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Personalized Beauty</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Homepage undertone selector. Edit section copy, undertones, and the Recommended Lip Shade / Ceremonial Pairing cards. Changes appear on the storefront instantly after saving.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 shrink-0"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      {error && <div className="p-3 bg-[#F05A7E]/10 border border-[#F05A7E]/30 rounded-lg text-xs text-[#F05A7E]">{error}</div>}

      {/* Section copy */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4 max-w-3xl">
        <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Section Copy</h3>
        <div>
          <label className={labelCls}>Badge Text</label>
          <input type="text" value={state.badgeText} onChange={(e) => set({ badgeText: e.target.value })} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Heading</label>
            <input type="text" value={state.heading} onChange={(e) => set({ heading: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Heading Highlight (italic)</label>
            <input type="text" value={state.headingHighlight} onChange={(e) => set({ headingHighlight: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea value={state.description} onChange={(e) => set({ description: e.target.value })} rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Step Number</label>
            <input type="text" value={state.stepNumber} onChange={(e) => set({ stepNumber: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Step Label</label>
            <input type="text" value={state.stepLabel} onChange={(e) => set({ stepLabel: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Select Heading</label>
            <input type="text" value={state.selectHeading} onChange={(e) => set({ selectHeading: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Select Subtext</label>
          <input type="text" value={state.selectSubtext} onChange={(e) => set({ selectSubtext: e.target.value })} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>AI Diagnostic CTA Label</label>
            <input type="text" value={state.aiCtaLabel} onChange={(e) => set({ aiCtaLabel: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>AI Diagnostic CTA URL/Action</label>
            <input type="text" value={state.aiCtaUrl} onChange={(e) => set({ aiCtaUrl: e.target.value })} placeholder="#shade-finder" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Match Preview Label</label>
            <input type="text" value={state.matchPreviewLabel} onChange={(e) => set({ matchPreviewLabel: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Formulation Heading</label>
            <input type="text" value={state.formulationHeading} onChange={(e) => set({ formulationHeading: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Lip Shade Card Label</label>
            <input type="text" value={state.lipShadeLabel} onChange={(e) => set({ lipShadeLabel: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Pairing Card Label</label>
            <input type="text" value={state.pairingLabel} onChange={(e) => set({ pairingLabel: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#E8D5A8]/15">
          <div>
            <label className={labelCls}>Quiz Prompt</label>
            <input type="text" value={state.quizPrompt} onChange={(e) => set({ quizPrompt: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Quiz CTA Label</label>
            <input type="text" value={state.quizCtaLabel} onChange={(e) => set({ quizCtaLabel: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Quiz CTA URL/Action</label>
            <input type="text" value={state.quizCtaUrl} onChange={(e) => set({ quizCtaUrl: e.target.value })} placeholder="#beauty-quiz" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Undertones */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Undertones ({state.undertones.length})</h3>
          <button
            onClick={addUndertone}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Undertone</span>
          </button>
        </div>

        {state.undertones.length === 0 && (
          <div className="p-8 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl">
            No undertones yet. Click "Add Undertone" to create one.
          </div>
        )}

        {state.undertones.map((u, index) => (
          <div key={u.id} className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
            {/* Undertone header row */}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="w-10 h-10 rounded-lg shrink-0 bg-cover bg-center border border-[#E8D5A8]/30"
                style={{ backgroundColor: u.accentColor, backgroundImage: u.thumbnailUrl ? `url(${u.thumbnailUrl})` : undefined }}
              />
              <input
                type="text"
                value={u.name}
                onChange={(e) => updateUndertone(u.id, { name: e.target.value })}
                placeholder="Undertone name"
                className="flex-1 min-w-[160px] px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-sm font-serif text-[#FAF9F6]"
              />
              <div className="flex items-center gap-1">
                <button onClick={() => moveUndertone(index, -1)} disabled={index === 0} className="px-2 py-1.5 text-xs bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↑</button>
                <button onClick={() => moveUndertone(index, 1)} disabled={index === state.undertones.length - 1} className="px-2 py-1.5 text-xs bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer">↓</button>
              </div>
              <button
                onClick={() => updateUndertone(u.id, { isActive: !u.isActive })}
                title={u.isActive ? 'Active (visible on site)' : 'Inactive (hidden)'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  u.isActive ? 'bg-[#2E7D32]/20 border-[#2E7D32]/40 text-[#7BD389]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B]'
                }`}
              >
                {u.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {u.isActive ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => deleteUndertone(u.id)} className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Undertone fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Description</label>
                <input type="text" value={u.description} onChange={(e) => updateUndertone(u.id, { description: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Accent Color</label>
                <div className="flex gap-2">
                  <input type="color" value={u.accentColor} onChange={(e) => updateUndertone(u.id, { accentColor: e.target.value })} className="w-10 h-9 rounded bg-[#0B0B0B] border border-[#E8D5A8]/30 cursor-pointer" />
                  <input type="text" value={u.accentColor} onChange={(e) => updateUndertone(u.id, { accentColor: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Preview Tag</label>
                <input type="text" value={u.tag || ''} onChange={(e) => updateUndertone(u.id, { tag: e.target.value })} className={inputCls} />
              </div>
            </div>

            <MediaUploadField kind="image" label="Thumbnail" value={u.thumbnailUrl} onChange={(url) => updateUndertone(u.id, { thumbnailUrl: url })} />

            {/* Two content cards */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <CardEditor title={state.lipShadeLabel || 'Recommended Lip Shade'} card={u.lipShade} accent={u.accentColor} onChange={(patch) => updateCard(u.id, 'lipShade', patch)} />
              <CardEditor title={state.pairingLabel || 'Ceremonial Pairing'} card={u.pairing} accent={u.accentColor} onChange={(patch) => updateCard(u.id, 'pairing', patch)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
