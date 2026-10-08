/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// [Glamik CMS] Added 2026-10-03 — reusable before/after comparison slider for
// the Find Your Perfect Match section. Broken-image guards added 2026-10-05.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { responsiveImage } from '@glamirk/shared/utils/cloudinaryImage';

interface BeforeAfterSliderProps {
  beforeImage?: string;
  afterImage?: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** Alt text base, e.g. the configuration title. */
  alt?: string;
  className?: string;
}

/**
 * Interactive before/after comparison. The AFTER image is the base layer; the
 * BEFORE image is clipped to the left of a draggable divider. Works with mouse,
 * touch and keyboard (arrow keys on the handle). Missing media degrades to a
 * placeholder rather than a broken image.
 */
export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeImage,
  afterImage,
  beforeLabel = 'Before',
  afterLabel = 'After',
  alt = 'Shade comparison',
  className = '',
}) => {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [beforeOk, setBeforeOk] = useState(true);
  const [afterOk, setAfterOk] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBeforeOk(true);
  }, [beforeImage]);
  useEffect(() => {
    setAfterOk(true);
  }, [afterImage]);

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setFromClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, setFromClientX]);

  const showBefore = beforeImage && beforeOk;
  const showAfter = afterImage && afterOk;
  const hasMedia = showBefore || showAfter;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none touch-none ${className}`}
      onPointerDown={(e) => {
        setDragging(true);
        setFromClientX(e.clientX);
      }}
    >
      {!hasMedia && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FCE8ED] text-[#C9972B]/50">
          <ImageOff className="w-8 h-8" aria-hidden="true" />
        </div>
      )}

      {/* AFTER (base) */}
      {showAfter && (
        <img {...responsiveImage(afterImage, 'gallery')} alt={`${alt} — ${afterLabel}`} draggable={false} loading="lazy" decoding="async" onError={() => setAfterOk(false)} className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* BEFORE (clipped to the left of the divider) */}
      {showBefore && (
        <img
          {...responsiveImage(beforeImage, 'gallery')}
          alt={`${alt} — ${beforeLabel}`}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setBeforeOk(false)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
      )}

      {/* Labels — small frosted tags, kept to the top corners, clear of the face */}
      {showBefore && (
        <span className="absolute top-4 left-4 px-2.5 py-1 rounded-full bg-[#FAF9F6]/80 backdrop-blur-md text-[#1A1012] text-[9px] font-bold uppercase tracking-[0.2em] ring-1 ring-white/60 pointer-events-none">
          {beforeLabel}
        </span>
      )}
      {showAfter && (
        <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-[#FAF9F6]/80 backdrop-blur-md text-[#E0265F] text-[9px] font-bold uppercase tracking-[0.2em] ring-1 ring-white/60 pointer-events-none">
          {afterLabel}
        </span>
      )}

      {/* Divider + handle (only when both images exist to compare) */}
      {showBefore && showAfter && (
        <>
          <div className="absolute top-0 bottom-0 w-px bg-white/85 shadow-[0_0_6px_rgba(0,0,0,0.18)] pointer-events-none" style={{ left: `${pos}%`, transform: 'translateX(-50%)' }} />
          <button
            type="button"
            role="slider"
            aria-label="Drag to compare before and after"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragging(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 4));
              if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 4));
            }}
            className="absolute top-1/2 w-11 h-11 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ew-resize focus:outline-none group"
            style={{ left: `${pos}%` }}
          >
            {/* 44px touch target around a 34px frosted handle */}
            <span className="w-[34px] h-[34px] rounded-full bg-white/85 backdrop-blur-md ring-1 ring-white shadow-[0_4px_12px_rgba(26,16,18,0.18)] flex items-center justify-center text-[#1A1012] transition-transform group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[#E0265F]">
              <ChevronLeft className="w-3 h-3 -mr-0.5" />
              <ChevronRight className="w-3 h-3 -ml-0.5" />
            </span>
          </button>
        </>
      )}
    </div>
  );
};
