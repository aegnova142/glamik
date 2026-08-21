/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnnouncementBar } from './components/AnnouncementBar';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { BrandIntro } from './components/BrandIntro';
import { BrandStatement } from './components/BrandStatement';
import { CategoryGridSection } from './components/CategoryGridSection';
import { PromotionalBanner } from './components/PromotionalBanner';
import { GlamirkEdit } from './components/GlamirkEdit';
import { CleanserShowcase } from './components/CleanserShowcase';
import { ShadeFinderTeaser } from './components/ShadeFinderTeaser';
import { ShopTheLook } from './components/ShopTheLook';
import { GlamirkOnYou } from './components/GlamirkOnYou';
import { JournalSection } from './components/JournalSection';
import { TrustQualityStrip } from './components/TrustQualityStrip';
import { Footer } from './components/Footer';

// Phase 2 Pages
import { ShopPage } from './components/ShopPage';
import { FullProductPage } from './components/FullProductPage';
import { ShopTheLookPage } from './components/ShopTheLookPage';
import { WishlistPage } from './components/WishlistPage';

// Phase 3 Pages & AI / AR Experiences
import { FindMyShadePage } from './components/FindMyShadePage';
import { MyGlamDashboard } from './components/MyGlamDashboard';
import { VirtualTryOnModal } from './components/VirtualTryOnModal';
import { BeautyAssistantDrawer } from './components/BeautyAssistantDrawer';

// Phase 4 Commerce & Conversion Pages
import { ShoppingBagPage } from './components/ShoppingBagPage';
import { CheckoutPage } from './components/CheckoutPage';
import { OrderConfirmationPage } from './components/OrderConfirmationPage';
import { OrderTrackingPage } from './components/OrderTrackingPage';
import { SupportCenterPage } from './components/SupportCenterPage';

// Phase 5 Content, Discovery & Growth Pages
import { JournalPage } from './components/JournalPage';
import { ArticleDetailPage } from './components/ArticleDetailPage';
import { BeautyGuidesPage } from './components/BeautyGuidesPage';
import { SocialCommerceHub } from './components/SocialCommerceHub';
import { CampaignLandingPage } from './components/CampaignLandingPage';
import { BeautyQuizModal } from './components/BeautyQuizModal';
import { PersonalizedHomeBanner } from './components/PersonalizedHomeBanner';
import { TrendingDiscovery } from './components/TrendingDiscovery';

// Phase 6 Production, Legal & Resilience Components
import { NotFoundPage } from './components/NotFoundPage';
import { LegalPage } from './components/LegalPage';
import { OfflineBanner } from './components/OfflineBanner';

// CMS Context & Admin Components
import { CMSProvider, useCMS } from './context/CMSContext';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLoginModal } from './components/admin/AdminLoginModal';
import { LiveOfferCountdown } from './components/LiveOfferCountdown';
import { DynamicSectionRenderer } from './components/DynamicSectionRenderer';

// Modals, Drawers and Overlays
import { CartDrawer } from './components/CartDrawer';
import { WishlistDrawer } from './components/WishlistDrawer';
import { QuickViewModal } from './components/QuickViewModal';
import { LookDetailModal } from './components/LookDetailModal';
import { SearchOverlay } from './components/SearchOverlay';
import { ShadeFinderModal } from './components/ShadeFinderModal';
import { JournalModal } from './components/JournalModal';
import { MobileBottomNav } from './components/MobileBottomNav';

import {
  Product,
  Shade,
  Look,
  JournalArticle,
  CartItem,
  PageRoute,
  BeautyProfile,
  Coupon,
  Order,
  Address,
} from './types';
import { GLAMIRK_PRODUCTS } from './data/products';
import { DEFAULT_ADDRESSES, SAMPLE_ORDERS } from './data/commerce';
import {
  GLAMIRK_JOURNAL_ARTICLES_EXTENDED,
  GLAMIRK_BEAUTY_GUIDES,
  GLAMIRK_CAMPAIGNS,
} from './data/editorial';
import { updatePageSeo } from './utils/seo';
import { trackEvent } from './utils/analytics';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

