import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';

const VISIBLE_LIMIT = 6;

export const FaqHomeSection: React.FC = () => {
  const { faqs } = useCMS();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visibleFaqs = (faqs || []).filter((f) => f.isVisible !== false);
  const searchResults = query.trim()
    ? visibleFaqs.filter((f) => f.question.toLowerCase().includes(query.trim().toLowerCase()))
    : visibleFaqs;
  const filtered = query.trim() || showAll ? searchResults : searchResults.slice(0, VISIBLE_LIMIT);
  const hasMore = !query.trim() && searchResults.length > VISIBLE_LIMIT;

  if (visibleFaqs.length === 0) return null;

  const leftCol = filtered.filter((_, i) => i % 2 === 0);
  const rightCol = filtered.filter((_, i) => i % 2 === 1);

  const renderItem = (faq: (typeof filtered)[number], idx: number) => {
    const isOpen = openId === faq.id;
    return (
      <div key={faq.id} className="bg-white border border-[#E8D5A8] rounded-xl overflow-hidden">
        <button
          onClick={() => setOpenId(isOpen ? null : faq.id)}
          className="w-full h-[52px] flex items-center justify-between gap-3 px-4 text-left cursor-pointer"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] font-mono font-bold text-[#F05A7E] w-5 shrink-0">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span className="text-sm font-semibold text-[#121212] truncate">{faq.question}</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#6B6B6B] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#F05A7E]' : ''}`}
          />
        </button>
        {isOpen && (
          <p className="px-4 pb-4 pl-12 text-xs text-[#6B6B6B] leading-relaxed">{faq.answer}</p>
        )}
      </div>
    );
  };

  return (
    // No bottom border: HomeReviewsSection continues this blush band and carries it.
    <section className="home-section bg-[#FCE8ED]/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="home-section-header text-center max-w-xl mx-auto space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#121212]">
            How Can We <span className="text-[#F05A7E]">Help You?</span>
          </h2>
          <div className="relative max-w-md mx-auto pt-2">
            <Search className="w-4 h-4 text-[#6B6B6B] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your question here..."
              className="w-full pl-11 pr-4 py-3 text-sm bg-white border border-[#E8D5A8] rounded-full focus:border-[#F05A7E] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div className="space-y-3">{leftCol.map((f, i) => renderItem(f, i * 2))}</div>
          <div className="space-y-3">{rightCol.map((f, i) => renderItem(f, i * 2 + 1))}</div>
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-[#6B6B6B] py-8">No questions match "{query}".</p>
        )}

        {hasMore && (
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-[#E8D5A8] rounded-full text-xs font-semibold text-[#121212] hover:border-[#F05A7E] hover:text-[#F05A7E] transition-colors bg-white"
            >
              <span>{showAll ? 'View Less' : `View More (${searchResults.length - VISIBLE_LIMIT})`}</span>
              {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
