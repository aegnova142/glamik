import React from 'react';
import { Sparkles, Shield, Feather, Award } from 'lucide-react';

export const TrustQualityStrip: React.FC = () => {
  const pillars = [
    {
      icon: Feather,
      title: 'Thoughtfully Crafted',
      description: 'Carefully calibrated cosmetic formulations designed for weightless, comfortable daily wear.'
    },
    {
      icon: Sparkles,
      title: 'Beauty Meets Technology',
      description: 'Personalized shade intelligence engineered specifically around Indian skin tones and undertones.'
    },
    {
      icon: Shield,
      title: 'Premium Experience',
      description: 'Sensorial textures, enduring pigments, and seamless ritual luxury from packaging to application.'
    }
  ];

  return (
    <section className="py-14 sm:py-16 bg-[#FCE8ED]/40 border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <div
                key={index}
                className="flex items-start gap-4 p-6 bg-white rounded-3xl border border-[#E8D5A8] shadow-[0_4px_16px_rgba(240, 90, 126,0.04)]"
              >
                <div className="p-3 bg-[#FCE8ED] text-[#F05A7E] rounded-2xl flex-shrink-0 border border-[#E8D5A8]">
                  <Icon className="w-5 h-5 stroke-[2]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-[#121212]">
                    {pillar.title}
                  </h3>
                  <p className="text-xs text-[#6B6B6B] leading-relaxed">
                    {pillar.description}
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

