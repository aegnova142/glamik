import { JournalArticle, BeautyGuide, SocialPost, Creator, Campaign, QuizQuestion, QuizResult } from '../types';

export const GLAMIRK_JOURNAL_HERO_ARTICLE: JournalArticle = {
  id: 'find-your-signature-shade',
  slug: 'find-your-signature-shade',
  title: 'FIND YOUR SIGNATURE SHADE',
  subtitle: 'The Architecture of Color & Melanin Balance',
  category: 'BEAUTY GUIDES',
  readTime: '6 Min Read',
  excerpt: 'A comprehensive study on warm undertones, pigment density, and why true color harmony transcends conventional fair-to-deep spectrums.',
  author: 'Glamirk Editorial Atelier',
  authorRole: 'Chief Color Strategist',
  date: 'August 2026',
  image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&q=85',
  heroImageLarge: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=2000&q=90',
  isHero: true,
  isEditorsPick: true,
  isTrending: true,
  seoTitle: 'Find Your Signature Lip Shade | The Glamirk Journal',
  seoDescription: 'Master lip undertone calibration for South Asian complexions. Discover why terracotta, berry, and calibrated caramels elevate your natural facial balance.',
  content: [
    'Finding a lipstick that elevates your complexion without washing you out begins with understanding contrast ratio.',
    'For warmer Indian skin tones, pigments with terracotta, cinnamon, and golden undertones harmonize naturally with the skin’s golden carotenoids.'
  ],
  tableOfContents: [
    { id: 'optical-contrast', label: '1. The Optical Contrast Law' },
    { id: 'undertone-matrix', label: '2. Melanin & Undertone Nuances' },
    { id: 'shoppable-edits', label: '3. Curated Velvet Formulas' },
    { id: 'application-ritual', label: '4. The Blurring Technique' }
  ],
  sections: [
    {
      heading: 'The Optical Contrast Law',
      subheading: 'Why surface tone is only 30% of the equation',
      paragraphs: [
        'For decades, standard cosmetics industry matrices sorted consumers into generic bins: Fair, Medium, Deep. Yet South Asian and olive complexions frequently find that two people with the identical depth code appear starkly different when wearing the exact same pink-toned nude.',
        'The differentiator is optical contrast and carotenoid saturation. Melanin-rich skin naturally diffuses light differently, requiring micro-milled pigments that don’t turn ashy in ambient warm lighting.'
      ],
      pullQuote: 'A signature lip shade is not meant to mask your natural lip border — it is formulated to frame the golden architecture of your face.',
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=85',
      imageCaption: 'Model wearing Nude Suede with warm golden undertone calibration.'
    },
    {
      heading: 'Melanin & Undertone Nuances',
      subheading: 'Warm, Cool, Olive and Universal Harmony',
      paragraphs: [
        'Warm Undertones (Peachy, Golden, Saffron): Benefit from warm terracottas such as Spice Velvet and toasted caramel hues like Nude Suede.',
        'Cool & Berry Undertones (Rosy, Mulberry, Jewel): Thrive in the presence of blue-based berry pigments like Plum Opulence or true Royal Rose petals.',
        'Olive & Neutral Complexions: Radiate with balanced universal reds like Crimson Sovereign, which contains balanced pigments to avoid turning fluorescent.'
      ],
      tipBox: {
        title: 'ATELIER PRO-TIP',
        text: 'When testing a nude liquid lipstick, look at your collarbone in daylight. If the shade makes your neck appear gray, the undertone is too cool. If it lifts your jawline, the match is calibrated.'
      },
      shoppableProductId: 'matte-liquid-lipstick-collection',
      shoppableShadeId: 'shade-nude-suede'
    },
    {
      heading: 'Curated Velvet Formulas',
      subheading: 'The technology behind weightless opacity',
      paragraphs: [
        'Glamirk’s Matte Liquid Lipstick formulation relies on volatile silicones and jojoba esters that lock pigment into a soft-focus film. Unlike traditional chalky mattes, it flexes with your expressions throughout the day.',
        'The formula sets in 60 seconds, providing transfer-resistant peace of mind through meetings, ceremonial banquets, and evening celebrations.'
      ],
      shoppableProductId: 'matte-liquid-lipstick-collection',
      shoppableShadeId: 'shade-spice-velvet'
    }
  ],
  shoppableProductIds: ['matte-liquid-lipstick-collection', 'balm-to-water-cleanser-50g'],
  relatedArticleIds: ['understanding-your-undertone', 'the-balm-to-water-experience', 'build-your-everyday-glam'],
  relatedLookIds: ['everyday-glam', 'date-night']
};

