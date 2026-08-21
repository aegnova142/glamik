import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, ShieldCheck, CheckCircle2, Truck, RefreshCw, Award } from 'lucide-react';

interface HeroProps {
  onShopClick: () => void;
  onFindShadeClick: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onShopClick, onFindShadeClick }) => {
  return (
    <div className="bg-white">
      {/* Main Hero Banner Container with Soft Blush Gradient */}
      <section
        id="hero-section"
        className="relative overflow-hidden bg-gradient-to-r from-[#FCE8ED] via-[#FCE8ED] to-[#FCE8ED] border-b border-[#E8D5A8] pt-10 pb-16 lg:py-20"
      >
        {/* Subtle decorative background shapes */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/40 rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute bottom-0 left-10 w-[350px] h-[350px] bg-[#FCE8ED]/30 rounded-full blur-2xl pointer-events-none -z-0" />
        
        {/* Delicate background pattern */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#E83E78_1px,transparent_1px)] [background-size:28px_28px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            
            {/* Left Column: Reference Copy & Action Buttons */}
            <div className="lg:col-span-7 space-y-6 text-left">
              
              {/* Reference-Style Pill Tag */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/90 border border-[#E8D5A8] rounded-full shadow-xs"
              >
                <span className="text-[#F05A7E] text-xs">✨</span>
                <span className="text-xs font-semibold tracking-wide text-[#F05A7E]">
                  Radiate Confidence Every Day
                </span>
              </motion.div>

              {/* Reference-Style Bold Display Heading */}
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-[#121212] tracking-tight leading-[1.12]"
              >
                Beauty &amp; Radiance <br />
                for a <span className="text-[#F05A7E]">Better You</span>
              </motion.h1>

              {/* Subtitle / Paragraph */}
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-base sm:text-lg text-[#6B6B6B] max-w-xl font-normal leading-relaxed"
              >
                Discover premium beauty essentials and shade-matching formulations engineered to amplify your natural glow.
              </motion.p>

              {/* Two Pill CTAs Matching the Reference */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2"
              >
                {/* Primary CTA: Pink Pill with Arrow */}
                <button
                  id="hero-shop-cta-btn"
                  onClick={onShopClick}
                  className="px-8 py-3.5 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-sm font-semibold rounded-full shadow-[0_6px_20px_rgba(240, 90, 126,0.28)] hover:scale-102 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Shop Now</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Secondary CTA: White Pill with Category Icon */}
                <button
                  id="hero-find-shade-cta-btn"
                  onClick={onFindShadeClick}
                  className="px-7 py-3.5 bg-white hover:bg-[#FCE8ED] text-[#121212] border border-[#E8D5A8] text-sm font-semibold rounded-full shadow-xs hover:border-[#F05A7E] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#F05A7E]" />
                  <span>Find My Shade</span>
                </button>
              </motion.div>

              {/* Trust highlights */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.45 }}
                className="pt-4 flex flex-wrap items-center gap-5 text-xs text-[#6B6B6B] font-medium"
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#F05A7E]" />
                  <span>Dermatologist Approved</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#F05A7E]" />
                  <span>Formulated for Indian Skin</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#F05A7E]" />
                  <span>100% Vegan &amp; Cruelty-Free</span>
                </div>
              </motion.div>
            </div>

            {/* Right Column: Reference-Style Hero Visual with Floating Pill Badge */}
            <div className="lg:col-span-5 relative">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative mx-auto max-w-sm sm:max-w-md lg:max-w-none"
              >
                {/* Visual Frame */}
                <div className="relative rounded-3xl overflow-hidden shadow-[0_16px_40px_rgba(240, 90, 126,0.12)] border-4 border-white aspect-[4/5] bg-gradient-to-b from-[#FCE8ED] to-[#FCE8ED]">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85"
                    alt="Radiant Glamirk Beauty Model"
                    className="w-full h-full object-cover object-center transform hover:scale-103 transition-transform duration-700"
                  />
                  
                  {/* Subtle pink tint overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#F05A7E]/30 via-transparent to-transparent pointer-events-none" />

                  {/* Bottom Image Tag */}
                  <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-white/60 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-[#F05A7E] uppercase tracking-wider block">
                        Signature Collection
                      </span>
                      <span className="text-xs font-bold text-[#121212]">
                        Matte Liquid &amp; Cleansing Balm
                      </span>
                    </div>
                    <span className="text-xs font-extrabold text-[#F05A7E] bg-[#FCE8ED] px-2.5 py-1 rounded-full border border-[#E8D5A8]">
                      ₹299+
                    </span>
                  </div>
                </div>

                {/* Floating Authentic Formulation Circular / Pill Badge */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                  className="absolute -top-4 -right-3 sm:-top-5 sm:-right-4 bg-white p-3.5 rounded-2xl shadow-[0_10px_25px_rgba(240, 90, 126,0.15)] border border-[#E8D5A8] flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E] shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#6B6B6B] uppercase block">
                      100% Authentic
                    </span>
                    <span className="text-xs font-bold text-[#121212]">
                      Tested Formulations
                    </span>
                  </div>
                </motion.div>

                {/* Floating Rating Badge */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                  className="absolute -bottom-4 -left-3 sm:-bottom-5 sm:-left-4 bg-white px-4 py-2.5 rounded-full shadow-[0_10px_25px_rgba(240, 90, 126,0.12)] border border-[#E8D5A8] flex items-center gap-2"
                >
                  <span className="text-amber-400 font-bold text-sm">★★★★★</span>
                  <span className="text-xs font-bold text-[#121212]">4.9/5 Rating</span>
                </motion.div>
              </motion.div>
            </div>

          </div>
        </div>
      </section>

      {/* Trust & Service Strip Matching Reference Bottom Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 relative z-20">
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_10px_30px_rgba(240, 90, 126,0.06)] border border-[#E8D5A8] grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E] shrink-0">
              <ShieldCheck className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#121212] leading-snug">
                100% Authentic
              </h4>
              <p className="text-xs text-[#6B6B6B] mt-0.5">
                Certified original beauty
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E] shrink-0">
              <Sparkles className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#121212] leading-snug">
                Expert Approved
              </h4>
              <p className="text-xs text-[#6B6B6B] mt-0.5">
                Dermatologically safe
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E] shrink-0">
              <Truck className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#121212] leading-snug">
                Fast Delivery
              </h4>
              <p className="text-xs text-[#6B6B6B] mt-0.5">
                Express pan-India transit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E] shrink-0">
              <RefreshCw className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#121212] leading-snug">
                Easy Returns
              </h4>
              <p className="text-xs text-[#6B6B6B] mt-0.5">
                Hassle-free 7-day policy
              </p>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
};


