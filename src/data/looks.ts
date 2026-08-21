import { Look } from '../types';

export const GLAMIRK_LOOKS: Look[] = [
  {
    id: 'everyday-glam',
    title: 'EVERYDAY GLAM',
    tagline: 'Effortless warmth, soft defined contours, and a velvety nude signature.',
    description: 'Designed for daily presence. A balanced composition pairing natural skin luminosity with the weightless velvet finish of Nude Suede or Royal Rose liquid lipstick.',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=85',
    category: 'EVERYDAY GLAM',
    productsUsed: [
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick',
        shadeName: 'Nude Suede',
        role: 'Lip Focus'
      },
      {
        productId: 'balm-to-water-cleanser-50g',
        productName: 'Balm To Water Cleanser — 50g',
        role: 'Skin Prep & Clean Slate'
      }
    ]
  },
  {
    id: 'date-night',
    title: 'DATE NIGHT',
    tagline: 'Sultry velvet allure, magnetic eye contours, and a decadent ruby red.',
    description: 'An evocative evening statement. Deep Crimson Sovereign velvet lips commanding attention against smooth, radiant skin and candlelit warmth.',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=85',
    category: 'DATE NIGHT',
    productsUsed: [
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick',
        shadeName: 'Crimson Sovereign',
        role: 'Bold Statement Pout'
      },
      {
        productId: 'balm-to-water-cleanser-30g',
        productName: 'Balm To Water Cleanser — 30g',
        role: 'Post-Event Purifying Reset'
      }
    ]
  },
  {
    id: 'wedding-glam',
    title: 'WEDDING GLAM',
    tagline: 'Opulent ceremonial scarlet, luxury sindoor precision, and celebratory majesty.',
    description: 'Curated for sacred vows and regal celebrations. Combining the lasting grandeur of the Luxury Sindoor with high-impact Spice Velvet or Ceremonial Scarlet lips.',
    image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=85',
    category: 'WEDDING GLAM',
    productsUsed: [
      {
        productId: 'luxury-sindoor-collection',
        productName: 'Luxury Sindoor Collection',
        shadeName: 'Ceremonial Scarlet',
        role: 'Sacred Parting Precision'
      },
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick',
        shadeName: 'Spice Velvet',
        role: 'High-Definition Velvet Lip'
      }
    ]
  },
  {
    id: 'minimal-glam',
    title: 'MINIMAL GLAM',
    tagline: 'Refined bare radiance, subtle dusty petal tone, and hydrated supple texture.',
    description: 'The beauty of restraint. A lightweight veil of Royal Rose lipstick paired with double-cleansed barrier-healthy skin.',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=85',
    category: 'MINIMAL GLAM',
    productsUsed: [
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick',
        shadeName: 'Royal Rose',
        role: 'Soft Petal Wash'
      },
      {
        productId: 'balm-to-water-cleanser-30g',
        productName: 'Balm To Water Cleanser — 30g',
        role: 'Barrier Hydration'
      }
    ]
  }
];
