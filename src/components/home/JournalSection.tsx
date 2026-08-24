import React from 'react';
import { GLAMIRK_JOURNAL_ARTICLES } from '../../data/journal';
import { JournalArticle } from '../../types';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ArticleCard } from '../content/ArticleCard';
import { useCMS } from '../../context/CMSContext';

interface JournalSectionProps {
  onReadArticle: (article: JournalArticle) => void;
}

const DEFAULT_COPY = {
  badgeText: 'Editorial Perspectives',
  heading: 'The Glamirk Journal',
  subtitle: 'Perspectives on color theory, formulation mastery, and modern rituals crafted for Indian complexions.',
};

export const JournalSection: React.FC<JournalSectionProps> = ({ onReadArticle }) => {
  const { journalArticles, journalSectionCopy } = useCMS();
  const copy = journalSectionCopy || DEFAULT_COPY;
  const articles = journalArticles && journalArticles.length > 0 ? journalArticles.slice(0, 3) : GLAMIRK_JOURNAL_ARTICLES;

  return (
    <section id="the-glamirk-journal" className="py-16 sm:py-24 bg-white border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 sm:mb-14 gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                {copy.badgeText}
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] tracking-tight">
              {copy.heading}
            </h2>
            <p className="text-sm sm:text-base text-[#6B6B6B] font-normal leading-relaxed">
              {copy.subtitle}
            </p>
          </div>

          <div>
            <button
              onClick={() => articles[0] && onReadArticle(articles[0])}
              className="inline-flex items-center gap-2 text-xs font-bold text-[#F05A7E] hover:text-[#F05A7E] border-b border-[#F05A7E] pb-1 transition-colors cursor-pointer group"
            >
              <span>View All Stories</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* 3 Journal Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} onOpen={() => onReadArticle(article)} />
          ))}
        </div>

      </div>
    </section>
  );
};
