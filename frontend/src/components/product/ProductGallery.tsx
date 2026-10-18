import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, ImageOff, Play, ZoomIn, X } from 'lucide-react';
import type { ProductVideo } from '@glamirk/shared/types';
import { cloudinaryImageUrl, cloudinarySrcSet } from '@glamirk/shared/utils/cloudinaryImage';
import { cloudinaryVideoPoster, cloudinaryVideoUrl } from '@glamirk/shared/utils/cloudinaryVideo';

interface ProductGalleryProps {
  images: { url: string; alt?: string }[];
  /** Product videos, shown after the images (same for every shade). */
  videos?: ProductVideo[];
  /** Changes exactly when the gallery should jump back to its first image —
   * e.g. when the selected variant/shade changes. Without this, switching
   * from a variant you were mid-browsing (e.g. viewing image 3 of 4) to one
   * with fewer images would leave activeIndex pointing past the end of the
   * new list. */
  resetKey: string;
  productName: string;
  tag?: string;
}

type Slide =
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string; poster: string; title?: string };

export const ProductGallery: React.FC<ProductGalleryProps> = ({
  images,
  videos,
  resetKey,
  productName,
  tag,
}) => {
  const slides: Slide[] = [
    ...images.map((img): Slide => ({ kind: 'image', url: img.url })),
    ...(videos || [])
      .filter((v) => v.url)
      .map((v): Slide => ({ kind: 'video', url: v.url, poster: v.posterUrl || cloudinaryVideoPoster(v.url), title: v.title })),
  ];

  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // The selected variant/product changed — always land on its primary image
  // rather than carrying over an index that may not exist in the new gallery.
  useEffect(() => {
    setActiveIndex(0);
    setIsLightboxOpen(false);
  }, [resetKey]);

  // A video removed while it was showing must not leave the index dangling.
  const safeIndex = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const active = slides[safeIndex];

  const nextImage = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const prevImage = () => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
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
  }, [isLightboxOpen, slides.length]);

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

  // No usable image or video anywhere on this product/variant — e.g. every
  // image field was cleared pending a real upload. The thumbnail strip and
  // lightbox exist to navigate between multiple items, so showing them for
  // zero is pure dead chrome; a single placeholder frame is the honest state.
  if (slides.length === 0) {
    return (
      <div className="flex flex-col-reverse md:flex-row gap-4 w-full">
        <div className="relative flex-1 aspect-[4/5] bg-[#FCE8ED] border border-[#E8D5A8] rounded-2xl md:rounded-3xl overflow-hidden flex flex-col items-center justify-center gap-2 text-[#C8899B]">
          <ImageOff className="w-8 h-8" strokeWidth={1.5} aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">Image coming soon</span>
        </div>
      </div>
    );
  }

  const slideLabel = (s: Slide, idx: number) =>
    s.kind === 'video' ? `Play ${s.title || `video ${idx + 1 - images.length}`}` : `View image ${idx + 1}`;

  return (
    <div className="flex flex-col-reverse md:flex-row gap-4 w-full">
      {/* Vertical Thumbnails (Desktop) */}
      <div className="flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto no-scrollbar md:w-20 flex-shrink-0">
        {slides.map((slide, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`relative w-16 h-20 md:w-20 md:h-24 flex-shrink-0 rounded-xl overflow-hidden bg-[#FCE8ED] border transition-all duration-200 cursor-pointer flex items-center justify-center ${
              safeIndex === idx
                ? 'border-[#F05A7E] ring-2 ring-[#F05A7E]/30 opacity-100 shadow-sm'
                : 'border-[#E8D5A8] opacity-60 hover:opacity-100'
            }`}
            aria-label={slideLabel(slide, idx)}
          >
            {slide.kind === 'image' ? (
              /* An 80px-wide chip. Serving the full original here meant the
                 gallery downloaded every product photo at full resolution
                 twice over — once for the strip, once for the main frame. */
              <img
                src={cloudinaryImageUrl(slide.url, 'thumb')}
                alt={`${productName} thumbnail ${idx + 1}`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-contain"
              />
            ) : (
              <>
                {slide.poster ? (
                  <img src={slide.poster} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <span className="absolute inset-0 bg-[#121212]" />
                )}
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-white/90 text-[#F05A7E] shadow">
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                  </span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>

      {/* Main Large Visual Frame */}
      <div
        className={`relative flex-1 aspect-[4/5] bg-[#FCE8ED] border border-[#E8D5A8] rounded-2xl md:rounded-3xl overflow-hidden group shadow-xs flex items-center justify-center ${
          active.kind === 'image' ? 'cursor-zoom-in' : ''
        }`}
        onClick={() => active.kind === 'image' && setIsLightboxOpen(true)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          {active.kind === 'image' ? (
            /* The product page's main image, and its LCP element: eager, high
               priority, never lazy. Delivered at the 'gallery' tier
               (q_auto:best) because this is where a customer judges a shade. */
            <motion.img
              key={safeIndex}
              src={cloudinaryImageUrl(active.url, 'gallery')}
              srcSet={cloudinarySrcSet(active.url, 'gallery') || undefined}
              sizes="(max-width: 768px) 100vw, 45vw"
              alt={`${productName} view ${safeIndex + 1}`}
              loading={safeIndex === 0 ? 'eager' : 'lazy'}
              fetchPriority={safeIndex === 0 ? 'high' : undefined}
              decoding="async"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full object-contain object-center group-hover:scale-103 transition-transform duration-700 ease-out"
            />
          ) : (
            /* Keyed by index: switching slides unmounts it, which stops playback. */
            <motion.video
              key={safeIndex}
              src={cloudinaryVideoUrl(active.url)}
              poster={active.poster || undefined}
              controls
              playsInline
              preload="metadata"
              aria-label={active.title || `${productName} video`}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full object-contain bg-[#0B0B0B]"
            />
          )}
        </AnimatePresence>

        {/* Zoom trigger — images only; a video has its own fullscreen control. */}
        {active.kind === 'image' && (
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
        )}

        {/* Tag badge */}
        {tag && (
          <span className="absolute top-3.5 left-3.5 px-3 py-1 bg-white/95 backdrop-blur-xs text-[#F05A7E] text-[10px] font-bold tracking-wider uppercase border border-[#E8D5A8] rounded-full shadow-xs">
            {tag}
          </span>
        )}

        {/* Mobile / Hover Arrow Controls */}
        {slides.length > 1 && (
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

        {/* Mobile Pagination Dots — kept clear of the video's own controls. */}
        {slides.length > 1 && active.kind === 'image' && (
          <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 bg-white/85 backdrop-blur-xs border border-[#E8D5A8] rounded-full shadow-xs">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(i);
                }}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  safeIndex === i
                    ? 'w-4 h-1.5 bg-[#F05A7E]'
                    : 'w-1.5 h-1.5 bg-[#6B6B6B]/30 hover:bg-[#F05A7E]/50'
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Image Counter Pill (Desktop) */}
        {active.kind === 'image' && (
          <div className="hidden md:block absolute bottom-3.5 right-3.5 px-2.5 py-1 bg-white/90 backdrop-blur-xs text-[#121212] text-[10px] font-bold tracking-wider rounded-full border border-[#E8D5A8] shadow-xs">
            {safeIndex + 1} / {slides.length}
          </div>
        )}
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

            {slides.length > 1 && (
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
              {active.kind === 'image' ? (
                /* The zoom view: the largest tier, because the whole point of
                   opening it is to look closely at texture and colour. */
                <motion.img
                  key={safeIndex}
                  src={cloudinaryImageUrl(active.url, 'detail')}
                  srcSet={cloudinarySrcSet(active.url, 'detail') || undefined}
                  sizes="100vw"
                  decoding="async"
                  alt={`${productName} fullscreen view ${safeIndex + 1}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-full max-h-full object-contain cursor-default"
                />
              ) : (
                <motion.video
                  key={safeIndex}
                  src={cloudinaryVideoUrl(active.url)}
                  poster={active.poster || undefined}
                  controls
                  autoPlay
                  playsInline
                  aria-label={active.title || `${productName} video`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-full max-h-full object-contain cursor-default"
                />
              )}
            </AnimatePresence>

            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white/10 text-white text-xs font-semibold tracking-wider rounded-full">
              {safeIndex + 1} / {slides.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