export const GLAMIRK_JOURNAL_ARTICLES_EXTENDED: JournalArticle[] = [
  GLAMIRK_JOURNAL_HERO_ARTICLE,
  {
    id: 'understanding-your-undertone',
    slug: 'understanding-your-undertone',
    title: 'Understanding Warm, Cool & Olive Undertones',
    subtitle: 'The definitive guide to your skin’s permanent chromatic code',
    category: 'BEAUTY GUIDES',
    readTime: '5 Min Read',
    excerpt: 'Your surface tone changes with the seasons, but your undertone is eternal. Learn how to diagnose your true undertone accurately.',
    author: 'Glamirk Laboratory Notes',
    authorRole: 'Skin Science Division',
    date: 'August 2026',
    image: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1200&q=85',
    isEditorsPick: true,
    isTrending: true,
    seoTitle: 'Understanding Undertones: Warm, Cool, Olive Guide | Glamirk',
    seoDescription: 'Accurately identify your undertone. Learn the vein test, jewelry test, and fabric draping tests calibrated for Indian complexions.',
    content: [
      'Your surface tone might fluctuate with seasonal sun exposure, but your undertone remains constant.',
      'Warm undertones glow with peach, yellow, and golden nuances. Cool undertones reveal subtle pink, red, or bluish hints.'
    ],
    tableOfContents: [
      { id: 'surface-vs-undertone', label: '1. Surface Tone vs Undertone' },
      { id: 'the-three-tests', label: '2. The 3 Diagnostic Tests' },
      { id: 'olive-nuance', label: '3. The Olive Dilemma' },
      { id: 'product-matching', label: '4. Choosing Your Formulas' }
    ],
    sections: [
      {
        heading: 'Surface Tone vs Undertone',
        paragraphs: [
          'Surface tone refers to how fair, medium, tan, or deep your skin appears right now. It can change after a summer weekend in Goa or a winter season in Himachal.',
          'Undertone, by contrast, is the subtle hue beneath your skin’s surface dictated by blood vessel depth, melanin density, and carotenoid distribution. It never changes.'
        ],
        pullQuote: 'Knowing your undertone is the single most valuable beauty asset you will ever unlock.'
      },
      {
        heading: 'The 3 Diagnostic Tests for Indian Skin',
        paragraphs: [
          '1. The White Sheet Contrast Test: Hold a pure white sheet of paper next to your bare jawline in natural morning daylight. If your skin looks yellow, peach, or warm beige, you are Warm. If it looks distinctly rosy or cool, you are Cool. If it looks faintly muted greenish-gray, you are Olive.',
          '2. The Metallic Reflection Test: Gold jewelry melts seamlessly into warm undertones, while silver or platinum pops vibrantly against cool complexions.',
          '3. The Sun Reaction: Do you tan deeply into a golden bronze (Warm), burn easily before tanning (Cool), or tan into an earthy chestnut tone (Olive)?'
        ],
        tipBox: {
          title: 'GLAMIRK LAB NOTE',
          text: 'Over 78% of South Asian complexions lean warm or warm-olive, which is why standard western cool-pink cosmetics often look powdery or mismatched.'
        }
      }
    ],
    shoppableProductIds: ['matte-liquid-lipstick-collection', 'luxury-sindoor-collection'],
    relatedArticleIds: ['find-your-signature-shade', 'build-your-everyday-glam'],
    relatedLookIds: ['wedding-glam', 'minimal-glam']
  },
  {
    id: 'the-balm-to-water-experience',
    slug: 'the-balm-to-water-experience',
    title: 'The Art of the Double Reset: Balm To Water',
    subtitle: 'Transformative lipid chemistry for resilient, supple skin barrier health',
    category: 'SKIN',
    readTime: '4 Min Read',
    excerpt: 'Why cleansing should never mean stripping. Explore how solid velvet butter melts on contact with skin warmth and rinses clean as water.',
    author: 'Glamirk Botanical Lab',
    authorRole: 'Formulation Director',
    date: 'August 2026',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=85',
    isEditorsPick: true,
    seoTitle: 'The Balm-to-Water Cleansing Ritual | Glamirk Skin Journal',
    seoDescription: 'Discover the science of the Balm to Water Cleanser. Dissolves waterproof pigments while protecting the acid mantle.',
    content: [
      'The modern ritual of beauty begins and ends with skin cleanliness.',
      'Our Balm To Water Cleanser relies on botanical triglycerides that effortlessly bind to stubborn pigments without tugging.'
    ],
    sections: [
      {
        heading: 'The Phase Inversion Principle',
        paragraphs: [
          'In cosmetic formulation, phase inversion occurs when a rich lipid-rich balm structure rapidly shifts upon micro-emulsification with water. When scooped, our balm rests as a firm, cushiony butter.',
          'Warmed between your palms, it melts into an unctuous cleansing oil that dissolves long-wear matte pigments and urban particulate matter. When water is splashed, it instantly blooms into a milky fluid that rinses completely clean.'
        ],
        pullQuote: 'A truly luxurious cleanser leaves skin feeling plush and calm — not tight, stripped, or coated in residue.',
        image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=85'
      },
      {
        heading: 'The Evening Decompression Ritual',
        paragraphs: [
          'Take a hazelnut-sized portion of the Balm to Water Cleanser with dry fingertips. Inhale the subtle botanical notes.',
          'Massage in upward circular motions across closed eyelids, cheekbones, and lips for 45 seconds. Splash lukewarm water to transform the emulsion, then pat dry with a clean linen cloth.'
        ],
        shoppableProductId: 'balm-to-water-cleanser-50g'
      }
    ],
    shoppableProductIds: ['balm-to-water-cleanser-50g', 'balm-to-water-cleanser-30g'],
    relatedArticleIds: ['build-your-everyday-glam', 'find-your-signature-shade'],
    relatedLookIds: ['minimal-glam']
  },
  {
    id: 'build-your-everyday-glam',
    slug: 'build-your-everyday-glam',
    title: 'The Art of Everyday Glam: Boardroom to Soirée',
    subtitle: 'A minimal three-step ritual crafted for modern pace and undeniable presence',
    category: 'GLAMIRK STORIES',
    readTime: '3 Min Read',
    excerpt: 'Streamline your morning routine into a refined luxury routine that moves effortlessly from daylight meetings to evening cocktails.',
    author: 'Glamirk Editorial Atelier',
    date: 'August 2026',
    image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=85',
    isEditorsPick: true,
    content: [
      'Luxury beauty should never feel cumbersome. The modern Glamirk woman values precision, performance, and weightless comfort.',
      'Step 1: Prep your canvas with the Balm To Water Cleanser for supple, hydrated skin.'
    ],
    sections: [
      {
        heading: 'Effortless Polish in Under 4 Minutes',
        paragraphs: [
          'High-glamour routines often falter because they require 18 distinct products and half an hour of blending. True modern luxury is about restraint and high-performance efficacy.',
          'Pair a luminous, bare skin aesthetic with the tailored velvet impact of Nude Suede or Royal Rose. Tap gently at the cupid’s bow for a blurred, editorial edge that requires zero touch-ups.'
        ],
        shoppableProductId: 'matte-liquid-lipstick-collection',
        shoppableShadeId: 'shade-royal-rose'
      }
    ],
    shoppableProductIds: ['matte-liquid-lipstick-collection', 'balm-to-water-cleanser-30g'],
    relatedArticleIds: ['find-your-signature-shade', 'the-balm-to-water-experience'],
    relatedLookIds: ['everyday-glam', 'minimal-glam']
  },
  {
    id: 'ceremonial-reimagining',
    slug: 'ceremonial-reimagining',
    title: 'The Modern Ceremonial Sindoor: Heritage Meets Innovation',
    subtitle: 'Preserving sacred crimson traditions with smudge-proof liquid elegance',
    category: 'MAKEUP',
    readTime: '4 Min Read',
    excerpt: 'How we engineered a heritage ritual with ultra-fine applicator tips, skin-kind pigments, and enduring smudge resistance.',
    author: 'Glamirk Cultural Archives',
    date: 'August 2026',
    image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1200&q=85',
    content: [
      'Sindoor is one of the most revered symbols of marital commitment, celebration, and auspicious energy.',
      'Our liquid Sindoor was designed with micro-fine precision to eliminate messy dusting.'
    ],
    sections: [
      {
        heading: 'Redefining the Parting Line',
        paragraphs: [
          'Traditional dry powder sindoor often transferred onto silk sarees, pillows, or foreheads. Our liquid formulation provides intense scarlet opacity that dries to a matte, non-bleeding finish in seconds.',
          'Formulated without harsh irritants, heavy metals, or artificial perfumes, it honors the tradition while respecting modern dermatological safety.'
        ],
        shoppableProductId: 'luxury-sindoor-collection'
      }
    ],
    shoppableProductIds: ['luxury-sindoor-collection', 'matte-liquid-lipstick-collection'],
    relatedArticleIds: ['find-your-signature-shade'],
    relatedLookIds: ['wedding-glam']
  }
];

