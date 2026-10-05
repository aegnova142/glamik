/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// [Glamik CMS] Added 2026-10-03 — reusable before/after comparison slider for
// the Find Your Perfect Match section. Broken-image guards added 2026-10-05.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';

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
        <img src={afterImage} alt={`${alt} — ${afterLabel}`} draggable={false} onError={() => setAfterOk(false)} className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* BEFORE (clipped to the left of the divider) */}
      {showBefore && (
        <img
          src={beforeImage}
          alt={`${alt} — ${beforeLabel}`}
          draggable={false}
          onError={() => setBeforeOk(false)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
      )}

      {/* Labels */}
      {showBefore && (
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#5C4A4E]/85 text-white text-[11px] font-semibold tracking-wide backdrop-blur-sm pointer-events-none">
          {beforeLabel}
        </span>
      )}
      {showAfter && (
        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#E0265F] text-white text-[11px] font-semibold tracking-wide pointer-events-none">
          {afterLabel}
        </span>
      )}

      {/* Divider + handle (only when both images exist to compare) */}
      {showBefore && showAfter && (
        <>
          <div className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.25)] pointer-events-none" style={{ left: `${pos}%`, transform: 'translateX(-50%)' }} />
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
            className="absolute top-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.3)] flex items-center justify-center text-[#E0265F] cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E0265F]"
            style={{ left: `${pos}%` }}
          >
            <ChevronLeft className="w-3.5 h-3.5 -mr-0.5" />
            <ChevronRight className="w-3.5 h-3.5 -ml-0.5" />
          </button>
        </>
      )}
    </div>
  );
};
