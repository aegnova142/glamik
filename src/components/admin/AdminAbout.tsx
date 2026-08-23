import React, { useState } from 'react';
import { Save, Check, Plus, Trash2, RotateCcw as ResetIcon, ImageUp } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { CMSAboutContent } from '../../types';
import { ImageCropUploadModal } from './ImageCropUploadModal';
import { useSyncOnce } from '../../hooks/useSyncOnce';

const AVAILABLE_VALUE_ICONS = ['ShieldCheck', 'Eye', 'Users', 'Leaf', 'FlaskConical', 'Heart'];

const DEFAULT_ABOUT: CMSAboutContent = {
  statementParagraphs: [
    "At Glamirk, we believe that true beauty shouldn't demand a compromise between instant impact and long-term skin health. We are a team of Beauty Advisors, creators, strategists, and beauty enthusiasts united by a single conviction: everyday routines should feel effortless, ethical, and deeply transformative.",
    'Bare skin should look better after you take your makeup off than before you put it on. By combining active botanical extracts, bio-fermented ingredients, and zero-irritation pigments, Glamirk delivers instant aesthetic impact paired with active skin therapy as a makeup brand.',
  ],
  brandSnapshot: [
    { id: 'bs-1', title: 'Brand Name', description: 'Glamirk' },
    { id: 'bs-2', title: 'One-Line Description', description: 'Radiance without compromise. Amplify your beauty.' },
    { id: 'bs-3', title: 'What We Sell', description: 'Premium, affordable, multi-use color cosmetics and tailored personal care formulations.' },
    { id: 'bs-4', title: 'Overall Philosophy', description: 'Beauty should be effortless, ethical, and effective&mdash;bridging clinical-grade ingredients with luxurious self-care.' },
  ],
  founders: [
    { id: 'f-1', name: 'Digangana Suryavanshi', title: 'Chief Customer Officer', focus: "Champions every client's journey — from first shade match to lifelong loyalty.", image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=400&q=80' },
    { id: 'f-2', name: 'Aqueel Ahmed', title: 'Chief Financial Officer', focus: 'Stewards sustainable growth, from ethical sourcing to accessible pricing.', image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80' },
    { id: 'f-3', name: 'Vijay Laxmi Sharma', title: 'Chief Growth Officer', focus: "Drives Glamirk's expansion into new markets and beauty rituals.", image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80' },
    { id: 'f-4', name: 'Poonam Dadhich', title: 'Chief Marketing Officer', focus: 'Shapes the Glamirk voice — editorial storytelling rooted in inclusivity.', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80' },
  ],
  founderStoryAccordion: [
    { id: 'founder-story', label: 'The Founder Story', content: "After years of navigating sensitive skin reactions while working in fast-paced creative environments, we partnered with leading cosmetic chemists to create high-performing, skin-first makeup." },
    { id: 'founder-why', label: 'Why Glamirk Was Created', content: 'Glamirk was founded to eliminate the compromise between instant cosmetic impact and long-term skin health.' },
    { id: 'founder-problem', label: 'The Problem Solved', content: 'Traditional cosmetics often act as a mask that clogs pores and degrades skin quality over time.' },
    { id: 'founder-exist', label: 'Why Glamirk Needs to Exist', content: 'Most beauty brands fall into one of two extremes. Glamirk exists as the bio-compatible bridge.' },
    { id: 'founder-name', label: 'What "Glamirk" Means', content: 'A blend of Glamour and Smirk.' },
    { id: 'founder-pitch', label: 'The Elevator Pitch', content: 'Glamirk is the hybrid beauty brand that gives you immediate editorial-level color while actively repairing your skin barrier.' },
  ],
  ourStoryAccordion: [
    { id: 'story-start', label: 'How It Started', content: 'Born in a small laboratory setting out of a passion for functional aesthetics.' },
    { id: 'story-why', label: 'Why It Was Created', content: 'To strip away unnecessary fillers and toxic additives.' },
    { id: 'story-problem', label: 'The Problem Solved', content: 'Glamirk offers the sweet spot: active performance with gentle ingredients.' },
    { id: 'story-milestones', label: 'Milestones', content: 'Formulated the flagship barrier-repair serum; sold more than 100,000 products.' },
  ],
  mission: 'To empower individuals through simple, highly effective beauty rituals that nurture skin health, enhance confidence, and celebrate individuality.',
  vision: 'To become a global icon in sustainable luxury, setting new standards for clean science and skin inclusivity worldwide.',
  values: [
    { id: 'v-1', icon: 'ShieldCheck', title: 'Quality', description: 'Medical-grade purity in every batch, rigorously batch-tested for potency.' },
    { id: 'v-2', icon: 'Eye', title: 'Transparency', description: 'Full ingredient lists with explicit percentages for key actives.' },
    { id: 'v-3', icon: 'Users', title: 'Inclusivity', description: 'Formulations designed to perform across diverse skin tones, textures, and age groups.' },
    { id: 'v-4', icon: 'Leaf', title: 'Sustainability', description: 'Sourcing ethically, minimizing plastic, and prioritizing refillable designs.' },
    { id: 'v-5', icon: 'FlaskConical', title: 'Innovation', description: 'Utilizing bio-fermented actives and micro-encapsulation for deep delivery.' },
    { id: 'v-6', icon: 'Heart', title: 'Customer-First', description: 'Responsive formulation updates directly driven by community feedback.' },
  ],
  premiumStandardIntro: 'Glamirk achieves its premium status through uncompromising ingredient integrity and tactile design.',
  premiumStandardCards: [
    { id: 'ps-1', title: 'Ingredients & Formulation', description: 'Key Actives: Niacinamide, bio-fermented hyaluronic acid, squalane, and botanical peptides.' },
    { id: 'ps-2', title: 'Quality, Safety & Sustainability', description: 'Testing: Clinical third-party testing, dermatologist-approved, non-irritating certification.' },
    { id: 'ps-3', title: 'Inclusivity', description: 'Skin Tones: Non-ashy mineral pigments for rich color payoff on deep skin tones.' },
  ],
  differentiators: [
    { id: 'd-1', title: 'Active-Infused Pigments', description: 'Every color product contains therapeutic percentages of skincare actives.' },
    { id: 'd-2', title: 'Skin Barrier First', description: 'Formulated without common sensitizers, synthetic heavy fragrances, or silicones.' },
    { id: 'd-3', title: 'Zero-G Texture Technology', description: 'Formulations engineered to feel weightless on the skin.' },
  ],
  neverBecome: [
    { id: 'nb-1', text: 'A trend-chasing brand dropping low-quality products every month.' },
    { id: 'nb-2', text: 'A brand using buzzword ingredients at non-functional levels.' },
    { id: 'nb-3', text: 'An exclusive club that over-complicates routines or prices out consumers.' },
  ],
  futureVisionAccordion: [
    { id: 'future-vision', label: 'Product Innovation, Digital Dominance & Retention', content: 'Executing this vision requires focusing on three fundamental pillars: product innovation, digital dominance, and customer retention.' },
  ],
  elevatorPitchQuote: 'Glamirk is the hybrid beauty brand that gives you immediate editorial-level color while actively repairing your skin barrier.',
  primaryCtaText: 'Shop Glamirk',
  secondaryCtaText: 'Contact Us',
};

const inputClass =
  'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none';
const smallInputClass =
  'w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none';
const labelClass = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

// Generic add/edit/delete list-section editor, reused for every repeating
// content block on the About page (brand facts, founders, values, etc.)
function ListSection<T extends { id: string }>({
  title,
  description,
  items,
  onChange,
  newItemFactory,
  renderFields,
  columns = 2,
}: {
  title: string;
  description?: string;
  items: T[];
  onChange: (items: T[]) => void;
  newItemFactory: () => T;
  renderFields: (item: T, update: (updates: Partial<T>) => void) => React.ReactNode;
  columns?: 1 | 2 | 3;
}) {
  const handleAdd = () => onChange([...items, newItemFactory()]);
  const handleUpdate = (idx: number, updates: Partial<T>) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], ...updates };
    onChange(updated);
  };
  const handleDelete = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const gridClass =
    columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';

  return (
    <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-base text-[#FAF9F6]">{title}</h3>
          {description && <p className="text-xs text-[#6B6B6B] mt-0.5">{description}</p>}
        </div>
        <button
          onClick={handleAdd}
          type="button"
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
          <span>Add</span>
        </button>
      </div>
      <div className={`grid ${gridClass} gap-4`}>
        {items.map((item, idx) => (
          <div key={item.id} className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-2">
            <div className="flex justify-end">
              <button
                onClick={() => handleDelete(idx)}
                className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {renderFields(item, (updates) => handleUpdate(idx, updates))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const AdminAbout: React.FC = () => {
  const { aboutContent, saveAboutContent } = useCMS();
  const [state, setState] = useState<CMSAboutContent>(aboutContent || DEFAULT_ABOUT);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadTargetFounderId, setUploadTargetFounderId] = useState<string | null>(null);

  useSyncOnce(aboutContent, setState);

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveAboutContent(state);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('Reset the About page to the official Glamirk default content?')) {
      setState(DEFAULT_ABOUT);
    }
  };

  const updateField = <K extends keyof CMSAboutContent>(field: K, value: CMSAboutContent[K]) => {
    setState({ ...state, [field]: value });
  };

  const handleUpdateParagraph = (idx: number, value: string) => {
    const updated = [...state.statementParagraphs];
    updated[idx] = value;
    updateField('statementParagraphs', updated);
  };
  const handleAddParagraph = () => updateField('statementParagraphs', [...state.statementParagraphs, 'New paragraph...']);
  const handleDeleteParagraph = (idx: number) =>
    updateField('statementParagraphs', state.statementParagraphs.filter((_, i) => i !== idx));

  return (
    <div className="space-y-6">
      {/* Header with Save & Action Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E8D5A8]/20">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl sm:text-2xl text-[#FAF9F6]">About Page Editor</h2>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/40 rounded-full font-bold">
              Live Sync
            </span>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Full control over every section of the About page — add, edit, or remove any card, founder, or accordion item.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleResetToDefault}
            type="button"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-[#171717] hover:bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            <ResetIcon className="w-3.5 h-3.5" />
            <span>Reset Official Default</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            type="button"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#F05A7E] hover:bg-[#F05A7E] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-[0_4px_14px_rgba(240,90,126,0.3)] disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved Live!' : isSaving ? 'Saving...' : 'Save & Publish Live'}</span>
          </button>
        </div>
      </div>

      {/* About Us Statement */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-base text-[#FAF9F6]">About Us Statement</h3>
          <button onClick={handleAddParagraph} type="button" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span>Add Paragraph</span>
          </button>
        </div>
        {state.statementParagraphs.map((para, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <textarea rows={3} value={para} onChange={(e) => handleUpdateParagraph(idx, e.target.value)} className={`${inputClass} leading-relaxed flex-1`} />
            <button onClick={() => handleDeleteParagraph(idx)} className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer" title="Remove">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Founders */}
      <ListSection
        title="Meet the Founders"
        description="Founder cards + the story accordion below them. Photo crop is locked to 2:1, matching the About page card."
        columns={1}
        items={state.founders}
        onChange={(v) => updateField('founders', v)}
        newItemFactory={() => ({ id: `f-${Date.now()}`, name: 'New Founder', title: 'Title', focus: 'Focus area...', image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=400&q=80', imagePublicId: undefined as string | undefined })}
        renderFields={(f, update) => (
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4">
            {/* Live preview: exactly how this card renders on the public About page */}
            <div className="space-y-2">
              <div className="rounded-2xl overflow-hidden border border-[#E8D5A8]/30 bg-white text-center">
                <div className="aspect-[3/4] w-full overflow-hidden bg-[#FCE8ED]">
                  <img src={f.image} alt={f.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-2.5 space-y-0.5">
                  <p className="text-[10px] font-bold text-[#121212] leading-snug truncate">{f.name}</p>
                  <p className="text-[8px] text-[#F05A7E] font-semibold uppercase tracking-wider truncate">{f.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadTargetFounderId(f.id)}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-2 bg-[#171717] hover:bg-[#0B0B0B] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
              >
                <ImageUp className="w-3 h-3 text-[#F05A7E]" />
                <span>Upload Photo</span>
              </button>
            </div>

            <div className="space-y-2">
              <input type="text" value={f.name} onChange={(e) => update({ name: e.target.value })} placeholder="Name" className={smallInputClass} />
              <input type="text" value={f.title} onChange={(e) => update({ title: e.target.value })} placeholder="Title" className={smallInputClass} />
              <input type="text" value={f.focus} onChange={(e) => update({ focus: e.target.value })} placeholder="Focus line" className={smallInputClass} />
              <input type="text" value={f.image} onChange={(e) => update({ image: e.target.value, imagePublicId: undefined })} placeholder="Or paste an image URL directly" className={smallInputClass} />
            </div>

            {uploadTargetFounderId === f.id && (
              <ImageCropUploadModal
                isOpen
                onClose={() => setUploadTargetFounderId(null)}
                title={`Upload Photo — ${f.name}`}
                aspectRatio={3 / 4}
                minWidth={600}
                minHeight={800}
                recommendedWidth={900}
                recommendedHeight={1200}
                outputWidth={900}
                outputHeight={1200}
                onUploaded={({ url, publicId }) => update({ image: url, imagePublicId: publicId })}
              />
            )}
          </div>
        )}
      />

      <ListSection
        title="Founder Story Accordion"
        items={state.founderStoryAccordion}
        onChange={(v) => updateField('founderStoryAccordion', v)}
        newItemFactory={() => ({ id: `founder-${Date.now()}`, label: 'New Point', content: 'Content...' })}
        renderFields={(item, update) => (
          <>
            <input type="text" value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Heading" className={smallInputClass} />
            <textarea rows={3} value={item.content} onChange={(e) => update({ content: e.target.value })} placeholder="Content" className={smallInputClass} />
          </>
        )}
      />

      {/* Brand Snapshot */}
      <ListSection
        title="Brand Snapshot Cards"
        items={state.brandSnapshot}
        onChange={(v) => updateField('brandSnapshot', v)}
        newItemFactory={() => ({ id: `bs-${Date.now()}`, title: 'New Fact', description: 'Description...' })}
        renderFields={(item, update) => (
          <>
            <input type="text" value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder="Title" className={smallInputClass} />
            <textarea rows={2} value={item.description} onChange={(e) => update({ description: e.target.value })} placeholder="Description" className={smallInputClass} />
          </>
        )}
      />

      {/* Our Story */}
      <ListSection
        title="Our Story Accordion"
        items={state.ourStoryAccordion}
        onChange={(v) => updateField('ourStoryAccordion', v)}
        newItemFactory={() => ({ id: `story-${Date.now()}`, label: 'New Point', content: 'Content...' })}
        renderFields={(item, update) => (
          <>
            <input type="text" value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Heading" className={smallInputClass} />
            <textarea rows={3} value={item.content} onChange={(e) => update({ content: e.target.value })} placeholder="Content" className={smallInputClass} />
          </>
        )}
      />

      {/* Mission & Vision */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <h3 className="font-serif text-base text-[#FAF9F6]">Mission &amp; Vision</h3>
        <div>
          <label className={labelClass}>Mission</label>
          <textarea rows={3} value={state.mission} onChange={(e) => updateField('mission', e.target.value)} className={`${inputClass} leading-relaxed`} />
        </div>
        <div>
          <label className={labelClass}>Vision</label>
          <textarea rows={3} value={state.vision} onChange={(e) => updateField('vision', e.target.value)} className={`${inputClass} leading-relaxed`} />
        </div>
      </div>

      {/* Values */}
      <ListSection
        title="Our Values"
        columns={3}
        items={state.values}
        onChange={(v) => updateField('values', v)}
        newItemFactory={() => ({ id: `v-${Date.now()}`, icon: 'ShieldCheck', title: 'New Value', description: 'Description...' })}
        renderFields={(item, update) => (
          <>
            <select value={item.icon} onChange={(e) => update({ icon: e.target.value })} className={smallInputClass}>
              {AVAILABLE_VALUE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
            </select>
            <input type="text" value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder="Title" className={smallInputClass} />
            <textarea rows={2} value={item.description} onChange={(e) => update({ description: e.target.value })} placeholder="Description" className={smallInputClass} />
          </>
        )}
      />

      {/* Premium Standard */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-3">
        <h3 className="font-serif text-base text-[#FAF9F6]">The Premium Standard — Intro Text</h3>
        <textarea rows={3} value={state.premiumStandardIntro} onChange={(e) => updateField('premiumStandardIntro', e.target.value)} className={`${inputClass} leading-relaxed`} />
      </div>
      <ListSection
        title="Premium Standard Cards"
        columns={3}
        items={state.premiumStandardCards}
        onChange={(v) => updateField('premiumStandardCards', v)}
        newItemFactory={() => ({ id: `ps-${Date.now()}`, title: 'New Card', description: 'Description...' })}
        renderFields={(item, update) => (
          <>
            <input type="text" value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder="Title" className={smallInputClass} />
            <textarea rows={3} value={item.description} onChange={(e) => update({ description: e.target.value })} placeholder="Description" className={smallInputClass} />
          </>
        )}
      />

      {/* Differentiators & Never Become */}
      <ListSection
        title='"What Makes Glamirk Different" List'
        items={state.differentiators}
        onChange={(v) => updateField('differentiators', v)}
        newItemFactory={() => ({ id: `d-${Date.now()}`, title: 'New Point', description: 'Description...' })}
        renderFields={(item, update) => (
          <>
            <input type="text" value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder="Title" className={smallInputClass} />
            <textarea rows={2} value={item.description} onChange={(e) => update({ description: e.target.value })} placeholder="Description" className={smallInputClass} />
          </>
        )}
      />
      <ListSection
        title='"What Glamirk Should Never Become" List'
        items={state.neverBecome}
        onChange={(v) => updateField('neverBecome', v)}
        newItemFactory={() => ({ id: `nb-${Date.now()}`, text: 'New boundary...' })}
        renderFields={(item, update) => (
          <textarea rows={2} value={item.text} onChange={(e) => update({ text: e.target.value })} placeholder="Text" className={smallInputClass} />
        )}
      />

      {/* Future Vision */}
      <ListSection
        title="Future Vision & Market Strategy Accordion"
        items={state.futureVisionAccordion}
        onChange={(v) => updateField('futureVisionAccordion', v)}
        newItemFactory={() => ({ id: `future-${Date.now()}`, label: 'New Point', content: 'Content...' })}
        renderFields={(item, update) => (
          <>
            <input type="text" value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="Heading" className={smallInputClass} />
            <textarea rows={3} value={item.content} onChange={(e) => update({ content: e.target.value })} placeholder="Content" className={smallInputClass} />
          </>
        )}
      />

      {/* Quote & CTA */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <h3 className="font-serif text-base text-[#FAF9F6]">Elevator Pitch Quote &amp; CTA Buttons</h3>
        <div>
          <label className={labelClass}>Quote Strip Text</label>
          <textarea rows={3} value={state.elevatorPitchQuote} onChange={(e) => updateField('elevatorPitchQuote', e.target.value)} className={`${inputClass} leading-relaxed`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Primary Button Text</label>
            <input type="text" value={state.primaryCtaText} onChange={(e) => updateField('primaryCtaText', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Secondary Button Text</label>
            <input type="text" value={state.secondaryCtaText} onChange={(e) => updateField('secondaryCtaText', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>
    </div>
  );
};
