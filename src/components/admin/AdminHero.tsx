import React, { useState, useEffect } from 'react';
import { Save, Check, Plus, Trash2, RotateCcw as ResetIcon } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { CMSHeroContent, CMSHeroSlide } from '../../types';
import { ImageCropUploadModal } from './ImageCropUploadModal';

const AVAILABLE_ICONS = ['ShieldCheck', 'Sparkles', 'Truck', 'Headphones', 'RotateCcw', 'Lock'];

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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadSlideIndex, setUploadSlideIndex] = useState<number | null>(null);

  useEffect(() => {
    if (heroContent) setState(heroContent);
  }, [heroContent]);

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
        <h3 className="font-serif text-base text-[#FAF9F6]">Hero Image</h3>
        <p className="text-xs text-[#6B6B6B]">
          Paste an image URL directly, or use Upload &amp; Crop — locked to the same ratio as the live hero card.
        </p>

        <div>
          <label className={labelClass}>Image</label>
          <div className="flex gap-2">
            <input type="text" value={state.image} onChange={(e) => updateField('image', e.target.value)} className={`flex-1 ${inputClass}`} placeholder="https://..." />
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap"
            >
              Upload &amp; Crop
            </button>
          </div>
        </div>

        {state.image && (
          <div className="w-32 aspect-[0.91] rounded-lg overflow-hidden border border-[#E8D5A8]/30 bg-[#0B0B0B]">
            <img src={state.image} alt="Hero preview" className="w-full h-full object-cover" />
          </div>
        )}

        {isUploadOpen && uploadSlideIndex === null && (
          <ImageCropUploadModal
            isOpen
            onClose={() => setIsUploadOpen(false)}
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
            <div key={slide.id} className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#E3B84B] uppercase tracking-wider">Slide {idx + 2}</span>
                <button onClick={() => handleDeleteSlide(idx)} className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer" title="Remove slide">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
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
                  <div className="w-16 aspect-[0.91] rounded-lg overflow-hidden border border-[#E8D5A8]/30 bg-[#171717] shrink-0">
                    <img src={slide.image} alt="Slide preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <input type="text" value={slide.image} onChange={(e) => handleUpdateSlide(idx, { image: e.target.value })} placeholder="Image URL" className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]" />
                  <button
                    type="button"
                    onClick={() => {
                      setUploadSlideIndex(idx);
                      setIsUploadOpen(true);
                    }}
                    className="px-3 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[11px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap"
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
            </div>
          ))}
        </div>
      </div>

      {isUploadOpen && uploadSlideIndex !== null && (
        <ImageCropUploadModal
          isOpen
          onClose={() => {
            setIsUploadOpen(false);
            setUploadSlideIndex(null);
          }}
          title={`Upload Slide ${uploadSlideIndex + 2} Image`}
          aspectRatio={0.91}
          minWidth={700}
          minHeight={770}
          recommendedWidth={1000}
          recommendedHeight={1100}
          outputWidth={1000}
          outputHeight={1100}
          onUploaded={({ url }) => {
            handleUpdateSlide(uploadSlideIndex, { image: url });
          }}
        />
      )}
    </div>
  );
};
