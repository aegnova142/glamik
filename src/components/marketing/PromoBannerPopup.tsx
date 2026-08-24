import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCMS } from '../../context/CMSContext';

const SESSION_KEY = 'glamirk_promo_banner_popup_shown';
const OPEN_DELAY_MS = 800;
const MAX_DISPLAY_MS = 60000;
const DEFAULT_INTERVAL_MS = 4000;
const SWIPE_THRESHOLD_PX = 50;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Homepage promotional popup carousel — a temporary premium overlay, fully
 * isolated from the existing hero/homepage layout (fixed positioning, own
 * z-index tier, zero layout shift). Admin-managed via "Promo Banner Popup". */
export const PromoBannerPopup: React.FC = () => {
  const { promoBanners } = useCMS();

  const validBanners = useMemo(
    () => (promoBanners?.banners || []).filter((b) => b.image && b.isActive !== false),
    [promoBanners]
  );
  const enabled = !!promoBanners?.enabled;
  const intervalMs = promoBanners?.intervalMs && promoBanners.intervalMs > 0 ? promoBanners.intervalMs : DEFAULT_INTERVAL_MS;

  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasScheduledRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Schedule the ~800ms opening once valid banners exist, at most once per session.
  useEffect(() => {
    if (hasScheduledRef.current) return;
    if (!enabled || validBanners.length === 0) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    hasScheduledRef.current = true;
    const timer = setTimeout(() => {
      setCurrentIndex(0);
      setIsOpen(true);
      sessionStorage.setItem(SESSION_KEY, '1');
    }, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, validBanners.length]);

  const handleClose = () => setIsOpen(false);

  // Auto-slide — restarts cleanly whenever the index changes (auto or manual),
  // giving "reset timer on manual navigation" for free.
  useEffect(() => {
    if (!isOpen || validBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % validBanners.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isOpen, currentIndex, validBanners.length, intervalMs]);

  // Maximum total display time.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setIsOpen(false), MAX_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Lock background scroll while open; always restore on close/unmount.
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Keyboard: Escape closes, arrows navigate.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowLeft' && validBanners.length > 1) {
        setCurrentIndex((i) => (i - 1 + validBanners.length) % validBanners.length);
      } else if (e.key === 'ArrowRight' && validBanners.length > 1) {
        setCurrentIndex((i) => (i + 1) % validBanners.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, validBanners.length]);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  if (!enabled || validBanners.length === 0) return null;

  const current = validBanners[Math.min(currentIndex, validBanners.length - 1)];

  const handlePrev = () => setCurrentIndex((i) => (i - 1 + validBanners.length) % validBanners.length);
  const handleNext = () => setCurrentIndex((i) => (i + 1) % validBanners.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX || validBanners.length <= 1) return;
    if (delta < 0) handleNext();
    else handlePrev();
  };

  const handleBannerClick = () => {
    const link = current.link?.trim();
    if (!link) return;
    if (/^https?:\/\//i.test(link)) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = link;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Promotional offer">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={handleClose}
            className="absolute inset-0 bg-[#0B0B0B]/45"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, ease: EASE }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative z-10 max-w-full max-h-full sm:max-w-[78vw] sm:max-h-[85vh] lg:max-w-[1200px]"
          >
            {/* True crossfade: "popLayout" pulls the outgoing banner out of
                document flow (frozen at its own size) while it fades out, so
                the incoming banner lays out and fades in at the same time
                instead of waiting for the old one to fully disappear first
                — no sequential "flash", and the container never collapses
                since the in-flow (entering) image still drives its size. */}
            <AnimatePresence mode="popLayout">
              <motion.img
                key={current.id}
                src={current.image}
                alt={current.altText || 'Promotional offer'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: EASE }}
                onClick={handleBannerClick}
                draggable={false}
                className={`block w-auto h-auto max-w-full max-h-full sm:max-w-[78vw] sm:max-h-[85vh] lg:max-w-[1200px] rounded-[18px] shadow-2xl object-contain ${
                  current.link ? 'cursor-pointer' : ''
                }`}
              />
            </AnimatePresence>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              aria-label="Close promotional offer"
              className="absolute top-3 right-3 p-2.5 rounded-full bg-white/85 hover:bg-white text-[#121212] shadow-md backdrop-blur-sm transition-all hover:scale-105 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {validBanners.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Previous banner"
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/85 hover:bg-white text-[#121212] shadow-md backdrop-blur-sm transition-all hover:scale-105 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Next banner"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/85 hover:bg-white text-[#121212] shadow-md backdrop-blur-sm transition-all hover:scale-105 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/85 backdrop-blur-sm shadow-md">
                  <span className="text-[10px] font-mono font-semibold text-[#121212] tracking-wider">
                    {String(currentIndex + 1).padStart(2, '0')} / {String(validBanners.length).padStart(2, '0')}
                  </span>
                  <div className="w-16 h-1 rounded-full bg-[#E8D5A8]/50 overflow-hidden">
                    <div
                      className="h-full bg-[#C9972B] rounded-full transition-all duration-300"
                      style={{ width: `${((currentIndex + 1) / validBanners.length) * 100}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
