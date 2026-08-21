import React from 'react';
import { Product } from '../types';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { ArrowRight } from 'lucide-react';

interface RecentlyViewedProps {
  recentlyViewedIds: string[];
  onSelectProduct: (product: Product) => void;
}

export const RecentlyViewed: React.FC<RecentlyViewedProps> = ({
  recentlyViewedIds,
  onSelectProduct,
}) => {
  const products = recentlyViewedIds
    .map((id) => GLAMIRK_PRODUCTS.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  if (products.length === 0) return null;

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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {products.slice(0, 4).map((product) => (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="bg-[#FAF9F6] border border-[#E8D5A8] p-3 group cursor-pointer hover:border-[#0B0B0B] transition-all flex flex-col justify-between"
            >
              <div className="aspect-square bg-[#FAF9F6] overflow-hidden mb-2.5">
                <img
                  src={product.images.primary}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[9.5px] uppercase tracking-wider text-[#6B6B6B] block">
                  {product.subCategory}
                </span>
                <h4 className="font-serif text-xs sm:text-sm font-medium text-[#121212] group-hover:text-[#C9972B] transition-colors line-clamp-1">
                  {product.name}
                </h4>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-serif text-xs font-medium text-[#121212]">
                    {product.currency}{product.price}
                  </span>
                  <ArrowRight className="w-3 h-3 text-[#6B6B6B] group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
