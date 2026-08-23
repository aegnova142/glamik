import React, { useState } from 'react';
import { GLAMIRK_LOOKS } from '../../data/looks';
import { Look } from '../../types';
import { ArrowRight, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface ShopTheLookProps {
  onSelectLook: (look: Look) => void;
}

const CARDS_PER_ROW = 3;

export const ShopTheLook: React.FC<ShopTheLookProps> = ({ onSelectLook }) => {
  const { looks } = useCMS();
  const displayLooks = looks && looks.length > 0 ? looks : GLAMIRK_LOOKS;
  const [showAll, setShowAll] = useState(false);
  const visibleLooks = showAll ? displayLooks : displayLooks.slice(0, CARDS_PER_ROW);
  const hasMore = displayLooks.length > CARDS_PER_ROW;
  return (
    <section id="shop-the-look" className="py-16 sm:py-24 bg-white border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16 space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
            <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
              Curated Beauty Pairings
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] tracking-tight">
            Shop the Look
          </h2>
          <p className="text-sm sm:text-base text-[#6B6B6B] font-normal leading-relaxed">
            Curated cosmetic pairings designed for distinct moments, from morning minimalism to festive celebratory radiance.
          </p>
        </div>

        {/* 3 Editorial Look Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {visibleLooks.map((look) => (
            <div
              key={look.id}
              id={`look-card-${look.id}`}
              className="group relative bg-white border border-[#E8D5A8] rounded-3xl overflow-hidden hover:shadow-[0_16px_36px_rgba(240, 90, 126,0.1)] hover:border-[#F05A7E] transition-all duration-300 flex flex-col justify-between"
            >
              {/* Campaign Visual with subtle hover zoom */}
              <div className="relative aspect-[3/4] overflow-hidden bg-[#FCE8ED]">
                {look.video ? (
                  <video
                    src={look.video}
                    poster={look.image}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover transform group-hover:scale-104 transition-transform duration-500 ease-out"
                  />
                ) : (
                  <img
                    src={look.image}
                    alt={look.title}
                    className="w-full h-full object-cover transform group-hover:scale-104 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                )}

                {/* Subtle gradient vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B]/60 via-transparent to-transparent pointer-events-none" />

                {/* Top Category Badge */}
                <div className="absolute top-4 left-4 z-10">
                  <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-[#F05A7E] text-[10px] font-bold tracking-wider uppercase rounded-full border border-[#E8D5A8] shadow-xs">
                    {look.category}
                  </span>
                </div>

                {/* Bottom Overlay Info */}
                <div className="absolute bottom-4 left-4 right-4 text-white space-y-1">
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {look.title}
                  </h3>
                  <p className="text-xs text-[#FCE8ED] line-clamp-2 font-normal">
                    {look.tagline}
                  </p>
                </div>
              </div>

              {/* Look Card Bottom Actions & Products Included */}
              <div className="p-5 sm:p-6 space-y-4 bg-white flex-grow flex flex-col justify-between">
                <div className="space-y-2">
                  <span className="text-[10px] tracking-wider uppercase text-[#F05A7E] font-bold block">
                    Featured Products
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {look.productsUsed.map((p, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 bg-[#FCE8ED] text-[#121212] border border-[#E8D5A8] rounded-full font-medium"
                      >
                        {p.productName} {p.shadeName ? `• ${p.shadeName}` : ''}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E8D5A8]">
                  <button
                    id={`explore-look-btn-${look.id}`}
                    onClick={() => onSelectLook(look)}
                    className="w-full py-3 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold tracking-wider uppercase rounded-full shadow-[0_4px_12px_rgba(240, 90, 126,0.2)] transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-102 active:scale-95"
                  >
                    <span>Explore Look</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-[#E8D5A8] rounded-full text-xs font-semibold text-[#121212] hover:border-[#F05A7E] hover:text-[#F05A7E] transition-colors"
            >
              <span>{showAll ? 'View Less' : `View More (${displayLooks.length - CARDS_PER_ROW})`}</span>
              {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

      </div>
    </section>
  );
};
