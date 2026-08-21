import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Clock, BookOpen, Sparkles, Share2, ArrowUpRight } from 'lucide-react';
import { JournalArticle, Product } from '../types';
import { GLAMIRK_JOURNAL_HERO_ARTICLE, GLAMIRK_JOURNAL_ARTICLES_EXTENDED } from '../data/editorial';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { updatePageSeo } from '../utils/seo';
import { trackEvent } from '../utils/analytics';

interface JournalPageProps {
  initialCategory?: string;
  onOpenArticle: (articleId: string) => void;
  onOpenProduct: (product: Product) => void;
  onOpenGuides: (guideId?: string) => void;
  onOpenQuiz: () => void;
}

const CATEGORIES = [
  'ALL',
  'BEAUTY GUIDES',
  'MAKEUP',
  'SKIN',
  'GLAMIRK STORIES',
  'TRENDS',
];

export const JournalPage: React.FC<JournalPageProps> = ({
  initialCategory = 'ALL',
  onOpenArticle,
  onOpenProduct,
  onOpenGuides,
  onOpenQuiz,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'ALL');

  useEffect(() => {
    updatePageSeo({
      title: 'The Glamirk Journal | Luxury Beauty Editorials & Guides',
      description: 'Explore curated beauty guides, color theory masterclasses, and formulation stories calibrated for South Asian complexions.',
    });
    trackEvent('content_view', { section: 'journal_index', category: selectedCategory });
  }, [selectedCategory]);

  const filteredArticles = GLAMIRK_JOURNAL_ARTICLES_EXTENDED.filter((art) => {
    if (selectedCategory === 'ALL') return true;
    return art.category === selectedCategory;
  });

  const heroArticle = GLAMIRK_JOURNAL_HERO_ARTICLE;
  const editorsPicks = GLAMIRK_JOURNAL_ARTICLES_EXTENDED.filter((art) => art.isEditorsPick && art.id !== heroArticle.id);

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212] pb-24 pt-8">
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 text-center border-b border-[#E8D5A8]">
        <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B] block mb-2">
          EDITORIAL ATELIER
        </span>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#121212] tracking-tight mb-3">
          THE GLAMIRK JOURNAL
        </h1>
        <p className="font-serif italic text-lg sm:text-xl text-[#6B6B6B] max-w-xl mx-auto">
          Beauty, decoded. Looks, curated.
        </p>

        {/* Category Navigation Strip */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 mt-8 flex-wrap">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase transition-all duration-300 rounded-none cursor-pointer ${
                  isActive
                    ? 'bg-[#0B0B0B] text-[#FAF9F6] shadow-sm'
                    : 'bg-[#FAF9F6] text-[#6B6B6B] hover:bg-[#E8D5A8] hover:text-[#121212]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-20">
        
        {/* Magazine Cinematic Hero Cover (When viewing ALL or matching category) */}
        {(selectedCategory === 'ALL' || selectedCategory === heroArticle.category) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="group relative bg-[#0B0B0B] text-[#FAF9F6] overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-2xl border border-[#171717]"
          >
            {/* Left Narrative Column */}
            <div className="lg:col-span-6 p-8 sm:p-12 lg:p-16 flex flex-col justify-between z-10">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/40 text-[10px] font-semibold tracking-[0.2em] uppercase">
                    FEATURED COVER STORY
                  </span>
                  <div className="flex items-center gap-1 text-xs text-[#C9972B]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{heroArticle.readTime}</span>
                  </div>
                </div>

                <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#FAF9F6] leading-tight tracking-tight pt-2">
                  {heroArticle.title}
                </h2>

                <p className="text-sm sm:text-base text-[#C9972B] font-light leading-relaxed max-w-lg">
                  {heroArticle.excerpt}
                </p>
              </div>

              <div className="pt-8 sm:pt-12 space-y-4">
                <div className="flex items-center gap-4 text-xs text-[#6B6B6B]">
                  <span>By {heroArticle.author}</span>
                  <span>•</span>
                  <span>{heroArticle.date}</span>
                </div>

                <button
                  onClick={() => onOpenArticle(heroArticle.id)}
                  className="inline-flex items-center gap-3 px-8 py-4 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-[0.22em] uppercase hover:bg-[#E8D5A8] transition-colors cursor-pointer group-hover:shadow-lg"
                >
                  <span>READ STORY</span>
                  <ArrowRight className="w-4 h-4 text-[#C9972B] group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right Cinematic Editorial Visual */}
            <div className="lg:col-span-6 relative min-h-[380px] lg:min-h-full overflow-hidden">
              <img
                src={heroArticle.heroImageLarge || heroArticle.image}
                alt={heroArticle.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 ease-out"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 lg:bg-gradient-to-r lg:from-[#0B0B0B] lg:via-transparent lg:to-transparent" />
            </div>
          </motion.div>
        )}

        {/* Discovery Quiz Callout Strip */}
        <div className="bg-[#E8D5A8] border border-[#E8D5A8] p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="space-y-2 text-center md:text-left">
            <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#C9972B] flex items-center justify-center md:justify-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
              DISCOVERY CONCIERGE
            </span>
            <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
              WHAT’S YOUR GLAM?
            </h3>
            <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-md">
              Take our 45-second interactive discovery quiz to reveal your curated cosmetic archetype, signature lip shade, and ritual guide.
            </p>
          </div>
          <button
            onClick={onOpenQuiz}
            className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer flex-shrink-0"
          >
            START BEAUTY QUIZ
          </button>
        </div>

        {/* Editor's Picks Section */}
        <div className="space-y-8">
          <div className="flex items-end justify-between border-b border-[#E8D5A8] pb-4">
            <div>
              <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B] block">
                CURATED READING
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">
                EDITOR’S PICKS
              </h2>
            </div>
            <button
              onClick={() => onOpenGuides()}
              className="text-xs font-semibold tracking-[0.16em] uppercase text-[#121212] hover:text-[#C9972B] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>EXPLORE ALL GUIDES</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {editorsPicks.map((article, index) => (
              <motion.article
                key={article.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => onOpenArticle(article.id)}
                className="group cursor-pointer flex flex-col justify-between bg-[#FAF9F6] border border-[#E8D5A8] p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="space-y-4">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#FAF9F6]">
                    <img
                      src={article.image}
                      alt={article.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      loading="lazy"
                    />
                    <div className="absolute top-3 left-3 bg-[#FAF9F6]/90 backdrop-blur-xs px-2.5 py-1 text-[9.5px] font-semibold tracking-widest uppercase text-[#121212]">
                      {article.category}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
                    <span>{article.readTime}</span>
                    <span>{article.date}</span>
                  </div>

                  <h3 className="font-serif text-xl text-[#121212] group-hover:text-[#C9972B] transition-colors leading-snug">
                    {article.title}
                  </h3>

                  <p className="text-xs text-[#6B6B6B] line-clamp-3 leading-relaxed">
                    {article.excerpt}
                  </p>
                </div>

                <div className="pt-6 border-t border-[#E8D5A8] mt-6 flex items-center justify-between text-xs font-semibold tracking-[0.16em] uppercase text-[#121212] group-hover:text-[#C9972B]">
                  <span>READ STORY</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.article>
            ))}
          </div>
        </div>

        {/* Filtered Full Article Archive Grid */}
        <div className="space-y-8 pt-6">
          <div className="border-b border-[#E8D5A8] pb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl text-[#121212]">
              {selectedCategory === 'ALL' ? 'ALL JOURNAL STORIES & GUIDES' : `${selectedCategory} ARTICLES`}
            </h2>
            <span className="text-xs text-[#6B6B6B]">
              Showing {filteredArticles.length} stories
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredArticles.map((article) => (
              <div
                key={article.id}
                onClick={() => onOpenArticle(article.id)}
                className="group cursor-pointer bg-[#FAF9F6] border border-[#E8D5A8] p-5 hover:border-[#C9972B] transition-all duration-300 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="aspect-[16/10] overflow-hidden bg-[#FAF9F6] relative">
                    <img
                      src={article.image}
                      alt={article.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute top-2 left-2 bg-[#0B0B0B]/80 text-[#FAF9F6] px-2 py-0.5 text-[9px] tracking-wider uppercase font-medium">
                      {article.category}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#6B6B6B]">
                    <span>{article.readTime}</span>
                    <span>•</span>
                    <span>{article.author}</span>
                  </div>

                  <h3 className="font-serif text-lg text-[#121212] group-hover:text-[#C9972B] transition-colors leading-snug">
                    {article.title}
                  </h3>

                  <p className="text-xs text-[#6B6B6B] line-clamp-2 leading-relaxed">
                    {article.excerpt}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E8D5A8] mt-4 flex items-center justify-between text-[11px] font-semibold tracking-widest uppercase text-[#121212]">
                  <span>EXPLORE ARTICLE</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#C9972B] group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shop The Story Callout Banner */}
        <div className="bg-[#0B0B0B] text-[#FAF9F6] p-8 sm:p-12 border border-[#171717] grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-3">
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
              SHOP THE STORY
            </span>
            <h3 className="font-serif text-2xl sm:text-3xl text-[#FAF9F6]">
              Formulations Featured in this Edition
            </h3>
            <p className="text-xs sm:text-sm text-[#C9972B] max-w-xl font-light">
              Experience the weightless velvet lipsticks, precision sindoor, and melting balm cleansers discussed in our color theory masterclasses.
            </p>
          </div>
          <div className="lg:col-span-4 flex justify-start lg:justify-end">
            <button
              onClick={() => onOpenProduct(GLAMIRK_PRODUCTS[0])}
              className="px-8 py-4 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#E8D5A8] transition-colors cursor-pointer"
            >
              SHOP THE EDIT
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
