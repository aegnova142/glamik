import React, { useEffect, useMemo, useState } from 'react';
import { CMSHeroBackground } from '../../types';

const DEFAULT_INTERVAL_MS = 3000;
const TRANSITION_MS = 900;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

interface HeroBackgroundCarouselProps {
  images: CMSHeroBackground[];
  /** Portion 2's own interval, independent of the Portion 1 slide timer. Default 3000ms. */
  intervalMs?: number;
}

/** Portion 2 — the decorative background frame behind the hero. Entirely
 * self-contained: its own timer, its own state, no knowledge of Portion 1's
 * slide index or timing. Renders nothing when there are no active images so
 * the section's own neutral background shows through. */
export const HeroBackgroundCarousel: React.FC<HeroBackgroundCarouselProps> = ({ images, intervalMs }) => {
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  const activeImages = useMemo(
    () => images.filter((bg) => bg.isActive !== false && bg.image && !brokenIds.has(bg.id)),
    [images, brokenIds]
  );

  const [index, setIndex] = useState(0);

  // Keep the index valid if the active list shrinks (disabled, deleted, or a
  // broken image dropped out from underneath the currently-shown slot).
  useEffect(() => {
    if (index >= activeImages.length) setIndex(0);
  }, [activeImages.length, index]);

  useEffect(() => {
    if (activeImages.length <= 1) return;
    const ms = intervalMs && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % activeImages.length);
    }, ms);
    return () => clearInterval(timer);
  }, [activeImages.length, intervalMs]);

  const handleImageError = (id: string) => {
    setBrokenIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  if (activeImages.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {activeImages.map((bg, i) => (
        <img
          key={bg.id}
          src={bg.image}
          alt=""
          draggable={false}
          onError={() => handleImageError(bg.id)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: i === index ? 1 : 0,
            transition: activeImages.length > 1 ? `opacity ${TRANSITION_MS}ms ${EASE}` : 'none',
          }}
        />
      ))}
    </div>
  );
};
