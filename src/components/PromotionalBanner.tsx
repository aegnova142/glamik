import React from 'react';
import { ArrowRight, Sparkles, Flame } from 'lucide-react';
import { motion } from 'motion/react';

interface PromotionalBannerProps {
  onShopClick: () => void;
  title?: string;
  subtitle?: string;
  badge?: string;
  ctaText?: string;
}

export const PromotionalBanner: React.FC<PromotionalBannerProps> = ({
  onShopClick,
  title = "Discover The Glamirk Edit",
  subtitle = "Formulations curated for Indian skin tones & 16-hour comfort",
  badge = "Signature Beauty Collection",
  ctaText = "Shop the Collection",
}) => {
  return (
    <section className="py-8 sm:py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Wide Rounded Pink Promotional Banner Matching Reference 2 */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#F05A7E] via-[#F05A7E] to-[#F05A7E] text-white p-8 sm:p-10 lg:p-12 shadow-[0_16px_40px_rgba(240, 90, 126,0.22)] border border-[#FCE8ED]">
          
          {/* Subtle botanical silhouettes on the right and left background */}
          <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-20 pointer-events-none bg-contain bg-no-repeat bg-right" />
          <div className="absolute left-0 top-0 bottom-0 w-1/4 opacity-15 pointer-events-none bg-contain bg-no-repeat bg-left" />
          
          {/* Soft background glow circles */}
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-white/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-[#FCE8ED]/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Product Display (Matching Reference 2 Arrangement) */}
            <div className="lg:col-span-5 flex items-center justify-center order-2 lg:order-1">
              <div className="relative flex items-center justify-center gap-3 max-w-sm sm:max-w-md">
                
                {/* Product 1: Balm Cleanser Jar */}
                <div className="relative z-10 w-24 sm:w-28 aspect-square rounded-2xl bg-white/20 backdrop-blur-md p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.15)] border border-white/40 transform -rotate-3 hover:rotate-0 transition-transform">
                  <img
                    src="https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80"
                    alt="Balm to Water Cleanser"
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <div className="absolute -bottom-2 -left-2 bg-white text-[#F05A7E] text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                    50g Jar
                  </div>
                </div>

                {/* Product 2: Velvet Lipstick / Serum Bottle (Tall Center) */}
                <div className="relative z-20 w-28 sm:w-32 aspect-[3/4] rounded-2xl bg-white/25 backdrop-blur-md p-2 shadow-[0_12px_28px_rgba(0,0,0,0.2)] border border-white/50 transform scale-105 hover:scale-110 transition-transform">
                  <img
                    src="https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=400&q=80"
                    alt="Matte Liquid Lipstick"
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <div className="absolute -top-2.5 right-1 bg-white text-[#F05A7E] text-[9px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm">
                    Bestseller
                  </div>
                </div>

                {/* Product 3: Luxury Sindoor / Shimmer Bottle */}
                <div className="relative z-10 w-24 sm:w-28 aspect-square rounded-2xl bg-white/20 backdrop-blur-md p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.15)] border border-white/40 transform rotate-3 hover:rotate-0 transition-transform">
                  <img
                    src="https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=400&q=80"
                    alt="Luxury Sindoor"
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <div className="absolute -bottom-2 -right-2 bg-white text-[#F05A7E] text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                    Liquid
                  </div>
                </div>

              </div>
            </div>

            {/* Right / Center Content (Matching Reference 2 Typography) */}
            <div className="lg:col-span-7 text-center lg:text-left space-y-3.5 order-1 lg:order-2">
              
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-[11px] font-bold tracking-wider uppercase text-white shadow-xs">
                <Flame className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
                <span>{badge}</span>
              </div>

              {/* Headline */}
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                {title}
              </h3>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm text-pink-100 font-normal max-w-xl mx-auto lg:mx-0 leading-relaxed">
                {subtitle}
              </p>

              {/* CTA Button */}
              <div className="pt-2">
                <button
                  id="promotional-banner-shop-btn"
                  onClick={onShopClick}
                  className="px-8 py-3.5 bg-white text-[#F05A7E] hover:bg-[#FCE8ED] hover:text-[#F05A7E] text-xs font-bold rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.12)] hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>{ctaText}</span>
                  <ArrowRight className="w-4 h-4 text-[#F05A7E]" />
                </button>
              </div>

            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
