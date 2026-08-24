import { Coupon, LoyaltyAccount, Review, SupportFaq } from '../types';

export const FREE_SHIPPING_THRESHOLD = 999;
export const STANDARD_SHIPPING_FEE = 99;

export const GLAMIRK_COUPONS: Coupon[] = [
  {
    code: 'GLAMWELCOME',
    title: 'Welcome to Glamirk',
    description: 'Enjoy 10% complimentary privilege on your first luxury order.',
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 799,
    tag: 'FIRST ORDER',
  },
  {
    code: 'BEAUTYEDIT',
    title: 'The Editorial Privilege',
    description: 'Flat ₹150 off on orders above ₹1,499 across all collections.',
    discountType: 'flat',
    discountValue: 150,
    minOrderValue: 1499,
    tag: 'EDITORIAL',
  },
  {
    code: 'PRIVESHIP',
    title: 'Privé Complimentary Courier',
    description: 'Free expedited delivery on all orders with zero minimum.',
    discountType: 'flat',
    discountValue: 99,
    minOrderValue: 0,
    tag: 'MEMBERS ONLY',
  },
];

export const DEFAULT_LOYALTY: LoyaltyAccount = {
  tier: 'SIGNATURE',
  points: 480,
  lifetimeSpend: 3490,
  nextTierThreshold: 5000,
  referralCode: 'GLAM-AANYA20',
  history: [
    {
      id: 'rew-1',
      date: '14 Oct 2025',
      description: 'Order #GLM-78219 Purchase Bonus',
      points: 150,
      type: 'earn',
    },
    {
      id: 'rew-2',
      date: '28 Nov 2025',
      description: 'Verified Product Review on Spice Velvet',
      points: 50,
      type: 'earn',
    },
    {
      id: 'rew-3',
      date: '12 Jan 2026',
      description: 'Order #GLM-89104 Purchase Points',
      points: 280,
      type: 'earn',
    },
  ],
};

export const SAMPLE_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    productId: 'matte-liquid-lipstick-collection',
    productName: 'Matte Liquid Lipstick Collection',
    shadeName: 'Spice Velvet',
    rating: 5,
    customerName: 'Meera Kapoor',
    date: '3 weeks ago',
    title: 'The exact warm terracotta tone I have searched for',
    comment:
      'Unlike most liquid lipsticks that dry down gray or chalky on warm Indian undertones, Spice Velvet has rich golden-terracotta depth. Transfer-proof all day through chai and dinner without feeling parched.',
    isVerifiedPurchase: true,
    skinTone: 'Medium / Tan',
    undertone: 'Warm Golden',
  },
  {
    id: 'rev-2',
    productId: 'balm-to-water-cleanser-50g',
    productName: 'Balm To Water Cleanser',
    rating: 5,
    customerName: 'Rhea Deshmukh',
    date: '1 month ago',
    title: 'Melts stubborn bridal sindoor & waterproof lipstick like silk',
    comment:
      'The sensorial transformation from rich buttery balm into a weightless milk rinse is pure luxury. Zero greasy film left behind, and my skin feels deeply nourished with Saffron and Marula.',
    isVerifiedPurchase: true,
    skinTone: 'Light Medium',
    undertone: 'Neutral',
  },
  {
    id: 'rev-3',
    productId: 'ceremonial-liquid-sindoor',
    productName: 'Ceremonial Liquid Sindoor',
    shadeName: 'Ceremonial Scarlet',
    rating: 5,
    customerName: 'Priyanka Sen',
    date: '2 months ago',
    title: 'Non-irritating, regal, and lasts from morning ritual to night',
    comment:
      'I have extremely sensitive skin along the hairline and typical sindoor stains or flakes. This formulation dries matte instantly without any sting or staining. The sponge applicator gives micro precision.',
    isVerifiedPurchase: true,
    skinTone: 'Medium',
    undertone: 'Warm',
  },
];

export const SUPPORT_FAQS: SupportFaq[] = [
  {
    id: 'faq-1',
    category: 'ORDERS',
    question: 'How do I check the status or track my Glamirk delivery?',
    answer:
      'You can track your order in real-time under My Glam → Order History or by entering your order number on our Track Order page. We also dispatch live SMS and email updates upon dispatch with Blue Dart or Delhivery tracking links.',
  },
  {
    id: 'faq-2',
    category: 'DELIVERY',
    question: 'What are your delivery timelines across India?',
    answer:
      'Metro cities (Mumbai, Delhi NCR, Bengaluru, Hyderabad, Kolkata, Chennai) typically receive deliveries within 2–3 business days. Tier-2 and regional addresses take 3–5 business days. All orders above ₹999 receive complimentary luxury air courier.',
  },
  {
    id: 'faq-3',
    category: 'RETURNS',
    question: 'What is Glamirk’s return and exchange policy on beauty formulations?',
    answer:
      'Due to strict hygiene standards for personal beauty products, opened or used cosmetics cannot be returned. However, if your order arrives damaged, defective, or incorrect, we provide an immediate complimentary replacement or full refund within 7 days of delivery.',
  },
  {
    id: 'faq-4',
    category: 'PAYMENTS',
    question: 'Which payment methods are accepted on Glamirk?',
    answer:
      'We accept all major UPI applications (Google Pay, PhonePe, Paytm, BHIM), Visa, Mastercard, RuPay credit and debit cards, Net Banking across all premier Indian banks, and Cash on Delivery (COD) for eligible pin codes.',
  },
  {
    id: 'faq-5',
    category: 'FIND MY SHADE',
    question: 'How accurate is the AI Undertone and Shade Discovery tool?',
    answer:
      'Our Shade Intelligence engine is calibrated against hundreds of Indian melanin spectrums and skin tones. It uses optical chromatic theory (warm, neutral, cool, and olive) to match you with formulations that enhance rather than wash out your complexion.',
  },
  {
    id: 'faq-6',
    category: 'PRODUCTS',
    question: 'Are Glamirk products cruelty-free, dermatologically tested, and paraben-free?',
    answer:
      'Yes. Every Glamirk formulation is 100% cruelty-free, paraben-free, dermatologically tested for sensitive skin, and formulated in certified clean beauty facilities in compliance with global ISO standards.',
  },
  {
    id: 'faq-7',
    category: 'ACCOUNT',
    question: 'How do I join Glamirk Privé and earn rewards?',
    answer:
      'You are automatically enrolled into Glamirk Privé Member tier upon your first order or account creation. You earn points on every purchase, product review, and friend referral, which can be redeemed for exclusive tier privileges.',
  },
];
