import { Coupon, Address, Order, LoyaltyAccount, Review, SupportFaq } from '../types';
import { GLAMIRK_PRODUCTS } from './products';

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

export const DEFAULT_ADDRESSES: Address[] = [
  {
    id: 'addr-1',
    name: 'Aanya Sen',
    type: 'Home',
    phone: '+91 98201 44521',
    email: 'aanya.sen@glamirk.me',
    addressLine1: 'B-402, Signature One Residences, Bandra West',
    addressLine2: 'Near Turner Road Promenade',
    city: 'Mumbai',
    state: 'Maharashtra',
    pinCode: '400050',
    isDefault: true,
  },
  {
    id: 'addr-2',
    name: 'Aanya Sen',
    type: 'Studio',
    phone: '+91 98201 44521',
    email: 'aanya.sen@glamirk.me',
    addressLine1: 'Atelier 08, Lodha World Towers, Lower Parel',
    addressLine2: 'Senapati Bapat Marg',
    city: 'Mumbai',
    state: 'Maharashtra',
    pinCode: '400013',
    isDefault: false,
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

export const SAMPLE_ORDERS: Order[] = [
  {
    id: 'ord-89104',
    orderNumber: 'GLM-89104',
    createdAt: '12 Jan 2026',
    status: 'DELIVERED',
    items: [
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick Collection',
        productImage: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=80',
        shade: GLAMIRK_PRODUCTS[0].shades?.[0],
        price: 749,
        quantity: 1,
      },
      {
        productId: 'balm-to-water-cleanser-50g',
        productName: 'Balm To Water Cleanser',
        productImage: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80',
        size: '50g',
        price: 849,
        quantity: 1,
      },
    ],
    subtotal: 1598,
    discount: 150,
    shipping: 0,
    tax: 0,
    total: 1448,
    deliveryAddress: DEFAULT_ADDRESSES[0],
    payment: {
      method: 'upi',
      status: 'PAID',
      upiId: 'aanya@okhdfcbank',
      paidAt: '12 Jan 2026, 03:42 PM',
    },
    estimatedDelivery: '15 Jan 2026',
    trackingNumber: 'BLUEDART-88291047',
    courierPartner: 'Blue Dart Apex Premier',
    timeline: [
      {
        status: 'PLACED',
        timestamp: '12 Jan, 03:42 PM',
        note: 'Order confirmed and reserved at Mumbai Atelier.',
        completed: true,
      },
      {
        status: 'PACKED',
        timestamp: '12 Jan, 06:15 PM',
        note: 'Handcrafted in signature Glamirk champagne gift boxing.',
        completed: true,
      },
      {
        status: 'SHIPPED',
        timestamp: '13 Jan, 10:00 AM',
        note: 'Dispatched via Blue Dart Air Express.',
        completed: true,
      },
      {
        status: 'OUT_FOR_DELIVERY',
        timestamp: '15 Jan, 09:30 AM',
        note: 'Courier executive assigned for doorstep delivery.',
        completed: true,
      },
      {
        status: 'DELIVERED',
        timestamp: '15 Jan, 01:22 PM',
        note: 'Delivered securely to recipient.',
        completed: true,
      },
    ],
  },
  {
    id: 'ord-92381',
    orderNumber: 'GLM-92381',
    createdAt: '18 Feb 2026',
    status: 'SHIPPED',
    items: [
      {
        productId: 'ceremonial-liquid-sindoor',
        productName: 'Ceremonial Liquid Sindoor',
        productImage: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=80',
        shade: GLAMIRK_PRODUCTS[1].shades?.[0],
        price: 499,
        quantity: 1,
      },
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick Collection',
        productImage: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=80',
        shade: GLAMIRK_PRODUCTS[0].shades?.[2],
        price: 749,
        quantity: 1,
      },
    ],
    subtotal: 1248,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 1248,
    deliveryAddress: DEFAULT_ADDRESSES[0],
    payment: {
      method: 'card',
      status: 'PAID',
      cardLast4: '4092',
      cardNetwork: 'Visa Platinum',
      paidAt: '18 Feb 2026, 11:20 AM',
    },
    estimatedDelivery: '22 Feb 2026',
    trackingNumber: 'DELHIVERY-9923814',
    courierPartner: 'Delhivery Express Direct',
    timeline: [
      {
        status: 'PLACED',
        timestamp: '18 Feb, 11:20 AM',
        note: 'Order confirmed and verified.',
        completed: true,
      },
      {
        status: 'PACKED',
        timestamp: '18 Feb, 02:40 PM',
        note: 'Packed with velvet pouches.',
        completed: true,
      },
      {
        status: 'SHIPPED',
        timestamp: '19 Feb, 08:15 AM',
        note: 'In transit to central distribution hub.',
        completed: true,
      },
      {
        status: 'OUT_FOR_DELIVERY',
        timestamp: 'Pending',
        note: 'Pending arrival at local facility.',
        completed: false,
      },
      {
        status: 'DELIVERED',
        timestamp: 'Pending',
        note: 'Doorstep handover pending.',
        completed: false,
      },
    ],
  },
];

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
