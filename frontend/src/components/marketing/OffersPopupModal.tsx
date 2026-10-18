import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { LivePrivilegesPopupView } from '@glamirk/shared/components';
import type { LivePrivilegesPopupConfig } from '@glamirk/shared/types';
import type { LivePrivilegesCard } from '@glamirk/shared/utils/livePrivilegesPopup';
import { isSafeBannerUrl } from '@glamirk/shared/utils/homeBanners';

interface OffersPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LivePrivilegesPopupConfig;
  cards: LivePrivilegesCard[];
  /** Navigates to the CTA destination (an in-app path or https URL). */
  onNavigate: (url: string) => void;
}

/**
 * "Live Privileges For You" — the admin-managed popup on Shop the Look.
 * Content, theme and offer cards all come from the published CMS config;
 * this component only adds dialog behaviour around the shared view.
 */
export const OffersPopupModal: React.FC<OffersPopupModalProps> = ({ isOpen, onClose, config, cards, onNavigate }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape, focus trap, scroll lock, focus return — same contract as the
  // sign-in dialog.
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const raf = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('button[aria-label="Close offers"]')?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen]);

  const handleCta = () => {
    onClose();
    // Validated on save as well; checked again here because it becomes a
    // navigation target.
    if (config.cta.url && isSafeBannerUrl(config.cta.url)) onNavigate(config.cta.url.trim());
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="live-privileges"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6"
          >
            {/* Backdrop: click to close, like the previous popup. */}
            <div
              aria-hidden="true"
              onClick={onClose}
              className="absolute inset-0"
              style={{
                background: `rgba(11, 11, 11, ${config.layout.overlayOpacity})`,
                backdropFilter: `blur(${config.layout.blurPx}px)`,
                WebkitBackdropFilter: `blur(${config.layout.blurPx}px)`,
              }}
            />
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="live-privileges-title"
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
              className="relative w-full flex justify-center max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain rounded-[22px]"
              style={{ maxWidth: config.layout.maxWidth }}
            >
              <LivePrivilegesPopupView
                config={config}
                cards={cards}
                titleId="live-privileges-title"
                onClose={onClose}
                onCta={handleCta}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
};
