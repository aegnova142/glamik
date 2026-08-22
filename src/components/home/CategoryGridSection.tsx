import React, { useState } from 'react';
import { ArrowRight, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useCMS } from '../../context/CMSContext';

interface CategoryItem {
  id: string;
  name: string;
  count: string;
  image: string;
  category: string;
  subCategory?: string | null;
  description: string;
}

const DEFAULT_CATEGORIES: CategoryItem[] = [
  {
    id: 'lips',
    name: 'Lips & Matte Liquid',
    count: '8 Shades',
    image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=600&q=80',
    category: 'Makeup',
    subCategory: 'Lips',
    description: '16-hour transfer-proof comfort with argan & vitamin E',
  },
  {
    id: 'cleansing',
    name: 'Balm To Water Cleansing',
    count: '2 Formats (50g / 30g)',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
    category: 'Skin',
    subCategory: 'Cleansing',
    description: 'Effortless melt-away makeup cleansing with ceramides',
  },
  {
    id: 'sindoor',
    name: 'Luxury Sindoor',
    count: '2 Heritage Shades',
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80',
    category: 'Makeup',
    subCategory: 'Face',
    description: 'Rich scarlet & maroon liquid pigment with gold micro-shimmer',
  },
  {
    id: 'discovery',
    name: 'Discovery & Sets',
    count: 'Curated Rituals',
    image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80',
    category: 'Makeup',
    subCategory: null,
    description: 'Tailored bundles for Indian festivities and bridal prep',
  },
];

interface CategoryGridSectionProps {
  onSelectCategory: (category: string, subCategory?: string | null) => void;
  onViewAllCategories: () => void;
}

const CARDS_PER_ROW = 3;

export const CategoryGridSection: React.FC<CategoryGridSectionProps> = ({
  onSelectCategory,
  onViewAllCategories,
}) => {
  const { categories: cmsCategories } = useCMS();
  const [showAll, setShowAll] = useState(false);

  const CATEGORIES: CategoryItem[] =
    cmsCategories && cmsCategories.length > 0
      ? cmsCategories
          .filter((c) => c.isVisible)
          .sort((a, b) => a.order - b.order)
          .map((c) => ({
            id: c.id,
            name: c.name,
            count: c.subCategories && c.subCategories.length > 0 ? `${c.subCategories.length} Ranges` : 'Explore Range',
            image: c.image,
            category: c.name,
            subCategory: null,
            description: c.description,
          }))
      : DEFAULT_CATEGORIES;

  const visibleCategories = showAll ? CATEGORIES : CATEGORIES.slice(0, CARDS_PER_ROW);
  const hasMore = CATEGORIES.length > CARDS_PER_ROW;
  return (
    <section id="shop-by-category-section" className="py-14 sm:py-20 bg-white border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span className="text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                Explore Collections
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#121212] tracking-tight">
              Shop by Category
            </h2>
            <p className="text-xs sm:text-sm text-[#6B6B6B] mt-1 max-w-lg">
              Explore thoughtfully formulated cosmetics and skincare tailored for daily radiance and celebratory rituals.
            </p>
          </div>

          <button
            id="view-all-categories-btn"
            onClick={onViewAllCategories}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F05A7E] hover:text-[#F05A7E] transition-colors cursor-pointer group shrink-0"
          >
            <span>View All Categories</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Category Cards Grid — 3 desktop / 2 tablet / 1 mobile, 30px gap */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[30px]">
          {visibleCategories.map((cat, idx) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              onClick={() => onSelectCategory(cat.category, cat.subCategory)}
              className="group cursor-pointer bg-white rounded-[20px] border border-[#E8D5A8] p-[26px] shadow-xs hover:shadow-[0_12px_28px_rgba(240,90,126,0.09)] hover:border-[#F05A7E] transition-all flex flex-col justify-between"
            >
              {/* Image Container with Soft Pink Background */}
              <div className="relative aspect-[4/3] rounded-[16px] overflow-hidden bg-[#FCE8ED] mb-4 border border-[#E8D5A8]/60">
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#F05A7E] border border-[#E8D5A8]">
                  {cat.count}
                </div>
              </div>

              {/* Title & Description */}
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#121212] group-hover:text-[#F05A7E] transition-colors">
                  {cat.name}
                </h3>
                <p className="text-xs text-[#6B6B6B] line-clamp-2 leading-relaxed font-light">
                  {cat.description}
                </p>
              </div>

              {/* Action arrow */}
              <div className="pt-3 mt-3 border-t border-[#E8D5A8]/60 flex items-center justify-between text-xs font-semibold text-[#F05A7E]">
                <span>Explore Range</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.div>
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-[#E8D5A8] rounded-full text-xs font-semibold text-[#121212] hover:border-[#F05A7E] hover:text-[#F05A7E] transition-colors"
            >
              <span>{showAll ? 'View Less' : `View More (${CATEGORIES.length - CARDS_PER_ROW})`}</span>
              {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

      </div>
    </section>
  );
};
