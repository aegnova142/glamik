import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

export const BrandStatement: React.FC = () => {
  return (
    <section className="py-14 sm:py-20 bg-gradient-to-b from-[#FCE8ED] to-white relative overflow-hidden border-y border-[#E8D5A8]">
      {/* Pink accent ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#F05A7E]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        
        <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 bg-white rounded-full border border-[#E8D5A8] shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
          <span className="text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-[#F05A7E] font-bold">
            The Glamirk Manifesto
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.8 }}
          className="space-y-1 sm:space-y-2"
        >
          <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#121212] leading-tight">
            YOUR BEAUTY.
          </h2>
          <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#F05A7E] leading-tight">
            YOUR SHADE.
          </h2>
          <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#121212] leading-tight">
            YOUR GLAM.
          </h2>
        </motion.div>

        <p className="mt-6 sm:mt-8 text-xs sm:text-sm text-[#6B6B6B] max-w-lg mx-auto tracking-[0.14em] uppercase font-semibold">
          Precision Formulations • Timeless Rituals • Bespoke Radiance
        </p>

      </div>
    </section>
  );
};

