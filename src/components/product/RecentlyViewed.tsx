import React, { useState } from 'react';
import { Product } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface RecentlyViewedProps {
  recentlyViewedIds: string[];
  onSelectProduct: (product: Product) => void;
}

const PAGE_SIZE = 3;

export const RecentlyViewed: React.FC<RecentlyViewedProps> = ({
  recentlyViewedIds,
  onSelectProduct,
}) => {
  const [expanded, setExpanded] = useState(false);
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;

  const products = recentlyViewedIds
    .map((id) => catalogProducts.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  if (products.length === 0) return null;

  const visibleProducts = expanded ? products : products.slice(0, PAGE_SIZE);
  const hasMore = products.length > PAGE_SIZE;

  return (
    <section className="py-12 border-t border-[#E8D5A8] bg-[#FAF9F6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.24em] font-semibold text-[#6B6B6B]">
              YOUR BROWSING HISTORY
            </span>
            <h3 className="font-serif text-xl sm:text-2xl text-[#121212]">
              RECENTLY VIEWED
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="bg-white border border-[#E8D5A8] rounded-[20px] overflow-hidden group cursor-pointer hover:border-[#F05A7E] hover:shadow-[0_12px_30px_rgba(240,90,126,0.12)] transition-all flex flex-col min-h-[400px]"
            >
              <div className="w-full h-[192px] shrink-0 bg-[#FCE8ED] overflow-hidden flex items-center justify-center">
                <img
                  src={product.images.primary}
                  alt={product.name}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              <div className="p-6 flex flex-col flex-1 justify-between space-y-1.5">
                <div>
                  <span className="text-[9.5px] uppercase tracking-wider text-[#6B6B6B] block">
                    {product.subCategory}
                  </span>
                  <h4 className="font-serif text-sm sm:text-base font-medium text-[#121212] group-hover:text-[#F05A7E] transition-colors line-clamp-1 mt-0.5">
                    {product.name}
                  </h4>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[#E8D5A8]/60">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold text-[#121212]">
                      {product.currency}{product.price}
                    </span>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <span className="text-xs text-[#6B6B6B] line-through">
                        {product.currency}{product.originalPrice}
                      </span>
                    )}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#6B6B6B] group-hover:translate-x-1 group-hover:text-[#F05A7E] transition-all" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-[#E8D5A8] rounded-full text-xs font-semibold text-[#121212] hover:border-[#F05A7E] hover:text-[#F05A7E] transition-colors"
            >
              <span>{expanded ? 'View Less' : `View More (${products.length - PAGE_SIZE})`}</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
