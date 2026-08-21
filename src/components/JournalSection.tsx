import React from 'react';
import { GLAMIRK_JOURNAL_ARTICLES } from '../data/journal';
import { JournalArticle } from '../types';
import { ArrowRight, BookOpen, Clock, Sparkles } from 'lucide-react';

interface JournalSectionProps {
  onReadArticle: (article: JournalArticle) => void;
}

export const JournalSection: React.FC<JournalSectionProps> = ({ onReadArticle }) => {
  return (
    <section id="the-glamirk-journal" className="py-16 sm:py-24 bg-white border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 sm:mb-14 gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                Editorial Perspectives
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] tracking-tight">
              The Glamirk Journal
            </h2>
            <p className="text-sm sm:text-base text-[#6B6B6B] font-normal leading-relaxed">
              Perspectives on color theory, formulation mastery, and modern rituals crafted for Indian complexions.
            </p>
          </div>

          <div>
            <button
              onClick={() => onReadArticle(GLAMIRK_JOURNAL_ARTICLES[0])}
              className="inline-flex items-center gap-2 text-xs font-bold text-[#F05A7E] hover:text-[#F05A7E] border-b border-[#F05A7E] pb-1 transition-colors cursor-pointer group"
            >
              <span>View All Stories</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* 3 Journal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {GLAMIRK_JOURNAL_ARTICLES.map((article) => (
            <div
              key={article.id}
              id={`journal-card-${article.id}`}
              onClick={() => onReadArticle(article)}
              className="group cursor-pointer bg-white border border-[#E8D5A8] rounded-3xl overflow-hidden shadow-xs hover:shadow-[0_16px_36px_rgba(240, 90, 126,0.1)] hover:border-[#F05A7E] transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-[16/10] overflow-hidden bg-[#FCE8ED]">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover transform group-hover:scale-104 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-[#E8D5A8] shadow-xs">
                    <span className="text-[10px] tracking-wider uppercase text-[#F05A7E] font-bold">
                      {article.category}
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-2.5">
                  <div className="flex items-center gap-2.5 text-xs text-[#6B6B6B]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#F05A7E]" />
                      {article.readTime}
                    </span>
                    <span>•</span>
                    <span>{article.date}</span>
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-[#121212] group-hover:text-[#F05A7E] transition-colors leading-snug">
                    {article.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#6B6B6B] font-normal leading-relaxed line-clamp-2">
                    {article.excerpt}
                  </p>
                </div>
              </div>

              <div className="px-5 sm:px-6 pb-5 pt-3 border-t border-[#E8D5A8] flex items-center justify-between">
                <span className="text-xs font-bold text-[#F05A7E] group-hover:text-[#F05A7E] transition-colors flex items-center gap-1.5">
                  Read Story
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
                <span className="text-[11px] text-[#6B6B6B] font-medium">
                  {article.author}
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
