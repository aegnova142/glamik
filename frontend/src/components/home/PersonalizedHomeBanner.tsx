/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, ArrowRight, Camera, RotateCcw, Clock, ShieldCheck } from 'lucide-react';
import { BeautyProfile, Product, CMSPersonalizedUndertone, CMSPersonalizedBeautyCard } from '@glamirk/shared/types';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { BeautyMedia } from './BeautyMedia';
import { SectionBackground } from './SectionBackground';

interface PersonalizedHomeBannerProps {
  beautyProfile: BeautyProfile | null;
  onOpenShadeFinder: () => void;
  onOpenProduct: (product: Product) => void;
  onOpenTryOn: (productId?: string, shadeId?: string) => void;
  onOpenArticle: (articleId: string) => void;
  onOpenQuiz?: () => void;
}

const UNDERTONE_PRESETS = [
  {
    tone: 'Warm' as const,
    label: 'Warm & Golden',
    description: 'Golden, peachy, or caramel base notes',
    bestLip: 'Spice Velvet',
    lipShadeId: 'spice-velvet',
    swatchHex: '#C9972B',
    secondaryLip: 'Nude Suede',
    sindoor: 'Ceremonial Scarlet',
    tag: 'Best for golden yellow undertones',
  },
  {
    tone: 'Neutral' as const,
    label: 'Balanced Neutral',
    description: 'Balanced mix of warm & cool nuances',
    bestLip: 'Royal Rose',
    lipShadeId: 'royal-rose',
    swatchHex: '#F05A7E',
    secondaryLip: 'Crimson Sovereign',
    sindoor: 'Ceremonial Scarlet',
    tag: 'Effortlessly wears rose & classic reds',
  },
  {
    tone: 'Cool' as const,
    label: 'Cool & Roseate',
    description: 'Blue, rosy, or deep berry undertones',
    bestLip: 'Plum Opulence',
    lipShadeId: 'plum-opulence',
    swatchHex: '#121212',
    secondaryLip: 'Crimson Sovereign',
    sindoor: 'Heritage Maroon',
    tag: 'Illuminated by rich berry & ruby tones',
  },
  {
    tone: 'Olive' as const,
    label: 'Olive & Earthy',
    description: 'Greenish-gold or neutral earthy depth',
    bestLip: 'Spice Velvet',
    lipShadeId: 'spice-velvet',
    swatchHex: '#C9972B',
    secondaryLip: 'Plum Opulence',
    sindoor: 'Ceremonial Scarlet',
    tag: 'Flourishes with terracotta & rich plums',
  },
];

