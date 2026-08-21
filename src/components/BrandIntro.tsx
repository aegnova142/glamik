import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, Droplets, HeartHandshake, Eye } from 'lucide-react';

interface BrandIntroProps {
  onDiscoverClick: () => void;
}

export const BrandIntro: React.FC<BrandIntroProps> = ({ onDiscoverClick }) => {
  return (
    <section id="brand-intro" className="py-16 sm:py-24 bg-white relative overflow-hidden border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Editorial Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          <div className="lg:col-span-5 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#F05A7E]">
                The Philosophy
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] leading-[1.15]">
              Beauty, <br />
              <span className="text-[#F05A7E]">Made Personal.</span>
            </h2>
            <div className="w-12 h-1 bg-[#F05A7E] rounded-full" />
            <p className="text-base sm:text-lg text-[#6B6B6B] font-normal leading-relaxed">
              Glamirk brings together modern beauty, thoughtful formulations and intelligent shade technology to create a more personal beauty experience.
            </p>
            <p className="text-sm text-[#6B6B6B] leading-relaxed">
              Rooted in the richness of Indian skin undertones and contemporary cosmetics innovation, our collections are created to empower your personal ritual with effortless grace.
            </p>
            <div className="pt-2">
              <button
                id="brand-intro-discover-btn"
                onClick={onDiscoverClick}
                className="inline-flex items-center gap-2.5 px-6 py-3 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-semibold rounded-full shadow-[0_4px_14px_rgba(240, 90, 126,0.25)] hover:scale-102 active:scale-95 transition-all duration-200 group cursor-pointer"
              >
                <span>Discover Glamirk</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
              </button>
            </div>
          </div>

          {/* Right Visual Composition */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl sm:rounded-3xl bg-[#FCE8ED] border border-[#E8D5A8] shadow-[0_8px_24px_rgba(240, 90, 126,0.08)]">
              <img
                src="https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=85"
                alt="Glamirk Editorial Formulation Philosophy"
                className="w-full h-full object-cover transform hover:scale-103 transition-transform duration-700"
              />
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#E8D5A8] shadow-xs">
                <span className="text-[10px] tracking-wider uppercase text-[#121212] font-bold">
                  Thoughtful Formulations
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="relative aspect-[4/4] overflow-hidden rounded-2xl sm:rounded-3xl bg-[#FCE8ED] border border-[#E8D5A8] shadow-[0_8px_24px_rgba(240, 90, 126,0.08)]">
                <img
                  src="https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=85"
                  alt="Glamirk Cosmetic Textures and Pigments"
                  className="w-full h-full object-cover transform hover:scale-103 transition-transform duration-700"
                />
              </div>

              {/* Brand Pillars Box */}
              <div className="bg-[#FCE8ED] p-6 rounded-2xl border border-[#E8D5A8] space-y-2">
                <h4 className="text-base font-bold text-[#121212]">
                  Indian Skin Intelligence
                </h4>
                <p className="text-xs text-[#6B6B6B] leading-relaxed">
                  Every pigment density and emulsion viscosity is calibrated to enhance Indian complexions without chalkiness or oxidation.
                </p>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};

