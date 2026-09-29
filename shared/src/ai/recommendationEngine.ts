import { BeautyProfile, RecommendationMatch, Product, Shade } from '../types';

/**
 * Deterministic, transparent recommendation engine matching a user's Find
 * My Shade answers against the LIVE product catalog (whatever the admin
 * currently has published) — never a single hardcoded product/shade.
 *
 * Scoring (highest priority first, mirrors the weights a human colorist
 * would apply):
 *   +40  shade undertone exactly matches the user's undertone
 *   +25  shade undertone is "Universal" (works reasonably for anyone)
 *   +15  shade undertone is "Neutral" (partial credit)
 *   +15  product finish matches the user's finish preference
 *   +20  (scaled by hex luminance) style/occasion depth preference —
 *        bold/evening occasions favor richer pigments, everyday/natural
 *        favor lighter, more wearable tones
 *   +5   shade/product is actually in stock
 */

function hexLuminance(hex: string | undefined): number {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return 0.5;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => isNaN(v))) return 0.5;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

interface ScoredShade {
  product: Product;
  shade: Shade;
  score: number;
  reasonParts: string[];
}

function scoreShade(product: Product, shade: Shade, profile: BeautyProfile): ScoredShade {
  let score = 0;
  const reasonParts: string[] = [];

  if (shade.undertone === profile.undertone) {
    score += 40;
    reasonParts.push(`${profile.undertone} Undertone Match`);
  } else if (shade.undertone === 'Universal') {
    score += 25;
    reasonParts.push('Universal Undertone');
  } else if (shade.undertone === 'Neutral') {
    score += 15;
  }

  const profileFinish = profile.finish || profile.finishPreference;
  if (product.finish && profileFinish && product.finish.toLowerCase().includes(profileFinish.toLowerCase())) {
    score += 15;
    reasonParts.push(`${profileFinish} Finish`);
  }

  const profileStyle = profile.style || profile.stylePreference;
  const wantsBold =
    profileStyle === 'Bold' ||
    profileStyle === 'Glam' ||
    profile.occasion === 'Wedding' ||
    profile.occasion === 'Party' ||
    profile.occasion === 'Date Night' ||
    profile.occasion === 'Festive';
  const luminance = hexLuminance(shade.hex);
  if (wantsBold) {
    score += (1 - luminance) * 20;
    if (luminance < 0.45) reasonParts.push(`${profile.occasion} Statement Depth`);
  } else {
    score += luminance * 20;
    if (luminance >= 0.45 && profileStyle) reasonParts.push(`${profileStyle} Everyday Wearability`);
  }

  const shadeStock = shade.stock ?? product.stock;
  if (product.inStock !== false && (shadeStock === undefined || shadeStock > 0)) {
    score += 5;
  }

  return { product, shade, score, reasonParts };
}

/**
 * Returns null when the catalog has no eligible (active, in-stock) shaded
 * products to recommend from — callers must show a genuine empty state in
 * that case, never a fabricated "match".
 */
export function generateBeautyMatch(profile: BeautyProfile, catalogProducts: Product[]): RecommendationMatch | null {
  const candidates: ScoredShade[] = [];
  for (const product of catalogProducts) {
    if (product.inStock === false) continue;
    for (const shade of product.shades || []) {
      if (shade.isActive === false) continue;
      candidates.push(scoreShade(product, shade, profile));
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  const alternativeShades = candidates.slice(1, 5).map((c) => ({
    product: c.product,
    shade: c.shade,
    matchReason: c.reasonParts.length > 0 ? c.reasonParts.join(' + ') : `${c.shade.undertone} Undertone Alternative`,
  }));

  const matchReason = best.reasonParts.length > 0 ? best.reasonParts.join(' + ') : `${best.shade.undertone} Undertone Match`;
  const styleLabel = (profile.style || profile.stylePreference || 'everyday').toLowerCase();
  const description = best.shade.description
    ? best.shade.description.charAt(0).toLowerCase() + best.shade.description.slice(1)
    : `this ${best.shade.name} shade`;
  const whyWePickedIt = `Selected because ${description} suits your ${profile.undertone.toLowerCase()} undertone, ${profile.skinTone.toLowerCase()} skin tone, and ${styleLabel} styling preference for ${profile.occasion.toLowerCase()} wear.`;

  const complementaryProducts = catalogProducts.filter((p) => p.id !== best.product.id && p.inStock !== false);

  return {
    primaryProduct: best.product,
    primaryShade: best.shade,
    matchScoreTag: 'TOP MATCH',
    matchScore: Math.round(best.score),
    matchReason,
    whyWePickedIt,
    alternativeShades,
    complementaryProducts,
  };
}
