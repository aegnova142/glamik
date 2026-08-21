/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CMSPageSection, Product, Shade } from '../types';
import { useCMS } from '../context/CMSContext';
import { LiveOfferCountdown } from './LiveOfferCountdown';
import { Sparkles, ArrowRight, ShieldCheck, Check, Heart, Eye } from 'lucide-react';

interface DynamicSectionRendererProps {
  section: CMSPageSection;
  onOpenProduct?: (product: Product) => void;
  onOpenShadeFinder?: () => void;
  onOpenTryOn?: (product: Product, shade?: Shade) => void;
  onAddToCart?: (product: Product, shade?: Shade) => void;
  onNavigate?: (url: string) => void;
}

export const DynamicSectionRenderer: React.FC<DynamicSectionRendererProps> = ({
  section,
  onOpenProduct,
  onOpenShadeFinder,
  onOpenTryOn,
  onAddToCart,
  onNavigate,
}) => {
  const { products, activeOffers } = useCMS();

  if (!section.isVisible) return null;

  const props = section.props || {};

  switch (section.type) {
    case 'hero':
      return (
        <section className="relative min-h-[500px] md:min-h-[600px] flex items-center justify-center overflow-hidden bg-[#0B0B0B] text-[#FAF9F6]">
          {props.image && (
            <div className="absolute inset-0 z-0">
              <img
                src={props.image}
                alt={props.heading || 'Hero Banner'}
                className="w-full h-full object-cover object-center opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] via-[#0B0B0B]/60 to-transparent" />
            </div>
          )}
          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center space-y-6 py-20">
            {props.eyebrow && (
              <span className="inline-block px-3 py-1 rounded-full text-xs font-mono tracking-widest uppercase bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/40">
                {props.eyebrow}
              </span>
            )}
            <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl tracking-wide leading-tight text-[#FAF9F6]">
              {props.heading}
            </h1>
            {props.description && (
              <p className="text-sm sm:text-base text-[#FAF9F6]/80 max-w-2xl mx-auto font-light leading-relaxed">
                {props.description}
              </p>
            )}
            {props.primaryCtaText && (
              <div className="pt-4">
                <button
                  onClick={() => onNavigate && onNavigate(props.primaryCtaUrl || '/shop')}
                  className="px-8 py-3.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-widest rounded-full transition-all shadow-lg cursor-pointer"
                >
                  {props.primaryCtaText}
                </button>
              </div>
            )}
          </div>
        </section>
      );

    case 'promotional_banner':
      return (
        <section className="py-8 px-4 bg-[#171717] border-y border-[#E8D5A8]/30">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left">
              {props.badgeText && (
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#F05A7E]">
                  {props.badgeText}
                </span>
              )}
              <h2 className="font-serif text-xl sm:text-2xl text-[#FAF9F6]">{props.heading}</h2>
              <p className="text-xs text-[#6B6B6B]">{props.description}</p>
            </div>

            {props.showCountdown && props.endDate && (
              <div className="shrink-0">
                <LiveOfferCountdown targetDate={props.endDate} />
              </div>
            )}

            {props.primaryCtaText && (
              <button
                onClick={() => onNavigate && onNavigate(props.primaryCtaUrl || '/shop')}
                className="px-6 py-2.5 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-semibold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer shrink-0"
              >
                {props.primaryCtaText}
              </button>
            )}
          </div>
        </section>
      );

    case 'brand_statement':
    case 'rich_text':
      return (
        <section className="py-16 px-6 bg-[#FAF9F6] text-[#121212]">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            {props.eyebrow && (
              <span className="text-xs font-mono uppercase tracking-widest text-[#C9972B]">
                {props.eyebrow}
              </span>
            )}
            <h2 className="font-serif text-2xl sm:text-4xl text-[#121212] tracking-wide">
              {props.heading}
            </h2>
            {props.description && (
              <p className="text-sm sm:text-base text-[#6B6B6B] leading-relaxed">
                {props.description}
              </p>
            )}
          </div>
        </section>
      );

    default:
      return null;
  }
};
