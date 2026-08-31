import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, Star, ShoppingBag, BookOpen } from 'lucide-react';
import { Product, Look, JournalArticle } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { GLAMIRK_LOOKS } from '../../data/looks';
import { GLAMIRK_JOURNAL_ARTICLES_EXTENDED } from '../../data/editorial';
import { useCMS } from '../../context/CMSContext';

interface TrendingDiscoveryProps {
  onOpenProduct: (product: Product) => void;
  onOpenLook: (lookId: string) => void;
  onOpenArticle: (articleId: string) => void;
}

export const TrendingDiscovery: React.FC<TrendingDiscoveryProps> = ({
  onOpenProduct,
  onOpenLook,
  onOpenArticle,
}) => {
  const { looks, products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const trendingProduct = catalogProducts[0];
  const trendingLook = (looks && looks.length > 0 ? looks : GLAMIRK_LOOKS)[0];
  const trendingArticle = GLAMIRK_JOURNAL_ARTICLES_EXTENDED[0];

  return (
    <section className="py-16 sm:py-24 bg-white border-t border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E8D5A8] pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full mb-2">
              <Sparkles className="w-3 h-3 text-[#F05A7E]" />
              <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                Curated Discovery
              </span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#121212]">
              Trending Now & Editor’s Picks
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-sm">
            The season’s most explored formulations, editorial narratives, and beauty statements.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          
          {/* Card 1: Trending Formulation */}
          <div
            onClick={() => onOpenProduct(trendingProduct)}
            className="group cursor-pointer bg-white rounded-3xl border border-[#E8D5A8] p-5 sm:p-6 hover:shadow-[0_12px_30px_rgba(240, 90, 126,0.12)] hover:border-[#FCE8ED] transition-all duration-300 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#F05A7E] px-2.5 py-0.5 bg-[#FCE8ED] rounded-full inline-block">
                Iconic Formulation
              </span>
              <div className="aspect-[4/3] bg-[#FCE8ED] rounded-2xl overflow-hidden flex items-center justify-center">
                <img
                  src={trendingProduct.images.primary}
                  alt={trendingProduct.name}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <h3 className="text-lg font-bold text-[#121212] group-hover:text-[#F05A7E] transition-colors leading-snug">
                {trendingProduct.name}
              </h3>
              <p className="text-xs text-[#6B6B6B] line-clamp-2">
                {trendingProduct.subtitle}
              </p>
            </div>
            <div className="pt-4 border-t border-[#E8D5A8] mt-4 flex items-center justify-between text-xs font-bold text-[#F05A7E]">
              <span>Shop Product</span>
              <ArrowRight className="w-4 h-4 text-[#F05A7E] group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Trending Look */}
          <div
            onClick={() => onOpenLook(trendingLook.id)}
            className="group cursor-pointer bg-white rounded-3xl border border-[#E8D5A8] p-5 sm:p-6 hover:shadow-[0_12px_30px_rgba(240, 90, 126,0.12)] hover:border-[#FCE8ED] transition-all duration-300 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#F05A7E] px-2.5 py-0.5 bg-[#FCE8ED] rounded-full inline-block">
                Featured Beauty Edit
              </span>
              <div className="aspect-[4/3] bg-[#FCE8ED] rounded-2xl overflow-hidden flex items-center justify-center">
                <img
                  src={trendingLook.image}
                  alt={trendingLook.title}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <h3 className="text-lg font-bold text-[#121212] group-hover:text-[#F05A7E] transition-colors leading-snug">
                {trendingLook.title}
              </h3>
              <p className="text-xs text-[#6B6B6B] line-clamp-2">
                {trendingLook.tagline}
              </p>
            </div>
            <div className="pt-4 border-t border-[#E8D5A8] mt-4 flex items-center justify-between text-xs font-bold text-[#F05A7E]">
              <span>Explore The Look</span>
              <ArrowRight className="w-4 h-4 text-[#F05A7E] group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: Top Journal Story */}
          <div
            onClick={() => onOpenArticle(trendingArticle.id)}
            className="group cursor-pointer bg-white rounded-3xl border border-[#E8D5A8] p-5 sm:p-6 hover:shadow-[0_12px_30px_rgba(240, 90, 126,0.12)] hover:border-[#FCE8ED] transition-all duration-300 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#F05A7E] px-2.5 py-0.5 bg-[#FCE8ED] rounded-full inline-block">
                Masterclass Story
              </span>
              <div className="aspect-[4/3] bg-[#FCE8ED] rounded-2xl overflow-hidden">
                <img
                  src={trendingArticle.image}
                  alt={trendingArticle.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <h3 className="text-lg font-bold text-[#121212] group-hover:text-[#F05A7E] transition-colors leading-snug">
                {trendingArticle.title}
              </h3>
              <p className="text-xs text-[#6B6B6B] line-clamp-2">
                {trendingArticle.excerpt}
              </p>
            </div>
            <div className="pt-4 border-t border-[#E8D5A8] mt-4 flex items-center justify-between text-xs font-bold text-[#F05A7E]">
              <span>Read Masterclass</span>
              <ArrowRight className="w-4 h-4 text-[#F05A7E] group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

