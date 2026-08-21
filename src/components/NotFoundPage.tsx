/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { ArrowLeft, Sparkles, ShoppingBag, BookOpen } from 'lucide-react';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { Product } from '../types';
import { updatePageSeo } from '../utils/seo';

interface NotFoundPageProps {
  onNavigateHome: () => void;
  onNavigateShop: (category?: string | null) => void;
  onNavigateProduct: (productId: string) => void;
  onNavigateJournal: () => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({
  onNavigateHome,
  onNavigateShop,
  onNavigateProduct,
  onNavigateJournal,
}) => {
  useEffect(() => {
    updatePageSeo({
      title: 'Page Not Found',
      description: 'The requested page could not be found. Explore luxury formulations, shade guides, and beauty rituals at Glamirk Beauty.',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div id="glamirk-404-page" className="min-h-[75vh] bg-[#FAF9F6] py-20 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
      <div className="max-w-3xl w-full text-center">
        {/* Subtle decorative tag */}
        <span className="inline-flex items-center gap-2 px-3.5 py-1 text-[11px] uppercase tracking-[0.25em] text-[#C9972B] bg-[#FAF9F6] rounded-full mb-6">
          <Sparkles className="w-3 h-3 text-[#C9972B]" />
          404 — Page Not Found
        </span>

        {/* Elegant Editorial Headline */}
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#121212] tracking-tight leading-[1.1] mb-5">
          LOST IN THE GLAM?
        </h1>

        <p className="text-[#6B6B6B] text-base sm:text-lg max-w-lg mx-auto font-light leading-relaxed mb-10">
          The page you’re looking for isn’t here. Let’s get you back to the Glam and your bespoke beauty rituals.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <button
            id="not-found-return-home-btn"
            onClick={onNavigateHome}
            className="w-full sm:w-auto px-8 py-4 bg-[#0B0B0B] text-[#FAF9F6] text-xs uppercase tracking-[0.2em] font-medium hover:bg-[#0B0B0B] transition-all duration-300 shadow-sm flex items-center justify-center gap-2.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            RETURN TO GLAMIRK
          </button>
          <button
            id="not-found-explore-shop-btn"
            onClick={() => onNavigateShop()}
            className="w-full sm:w-auto px-8 py-4 border border-[#0B0B0B] text-[#121212] text-xs uppercase tracking-[0.2em] font-medium hover:bg-[#0B0B0B] hover:text-[#FAF9F6] transition-all duration-300 flex items-center justify-center gap-2.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            EXPLORE THE COLLECTION
          </button>
        </div>

        {/* Quick Nav curated shortcuts */}
        <div className="pt-10 border-t border-[#E8D5A8]">
          <p className="text-xs uppercase tracking-[0.2em] text-[#C9972B] font-medium mb-6">
            OR DISCOVER VERIFIED SIGNATURES
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
            {GLAMIRK_PRODUCTS.slice(0, 3).map((product: Product) => (
              <button
                key={product.id}
                onClick={() => onNavigateProduct(product.id)}
                className="p-4 bg-[#FFFFFF] border border-[#E8D5A8] hover:border-[#C9972B] transition-all text-left group"
              >
                <p className="text-[10px] uppercase tracking-widest text-[#C9972B] mb-1 font-medium">
                  {product.category}
                </p>
                <p className="font-serif text-sm text-[#121212] font-medium line-clamp-1 group-hover:text-[#C9972B] transition-colors">
                  {product.name}
                </p>
                <p className="text-xs text-[#C9972B] mt-1">₹{product.price}</p>
              </button>
            ))}
          </div>

          <div className="mt-8">
            <button
              onClick={onNavigateJournal}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#121212] hover:text-[#C9972B] transition-colors border-b border-transparent hover:border-[#C9972B] pb-0.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Read The Glamirk Journal &amp; Beauty Guides
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
