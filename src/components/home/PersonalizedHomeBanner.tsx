/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, ArrowRight, Camera, Check, RotateCcw, Heart } from 'lucide-react';
import { BeautyProfile, Product, Shade } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { useCMS } from '../../context/CMSContext';

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
  const [selectedUndertone, setSelectedUndertone] = useState<'Warm' | 'Neutral' | 'Cool' | 'Olive'>('Warm');
  
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const lipstickProduct = catalogProducts.find((p) => p.id === 'matte-liquid-lipstick-collection') || catalogProducts[0];

  // Case 1: User already completed Diagnostic / has a stored profile
  if (beautyProfile) {
    const isWarm = beautyProfile.undertone === 'Warm' || beautyProfile.undertone === 'Olive';
    const recShadeName = isWarm ? 'Nude Suede' : 'Royal Rose';
    const recShade = lipstickProduct.shades?.find((s) => s.name === recShadeName) || lipstickProduct.shades?.[0];

    return (
      <section id="personalized-beauty-section" className="py-12 sm:py-16 bg-gradient-to-b from-[#FCE8ED]/60 to-white border-b border-[#E8D5A8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  <p className="text-sm sm:text-base text-[#6B6B6B] mt-2 leading-relaxed">
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
                  <div className="px-3 py-1.5 bg-white border border-[#E8D5A8] rounded-xl text-xs text-[#6B6B6B]">
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

  // Case 2: User doesn't have a stored profile yet (Interactive Personalized Beauty Section)
  const activePreset = UNDERTONE_PRESETS.find((p) => p.tone === selectedUndertone) || UNDERTONE_PRESETS[0];

  return (
    <section id="personalized-beauty-section" className="py-14 sm:py-20 bg-gradient-to-b from-[#FCE8ED]/50 via-white to-white border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#F05A7E]">
              Intelligent Color Calibration
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] tracking-tight">
            Personalized Beauty
          </h2>

          <p className="text-sm sm:text-base text-[#6B6B6B] font-normal leading-relaxed">
            Formulations engineered precisely for Indian complexions. Select your undertone or take our 30-second AI diagnostic to receive your bespoke shade matches.
          </p>
        </div>

        {/* Interactive Undertone & Custom Shade Match Bar */}
        <div className="bg-white border border-[#E8D5A8] rounded-3xl p-6 sm:p-10 shadow-[0_12px_36px_rgba(240,90,126,0.06)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left: Undertone selector pills */}
            <div className="lg:col-span-5 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#121212] block">
                1. Select Your Undertone Nuance:
              </span>

              <div className="grid grid-cols-2 gap-3">
                {UNDERTONE_PRESETS.map((p) => {
                  const isSelected = selectedUndertone === p.tone;
                  return (
                    <button
                      key={p.tone}
                      onClick={() => setSelectedUndertone(p.tone)}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1 ${
                        isSelected
                          ? 'bg-[#FCE8ED] border-[#F05A7E] shadow-[0_4px_14px_rgba(240,90,126,0.15)] ring-1 ring-[#F05A7E]'
                          : 'bg-white border-[#E8D5A8] hover:border-[#F05A7E]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isSelected ? 'text-[#F05A7E]' : 'text-[#121212]'}`}>
                          {p.label}
                        </span>
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-[#E8D5A8]"
                          style={{ backgroundColor: p.swatchHex }}
                        />
                      </div>
                      <span className="text-[10.5px] text-[#6B6B6B] line-clamp-1">
                        {p.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  onClick={onOpenShadeFinder}
                  className="w-full py-3 bg-[#F05A7E] text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#F05A7E] transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(240,90,126,0.25)] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>START AI SHADE DIAGNOSTIC</span>
                </button>
              </div>
            </div>

            {/* Right: Instant Bespoke Recommendation Display */}
            <div className="lg:col-span-7 bg-[#FCE8ED]/50 border border-[#E8D5A8] rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center justify-between border-b border-[#E8D5A8] pb-3">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#F05A7E]">
                    MATCH PREVIEW • {activePreset.label.toUpperCase()}
                  </span>
                  <h3 className="font-serif text-lg sm:text-xl text-[#121212] font-bold">
                    Your Personalized Formulation Edit
                  </h3>
                </div>
                <span className="text-xs text-[#6B6B6B] hidden sm:inline-block">
                  {activePreset.tag}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Lip Recommendation */}
                <div className="bg-white p-4 rounded-xl border border-[#E8D5A8] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#F05A7E] uppercase tracking-wider">
                      Recommended Lip Shade
                    </span>
                    <div
                      className="w-4 h-4 rounded-full shadow-xs"
                      style={{ backgroundColor: activePreset.swatchHex }}
                    />
                  </div>
                  <h4 className="text-sm font-bold text-[#121212]">
                    {activePreset.bestLip}
                  </h4>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Weightless matte liquid pigment formulated with zero ashiness.
                  </p>
                  <button
                    onClick={() => onOpenTryOn(lipstickProduct.id, activePreset.lipShadeId)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F05A7E] hover:text-[#F05A7E] pt-1 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Try On in Live AR</span>
                  </button>
                </div>

                {/* Sindoor & Complexion Pairing */}
                <div className="bg-white p-4 rounded-xl border border-[#E8D5A8] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#F05A7E] uppercase tracking-wider">
                      Ceremonial Pairing
                    </span>
                    <span className="text-[10px] bg-[#FCE8ED] text-[#F05A7E] px-2 py-0.5 rounded-full font-bold">
                      HERITAGE
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-[#121212]">
                    {activePreset.sindoor}
                  </h4>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Enriched with 24K gold micro-shimmer and sacred saffron extract.
                  </p>
                  <button
                    onClick={() => onOpenProduct(lipstickProduct)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#121212] hover:text-[#F05A7E] pt-1 cursor-pointer"
                  >
                    <span>View Product Details</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Bottom Quick Quiz Button */}
              {onOpenQuiz && (
                <div className="pt-2 flex items-center justify-between text-xs text-[#6B6B6B]">
                  <span>Want a 4-question lifestyle quiz instead?</span>
                  <button
                    onClick={onOpenQuiz}
                    className="font-bold text-[#F05A7E] hover:underline cursor-pointer"
                  >
                    Take Beauty Quiz →
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
