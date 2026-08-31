/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Product, TryOnConfig, TryOnType, TryOnRegion } from '../types';
import {
  LIP_OUTER_RING,
  LIP_INNER_RING,
  RIGHT_EYE_LOWER_LASH,
  LEFT_EYE_LOWER_LASH,
  FACE_OVAL_RING,
  RIGHT_CHEEK_ANCHOR,
  LEFT_CHEEK_ANCHOR,
} from './faceMesh';

const DEFAULT_CONFIG: TryOnConfig = { enabled: true, type: 'lipstick', region: 'lips', intensity: 70, opacity: 85 };

/** A product with no admin Try-On configuration still needs to behave
 * sensibly rather than default to lipstick logic for everything — this
 * infers a reasonable type/region from the product's existing
 * category/subCategory, which every product already has. Explicit admin
 * configuration (product.tryOnConfig) always wins when present. */
export function resolveTryOnConfig(product: Product): TryOnConfig {
  if (product.tryOnConfig) return product.tryOnConfig;

  const sub = (product.subCategory || '').toLowerCase();
  let type: TryOnType = 'lipstick';
  let region: TryOnRegion = 'lips';
  if (sub.includes('eye') && !sub.includes('eyeliner')) {
    type = 'kajal';
    region = 'eyes';
  } else if (sub.includes('liner')) {
    type = 'eyeliner';
    region = 'eyes';
  } else if (sub.includes('face') || sub.includes('foundation') || sub.includes('skin') || sub.includes('cleans')) {
    type = 'foundation';
    region = 'fullFace';
  } else if (sub.includes('blush') || sub.includes('cheek')) {
    type = 'blush';
    region = 'cheeks';
  } else if (sub.includes('lip')) {
    type = 'lipstick';
    region = 'lips';
  }

  return { ...DEFAULT_CONFIG, type, region };
}

function ringToPath(landmarks: NormalizedLandmark[], ring: number[], width: number, height: number): Path2D {
  const path = new Path2D();
  ring.forEach((idx, i) => {
    const lm = landmarks[idx];
    if (!lm) return;
    const x = lm.x * width;
    const y = lm.y * height;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '#F05A7E').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Fills the lip region only — outer ring minus inner ring (evenodd),
 * excluding the mouth interior so teeth/mouth cavity never get tinted.
 * `multiply` preserves the source pixels' own shading/highlights instead
 * of flattening them into a solid color; a light `soft-light` pass adds
 * the shade's saturation back in so it doesn't read as just "darkened". */
function applyLips(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number, hex: string, opacity: number) {
  const combined = new Path2D();
  combined.addPath(ringToPath(landmarks, LIP_OUTER_RING, width, height));
  combined.addPath(ringToPath(landmarks, LIP_INNER_RING, width, height));

  ctx.save();
  ctx.clip(combined, 'evenodd');

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = opacity;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = Math.min(1, opacity * 0.7);
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

/** Strokes along the lower lash line for both eyes — kajal/eyeliner are
 * a line along the lid, not a filled region. */
function applyEyeliner(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number, hex: string, opacity: number, intensity: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = hex;
  ctx.lineWidth = Math.max(1, (intensity / 100) * width * 0.012);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ring of [RIGHT_EYE_LOWER_LASH, LEFT_EYE_LOWER_LASH]) {
    ctx.beginPath();
    ring.forEach((idx, i) => {
      const lm = landmarks[idx];
      if (!lm) return;
      const x = lm.x * width;
      const y = lm.y * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

/** Soft full-face tint clipped to the face oval — a wash, not a flat
 * mask, since foundation coverage should read as skin-tone correction
 * rather than a solid color block. */
function applyFullFace(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number, hex: string, opacity: number) {
  const path = ringToPath(landmarks, FACE_OVAL_RING, width, height);
  ctx.save();
  ctx.clip(path);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = opacity * 0.6;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Feathered radial tint centered on each cheekbone — used for blush and
 * (at lower default opacity) highlighter. */
function applyCheeks(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number, hex: string, opacity: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const anchorIdx of [RIGHT_CHEEK_ANCHOR, LEFT_CHEEK_ANCHOR]) {
    const lm = landmarks[anchorIdx];
    if (!lm) continue;
    const cx = lm.x * width;
    const cy = lm.y * height;
    const r = width * 0.09;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, hexToRgba(hex, opacity));
    gradient.addColorStop(1, hexToRgba(hex, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draws the configured Try-On effect for one detected face onto an
 * already-drawn source frame. Region always wins over type when both are
 * set (region is the more specific, admin-intentional choice). */
export function renderTryOnEffect(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  hex: string,
  config: TryOnConfig
) {
  const opacity = Math.max(0, Math.min(1, (config.opacity ?? 85) / 100));
  const intensity = config.intensity ?? 70;

  const region = config.region;
  if (region === 'lips') return applyLips(ctx, landmarks, width, height, hex, opacity);
  if (region === 'eyes' || region === 'underEyes') return applyEyeliner(ctx, landmarks, width, height, hex, opacity, intensity);
  if (region === 'fullFace') return applyFullFace(ctx, landmarks, width, height, hex, opacity);
  if (region === 'cheeks') return applyCheeks(ctx, landmarks, width, height, hex, opacity);

  // 'custom' / unrecognized region — fall back to the type.
  if (config.type === 'kajal' || config.type === 'eyeliner') return applyEyeliner(ctx, landmarks, width, height, hex, opacity, intensity);
  if (config.type === 'foundation' || config.type === 'concealer' || config.type === 'skin') return applyFullFace(ctx, landmarks, width, height, hex, opacity);
  if (config.type === 'blush' || config.type === 'highlighter') return applyCheeks(ctx, landmarks, width, height, hex, opacity);
  return applyLips(ctx, landmarks, width, height, hex, opacity);
}
