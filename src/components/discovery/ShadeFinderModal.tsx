import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, ArrowRight, Check, RefreshCw, ShoppingBag } from 'lucide-react';
import { Product, Shade } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';

interface ShadeFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string) => void;
}

export const ShadeFinderModal: React.FC<ShadeFinderModalProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
  onAddToBag,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [skinDepth, setSkinDepth] = useState<string>('Medium Wheatish');
  const [undertone, setUndertone] = useState<'Warm' | 'Neutral' | 'Cool' | 'Olive'>('Warm');
  const [occasion, setOccasion] = useState<string>('Everyday Glamour');

  const skinDepthOptions = [
    { label: 'Fair to Light', desc: 'Porcelain with peachy or golden undertones' },
    { label: 'Medium Wheatish', desc: 'Classic golden caramel Indian tone' },
    { label: 'Dusky & Olive', desc: 'Rich golden olive with natural contour depth' },
    { label: 'Deep Melanin', desc: 'Profound warm or cool espresso and bronze depth' }
  ];

  const undertoneOptions = [
    {
      tone: 'Warm' as const,
      title: 'Warm Golden',
      desc: 'Veins appear greenish; gold jewelry illuminates your complexion.'
    },
    {
      tone: 'Neutral' as const,
      title: 'Neutral Balance',
      desc: 'Veins appear blue-green; both gold and silver look harmonious.'
    },
    {
      tone: 'Cool' as const,
      title: 'Cool Rose/Berry',
      desc: 'Veins appear purplish-blue; silver accents elevate your skin.'
    },
    {
      tone: 'Olive' as const,
      title: 'Olive Earth',
      desc: 'Subtle greenish-gold cast; earth tones and terracotta look striking.'
    }
  ];

  const occasionOptions = [
    { label: 'Everyday Glamour', desc: 'Clean, effortless, weightless daytime presence' },
    { label: 'Date Night & Soirée', desc: 'Magnetic, bold velvet definition under evening light' },
    { label: 'Wedding & Ceremonial', desc: 'High-pigment enduring regal scarlet and luxury sindoor' }
  ];

  // Matched Shade logic based on user selections
  const getMatchedShade = () => {
    const lipProduct = GLAMIRK_PRODUCTS[0]; // Matte Liquid Lipstick
    const sindoorProduct = GLAMIRK_PRODUCTS[1]; // Luxury Sindoor
    const cleanserProduct = GLAMIRK_PRODUCTS[3]; // Balm To Water 50g

    let matchedLipShade = lipProduct.shades?.[0]; // Default Royal Rose
    let matchedSindoorShade = sindoorProduct.shades?.[0]; // Ceremonial Scarlet

    if (undertone === 'Warm') {
      matchedLipShade = occasion === 'Date Night & Soirée' 
        ? lipProduct.shades?.find(s => s.id === 'shade-crimson-sovereign') 
        : lipProduct.shades?.find(s => s.id === 'shade-spice-velvet') || lipProduct.shades?.[1];
      matchedSindoorShade = sindoorProduct.shades?.find(s => s.id === 'sindoor-scarlet-glam');
    } else if (undertone === 'Neutral') {
      matchedLipShade = occasion === 'Everyday Glamour'
        ? lipProduct.shades?.find(s => s.id === 'shade-royal-rose')
        : lipProduct.shades?.find(s => s.id === 'shade-crimson-sovereign');
      matchedSindoorShade = sindoorProduct.shades?.find(s => s.id === 'sindoor-scarlet-glam');
    } else if (undertone === 'Cool') {
      matchedLipShade = lipProduct.shades?.find(s => s.id === 'shade-plum-opulence') || lipProduct.shades?.[4];
      matchedSindoorShade = sindoorProduct.shades?.find(s => s.id === 'sindoor-maroon-heritage');
    } else if (undertone === 'Olive') {
      matchedLipShade = lipProduct.shades?.find(s => s.id === 'shade-spice-velvet') || lipProduct.shades?.[1];
      matchedSindoorShade = sindoorProduct.shades?.find(s => s.id === 'sindoor-scarlet-glam');
    }

    return {
      lipProduct,
      matchedLipShade: matchedLipShade || lipProduct.shades![0],
      sindoorProduct,
      matchedSindoorShade: matchedSindoorShade || sindoorProduct.shades![0],
      cleanserProduct
    };
  };

  const matched = getMatchedShade();

  const resetQuiz = () => {
    setStep(1);
    setSkinDepth('Medium Wheatish');
    setUndertone('Warm');
    setOccasion('Everyday Glamour');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0B0B0B]/75 backdrop-blur-xs transition-opacity"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl max-w-2xl w-full z-10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-[#E8D5A8] flex items-center justify-between bg-[#FAF9F6]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#C9972B]" />
                <span className="font-cinzel text-lg tracking-wider text-[#121212] font-semibold">
                  GLAMIRK SHADE INTELLIGENCE
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-[#6B6B6B] hover:text-[#121212] transition-colors rounded-full"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Content */}
            <div className="p-6 sm:p-8 space-y-6">
              
              {/* Progress Tracker */}
              {step < 4 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#6B6B6B] uppercase tracking-wider">
                    <span>Step {step} of 3</span>
                    <span>
                      {step === 1 && 'Skin Depth'}
                      {step === 2 && 'Undertone Profile'}
                      {step === 3 && 'Primary Occasion'}
                    </span>
                  </div>
                  <div className="w-full bg-[#E8D5A8] h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0B0B0B] h-full transition-all duration-300"
                      style={{ width: `${(step / 3) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Step 1: Skin Depth */}
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <h3 className="font-serif text-2xl text-[#121212]">
                      Select Your Complexion Depth
                    </h3>
                    <p className="text-xs text-[#6B6B6B]">
                      Formulated to respect and illuminate the natural depth of Indian complexions.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {skinDepthOptions.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setSkinDepth(opt.label)}
                        className={`p-4 text-left border transition-all ${
                          skinDepth === opt.label
                            ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-xs'
                            : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#C9972B]'
                        }`}
                      >
                        <span className="font-serif text-base text-[#121212] font-medium block">
                          {opt.label}
                        </span>
                        <span className="text-[11.5px] text-[#6B6B6B] block mt-1">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      onClick={() => setStep(2)}
                      className="px-6 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] flex items-center gap-2"
                    >
                      <span>NEXT: UNDERTONE</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Undertone */}
              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <h3 className="font-serif text-2xl text-[#121212]">
                      Identify Your Undertone
                    </h3>
                    <p className="text-xs text-[#6B6B6B]">
                      The secret to lipsticks and sindoor that never look ashy or washed out.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {undertoneOptions.map((opt) => (
                      <button
                        key={opt.tone}
                        onClick={() => setUndertone(opt.tone)}
                        className={`p-4 text-left border transition-all ${
                          undertone === opt.tone
                            ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-xs'
                            : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#C9972B]'
                        }`}
                      >
                        <span className="font-serif text-base text-[#121212] font-medium block">
                          {opt.title}
                        </span>
                        <span className="text-[11.5px] text-[#6B6B6B] block mt-1">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-4 flex justify-between">
                    <button
                      onClick={() => setStep(1)}
                      className="px-4 py-2 text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider"
                    >
                      BACK
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      className="px-6 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] flex items-center gap-2"
                    >
                      <span>NEXT: OCCASION</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Occasion */}
              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <h3 className="font-serif text-2xl text-[#121212]">
                      Choose Your Primary Ritual
                    </h3>
                    <p className="text-xs text-[#6B6B6B]">
                      How do you intend to express your signature Glamirk look?
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    {occasionOptions.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setOccasion(opt.label)}
                        className={`w-full p-4 text-left border transition-all ${
                          occasion === opt.label
                            ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-xs'
                            : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#C9972B]'
                        }`}
                      >
                        <span className="font-serif text-base text-[#121212] font-medium block">
                          {opt.label}
                        </span>
                        <span className="text-[11.5px] text-[#6B6B6B] block mt-0.5">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-4 flex justify-between">
                    <button
                      onClick={() => setStep(2)}
                      className="px-4 py-2 text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider"
                    >
                      BACK
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className="px-8 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] flex items-center gap-2 shadow-md"
                    >
                      <Sparkles className="w-4 h-4 text-[#C9972B]" />
                      <span>GENERATE SHADE PROFILE</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Results & Personalized Curation */}
              {step === 4 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  <div className="text-center space-y-1 pb-2 border-b border-[#E8D5A8]">
                    <span className="text-[10px] tracking-[0.24em] uppercase text-[#C9972B] font-semibold">
                      YOUR BESPOKE MATCH
                    </span>
                    <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
                      {skinDepth} • {undertone} Undertone
                    </h3>
                    <p className="text-xs text-[#6B6B6B]">
                      Calibrated for {occasion}. Here are your signature formulations:
                    </p>
                  </div>

                  {/* Recommendations Cards */}
                  <div className="space-y-3">
                    
                    {/* Lipstick Match */}
                    <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full border border-[#0B0B0B]/15 shadow-inner flex-shrink-0"
                          style={{ backgroundColor: matched.matchedLipShade.hex }}
                        />
                        <div>
                          <span className="text-[9.5px] uppercase tracking-wider text-[#C9972B] font-semibold block">
                            RECOMMENDED LIP SHADE
                          </span>
                          <h4 className="font-serif text-base text-[#121212] font-medium">
                            Matte Liquid — {matched.matchedLipShade.name}
                          </h4>
                          <p className="text-[11px] text-[#6B6B6B]">
                            {matched.matchedLipShade.description}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => onAddToBag(matched.lipProduct, matched.matchedLipShade)}
                        className="px-3.5 py-2 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex-shrink-0 flex items-center gap-1"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>ADD (₹{matched.lipProduct.price})</span>
                      </button>
                    </div>

                    {/* Sindoor Match */}
                    <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full border border-[#0B0B0B]/15 shadow-inner flex-shrink-0"
                          style={{ backgroundColor: matched.matchedSindoorShade.hex }}
                        />
                        <div>
                          <span className="text-[9.5px] uppercase tracking-wider text-[#C9972B] font-semibold block">
                            CEREMONIAL ACCENT
                          </span>
                          <h4 className="font-serif text-base text-[#121212] font-medium">
                            Luxury Sindoor — {matched.matchedSindoorShade.name}
                          </h4>
                          <p className="text-[11px] text-[#6B6B6B]">
                            Precision applicator for smudge-resistant ceremonial elegance.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => onAddToBag(matched.sindoorProduct, matched.matchedSindoorShade)}
                        className="px-3.5 py-2 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex-shrink-0 flex items-center gap-1"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>ADD (₹{matched.sindoorProduct.price})</span>
                      </button>
                    </div>

                    {/* Cleanser Reset */}
                    <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#FAF9F6] flex items-center justify-center flex-shrink-0 border border-[#E8D5A8]">
                          <span className="font-serif text-xs font-medium">50g</span>
                        </div>
                        <div>
                          <span className="text-[9.5px] uppercase tracking-wider text-[#C9972B] font-semibold block">
                            PURIFYING RESET RITUAL
                          </span>
                          <h4 className="font-serif text-base text-[#121212] font-medium">
                            Balm To Water Cleanser (50g Ritual Jar)
                          </h4>
                          <p className="text-[11px] text-[#6B6B6B]">
                            Solid balm to milky water transformation for clean, supple skin.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => onAddToBag(matched.cleanserProduct, undefined, '50g')}
                        className="px-3.5 py-2 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex-shrink-0 flex items-center gap-1"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>ADD (₹{matched.cleanserProduct.price})</span>
                      </button>
                    </div>

                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-[#E8D5A8] flex items-center justify-between">
                    <button
                      onClick={resetQuiz}
                      className="text-xs text-[#6B6B6B] hover:text-[#121212] flex items-center gap-1.5 uppercase tracking-wider"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>RETAKE MATCH</span>
                    </button>

                    <button
                      onClick={() => {
                        onAddToBag(matched.lipProduct, matched.matchedLipShade);
                        onAddToBag(matched.sindoorProduct, matched.matchedSindoorShade);
                        onAddToBag(matched.cleanserProduct, undefined, '50g');
                        onClose();
                      }}
                      className="px-6 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] flex items-center gap-2 shadow-md"
                    >
                      <ShoppingBag className="w-4 h-4 text-[#C9972B]" />
                      <span>ADD COMPLETE MATCH SET (₹{matched.lipProduct.price! + matched.sindoorProduct.price! + matched.cleanserProduct.price!})</span>
                    </button>
                  </div>
                </motion.div>
              )}

            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
