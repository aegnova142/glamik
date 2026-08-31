import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { TryOnConfig } from '../../types';
import { renderTryOnEffect } from '../../utils/tryOnRenderer';

export interface TryOnCanvasHandle {
  /** Draws `source` into the canvas at its native resolution, then (if
   * landmarks were detected) composites the configured makeup effect on
   * top. Imperative on purpose — the live-camera loop calls this directly
   * from a requestAnimationFrame callback at ~12fps, and routing that
   * through React state/props would mean a full re-render per frame. */
  draw: (
    source: HTMLImageElement | HTMLVideoElement,
    landmarks: NormalizedLandmark[] | null,
    hex: string,
    config: TryOnConfig
  ) => void;
  clear: () => void;
}

interface TryOnCanvasProps {
  className?: string;
  /** Mirrors the whole rendered bitmap (video + overlay together) for a
   * natural "looking in a mirror" self-view during live camera. */
  mirror?: boolean;
}

export const TryOnCanvas = forwardRef<TryOnCanvasHandle, TryOnCanvasProps>(({ className, mirror }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      draw: (source, landmarks, hex, config) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
        const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
        if (!width || !height) return;

        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(source, 0, 0, width, height);

        if (landmarks && config.enabled) {
          renderTryOnEffect(ctx, landmarks, width, height, hex, config);
        }
      },
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
    }),
    []
  );

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
      aria-label="Virtual try-on preview"
    />
  );
});

TryOnCanvas.displayName = 'TryOnCanvas';
