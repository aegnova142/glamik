import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, ArrowRight, Sparkles, ShoppingBag, BookOpen, Layers, Camera } from 'lucide-react';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { GLAMIRK_LOOKS } from '../data/looks';
import { GLAMIRK_JOURNAL_ARTICLES_EXTENDED, GLAMIRK_BEAUTY_GUIDES, GLAMIRK_CAMPAIGNS } from '../data/editorial';
import { Product, Look, JournalArticle, BeautyGuide, Campaign, Shade } from '../types';
import { trackEvent } from '../utils/analytics';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onSelectLook: (lookId: string) => void;
  onSelectArticle: (articleId: string) => void;
  onSelectGuide: (guideId: string) => void;
  onSelectCampaign: (campaignId: string) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onNavigateToCategory: (category: string | null, subCategory: string | null) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
  onSelectLook,
  onSelectArticle,
  onSelectGuide,
  onSelectCampaign,
  onQuickAdd,
  onNavigateToCategory,
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PRODUCTS' | 'GUIDES' | 'STORIES' | 'LOOKS'>('ALL');

  const trendingSearches = [
    'Lipstick',
    'Matte',
    'Cleanser',
    'Sindoor',
    'Warm Undertone',
    'Nude Suede',
    'Balm to Water',
    'Wedding Glam',
  ];

  const categorySuggestions = [
    { label: 'Lips & Lipsticks', category: 'Makeup', subCategory: 'Lips' },
    { label: 'Luxury Sindoor', category: 'Makeup', subCategory: 'Face' },
    { label: 'Balm To Water Cleansers', category: 'Skin', subCategory: 'Cleansing' },
  ];

  const searchResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return { products: [], looks: [], articles: [], guides: [], campaigns: [] };

    const products = GLAMIRK_PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.subCategory.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.shades?.some((s) => s.name.toLowerCase().includes(q) || s.undertone.toLowerCase().includes(q))
    );

    const looks = GLAMIRK_LOOKS.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        l.tagline.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
    );

    const articles = GLAMIRK_JOURNAL_ARTICLES_EXTENDED.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q)
    );

    const guides = GLAMIRK_BEAUTY_GUIDES.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
        g.overview.toLowerCase().includes(q)
    );

    const campaigns = GLAMIRK_CAMPAIGNS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.brandStory.toLowerCase().includes(q)
    );

    return { products, looks, articles, guides, campaigns };
  }, [query]);

  const hasResults =
    searchResults.products.length > 0 ||
    searchResults.looks.length > 0 ||
    searchResults.articles.length > 0 ||
    searchResults.guides.length > 0 ||
    searchResults.campaigns.length > 0;

  const totalResultsCount =
    searchResults.products.length +
    searchResults.looks.length +
    searchResults.articles.length +
    searchResults.guides.length +
    searchResults.campaigns.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-12 px-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
          />

          {/* Search Panel Card */}
          <motion.div
            initial={{ opacity: 0, y: -25 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -25 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl max-w-3xl w-full z-10 overflow-hidden"
          >
            {/* Header / Input Field */}
            <div className="p-6 sm:p-8 border-b border-[#E8D5A8] space-y-4 bg-[#FAF9F6]">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] uppercase tracking-[0.24em] font-semibold text-[#C9972B]">
                  GLAMIRK DISCOVERY SEARCH
                </span>
                <button
                  onClick={onClose}
                  className="p-1 text-[#6B6B6B] hover:text-[#121212] transition-colors rounded-full"
                  aria-label="Close search"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">
                SEARCH PRODUCTS, GUIDES & STORIES
              </h2>

              <div className="relative flex items-center border-b-2 border-[#0B0B0B] pb-2">
                <Search className="w-5 h-5 text-[#6B6B6B] mr-3 flex-shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search lipsticks, undertones, cleansing rituals, bridal looks..."
                  className="w-full bg-transparent text-base sm:text-lg text-[#121212] placeholder-[#6B6B6B] font-serif focus:outline-none"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="p-1 text-[#6B6B6B] hover:text-[#121212]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Tab Filters when query exists */}
              {query.trim() && hasResults && (
                <div className="flex items-center gap-2 pt-2 overflow-x-auto">
                  {(['ALL', 'PRODUCTS', 'GUIDES', 'STORIES', 'LOOKS'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1 text-[10px] font-semibold tracking-widest uppercase transition-colors whitespace-nowrap ${
                        activeTab === tab
                          ? 'bg-[#0B0B0B] text-[#FAF9F6]'
                          : 'bg-[#FAF9F6] text-[#6B6B6B] hover:bg-[#E8D5A8]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Body: Trending Searches or Results */}
            <div className="p-6 sm:p-8 max-h-[60vh] overflow-y-auto space-y-6">
              {!query.trim() ? (
                <div className="space-y-6">
                  {/* Trending searches */}
                  <div className="space-y-3">
                    <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#6B6B6B] block">
                      TRENDING DISCOVERY:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {trendingSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => setQuery(term)}
                          className="px-4 py-2 bg-[#FAF9F6] hover:bg-[#E8D5A8] border border-[#E8D5A8] text-xs text-[#121212] transition-colors font-medium"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Explore Categories */}
                  <div className="space-y-3 pt-4 border-t border-[#E8D5A8]">
                    <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#6B6B6B] block">
                      EXPLORE BY ATELIER CATEGORY:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {categorySuggestions.map((cat, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            onNavigateToCategory(cat.category, cat.subCategory);
                            onClose();
                          }}
                          className="p-3 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] text-left text-xs font-semibold text-[#121212] transition-colors flex items-center justify-between"
                        >
                          <span>{cat.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#6B6B6B]" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : !hasResults ? (
                <div className="text-center py-10 space-y-4">
                  <span className="text-[10.5px] uppercase tracking-[0.24em] font-semibold text-[#C9972B] block">
                    NO RESULTS FOUND
                  </span>
                  <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
                    WE COULDN’T FIND THAT
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-md mx-auto font-light leading-relaxed">
                    No formulation matched &ldquo;{query}&rdquo;. Explore our curated beauty edit or try searching by category, undertone, or finish.
                  </p>

                  <div className="pt-6 border-t border-[#E8D5A8] text-left">
                    <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#C9972B] mb-3 text-center">
                      EXPLORE OUR BEAUTY EDIT
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
                      {categorySuggestions.map((cat, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            onNavigateToCategory(cat.category, cat.subCategory);
                            onClose();
                          }}
                          className="p-3 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] text-left text-xs font-medium text-[#121212] transition-colors flex items-center justify-between group"
                        >
                          <span>{cat.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#6B6B6B] group-hover:text-[#C9972B] transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="text-xs text-[#6B6B6B] uppercase tracking-wider flex items-center justify-between">
                    <span>
                      RESULTS FOR &ldquo;<strong className="text-[#121212]">{query}</strong>&rdquo;
                    </span>
                    <span>{totalResultsCount} results found</span>
                  </div>

                  {/* Matching Products */}
                  {(activeTab === 'ALL' || activeTab === 'PRODUCTS') && searchResults.products.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-[#C9972B] block">
                        PRODUCTS ({searchResults.products.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {searchResults.products.map((p) => (
                          <div
                            key={p.id}
                            className="p-3 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between gap-3 group transition-colors cursor-pointer"
                            onClick={() => {
                              onSelectProduct(p);
                              onClose();
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={p.images.primary}
                                alt={p.name}
                                className="w-12 h-14 object-cover border border-[#E8D5A8]"
                              />
                              <div>
                                <h4 className="font-serif text-sm font-medium text-[#121212] group-hover:text-[#C9972B] transition-colors">
                                  {p.name}
                                </h4>
                                <span className="text-[11px] text-[#6B6B6B] block">
                                  {p.subCategory} • ₹{p.price}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickAdd(p, p.shades?.[0], p.selectedSize || p.sizes?.[0]);
                              }}
                              className="p-2 bg-[#FAF9F6] hover:bg-[#0B0B0B] text-[#121212] hover:text-[#FAF9F6] rounded-full border border-[#E8D5A8] transition-colors flex-shrink-0"
                              title="Add to bag"
                            >
                              <ShoppingBag className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Beauty Guides */}
                  {(activeTab === 'ALL' || activeTab === 'GUIDES') && searchResults.guides.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-[#E8D5A8]">
                      <span className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-[#C9972B] block">
                        BEAUTY GUIDES & MASTERCLASSES ({searchResults.guides.length})
                      </span>
                      <div className="space-y-2">
                        {searchResults.guides.map((g) => (
                          <div
                            key={g.id}
                            onClick={() => {
                              onSelectGuide(g.id);
                              onClose();
                            }}
                            className="p-3 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <span className="text-[9.5px] uppercase font-bold text-[#C9972B] tracking-wider block">{g.category}</span>
                              <h4 className="font-serif text-sm font-medium text-[#121212]">
                                {g.title}
                              </h4>
                              <span className="text-[11px] text-[#6B6B6B] line-clamp-1">
                                {g.subtitle}
                              </span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#6B6B6B] flex-shrink-0 ml-2" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Journal Articles */}
                  {(activeTab === 'ALL' || activeTab === 'STORIES') && searchResults.articles.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-[#E8D5A8]">
                      <span className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-[#C9972B] block">
                        JOURNAL STORIES ({searchResults.articles.length})
                      </span>
                      <div className="space-y-2">
                        {searchResults.articles.map((a) => (
                          <div
                            key={a.id}
                            onClick={() => {
                              onSelectArticle(a.id);
                              onClose();
                            }}
                            className="p-3 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <h4 className="font-serif text-sm font-medium text-[#121212]">
                                {a.title}
                              </h4>
                              <span className="text-[11px] text-[#6B6B6B]">
                                {a.readTime} • {a.category}
                              </span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#6B6B6B] flex-shrink-0 ml-2" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Looks */}
                  {(activeTab === 'ALL' || activeTab === 'LOOKS') && searchResults.looks.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-[#E8D5A8]">
                      <span className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-[#C9972B] block">
                        EDITORIAL LOOKS ({searchResults.looks.length})
                      </span>
                      <div className="space-y-2">
                        {searchResults.looks.map((l) => (
                          <div
                            key={l.id}
                            onClick={() => {
                              onSelectLook(l.id);
                              onClose();
                            }}
                            className="p-3 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <h4 className="font-serif text-sm font-medium text-[#121212]">
                                {l.title}
                              </h4>
                              <span className="text-[11px] text-[#6B6B6B]">
                                {l.tagline}
                              </span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#6B6B6B] flex-shrink-0 ml-2" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
