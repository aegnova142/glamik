import React, { useState } from 'react';
import { Save, Check, Plus, Trash2, RotateCcw as ResetIcon, GripVertical, Eye, EyeOff, ChevronDown, ChevronUp, Link2, ImageOff } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { CMSHeroContent, CMSHeroSlide, CMSHeroHPosition, CMSHeroBackground } from '../../types';
import { ImageCropUploadModal } from './ImageCropUploadModal';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { useDragReorder } from '../../hooks/useDragReorder';
import { HPOSITION_OPTIONS, resolveHeroLayout } from '../home/heroSlideLayout';

const AVAILABLE_ICONS = ['ShieldCheck', 'Sparkles', 'Truck', 'Headphones', 'RotateCcw', 'Lock'];

/** Scaled-down mock of the hero image composition, using the exact same
 * positioning math as the live Hero — what admin sees here is what publishes. */
const SlideCompositionPreview: React.FC<{ slide: Pick<CMSHeroSlide, 'image'> & Partial<CMSHeroSlide> }> = ({ slide }) => {
  const layout = resolveHeroLayout(slide);
  return (
    <div className="w-full max-w-[280px] rounded-xl bg-[#FAF9F6] p-4">
      <div className="relative mx-auto aspect-[0.91] w-[70%] overflow-hidden rounded-[14px] border border-[#E8D5A8] bg-[#0B0B0B] shadow-[0_10px_25px_rgba(11,11,11,0.16)]">
        {slide.image ? (
          <img src={slide.image} alt="Hero preview" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#6B6B6B]">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[9px] uppercase tracking-wider text-[#6B6B6B]">
        Image {layout.outerImagePosition} · Text {layout.textPosition}
      </p>
    </div>
  );
};

const DEFAULT_HERO: CMSHeroContent = {
  badgeText: 'Radiate Confidence Every Day',
  headingLine1: 'Beauty & Radiance',
  headingPrefix: 'for a ',
  headingHighlight: 'Better You',
  description: 'Discover premium beauty essentials and shade-matching formulations engineered to amplify your natural glow.',
  primaryCtaText: 'Shop Now',
  secondaryCtaText: 'Find My Shade',
  trustIndicators: [
    { id: 'ti-1', icon: 'ShieldCheck', text: 'Dermatologist Approved' },
    { id: 'ti-2', icon: 'Sparkles', text: 'Formulated for Indian Skin' },
    { id: 'ti-3', icon: 'ShieldCheck', text: '100% Vegan & Cruelty-Free' },
  ],
  image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85',
  imageBadgeLabel: 'SIGNATURE COLLECTION',
  imageProductName: 'Matte Liquid & Cleansing Balm',
  imagePrice: '₹299+',
  trustBar: [
    { id: 'tb-1', icon: 'ShieldCheck', title: '100% Authentic', subtitle: 'Certified original beauty' },
    { id: 'tb-2', icon: 'Sparkles', title: 'Expert Approved', subtitle: 'Dermatologically safe' },
    { id: 'tb-3', icon: 'Truck', title: 'Fast Delivery', subtitle: 'Express pan-India transit' },
  ],
};

export const AdminHero: React.FC = () => {
  const { heroContent, saveHeroContent } = useCMS();
  const [state, setState] = useState<CMSHeroContent>(heroContent || DEFAULT_HERO);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // slideIndex === null means the primary slide (Slide 1) above the carousel list.
  const [uploadTarget, setUploadTarget] = useState<{ slideIndex: number | null } | null>(null);
  const [openPreview, setOpenPreview] = useState<Record<string, boolean>>({});
  // index === null means "uploading a brand-new background"; otherwise it replaces that slot.
  const [bgUploadTarget, setBgUploadTarget] = useState<{ index: number | null } | null>(null);

  useSyncOnce(heroContent, setState);

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveHeroContent(state);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('Reset the Hero section to the official Glamirk default content?')) {
      setState(DEFAULT_HERO);
    }
  };

  const updateField = <K extends keyof CMSHeroContent>(field: K, value: CMSHeroContent[K]) => {
    setState({ ...state, [field]: value });
  };

  const handleAddTrustIndicator = () => {
    updateField('trustIndicators', [
      ...state.trustIndicators,
      { id: `ti-${Date.now()}`, icon: 'ShieldCheck', text: 'New Trust Point' },
    ]);
  };

  const handleUpdateTrustIndicator = (idx: number, updates: Partial<{ icon: string; text: string }>) => {
    const updated = [...state.trustIndicators];
    updated[idx] = { ...updated[idx], ...updates };
    updateField('trustIndicators', updated);
  };

  const handleDeleteTrustIndicator = (idx: number) => {
    updateField('trustIndicators', state.trustIndicators.filter((_, i) => i !== idx));
  };

  const handleAddTrustBarItem = () => {
    updateField('trustBar', [
      ...state.trustBar,
      { id: `tb-${Date.now()}`, icon: 'ShieldCheck', title: 'New Badge', subtitle: 'Description' },
    ]);
  };

  const handleUpdateTrustBarItem = (idx: number, updates: Partial<{ icon: string; title: string; subtitle: string }>) => {
    const updated = [...state.trustBar];
    updated[idx] = { ...updated[idx], ...updates };
    updateField('trustBar', updated);
  };

  const handleDeleteTrustBarItem = (idx: number) => {
    updateField('trustBar', state.trustBar.filter((_, i) => i !== idx));
  };

  const heroSlides = state.slides || [];

  const handleAddSlide = () => {
    const newSlide: CMSHeroSlide = {
      id: `slide-${Date.now()}`,
      badgeText: 'New Collection',
      headingLine1: 'Your Headline Here',
      headingPrefix: 'for a ',
      headingHighlight: 'Better You',
      description: 'Describe this hero slide.',
      primaryCtaText: 'Shop Now',
      secondaryCtaText: 'Find My Shade',
      image: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1000&q=85',
      imageBadgeLabel: 'NEW',
      imageProductName: 'Product Name',
      imagePrice: '₹299+',
    };
    updateField('slides', [...heroSlides, newSlide]);
  };

  const handleUpdateSlide = (idx: number, updates: Partial<CMSHeroSlide>) => {
    const updated = [...heroSlides];
    updated[idx] = { ...updated[idx], ...updates };
    updateField('slides', updated);
  };

  const handleDeleteSlide = (idx: number) => {
    if (!window.confirm('Delete this hero slide?')) return;
    updateField('slides', heroSlides.filter((_, i) => i !== idx));
  };

  const { dragIndex, setDragIndex, handleDrop: handleSlideDrop } = useDragReorder<CMSHeroSlide>(
    heroSlides,
    (next) => updateField('slides', next)
  );

  const togglePreview = (key: string) => {
    setOpenPreview((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ---- Portion 2: Hero Backgrounds (independent decorative background carousel) ----
  const heroBackgrounds = state.backgrounds || [];

  const handleUpdateBackground = (idx: number, updates: Partial<CMSHeroBackground>) => {
    const updated = [...heroBackgrounds];
    updated[idx] = { ...updated[idx], ...updates };
    updateField('backgrounds', updated);
  };

  const handleDeleteBackground = (idx: number) => {
    if (!window.confirm('Delete this background image?')) return;
    updateField('backgrounds', heroBackgrounds.filter((_, i) => i !== idx));
  };

  const {
    dragIndex: bgDragIndex,
    setDragIndex: setBgDragIndex,
    handleDrop: handleBackgroundDrop,
  } = useDragReorder<CMSHeroBackground>(heroBackgrounds, (next) => updateField('backgrounds', next));

  const backgroundIntervalSeconds = ((state.backgroundIntervalMs ?? 3000) / 1000).toString();

  const inputClass =
    'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none';
  const labelClass = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

  return (
    <div className="space-y-6">
      {/* Header with Save & Action Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E8D5A8]/20">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl sm:text-2xl text-[#FAF9F6]">Homepage Hero Editor</h2>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/40 rounded-full font-bold">
              Live Sync
            </span>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Real-time control over every visible element of the homepage Hero section.
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

      {/* Badge & Heading */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <h3 className="font-serif text-base text-[#FAF9F6]">Badge &amp; Heading</h3>

        <div>
          <label className={labelClass}>Top Pill Badge Text</label>
          <input type="text" value={state.badgeText} onChange={(e) => updateField('badgeText', e.target.value)} className={inputClass} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Heading Line 1</label>
            <input type="text" value={state.headingLine1} onChange={(e) => updateField('headingLine1', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Heading Prefix (before highlight)</label>
            <input type="text" value={state.headingPrefix} onChange={(e) => updateField('headingPrefix', e.target.value)} className={inputClass} placeholder="for a " />
          </div>
          <div>
            <label className={labelClass}>Highlighted Word(s) — Glam Pink</label>
            <input type="text" value={state.headingHighlight} onChange={(e) => updateField('headingHighlight', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Description & CTAs */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <h3 className="font-serif text-base text-[#FAF9F6]">Description &amp; Buttons</h3>

        <div>
          <label className={labelClass}>Supporting Description</label>
          <textarea rows={3} value={state.description} onChange={(e) => updateField('description', e.target.value)} className={`${inputClass} leading-relaxed`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Primary Button Text (Black)</label>
            <input type="text" value={state.primaryCtaText} onChange={(e) => updateField('primaryCtaText', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Secondary Button Text (Gold Border)</label>
            <input type="text" value={state.secondaryCtaText} onChange={(e) => updateField('secondaryCtaText', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Trust Indicators (under buttons) */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Trust Indicators</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">Small checklist shown below the CTA buttons.</p>
          </div>
          <button onClick={handleAddTrustIndicator} type="button" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span>Add Point</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {state.trustIndicators.map((ti, idx) => (
            <div key={ti.id} className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <select value={ti.icon} onChange={(e) => handleUpdateTrustIndicator(idx, { icon: e.target.value })} className="flex-1 px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none">
                  {AVAILABLE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                </select>
                <button onClick={() => handleDeleteTrustIndicator(idx)} className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer" title="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input type="text" value={ti.text} onChange={(e) => handleUpdateTrustIndicator(idx, { text: e.target.value })} placeholder="Trust point text" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
            </div>
          ))}
        </div>
      </div>

      {/* Hero Image */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-base text-[#FAF9F6]">Hero Image</h3>
          <button
            type="button"
            onClick={() => updateField('isActive', state.isActive === false ? true : false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              state.isActive === false
                ? 'bg-[#0B0B0B] text-[#6B6B6B] border border-[#E8D5A8]/30'
                : 'bg-[#F05A7E]/15 text-[#F05A7E] border border-[#F05A7E]/40'
            }`}
            title={state.isActive === false ? 'Disabled — hidden from the live carousel' : 'Active — visible on the live site'}
          >
            {state.isActive === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{state.isActive === false ? 'Disabled' : 'Active'}</span>
          </button>
        </div>
        <p className="text-xs text-[#6B6B6B]">
          Paste an image URL directly, or use Upload &amp; Crop — locked to the same ratio as the live hero card.
        </p>

        <div>
          <label className={labelClass}>Hero Image</label>
          <div className="flex gap-2">
            <input type="text" value={state.image} onChange={(e) => updateField('image', e.target.value)} className={`flex-1 ${inputClass}`} placeholder="https://..." />
            <button
              type="button"
              onClick={() => setUploadTarget({ slideIndex: null })}
              className="px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap"
            >
              Upload
            </button>
          </div>
          {state.image && (
            <div className="mt-2 w-24 aspect-[0.91] rounded-lg overflow-hidden border border-[#E8D5A8]/30 bg-[#0B0B0B]">
              <img src={state.image} alt="Outer preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {uploadTarget?.slideIndex === null && (
          <ImageCropUploadModal
            isOpen
            onClose={() => setUploadTarget(null)}
            title="Upload Hero Image"
            aspectRatio={0.91}
            minWidth={700}
            minHeight={770}
            recommendedWidth={1000}
            recommendedHeight={1100}
            outputWidth={1000}
            outputHeight={1100}
            onUploaded={({ url }) => updateField('image', url)}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Overlay Eyebrow Label</label>
            <input type="text" value={state.imageBadgeLabel} onChange={(e) => updateField('imageBadgeLabel', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Product Name</label>
            <input type="text" value={state.imageProductName} onChange={(e) => updateField('imageProductName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Price Badge</label>
            <input type="text" value={state.imagePrice} onChange={(e) => updateField('imagePrice', e.target.value)} className={inputClass} placeholder="₹299+" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Primary CTA Link (optional — overrides the default Shop action)</label>
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-[#6B6B6B] shrink-0" />
            <input type="text" value={state.primaryCtaLink || ''} onChange={(e) => updateField('primaryCtaLink', e.target.value || undefined)} className={inputClass} placeholder="/shop, /campaign/festive, or https://..." />
          </div>
        </div>

        {/* Layout Controls */}
        <div className="pt-3 border-t border-[#E8D5A8]/15 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#E8D5A8]">Composition &amp; Layout</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Image Position</label>
              <select value={state.outerImagePosition || 'right'} onChange={(e) => updateField('outerImagePosition', e.target.value as CMSHeroHPosition)} className="w-full px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]">
                {HPOSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Text Position</label>
              <select value={state.textPosition || 'left'} onChange={(e) => updateField('textPosition', e.target.value as CMSHeroHPosition)} className="w-full px-2.5 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]">
                {HPOSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <button type="button" onClick={() => togglePreview('primary')} className="flex items-center gap-1.5 text-xs font-semibold text-[#C9972B] hover:text-[#F05A7E] transition-colors cursor-pointer">
            <span>{openPreview.primary ? 'Hide' : 'Show'} Composition Preview</span>
            {openPreview.primary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {openPreview.primary && <SlideCompositionPreview slide={state} />}
        </div>
      </div>

      {/* Trust Bar (bottom row) */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Trust Bar</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">The 3 cards shown below the Hero grid.</p>
          </div>
          <button onClick={handleAddTrustBarItem} type="button" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span>Add Card</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {state.trustBar.map((badge, idx) => (
            <div key={badge.id} className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <select value={badge.icon} onChange={(e) => handleUpdateTrustBarItem(idx, { icon: e.target.value })} className="flex-1 px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none">
                  {AVAILABLE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                </select>
                <button onClick={() => handleDeleteTrustBarItem(idx)} className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer" title="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input type="text" value={badge.title} onChange={(e) => handleUpdateTrustBarItem(idx, { title: e.target.value })} placeholder="Title" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs font-semibold text-[#FAF9F6]" />
              <input type="text" value={badge.subtitle} onChange={(e) => handleUpdateTrustBarItem(idx, { subtitle: e.target.value })} placeholder="Subtitle" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
            </div>
          ))}
        </div>
      </div>

      {/* Additional Hero Slides (Carousel) */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Additional Hero Slides</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              The Badge/Heading/Description/Image above is always Slide 1. Add more slides here to turn the Hero into an auto-rotating carousel (5s per slide, hover to pause, dots/arrows/swipe supported).
            </p>
          </div>
          <button onClick={handleAddSlide} type="button" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0">
            <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span>Add Slide</span>
          </button>
        </div>

        {heroSlides.length === 0 && (
          <div className="p-6 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl">
            Only Slide 1 is active. Add a slide to enable the carousel.
          </div>
        )}

        <div className="space-y-4">
          {heroSlides.map((slide, idx) => (
            <div
              key={slide.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleSlideDrop(idx)}
              className={`p-4 bg-[#0B0B0B] border rounded-xl space-y-3 transition-colors ${dragIndex === idx ? 'border-[#F05A7E]/60 opacity-60' : 'border-[#E8D5A8]/20'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-[#6B6B6B] cursor-grab active:cursor-grabbing" title="Drag to reorder" />
                  <span className="text-xs font-bold text-[#E3B84B] uppercase tracking-wider">Slide {idx + 2}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateSlide(idx, { isActive: slide.isActive === false ? true : false })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                      slide.isActive === false
                        ? 'bg-[#171717] text-[#6B6B6B] border border-[#E8D5A8]/30'
                        : 'bg-[#F05A7E]/15 text-[#F05A7E] border border-[#F05A7E]/40'
                    }`}
                    title={slide.isActive === false ? 'Disabled — hidden from the live carousel' : 'Active — visible on the live site'}
                  >
                    {slide.isActive === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{slide.isActive === false ? 'Disabled' : 'Active'}</span>
                  </button>
                  <button onClick={() => handleDeleteSlide(idx)} className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer" title="Remove slide">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="text" value={slide.badgeText} onChange={(e) => handleUpdateSlide(idx, { badgeText: e.target.value })} placeholder="Badge text" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                <input type="text" value={slide.headingLine1} onChange={(e) => handleUpdateSlide(idx, { headingLine1: e.target.value })} placeholder="Heading line 1" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                <input type="text" value={slide.headingHighlight} onChange={(e) => handleUpdateSlide(idx, { headingHighlight: e.target.value })} placeholder="Highlighted word(s)" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
              </div>

              <textarea rows={2} value={slide.description} onChange={(e) => handleUpdateSlide(idx, { description: e.target.value })} placeholder="Description" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] leading-relaxed" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="text" value={slide.primaryCtaText} onChange={(e) => handleUpdateSlide(idx, { primaryCtaText: e.target.value })} placeholder="Primary CTA text" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                <input type="text" value={slide.secondaryCtaText} onChange={(e) => handleUpdateSlide(idx, { secondaryCtaText: e.target.value })} placeholder="Secondary CTA text" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
              </div>

              <div className="flex items-center gap-3">
                {slide.image && (
                  <div className="w-14 aspect-[0.91] rounded-lg overflow-hidden border border-[#E8D5A8]/30 bg-[#171717] shrink-0">
                    <img src={slide.image} alt="Slide preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B]">Slide Image</label>
                  <input type="text" value={slide.image} onChange={(e) => handleUpdateSlide(idx, { image: e.target.value })} placeholder="Image URL" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                  <button
                    type="button"
                    onClick={() => setUploadTarget({ slideIndex: idx })}
                    className="px-3 py-1 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[10px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Upload &amp; Crop
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="text" value={slide.imageBadgeLabel} onChange={(e) => handleUpdateSlide(idx, { imageBadgeLabel: e.target.value })} placeholder="Overlay eyebrow label" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                <input type="text" value={slide.imageProductName} onChange={(e) => handleUpdateSlide(idx, { imageProductName: e.target.value })} placeholder="Product name" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                <input type="text" value={slide.imagePrice} onChange={(e) => handleUpdateSlide(idx, { imagePrice: e.target.value })} placeholder="₹299+" className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Primary CTA Link (optional)</label>
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-[#6B6B6B] shrink-0" />
                  <input type="text" value={slide.primaryCtaLink || ''} onChange={(e) => handleUpdateSlide(idx, { primaryCtaLink: e.target.value || undefined })} placeholder="/shop or https://..." className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                </div>
              </div>

              {/* Layout Controls */}
              <div className="pt-3 border-t border-[#E8D5A8]/15 space-y-2">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-[#E8D5A8]">Composition &amp; Layout</h5>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-[#6B6B6B] mb-1">Image Pos.</label>
                    <select value={slide.outerImagePosition || 'right'} onChange={(e) => handleUpdateSlide(idx, { outerImagePosition: e.target.value as CMSHeroHPosition })} className="w-full px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[11px] text-[#FAF9F6]">
                      {HPOSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-[#6B6B6B] mb-1">Text Pos.</label>
                    <select value={slide.textPosition || 'left'} onChange={(e) => handleUpdateSlide(idx, { textPosition: e.target.value as CMSHeroHPosition })} className="w-full px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-[11px] text-[#FAF9F6]">
                      {HPOSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <button type="button" onClick={() => togglePreview(slide.id)} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#C9972B] hover:text-[#F05A7E] transition-colors cursor-pointer">
                  <span>{openPreview[slide.id] ? 'Hide' : 'Show'} Composition Preview</span>
                  {openPreview[slide.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {openPreview[slide.id] && <SlideCompositionPreview slide={slide} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hero Backgrounds (Portion 2) — independent decorative background carousel behind the hero */}
      <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-base text-[#FAF9F6]">Hero Backgrounds</h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              A separate decorative background carousel behind the hero content — its own timing, fully independent of the slide carousel above. Add as many images as you like; only active ones appear, in this order.
            </p>
          </div>
          <button onClick={() => setBgUploadTarget({ index: null })} type="button" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0">
            <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span>Add Background</span>
          </button>
        </div>

        <div>
          <label className={labelClass}>Background Change Interval</label>
          <div className="flex items-center gap-2">
            <select
              value={backgroundIntervalSeconds}
              onChange={(e) => updateField('backgroundIntervalMs', Number(e.target.value) * 1000)}
              className="w-40 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
            >
              {['2', '3', '4', '5', '6', '8'].map((s) => (
                <option key={s} value={s}>{s} seconds{s === '3' ? ' (default)' : ''}</option>
              ))}
            </select>
            <span className="text-[11px] text-[#6B6B6B]">Independent of the hero slide carousel's own timing.</span>
          </div>
        </div>

        {heroBackgrounds.length === 0 && (
          <div className="p-6 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl">
            No background images yet. Add one to start the decorative carousel — with none, a clean neutral background is used.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {heroBackgrounds.map((bg, idx) => (
            <div
              key={bg.id}
              draggable
              onDragStart={() => setBgDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleBackgroundDrop(idx)}
              className={`p-3 bg-[#0B0B0B] border rounded-xl space-y-2 transition-colors ${bgDragIndex === idx ? 'border-[#F05A7E]/60 opacity-60' : 'border-[#E8D5A8]/20'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <GripVertical className="w-4 h-4 text-[#6B6B6B] cursor-grab active:cursor-grabbing" title="Drag to reorder" />
                  <span className="text-[11px] font-bold text-[#E3B84B] uppercase tracking-wider">Position {idx + 1}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateBackground(idx, { isActive: bg.isActive === false ? true : false })}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                    bg.isActive === false
                      ? 'bg-[#171717] text-[#6B6B6B] border border-[#E8D5A8]/30'
                      : 'bg-[#F05A7E]/15 text-[#F05A7E] border border-[#F05A7E]/40'
                  }`}
                  title={bg.isActive === false ? 'Disabled — hidden from the live carousel' : 'Active — visible on the live site'}
                >
                  {bg.isActive === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{bg.isActive === false ? 'Disabled' : 'Active'}</span>
                </button>
              </div>

              <div className="aspect-video w-full rounded-lg overflow-hidden border border-[#E8D5A8]/20 bg-[#171717]">
                {bg.image ? (
                  <img src={bg.image} alt={`Background ${idx + 1} preview`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#6B6B6B]">
                    <ImageOff className="w-5 h-5" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBgUploadTarget({ index: idx })}
                  className="flex-1 px-2.5 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[10px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBackground(idx)}
                  className="px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                  title="Delete background"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {bgUploadTarget && (
        <ImageCropUploadModal
          isOpen
          onClose={() => setBgUploadTarget(null)}
          title={bgUploadTarget.index === null ? 'Add Hero Background' : `Replace Background ${bgUploadTarget.index + 1}`}
          aspectRatio={1.9}
          minWidth={1200}
          minHeight={630}
          recommendedWidth={1800}
          recommendedHeight={950}
          outputWidth={1800}
          outputHeight={950}
          onUploaded={({ url }) => {
            if (bgUploadTarget.index === null) {
              updateField('backgrounds', [...heroBackgrounds, { id: `bg-${Date.now()}`, image: url }]);
            } else {
              handleUpdateBackground(bgUploadTarget.index, { image: url });
            }
          }}
        />
      )}

      {uploadTarget?.slideIndex !== null && uploadTarget && (
        <ImageCropUploadModal
          isOpen
          onClose={() => setUploadTarget(null)}
          title={`Upload Slide ${uploadTarget.slideIndex! + 2} Image`}
          aspectRatio={0.91}
          minWidth={700}
          minHeight={770}
          recommendedWidth={1000}
          recommendedHeight={1100}
          outputWidth={1000}
          outputHeight={1100}
          onUploaded={({ url }) => {
            handleUpdateSlide(uploadTarget.slideIndex!, { image: url });
          }}
        />
      )}
    </div>
  );
};
