import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Droplets, Sparkles, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { Product } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';

interface CleanserShowcaseProps {
  onDiscoverCleanser: (product: Product) => void;
}

export const CleanserShowcase: React.FC<CleanserShowcaseProps> = ({ onDiscoverCleanser }) => {
  const [activeStep, setActiveStep] = useState<0 | 1 | 2>(0);
  const [selectedSize, setSelectedSize] = useState<'30g' | '50g'>('50g');

  const cleanserProduct = GLAMIRK_PRODUCTS.find(
    (p) => p.id === (selectedSize === '50g' ? 'balm-to-water-cleanser-50g' : 'balm-to-water-cleanser-30g')
  ) || GLAMIRK_PRODUCTS[3];

  const steps = [
    {
      number: '01',
      title: 'Solid Balm',
      description: 'Scoop a pearl of rich, comforting solid balm. Glides smoothly across dry skin with nourishing cushion.',
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=85',
      stateLabel: 'Phase 1: Rich Solid Cushion'
    },
    {
      number: '02',
      title: 'Silken Melt',
      description: 'Under gentle warmth of fingertips, the balm melts into a luxurious oil that dissolves waterproof pigments and pollutants.',
      image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=85',
      stateLabel: 'Phase 2: Makeup-Dissolving Oil'
    },
    {
      number: '03',
      title: 'Purifying Water',
      description: 'Splash with lukewarm water. Instantly transforms into a light milky water emulsion, rinsing 100% clean with no residue.',
      image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=800&q=85',
      stateLabel: 'Phase 3: Clean Milky Rinse'
    }
  ];

  return (
    <section id="cleanser-showcase" className="py-16 sm:py-24 bg-[#FCE8ED]/60 text-[#121212] relative overflow-hidden border-b border-[#E8D5A8]">
      
      {/* Background ambient pink lighting */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#FCE8ED]/80 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          
          {/* Left Column: Interactive Product Visual & Transformation Display */}
          <div className="lg:col-span-6 space-y-5">
            <div className="relative aspect-[4/5] sm:aspect-[1/1] lg:aspect-[4/5] overflow-hidden rounded-3xl bg-white border border-[#E8D5A8] shadow-[0_16px_40px_rgba(240, 90, 126,0.1)]">
              <img
                src={steps[activeStep].image}
                alt={`Glamirk Balm to Water Transformation - ${steps[activeStep].title}`}
                className="w-full h-full object-cover transition-all duration-700"
              />
              
              {/* Active Step Indicator Pill */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl border border-[#E8D5A8] shadow-xs">
                <div>
                  <span className="text-[9.5px] uppercase tracking-wider text-[#F05A7E] block font-bold">
                    Active Transformation
                  </span>
                  <span className="text-sm sm:text-base font-bold text-[#121212]">
                    {steps[activeStep].stateLabel}
                  </span>
                </div>
                <span className="text-xs font-bold text-[#6B6B6B]">
                  {steps[activeStep].number} / 03
                </span>
              </div>
            </div>

            {/* Interactive Step Switcher Tabs */}
            <div className="grid grid-cols-3 gap-3">
              {steps.map((step, idx) => (
                <button
                  key={step.number}
                  onClick={() => setActiveStep(idx as 0 | 1 | 2)}
                  className={`p-3 text-left rounded-2xl border transition-all cursor-pointer ${
                    activeStep === idx
                      ? 'border-[#F05A7E] bg-white ring-2 ring-[#F05A7E]/20 shadow-xs'
                      : 'border-[#E8D5A8] bg-white/70 hover:bg-white hover:border-[#F05A7E]'
                  }`}
                >
                  <span className="text-[10px] tracking-wider text-[#F05A7E] block font-bold">
                    {step.number}
                  </span>
                  <span className="text-xs text-[#121212] block font-bold mt-0.5">
                    {step.title}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Editorial Copy & Size Selection */}
          <div className="lg:col-span-6 space-y-6 text-left">
            
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white border border-[#E8D5A8] rounded-full shadow-xs">
                <Droplets className="w-3.5 h-3.5 text-[#F05A7E]" />
                <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                  The Iconic Transformation
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] leading-tight tracking-tight">
                Melt. Transform. <br />
                <span className="text-[#F05A7E]">Reveal.</span>
              </h2>
            </div>

            <div className="w-12 h-1 bg-[#F05A7E] rounded-full" />

            <p className="text-base sm:text-lg text-[#121212] font-normal leading-relaxed">
              An artisanal multi-phase cleansing balm that melts from a solid into a silken oil, and transforms into a purifying milky water on contact with moisture.
            </p>

            <p className="text-sm text-[#6B6B6B] leading-relaxed">
              Dissolves stubborn waterproof makeup, sunscreen, and daily pollutants without stripping moisture or leaving any greasy film. Formulated for everyday purity.
            </p>

            {/* Size Selector */}
            <div className="bg-white p-5 rounded-3xl border border-[#E8D5A8] space-y-3 shadow-xs">
              <div className="flex items-center justify-between text-xs text-[#6B6B6B] uppercase tracking-wider font-semibold">
                <span>Select Ritual Size:</span>
                <span className="text-[#F05A7E] font-bold text-base">
                  ₹{cleanserProduct.price}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedSize('30g')}
                  className={`p-3.5 text-left rounded-2xl border transition-all cursor-pointer ${
                    selectedSize === '30g'
                      ? 'border-[#F05A7E] bg-[#FCE8ED]'
                      : 'border-[#E8D5A8] bg-white hover:border-[#F05A7E]'
                  }`}
                >
                  <span className="text-xs font-bold text-[#121212] block">30g Discovery Jar</span>
                  <span className="text-[10.5px] text-[#6B6B6B] block mt-0.5">₹549 • Travel Size</span>
                </button>

                <button
                  onClick={() => setSelectedSize('50g')}
                  className={`p-3.5 text-left rounded-2xl border transition-all cursor-pointer ${
                    selectedSize === '50g'
                      ? 'border-[#F05A7E] bg-[#FCE8ED]'
                      : 'border-[#E8D5A8] bg-white hover:border-[#F05A7E]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#121212] block">50g Ritual Jar</span>
                    <span className="text-[9px] bg-[#F05A7E] text-white font-bold px-2 py-0.5 rounded-full uppercase">BESTSELLER</span>
                  </div>
                  <span className="text-[10.5px] text-[#6B6B6B] block mt-0.5">₹849 • Full Vanity Jar</span>
                </button>
              </div>
            </div>

            {/* Benefits Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#6B6B6B] font-medium">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#F05A7E] flex-shrink-0" />
                <span>Dissolves Waterproof Makeup</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#F05A7E] flex-shrink-0" />
                <span>Zero Greasy Film or Residue</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#F05A7E] flex-shrink-0" />
                <span>Gentle on Delicate Eye Area</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#F05A7E] flex-shrink-0" />
                <span>Preserves Skin Lipid Balance</span>
              </div>
            </div>

            {/* CTA Button */}
            <div className="pt-2">
              <button
                id="discover-cleanser-btn"
                onClick={() => onDiscoverCleanser(cleanserProduct)}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold rounded-full transition-all duration-200 flex items-center justify-center gap-2.5 shadow-[0_4px_16px_rgba(240, 90, 126,0.25)] hover:scale-102 active:scale-95 group cursor-pointer"
              >
                <span>Discover The Cleanser</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};

