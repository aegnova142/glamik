import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Sparkles, ZoomIn } from 'lucide-react';

interface ProductGalleryProps {
  images: {
    primary: string;
    secondary: string;
    detail?: string;
    texture?: string;
    lifestyle?: string;
    swatch?: string;
  };
  productName: string;
  tag?: string;
}

export const ProductGallery: React.FC<ProductGalleryProps> = ({
  images,
  productName,
  tag,
}) => {
  const imagesList = [
    images.primary,
    images.secondary,
    images.detail,
    images.texture,
    images.lifestyle,
    images.swatch,
  ].filter(Boolean) as string[];

  const [activeIndex, setActiveIndex] = useState(0);

  const nextImage = () => {
    setActiveIndex((prev) => (prev + 1) % imagesList.length);
  };

  const prevImage = () => {
    setActiveIndex((prev) => (prev - 1 + imagesList.length) % imagesList.length);
  };

  return (
    <div className="flex flex-col-reverse md:flex-row gap-4 w-full">
      {/* Vertical Thumbnails (Desktop) */}
      <div className="flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto no-scrollbar md:w-20 flex-shrink-0">
        {imagesList.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`w-16 h-20 md:w-20 md:h-24 flex-shrink-0 rounded-xl overflow-hidden bg-[#FCE8ED] border transition-all duration-200 cursor-pointer ${
              activeIndex === idx
                ? 'border-[#F05A7E] ring-2 ring-[#F05A7E]/30 opacity-100 shadow-sm'
                : 'border-[#E8D5A8] opacity-60 hover:opacity-100'
            }`}
            aria-label={`View image ${idx + 1}`}
          >
            <img
              src={img}
              alt={`${productName} thumbnail ${idx + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Main Large Visual Frame */}
      <div className="relative flex-1 aspect-[4/5] bg-[#FCE8ED] border border-[#E8D5A8] rounded-2xl md:rounded-3xl overflow-hidden group shadow-xs">
        <AnimatePresence mode="wait">
          <motion.img
            key={activeIndex}
            src={imagesList[activeIndex]}
            alt={`${productName} view ${activeIndex + 1}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full object-cover object-center group-hover:scale-103 transition-transform duration-700 ease-out"
          />
        </AnimatePresence>

        {/* Tag badge */}
        {tag && (
          <span className="absolute top-3.5 left-3.5 px-3 py-1 bg-white/95 backdrop-blur-xs text-[#F05A7E] text-[10px] font-bold tracking-wider uppercase border border-[#E8D5A8] rounded-full shadow-xs">
            {tag}
          </span>
        )}

        {/* Mobile / Hover Arrow Controls */}
        {imagesList.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-white/90 hover:bg-white text-[#121212] rounded-full border border-[#E8D5A8] shadow-md opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4 text-[#121212]" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white/90 hover:bg-white text-[#121212] rounded-full border border-[#E8D5A8] shadow-md opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
              aria-label="Next image"
            >
              <ChevronRight className="w-4 h-4 text-[#121212]" />
            </button>
          </>
        )}

        {/* Mobile Pagination Dots */}
        {imagesList.length > 1 && (
          <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 bg-white/85 backdrop-blur-xs border border-[#E8D5A8] rounded-full shadow-xs">
            {imagesList.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  activeIndex === i
                    ? 'w-4 h-1.5 bg-[#F05A7E]'
                    : 'w-1.5 h-1.5 bg-[#6B6B6B]/30 hover:bg-[#F05A7E]/50'
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Image Counter Pill (Desktop) */}
        <div className="hidden md:block absolute bottom-3.5 right-3.5 px-2.5 py-1 bg-white/90 backdrop-blur-xs text-[#121212] text-[10px] font-bold tracking-wider rounded-full border border-[#E8D5A8] shadow-xs">
          {activeIndex + 1} / {imagesList.length}
        </div>
      </div>
    </div>
  );
};
