import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, ArrowRight, Sparkles } from 'lucide-react';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { GLAMIRK_LOOKS } from '../../data/looks';
import { GLAMIRK_JOURNAL_ARTICLES } from '../../data/journal';
import { Product, Look, JournalArticle } from '../../types';
import { useCMS } from '../../context/CMSContext';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onSelectLook: (look: Look) => void;
  onSelectArticle: (article: JournalArticle) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
  onSelectLook,
  onSelectArticle,
}) => {
  const { looks: cmsLooks } = useCMS();
  const displayLooks = cmsLooks && cmsLooks.length > 0 ? cmsLooks : GLAMIRK_LOOKS;
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return { products: [], looks: [], articles: [] };

    const products = GLAMIRK_PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.subCategory.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.shades?.some((s) => s.name.toLowerCase().includes(q) || s.undertone.toLowerCase().includes(q))
    );

    const looks = displayLooks.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
    );

    const articles = GLAMIRK_JOURNAL_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q)
    );

    return { products, looks, articles };
  }, [query, displayLooks]);

  const hasResults =
    searchResults.products.length > 0 ||
    searchResults.looks.length > 0 ||
    searchResults.articles.length > 0;

  const popularSearches = [
    'Matte Liquid Lipstick',
    'Luxury Sindoor',
    'Balm to Water Cleanser',
    'Warm Undertone',
    'Wedding Glam',
    'Nude Suede'
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
          />

          {/* Search Card */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl max-w-2xl w-full z-10 overflow-hidden"
          >
            {/* Input Bar */}
            <div className="p-4 sm:p-6 border-b border-[#E8D5A8] flex items-center gap-3">
              <Search className="w-5 h-5 text-[#6B6B6B] stroke-[1.5]" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, shades, rituals, looks..."
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
              <button
                onClick={onClose}
                className="text-xs tracking-wider uppercase text-[#6B6B6B] hover:text-[#121212] ml-2 font-medium"
              >
                ESC
              </button>
            </div>

            {/* Results or Suggestions */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
              {!query.trim() ? (
                <div className="space-y-4">
                  <span className="text-[10.5px] uppercase tracking-[0.2em] text-[#C9972B] font-semibold block">
                    POPULAR SEARCHES:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {popularSearches.map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="px-3.5 py-1.5 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#121212] transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              ) : !hasResults ? (
                <div className="text-center py-10 text-[#6B6B6B]">
                  <p className="font-serif text-lg text-[#121212]">No results found for &ldquo;{query}&rdquo;</p>
                  <p className="text-xs mt-1">Try searching for &quot;Lipstick&quot;, &quot;Sindoor&quot;, &quot;Cleanser&quot;, or &quot;Undertone&quot;</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Products */}
                  {searchResults.products.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-semibold block">
                        PRODUCTS ({searchResults.products.length})
                      </span>
                      <div className="space-y-2">
                        {searchResults.products.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              onSelectProduct(p);
                              onClose();
                            }}
                            className="p-3 bg-[#FAF9F6] hover:bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={p.images.primary}
                                alt={p.name}
                                className="w-10 h-12 object-cover border border-[#E8D5A8]"
                              />
                              <div>
                                <h4 className="font-serif text-sm font-medium text-[#121212]">
                                  {p.name}
                                </h4>
                                <span className="text-[11px] text-[#6B6B6B]">
                                  {p.subCategory} • ₹{p.price}
                                </span>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#6B6B6B]" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Looks */}
                  {searchResults.looks.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-semibold block">
                        EDITORIAL LOOKS ({searchResults.looks.length})
                      </span>
                      <div className="space-y-2">
                        {searchResults.looks.map((l) => (
                          <div
                            key={l.id}
                            onClick={() => {
                              onSelectLook(l);
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
                            <ArrowRight className="w-4 h-4 text-[#6B6B6B]" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Articles */}
                  {searchResults.articles.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-semibold block">
                        JOURNAL STORIES ({searchResults.articles.length})
                      </span>
                      <div className="space-y-2">
                        {searchResults.articles.map((a) => (
                          <div
                            key={a.id}
                            onClick={() => {
                              onSelectArticle(a);
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
                            <ArrowRight className="w-4 h-4 text-[#6B6B6B]" />
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
