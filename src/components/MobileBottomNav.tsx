import React from 'react';
import { Home, Sparkles, ShoppingBag, Heart, LayoutGrid } from 'lucide-react';
import { PageRoute } from '../types';

interface MobileBottomNavProps {
  currentRoute: PageRoute;
  cartCount: number;
  wishlistCount: number;
  onNavigateHome: () => void;
  onNavigateShop: () => void;
  onOpenShadeFinder: () => void;
  onOpenWishlist: () => void;
  onOpenCart: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRoute,
  cartCount,
  wishlistCount,
  onNavigateHome,
  onNavigateShop,
  onOpenShadeFinder,
  onOpenWishlist,
  onOpenCart,
}) => {
  const isHome = currentRoute.page === 'home';
  const isShop = currentRoute.page === 'shop' || currentRoute.page === 'product';
  const isShadeFinder = currentRoute.page === 'find-my-shade';
  const isWishlist = currentRoute.page === 'wishlist';

  return (
    <nav
      id="mobile-bottom-app-navigation"
      aria-label="Mobile Application Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-[#E8D5A8] shadow-[0_-4px_20px_rgba(240, 90, 126,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
        
        {/* 1. Home Tab */}
        <button
          id="mobile-tab-home"
          onClick={onNavigateHome}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 cursor-pointer ${
            isHome ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'
          }`}
        >
          <div className="relative">
            <Home className={`w-5 h-5 ${isHome ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
            {isHome && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F05A7E] rounded-full" />
            )}
          </div>
          <span className={`text-[10px] tracking-tight mt-1 ${isHome ? 'font-bold text-[#F05A7E]' : 'font-medium'}`}>
            Home
          </span>
        </button>

        {/* 2. Shop Tab */}
        <button
          id="mobile-tab-shop"
          onClick={onNavigateShop}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 cursor-pointer ${
            isShop ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'
          }`}
        >
          <div className="relative">
            <LayoutGrid className={`w-5 h-5 ${isShop ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
            {isShop && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F05A7E] rounded-full" />
            )}
          </div>
          <span className={`text-[10px] tracking-tight mt-1 ${isShop ? 'font-bold text-[#F05A7E]' : 'font-medium'}`}>
            Shop
          </span>
        </button>

        {/* 3. Find My Shade (Center Accent Button) */}
        <button
          id="mobile-tab-shade-finder"
          onClick={onOpenShadeFinder}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 cursor-pointer ${
            isShadeFinder ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#F05A7E]'
          }`}
        >
          <div className="relative">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center -mt-3 shadow-sm border transition-all ${
              isShadeFinder 
                ? 'bg-[#F05A7E] text-white border-[#F05A7E] shadow-[0_4px_12px_rgba(240, 90, 126,0.35)] scale-105' 
                : 'bg-[#FCE8ED] text-[#F05A7E] border-[#E8D5A8] hover:scale-105'
            }`}>
              <Sparkles className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <span className={`text-[10px] tracking-tight mt-0.5 ${isShadeFinder ? 'font-bold text-[#F05A7E]' : 'font-semibold text-[#121212]'}`}>
            Shade AI
          </span>
        </button>

        {/* 4. Wishlist Tab */}
        <button
          id="mobile-tab-wishlist"
          onClick={onOpenWishlist}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 cursor-pointer relative ${
            isWishlist ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'
          }`}
        >
          <div className="relative">
            <Heart className={`w-5 h-5 ${isWishlist ? 'stroke-[2.2] fill-[#F05A7E]' : 'stroke-[1.75]'}`} />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-3.5 h-3.5 px-0.5 bg-[#F05A7E] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {wishlistCount}
              </span>
            )}
            {isWishlist && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F05A7E] rounded-full" />
            )}
          </div>
          <span className={`text-[10px] tracking-tight mt-1 ${isWishlist ? 'font-bold text-[#F05A7E]' : 'font-medium'}`}>
            Wishlist
          </span>
        </button>

        {/* 5. Bag / Cart Tab */}
        <button
          id="mobile-tab-cart"
          onClick={onOpenCart}
          className="flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 cursor-pointer text-[#6B6B6B] hover:text-[#121212] relative"
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5 stroke-[1.75]" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 bg-[#F05A7E] text-white text-[9px] font-extrabold rounded-full flex items-center justify-center shadow-xs">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-1 font-medium">
            Bag
          </span>
        </button>

      </div>
    </nav>
  );
};
