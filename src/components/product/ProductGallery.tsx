import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Sparkles, ZoomIn, X } from 'lucide-react';

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
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const nextImage = () => {
    setActiveIndex((prev) => (prev + 1) % imagesList.length);
  };

  const prevImage = () => {
    setActiveIndex((prev) => (prev - 1 + imagesList.length) % imagesList.length);
  };

  // Keyboard navigation while the lightbox is open — arrows to browse, Esc to close.
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
      else if (e.key === 'ArrowRight') nextImage();
      else if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLightboxOpen, imagesList.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX > 50) prevImage();
    else if (deltaX < -50) nextImage();
    touchStartX.current = null;
  };

  return (
    <div className="flex flex-col-reverse md:flex-row gap-4 w-full">
      {/* Vertical Thumbnails (Desktop) */}
      <div className="flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto no-scrollbar md:w-20 flex-shrink-0">
        {imagesList.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`w-16 h-20 md:w-20 md:h-24 flex-shrink-0 rounded-xl overflow-hidden bg-[#FCE8ED] border transition-all duration-200 cursor-pointer flex items-center justify-center ${
              activeIndex === idx
                ? 'border-[#F05A7E] ring-2 ring-[#F05A7E]/30 opacity-100 shadow-sm'
                : 'border-[#E8D5A8] opacity-60 hover:opacity-100'
            }`}
            aria-label={`View image ${idx + 1}`}
          >
            <img
              src={img}
              alt={`${productName} thumbnail ${idx + 1}`}
              className="w-full h-full object-contain"
            />
          </button>
        ))}
      </div>

      {/* Main Large Visual Frame */}
      <div
        className="relative flex-1 aspect-[4/5] bg-[#FCE8ED] border border-[#E8D5A8] rounded-2xl md:rounded-3xl overflow-hidden group shadow-xs flex items-center justify-center cursor-zoom-in"
        onClick={() => setIsLightboxOpen(true)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={activeIndex}
            src={imagesList[activeIndex]}
            alt={`${productName} view ${activeIndex + 1}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full object-contain object-center group-hover:scale-103 transition-transform duration-700 ease-out"
          />
        </AnimatePresence>

        {/* Zoom trigger */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLightboxOpen(true);
          }}
          className="absolute top-3.5 right-3.5 p-2 bg-white/90 hover:bg-white text-[#121212] rounded-full border border-[#E8D5A8] shadow-md opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer z-10"
          aria-label="Zoom image"
        >
          <ZoomIn className="w-4 h-4 text-[#121212]" />
        </button>

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
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-white/90 hover:bg-white text-[#121212] rounded-full border border-[#E8D5A8] shadow-md opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4 text-[#121212]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(i);
                }}
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

      {/* Fullscreen Lightbox */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0B0B0B]/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10"
            onClick={() => setIsLightboxOpen(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer z-10"
              aria-label="Close fullscreen view"
            >
              <X className="w-5 h-5" />
            </button>

            {imagesList.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prevImage();
                  }}
                  className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer z-10"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nextImage();
                  }}
                  className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer z-10"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <AnimatePresence mode="wait">
              <motion.img
                key={activeIndex}
                src={imagesList[activeIndex]}
                alt={`${productName} fullscreen view ${activeIndex + 1}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full object-contain cursor-default"
              />
            </AnimatePresence>

            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white/10 text-white text-xs font-semibold tracking-wider rounded-full">
              {activeIndex + 1} / {imagesList.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
