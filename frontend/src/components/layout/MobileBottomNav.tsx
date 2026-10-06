import React from 'react';
import { Home, Sparkles, ShoppingBag, LayoutGrid, User } from 'lucide-react';
import { PageRoute } from '@glamirk/shared/types';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

interface MobileBottomNavProps {
  currentRoute: PageRoute;
  cartCount: number;
  onNavigateHome: () => void;
  onNavigateShop: () => void;
  onOpenShadeFinder: () => void;
  onOpenCart: () => void;
  onOpenAccount: () => void;
}

/**
 * Home | Shop | Shade AI | Cart | Account
 *
 * Wishlist previously held the fourth slot; it now lives in the account area
 * (and is still one tap from the navbar heart on tablet/desktop), which frees
 * this slot for Account without growing the bar to six items.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRoute,
  cartCount,
  onNavigateHome,
  onNavigateShop,
  onOpenShadeFinder,
  onOpenCart,
  onOpenAccount,
}) => {
  const { customerUser, isCustomerLoggedIn } = useCustomerAuth();

  const isHome = currentRoute.page === 'home';
  const isShop = currentRoute.page === 'shop' || currentRoute.page === 'product';
  const isShadeFinder = currentRoute.page === 'find-my-shade' || currentRoute.page === 'try-on';
  const isCart = currentRoute.page === 'cart' || currentRoute.page === 'checkout';
  // 'my-glam' is the legacy suite route, still reachable and still an
  // "account" destination as far as the tab bar is concerned.
  const isAccount = currentRoute.page === 'account' || currentRoute.page === 'my-glam';

  const firstName = (customerUser?.name || '').trim().split(/\s+/)[0] || '';
  const accountLabel = isCustomerLoggedIn ? firstName.slice(0, 8) || 'Account' : 'Account';

  const tabBase =
    'flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 cursor-pointer min-w-0';
  const labelBase = 'text-[10px] tracking-tight mt-1 truncate max-w-full px-0.5';

  return (
    <nav
      id="mobile-bottom-app-navigation"
      aria-label="Mobile Application Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-[#E8D5A8] shadow-[0_-4px_20px_rgba(240,90,126,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
        {/* 1. Home */}
        <button
          id="mobile-tab-home"
          onClick={onNavigateHome}
          aria-current={isHome ? 'page' : undefined}
          className={`${tabBase} ${isHome ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'}`}
        >
          <div className="relative">
            <Home className={`w-5 h-5 ${isHome ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
            {isHome && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F05A7E] rounded-full" />}
          </div>
          <span className={`${labelBase} ${isHome ? 'font-bold text-[#F05A7E]' : 'font-medium'}`}>Home</span>
        </button>

        {/* 2. Shop */}
        <button
          id="mobile-tab-shop"
          onClick={onNavigateShop}
          aria-current={isShop ? 'page' : undefined}
          className={`${tabBase} ${isShop ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'}`}
        >
          <div className="relative">
            <LayoutGrid className={`w-5 h-5 ${isShop ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
            {isShop && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F05A7E] rounded-full" />}
          </div>
          <span className={`${labelBase} ${isShop ? 'font-bold text-[#F05A7E]' : 'font-medium'}`}>Shop</span>
        </button>

        {/* 3. Shade AI (centre accent) */}
        <button
          id="mobile-tab-shade-finder"
          onClick={onOpenShadeFinder}
          aria-current={isShadeFinder ? 'page' : undefined}
          className={`${tabBase} ${isShadeFinder ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#F05A7E]'}`}
        >
          <div className="relative">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center -mt-3 shadow-sm border transition-all ${
                isShadeFinder
                  ? 'bg-[#F05A7E] text-white border-[#F05A7E] shadow-[0_4px_12px_rgba(240,90,126,0.35)] scale-105'
                  : 'bg-[#FCE8ED] text-[#F05A7E] border-[#E8D5A8] hover:scale-105'
              }`}
            >
              <Sparkles className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <span
            className={`${labelBase} mt-0.5 ${isShadeFinder ? 'font-bold text-[#F05A7E]' : 'font-semibold text-[#121212]'}`}
          >
            Shade AI
          </span>
        </button>

        {/* 4. Cart */}
        <button
          id="mobile-tab-cart"
          onClick={onOpenCart}
          aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : 'Cart'}
          aria-current={isCart ? 'page' : undefined}
          className={`${tabBase} ${isCart ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'}`}
        >
          <div className="relative">
            <ShoppingBag className={`w-5 h-5 ${isCart ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 bg-[#F05A7E] text-white text-[9px] font-extrabold rounded-full flex items-center justify-center shadow-xs">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
            {isCart && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F05A7E] rounded-full" />}
          </div>
          <span className={`${labelBase} ${isCart ? 'font-bold text-[#F05A7E]' : 'font-medium'}`}>Cart</span>
        </button>

        {/* 5. Account — shows the signed-in state (avatar/first name) so the
            tab reflects who is logged in without opening it. */}
        <button
          id="mobile-tab-account"
          onClick={onOpenAccount}
          aria-label={isCustomerLoggedIn ? `Account, signed in as ${customerUser?.name}` : 'Account, sign in'}
          aria-current={isAccount ? 'page' : undefined}
          className={`${tabBase} ${isAccount ? 'text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#121212]'}`}
        >
          <div className="relative">
            {isCustomerLoggedIn && customerUser?.avatarUrl ? (
              <img
                src={cloudinaryImageUrl(customerUser.avatarUrl, 'avatar')}
                alt=""
                loading="lazy"
                decoding="async"
                className={`w-5 h-5 rounded-full object-cover border ${
                  isAccount ? 'border-[#F05A7E]' : 'border-[#E8D5A8]'
                }`}
              />
            ) : (
              <User className={`w-5 h-5 ${isAccount ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
            )}
            {isCustomerLoggedIn && !customerUser?.avatarUrl && (
              <span
                className="absolute -top-0.5 -right-1 w-2 h-2 bg-[#2E7D32] border border-white rounded-full"
                aria-hidden
              />
            )}
            {isAccount && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F05A7E] rounded-full" />}
          </div>
          <span className={`${labelBase} ${isAccount ? 'font-bold text-[#F05A7E]' : 'font-medium'}`}>{accountLabel}</span>
        </button>
      </div>
    </nav>
  );
};