export const GLAMIRK_BEAUTY_GUIDES: BeautyGuide[] = [
  {
    id: 'guide-undertones',
    title: 'How to Decode Your Skin’s True Undertone',
    subtitle: 'A photographic, scientific step-by-step masterclass for warm, cool, and olive skin.',
    category: 'UNDERTONES',
    readTime: '4 Min Read',
    heroImage: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1400&q=85',
    overview: 'Learn how lighting, vein coloration, and fabric drape tests accurately reveal whether your cosmetics should lean golden, neutral, or berry.',
    steps: [
      {
        stepNumber: 1,
        title: 'Step 01: Natural Daylight Assessment',
        description: 'Position yourself 3 feet away from an indirect natural window. Do not wear makeup or tinted moisturizer. Observe whether your skin radiates a golden cast (Warm), peach/rose (Cool/Neutral), or muted greenish-amber (Olive).',
        proTip: 'Avoid fluorescent bathroom lights which cast an artificial yellow or blue reflection.'
      },
      {
        stepNumber: 2,
        title: 'Step 02: The Contrast Fabric Test',
        description: 'Drape an ivory/cream fabric on one shoulder and a stark pure-white cloth on the other. If cream enhances your skin’s glow, you are predominantly Warm. If pure white illuminates you, you lean Cool.',
        recommendedProductId: 'matte-liquid-lipstick-collection',
        recommendedShadeId: 'shade-nude-suede'
      },
      {
        stepNumber: 3,
        title: 'Step 03: Select Harmonious Pigments',
        description: 'Warm complexions match with Spice Velvet and Nude Suede. Cool complexions stun in Plum Opulence. Universal reds like Crimson Sovereign look breathtaking across all categories.',
        recommendedProductId: 'matte-liquid-lipstick-collection',
        recommendedShadeId: 'shade-crimson-sovereign'
      }
    ],
    shoppableProductIds: ['matte-liquid-lipstick-collection'],
    relatedGuideIds: ['guide-lip-matching', 'guide-everyday-glam'],
    relatedLookIds: ['everyday-glam', 'date-night']
  },
  {
    id: 'guide-lip-matching',
    title: 'Find Your Perfect Lip Shade Match',
    subtitle: 'From soft daytime caramels to showstopping ruby reds, calibrated for Indian lips.',
    category: 'LIP MATCHING',
    readTime: '3 Min Read',
    heroImage: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1400&q=85',
    overview: 'Explore our 5 signature velvet shades. Learn which shade flatters your two-toned lip contours without needing heavy lip liners.',
    steps: [
      {
        stepNumber: 1,
        title: 'Step 01: Analyze Natural Lip Border Pigment',
        description: 'Many Indian lips possess natural melanin richness on the outer upper lip border. Choose a shade with high pigment density like Spice Velvet or Nude Suede to harmonize without chalkiness.',
        recommendedProductId: 'matte-liquid-lipstick-collection',
        recommendedShadeId: 'shade-spice-velvet'
      },
      {
        stepNumber: 2,
        title: 'Step 02: Glide & Lock',
        description: 'Use the sculpted diamond wand to trace your cupid’s bow. Fill with a single layer. Do not press lips together for 45 seconds while the velvet matrix sets.',
        proTip: 'A single swipe delivers 100% opacity, avoiding heavy product buildup.'
      }
    ],
    shoppableProductIds: ['matte-liquid-lipstick-collection'],
    relatedGuideIds: ['guide-undertones', 'guide-everyday-glam'],
    relatedLookIds: ['everyday-glam', 'wedding-glam']
  },
  {
    id: 'guide-cleansing-ritual',
    title: 'The Melting Balm To Water Cleansing Masterclass',
    subtitle: 'The two-minute sensory reset that melts waterproof pigment while pampering the moisture barrier.',
    category: 'SKIN RITUALS',
    readTime: '4 Min Read',
    heroImage: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1400&q=85',
    overview: 'Master the luxury cleansing technique trusted by makeup artists to eliminate transfer-resistant cosmetics without irritation or oily film.',
    steps: [
      {
        stepNumber: 1,
        title: 'Step 01: Warm the Solid Balm',
        description: 'Scoop a small quantity onto dry hands. Rub palms together for 3 seconds until the solid butter turns into an unctuous botanical oil.',
        recommendedProductId: 'balm-to-water-cleanser-50g'
      },
      {
        stepNumber: 2,
        title: 'Step 02: Dissolve & Emulsify',
        description: 'Gently glide across lips, eyelids, and facial contours. Splash with lukewarm water to witness the instant transformation into a lightweight milk.',
        proTip: 'Rinses completely clean without needing a double foaming wash.'
      }
    ],
    shoppableProductIds: ['balm-to-water-cleanser-50g', 'balm-to-water-cleanser-30g'],
    relatedGuideIds: ['guide-everyday-glam'],
    relatedLookIds: ['minimal-glam']
  }
];