function AppContent() {
  const { products: cmsProducts, pages: cmsPages, activeOffers, globalSettings, isAdminAuthenticated } = useCMS();

  // Navigation Routing State
  const [currentRoute, setCurrentRoute] = useState<PageRoute>({ page: 'home' });

  // Combined product catalog (CMS products prioritized over base defaults)
  const allProducts = React.useMemo(() => {
    if (!cmsProducts || cmsProducts.length === 0) return GLAMIRK_PRODUCTS;
    const cmsMap = new Map(cmsProducts.map((p) => [p.id, p]));
    const defaults = GLAMIRK_PRODUCTS.filter((p) => !cmsMap.has(p.id));
    return [...cmsProducts, ...defaults];
  }, [cmsProducts]);

  // Cart & Wishlist State
  const [cartItems, setCartItems] = useState<CartItem[]>([
    {
      product: GLAMIRK_PRODUCTS[0],
      selectedShade: GLAMIRK_PRODUCTS[0].shades?.[0],
      quantity: 1,
    },
  ]);
  const [wishlist, setWishlist] = useState<string[]>(['matte-liquid-lipstick-collection']);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);

  // Phase 4 Orders & Addresses State
  const [savedAddresses, setSavedAddresses] = useState<Address[]>(DEFAULT_ADDRESSES);
  const [orders, setOrders] = useState<Order[]>(SAMPLE_ORDERS);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | undefined>(undefined);

  // Phase 3 Stored Beauty Profile State
  const [beautyProfile, setBeautyProfile] = useState<BeautyProfile | null>(() => {
    try {
      const saved = localStorage.getItem('glamirk_beauty_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Recently Viewed History
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([
    'matte-liquid-lipstick-collection',
    'balm-to-water-cleanser-50g',
  ]);

  // Modals / Drawers State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShadeFinderOpen, setIsShadeFinderOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);

  // Phase 3 AR / AI Modals & Drawers
  const [isTryOnOpen, setIsTryOnOpen] = useState(false);
  const [tryOnProductId, setTryOnProductId] = useState<string>('matte-liquid-lipstick-collection');
  const [tryOnShadeId, setTryOnShadeId] = useState<string | undefined>('caramel');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [activeLook, setActiveLook] = useState<Look | null>(null);
  const [activeArticle, setActiveArticle] = useState<JournalArticle | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Determine active PDP product
  const activeProduct =
    currentRoute.page === 'product' && currentRoute.productId
      ? allProducts.find((p) => p.id === currentRoute.productId) || allProducts[0]
      : null;

  // Determine active Journal Article
  const currentArticle =
    currentRoute.page === 'article' && currentRoute.articleId
      ? GLAMIRK_JOURNAL_ARTICLES_EXTENDED.find((a) => a.id === currentRoute.articleId) ||
        GLAMIRK_JOURNAL_ARTICLES_EXTENDED[0]
      : GLAMIRK_JOURNAL_ARTICLES_EXTENDED[0];

  // Update dynamic SEO & track pageview whenever route changes
  useEffect(() => {
    const pageTitleMap: Record<string, string> = {
      home: 'Glamirk Beauty | Luxury Beauty Atelier & Formulations',
      shop: 'Shop All Creations | Glamirk Beauty Private Limited',
      product: 'Cosmetic Formulation PDP | Glamirk Beauty',
      'shop-the-look': 'Shop The Look | Editorial Beauty Edits | Glamirk',
      wishlist: 'Saved Wishlist | Glamirk Beauty',
      'find-my-shade': 'Find My Shade Diagnostic | Intelligent Color Atelier | Glamirk',
      'my-glam': 'My Glam Privé Loyalty Suite | Glamirk Beauty',
      cart: 'Shopping Bag | Glamirk Beauty',
      checkout: 'Luxury Checkout | Glamirk Beauty',
      'order-confirmation': 'Order Confirmation | Glamirk Beauty',
      'order-tracking': 'Track Your Order | Glamirk Concierge',
      support: 'Client Support & FAQ | Glamirk Care',
      journal: 'The Glamirk Journal | Editorial Stories & Insights',
      article: 'Journal Story | Glamirk Beauty',
      'beauty-guides': 'Beauty Guides & Masterclasses | Glamirk Beauty',
      'social-commerce': 'Glamirk On You | Community & Creator Showcase',
      campaign: 'The Sovereign Velvet Festive Edit | Glamirk',
      legal: 'Legal & Client Governance Policies | Glamirk Beauty',
      '404': 'Page Not Found (404) | Glamirk Beauty',
    };

    let title = pageTitleMap[currentRoute.page] || 'Glamirk Beauty | Luxury Beauty Atelier';
    let description = 'Discover high-performance cosmetics, personalized undertone matching, and luxury formulations crafted for Indian skin tones.';

    if (currentRoute.page === 'product' && activeProduct) {
      title = `${activeProduct.name} | Glamirk Beauty`;
      description = activeProduct.description || description;
    } else if (currentRoute.page === 'article' && currentArticle) {
      title = `${currentArticle.title} | The Glamirk Journal`;
      description = currentArticle.excerpt || description;
    }

    updatePageSeo({
      title,
      description,
      canonicalUrl: `https://glamirk.com/#${currentRoute.page}`,
    });

    trackEvent('page_view', { route: currentRoute.page, ...currentRoute });
  }, [currentRoute, activeProduct, currentArticle]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const trackRecentlyViewed = (productId: string) => {
    setRecentlyViewedIds((prev) => {
      const filtered = prev.filter((id) => id !== productId);
      return [productId, ...filtered].slice(0, 8);
    });
  };

  const handleSaveBeautyProfile = (profile: BeautyProfile) => {
    setBeautyProfile(profile);
    try {
      localStorage.setItem('glamirk_beauty_profile', JSON.stringify(profile));
    } catch (e) {
      console.warn('Failed to persist beauty profile in localStorage', e);
    }
    showToast('Beauty profile saved to My Glam');
  };

  // Navigation actions
  const navigateToHome = () => {
    setCurrentRoute({ page: 'home' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToShop = (category?: string | null, subCategory?: string | null) => {
    setCurrentRoute({ page: 'shop', category, subCategory });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToProduct = (product: Product) => {
    trackRecentlyViewed(product.id);
    setCurrentRoute({ page: 'product', productId: product.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToShopTheLook = () => {
    setCurrentRoute({ page: 'shop-the-look' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToWishlist = () => {
    setCurrentRoute({ page: 'wishlist' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToFindMyShade = () => {
    setCurrentRoute({ page: 'find-my-shade' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToMyGlam = () => {
    setCurrentRoute({ page: 'my-glam' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCart = () => {
    setIsCartOpen(false);
    setCurrentRoute({ page: 'cart' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCheckout = () => {
    setIsCartOpen(false);
    if (cartItems.length === 0) {
      showToast('Your shopping bag is currently empty.');
      return;
    }
    setCurrentRoute({ page: 'checkout' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToOrderTracking = (orderId?: string) => {
    setTrackingOrderId(orderId);
    setCurrentRoute({ page: 'order-tracking', orderId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToSupport = () => {
    setCurrentRoute({ page: 'support' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Phase 5 Content Navigation Handlers
  const navigateToJournal = () => {
    setCurrentRoute({ page: 'journal' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToArticle = (articleId: string) => {
    setCurrentRoute({ page: 'article', articleId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToBeautyGuides = () => {
    setCurrentRoute({ page: 'beauty-guides' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToSocialCommerce = () => {
    setCurrentRoute({ page: 'social-commerce' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCampaign = (campaignId: string = 'sovereign-velvet-festive') => {
    setCurrentRoute({ page: 'campaign', campaignId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Phase 6 Legal and 404 Navigation Handlers
  const navigateToLegal = (policy: 'privacy' | 'terms' | 'shipping' | 'returns' | 'cookies' = 'privacy') => {
    setCurrentRoute({ page: 'legal', policy });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateTo404 = () => {
    setCurrentRoute({ page: '404' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openVirtualTryOn = (product?: Product, shade?: Shade) => {
    const prod = product || GLAMIRK_PRODUCTS[0];
    setTryOnProductId(prod.id);
    if (shade) {
      setTryOnShadeId(shade.id);
    } else if (prod.shades && prod.shades.length > 0) {
      setTryOnShadeId(prod.shades[0].id);
    }
    setIsTryOnOpen(true);
  };

  // Cart actions
  const handleAddToCart = (product: Product, shade?: Shade, size?: string, quantity: number = 1) => {
    trackRecentlyViewed(product.id);
    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.selectedShade?.id === shade?.id &&
          item.selectedSize === size
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += quantity;
        return updated;
      } else {
        return [...prev, { product, selectedShade: shade, selectedSize: size, quantity }];
      }
    });

    const shadeInfo = shade ? ` (${shade.name})` : '';
    const sizeInfo = size ? ` [${size}]` : '';
    showToast(`Added ${product.name}${shadeInfo}${sizeInfo} to bag`);
    setIsCartOpen(true);
  };

  const handleBuyNow = (product: Product, shade?: Shade, size?: string) => {
    handleAddToCart(product, shade, size, 1);
    navigateToCheckout();
  };

  const handleUpdateQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(index);
    } else {
      setCartItems((prev) => {
        const updated = [...prev];
        updated[index].quantity = quantity;
        return updated;
      });
    }
  };

  const handleRemoveFromCart = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
    showToast('Item removed from shopping bag');
  };

  const handleMoveToWishlist = (index: number, product: Product) => {
    handleRemoveFromCart(index);
    if (!wishlist.includes(product.id)) {
      setWishlist((prev) => [...prev, product.id]);
    }
    showToast(`Moved ${product.name} to your Wishlist`);
  };

  // Coupon handling
  const handleApplyCoupon = (coupon: Coupon) => {
    setAppliedCoupon(coupon);
    showToast(`Privilege code ${coupon.code} applied!`);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    showToast('Coupon code removed');
  };

  // Address adding
  const handleAddNewAddress = (newAddr: Address) => {
    setSavedAddresses((prev) => [...prev, newAddr]);
    showToast('New destination address saved');
  };

  // Order Placement Success Handler
  const handlePlaceOrderSuccess = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
    setConfirmedOrder(newOrder);
    setCartItems([]);
    setAppliedCoupon(null);
    setCurrentRoute({ page: 'order-confirmation', orderId: newOrder.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Order #${newOrder.orderNumber} successfully registered!`);
  };

  // Wishlist actions
  const handleToggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      if (prev.includes(productId)) {
        showToast('Removed from saved wishlist');
        return prev.filter((id) => id !== productId);
      } else {
        showToast('Saved to your Glamirk wishlist');
        return [...prev, productId];
      }
    });
  };

  // Add multiple look products to bag
  const handleAddLookToBag = (products: { product: Product; shade?: Shade; size?: string }[]) => {
    products.forEach((item) => {
      trackRecentlyViewed(item.product.id);
      handleAddToCart(item.product, item.shade, item.size, 1);
    });
    showToast('All curated look creations added to shopping bag');
    setIsCartOpen(true);
  };

  const cartTotalCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  // If on Admin page route (after all hooks have executed)
  if (currentRoute.page === 'admin') {
    if (isAdminAuthenticated) {
      return <AdminLayout onExitAdmin={() => setCurrentRoute({ page: 'home' })} />;
    }
    return (
      <AdminLoginModal
        isOpen={true}
        onClose={() => setCurrentRoute({ page: 'home' })}
        onSuccess={() => setCurrentRoute({ page: 'admin' })}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#121212] font-sans antialiased selection:bg-[#C9972B] selection:text-white relative">
      
      {/* Offline Connectivity Resilience Banner */}
      <OfflineBanner />

      {/* Top Luxury Announcement Bar */}
      <AnnouncementBar />

      {/* Dynamic Active Offer Campaign Ribbon (if active offer with countdown exists) */}
      {activeOffers.some((o) => o.showCountdown && o.endDate) && (
        <div className="bg-[#171717] text-[#FAF9F6] py-2 px-4 border-b border-[#E8D5A8]/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-[#F05A7E] text-white">
              Limited Atelier Campaign
            </span>
            <span className="font-semibold text-xs text-[#FAF9F6]">
              {activeOffers.find((o) => o.showCountdown)?.publicTitle ||
                activeOffers.find((o) => o.showCountdown)?.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LiveOfferCountdown
              targetDate={activeOffers.find((o) => o.showCountdown)!.endDate!}
            />
            {activeOffers.find((o) => o.showCountdown)?.couponCode && (
              <span className="font-mono text-[11px] font-bold text-[#E3B84B] px-2 py-0.5 bg-[#0B0B0B] rounded border border-[#E8D5A8]/30">
                CODE: {activeOffers.find((o) => o.showCountdown)!.couponCode}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Primary Navigation */}
      <Navbar
        currentRoute={currentRoute}
        cartCount={cartTotalCount}
        wishlistCount={wishlist.length}
        onOpenCart={navigateToCart}
        onOpenWishlist={() => navigateToWishlist()}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenShadeFinder={navigateToFindMyShade}
        onOpenTryOn={() => openVirtualTryOn()}
        onNavigateMyGlam={navigateToMyGlam}
        onNavigateHome={navigateToHome}
        onNavigateShop={navigateToShop}
        onNavigateShopTheLook={navigateToShopTheLook}
        onOpenAssistant={() => setIsAssistantOpen(true)}
        onNavigateJournal={navigateToJournal}
        onNavigateGuides={navigateToBeautyGuides}
        onNavigateSocialCommerce={navigateToSocialCommerce}
        onOpenQuiz={() => setIsQuizOpen(true)}
        onNavigateAdmin={() => setCurrentRoute({ page: 'admin' })}
      />

      {/* Main Dynamic View Routing */}
      <main className="flex-grow pb-20 md:pb-0">
        
        {/* VIEW 1: HOMEPAGE */}
        {currentRoute.page === 'home' && (
          <div>
            {/* 1st: Home Hero Section */}
            <Hero
              onShopClick={() => navigateToShop()}
              onFindShadeClick={navigateToFindMyShade}
            />

            {/* 2nd: Personalize Beauty */}
            <PersonalizedHomeBanner
              beautyProfile={beautyProfile}
              onOpenShadeFinder={navigateToFindMyShade}
              onOpenProduct={navigateToProduct}
              onOpenTryOn={(pId, sId) => {
                const prod = GLAMIRK_PRODUCTS.find((p) => p.id === pId) || GLAMIRK_PRODUCTS[0];
                const sh = prod.shades?.find((s) => s.id === sId) || prod.shades?.[0];
                openVirtualTryOn(prod, sh);
              }}
              onOpenArticle={navigateToArticle}
              onOpenQuiz={() => setIsQuizOpen(true)}
            />

            {/* 3rd: Best Seller */}
            <GlamirkEdit
              wishlist={wishlist}
              onToggleWishlist={handleToggleWishlist}
              onQuickView={(product) => setQuickViewProduct(product)}
              onSelectProduct={(product) => navigateToProduct(product)}
              onTryItOn={(product) => openVirtualTryOn(product)}
              onQuickAdd={(product, shade, size) => handleAddToCart(product, shade, size, 1)}
              onOpenShadeFinder={navigateToFindMyShade}
              onExploreShop={() => navigateToShop()}
            />

            {/* 4th: Find Your Perfect Match */}
            <ShadeFinderTeaser
              onOpenShadeFinderModal={navigateToFindMyShade}
            />

            {/* 5th: Shop The Look */}
            <ShopTheLook
              onSelectLook={(look) => navigateToShopTheLook()}
            />

            {/* 6th: Shop by Category */}
            <CategoryGridSection
              onSelectCategory={(category, subCategory) => navigateToShop(category, subCategory)}
              onViewAllCategories={() => navigateToShop()}
            />
          </div>
        )}

        {/* VIEW 2: SHOP PAGE */}
        {currentRoute.page === 'shop' && (
          <ShopPage
            initialCategory={currentRoute.category}
            initialSubCategory={currentRoute.subCategory}
            wishlist={wishlist}
            recentlyViewedIds={recentlyViewedIds}
            onToggleWishlist={handleToggleWishlist}
            onQuickView={(product) => setQuickViewProduct(product)}
            onSelectProduct={(product) => navigateToProduct(product)}
            onTryItOn={(product) => openVirtualTryOn(product)}
            onQuickAdd={(product, shade, size) => handleAddToCart(product, shade, size, 1)}
            onOpenShadeFinder={navigateToFindMyShade}
            onCategoryNavigate={(cat, subCat) => {
              setCurrentRoute({ page: 'shop', category: cat, subCategory: subCat });
            }}
          />
        )}

        {/* VIEW 3: FULL PRODUCT DETAIL PAGE (PDP) */}
        {currentRoute.page === 'product' && activeProduct && (
          <FullProductPage
            product={activeProduct}
            wishlist={wishlist}
            recentlyViewedIds={recentlyViewedIds}
            onToggleWishlist={handleToggleWishlist}
            onAddToBag={handleAddToCart}
            onBuyNow={handleBuyNow}
            onOpenShadeFinder={navigateToFindMyShade}
            onSelectProduct={(product) => navigateToProduct(product)}
            onBackToShop={() => navigateToShop()}
            onAddLookToBag={handleAddLookToBag}
            onQuickView={(product) => setQuickViewProduct(product)}
            onOpenArticle={navigateToArticle}
          />
        )}

        {/* VIEW 4: SHOP THE LOOK EDITORIAL PAGE */}
        {currentRoute.page === 'shop-the-look' && (
          <ShopTheLookPage
            onAddLookToBag={handleAddLookToBag}
            onSelectProduct={(product) => navigateToProduct(product)}
            onOpenShadeFinder={navigateToFindMyShade}
          />
        )}

        {/* VIEW 5: WISHLIST PAGE */}
        {currentRoute.page === 'wishlist' && (
          <WishlistPage
            wishlist={wishlist}
            onRemoveFromWishlist={handleToggleWishlist}
            onQuickAdd={(product, shade, size) => handleAddToCart(product, shade, size, 1)}
            onSelectProduct={(product) => navigateToProduct(product)}
            onExploreShop={() => navigateToShop()}
          />
        )}

        {/* VIEW 6: PHASE 3 FIND MY SHADE CONSULTATION */}
        {currentRoute.page === 'find-my-shade' && (
          <FindMyShadePage
            onExploreShop={() => navigateToShop()}
            onOpenTryOn={(product, shade) => openVirtualTryOn(product, shade)}
            onAddToBag={handleAddToCart}
            onSaveProfile={handleSaveBeautyProfile}
            onViewProduct={navigateToProduct}
            onToggleWishlist={handleToggleWishlist}
            wishlist={wishlist}
          />
        )}

        {/* VIEW 7: PHASE 3 & 4 MY GLAM DASHBOARD */}
        {currentRoute.page === 'my-glam' && (
          <MyGlamDashboard
            profile={beautyProfile}
            wishlist={wishlist}
            recentlyViewedIds={recentlyViewedIds}
            orders={orders}
            savedAddresses={savedAddresses}
            onOpenShadeFinder={navigateToFindMyShade}
            onOpenTryOn={(product, shade) => openVirtualTryOn(product, shade)}
            onAddToBag={handleAddToCart}
            onToggleWishlist={handleToggleWishlist}
            onSelectProduct={navigateToProduct}
            onExploreShop={() => navigateToShop()}
            onTrackOrder={navigateToOrderTracking}
            onOpenSupport={navigateToSupport}
            onNavigateAdmin={() => setCurrentRoute({ page: 'admin' })}
          />
        )}

        {/* VIEW 8: PHASE 4 SHOPPING BAG FULL PAGE */}
        {currentRoute.page === 'cart' && (
          <ShoppingBagPage
            cartItems={cartItems}
            wishlist={wishlist}
            appliedCoupon={appliedCoupon}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveFromCart}
            onMoveToWishlist={handleMoveToWishlist}
            onApplyCoupon={handleApplyCoupon}
            onRemoveCoupon={handleRemoveCoupon}
            onProceedToCheckout={navigateToCheckout}
            onContinueShopping={() => navigateToShop()}
            onOpenProduct={navigateToProduct}
            onOpenAssistant={() => setIsAssistantOpen(true)}
            onQuickAdd={(product, shade, size) => handleAddToCart(product, shade, size, 1)}
          />
        )}

        {/* VIEW 9: PHASE 4 MULTI-STEP LUXURY CHECKOUT */}
        {currentRoute.page === 'checkout' && (
          <CheckoutPage
            cartItems={cartItems}
            appliedCoupon={appliedCoupon}
            savedAddresses={savedAddresses}
            onAddNewAddress={handleAddNewAddress}
            onPlaceOrderSuccess={handlePlaceOrderSuccess}
            onBackToCart={navigateToCart}
            onOpenProduct={(productId) => {
              const p = GLAMIRK_PRODUCTS.find((item) => item.id === productId);
              if (p) navigateToProduct(p);
            }}
          />
        )}

        {/* VIEW 10: PHASE 4 ORDER CONFIRMATION */}
        {currentRoute.page === 'order-confirmation' && (
          <OrderConfirmationPage
            order={confirmedOrder || orders[0]}
            onTrackOrder={(orderId) => navigateToOrderTracking(orderId)}
            onContinueShopping={() => navigateToShop()}
            onNavigateMyGlam={navigateToMyGlam}
          />
        )}

        {/* VIEW 11: PHASE 4 ORDER TRACKING */}
        {currentRoute.page === 'order-tracking' && (
          <OrderTrackingPage
            orders={orders}
            initialOrderId={currentRoute.orderId || trackingOrderId}
            onBackToAccount={navigateToMyGlam}
            onExploreShop={() => navigateToShop()}
            onOpenSupport={navigateToSupport}
            onReorder={(productId) => {
              const prod = GLAMIRK_PRODUCTS.find((p) => p.id === productId) || GLAMIRK_PRODUCTS[0];
              handleAddToCart(prod, prod.shades?.[0]);
            }}
          />
        )}

        {/* VIEW 12: PHASE 4 CLIENT SUPPORT & FAQS */}
        {currentRoute.page === 'support' && (
          <SupportCenterPage
            onBack={navigateToHome}
            onOpenAssistant={() => setIsAssistantOpen(true)}
          />
        )}

        {/* VIEW 13: PHASE 5 THE GLAMIRK JOURNAL */}
        {currentRoute.page === 'journal' && (
          <JournalPage
            onOpenArticle={navigateToArticle}
            onOpenGuide={(guideId) => navigateToBeautyGuides()}
            onOpenProduct={navigateToProduct}
            onOpenShadeFinder={navigateToFindMyShade}
          />
        )}

        {/* VIEW 14: PHASE 5 ARTICLE DETAIL PAGE */}
        {currentRoute.page === 'article' && (
          <ArticleDetailPage
            article={currentArticle}
            onBack={navigateToJournal}
            onOpenProduct={navigateToProduct}
            onOpenArticle={navigateToArticle}
            onOpenShadeFinder={navigateToFindMyShade}
            onOpenTryOn={(pId, sId) => {
              const prod = GLAMIRK_PRODUCTS.find((p) => p.id === pId) || GLAMIRK_PRODUCTS[0];
              const sh = prod.shades?.find((s) => s.id === sId) || prod.shades?.[0];
              openVirtualTryOn(prod, sh);
            }}
          />
        )}

        {/* VIEW 15: PHASE 5 BEAUTY GUIDES & MASTERCLASSES */}
        {currentRoute.page === 'beauty-guides' && (
          <BeautyGuidesPage
            onOpenProduct={navigateToProduct}
            onOpenLook={(lookId) => navigateToShopTheLook()}
            onOpenShadeFinder={navigateToFindMyShade}
            onOpenArticle={navigateToArticle}
          />
        )}

        {/* VIEW 16: PHASE 5 SOCIAL COMMERCE & UGC HUB ("GLAMIRK ON YOU") */}
        {currentRoute.page === 'social-commerce' && (
          <SocialCommerceHub
            onOpenProduct={navigateToProduct}
            onOpenTryOn={(pId, sId) => {
              const prod = GLAMIRK_PRODUCTS.find((p) => p.id === pId) || GLAMIRK_PRODUCTS[0];
              const sh = prod.shades?.find((s) => s.id === sId) || prod.shades?.[0];
              openVirtualTryOn(prod, sh);
            }}
            onAddToCart={(prod, shade) => handleAddToCart(prod, shade)}
          />
        )}

        {/* VIEW 17: PHASE 5 SEASONAL CAMPAIGN LANDING */}
        {currentRoute.page === 'campaign' && (
          <CampaignLandingPage
            campaignId={currentRoute.campaignId || 'sovereign-velvet-festive'}
            onOpenProduct={navigateToProduct}
            onOpenTryOn={(pId, sId) => {
              const prod = GLAMIRK_PRODUCTS.find((p) => p.id === pId) || GLAMIRK_PRODUCTS[0];
              const sh = prod.shades?.find((s) => s.id === sId) || prod.shades?.[0];
              openVirtualTryOn(prod, sh);
            }}
            onOpenLook={(lookId) => navigateToShopTheLook()}
            onAddToCart={(prod, shade) => handleAddToCart(prod, shade)}
          />
        )}

        {/* VIEW 18: PHASE 6 LEGAL & COMPLIANCE POLICIES */}
        {currentRoute.page === 'legal' && (
          <LegalPage
            initialPolicy={currentRoute.policy || 'privacy'}
            onNavigateHome={navigateToHome}
          />
        )}

        {/* VIEW 19: DYNAMIC CMS MANAGED PAGES */}
        {currentRoute.page === 'dynamic-page' && (
          <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-8">
            {(() => {
              const activePage = cmsPages.find((p) => p.slug === currentRoute.slug && p.status === 'published');
              if (!activePage) {
                return (
                  <div className="text-center py-20 space-y-4">
                    <h2 className="font-serif text-3xl text-[#121212]">Page Not Found</h2>
                    <p className="text-sm text-[#6B6B6B]">This atelier page is either in draft or unavailable.</p>
                    <button
                      onClick={navigateToHome}
                      className="px-6 py-2.5 bg-[#F05A7E] text-white rounded-full text-xs font-semibold uppercase tracking-wider"
                    >
                      Return Home
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-10">
                  <div className="text-center max-w-2xl mx-auto space-y-2">
                    <h1 className="font-serif text-3xl sm:text-4xl text-[#121212]">{activePage.title}</h1>
                    <p className="text-sm text-[#6B6B6B]">{activePage.seoDescription}</p>
                  </div>

                  <div className="space-y-8">
                    {activePage.sections?.map((sec) => (
                      <DynamicSectionRenderer
                        key={sec.id}
                        section={sec}
                        onOpenProduct={(p) => navigateToProduct(p)}
                        onOpenShadeFinder={navigateToFindMyShade}
                        onOpenTryOn={(p, s) => openVirtualTryOn(p, s)}
                        onAddToCart={(p, s) => handleAddToCart(p, s)}
                        onNavigate={(url) => {
                          if (url.startsWith('#')) {
                            const pageName = url.replace('#', '') as any;
                            setCurrentRoute({ page: pageName });
                          } else if (url.startsWith('/shop')) {
                            navigateToShop();
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* VIEW 20: PHASE 6 NOT FOUND (404) PAGE */}
        {currentRoute.page === '404' && (
          <NotFoundPage
            onNavigateHome={navigateToHome}
            onNavigateShop={navigateToShop}
            onNavigateProduct={(productId) => {
              const prod = GLAMIRK_PRODUCTS.find((p) => p.id === productId);
              if (prod) navigateToProduct(prod);
            }}
            onNavigateJournal={navigateToJournal}
          />
        )}

      </main>

      {/* Floating AI Beauty Assistant Trigger Button (Optimized for Mobile and Desktop) */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          id="glamirk-beauty-assistant-trigger"
          onClick={() => setIsAssistantOpen(true)}
          className="group relative flex items-center gap-2 px-3.5 py-3 sm:px-4 sm:py-3.5 bg-white/95 text-[#121212] border border-[#E8D5A8] rounded-full shadow-[0_8px_25px_rgba(240, 90, 126,0.18)] hover:border-[#F05A7E] hover:bg-[#FCE8ED] transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
          title="Open Glamirk Beauty Assistant"
        >
          <div className="relative">
            <Sparkles className="w-4 h-4 text-[#F05A7E]" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#F05A7E] animate-ping" />
          </div>
          <span className="text-[11px] font-bold tracking-wider uppercase hidden sm:inline text-[#121212] group-hover:text-[#F05A7E] transition-colors">
            AI ASSISTANT
          </span>
        </button>
      </div>

      {/* Multi-Column Luxury Footer */}
      <Footer
        onOpenShadeFinder={navigateToFindMyShade}
        onNavigateHome={navigateToHome}
        onNavigateShop={navigateToShop}
        onNavigateShopTheLook={navigateToShopTheLook}
        onNavigateCart={navigateToCart}
        onNavigateTracking={() => navigateToOrderTracking()}
        onNavigateSupport={navigateToSupport}
        onNavigateMyGlam={navigateToMyGlam}
        onNavigateJournal={navigateToJournal}
        onNavigateGuides={navigateToBeautyGuides}
        onNavigateSocialCommerce={navigateToSocialCommerce}
        onNavigateCampaign={navigateToCampaign}
        onNavigateLegal={navigateToLegal}
        onNavigateAdmin={() => setCurrentRoute({ page: 'admin' })}
      />

      {/* Mobile Application Sticky Bottom Navigation */}
      <MobileBottomNav
        currentRoute={currentRoute}
        cartCount={cartItems.reduce((acc, item) => acc + item.quantity, 0)}
        wishlistCount={wishlist.length}
        onNavigateHome={navigateToHome}
        onNavigateShop={() => navigateToShop()}
        onOpenShadeFinder={navigateToFindMyShade}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* Modals and Slide-Over Drawers */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={navigateToCheckout}
        onViewFullBag={navigateToCart}
        onOpenProduct={(product) => {
          setIsCartOpen(false);
          navigateToProduct(product);
        }}
      />

      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlist={wishlist}
        onRemoveFromWishlist={handleToggleWishlist}
        onQuickAdd={(product, shade, size) => {
          handleAddToCart(product, shade, size, 1);
        }}
        onQuickView={(product) => setQuickViewProduct(product)}
      />

      <QuickViewModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        isWishlisted={quickViewProduct ? wishlist.includes(quickViewProduct.id) : false}
        onToggleWishlist={handleToggleWishlist}
        onAddToBag={(product, shade, size, quantity) => {
          handleAddToCart(product, shade, size, quantity);
        }}
        onTryItOn={() => {
          const p = quickViewProduct;
          setQuickViewProduct(null);
          if (p) openVirtualTryOn(p);
        }}
        onViewDetails={(product) => {
          navigateToProduct(product);
        }}
      />

      <LookDetailModal
        look={activeLook}
        isOpen={!!activeLook}
        onClose={() => setActiveLook(null)}
        onAddLookToBag={handleAddLookToBag}
      />

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectProduct={(product) => navigateToProduct(product)}
        onSelectLook={(lookId) => navigateToShopTheLook()}
        onSelectArticle={(articleId) => navigateToArticle(articleId)}
        onSelectGuide={(guideId) => navigateToBeautyGuides()}
        onSelectCampaign={(campId) => navigateToCampaign(campId)}
        onQuickAdd={(product, shade, size) => handleAddToCart(product, shade, size, 1)}
        onNavigateToCategory={(cat, subCat) => navigateToShop(cat, subCat)}
      />

      <ShadeFinderModal
        isOpen={isShadeFinderOpen}
        onClose={() => setIsShadeFinderOpen(false)}
        onSelectProduct={(product) => navigateToProduct(product)}
        onAddToBag={(product, shade, size) => handleAddToCart(product, shade, size, 1)}
      />

      <JournalModal
        article={activeArticle}
        isOpen={!!activeArticle}
        onClose={() => setActiveArticle(null)}
        onOpenShadeFinder={() => {
          setActiveArticle(null);
          navigateToFindMyShade();
        }}
      />

      {/* Phase 5 Interactive Beauty Quiz Modal */}
      <BeautyQuizModal
        isOpen={isQuizOpen}
        onClose={() => setIsQuizOpen(false)}
        onOpenProduct={navigateToProduct}
        onOpenLook={(lookId) => navigateToShopTheLook()}
        onOpenGuide={(guideId) => navigateToBeautyGuides()}
        onAddToCart={(p, s) => handleAddToCart(p, s)}
      />

      {/* Phase 3 Virtual Try-On Modal */}
      <VirtualTryOnModal
        isOpen={isTryOnOpen}
        onClose={() => setIsTryOnOpen(false)}
        initialProductId={tryOnProductId}
        initialShadeId={tryOnShadeId}
        onAddToBag={handleAddToCart}
        onToggleWishlist={handleToggleWishlist}
        isWishlisted={wishlist.includes(tryOnProductId)}
        onViewProduct={(product) => {
          setIsTryOnOpen(false);
          navigateToProduct(product);
        }}
        onOpenShadeFinder={() => {
          setIsTryOnOpen(false);
          navigateToFindMyShade();
        }}
      />

      {/* Phase 3 AI Beauty Assistant Drawer */}
      <BeautyAssistantDrawer
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        currentProductContext={activeProduct}
        hasCartItems={cartItems.length > 0}
        onOpenTryOn={(prod, shade) => {
          openVirtualTryOn(prod, shade);
        }}
        onOpenShadeFinder={navigateToFindMyShade}
        onAddToBag={handleAddToCart}
        onViewProduct={(p) => navigateToProduct(p)}
      />

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-20 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto z-50 bg-white/95 text-[#121212] px-5 py-3.5 border border-[#E8D5A8] rounded-full shadow-[0_10px_30px_rgba(240, 90, 126,0.2)] flex items-center gap-3 text-xs tracking-wider uppercase backdrop-blur-md"
          >
            <span className="w-2 h-2 rounded-full bg-[#F05A7E] animate-ping" />
            <span className="font-semibold">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function App() {
  return (
    <CMSProvider>
      <AppContent />
    </CMSProvider>
  );
}
