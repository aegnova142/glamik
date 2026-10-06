// [Glamik CMS] 2026-10-06 — reusable admin-controlled background layer for any
// homepage section. Schedule- & priority-aware selection, responsive
// desktop/tablet/mobile artwork, optional crossfade rotation with preload,
// optional overlay. Purely visual: absolute, pointer-events-none, aria-hidden,
// never affects layout. Renders nothing when a section has no eligible
// background, so the section's own design remains the fallback.
import React, { useEffect, useMemo, useState } from 'react';
import { CMSBackgroundItem } from '@glamirk/shared/types';
import { useCMS } from '@glamirk/shared/context/CMSContext';

type Tier = 'mobile' | 'tablet' | 'desktop';

const useTier = (): Tier => {
  const get = (): Tier => {
    if (typeof window === 'undefined') return 'desktop';
    const w = window.innerWidth;
    return w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  };
  const [tier, setTier] = useState<Tier>(get);
  useEffect(() => {
    const onResize = () => setTier(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return tier;
};

const urlFor = (item: CMSBackgroundItem, tier: Tier): string =>
  (tier === 'mobile' ? item.mobileImage : tier === 'tablet' ? item.tabletImage : item.desktopImage) ||
  item.desktopImage;

const OVERLAY_COLORS: Record<string, string> = {
  ivory: '#FFFBF4',
  blush: '#FCE7EC',
  white: '#FFFFFF',
  dark: '#1A1012',
};

interface SectionBackgroundProps {
  sectionKey: string;
  /** Optional extra classes for the wrapper (e.g. rounded corners). */
  className?: string;
}

export const SectionBackground: React.FC<SectionBackgroundProps> = ({ sectionKey, className = '' }) => {
  const { homepageBackgrounds, serverTime } = useCMS();
  const tier = useTier();
  const [idx, setIdx] = useState(0);
  // gentle fade-in on first appearance
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, []);

  const section = homepageBackgrounds?.sections.find((s) => s.sectionKey === sectionKey);

  // Eligible = active + (no schedule OR within window), highest priority first.
  const eligible = useMemo(() => {
    if (!section) return [];
    const now = serverTime ? Date.parse(serverTime) : Date.now();
    return (section.items || [])
      .filter((it) => {
        if (!it.isActive || !it.desktopImage) return false;
        if (it.startAt && Date.parse(it.startAt) > now) return false;
        if (it.endAt && Date.parse(it.endAt) < now) return false;
        return true;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }, [section, serverTime]);

  const rotate = !!section?.rotationEnabled && eligible.length > 1;
  const transition = section?.transition ?? 'crossfade';

  // Keep index valid as the eligible list changes.
  useEffect(() => {
    if (idx >= eligible.length) setIdx(0);
  }, [eligible.length, idx]);

  // Rotation timer + preload of the next image (no white flash).
  useEffect(() => {
    if (!rotate) return;
    const ms = section?.rotationIntervalMs && section.rotationIntervalMs > 0 ? section.rotationIntervalMs : 6000;
    const next = eligible[(idx + 1) % eligible.length];
    if (next) {
      const pre = new Image();
      pre.src = urlFor(next, tier);
    }
    const t = setTimeout(() => setIdx((p) => (p + 1) % eligible.length), ms);
    return () => clearTimeout(t);
  }, [rotate, idx, eligible, section, tier]);

  if (!section || eligible.length === 0) return null;

  const activeIndex = idx % eligible.length;
  const dur = transition === 'none' ? 0 : 900;

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {eligible.map((item, i) => (
        <img
          key={item.id}
          src={urlFor(item, tier)}
          alt=""
          draggable={false}
          loading={i === 0 ? 'eager' : 'lazy'}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: item.fit === 'contain' ? 'contain' : 'cover',
            objectPosition: item.position || 'center',
            // "halka halka": image shows at its configured strength (default faint),
            // multiplied by the crossfade/mount visibility.
            opacity: (i === activeIndex && mounted ? 1 : 0) * ((item.opacity ?? 30) / 100),
            transition: `opacity ${Math.max(dur, 600)}ms cubic-bezier(0.22,1,0.36,1)`,
          }}
        />
      ))}
      {/* optional overlay for the active item */}
      {(() => {
        const cur = eligible[activeIndex];
        if (!cur || !cur.overlay || cur.overlay === 'none' || !cur.overlayOpacity) return null;
        return (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: OVERLAY_COLORS[cur.overlay] || '#FFFFFF', opacity: Math.min(30, cur.overlayOpacity) / 100 }}
          />
        );
      })()}
    </div>
  );
};
