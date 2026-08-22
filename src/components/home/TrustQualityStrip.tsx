import React from 'react';
import { Sparkles, Shield, Feather, Award, Heart, ShieldCheck, Leaf } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Shield,
  Feather,
  Award,
  Heart,
  ShieldCheck,
  Leaf,
};

const DEFAULT_BENEFITS = [
  { id: 'ben-1', title: 'Thoughtfully Crafted', description: 'Carefully calibrated cosmetic formulations designed for weightless, comfortable daily wear.', icon: 'Feather', imageUrl: undefined as string | undefined, displayOrder: 1, isActive: true },
  { id: 'ben-2', title: 'Beauty Meets Technology', description: 'Personalized shade intelligence engineered specifically around Indian skin tones and undertones.', icon: 'Sparkles', imageUrl: undefined as string | undefined, displayOrder: 2, isActive: true },
  { id: 'ben-3', title: 'Premium Experience', description: 'Sensorial textures, enduring pigments, and seamless ritual luxury from packaging to application.', icon: 'Shield', imageUrl: undefined as string | undefined, displayOrder: 3, isActive: true },
];

const DEFAULT_SECTION = { eyebrow: 'OUR PROMISE', title: 'Beauty you can ', titleHighlight: 'trust.' };

export const TrustQualityStrip: React.FC = () => {
  const { benefits, benefitsSection } = useCMS();
  const section = benefitsSection || DEFAULT_SECTION;
  const active = (benefits && benefits.length > 0 ? benefits : DEFAULT_BENEFITS)
    .filter((b) => b.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  if (active.length === 0) return null;

  return (
    <section className="py-14 sm:py-16 bg-[#FCE8ED]/40 border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-10">
          <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            {section.eyebrow}
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-1">
            {section.title}
            <span className="italic font-light text-[#F05A7E]">{section.titleHighlight}</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {active.map((benefit) => {
            const Icon = ICON_MAP[benefit.icon] || Sparkles;
            return (
              <div
                key={benefit.id}
                className="flex items-start gap-4 p-6 bg-white rounded-3xl border border-[#E8D5A8] shadow-[0_4px_16px_rgba(240,90,126,0.04)]"
              >
                <div className="w-11 h-11 bg-[#FCE8ED] text-[#F05A7E] rounded-2xl flex-shrink-0 border border-[#E8D5A8] overflow-hidden flex items-center justify-center">
                  {benefit.imageUrl ? (
                    <img src={benefit.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="w-5 h-5 stroke-[2]" />
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-[#121212]">
                    {benefit.title}
                  </h3>
                  <p className="text-xs text-[#6B6B6B] leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
