// [Glamik CMS] Rebuilt 2026-10-03 — CMS-driven "Find Your Perfect Match":
// undertone × look-type selection drives the match card + before/after slider.
// Right-column visual + decorative backdrop finalised 2026-10-05.
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, ArrowRight, Droplet, Gift, Smile, Heart } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';
import { resolveShadeMatch } from '@glamirk/shared/utils/shadeMatch';

interface ShadeFinderTeaserProps {
  onOpenShadeFinderModal: () => void;
}

// Icon used for a look-type when the admin hasn't uploaded one. Keyed loosely
// by id so the seed options get sensible glyphs; everything else falls back.
const LOOK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'lip-shade': Heart,
  'sindoor-shade': Droplet,
  'complete-look': Smile,
  'occasion-based': Gift,
};

export const ShadeFinderTeaser: React.FC<ShadeFinderTeaserProps> = ({ onOpenShadeFinderModal }) => {
  const { shadeFinderTeaser } = useCMS();

  const profiles = shadeFinderTeaser?.profiles || [];
  const lookTypes = useMemo(
    () => (shadeFinderTeaser?.lookTypes || []).filter((l) => l.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [shadeFinderTeaser]
  );
  // The matrix itself is read through resolveShadeMatch rather than here —
  // the pairing rule it enforces is not something this component should be
  // reimplementing inline.

  const [undertoneId, setUndertoneId] = useState<string>('');
  const [lookTypeId, setLookTypeId] = useState<string>('');

  // Keep selections valid as CMS data loads/changes, without resetting the
  // other dimension (spec: changing undertone keeps the look type and vice versa).
  useEffect(() => {
    if (profiles.length && (!undertoneId || !profiles.some((p) => p.id === undertoneId))) {
      setUndertoneId(profiles[0].id);
    }
  }, [profiles, undertoneId]);
  useEffect(() => {
    if (lookTypes.length && (!lookTypeId || !lookTypes.some((l) => l.id === lookTypeId))) {
      setLookTypeId(lookTypes[0].id);
    }
  }, [lookTypes, lookTypeId]);

  if (!shadeFinderTeaser || profiles.length === 0) return null;

  // Strict lookup by the selected ids. resolveShadeMatch returns null rather
  // than substituting a neighbouring profile when `undertoneId` matches
  // nothing — which happens for a render or two after an admin deletes the
  // selected undertone, and used to silently show profiles[0]'s photographs
  // under the deleted shade's heading. Rendering nothing for that one frame
  // is the correct trade: the effect above re-selects a valid undertone
  // immediately, and no customer is ever shown another shade's face.
  const r = resolveShadeMatch(shadeFinderTeaser, undertoneId, lookTypeId);
  if (!r || !r.profile) return null;
  const profile = r.profile;

  const heading = shadeFinderTeaser.heading;
  const highlight = shadeFinderTeaser.highlight || '';
  // If a highlight is set and appears in the heading, split so it can be accented.
  const [headBefore, headAfter] =
    highlight && heading.includes(highlight) ? heading.split(highlight) : [heading, ''];

  return (
    <section id="shade-finder-teaser" className="py-16 lg:py-24 bg-gradient-to-b from-white via-[#FFF6F8] to-white border-b border-[#F0E0E5] relative overflow-hidden">
      <style>{`
        @keyframes sfFade { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: none;} }
        .sf-fade { animation: sfFade .35s ease both; }
        @media (prefers-reduced-motion: reduce) { .sf-fade { animation: none; } }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* LEFT */}
          <div className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#FCE8ED] text-[#E0265F] rounded-full border border-[#F3D9E0] shadow-xs">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] font-bold tracking-widest uppercase">{shadeFinderTeaser.badgeText}</span>
            </div>

            <h2 className="mt-5 font-serif text-4xl sm:text-5xl font-bold text-[#1A1012] leading-[1.05]">
              {highlight && headAfter !== undefined && heading.includes(highlight) ? (
                <>
                  {headBefore}
                  <span className="text-[#E0265F]">{highlight}</span>
                  {headAfter}
                </>
              ) : (
                heading
              )}
            </h2>
            <div className="mt-3 w-28 h-1 rounded-full bg-gradient-to-r from-[#C9972B] to-[#E8D5A8]" />

            <p className="mt-5 text-lg sm:text-xl font-bold text-[#1A1012]">{shadeFinderTeaser.subheading}</p>
            <p className="mt-2 text-sm text-[#6B5A5E] leading-relaxed max-w-xl">{shadeFinderTeaser.description}</p>

            {/* Look-type selector */}
            {lookTypes.length > 0 && (
              <>
                <p className="mt-7 text-xs font-bold uppercase tracking-widest text-[#8A7278]">
                  {shadeFinderTeaser.chooseLabel || "Choose what you're looking for:"}
                </p>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5" role="tablist" aria-label="What are you looking for">
                  {lookTypes.map((lt) => {
                    const isSel = lookTypeId === lt.id;
                    const Icon = LOOK_ICONS[lt.id] || Sparkles;
                    return (
                      <button
                        key={lt.id}
                        role="tab"
                        aria-selected={isSel}
                        onClick={() => setLookTypeId(lt.id)}
                        className={`group flex items-center gap-2 px-3 py-3 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E0265F] ${
                          isSel
                            ? 'bg-[#E0265F] border-[#E0265F] text-white shadow-[0_6px_16px_rgba(224,38,95,0.28)]'
                            : 'bg-white border-[#F3D9E0] text-[#1A1012] hover:border-[#E0265F]/60'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${isSel ? 'bg-white/20' : 'bg-[#FCE8ED]'}`}>
                          {lt.iconUrl ? (
                            <img src={cloudinaryImageUrl(lt.iconUrl, 'thumb')} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          ) : (
                            <Icon className={`w-3.5 h-3.5 ${isSel ? 'text-white' : 'text-[#E0265F]'}`} />
                          )}
                        </span>
                        <span className="text-xs font-bold leading-tight flex-1 min-w-0 truncate">{lt.name}</span>
                        <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isSel ? 'text-white/90' : 'text-[#D9C3C9]'}`} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Match card */}
            <div key={`${profile.id}-${lookTypeId}`} className="sf-fade mt-5 bg-[#FCE8ED]/70 border border-[#F3D9E0] rounded-3xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-serif text-xl font-bold text-[#1A1012]">{r.matchTitle}</h3>
                <div className="flex items-center gap-1.5 pt-1 shrink-0">
                  {r.swatches.slice(0, 3).map((hex, i) => (
                    <span key={i} className="w-4 h-4 rounded-full border border-black/10 shadow-xs" style={{ backgroundColor: hex }} />
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[13px] text-[#6B5A5E] leading-relaxed">{r.matchDescription}</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px]">
                {r.primary && (
                  <span className="text-[#1A1012]">
                    {r.primaryLabel}: <strong className="text-[#E0265F] font-bold">{r.primary}</strong>
                  </span>
                )}
                {r.secondary && (
                  <span className="text-[#1A1012]">
                    {r.secondaryLabel}: <strong className="text-[#E0265F] font-bold">{r.secondary}</strong>
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onOpenShadeFinderModal}
              className="mt-6 group inline-flex w-full sm:w-auto items-center justify-center gap-2.5 px-8 py-4 bg-[#E0265F] hover:bg-[#C81F53] text-white text-sm font-bold rounded-full shadow-[0_8px_22px_rgba(224,38,95,0.3)] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{shadeFinderTeaser.ctaText}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* RIGHT: before/after experience */}
          <div className="order-1 lg:order-2 min-w-0">
            <div className="relative mx-auto w-full max-w-md lg:max-w-[460px]">
              {/* One soft blush glow — the card, not the backdrop, carries the visual */}
              <div aria-hidden="true" className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-[#FBD2DF]/70 via-[#FCE8ED]/40 to-transparent blur-2xl" />

              {/* Card: the model and the before/after comparison are the whole visual */}
              <div
                key={`${profile.id}-${lookTypeId}-media`}
                className="sf-fade relative z-10 rounded-[28px] overflow-hidden border border-white/80 ring-1 ring-[#F3D9E0] shadow-[0_24px_50px_rgba(26,16,18,0.14)] aspect-[4/5] bg-[#FAF6F1]"
              >
                <BeforeAfterSlider
                  className="absolute inset-0"
                  beforeImage={r.beforeImage}
                  afterImage={r.afterImage}
                  beforeLabel={r.beforeLabel}
                  afterLabel={r.afterLabel}
                  alt={r.visualTitle}
                />

                {/* Bottom caption: translucent ivory, with the undertone palette as a compact selector */}
                <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl bg-[#FAF9F6]/90 backdrop-blur-md px-4 py-3 ring-1 ring-white/60 shadow-[0_8px_24px_rgba(26,16,18,0.10)]">
                  <div className="min-w-0 pointer-events-none">
                    <span className="block text-[9px] uppercase tracking-[0.22em] text-[#C9972B] font-bold">Match Simulation</span>
                    <h4 className="font-serif text-[15px] sm:text-lg font-bold text-[#1A1012] leading-tight">{r.visualTitle}</h4>
                  </div>
                  {profiles.length > 1 && (
                    <div className="flex items-center shrink-0" role="radiogroup" aria-label="Select your undertone">
                      {profiles.map((p) => {
                        const isSel = profile.id === p.id;
                        const dot = (p.swatchHexes && p.swatchHexes[0]) || '#E0265F';
                        return (
                          // 32px hit area around an 18px swatch: small to the eye, easy to tap.
                          <button
                            key={p.id}
                            role="radio"
                            aria-checked={isSel}
                            aria-label={p.title}
                            title={p.title}
                            onClick={() => setUndertoneId(p.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E0265F]"
                          >
                            <span
                              className={`block w-[18px] h-[18px] rounded-full transition-all ${
                                isSel ? 'ring-2 ring-[#E0265F] ring-offset-2 ring-offset-[#FAF9F6]' : 'ring-1 ring-black/10 hover:scale-110'
                              }`}
                              style={{ backgroundColor: dot }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
