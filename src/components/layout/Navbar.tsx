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
  KeyRound,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PageRoute } from '../../types';
import { useCMS } from '../../context/CMSContext';

interface NavbarProps {
  currentRoute: PageRoute;
  cartCount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenSearch: () => void;
  onOpenShadeFinder: () => void;
  onOpenTryOn: () => void;
  onNavigateMyGlam: () => void;
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
}) => {
  const { globalSettings } = useCMS();
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
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleShopNavigation = (category?: string | null, subCategory?: string | null) => {
    setActiveMegaMenu(null);
    setMobileMenuOpen(false);
    onNavigateShop(category, subCategory);
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
                  src={globalSettings.logoUrl}
                  alt={globalSettings.logoText || globalSettings.brandName || 'Logo'}
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

            {/* Account / My Glam / Admin dropdown container — now appears last */}
            <div className="relative" ref={accountDropdownRef}>
              <button
                id="nav-account-button"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className={`p-2 rounded-full hover:bg-[#FCE8ED] transition-colors cursor-pointer flex items-center gap-1 ${
                  currentRoute.page === 'my-glam' || currentRoute.page === 'admin'
                    ? 'text-[#F05A7E] bg-[#FCE8ED]'
                    : 'text-[#121212] hover:text-[#F05A7E]'
                }`}
                title="Account & Atelier Login"
                aria-label="Account"
              >
                <User className="w-5 h-5 stroke-[1.75]" />
              </button>

              {/* Luxury Account Quick Access Dropdown Menu */}
              <AnimatePresence>
                {accountMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-[#171717] border border-[#E8D5A8]/30 rounded-xl shadow-2xl overflow-hidden z-50 text-[#FAF9F6] divide-y divide-[#E8D5A8]/15"
                  >
                    {/* Header */}
                    <div className="p-3.5 bg-[#0B0B0B]">
                      <span className="text-[9.5px] font-mono text-[#C9972B] uppercase tracking-[0.2em] block">
                        GLAMIRK ATELIER
                      </span>
                      <h4 className="font-serif text-sm text-[#FAF9F6] mt-0.5">Account &amp; Sign In</h4>
                    </div>

                    {/* Customer Options */}
                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false);
                          onNavigateMyGlam();
                        }}
                        className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-[#0B0B0B] text-[#FAF9F6] flex items-center justify-between transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5">
                          <User className="w-4 h-4 text-[#C9972B]" />
                          <div>
                            <span className="font-semibold block">My Glam Suite</span>
                            <span className="text-[10px] text-[#6B6B6B]">Orders, shades &amp; rewards</span>
                          </div>
                        </div>
                        <ArrowRight className="w-3 h-3 text-[#6B6B6B] group-hover:text-[#FAF9F6] transition-colors" />
                      </button>

                      <button
                        onClick={() => {
                          setAccountMenuOpen(false);
                          onNavigateMyGlam();
                        }}
                        className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-[#0B0B0B] text-[#C9972B] flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <LogIn className="w-4 h-4 text-[#C9972B]" />
                        <span className="font-medium">Customer Sign In / Switch</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Shop Mega Menu Overlay with Product Categories */}
        <AnimatePresence>
          {activeMegaMenu && (
            <motion.div
              id={`mega-menu-${activeMegaMenu.toLowerCase()}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:block absolute left-0 w-full bg-white border-b border-[#E8D5A8] shadow-[0_16px_36px_rgba(240, 90, 126,0.08)] z-30 pt-6 pb-10"
              onMouseEnter={() => setActiveMegaMenu(activeMegaMenu)}
              onMouseLeave={() => setActiveMegaMenu(null)}
            >
              <div className="max-w-7xl mx-auto px-8 grid grid-cols-12 gap-8">
                
                {/* Column 1: Lips & Makeup */}
                <div className="col-span-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E8D5A8] pb-2">
                    <h4 className="text-sm font-bold text-[#121212] uppercase tracking-wider">
                      Lips &amp; Makeup
                    </h4>
                    <span className="text-[10px] bg-[#FCE8ED] text-[#F05A7E] font-bold px-2 py-0.5 rounded-full">
                      8 Shades
                    </span>
                  </div>
                  <ul className="space-y-2.5 text-[13px] text-[#6B6B6B]">
                    <li>
                      <button
                        onClick={() => handleShopNavigation('Makeup', 'Lips')}
                        className="hover:text-[#F05A7E] transition-colors text-left flex items-center justify-between w-full"
                      >
                        <span>Matte Liquid Lipsticks</span>
                        <span className="text-[11px] text-[#C9972B] font-semibold">Bestseller</span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => handleShopNavigation('Makeup', 'Lips')}
                        className="hover:text-[#F05A7E] transition-colors text-left"
                      >
                        Velvet Lip Stains &amp; Liners
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => handleShopNavigation('Makeup', 'Face')}
                        className="hover:text-[#F05A7E] transition-colors text-left"
                      >
                        Luxury Sindoor (Scarlet &amp; Maroon)
                      </button>
                    </li>
                    <li className="pt-1">
                      <button
                        onClick={() => handleShopNavigation('Makeup', null)}
                        className="text-[#F05A7E] font-bold hover:underline transition-all text-xs flex items-center gap-1"
                      >
                        <span>Explore All Makeup</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Column 2: Skin & Cleansing */}
                <div className="col-span-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E8D5A8] pb-2">
                    <h4 className="text-sm font-bold text-[#121212] uppercase tracking-wider">
                      Skin &amp; Cleansing
                    </h4>
                    <span className="text-[10px] bg-[#FCE8ED] text-[#F05A7E] font-bold px-2 py-0.5 rounded-full">
                      Balm
                    </span>
                  </div>
                  <ul className="space-y-2.5 text-[13px] text-[#6B6B6B]">
                    <li>
                      <button
                        onClick={() => handleShopNavigation('Skin', 'Cleansing')}
                        className="hover:text-[#F05A7E] transition-colors text-left font-medium text-[#121212] flex items-center justify-between w-full"
                      >
                        <span>Balm To Water Cleanser (50g)</span>
                        <span className="text-[11px] text-[#C9972B] font-semibold">Hero</span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => handleShopNavigation('Skin', 'Cleansing')}
                        className="hover:text-[#F05A7E] transition-colors text-left"
                      >
                        Travel Cleanser Format (30g)
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => handleShopNavigation('Skin', null)}
                        className="hover:text-[#F05A7E] transition-colors text-left"
                      >
                        Skin Barrier &amp; Ceramide Formulations
                      </button>
                    </li>
                    <li className="pt-1">
                      <button
                        onClick={() => handleShopNavigation('Skin', null)}
                        className="text-[#F05A7E] font-bold hover:underline transition-all text-xs flex items-center gap-1"
                      >
                        <span>Explore All Skincare</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Column 3: Quick Atelier Spotlight */}
                <div className="col-span-4 bg-[#FCE8ED] p-5 rounded-2xl border border-[#E8D5A8] flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] tracking-[0.2em] uppercase text-[#F05A7E] font-bold">
                      THE GLAMIRK ATELIER
                    </span>
                    <h3 className="text-base font-bold text-[#121212] mt-1 mb-1.5">
                      Tailored for Indian undertones.
                    </h3>
                    <p className="text-[12px] text-[#6B6B6B] leading-relaxed">
                      Precision shade matching for warm, neutral, cool, and olive complexions.
                    </p>
                  </div>
                  <div className="pt-3 space-y-2">
                    <button
                      onClick={() => handleShopNavigation(null, null)}
                      className="w-full py-2.5 bg-[#F05A7E] text-white text-[11px] font-bold uppercase tracking-wider rounded-xl hover:bg-[#F05A7E] transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>SHOP ENTIRE CATALOG</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setActiveMegaMenu(null);
                        onOpenShadeFinder();
                      }}
                      className="w-full py-2 bg-white border border-[#E8D5A8] text-[#121212] hover:text-[#F05A7E] text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
                      <span>START DIAGNOSTIC</span>
                    </button>
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
                      src={globalSettings.logoUrl}
                      alt={globalSettings.logoText || globalSettings.brandName || 'Logo'}
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
