import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Flower2,
  ShieldCheck,
  LogIn,
  LogOut,
  KeyRound,
  Package,
  Ticket,
  Headphones,
  MapPin,
  Bell,
  Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AccountSection, PageRoute } from '@glamirk/shared/types';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { NotificationBell } from './NotificationBell';
import { useClickOutside } from '../../hooks/useClickOutside';
import { cloudinaryImageUrl, responsiveImage } from '@glamirk/shared/utils/cloudinaryImage';

/** One row of the account dropdown — same affordance for every link so the
 * signed-in and signed-out menus stay visually identical. */
const AccountMenuLink: React.FC<{ label: string; icon: React.ElementType; onClick: () => void }> = ({
  label,
  icon: Icon,
  onClick,
}) => (
  <button
    onClick={onClick}
    role="menuitem"
    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-[#0B0B0B] text-[#FAF9F6] flex items-center justify-between transition-colors cursor-pointer group"
  >
    <span className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-[#C9972B]" />
      <span className="font-medium">{label}</span>
    </span>
    <ArrowRight className="w-3 h-3 text-[#6B6B6B] group-hover:text-[#FAF9F6] transition-colors" />
  </button>
);

interface NavbarProps {
  currentRoute: PageRoute;
  cartCount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenSearch: () => void;
  onOpenShadeFinder: () => void;
  onOpenTryOn: () => void;
  /** The legacy My Glam suite page. Still routed and still reachable — the
   * account area replaces it as the default destination, not as a deletion. */
  onNavigateMyGlam?: () => void;
  /** Routes into the account area, optionally straight to one section. */
  onNavigateAccount: (section?: AccountSection) => void;
  /** Opens the sign-in modal on the requested tab. */
  onOpenAuth?: (mode: 'login' | 'register') => void;
  onCustomerLogout?: () => void;
  onNavigateHome: () => void;
  onNavigateShop: (category?: string | null, subCategory?: string | null) => void;
  onNavigateShopTheLook: () => void;
  onOpenAssistant: () => void;
  onNavigateJournal?: () => void;
  onNavigateGuides?: () => void;
  onNavigateSocialCommerce?: () => void;
  onOpenQuiz?: () => void;
  onNavigateAdmin?: () => void;
  onNavigateAbout?: () => void;
  onOpenOrder?: (orderId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  cartCount,
  wishlistCount,
  onOpenCart,
  onOpenWishlist,
  onOpenSearch,
  onOpenShadeFinder,
  onOpenTryOn,
  onNavigateMyGlam,
  onNavigateAccount,
  onOpenAuth,
  onCustomerLogout,
  onNavigateHome,
  onNavigateShop,
  onNavigateShopTheLook,
  onOpenAssistant,
  onNavigateJournal,
  onNavigateGuides,
  onNavigateSocialCommerce,
  onOpenQuiz,
  onNavigateAdmin,
  onNavigateAbout,
  onOpenOrder,
}) => {
  const { globalSettings, shopMegaMenu } = useCMS();
  const { customerUser, isCustomerLoggedIn } = useCustomerAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeMegaMenu, setActiveMegaMenu] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close account dropdown on outside click
  useClickOutside(accountDropdownRef, () => setAccountMenuOpen(false));

  // Every dropdown item closes the menu before navigating — otherwise it
  // would still be hanging open over the page it just took you to.
  const closeAccountMenu = (action: () => void) => {
    setAccountMenuOpen(false);
    action();
  };

  const handleShopNavigation = (category?: string | null, subCategory?: string | null) => {
    setActiveMegaMenu(null);
    setMobileMenuOpen(false);
    onNavigateShop(category, subCategory);
  };

  // Route a CMS-configured Shop URL to the right existing flow. Supports
  // "#find-my-shade", external links, and "/shop[/<category>[/<subcategory>]]".
  const runShopCta = (url?: string) => {
    setActiveMegaMenu(null);
    setMobileMenuOpen(false);
    if (!url) return onNavigateShop(null, null);
    if (url.startsWith('#find-my-shade') || url.startsWith('/find-my-shade')) return onOpenShadeFinder();
    if (url.startsWith('http')) {
      window.location.href = url;
      return;
    }
    const parts = url.replace(/^\/+/, '').split('/');
    if (parts[0] === 'shop') {
      const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
      return onNavigateShop(cap(parts[1]), cap(parts[2]));
    }
    onNavigateShop(null, null);
  };

  return (
    <>
      <header
        id="glamirk-navbar"
        className={`sticky top-0 z-40 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/95 backdrop-blur-md border-b border-[#E8D5A8] py-3 shadow-[0_4px_20px_rgba(240, 90, 126,0.06)]'
            : 'bg-white border-b border-[#E8D5A8] py-4'
        }`}
        onMouseLeave={() => setActiveMegaMenu(null)}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          
          {/* Left: Mobile menu trigger + Brand Logo */}
          <div className="flex items-center gap-3">
            <button
              id="mobile-menu-toggle-btn"
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 -ml-1.5 text-[#121212] hover:text-[#F05A7E] transition-colors lg:hidden"
              aria-label="Open mobile menu"
            >
              <Menu className="w-6 h-6 stroke-[1.75]" />
            </button>

            {/* Brand Logo — uploaded logo image when set, otherwise the default icon + wordmark */}
            <button
              id="brand-logo-link"
              onClick={onNavigateHome}
              className="group flex items-center gap-2.5 focus:outline-none cursor-pointer text-left"
            >
              {globalSettings?.logoUrl ? (
                <img
                  src={cloudinaryImageUrl(globalSettings.logoUrl, 'logo')}
                  alt={globalSettings.logoText || globalSettings.brandName || 'Logo'}
                  loading="eager"
                  decoding="sync"
                  className="h-11 sm:h-14 w-auto max-w-[220px] object-contain group-hover:scale-105 transition-transform"
                />
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E] group-hover:scale-105 transition-transform">
                    <Flower2 className="w-4 h-4 text-[#F05A7E]" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xl sm:text-2xl font-bold tracking-tight text-[#121212] leading-none group-hover:text-[#F05A7E] transition-colors">
                      {globalSettings?.logoText || 'Glamirk'}
                    </span>
                    <span className="text-[9px] font-medium tracking-[0.2em] text-[#6B6B6B] uppercase mt-0.5">
                      Luxury Beauty
                    </span>
                  </div>
                </>
              )}
            </button>
          </div>

          {/* Center Navigation Links (Reference style with active underline) */}
          {/* NEW ORDER: Home, Shop, Find My Shade, Offers & Looks, Blog & Journal, About */}
          <nav className="hidden lg:flex items-center space-x-6 xl:space-x-8 text-[13px] font-medium text-[#121212]">
            <button
              id="nav-btn-home"
              onClick={onNavigateHome}
              className={`relative py-1.5 transition-colors cursor-pointer ${
                currentRoute.page === 'home'
                  ? 'text-[#F05A7E] font-semibold'
                  : 'text-[#121212] hover:text-[#F05A7E]'
              }`}
            >
              Home
              {currentRoute.page === 'home' && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#F05A7E] rounded-full" />
              )}
            </button>

            {/* Shop Navigation with Product Categories Mega Menu */}
            <div
              className="relative group py-1.5"
              onMouseEnter={() => setActiveMegaMenu('SHOP')}
            >
              <button
                id="nav-btn-shop"
                onClick={() => handleShopNavigation(null, null)}
                className={`flex items-center gap-1 transition-colors cursor-pointer ${
                  activeMegaMenu === 'SHOP' || currentRoute.page === 'shop'
                    ? 'text-[#F05A7E] font-semibold'
                    : 'text-[#121212] hover:text-[#F05A7E]'
                }`}
              >
                Shop
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    activeMegaMenu === 'SHOP' ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {(currentRoute.page === 'shop' || activeMegaMenu === 'SHOP') && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#F05A7E] rounded-full" />
              )}
            </div>

            <button
              id="nav-btn-shade-finder"
              onClick={onOpenShadeFinder}
              className={`transition-colors flex items-center gap-1.5 py-1.5 cursor-pointer ${
                currentRoute.page === 'find-my-shade'
                  ? 'text-[#F05A7E] font-semibold'
                  : 'text-[#121212] hover:text-[#F05A7E]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
              Find My Shade
            </button>

            <button
              id="nav-btn-shop-look"
              onClick={onNavigateShopTheLook}
              className={`py-1.5 transition-colors cursor-pointer ${
                currentRoute.page === 'shop-the-look'
                  ? 'text-[#F05A7E] font-semibold'
                  : 'text-[#121212] hover:text-[#F05A7E]'
              }`}
            >
              Offers &amp; Looks
            </button>

            {onNavigateJournal && (
              <button
                id="nav-btn-journal"
                onClick={onNavigateJournal}
                className={`py-1.5 transition-colors cursor-pointer ${
                  currentRoute.page === 'journal' || currentRoute.page === 'article'
                    ? 'text-[#F05A7E] font-semibold'
                    : 'text-[#121212] hover:text-[#F05A7E]'
                }`}
              >
                Blog &amp; Journal
              </button>
            )}

            {onNavigateAbout && (
              <button
                id="nav-btn-about"
                onClick={onNavigateAbout}
                className={`relative py-1.5 transition-colors cursor-pointer ${
                  currentRoute.page === 'about'
                    ? 'text-[#F05A7E] font-semibold'
                    : 'text-[#121212] hover:text-[#F05A7E]'
                }`}
              >
                About
                {currentRoute.page === 'about' && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#F05A7E] rounded-full" />
                )}
              </button>
            )}
          </nav>

          {/* Right Header Utilities: Rounded Search Pill + Cart + Wishlist + Account */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            
            {/* Pill Search Input Container (Clicking opens full SearchOverlay) */}
            <button
              id="nav-search-bar-trigger"
              onClick={onOpenSearch}
              className="hidden md:flex items-center justify-between w-44 lg:w-56 px-3.5 py-2 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full text-xs text-[#6B6B6B] hover:border-[#F05A7E] hover:bg-white transition-all cursor-pointer shadow-xs"
              title="Search Glamirk products"
            >
              <span className="truncate">Search for products...</span>
              <Search className="w-3.5 h-3.5 text-[#F05A7E] shrink-0 ml-1.5" />
            </button>

            {/* Mobile Search Icon */}
            <button
              id="mobile-search-btn"
              onClick={onOpenSearch}
              className="md:hidden p-2 text-[#121212] hover:text-[#F05A7E] transition-colors"
              aria-label="Search"
            >
              <Search className="w-5 h-5 stroke-[1.75]" />
            </button>

            {/* Reference-Style Pink Cart Pill Button — now appears first */}
            <button
              id="nav-bag-button"
              onClick={onOpenCart}
              className="hidden md:flex relative items-center justify-center px-3.5 py-2 bg-[#F05A7E] text-white rounded-full hover:bg-[#F05A7E] transition-all shadow-[0_4px_14px_rgba(240, 90, 126,0.3)] hover:scale-105 group cursor-pointer"
              title="Shopping Cart"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="w-[18px] h-[18px] stroke-[2]" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-[#F05A7E] text-[9.5px] font-bold rounded-full flex items-center justify-center shadow-xs border border-[#E8D5A8]">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Wishlist button — the mobile bottom tab bar already covers this below md, so it's desktop/tablet only here to keep the mobile header from overflowing */}
            <button
              id="nav-wishlist-button"
              onClick={onOpenWishlist}
              className={`hidden md:block relative p-2 rounded-full hover:bg-[#FCE8ED] transition-colors cursor-pointer ${
                currentRoute.page === 'wishlist'
                  ? 'text-[#F05A7E]'
                  : 'text-[#121212] hover:text-[#F05A7E]'
              }`}
              title="Saved Wishlist"
              aria-label="Wishlist"
            >
              <Heart className={`w-5 h-5 stroke-[1.75] ${wishlistCount > 0 ? 'fill-[#F05A7E] text-[#F05A7E]' : ''}`} />
              {wishlistCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#F05A7E] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs">
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* Notification Bell — desktop/tablet only, same overflow-avoidance reasoning as Wishlist above; hidden entirely for guests */}
            <div className="hidden md:block">
              <NotificationBell onOpenOrder={onOpenOrder} />
            </div>

            {/* Account dropdown — two distinct states. Signed out, it shows
                only public entry points; nothing about the account itself is
                rendered until there's actually a session. */}
            <div className="relative" ref={accountDropdownRef}>
              <button
                id="nav-account-button"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                className={`p-2 rounded-full hover:bg-[#FCE8ED] transition-colors cursor-pointer flex items-center gap-1 ${
                  currentRoute.page === 'account' || currentRoute.page === 'my-glam'
                    ? 'text-[#F05A7E] bg-[#FCE8ED]'
                    : 'text-[#121212] hover:text-[#F05A7E]'
                }`}
                title={isCustomerLoggedIn ? `Signed in as ${customerUser?.name}` : 'Account & Sign In'}
                aria-label="Account"
              >
                {isCustomerLoggedIn && customerUser?.avatarUrl ? (
                  <img src={cloudinaryImageUrl(customerUser.avatarUrl, 'avatar')} alt="" loading="lazy" decoding="async" className="w-5 h-5 rounded-full object-cover border border-[#E8D5A8]" />
                ) : (
                  <User className="w-5 h-5 stroke-[1.75]" />
                )}
                {isCustomerLoggedIn && !customerUser?.avatarUrl && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#2E7D32] border border-white rounded-full" aria-hidden />
                )}
              </button>

              <AnimatePresence>
                {accountMenuOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-72 bg-[#171717] border border-[#E8D5A8]/30 rounded-xl shadow-2xl overflow-hidden z-50 text-[#FAF9F6] divide-y divide-[#E8D5A8]/15"
                  >
                    {isCustomerLoggedIn ? (
                      <>
                        {/* Header — signed in */}
                        <div className="p-3.5 bg-[#0B0B0B]">
                          <span className="text-[9.5px] font-mono text-[#C9972B] uppercase tracking-[0.2em] block">
                            GLAMIRK ATELIER
                          </span>
                          <h4 className="font-serif text-sm text-[#FAF9F6] mt-0.5 truncate">
                            Hello, {(customerUser?.name || '').trim().split(/\s+/)[0] || 'there'}
                          </h4>
                          <button
                            onClick={() => closeAccountMenu(() => onNavigateAccount())}
                            className="text-[10.5px] text-[#C9972B] hover:text-[#E3B84B] transition-colors cursor-pointer mt-0.5"
                          >
                            My Glam Suite →
                          </button>
                        </div>

                        <div className="p-2 space-y-0.5">
                          {[
                            { label: 'My Orders', icon: Package, section: 'orders' as AccountSection },
                            { label: 'My Wishlist', icon: Heart, section: 'wishlist' as AccountSection },
                            { label: 'Coupons & Rewards', icon: Ticket, section: 'rewards' as AccountSection },
                            { label: 'Help Center', icon: Headphones, section: 'help' as AccountSection },
                          ].map((item) => (
                            <AccountMenuLink
                              key={item.section}
                              label={item.label}
                              icon={item.icon}
                              onClick={() => closeAccountMenu(() => onNavigateAccount(item.section))}
                            />
                          ))}
                        </div>

                        <div className="p-2 space-y-0.5">
                          {[
                            { label: 'My Profile', icon: User, section: 'profile' as AccountSection },
                            { label: 'Saved Addresses', icon: MapPin, section: 'addresses' as AccountSection },
                            { label: 'Notifications', icon: Bell, section: 'notifications' as AccountSection },
                            { label: 'Account Settings', icon: Settings, section: 'settings' as AccountSection },
                          ].map((item) => (
                            <AccountMenuLink
                              key={item.section}
                              label={item.label}
                              icon={item.icon}
                              onClick={() => closeAccountMenu(() => onNavigateAccount(item.section))}
                            />
                          ))}
                        </div>

                        <div className="p-2">
                          <button
                            onClick={() => closeAccountMenu(() => onCustomerLogout?.())}
                            role="menuitem"
                            className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-[#0B0B0B] text-[#F05A7E] flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <LogOut className="w-4 h-4" />
                            <span className="font-medium">Logout</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Header — signed out. Deliberately shows no order,
                            wishlist or reward data: those links route to sign-in. */}
                        <div className="p-3.5 bg-[#0B0B0B]">
                          <span className="text-[9.5px] font-mono text-[#C9972B] uppercase tracking-[0.2em] block">
                            GLAMIRK ATELIER
                          </span>
                          <h4 className="font-serif text-sm text-[#FAF9F6] mt-0.5">Account &amp; Sign In</h4>
                        </div>

                        {/* Signing in and creating an account are the same
                            step now — one mobile number, one code — so this is
                            one button rather than two that go to the same place. */}
                        <div className="p-3.5 space-y-2.5">
                          <p className="text-[11px] text-[#9C9689] leading-relaxed">
                            Sign in with your mobile number. New here? Your account is created automatically.
                          </p>

                          <button
                            onClick={() => closeAccountMenu(() => onOpenAuth?.('login'))}
                            className="w-full px-3.5 py-2.5 bg-gradient-to-r from-[#C9972B] to-[#E3B84B] text-[#0B0B0B] text-[10.5px] font-bold tracking-[0.14em] uppercase rounded-full hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            Sign In / Create Account
                          </button>
                        </div>

                        <div className="p-2 space-y-0.5">
                          {[
                            { label: 'Orders', icon: Package, section: 'orders' as AccountSection },
                            { label: 'Wishlist', icon: Heart, section: 'wishlist' as AccountSection },
                            { label: 'Coupons & Rewards', icon: Ticket, section: 'rewards' as AccountSection },
                            { label: 'Help Center', icon: Headphones, section: 'help' as AccountSection },
                          ].map((item) => (
                            <AccountMenuLink
                              key={item.section}
                              label={item.label}
                              icon={item.icon}
                              onClick={() => closeAccountMenu(() => onNavigateAccount(item.section))}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Shop Mega Menu Overlay with Product Categories */}
        <AnimatePresence>
          {/* [Glamik CMS] 2026-10-03 — Shop mega-menu is now CMS-driven (columns,
              items, promo). Image onError guards added 2026-10-05. */}
          {activeMegaMenu === 'SHOP' && shopMegaMenu && shopMegaMenu.enabled !== false && (
            <motion.div
              id="mega-menu-shop"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:block absolute left-0 w-full z-30 pt-3 pb-8"
              onMouseEnter={() => setActiveMegaMenu('SHOP')}
              onMouseLeave={() => setActiveMegaMenu(null)}
            >
              <div className="max-w-7xl mx-auto px-6">
                <div className="relative bg-white rounded-3xl border border-[#F3D9E0] shadow-[0_24px_60px_rgba(240,90,126,0.14)] p-5 xl:p-6">
                  {/* Caret pointing to the Shop tab */}
                  <span className="absolute -top-2 left-[8.5rem] w-4 h-4 bg-white border-l border-t border-[#F3D9E0] rotate-45 rounded-tl-sm" />

                  <div className="relative grid grid-cols-12 gap-5">
                    {/* Category columns */}
                    {shopMegaMenu.columns.map((col, ci) => (
                      <div key={col.id} className={`col-span-4 ${ci > 0 ? 'lg:border-l lg:border-[#F0E6E9] lg:pl-5' : ''}`}>
                        {/* Column header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="w-11 h-11 rounded-full bg-[#FCE8ED] border border-[#F3D9E0] flex items-center justify-center overflow-hidden shrink-0">
                              {col.iconUrl ? (
                                <img src={cloudinaryImageUrl(col.iconUrl, 'thumb')} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              ) : ci === 0 ? (
                                <Sparkles className="w-5 h-5 text-[#F05A7E]" />
                              ) : (
                                <Flower2 className="w-5 h-5 text-[#F05A7E]" />
                              )}
                            </span>
                            <h4 className="text-sm font-bold text-[#121212] uppercase tracking-wide">{col.title}</h4>
                          </div>
                          {col.badgeEnabled && col.badge && (
                            <button
                              onClick={() => runShopCta(col.viewAllUrl)}
                              className="inline-flex items-center gap-1 text-[11px] bg-[#FCE8ED] text-[#F05A7E] font-bold px-2.5 py-1 rounded-full hover:bg-[#F8D3DD] transition-colors cursor-pointer"
                            >
                              {col.badge}
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="h-px bg-[#F0E6E9] mb-2" />

                        {/* Items */}
                        <ul className="space-y-1">
                          {col.items.map((item) => (
                            <li key={item.id}>
                              <button
                                onClick={() => runShopCta(item.url)}
                                className="group w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#FDF2F5] transition-colors text-left cursor-pointer"
                              >
                                <span className="w-11 h-11 rounded-lg bg-[#FCE8ED] border border-[#F3D9E0] overflow-hidden shrink-0 flex items-center justify-center">
                                  {item.imageUrl ? (
                                    <img src={cloudinaryImageUrl(item.imageUrl, 'thumb')} alt={item.altText || item.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                  ) : (
                                    <ShoppingBag className="w-4 h-4 text-[#F05A7E]/50" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="text-[13px] font-semibold text-[#121212] group-hover:text-[#F05A7E] transition-colors truncate">
                                      {item.name}
                                    </span>
                                    {item.badge && (
                                      <span className="text-[10px] bg-[#FBE6C9] text-[#B07A1E] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                        {item.badge}
                                      </span>
                                    )}
                                  </span>
                                  {item.subtitle && <span className="block text-[11px] text-[#9A9A9A] truncate">{item.subtitle}</span>}
                                </span>
                                <ArrowRight className="w-4 h-4 text-[#D9C3C9] group-hover:text-[#F05A7E] group-hover:translate-x-0.5 transition-all shrink-0" />
                              </button>
                            </li>
                          ))}
                        </ul>

                        {/* View-all button */}
                        <button
                          onClick={() => runShopCta(col.viewAllUrl)}
                          className="mt-3 w-full py-3 rounded-2xl border border-[#F3D9E0] bg-[#FDF2F5] text-[#F05A7E] text-[13px] font-bold hover:bg-[#FCE8ED] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>{col.viewAllLabel}</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {/* Promotional banner */}
                    {shopMegaMenu.promo && shopMegaMenu.promo.isActive !== false && (
                      <div className="col-span-4 relative overflow-hidden rounded-2xl border border-[#F3D9E0] bg-gradient-to-br from-[#FDE7EE] via-[#FBD9E4] to-[#F6C6D5] p-5 flex flex-col">
                        {/* Media (right-anchored) */}
                        {shopMegaMenu.promo.mediaUrl && (
                          <div className="pointer-events-none absolute -right-2 bottom-0 top-8 w-1/2">
                            {shopMegaMenu.promo.mediaType === 'video' ? (
                              <video
                                src={shopMegaMenu.promo.mediaUrl}
                                poster={shopMegaMenu.promo.posterUrl || undefined}
                                muted
                                loop
                                autoPlay
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-contain object-bottom"
                              />
                            ) : (
                              <img
                                {...responsiveImage(shopMegaMenu.promo.mediaUrl, 'card', '340px')}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-contain object-bottom"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                          </div>
                        )}

                        <div className="relative max-w-[62%]">
                          {shopMegaMenu.promo.label && (
                            <span className="text-[10px] tracking-[0.18em] uppercase text-[#C23B63] font-bold">
                              {shopMegaMenu.promo.label}
                            </span>
                          )}
                          <h3 className="mt-1 font-serif text-xl xl:text-2xl font-bold text-[#2B1016] leading-snug">
                            {shopMegaMenu.promo.title.split(' ').map((w, i, arr) =>
                              i >= arr.length - 2 ? <span key={i} className="text-[#E0265F]">{w} </span> : <span key={i}>{w} </span>
                            )}
                          </h3>
                          {shopMegaMenu.promo.description && (
                            <p className="mt-2 text-[12px] text-[#6B4A52] leading-relaxed">{shopMegaMenu.promo.description}</p>
                          )}
                        </div>

                        <div className="relative mt-auto pt-4 space-y-2 max-w-[80%]">
                          {shopMegaMenu.promo.primaryCtaLabel && (
                            <button
                              onClick={() => runShopCta(shopMegaMenu.promo.primaryCtaUrl)}
                              className="w-full py-3 bg-[#E0265F] text-white text-[11px] font-bold uppercase tracking-wider rounded-xl hover:bg-[#C81F53] transition-colors flex items-center justify-center gap-1.5 shadow-[0_6px_16px_rgba(224,38,95,0.3)] cursor-pointer"
                            >
                              <span>{shopMegaMenu.promo.primaryCtaLabel}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {shopMegaMenu.promo.secondaryCtaLabel && (
                            <button
                              onClick={() => runShopCta(shopMegaMenu.promo.secondaryCtaUrl)}
                              className="w-full py-2.5 bg-white/90 backdrop-blur text-[#2B1016] hover:text-[#E0265F] text-[11px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-[#E0265F]" />
                              <span>{shopMegaMenu.promo.secondaryCtaLabel}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Mobile Full-Height App Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-50 bg-[#0B0B0B]/40 backdrop-blur-xs lg:hidden"
            />

            <motion.div
              id="mobile-navigation-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-white flex flex-col justify-between overflow-y-auto shadow-2xl lg:hidden border-r border-[#E8D5A8]"
            >
              {/* App Sheet Header */}
              <div className="p-4.5 border-b border-[#E8D5A8] flex items-center justify-between bg-[#FCE8ED] sticky top-0 z-10">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigateHome();
                  }}
                  className="flex items-center gap-2.5 text-left"
                >
                  {globalSettings?.logoUrl ? (
                    <img
                      src={cloudinaryImageUrl(globalSettings.logoUrl, 'logo')}
                      alt={globalSettings.logoText || globalSettings.brandName || 'Logo'}
                      decoding="async"
                      className="h-10 w-auto max-w-[180px] object-contain"
                    />
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-white border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E] shadow-xs">
                        <Flower2 className="w-4 h-4 text-[#F05A7E]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-base font-bold text-[#121212] leading-none">
                          {globalSettings?.logoText || 'Glamirk'}
                        </span>
                        <span className="text-[8.5px] font-semibold tracking-[0.2em] text-[#6B6B6B] uppercase mt-0.5">
                          Luxury Beauty
                        </span>
                      </div>
                    </>
                  )}
                </button>
                <button
                  id="close-mobile-menu-btn"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center text-[#6B6B6B] hover:text-[#F05A7E] transition-colors rounded-full hover:bg-white bg-white/60 border border-[#E8D5A8]/60 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-4.5 h-4.5 stroke-[2]" />
                </button>
              </div>

              {/* Mobile Navigation Groups */}
              <div className="px-5 py-4 space-y-6 flex-grow">
                
                {/* 1. SHOP SECTION */}
                <div>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block mb-2 px-1">
                    Shop
                  </span>
                  <div className="space-y-1 bg-[#FCE8ED] p-1.5 rounded-2xl border border-[#E8D5A8]/70">
                    <button
                      onClick={() => handleShopNavigation(null, null)}
                      className="w-full text-left font-semibold text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <span>Shop All Products</span>
                      <span className="text-[11px] text-[#F05A7E] font-bold">All →</span>
                    </button>
                    <button
                      onClick={() => handleShopNavigation('Makeup', 'Lips')}
                      className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <span>Lipstick &amp; Makeup</span>
                      <span className="text-[11px] text-[#6B6B6B]">8 Shades</span>
                    </button>
                    <button
                      onClick={() => handleShopNavigation('Skin', 'Cleansing')}
                      className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <span>Skin &amp; Cleansers</span>
                      <span className="text-[11px] text-[#6B6B6B]">Balm</span>
                    </button>
                    <button
                      onClick={() => handleShopNavigation('Makeup', 'Face')}
                      className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <span>Ceremonial Sindoor</span>
                      <span className="text-[11px] text-[#6B6B6B]">Luxe</span>
                    </button>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onNavigateShopTheLook();
                      }}
                      className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <span>Offers &amp; Curated Looks</span>
                      <span className="text-[11px] text-[#F05A7E] font-semibold">Featured</span>
                    </button>
                  </div>
                </div>

                {/* 2. BEAUTY TOOLS SECTION */}
                <div>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block mb-2 px-1">
                    AI &amp; AR Beauty Tools
                  </span>
                  <div className="space-y-1 bg-[#FCE8ED] p-1.5 rounded-2xl border border-[#E8D5A8]/70">
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenShadeFinder();
                      }}
                      className="w-full text-left font-semibold text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#F05A7E]" />
                        <span>Find My Shade AI</span>
                      </div>
                      <span className="text-[10px] bg-[#F05A7E] text-white px-2 py-0.5 rounded-full font-bold">
                        DIAGNOSTIC
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenTryOn();
                      }}
                      className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#F05A7E]" />
                        <span>Virtual Try-On Studio</span>
                      </div>
                      <span className="text-[10px] text-[#6B6B6B]">Live AR</span>
                    </button>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenAssistant();
                      }}
                      className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#F05A7E]" />
                        <span>Beauty Assistant Chat</span>
                      </div>
                      <span className="text-[10px] text-[#6B6B6B]">AI 24/7</span>
                    </button>
                  </div>
                </div>

                {/* 3. DISCOVER SECTION */}
                <div>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block mb-2 px-1">
                    Discover &amp; Community
                  </span>
                  <div className="space-y-1 bg-[#FCE8ED] p-1.5 rounded-2xl border border-[#E8D5A8]/70">
                    {onNavigateJournal && (
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onNavigateJournal();
                        }}
                        className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                      >
                        <span>The Glamirk Journal</span>
                        <span className="text-[11px] text-[#6B6B6B]">Editorial</span>
                      </button>
                    )}
                    {onNavigateGuides && (
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onNavigateGuides();
                        }}
                        className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                      >
                        <span>Beauty Guides</span>
                        <span className="text-[11px] text-[#6B6B6B]">Masterclass</span>
                      </button>
                    )}
                    {onNavigateSocialCommerce && (
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onNavigateSocialCommerce();
                        }}
                        className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                      >
                        <span>Glamirk On You</span>
                        <span className="text-[11px] text-[#F05A7E] font-semibold">Community</span>
                      </button>
                    )}
                    {onNavigateAbout && (
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onNavigateAbout();
                        }}
                        className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                      >
                        <span>About Us</span>
                        <span className="text-[11px] text-[#6B6B6B]">Our Story</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. ACCOUNT SECTION — the hamburger is the other way into
                    the account on mobile, alongside the bottom-nav tab. */}
                <div>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block mb-2 px-1">
                    {isCustomerLoggedIn ? `Hello, ${(customerUser?.name || '').trim().split(/\s+/)[0]}` : 'Account'}
                  </span>
                  <div className="space-y-1 bg-[#FCE8ED] p-1.5 rounded-2xl border border-[#E8D5A8]/70">
                    {isCustomerLoggedIn ? (
                      <>
                        {[
                          { label: 'My Glam Suite', section: undefined as AccountSection | undefined, hint: 'Dashboard' },
                          { label: 'My Orders', section: 'orders' as AccountSection, hint: 'Track & return' },
                          { label: 'My Wishlist', section: 'wishlist' as AccountSection, hint: 'Saved' },
                          { label: 'Coupons & Rewards', section: 'rewards' as AccountSection, hint: 'Points' },
                          { label: 'Help Center', section: 'help' as AccountSection, hint: 'Support' },
                        ].map((item) => (
                          <button
                            key={item.label}
                            onClick={() => {
                              setMobileMenuOpen(false);
                              onNavigateAccount(item.section);
                            }}
                            className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                          >
                            <span>{item.label}</span>
                            <span className="text-[11px] text-[#6B6B6B]">{item.hint}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            onCustomerLogout?.();
                          }}
                          className="w-full text-left font-medium text-sm text-[#F05A7E] transition-colors flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Logout</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            onOpenAuth?.('login');
                          }}
                          className="w-full text-left font-semibold text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white cursor-pointer"
                        >
                          <span>Sign In / Create Account</span>
                          <LogIn className="w-4 h-4 text-[#F05A7E]" />
                        </button>
                        {[
                          { label: 'Orders', section: 'orders' as AccountSection },
                          { label: 'Wishlist', section: 'wishlist' as AccountSection },
                          { label: 'Coupons & Rewards', section: 'rewards' as AccountSection },
                          { label: 'Help Center', section: 'help' as AccountSection },
                        ].map((item) => (
                          <button
                            key={item.label}
                            onClick={() => {
                              setMobileMenuOpen(false);
                              onNavigateAccount(item.section);
                            }}
                            className="w-full text-left font-medium text-sm text-[#121212] hover:text-[#F05A7E] transition-colors flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white cursor-pointer"
                          >
                            <span>{item.label}</span>
                            <span className="text-[11px] text-[#6B6B6B]">Sign in</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>

              </div>

              {/* Sticky Bottom Actions in Menu */}
              <div className="p-4 bg-[#FCE8ED] border-t border-[#E8D5A8] space-y-2 sticky bottom-0 z-10">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenShadeFinder();
                  }}
                  className="w-full py-3 px-4 bg-[#F05A7E] text-white text-xs font-bold tracking-wider uppercase rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(240, 90, 126,0.25)] hover:bg-[#F05A7E] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>FIND MY SHADE</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenTryOn();
                  }}
                  className="w-full py-3 px-4 bg-white border border-[#E8D5A8] text-[#121212] text-xs font-bold tracking-wider uppercase rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-[#FCE8ED] hover:border-[#F05A7E]"
                >
                  <Sparkles className="w-4 h-4 text-[#F05A7E]" />
                  <span>VIRTUAL TRY-ON</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