export const PersonalizedHomeBanner: React.FC<PersonalizedHomeBannerProps> = ({
  beautyProfile,
  onOpenShadeFinder,
  onOpenProduct,
  onOpenTryOn,
  onOpenArticle,
  onOpenQuiz,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');

  const { products: cmsProducts, personalizedBeauty } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const lipstickProduct = catalogProducts.find((p) => p.id === 'matte-liquid-lipstick-collection') || catalogProducts[0];

  // Case 1: User already completed Diagnostic / has a stored profile
  if (beautyProfile) {
    const isWarm = beautyProfile.undertone === 'Warm' || beautyProfile.undertone === 'Olive';
    const recShadeName = isWarm ? 'Nude Suede' : 'Royal Rose';
    const recShade = lipstickProduct.shades?.find((s) => s.name === recShadeName) || lipstickProduct.shades?.[0];

    return (
      <section id="personalized-beauty-section" className="relative overflow-hidden py-12 sm:py-16 bg-gradient-to-b from-[#FCE8ED]/60 to-white border-b border-[#E8D5A8]">
        <SectionBackground sectionKey="personalized-beauty" className="z-[1]" />
        <div className="relative z-[2] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white border border-[#E8D5A8] rounded-3xl p-6 sm:p-10 shadow-[0_12px_36px_rgba(240,90,126,0.08)]">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              
              {/* Left Profile Details */}
              <div className="space-y-4 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
                  <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
                  <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                    Personalized Beauty • Your Tailored Edit
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#121212] tracking-tight">
                    Calibrated for your {beautyProfile.skinTone} Complexion &amp; {beautyProfile.undertone} Undertones
                  </h2>
                  <p className="text-sm sm:text-base text-[#524C4C] mt-2 leading-relaxed">
                    Based on your Atelier Diagnostic, we’ve personalized luxury formulations and shade calibrations to accentuate your natural radiance without ashiness.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <div className="px-3 py-1.5 bg-[#FCE8ED] border border-[#E8D5A8] rounded-xl flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F05A7E]" />
                    <span className="text-xs font-semibold text-[#121212]">
                      Recommended Shade: <strong className="text-[#F05A7E]">{recShadeName}</strong>
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-white border border-[#E8D5A8] rounded-xl text-xs text-[#524C4C]">
                    Skin Tone: <strong className="text-[#121212]">{beautyProfile.skinTone}</strong>
                  </div>
                </div>
              </div>

              {/* Right Action Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
                <button
                  onClick={() => onOpenTryOn(lipstickProduct.id, recShade?.id)}
                  className="px-6 py-3.5 bg-[#F05A7E] text-white text-xs font-bold tracking-wider uppercase rounded-xl hover:bg-[#F05A7E] transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(240,90,126,0.3)] cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>TRY {recShadeName.toUpperCase()} IN AR</span>
                </button>

                <button
                  onClick={onOpenShadeFinder}
                  className="px-5 py-3.5 bg-white border border-[#E8D5A8] text-[#121212] hover:text-[#F05A7E] hover:border-[#F05A7E] text-xs font-bold tracking-wider uppercase rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RECALIBRATE SHADE</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // [Glamik CMS] 2026-10-03 — Case 2 rebuilt to be CMS-driven (undertones +
  // lip-shade/pairing cards from the admin). Trust-strip fill added 2026-10-04.
  // Case 2: No stored profile — the interactive, CMS-driven Personalized Beauty
  // section. All copy, undertones and preview cards come from the CMS
  // (personalizedBeauty). If the API is unavailable we fall back to the static
  // UNDERTONE_PRESETS so the homepage never renders a blank section.
  // ---------------------------------------------------------------------------
  const FALLBACK: CMSPersonalizedUndertone[] = UNDERTONE_PRESETS.map((p, i) => ({
    id: p.tone.toLowerCase(),
    name: p.label,
    description: p.description,
    thumbnailUrl: '',
    accentColor: p.swatchHex,
    tag: p.tag,
    sortOrder: i,
    isActive: true,
    lipShade: {
      title: p.bestLip,
      description: 'Weightless matte liquid pigment formulated with zero ashiness.',
      mediaType: 'image',
      mediaUrl: '',
      ctaLabel: 'Try On in Live AR',
      ctaUrl: '#shade-finder',
    },
    pairing: {
      title: p.sindoor,
      description: 'Enriched with 24K gold micro-shimmer and sacred saffron extract.',
      mediaType: 'image',
      mediaUrl: '',
      badge: 'HERITAGE',
      ctaLabel: 'View Product Details',
      ctaUrl: '#',
    },
  }));

  const pb = personalizedBeauty;
  const undertones = (pb?.undertones && pb.undertones.length > 0 ? pb.undertones : FALLBACK)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const t = {
    badgeText: pb?.badgeText || 'Intelligent Color Calibration',
    heading: pb?.heading || 'Personalized',
    headingHighlight: pb?.headingHighlight || 'Beauty',
    description:
      pb?.description ||
      'Formulations engineered precisely for Indian complexions. Select your undertone or take our 30-second AI diagnostic to receive your bespoke shade matches.',
    stepNumber: pb?.stepNumber || '01',
    stepLabel: pb?.stepLabel || 'Step One',
    selectHeading: pb?.selectHeading || 'Select Your Undertone',
    selectSubtext: pb?.selectSubtext || 'Choose the undertone that best describes your natural complexion.',
    aiCtaLabel: pb?.aiCtaLabel || 'Start AI Shade Diagnostic',
    aiCtaUrl: pb?.aiCtaUrl || '#shade-finder',
    matchPreviewLabel: pb?.matchPreviewLabel || 'Match Preview',
    formulationHeading: pb?.formulationHeading || 'Your Personalized Formulation Edit',
    lipShadeLabel: pb?.lipShadeLabel || 'Recommended Lip Shade',
    pairingLabel: pb?.pairingLabel || 'Ceremonial Pairing',
    quizPrompt: pb?.quizPrompt || 'Want a 4-question lifestyle quiz instead?',
    quizCtaLabel: pb?.quizCtaLabel || 'Take Beauty Quiz',
    quizCtaUrl: pb?.quizCtaUrl || '#beauty-quiz',
  };

  const active = undertones.find((u) => u.id === selectedId) || undertones[0];

  // Route a configurable CTA to the right existing flow. Hash actions connect
  // to the app's own modals; anything else is treated as a link.
  const runCta = (url?: string) => {
    if (!url || url === '#') return;
    if (url.startsWith('#shade-finder')) return onOpenShadeFinder();
    if (url.startsWith('#beauty-quiz')) return onOpenQuiz?.();
    if (url.startsWith('http') || url.startsWith('/')) {
      window.location.href = url;
    }
  };

  const PreviewCard: React.FC<{ label: string; card: CMSPersonalizedBeautyCard; accent: string }> = ({
    label,
    card,
    accent,
  }) => (
    <div className="bg-white p-4 rounded-2xl border border-[#E8D5A8] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-[#9B2D4F] uppercase tracking-wider">{label}</span>
        {card.badge ? (
          <span className="text-[9px] bg-[#FCE8ED] text-[#9B2D4F] px-2 py-0.5 rounded-full font-bold tracking-wider">
            {card.badge}
          </span>
        ) : (
          <span className="w-3.5 h-3.5 rounded-full shadow-xs shrink-0" style={{ backgroundColor: accent }} />
        )}
      </div>

      <BeautyMedia mediaType={card.mediaType} mediaUrl={card.mediaUrl} posterUrl={card.posterUrl} alt={card.title} />

      <div className="space-y-1">
        <h4 className="font-serif text-base font-bold text-[#121212]">{card.title || 'Coming soon'}</h4>
        {card.description && <p className="text-[11px] leading-relaxed text-[#524C4C]">{card.description}</p>}
      </div>

      <button
        onClick={() => runCta(card.ctaUrl)}
        className="mt-auto inline-flex items-center justify-between gap-2 text-xs font-bold text-[#9B2D4F] hover:text-[#F05A7E] transition-colors group cursor-pointer"
      >
        <span className="inline-flex items-center gap-1.5">
          {card.ctaUrl?.startsWith('#shade-finder') && <Camera className="w-3.5 h-3.5" />}
          {card.ctaLabel || 'Learn more'}
        </span>
        <span className="w-6 h-6 rounded-full border border-[#E8D5A8] flex items-center justify-center group-hover:border-[#F05A7E] transition-colors">
          <ArrowRight className="w-3 h-3" />
        </span>
      </button>
    </div>
  );

  if (!active) return null;

  return (
    <section
      id="personalized-beauty-section"
      className="relative overflow-hidden py-14 sm:py-20 bg-gradient-to-b from-[#FCE8ED]/50 via-white to-white border-b border-[#E8D5A8]"
    >
      <SectionBackground sectionKey="personalized-beauty" className="z-[1]" />
      {/* Keyed fade for the preview content; disabled under reduced-motion. */}
      <style>{`
        @keyframes beautyFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .beauty-fade { animation: beautyFade .35s ease both; }
        @media (prefers-reduced-motion: reduce) { .beauty-fade { animation: none; } }
      `}</style>

      <div className="relative z-[2] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#9B2D4F]" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#9B2D4F]">{t.badgeText}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#121212] tracking-tight">
            {t.heading} <span className="italic text-[#9B2D4F]">{t.headingHighlight}</span>
          </h2>

          <p className="text-sm sm:text-base text-[#524C4C] font-normal leading-relaxed">{t.description}</p>
        </div>

        {/* Main card */}
        <div className="bg-[#FBF3EE] border border-[#E8D5A8] rounded-3xl p-5 sm:p-8 lg:p-10 shadow-[0_12px_36px_rgba(201,123,99,0.08)]">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)] gap-8 lg:gap-6 items-stretch">
            {/* LEFT: undertone selector */}
            <div className="flex flex-col">
              <div className="flex items-start gap-3 mb-5">
                <span className="font-serif text-4xl sm:text-5xl text-[#9B2D4F]/30 leading-none">{t.stepNumber}</span>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#9B2D4F]">{t.stepLabel}</span>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#121212]">{t.selectHeading}</h3>
                  <p className="text-xs text-[#524C4C] mt-1">{t.selectSubtext}</p>
                </div>
              </div>

              <div role="radiogroup" aria-label={t.selectHeading} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {undertones.map((u) => {
                  const isSelected = active.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedId(u.id)}
                      className={`group p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9B2D4F] ${
                        isSelected
                          ? 'bg-[#FCE8ED] border-[#9B2D4F] ring-1 ring-[#9B2D4F] shadow-[0_4px_14px_rgba(155,45,79,0.12)]'
                          : 'bg-white border-[#E8D5A8] hover:border-[#9B2D4F]/50'
                      }`}
                    >
                      <span
                        className="w-12 h-12 rounded-xl shrink-0 bg-cover bg-center border border-[#E8D5A8]"
                        style={{
                          backgroundColor: u.accentColor,
                          backgroundImage: u.thumbnailUrl ? `url(${u.thumbnailUrl})` : undefined,
                        }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-1">
                          <span className={`font-serif text-sm font-bold ${isSelected ? 'text-[#9B2D4F]' : 'text-[#121212]'}`}>
                            {u.name}
                          </span>
                          <span
                            className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                            style={{ backgroundColor: u.accentColor }}
                          />
                        </span>
                        <span className="block text-[11px] text-[#524C4C] leading-snug mt-0.5">{u.description}</span>
                      </span>
                      <ArrowRight className={`w-4 h-4 shrink-0 self-end ${isSelected ? 'text-[#9B2D4F]' : 'text-[#C9B8A0]'}`} />
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => runCta(t.aiCtaUrl)}
                className="mt-5 w-full py-4 bg-[#9B2D4F] text-white text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-[#B03659] transition-all flex items-center justify-center gap-2.5 shadow-[0_6px_20px_rgba(155,45,79,0.28)] cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t.aiCtaLabel}</span>
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center ml-1">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>

              {/* Trust strip — grows to fill the leftover height so the column
                  always matches the taller preview column (no dead gap). */}
              <div className="mt-4 flex-1 min-h-0 rounded-2xl border border-[#E8D5A8] bg-gradient-to-br from-white to-[#FCE8ED]/40 px-5 py-5 flex flex-col justify-center">
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { icon: Clock, label: '30-Second', sub: 'Instant Analysis' },
                    { icon: Sparkles, label: 'Calibrated', sub: 'For Indian Skin' },
                    { icon: ShieldCheck, label: 'On-Device', sub: '100% Private' },
                  ].map(({ icon: Icon, label, sub }) => (
                    <div key={label} className="flex flex-col items-center gap-1.5">
                      <span className="w-9 h-9 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#9B2D4F]">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-[#121212] leading-none">{label}</span>
                      <span className="text-[10px] text-[#524C4C] leading-none">{sub}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 pt-4 border-t border-[#E8D5A8]/60 text-center text-[11px] text-[#524C4C] leading-relaxed">
                  <span className="font-semibold text-[#9B2D4F]">10,000+</span> complexions analysed to craft your bespoke shade edit.
                </p>
              </div>
            </div>

            {/* Center divider (desktop only) */}
            <div className="hidden lg:flex flex-col items-center justify-center">
              <div className="w-px flex-1 bg-[#E8D5A8]" />
              <span className="my-2 w-9 h-9 rounded-full bg-white border border-[#E8D5A8] flex items-center justify-center text-[#9B2D4F]">
                <ArrowRight className="w-4 h-4" />
              </span>
              <div className="w-px flex-1 bg-[#E8D5A8]" />
            </div>

            {/* RIGHT: match preview */}
            <div className="flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#9B2D4F]">{t.matchPreviewLabel}</span>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#121212]">{t.formulationHeading}</h3>
                </div>
                {active.tag && (
                  <span className="hidden sm:inline-flex items-center text-[11px] text-[#524C4C] bg-white border border-[#E8D5A8] rounded-full px-3 py-1.5 shrink-0">
                    {active.tag}
                  </span>
                )}
              </div>

              <div key={active.id} className="beauty-fade grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                <PreviewCard label={t.lipShadeLabel} card={active.lipShade} accent={active.accentColor} />
                <PreviewCard label={t.pairingLabel} card={active.pairing} accent={active.accentColor} />
              </div>

              {/* Quiz CTA */}
              <div className="mt-4 flex items-center justify-between gap-3 bg-white border border-[#E8D5A8] rounded-2xl px-4 py-3">
                <span className="inline-flex items-center gap-2 text-xs text-[#524C4C]">
                  <Sparkles className="w-3.5 h-3.5 text-[#9B2D4F]" />
                  {t.quizPrompt}
                </span>
                <button
                  onClick={() => runCta(t.quizCtaUrl)}
                  className="text-xs font-bold text-[#9B2D4F] hover:underline cursor-pointer inline-flex items-center gap-1 shrink-0"
                >
                  {t.quizCtaLabel} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
