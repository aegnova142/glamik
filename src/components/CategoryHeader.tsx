import React from 'react';

interface CategoryHeaderProps {
  category: string | null;
  subCategory: string | null;
  totalCount: number;
}

export const CategoryHeader: React.FC<CategoryHeaderProps> = ({
  category,
  subCategory,
  totalCount,
}) => {
  let title = 'Shop Glamirk';
  let subtitle = 'Discover the complete luxury collection crafted for modern Indian beauty.';

  if (subCategory === 'Lips' || category === 'Makeup') {
    title = subCategory === 'Lips' ? 'Lips Collection' : 'Makeup Creations';
    subtitle = 'Find your signature shade. Saturated velvet pigments calibrated for diverse Indian undertones.';
  } else if (subCategory === 'Face') {
    title = 'Ceremonial Luxury & Face';
    subtitle = 'Modern ceremonial sindoor and sacred accents with razor-sharp applicator precision.';
  } else if (category === 'Skin' || subCategory === 'Cleansing') {
    title = 'Skincare Rituals';
    subtitle = 'Transformative textures that melt away makeup and pollutants, revealing clean, plump skin.';
  } else if (category === 'Nails') {
    title = 'Nail Essentials';
    subtitle = 'High-gloss enduring lacquers and restorative nail rituals.';
  }

  return (
    <div className="relative bg-[#FCE8ED] text-[#121212] py-10 sm:py-14 px-4 sm:px-6 lg:px-8 border-b border-[#E8D5A8] overflow-hidden">
      <div className="relative max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="w-5 h-1 bg-[#F05A7E] rounded-full" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#F05A7E]">
              Glamirk Archive
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#121212] tracking-tight leading-tight">
            {title}
          </h1>

          <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-xl leading-relaxed pt-1">
            {subtitle}
          </p>
        </div>

        <div className="flex items-baseline gap-2 text-xs text-[#6B6B6B] border-t md:border-t-0 md:border-l border-[#E8D5A8] pt-4 md:pt-0 md:pl-6">
          <span className="text-2xl text-[#121212] font-extrabold">{totalCount}</span>
          <span className="uppercase tracking-wider text-[10.5px] font-semibold">Creations Available</span>
        </div>
      </div>
    </div>
  );
};

