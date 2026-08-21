import { BeautyProfile, RecommendationMatch, Product, Shade } from '../types';
import { GLAMIRK_PRODUCTS } from './products';

/**
 * Deterministic, transparent recommendation engine matching user profile 
 * to verified Glamirk cosmetics formulations.
 */
export function generateBeautyMatch(profile: BeautyProfile): RecommendationMatch {
  const lipstickProduct = GLAMIRK_PRODUCTS.find((p) => p.id === 'matte-liquid-lipstick-collection') || GLAMIRK_PRODUCTS[0];
  const allShades = lipstickProduct.shades || [];

  let matchedShadeId = 'caramel';
  let matchReason = '';
  let whyWePickedIt = '';

  // Match logic based on undertone, skin tone, occasion & style
  if (profile.undertone === 'Warm') {
    if (profile.occasion === 'Wedding' || profile.occasion === 'Party' || profile.style === 'Bold') {
      matchedShadeId = 'ruby-desire';
      matchReason = 'Warm Undertone + Statement Occasion';
      whyWePickedIt = `Selected because its deep rich crimson pigments create stunning contrast against your warm ${profile.skinTone.toLowerCase()} complexion for ${profile.occasion.toLowerCase()} lighting.`;
    } else {
      matchedShadeId = 'caramel';
      matchReason = 'Warm Undertone + Natural/Everyday Wear';
      whyWePickedIt = `Selected because the golden terracotta-caramel undertones naturally enhance your warm ${profile.skinTone.toLowerCase()} skin tone without washing out or turning ashy.`;
    }
  } else if (profile.undertone === 'Cool') {
    if (profile.style === 'Bold' || profile.occasion === 'Wedding' || profile.occasion === 'Date Night') {
      matchedShadeId = 'berry-chic';
      matchReason = 'Cool Undertone + Bold/Evening Style';
      whyWePickedIt = `Selected because deep plum-berry tones harmonize impeccably with cool undertones and accentuate your ${profile.skinTone.toLowerCase()} complexion.`;
    } else {
      matchedShadeId = 'rose-red';
      matchReason = 'Cool Undertone + Soft/Natural Look';
      whyWePickedIt = `Selected because the cool-balanced rosewood hue brightens your ${profile.skinTone.toLowerCase()} complexion with effortless everyday sophistication.`;
    }
  } else {
    // Neutral
    if (profile.style === 'Bold' || profile.occasion === 'Wedding') {
      matchedShadeId = 'ruby-desire';
      matchReason = 'Neutral Undertone + High Impact Glam';
      whyWePickedIt = `Selected because neutral undertones carry intense crimson reds with balanced elegance, perfectly suiting your ${profile.skinTone.toLowerCase()} tone.`;
    } else if (profile.style === 'Minimal' || profile.style === 'Soft') {
      matchedShadeId = 'rose-red';
      matchReason = 'Neutral Undertone + Minimal/Soft Aesthetic';
      whyWePickedIt = `Selected because balanced rosewood adapts organically to neutral complexions, giving a refined ${profile.finish.toLowerCase()} finish.`;
    } else {
      matchedShadeId = 'caramel';
      matchReason = 'Neutral Undertone + Versatile Classic';
      whyWePickedIt = `Selected because velvety caramel provides the ideal neutral-warm base for your ${profile.skinTone.toLowerCase()} complexion across all daily settings.`;
    }
  }

  const primaryShade = allShades.find((s) => s.id === matchedShadeId) || allShades[0];

  // Alternative recommendations from remaining shades
  const alternativeShades = allShades
    .filter((s) => s.id !== primaryShade.id)
    .slice(0, 3)
    .map((shade) => {
      let altReason = '';
      if (shade.id === 'caramel') {
        altReason = 'Ideal for daytime understated luxury & sunlit meetings.';
      } else if (shade.id === 'rose-red') {
        altReason = 'The quintessential rosewood for brunch, office, and soft glam.';
      } else if (shade.id === 'ruby-desire') {
        altReason = 'The definitive luxury red for evening events and celebration.';
      } else {
        altReason = 'Rich plum-berry for dramatic nighttime definition.';
      }
      return {
        product: lipstickProduct,
        shade,
        matchReason: altReason,
      };
    });

  // Complementary Products (Sindoor + Cleanser)
  const complementaryProducts = GLAMIRK_PRODUCTS.filter((p) => p.id !== lipstickProduct.id);

  return {
    primaryProduct: lipstickProduct,
    primaryShade,
    matchScoreTag: 'TOP MATCH',
    matchReason,
    whyWePickedIt,
    alternativeShades,
    complementaryProducts,
  };
}
