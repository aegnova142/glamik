import React from 'react';
import { Instagram, ArrowUpRight, Sparkles } from 'lucide-react';
import { Product } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';

interface GlamirkOnYouProps {
  onQuickView: (product: Product) => void;
}

export const GlamirkOnYou: React.FC<GlamirkOnYouProps> = ({ onQuickView }) => {
  const socialGallery = [
    {
      id: 'social-1',
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=85',
      shadeTag: 'Matte Liquid • Spice Velvet',
      productId: 'matte-liquid-lipstick-collection'
    },
    {
      id: 'social-2',
      image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=85',
      shadeTag: 'Luxury Sindoor • Ceremonial Scarlet',
      productId: 'luxury-sindoor-collection'
    },
    {
      id: 'social-3',
      image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=85',
      shadeTag: 'Matte Liquid • Crimson Sovereign',
      productId: 'matte-liquid-lipstick-collection'
    },
    {
      id: 'social-4',
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=85',
      shadeTag: 'Balm To Water • 50g Cleansing Ritual',
      productId: 'balm-to-water-cleanser-50g'
    }
  ];

  return (
    <section id="glamirk-on-you" className="py-16 sm:py-24 bg-[#FCE8ED]/40 border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 sm:mb-14 gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                Community Moments
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#121212] tracking-tight">
              Glamirk on You
            </h2>
            <p className="text-sm sm:text-base text-[#6B6B6B] font-normal">
              Beauty, styled your way. Tag <span className="font-semibold text-[#F05A7E]">@glamirkbeauty</span> to be featured in our community showcase.
            </p>
          </div>

          <div>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-bold text-[#F05A7E] hover:text-[#F05A7E] transition-colors py-1.5 px-4 bg-white border border-[#E8D5A8] rounded-full shadow-xs hover:border-[#F05A7E]"
            >
              <Instagram className="w-4 h-4 text-[#F05A7E]" />
              <span>Follow on Instagram</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Editorial Social Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {socialGallery.map((tile) => {
            const product = GLAMIRK_PRODUCTS.find((p) => p.id === tile.productId) || GLAMIRK_PRODUCTS[0];

            return (
              <div
                key={tile.id}
                className="group relative aspect-[3/4] overflow-hidden bg-[#FCE8ED] border border-[#E8D5A8] rounded-3xl cursor-pointer shadow-xs hover:shadow-[0_12px_28px_rgba(240, 90, 126,0.12)] hover:border-[#F05A7E] transition-all"
                onClick={() => onQuickView(product)}
              >
                <img
                  src={tile.image}
                  alt={tile.shadeTag}
                  className="w-full h-full object-cover transform group-hover:scale-104 transition-transform duration-500 ease-out"
                  loading="lazy"
                />

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4 text-white">
                  <div className="flex justify-end">
                    <div className="p-2 bg-white/20 backdrop-blur-md rounded-full">
                      <Instagram className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-medium tracking-wide text-[#FCE8ED] block">
                      {tile.shadeTag}
                    </span>
                    <button
                      className="w-full py-2 bg-[#F05A7E] text-white text-xs font-bold rounded-full shadow-sm hover:bg-[#F05A7E] transition-colors"
                    >
                      Shop this Look
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
