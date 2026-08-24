import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface ShadeFinderTeaserProps {
  onOpenShadeFinderModal: () => void;
}

export const ShadeFinderTeaser: React.FC<ShadeFinderTeaserProps> = ({ onOpenShadeFinderModal }) => {
  const { shadeFinderTeaser } = useCMS();
  const profiles = shadeFinderTeaser?.profiles || [];
  const [activeId, setActiveId] = useState<string | null>(null);

  // Keep the active selection valid as admin-edited profiles load/change.
  useEffect(() => {
    if (profiles.length === 0) return;
    if (!activeId || !profiles.some((p) => p.id === activeId)) {
      setActiveId(profiles[0].id);
    }
  }, [profiles, activeId]);

  if (!shadeFinderTeaser || profiles.length === 0) return null;

  const profile = profiles.find((p) => p.id === activeId) || profiles[0];

  return (
    <section id="shade-finder-teaser" className="py-20 lg:py-28 bg-white border-b border-[#E8D5A8] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Personalization Copy */}
          <div className="lg:col-span-7 space-y-7 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#FCE8ED] text-[#F05A7E] rounded-full border border-[#E8D5A8] shadow-xs">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] font-bold tracking-wider uppercase">
                {shadeFinderTeaser.badgeText}
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] leading-tight">
                {shadeFinderTeaser.heading}
              </h2>
              <p className="text-xl sm:text-2xl text-[#F05A7E] font-bold">
                {shadeFinderTeaser.subheading}
              </p>
            </div>

            <div className="w-12 h-1 bg-[#F05A7E] rounded-full" />

            <p className="text-base text-[#6B6B6B] leading-relaxed">
              {shadeFinderTeaser.description}
            </p>

            {/* Interactive Undertone Selector Pills */}
            <div className="space-y-3 pt-2">
              <span className="text-xs uppercase tracking-wider text-[#6B6B6B] font-bold block">
                Select Your Undertone Profile:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveId(p.id)}
                    className={`py-2.5 px-4 text-xs font-bold rounded-full border transition-all text-center cursor-pointer ${
                      profile.id === p.id
                        ? 'bg-[#F05A7E] text-white border-[#F05A7E] shadow-[0_4px_12px_rgba(240, 90, 126,0.25)]'
                        : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:border-[#F05A7E]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Matched Recommendations Card */}
            <div className="bg-[#FCE8ED] p-6 rounded-3xl border border-[#E8D5A8] space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-base text-[#121212] font-bold">
                  {profile.title} Match
                </span>
                <div className="flex items-center gap-1.5">
                  {profile.swatchHexes.map((hex, i) => (
                    <span
                      key={i}
                      className="w-4 h-4 rounded-full border border-[#0B0B0B]/10 shadow-xs"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                {profile.description}
              </p>
              <div className="text-xs text-[#121212] pt-1 flex flex-wrap gap-x-4 gap-y-1 font-medium">
                <span>Lip: <strong className="text-[#F05A7E] font-bold">{profile.recommendedLip}</strong></span>
                <span>Sindoor: <strong className="text-[#F05A7E] font-bold">{profile.recommendedSindoor}</strong></span>
              </div>
            </div>

            {/* CTA */}
            <div>
              <button
                id="shade-finder-open-quiz-btn"
                onClick={onOpenShadeFinderModal}
                className="w-full sm:w-auto px-8 py-4 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs sm:text-sm font-bold rounded-full shadow-[0_4px_16px_rgba(240, 90, 126,0.3)] hover:scale-102 active:scale-95 transition-all flex items-center justify-center gap-2.5 group cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{shadeFinderTeaser.ctaText}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

          </div>

          {/* Right Column: Visual Composition */}
          <div className="lg:col-span-5 relative">
            <div className="relative aspect-[4/5] max-w-sm sm:max-w-md mx-auto lg:mx-0 overflow-hidden rounded-3xl bg-[#FCE8ED] border border-[#E8D5A8] shadow-[0_16px_40px_rgba(240, 90, 126,0.08)] flex items-center justify-center">
              <img
                src={profile.visual}
                alt={`Glamirk Shade Matching - ${profile.title}`}
                className="w-full h-full object-contain transition-all duration-700"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B]/60 via-transparent to-transparent" />

              <div className="absolute bottom-6 left-6 right-6 text-white flex items-end justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-white/80 font-bold block">
                    Match Simulation
                  </span>
                  <h4 className="text-xl font-bold text-white">
                    {profile.title} Spectrum
                  </h4>
                </div>
                <div className="bg-white text-[#F05A7E] px-3.5 py-1 text-xs font-bold rounded-full shadow-sm">
                  Calibrated
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