export const GLAMIRK_SOCIAL_POSTS: SocialPost[] = [
  {
    id: 'social-post-01',
    creatorName: 'Ananya Varma',
    creatorHandle: '@ananyabeaute',
    isVerified: true,
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85',
    aspectRatio: 'portrait',
    caption: 'My go-to everyday boardroom edit. Wearing @glamirkbeauty Matte Liquid Lipstick in Nude Suede. Zero dryness, lasted through 3 coffee meetings and dinner.',
    lookTitle: 'Everyday Glam Edit',
    lookId: 'everyday-glam',
    date: '2 days ago',
    platform: 'Instagram',
    taggedProducts: [
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick',
        shadeName: 'Nude Suede',
        price: 899,
        image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    id: 'social-post-02',
    creatorName: 'Meera Sen',
    creatorHandle: '@meerasen_glam',
    isVerified: true,
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1000&q=85',
    aspectRatio: 'square',
    caption: 'Crimson Sovereign is THAT red. The undertone is pure royalty and stays locked all evening. Paired with glowing skin.',
    lookTitle: 'Date Night Allure',
    lookId: 'date-night',
    date: '4 days ago',
    platform: 'Instagram',
    taggedProducts: [
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick',
        shadeName: 'Crimson Sovereign',
        price: 899,
        image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    id: 'social-post-03',
    creatorName: 'Rhea Kapoor Editorial',
    creatorHandle: '@rhea_atelier',
    isVerified: true,
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1000&q=85',
    aspectRatio: 'portrait',
    caption: 'Bridal rituals reimagined. The Luxury Sindoor line is an absolute triumph. Precise, deep scarlet, and does not smudge on dupattas.',
    lookTitle: 'Wedding Majesty',
    lookId: 'wedding-glam',
    date: '1 week ago',
    platform: 'Editorial Atelier',
    taggedProducts: [
      {
        productId: 'luxury-sindoor-collection',
        productName: 'Luxury Sindoor Collection',
        shadeName: 'Ceremonial Scarlet',
        price: 649,
        image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=400&q=80'
      },
      {
        productId: 'matte-liquid-lipstick-collection',
        productName: 'Matte Liquid Lipstick',
        shadeName: 'Spice Velvet',
        price: 899,
        image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    id: 'social-post-04',
    creatorName: 'Tara Deshmukh',
    creatorHandle: '@tara_deshmukh',
    isVerified: true,
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1000&q=85',
    aspectRatio: 'portrait',
    caption: 'The Balm to Water cleanser reset after a 14-hour fashion shoot. Melts everything in seconds and skin feels so plump.',
    lookTitle: 'Minimal Radiance',
    lookId: 'minimal-glam',
    date: '1 week ago',
    platform: 'Community UGC',
    taggedProducts: [
      {
        productId: 'balm-to-water-cleanser-50g',
        productName: 'Balm To Water Cleanser — 50g',
        price: 549,
        image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80'
      }
    ]
  }
];

export const GLAMIRK_CREATORS: Creator[] = [
  {
    id: 'creator-ananya',
    name: 'Ananya Varma',
    handle: '@ananyabeaute',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    coverImage: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=85',
    bio: 'Editorial beauty director & luxury makeup artist. Champion of South Asian skin undertone calibration.',
    beautyAesthetic: 'Sculpted Warm Neutrals & Radiant Complexions',
    signatureLookId: 'everyday-glam',
    curatedProductIds: ['matte-liquid-lipstick-collection', 'balm-to-water-cleanser-50g'],
    isVerified: true
  },
  {
    id: 'creator-meera',
    name: 'Meera Sen',
    handle: '@meerasen_glam',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    coverImage: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=85',
    bio: 'Beauty creator focusing on bold evening glam, timeless reds, and skin barrier health.',
    beautyAesthetic: 'High-Impact Velvet Lips & Glass Skin',
    signatureLookId: 'date-night',
    curatedProductIds: ['matte-liquid-lipstick-collection', 'balm-to-water-cleanser-30g'],
    isVerified: true
  }
];

export const GLAMIRK_CAMPAIGNS: Campaign[] = [
  {
    id: 'the-royal-velvet-edit',
    title: 'THE ROYAL VELVET EDIT',
    subtitle: 'Autumn / Festive 2026 Collection',
    tagline: 'Regal pigment saturation, weightless texture, and unforgettable presence.',
    heroImage: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1800&q=90',
    themeBadge: 'NEW LAUNCH ATELIER',
    brandStory: 'Inspired by the opulent hues of ancient Indian palaces and crafted with cutting-edge micronized liquid pigment technology, The Royal Velvet Edit represents the apex of modern ceremonial glamour.',
    whyItExists: 'Traditional festive makeup often felt heavy, crusty, or prone to bleeding during celebrations. We developed a velvet matrix that stays flexible, comfortable, and intensely opaque for up to 16 hours.',
    featuredProductIds: ['matte-liquid-lipstick-collection', 'luxury-sindoor-collection', 'balm-to-water-cleanser-50g'],
    lookId: 'wedding-glam',
    isActive: true,
    ritualSteps: [
      { step: '01', title: 'Prep with Balm-to-Water', desc: 'Hydrate skin for a supple, glass-smooth canvas.' },
      { step: '02', title: 'Frame with Liquid Sindoor', desc: 'Precise ceremonial definition with micro-applicator wand.' },
      { step: '03', title: 'Swipe Velvet Lip Sensation', desc: 'Spice Velvet or Crimson Sovereign for regal finish.' }
    ]
  },
  {
    id: 'pure-reset-ritual',
    title: 'THE PURE RESET RITUAL',
    subtitle: 'Skin Barrier First Cleansing',
    tagline: 'Melt the day away. Protect the moisture barrier.',
    heroImage: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1800&q=90',
    themeBadge: 'SKINCARE EDITION',
    brandStory: 'Created for skin that deserves gentle luxury. Formulated with skin-identical lipid fractions and pure botanical emollients.',
    whyItExists: 'Harsh makeup removers compromise the acid mantle, leading to sensitivity. Our Balm to Water Cleanser dissolves even water-resistant formulas while leaving skin hydrated.',
    featuredProductIds: ['balm-to-water-cleanser-50g', 'balm-to-water-cleanser-30g'],
    lookId: 'minimal-glam',
    isActive: true
  }
];

export const GLAMIRK_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'quiz-aesthetic',
    question: 'What is your signature beauty aesthetic?',
    subtitle: 'Choose the energy that best represents your everyday presence.',
    options: [
      { id: 'natural-refined', label: 'Understated & Refined', description: 'Soft caramels, hydrated bare skin, blurred borders.' },
      { id: 'bold-regal', label: 'Bold & Regal', description: 'Intense crimson velvet lips and ceremonial precision.' },
      { id: 'warm-terracotta', label: 'Warm Sun-Kissed', description: 'Rich spicy cinnamon tones and golden radiance.' },
      { id: 'fresh-minimal', label: 'Clean & Luminous', description: 'Glass skin, sheer balmy glow, minimal color.' }
    ]
  },
  {
    id: 'quiz-occasion',
    question: 'What is your primary beauty focus right now?',
    subtitle: 'Where will your Glamirk formulations accompany you?',
    options: [
      { id: 'boardroom-daily', label: 'Daily Professional Presence', description: 'Long-wearing comfort from 9 AM to evening.' },
      { id: 'wedding-festive', label: 'Weddings & Celebrations', description: 'Ceremonial richness and smudge-proof performance.' },
      { id: 'evening-dates', label: 'Evening Soirées & Dinners', description: 'Sultry velvet allure under candlelit warmth.' },
      { id: 'skincare-prep', label: 'Skin Reset & Barrier Health', description: 'Double-cleansing and gentle makeup removal.' }
    ]
  },
  {
    id: 'quiz-finish',
    question: 'Which texture makes you feel most empowered?',
    subtitle: 'Our bespoke formulations offer distinctive tactile sensations.',
    options: [
      { id: 'velvet-matte', label: 'Velvet Matte Veil', description: 'Transfer-resistant, weightless opacity.' },
      { id: 'melting-balm', label: 'Melting Sensory Balm', description: 'Solid-to-water transformation.' },
      { id: 'ceremonial-liquid', label: 'Ceremonial Matte Precision', description: 'Ultra-fine applicator definition.' }
    ]
  }
];

export const GLAMIRK_QUIZ_RESULTS: Record<string, QuizResult> = {
  'natural-refined': {
    title: 'The Modern Classicist',
    archetype: 'Effortless Warmth & Editorial Polish',
    description: 'You appreciate understated luxury that speaks through precision and harmonious undertones rather than heavy layers. Your ideal match is Nude Suede paired with healthy skin.',
    matchedProductId: 'matte-liquid-lipstick-collection',
    matchedShadeId: 'shade-nude-suede',
    matchedLookId: 'everyday-glam',
    matchedGuideId: 'guide-undertones'
  },
  'bold-regal': {
    title: 'The Sovereign Icon',
    archetype: 'High-Impact Velvet Majesty',
    description: 'You command the room with unapologetic confidence. Deep Crimson Sovereign velvet lips and precision Luxury Sindoor define your timeless presence.',
    matchedProductId: 'matte-liquid-lipstick-collection',
    matchedShadeId: 'shade-crimson-sovereign',
    matchedLookId: 'wedding-glam',
    matchedGuideId: 'guide-lip-matching'
  },
  'warm-terracotta': {
    title: 'The Saffron Muse',
    archetype: 'Toasted Terracotta & Golden Earth',
    description: 'Your skin radiates warmth. Spice Velvet liquid lipstick harmonizes effortlessly with your golden undertones for a mesmerizing sun-drenched finish.',
    matchedProductId: 'matte-liquid-lipstick-collection',
    matchedShadeId: 'shade-spice-velvet',
    matchedLookId: 'everyday-glam',
    matchedGuideId: 'guide-undertones'
  },
  'fresh-minimal': {
    title: 'The Pure Minimalist',
    archetype: 'Barrier Radiance & Soft Petal Veil',
    description: 'You believe skincare is the highest form of glamour. The Balm To Water Cleanser paired with a soft wash of Royal Rose creates an ethereal, awake radiance.',
    matchedProductId: 'balm-to-water-cleanser-50g',
    matchedLookId: 'minimal-glam',
    matchedGuideId: 'guide-cleansing-ritual'
  }
};
