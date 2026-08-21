import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  ArrowRight,
  ShoppingBag,
  CheckCircle2,
  Camera,
  Star,
  Play,
  Share2,
} from 'lucide-react';
import { Campaign, Product, Shade } from '../types';
import { GLAMIRK_CAMPAIGNS } from '../data/editorial';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { updatePageSeo } from '../utils/seo';
import { trackEvent } from '../utils/analytics';

interface CampaignLandingPageProps {
  campaignId?: string;
  onOpenProduct: (product: Product) => void;
  onOpenLook: (lookId: string) => void;
  onOpenTryOn: (productId?: string, shadeId?: string) => void;
  onAddToCart: (product: Product, shade?: Shade) => void;
  onOpenArticle: (articleId: string) => void;
}

export const CampaignLandingPage: React.FC<CampaignLandingPageProps> = ({
  campaignId,
  onOpenProduct,
  onOpenLook,
  onOpenTryOn,
  onAddToCart,
  onOpenArticle,
}) => {
  const campaign =
    GLAMIRK_CAMPAIGNS.find((c) => c.id === campaignId) ||
    GLAMIRK_CAMPAIGNS[0];

  useEffect(() => {
    updatePageSeo({
      title: `${campaign.title} | Glamirk Luxury Campaign`,
      description: `${campaign.subtitle} — ${campaign.tagline}`,
      ogImage: campaign.heroImage,
    });
    trackEvent('content_view', { section: 'campaign_page', campaignId: campaign.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [campaign.id]);

  const featuredProducts = GLAMIRK_PRODUCTS.filter((p) =>
    campaign.featuredProductIds.includes(p.id)
  );

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212] pb-24">
      {/* Campaign Cinematic Hero */}
      <section className="relative bg-[#0B0B0B] text-[#FAF9F6] min-h-[70vh] flex items-center justify-center overflow-hidden border-b border-[#0B0B0B]">
        <img
          src={campaign.heroImage}
          alt={campaign.title}
          className="absolute inset-0 w-full h-full object-cover opacity-60 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] via-[#0B0B0B]/60 to-black/40" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-24 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <span className="px-3.5 py-1.5 bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/50 text-[10.5px] font-bold tracking-[0.26em] uppercase">
              {campaign.themeBadge}
            </span>

            <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl text-[#FAF9F6] tracking-tight leading-none pt-2">
              {campaign.title}
            </h1>

            <p className="font-serif italic text-xl sm:text-2xl text-[#E8D5A8] max-w-2xl mx-auto">
              {campaign.subtitle}
            </p>

            <p className="text-sm sm:text-base text-[#C9972B] max-w-xl mx-auto font-light leading-relaxed">
              {campaign.tagline}
            </p>

            <div className="pt-6 flex flex-wrap items-center justify-center gap-4">
              <a
                href="#campaign-products"
                className="px-8 py-4 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#E8D5A8] transition-colors cursor-pointer"
              >
                SHOP THE COLLECTION
              </a>
              {campaign.lookId && (
                <button
                  onClick={() => onOpenLook(campaign.lookId!)}
                  className="px-8 py-4 bg-black/40 border border-[#FAF9F6]/30 text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-black/60 transition-colors cursor-pointer"
                >
                  EXPLORE THE LOOK
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Brand Story & Why It Exists */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-4">
          <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B] block">
            THE ATELIER VISION
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#121212]">
            Why This Edit Exists
          </h2>
          <p className="text-sm text-[#6B6B6B] leading-relaxed font-light">
            {campaign.brandStory}
          </p>
          <div className="pt-2">
            <blockquote className="font-serif text-lg italic text-[#121212] border-l-2 border-[#C9972B] pl-4 py-1">
              {campaign.whyItExists}
            </blockquote>
          </div>
        </div>

        <div className="relative aspect-[4/5] bg-[#FAF9F6] overflow-hidden border border-[#E8D5A8] shadow-xl">
          <img
            src="https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=85"
            alt="Campaign Editorial"
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* 3-Step Beauty Ritual */}
      {campaign.ritualSteps && (
        <section className="bg-[#FAF9F6] border-y border-[#E8D5A8] py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
            <div className="text-center space-y-2">
              <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#C9972B]">
                APPLICATION HARMONY
              </span>
              <h3 className="font-serif text-3xl text-[#121212]">
                The Three-Step Campaign Ritual
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {campaign.ritualSteps.map((step, idx) => (
                <div key={idx} className="bg-[#FAF9F6] border border-[#E8D5A8] p-6 space-y-3">
                  <div className="font-serif text-3xl text-[#C9972B] font-semibold">{step.step}</div>
                  <h4 className="font-serif text-lg text-[#121212]">{step.title}</h4>
                  <p className="text-xs text-[#6B6B6B] leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products Collection */}
      <section id="campaign-products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-12">
        <div className="text-center space-y-2">
          <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            THE FORMULATIONS
          </span>
          <h3 className="font-serif text-3xl sm:text-4xl text-[#121212]">
            Featured in {campaign.title}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {featuredProducts.map((product) => (
            <div
              key={product.id}
              className="group bg-[#FAF9F6] border border-[#E8D5A8] p-6 hover:border-[#C9972B] transition-all flex flex-col justify-between"
            >
              <div
                onClick={() => onOpenProduct(product)}
                className="cursor-pointer space-y-4"
              >
                <div className="aspect-[3/4] bg-[#FAF9F6] overflow-hidden relative">
                  <img
                    src={product.images.primary}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  {product.tag && (
                    <div className="absolute top-3 left-3 bg-[#0B0B0B] text-[#FAF9F6] text-[9.5px] font-semibold px-2.5 py-1 tracking-widest uppercase">
                      {product.tag}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="font-serif text-lg text-[#121212] group-hover:text-[#C9972B] transition-colors">
                    {product.name}
                  </h4>
                  <p className="text-xs text-[#6B6B6B] line-clamp-2">
                    {product.subtitle}
                  </p>
                  <span className="font-serif text-base font-semibold text-[#121212] block pt-1">
                    ₹{product.price}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E8D5A8] mt-4 flex gap-2">
                <button
                  onClick={() => onAddToCart(product, product.shades?.[0])}
                  className="flex-grow py-3 bg-[#0B0B0B] text-[#FAF9F6] text-[11px] font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>ADD TO BAG</span>
                </button>
                <button
                  onClick={() => onOpenTryOn(product.id)}
                  className="px-3 py-3 bg-[#FAF9F6] text-[#121212] text-xs hover:bg-[#E8D5A8] transition-colors cursor-pointer"
                  title="Try On"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Related Journal Story Trigger */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="bg-[#0B0B0B] text-[#FAF9F6] p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6 border border-[#171717]">
          <div className="space-y-2 text-center md:text-left">
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
              READ THE EDITORIAL
            </span>
            <h4 className="font-serif text-2xl text-[#FAF9F6]">
              The Story Behind The Formulation
            </h4>
            <p className="text-xs text-[#C9972B] max-w-md font-light">
              Explore our laboratory insights and color theory testing in The Glamirk Journal.
            </p>
          </div>
          <button
            onClick={() => onOpenArticle('find-your-signature-shade')}
            className="px-8 py-3.5 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#E8D5A8] transition-colors cursor-pointer flex-shrink-0"
          >
            READ JOURNAL STORY
          </button>
        </div>
      </section>
    </div>
  );
};
