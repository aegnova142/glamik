import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSHomeBanner } from '@glamirk/shared/types';
import { cloudinaryImageUrl, cloudinarySrcSet } from '@glamirk/shared/utils/cloudinaryImage';
import { DEFAULT_HOME_BANNER_INTERVAL_MS, homeBannerHref } from '@glamirk/shared/utils/homeBanners';

/** Below this width the mobile creative is used. Tailwind's `md`. */
const DESKTOP_QUERY = '(min-width: 768px)';
const SWIPE_THRESHOLD_PX = 50;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

interface HomeBannerCarouselProps {
  /** In-app navigation for internal hrefs, so a click doesn't reload the SPA. */
  onNavigate: (href: string) => void;
}

/** Admin-managed promotional carousel that sits directly above the hero.
 * Renders nothing when there are no live banners, so the hero simply moves up. */
export const HomeBannerCarousel: React.FC<HomeBannerCarouselProps> = ({ onNavigate }) => {
  const { homeBanners, products, categories, isLoading } = useCMS();
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  const slides = useMemo(
    () => (homeBanners?.banners || []).filter((b) => b.desktopImage && !brokenIds.has(b.id)),
    [homeBanners, brokenIds]
  );
  const count = slides.length;
  const intervalMs = homeBanners?.intervalMs || DEFAULT_HOME_BANNER_INTERVAL_MS;

  const [index, setIndex] = useState(0);
  // Slides whose images may load: the current one, the next one (preloaded so
  // autoplay never reveals a blank frame) and everything already seen.
  const [seen, setSeen] = useState<Set<number>>(new Set([0]));
  const [paused, setPaused] = useState(false);
  const [frameRatio, setFrameRatio] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const touch = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    setSeen((prev) => {
      const next = (index + 1) % Math.max(count, 1);
      return prev.has(index) && prev.has(next) ? prev : new Set(prev).add(index).add(next);
    });
  }, [index, count]);

  // Autoplay. Keyed on `index`, so any manual move restarts the full interval
  // instead of jumping again a moment later.
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
  // No slide work while the tab is in the background.
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const onChange = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Autoplay runs for everyone (it is a promo carousel; hover/focus pause it).
  // Reduced-motion only drops the slide animation — see the track transition.
  useEffect(() => {
    if (count <= 1 || paused || tabHidden) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearTimeout(t);
  }, [index, count, paused, tabHidden, intervalMs]);

  if (count === 0) {
    // Reserve space only while content is still loading for the first time;
    // once we know there are no banners the hero takes this spot.
    if (!isLoading) return null;
    return (
      <section aria-hidden="true" className="bg-[#FAF9F6]">
        <div className="aspect-[4/5] w-full animate-pulse bg-[#FCE8ED]/60 md:aspect-[8/3]" />
      </section>
    );
  }

  const go = (i: number) => setIndex(((i % count) + count) % count);
  // Every slide shares one frame, sized to the first slide's real creative
  // (whichever <picture> source the breakpoint picked), so a banner made at
  // the recommended size is shown whole. Until it loads, the recommended
  // ratios hold the space; if any slide lacks a mobile creative the mobile
  // fallback is the desktop ratio, so that slide is not cropped.
  const allHaveMobile = slides.every((s) => s.mobileImage);
  const frameClass = frameRatio ? '' : allHaveMobile ? 'aspect-[4/5] md:aspect-[8/3]' : 'aspect-[8/3]';

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, horizontal: null };
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touch.current;
    if (!start || count <= 1) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    // Decide once per gesture: vertical drags belong to page scroll.
    if (start.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      start.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (start.horizontal) setDragOffset(dx);
  };
  const onTouchEnd = () => {
    if (Math.abs(dragOffset) > SWIPE_THRESHOLD_PX) {
      go(index + (dragOffset < 0 ? 1 : -1));
      suppressClick.current = true;
    } else if (Math.abs(dragOffset) > 8) {
      suppressClick.current = true;
    }
    setDragOffset(0);
    touch.current = null;
    setPaused(false);
  };

  const handleLinkClick = (e: React.MouseEvent, href: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      return;
    }
    // Internal path + plain left click → SPA navigation. Modifier clicks keep
    // native behaviour (open in new tab etc.).
    if (href.startsWith('/') && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      onNavigate(href);
    }
  };

  const renderSlide = (banner: CMSHomeBanner, i: number) => {
    const href = homeBannerHref(banner, products, categories);
    const isCurrent = i === index;
    const load = i === 0 || seen.has(i);
    const alt = banner.altText || banner.name;
    const picture = load ? (
      <picture>
        <source
          media={DESKTOP_QUERY}
          srcSet={cloudinarySrcSet(banner.desktopImage, 'hero') || cloudinaryImageUrl(banner.desktopImage, 'hero')}
          sizes="(min-width: 1440px) 1360px, 100vw"
        />
        <img
          src={cloudinaryImageUrl(banner.mobileImage || banner.desktopImage, 'hero')}
          srcSet={cloudinarySrcSet(banner.mobileImage || banner.desktopImage, 'hero') || undefined}
          sizes="100vw"
          alt={alt}
          draggable={false}
          loading={i === 0 ? 'eager' : 'lazy'}
          fetchPriority={i === 0 ? 'high' : 'low'}
          decoding="async"
          onError={() => setBrokenIds((prev) => new Set(prev).add(banner.id))}
          // Fires again when a resize swaps the desktop/mobile source.
          // Clamped (9:16 … 4:1) so an odd upload can't make the banner taller than a phone screen.
          onLoad={i === 0 ? (e) => {
            const r = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
            setFrameRatio(r ? Math.min(Math.max(r, 9 / 16), 4) : null);
          } : undefined}
          className="h-full w-full object-cover"
        />
      </picture>
    ) : null;

    return (
      <div
        key={banner.id}
        role="group"
        aria-roledescription="slide"
        aria-label={`${i + 1} of ${count}`}
        aria-hidden={!isCurrent}
        className="h-full w-full shrink-0"
      >
        {href ? (
          <a
            href={href}
            tabIndex={isCurrent ? 0 : -1}
            onClick={(e) => handleLinkClick(e, href)}
            {...(/^https?:\/\//i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="block h-full w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#F05A7E]/60"
          >
            {picture}
          </a>
        ) : (
          picture
        )}
      </div>
    );
  };

  return (
    <section aria-roledescription="carousel" aria-label="Featured promotions" className="bg-[#FAF9F6]">
      {/* Full-bleed on purpose: unlike the rest of the homepage, this section
          is not inside the max-width container — it spans the viewport. */}
      <div>
        <div
          className={`relative w-full overflow-hidden bg-[#FCE8ED] ${frameClass}`}
          style={{ touchAction: 'pan-y', ...(frameRatio ? { aspectRatio: String(frameRatio) } : {}) }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(${-index * 100}% + ${dragOffset}px))`,
              transition: dragOffset || reducedMotion ? 'none' : `transform 700ms ${EASE}`,
            }}
          >
            {slides.map(renderSlide)}
          </div>
        </div>

        {count > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {slides.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to promotional banner ${i + 1}`}
                aria-current={i === index}
                className="flex h-6 items-center px-0.5 cursor-pointer"
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    i === index ? 'w-6 bg-[#F05A7E]' : 'w-2 bg-[#E8D5A8] hover:bg-[#F05A7E]/50'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
