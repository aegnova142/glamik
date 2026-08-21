import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, ArrowRight, ArrowLeft, Check, ShoppingBag, Eye, BookOpen, RotateCcw } from 'lucide-react';
import { GLAMIRK_QUIZ_QUESTIONS, GLAMIRK_QUIZ_RESULTS } from '../data/editorial';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { Product, Shade } from '../types';
import { trackEvent } from '../utils/analytics';

interface BeautyQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProduct: (product: Product) => void;
  onOpenLook: (lookId: string) => void;
  onOpenGuide: (guideId: string) => void;
  onAddToCart: (product: Product, shade?: Shade) => void;
}

export const BeautyQuizModal: React.FC<BeautyQuizModalProps> = ({
  isOpen,
  onClose,
  onOpenProduct,
  onOpenLook,
  onOpenGuide,
  onAddToCart,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [isCompleted, setIsCompleted] = useState(false);

  if (!isOpen) return null;

  const currentQ = GLAMIRK_QUIZ_QUESTIONS[currentStep];

  const handleSelectOption = (optionId: string) => {
    const updated = { ...selectedAnswers, [currentQ.id]: optionId };
    setSelectedAnswers(updated);

    if (currentStep < GLAMIRK_QUIZ_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsCompleted(true);
      trackEvent('quiz_complete', { answers: updated });
    }
  };

  const handleReset = () => {
    setSelectedAnswers({});
    setCurrentStep(0);
    setIsCompleted(false);
  };

  // Determine quiz result key from aesthetic answer
  const aestheticKey = selectedAnswers['quiz-aesthetic'] || 'natural-refined';
  const result = GLAMIRK_QUIZ_RESULTS[aestheticKey] || GLAMIRK_QUIZ_RESULTS['natural-refined'];
  const matchedProduct = GLAMIRK_PRODUCTS.find((p) => p.id === result.matchedProductId) || GLAMIRK_PRODUCTS[0];
  const matchedShade = (matchedProduct && result.matchedShadeId)
    ? matchedProduct.shades?.find((s) => s.id === result.matchedShadeId)
    : matchedProduct.shades?.[0];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        />

        {/* Quiz Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative max-w-2xl w-full bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl z-50 overflow-hidden"
        >
          {/* Top Bar */}
          <div className="p-5 border-b border-[#E8D5A8] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C9972B]" />
              <span className="text-[11px] font-semibold tracking-[0.22em] uppercase text-[#C9972B]">
                DISCOVERY ATELIER
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#121212] hover:text-[#C9972B] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isCompleted ? (
            <div className="p-6 sm:p-10 space-y-8">
              {/* Progress Indicator */}
              <div className="flex items-center justify-between text-xs text-[#6B6B6B] border-b border-[#E8D5A8] pb-3">
                <span className="font-serif italic">Question 0{currentStep + 1} of 0{GLAMIRK_QUIZ_QUESTIONS.length}</span>
                <span className="uppercase tracking-widest text-[10px] font-semibold">
                  {Math.round(((currentStep + 1) / GLAMIRK_QUIZ_QUESTIONS.length) * 100)}% COMPLETED
                </span>
              </div>

              {/* Question Header */}
              <div className="space-y-2 text-center">
                <h3 className="font-serif text-2xl sm:text-3xl text-[#121212] leading-tight">
                  {currentQ.question}
                </h3>
                <p className="text-xs sm:text-sm text-[#6B6B6B]">
                  {currentQ.subtitle}
                </p>
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentQ.options.map((opt) => {
                  const isSelected = selectedAnswers[currentQ.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectOption(opt.id)}
                      className={`p-5 text-left border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-2 ${
                        isSelected
                          ? 'bg-[#0B0B0B] text-[#FAF9F6] border-[#0B0B0B] shadow-md'
                          : 'bg-[#FAF9F6] border-[#E8D5A8] text-[#121212] hover:border-[#C9972B]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif text-base font-medium">
                          {opt.label}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-[#C9972B]" />}
                      </div>
                      {opt.description && (
                        <p className={`text-xs ${isSelected ? 'text-[#C9972B]' : 'text-[#6B6B6B]'}`}>
                          {opt.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Back Button */}
              {currentStep > 0 && (
                <div className="pt-2 flex justify-start">
                  <button
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="flex items-center gap-1.5 text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>PREVIOUS QUESTION</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Results Screen */
            <div className="p-6 sm:p-10 space-y-8">
              <div className="text-center space-y-2">
                <span className="text-[10.5px] font-bold tracking-[0.24em] uppercase text-[#C9972B]">
                  YOUR CURATED GLAM EDIT
                </span>
                <h3 className="font-serif text-3xl sm:text-4xl text-[#121212]">
                  {result.title}
                </h3>
                <p className="text-xs font-semibold tracking-wider uppercase text-[#6B6B6B]">
                  {result.archetype}
                </p>
              </div>

              <div className="p-5 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#6B6B6B] leading-relaxed font-light">
                {result.description}
              </div>

              {/* Matched Product Callout */}
              <div className="p-5 bg-[#FAF9F6] border border-[#C9972B] shadow-md flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-20 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                    <img
                      src={matchedProduct.images.primary}
                      alt={matchedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9.5px] font-bold uppercase tracking-widest text-[#C9972B]">
                      SIGNATURE FORMULATION MATCH
                    </span>
                    <h4 className="font-serif text-base text-[#121212] font-medium">
                      {matchedProduct.name}
                    </h4>
                    {matchedShade && (
                      <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B]">
                        <span
                          className="w-3 h-3 rounded-full border border-black/10 inline-block"
                          style={{ backgroundColor: matchedShade.hex }}
                        />
                        <span>Shade: <strong>{matchedShade.name}</strong></span>
                      </div>
                    )}
                    <span className="font-serif text-xs font-semibold text-[#121212] block">
                      ₹{matchedProduct.price}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onAddToCart(matchedProduct, matchedShade);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-[11px] font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>ADD TO BAG</span>
                </button>
              </div>

              {/* Complementary Actions */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => {
                    onClose();
                    onOpenLook(result.matchedLookId);
                  }}
                  className="py-3 bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212] text-[11px] font-semibold uppercase tracking-wider hover:bg-[#E8D5A8] transition-colors"
                >
                  EXPLORE MATCHED LOOK
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onOpenGuide(result.matchedGuideId);
                  }}
                  className="py-3 bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212] text-[11px] font-semibold uppercase tracking-wider hover:bg-[#E8D5A8] transition-colors"
                >
                  READ BEAUTY GUIDE
                </button>
              </div>

              <div className="pt-2 text-center">
                <button
                  onClick={handleReset}
                  className="text-xs text-[#6B6B6B] hover:text-[#121212] inline-flex items-center gap-1 uppercase tracking-wider"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retake Quiz</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
