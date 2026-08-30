/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  CMSPage,
  Product,
  CMSCategory,
  CMSNavigationItem,
  CMSFooterConfig,
  CMSOffer,
  JournalArticle,
  SupportFaq,
  CMSGlobalSettings,
  CMSMediaItem,
  CMSUser,
  CMSAuditLog,
  CMSHeroContent,
  CMSAboutContent,
  CMSBenefit,
  Look,
  CMSShadeJourney,
  CMSBenefitsSection,
  CMSPromoBannerConfig,
  CMSShadeFinderTeaser,
  CMSJournalSectionCopy,
  CMSFindMyShadeResultsCopy,
  CMSFindMyShadeHero,
} from '../types';
import { apiFetch, getAdminToken, setAdminAuth, clearAdminAuth, getStoredAdminUser } from '../utils/cmsClient';
import { getSocket } from '../utils/socket';

// Fallback seed data in case API is temporarily unavailable
import { GLAMIRK_PRODUCTS } from '../data/products';
import { GLAMIRK_JOURNAL_ARTICLES_EXTENDED } from '../data/editorial';
import { SUPPORT_FAQS } from '../data/commerce';
import { GLAMIRK_LOOKS } from '../data/looks';

export interface CMSContextType {
  // Public state
  pages: CMSPage[];
  products: Product[];
  categories: CMSCategory[];
  navigation: CMSNavigationItem[];
  footer: CMSFooterConfig | null;
  heroContent: CMSHeroContent | null;
  aboutContent: CMSAboutContent | null;
  shadeJourney: CMSShadeJourney | null;
  benefitsSection: CMSBenefitsSection | null;
  benefits: CMSBenefit[];
  looks: Look[];
  offers: CMSOffer[];
  promoBanners: CMSPromoBannerConfig | null;
  shadeFinderTeaser: CMSShadeFinderTeaser | null;
  journalSectionCopy: CMSJournalSectionCopy | null;
  findMyShadeResultsCopy: CMSFindMyShadeResultsCopy | null;
  findMyShadeHero: CMSFindMyShadeHero | null;
  journalArticles: JournalArticle[];
  faqs: SupportFaq[];
  globalSettings: CMSGlobalSettings | null;
  isLoading: boolean;
  serverTime: string;

  // Helpers
  activeOffers: CMSOffer[];
  getPageBySlug: (slug: string) => CMSPage | undefined;
  getProductById: (id: string) => Product | undefined;
  getCategoryBySlug: (slug: string) => CMSCategory | undefined;

  // Admin Auth State & Methods
  adminUser: CMSUser | null;
  isAdminAuthenticated: boolean;
  adminLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  adminLogout: () => void;
  adminChangePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;

  // Admin CMS Mutation Methods
  fetchFullAdminState: () => Promise<any>;
  savePage: (page: Partial<CMSPage>) => Promise<boolean>;
  deletePage: (id: string) => Promise<boolean>;
  saveProduct: (product: Partial<Product>) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<boolean>;
  duplicateProduct: (id: string) => Promise<boolean>;
  saveCategory: (category: Partial<CMSCategory>) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  saveOffer: (offer: Partial<CMSOffer>) => Promise<boolean>;
  deleteOffer: (id: string) => Promise<boolean>;
  saveNavigation: (nav: CMSNavigationItem[]) => Promise<boolean>;
  saveFooter: (footer: CMSFooterConfig) => Promise<boolean>;
  saveHeroContent: (hero: CMSHeroContent) => Promise<boolean>;
  savePromoBanners: (config: CMSPromoBannerConfig) => Promise<boolean>;
  saveShadeFinderTeaser: (teaser: CMSShadeFinderTeaser) => Promise<boolean>;
  saveJournalSectionCopy: (copy: CMSJournalSectionCopy) => Promise<boolean>;
  saveFindMyShadeResultsCopy: (copy: CMSFindMyShadeResultsCopy) => Promise<boolean>;
  saveFindMyShadeHero: (hero: CMSFindMyShadeHero) => Promise<boolean>;
  saveAboutContent: (about: CMSAboutContent) => Promise<boolean>;
  saveShadeJourney: (journey: CMSShadeJourney) => Promise<boolean>;
  saveBenefitsSection: (section: CMSBenefitsSection) => Promise<boolean>;
  saveBenefit: (benefit: Partial<CMSBenefit>) => Promise<boolean>;
  deleteBenefit: (id: string) => Promise<boolean>;
  saveLook: (look: Partial<Look>) => Promise<boolean>;
  deleteLook: (id: string) => Promise<boolean>;
  saveArticle: (article: Partial<JournalArticle>) => Promise<boolean>;
  deleteArticle: (id: string) => Promise<boolean>;
  saveFaq: (faq: Partial<SupportFaq>) => Promise<boolean>;
  deleteFaq: (id: string) => Promise<boolean>;
  saveGlobalSettings: (settings: Partial<CMSGlobalSettings>) => Promise<boolean>;
  uploadMedia: (file: File, name?: string, altText?: string) => Promise<CMSMediaItem | null>;
  deleteMedia: (id: string) => Promise<boolean>;
  refreshPublicContent: () => Promise<void>;
}

