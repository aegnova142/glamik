import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Sparkles,
  ArrowRight,
  ShoppingBag,
  Camera,
  Play,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { BeautyGuide, Product, Shade } from '../../types';
import { GLAMIRK_BEAUTY_GUIDES } from '../../data/editorial';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { updatePageSeo } from '../../utils/seo';
import { trackEvent } from '../../utils/analytics';
import { useCMS } from '../../context/CMSContext';

interface BeautyGuidesPageProps {
  initialGuideId?: string;
  onOpenProduct: (product: Product) => void;
  onOpenTryOn: (productId?: string, shadeId?: string) => void;
  onOpenShadeFinder: () => void;
  onAddToCart: (product: Product, shade?: Shade, size?: string) => void;
  onOpenArticle: (articleId: string) => void;
}

export const BeautyGuidesPage: React.FC<BeautyGuidesPageProps> = ({
  initialGuideId,
  onOpenProduct,
  onOpenTryOn,
  onOpenShadeFinder,
  onAddToCart,
  onOpenArticle,
}) => {
  const [selectedGuideId, setSelectedGuideId] = useState<string>(
    initialGuideId || GLAMIRK_BEAUTY_GUIDES[0].id
  );

  const activeGuide =
    GLAMIRK_BEAUTY_GUIDES.find((g) => g.id === selectedGuideId) ||
    GLAMIRK_BEAUTY_GUIDES[0];

  useEffect(() => {
    updatePageSeo({
      title: `${activeGuide.title} | Glamirk Beauty Guides`,
      description: activeGuide.subtitle || activeGuide.overview,
      ogImage: activeGuide.heroImage,
    });
    trackEvent('guide_view', { guideId: activeGuide.id, title: activeGuide.title });
  }, [activeGuide.id]);

  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const activeProducts = catalogProducts.filter((p) =>
    activeGuide.shoppableProductIds.includes(p.id)
  );

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212] pb-24 pt-8">
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 text-center border-b border-[#E8D5A8]">
        <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B] block mb-2">
          VISUAL MASTERCLASSES
        </span>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#121212] tracking-tight mb-3">
          BEAUTY GUIDES
        </h1>
        <p className="font-serif italic text-lg sm:text-xl text-[#6B6B6B] max-w-xl mx-auto">
          Scientific precision, color theory, and step-by-step cosmetic rituals.
        </p>

        {/* Guides Tab Selector */}
        <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
          {GLAMIRK_BEAUTY_GUIDES.map((guide) => {
            const isSelected = guide.id === activeGuide.id;
            return (
              <button
                key={guide.id}
                onClick={() => setSelectedGuideId(guide.id)}
                className={`px-5 py-3 text-xs font-semibold tracking-[0.16em] uppercase transition-all duration-300 rounded-none cursor-pointer flex items-center gap-2 ${
                  isSelected
                    ? 'bg-[#0B0B0B] text-[#FAF9F6] shadow-md'
                    : 'bg-[#FAF9F6] text-[#6B6B6B] hover:bg-[#E8D5A8] hover:text-[#121212]'
                }`}
              >
                <span>{guide.category}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Guide View */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeGuide.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
            className="space-y-16"
          >
            {/* Guide Hero Card */}
            <div className="bg-[#0B0B0B] text-[#FAF9F6] grid grid-cols-1 lg:grid-cols-12 border border-[#171717] shadow-2xl overflow-hidden">
              <div className="lg:col-span-6 p-8 sm:p-12 lg:p-16 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/40 text-[10px] font-semibold tracking-widest uppercase">
                      {activeGuide.category}
                    </span>
                    <span className="text-xs text-[#C9972B] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {activeGuide.readTime}
                    </span>
                  </div>

                  <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-tight">
                    {activeGuide.title}
                  </h2>

                  <p className="text-sm sm:text-base text-[#C9972B] font-light leading-relaxed">
                    {activeGuide.overview}
                  </p>
                </div>

                <div className="pt-6 flex flex-wrap items-center gap-4">
                  <button
                    onClick={onOpenShadeFinder}
                    className="px-6 py-3.5 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#E8D5A8] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-[#C9972B]" />
                    <span>AI SHADE DIAGNOSTIC</span>
                  </button>
                  <button
                    onClick={() => onOpenTryOn('matte-liquid-lipstick-collection')}
                    className="px-6 py-3.5 bg-[#0B0B0B] border border-[#171717] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-[#C9972B]" />
                    <span>LIVE VIRTUAL TRY-ON</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6 relative min-h-[350px] lg:min-h-full bg-[#FAF9F6]">
                <img
                  src={activeGuide.heroImage}
                  alt={activeGuide.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Step-by-Step Educational Sequence */}
            <div className="space-y-8">
              <div className="border-b border-[#E8D5A8] pb-4">
                <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B] block">
                  THE SEQUENCE
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
                  Step-by-Step Masterclass
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {activeGuide.steps.map((step) => {
                  const stepProduct = step.recommendedProductId
                    ? catalogProducts.find((p) => p.id === step.recommendedProductId)
                    : null;
                  const stepShade = (stepProduct && step.recommendedShadeId)
                    ? stepProduct.shades?.find((s) => s.id === step.recommendedShadeId)
                    : stepProduct?.shades?.[0];

                  return (
                    <div
                      key={step.stepNumber}
                      className="bg-[#FAF9F6] border border-[#E8D5A8] p-6 flex flex-col justify-between space-y-6 shadow-xs hover:border-[#C9972B] transition-all"
                    >
                      <div className="space-y-4">
                        <div className="w-10 h-10 bg-[#0B0B0B] text-[#FAF9F6] flex items-center justify-center font-serif text-lg font-bold">
                          0{step.stepNumber}
                        </div>

                        <h4 className="font-serif text-xl text-[#121212] font-medium leading-snug">
                          {step.title}
                        </h4>

                        <p className="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed">
                          {step.description}
                        </p>

                        {step.proTip && (
                          <div className="p-3 bg-[#FAF9F6] border border-[#E8D5A8] text-[11px] text-[#6B6B6B] space-y-1">
                            <strong className="text-[#C9972B] uppercase tracking-wider block font-semibold">
                              PRO TIP
                            </strong>
                            <p>{step.proTip}</p>
                          </div>
                        )}
                      </div>

                      {stepProduct && (
                        <div className="pt-4 border-t border-[#E8D5A8] space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-14 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                              <img
                                src={stepProduct.images.primary}
                                alt={stepProduct.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[9.5px] uppercase font-bold tracking-wider text-[#C9972B] block">
                                RECOMMENDED STEP FORMULATION
                              </span>
                              <h5 className="font-serif text-xs text-[#121212] font-medium">
                                {stepProduct.name}
                              </h5>
                              {stepShade && (
                                <span className="text-[10px] text-[#6B6B6B] block">
                                  Shade: {stepShade.name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => onAddToCart(stepProduct, stepShade)}
                              className="flex-grow py-2 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <ShoppingBag className="w-3 h-3 text-[#C9972B]" />
                              <span>ADD STEP</span>
                            </button>
                            <button
                              onClick={() => onOpenTryOn(stepProduct.id, stepShade?.id)}
                              className="px-3 py-2 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-[10px] font-semibold uppercase hover:bg-[#0B0B0B] hover:text-[#FAF9F6] transition-colors cursor-pointer"
                            >
                              TRY ON
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Shoppable Formulations in this Guide */}
            <div className="bg-[#FAF9F6] border border-[#E8D5A8] p-8 sm:p-10 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#C9972B] block">
                    THE COMPOSITION
                  </span>
                  <h3 className="font-serif text-2xl text-[#121212]">
                    Formulations Featured in this Masterclass
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeProducts.map((product) => (
                  <div
                    key={product.id}
                    className="bg-[#FAF9F6] border border-[#E8D5A8] p-4 flex gap-4 items-center justify-between"
                  >
                    <div
                      onClick={() => onOpenProduct(product)}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <div className="w-16 h-20 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                        <img
                          src={product.images.primary}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-serif text-sm text-[#121212] group-hover:text-[#C9972B] transition-colors">
                          {product.name}
                        </h4>
                        <span className="text-xs text-[#6B6B6B] font-serif font-medium block">
                          ₹{product.price}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onAddToCart(product, product.shades?.[0])}
                      className="p-2.5 bg-[#0B0B0B] text-[#FAF9F6] hover:bg-[#0B0B0B] transition-colors cursor-pointer"
                      title="Add to bag"
                    >
                      <ShoppingBag className="w-4 h-4 text-[#C9972B]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Read Further in the Journal */}
            <div className="p-8 bg-[#0B0B0B] text-[#FAF9F6] border border-[#171717] flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                  IN-DEPTH COLOR THEORY
                </span>
                <h4 className="font-serif text-2xl text-[#FAF9F6]">
                  Read "Find Your Signature Shade" in The Journal
                </h4>
                <p className="text-xs text-[#C9972B] max-w-lg font-light">
                  Delve deeper into optical contrast laws, pigment saturation chemistry, and carotenoid balance.
                </p>
              </div>
              <button
                onClick={() => onOpenArticle('find-your-signature-shade')}
                className="px-8 py-3.5 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#E8D5A8] transition-colors cursor-pointer flex-shrink-0"
              >
                READ JOURNAL STORY
              </button>
            </div>

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
