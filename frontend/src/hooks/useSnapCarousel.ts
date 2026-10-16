import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Paging for a native scroll-snap track (overflow-x-auto + snap-start
 * children). A "page" is however many children fit the track right now, so the
 * dots stay right as breakpoints change the card width. Swipe comes free from
 * native scrolling; give the track `motion-safe:scroll-smooth` so reduced
 * motion gets an instant jump.
 *
 * `wrap` loops past either end (homepage reviews); without it the ends stop.
 */
export function useSnapCarousel(itemCount: number, { wrap = false } = {}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return null;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const perView = Math.max(1, Math.floor((track.clientWidth + gap) / (card.offsetWidth + gap)));
    return {
      track,
      step: perView * (card.offsetWidth + gap),
      pages: Math.ceil(track.children.length / perView),
      max: track.scrollWidth - track.clientWidth,
    };
  }, []);

  const sync = useCallback(() => {
    const m = measure();
    if (!m) return;
    setPageCount(m.pages);
    setPage(m.track.scrollLeft >= m.max - 2 ? m.pages - 1 : Math.round(m.track.scrollLeft / m.step));
  }, [measure]);

  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync, itemCount]);

  const goTo = (target: number) => {
    const m = measure();
    if (!m) return;
    const next = wrap ? (target + m.pages) % m.pages : Math.min(Math.max(target, 0), m.pages - 1);
    m.track.scrollTo({ left: Math.min(next * m.step, m.max) });
  };

  return { trackRef, page, pageCount, goTo, onScroll: sync };
}