const defaultApprovedPalette = {
  primaryLuxuryBlack: '#0B0B0B',
  primarySoftBlack: '#171717',
  primaryGold: '#C9972B',
  primaryBrightGold: '#E3B84B',
  secondaryPink: '#F05A7E',
  secondarySoftPink: '#FCE8ED',
  secondaryWhite: '#FFFFFF',
  backgroundWarmWhite: '#FAF9F6',
  textRichBlack: '#121212',
  mutedTextGrey: '#6B6B6B',
  borderSoftGold: '#E8D5A8',
};

const CMSContext = createContext<CMSContextType | null>(null);

export const CMSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pages, setPages] = useState<CMSPage[]>([]);
  const [products, setProducts] = useState<Product[]>(GLAMIRK_PRODUCTS);
  const [categories, setCategories] = useState<CMSCategory[]>([
    {
      id: 'cat-makeup',
      name: 'Makeup',
      slug: 'makeup',
      description: 'High-pigment, weightless formulations calibrated for warm and olive complexions.',
      image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=1200&q=80',
      order: 1,
      isVisible: true,
      subCategories: ['Lips', 'Eyes', 'Face'],
    },
    {
      id: 'cat-skin',
      name: 'Skin',
      slug: 'skin',
      description: 'Balm-to-water botanical cleansers and nourishing barrier elixirs.',
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80',
      order: 2,
      isVisible: true,
      subCategories: ['Cleansing', 'Skincare Essentials'],
    },
    {
      id: 'cat-nails',
      name: 'Nails',
      slug: 'nails',
      description: 'Ultra-pigmented gel-shine lacquers with breathable formula.',
      image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80',
      order: 3,
      isVisible: true,
      subCategories: ['Nail Products', 'Nail Care'],
    },
  ]);
  const [navigation, setNavigation] = useState<CMSNavigationItem[]>([
    {
      id: 'nav-shop',
      label: 'Shop',
      url: '/shop',
      type: 'internal',
      order: 1,
      isVisible: true,
      children: [
        { id: 'sub-all', label: 'All Collections', url: '/shop', order: 1, isVisible: true },
        { id: 'sub-makeup', label: 'Makeup', url: '/shop?category=Makeup', order: 2, isVisible: true },
        { id: 'sub-skin', label: 'Skin', url: '/shop?category=Skin', order: 3, isVisible: true },
        { id: 'sub-nails', label: 'Nails', url: '/shop?category=Nails', order: 4, isVisible: true },
        { id: 'sub-new', label: 'New Arrivals', url: '/new-launch', order: 5, isVisible: true, badge: 'NEW' },
      ],
    },
    { id: 'nav-shade-finder', label: 'Find My Shade', url: '/find-my-shade', type: 'internal', order: 2, isVisible: true, badge: 'AI MATCH' },
    { id: 'nav-looks', label: 'Looks & Edits', url: '/looks', type: 'internal', order: 3, isVisible: true },
    { id: 'nav-journal', label: 'Journal', url: '/journal', type: 'internal', order: 4, isVisible: true },
    { id: 'nav-beauty-guides', label: 'Beauty Guides', url: '/beauty-guides', type: 'internal', order: 5, isVisible: true },
    { id: 'nav-support', label: 'Support', url: '/support', type: 'internal', order: 6, isVisible: true },
  ]);
  const [footer, setFooter] = useState<CMSFooterConfig | null>(null);
  const [heroContent, setHeroContent] = useState<CMSHeroContent | null>(null);
  const [aboutContent, setAboutContent] = useState<CMSAboutContent | null>(null);
  const [shadeJourney, setShadeJourney] = useState<CMSShadeJourney | null>(null);
  const [benefitsSection, setBenefitsSection] = useState<CMSBenefitsSection | null>(null);
  const [benefits, setBenefits] = useState<CMSBenefit[]>([]);
  const [looks, setLooks] = useState<Look[]>(GLAMIRK_LOOKS);
  const [offers, setOffers] = useState<CMSOffer[]>([]);
  const [promoBanners, setPromoBanners] = useState<CMSPromoBannerConfig | null>(null);
  const [shadeFinderTeaser, setShadeFinderTeaser] = useState<CMSShadeFinderTeaser | null>(null);
  const [journalSectionCopy, setJournalSectionCopy] = useState<CMSJournalSectionCopy | null>(null);
  const [findMyShadeResultsCopy, setFindMyShadeResultsCopy] = useState<CMSFindMyShadeResultsCopy | null>(null);
  const [findMyShadeHero, setFindMyShadeHero] = useState<CMSFindMyShadeHero | null>(null);
  const [journalArticles, setJournalArticles] = useState<JournalArticle[]>(GLAMIRK_JOURNAL_ARTICLES_EXTENDED);
  const [faqs, setFaqs] = useState<SupportFaq[]>(SUPPORT_FAQS.map((f, i) => ({ ...f, order: i + 1, isVisible: true })));
  const [globalSettings, setGlobalSettings] = useState<CMSGlobalSettings | null>({
    brandName: 'Glamirk Beauty',
    tagline: 'Luxury Atelier for Melanin-Rich Beauty',
    logoText: 'GLAMIRK',
    logoUrl: '',
    contactEmail: 'care@glamirk.com',
    contactPhone: '+91 800 452 6475',
    address: 'Atelier 08, Lodha World Towers, Lower Parel, Mumbai, Maharashtra 400013',
    currency: 'INR',
    currencySymbol: '₹',
    storeTimezone: 'Asia/Kolkata',
    freeShippingThreshold: 999,
    shippingNotice: 'Complimentary shipping across India on all orders above ₹999.',
    announcementBarMessages: [
      { id: 'ann-1', text: 'Complimentary luxury courier on all orders above ₹999', isVisible: true },
      { id: 'ann-2', text: 'New: Balm-to-Water Cleanser with Sea Buckthorn is now live', isVisible: true },
      { id: 'ann-3', text: 'Find your calibrated lip undertone with our AI Diagnostic Tool', link: '/find-my-shade', isVisible: true },
    ],
    defaultSeoTitle: 'Glamirk Beauty | Luxury Makeup & Skincare Atelier',
    defaultSeoDescription: 'Discover high-pigment, weightless lip colors and botanical cleansing balms meticulously calibrated for warm, olive, and South Asian skin tones.',
    approvedPalette: defaultApprovedPalette,
    codRules: {
      minOrderAmount: 0,
      maxOrderAmount: 0,
      serviceablePinCodes: [],
      blockedPinCodes: [],
      codDisabledProductIds: [],
    },
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [serverTime, setServerTime] = useState<string>(new Date().toISOString());

  // Admin Auth State
  const [adminUser, setAdminUser] = useState<CMSUser | null>(getStoredAdminUser);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(!!getAdminToken());

  // Load public content
  const loadPublicContent = useCallback(async () => {
    try {
      const res = await apiFetch<any>('/api/cms/content');
      if (res.data) {
        if (res.data.pages) setPages(res.data.pages);
        if (res.data.products) setProducts(res.data.products);
        if (res.data.categories) setCategories(res.data.categories);
        if (res.data.navigation) setNavigation(res.data.navigation);
        if (res.data.footer) setFooter(res.data.footer);
        if (res.data.heroContent) setHeroContent(res.data.heroContent);
        if (res.data.aboutContent) setAboutContent(res.data.aboutContent);
        if (res.data.shadeJourney) setShadeJourney(res.data.shadeJourney);
        if (res.data.benefitsSection) setBenefitsSection(res.data.benefitsSection);
        if (res.data.benefits) setBenefits(res.data.benefits);
        if (res.data.looks) setLooks(res.data.looks);
        if (res.data.offers) setOffers(res.data.offers);
        if (res.data.promoBanners) setPromoBanners(res.data.promoBanners);
        if (res.data.shadeFinderTeaser) setShadeFinderTeaser(res.data.shadeFinderTeaser);
        if (res.data.journalSectionCopy) setJournalSectionCopy(res.data.journalSectionCopy);
        if (res.data.findMyShadeResultsCopy) setFindMyShadeResultsCopy(res.data.findMyShadeResultsCopy);
        if (res.data.findMyShadeHero) setFindMyShadeHero(res.data.findMyShadeHero);
        if (res.data.journalArticles) setJournalArticles(res.data.journalArticles);
        if (res.data.faqs) setFaqs(res.data.faqs);
        if (res.data.globalSettings) setGlobalSettings(res.data.globalSettings);
        if (res.data.serverTime) setServerTime(res.data.serverTime);
      }
    } catch (err) {
      console.warn('Could not fetch public CMS content, using memory defaults:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Connect to the shared Socket.IO client for real-time CMS updates
  useEffect(() => {
    loadPublicContent();

    const socket = getSocket();
    const handleEvent = (event: any) => {
      if (event?.type === 'CMS_UPDATE') {
        // Hot reload public content smoothly
        loadPublicContent();
      }
    };
    socket.on('event', handleEvent);

    // Periodic check every 30s to keep offer countdowns in sync
    const interval = setInterval(() => {
      loadPublicContent();
    }, 30000);

    return () => {
      socket.off('event', handleEvent);
      clearInterval(interval);
    };
  }, [loadPublicContent]);

  // Auth check on mount
  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      apiFetch<{ user: CMSUser }>('/api/auth/me').then((res) => {
        if (res.data?.user) {
          setAdminUser(res.data.user);
          setIsAdminAuthenticated(true);
        } else {
          clearAdminAuth();
          setAdminUser(null);
          setIsAdminAuthenticated(false);
        }
      });
    }
  }, []);

  // Active offers filter
  const activeOffers = offers.filter((o) => o.status === 'active');

  const getPageBySlug = useCallback(
    (slug: string) => {
      const cleanSlug = slug === 'home' || slug === '/' ? '' : slug.replace(/^\//, '');
      return pages.find((p) => p.slug === cleanSlug);
    },
    [pages]
  );

  const getProductById = useCallback(
    (id: string) => {
      return products.find((p) => p.id === id || p.slug === id);
    },
    [products]
  );

  const getCategoryBySlug = useCallback(
    (slug: string) => {
      return categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase() || c.name.toLowerCase() === slug.toLowerCase());
    },
    [categories]
  );

  // Admin Auth Methods
  const adminLogin = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const res = await apiFetch<{ token: string; user: CMSUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.data?.token && res.data?.user) {
      setAdminAuth(res.data.token, res.data.user);
      setAdminUser(res.data.user);
      setIsAdminAuthenticated(true);
      return { success: true };
    }

    return { success: false, error: res.error || 'Login failed' };
  };

  const adminLogout = () => {
    clearAdminAuth();
    setAdminUser(null);
    setIsAdminAuthenticated(false);
  };

  const adminChangePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const res = await apiFetch<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (res.data?.success) {
      return { success: true };
    }
    return { success: false, error: res.error || 'Password update failed' };
  };

  // Admin State & Mutations
  const fetchFullAdminState = async () => {
    const res = await apiFetch<any>('/api/admin/full-state');
    return res.data;
  };

  const savePage = async (page: Partial<CMSPage>): Promise<boolean> => {
    const endpoint = page.id ? `/api/admin/pages/${page.id}` : '/api/admin/pages';
    const method = page.id ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(page) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deletePage = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/pages/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveProduct = async (product: Partial<Product>): Promise<boolean> => {
    const endpoint = product.id && products.some((p) => p.id === product.id) ? `/api/admin/products/${product.id}` : '/api/admin/products';
    const method = product.id && products.some((p) => p.id === product.id) ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(product) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deleteProduct = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const duplicateProduct = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/products/duplicate/${id}`, { method: 'POST' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveCategory = async (category: Partial<CMSCategory>): Promise<boolean> => {
    const endpoint = category.id && categories.some((c) => c.id === category.id) ? `/api/admin/categories/${category.id}` : '/api/admin/categories';
    const method = category.id && categories.some((c) => c.id === category.id) ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(category) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deleteCategory = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveOffer = async (offer: Partial<CMSOffer>): Promise<boolean> => {
    const endpoint = offer.id && offers.some((o) => o.id === offer.id) ? `/api/admin/offers/${offer.id}` : '/api/admin/offers';
    const method = offer.id && offers.some((o) => o.id === offer.id) ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(offer) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deleteOffer = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/offers/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveNavigation = async (nav: CMSNavigationItem[]): Promise<boolean> => {
    const res = await apiFetch('/api/admin/navigation', { method: 'PUT', body: JSON.stringify(nav) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveFooter = async (foot: CMSFooterConfig): Promise<boolean> => {
    const res = await apiFetch('/api/admin/footer', { method: 'PUT', body: JSON.stringify(foot) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveHeroContent = async (hero: CMSHeroContent): Promise<boolean> => {
    const res = await apiFetch('/api/admin/hero', { method: 'PUT', body: JSON.stringify(hero) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const savePromoBanners = async (config: CMSPromoBannerConfig): Promise<boolean> => {
    const res = await apiFetch('/api/admin/promo-banners', { method: 'PUT', body: JSON.stringify(config) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveShadeFinderTeaser = async (teaser: CMSShadeFinderTeaser): Promise<boolean> => {
    const res = await apiFetch('/api/admin/shade-finder-teaser', { method: 'PUT', body: JSON.stringify(teaser) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveJournalSectionCopy = async (copy: CMSJournalSectionCopy): Promise<boolean> => {
    const res = await apiFetch('/api/admin/journal-section-copy', { method: 'PUT', body: JSON.stringify(copy) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveFindMyShadeResultsCopy = async (copy: CMSFindMyShadeResultsCopy): Promise<boolean> => {
    const res = await apiFetch('/api/admin/find-my-shade-results-copy', { method: 'PUT', body: JSON.stringify(copy) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveAboutContent = async (about: CMSAboutContent): Promise<boolean> => {
    const res = await apiFetch('/api/admin/about', { method: 'PUT', body: JSON.stringify(about) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveShadeJourney = async (journey: CMSShadeJourney): Promise<boolean> => {
    const res = await apiFetch('/api/admin/shade-journey', { method: 'PUT', body: JSON.stringify(journey) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveFindMyShadeHero = async (hero: CMSFindMyShadeHero): Promise<boolean> => {
    const res = await apiFetch('/api/admin/find-my-shade-hero', { method: 'PUT', body: JSON.stringify(hero) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveBenefitsSection = async (section: CMSBenefitsSection): Promise<boolean> => {
    const res = await apiFetch('/api/admin/benefits-section', { method: 'PUT', body: JSON.stringify(section) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveBenefit = async (benefit: Partial<CMSBenefit>): Promise<boolean> => {
    const endpoint = benefit.id && benefits.some((b) => b.id === benefit.id) ? `/api/admin/benefits/${benefit.id}` : '/api/admin/benefits';
    const method = benefit.id && benefits.some((b) => b.id === benefit.id) ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(benefit) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deleteBenefit = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/benefits/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveLook = async (look: Partial<Look>): Promise<boolean> => {
    const endpoint = look.id && looks.some((l) => l.id === look.id) ? `/api/admin/looks/${look.id}` : '/api/admin/looks';
    const method = look.id && looks.some((l) => l.id === look.id) ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(look) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deleteLook = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/looks/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveArticle = async (article: Partial<JournalArticle>): Promise<boolean> => {
    const endpoint = article.id && journalArticles.some((a) => a.id === article.id) ? `/api/admin/articles/${article.id}` : '/api/admin/articles';
    const method = article.id && journalArticles.some((a) => a.id === article.id) ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(article) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deleteArticle = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/articles/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveFaq = async (faq: Partial<SupportFaq>): Promise<boolean> => {
    const endpoint = faq.id && faqs.some((f) => f.id === faq.id) ? `/api/admin/faqs/${faq.id}` : '/api/admin/faqs';
    const method = faq.id && faqs.some((f) => f.id === faq.id) ? 'PUT' : 'POST';
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(faq) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const deleteFaq = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/faqs/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const saveGlobalSettings = async (settings: Partial<CMSGlobalSettings>): Promise<boolean> => {
    const res = await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const uploadMedia = async (file: File, name?: string, altText?: string): Promise<CMSMediaItem | null> => {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (altText) formData.append('altText', altText);

    const token = getAdminToken();
    try {
      const res = await fetch('/api/admin/media/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const mediaItem = await res.json();
      return mediaItem;
    } catch (err) {
      console.error('Media upload error:', err);
      return null;
    }
  };

  const deleteMedia = async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/admin/media/${id}`, { method: 'DELETE' });
    if (res.status < 400) {
      await loadPublicContent();
      return true;
    }
    return false;
  };

  const value: CMSContextType = {
    pages,
    products,
    categories,
    navigation,
    footer,
    heroContent,
    aboutContent,
    shadeJourney,
    benefitsSection,
    benefits,
    looks,
    offers,
    promoBanners,
    shadeFinderTeaser,
    journalSectionCopy,
    findMyShadeResultsCopy,
    findMyShadeHero,
    journalArticles,
    faqs,
    globalSettings,
    isLoading,
    serverTime,
    activeOffers,
    getPageBySlug,
    getProductById,
    getCategoryBySlug,
    adminUser,
    isAdminAuthenticated,
    adminLogin,
    adminLogout,
    adminChangePassword,
    fetchFullAdminState,
    savePage,
    deletePage,
    saveProduct,
    deleteProduct,
    duplicateProduct,
    saveCategory,
    deleteCategory,
    saveOffer,
    deleteOffer,
    saveNavigation,
    saveFooter,
    saveHeroContent,
    savePromoBanners,
    saveShadeFinderTeaser,
    saveJournalSectionCopy,
    saveFindMyShadeResultsCopy,
    saveFindMyShadeHero,
    saveAboutContent,
    saveShadeJourney,
    saveBenefitsSection,
    saveBenefit,
    deleteBenefit,
    saveLook,
    deleteLook,
    saveArticle,
    deleteArticle,
    saveFaq,
    deleteFaq,
    saveGlobalSettings,
    uploadMedia,
    deleteMedia,
    refreshPublicContent: loadPublicContent,
  };

  //return <CMSContext.Provider value={value}>{children}</CMSContext.Provider>;
  return (
  <CMSContext.Provider value={value}>
    {isLoading ? (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold tracking-[0.2em] text-[#121212]">
            GLAMIRK
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-[#F05A7E]">
            Luxury Beauty
          </div>
        </div>
      </div>
    ) : (
      children
    )}
  </CMSContext.Provider>
);
};

export function useCMS(): CMSContextType {
  const ctx = useContext(CMSContext);
  if (!ctx) {
    throw new Error('useCMS must be used within a CMSProvider');
  }
  return ctx;
}
