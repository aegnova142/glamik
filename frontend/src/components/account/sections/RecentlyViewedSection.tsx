/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Eye, Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { Product, Shade } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { ProductImage } from '../../product/ProductImage';
import {
  AccountButton,
  AccountEmpty,
  AccountError,
  AccountLoading,
  AccountSectionHeader,
  formatDate,
  formatMoney,
} from '../AccountUI';

interface RecentlyViewedSectionProps {
  wishlist: string[];
  onSelectProduct: (product: Product) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onToggleWishlist: (productId: string) => void;
  onExploreShop: () => void;
  showToast: (message: string) => void;
}

export const RecentlyViewedSection: React.FC<RecentlyViewedSectionProps> = ({
  wishlist,
  onSelectProduct,
  onAddToBag,
  onToggleWishlist,
  onExploreShop,
  showToast,
}) => {
  const { recentlyViewed, loadRecentlyViewed, clearRecentlyViewed } = useAccount();
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadRecentlyViewed();
  }, [loadRecentlyViewed]);

  const handleClear = async () => {
    setClearing(true);
    const res = await clearRecentlyViewed();
    setClearing(false);
    showToast(res.success ? 'Browsing history cleared' : res.error || 'Could not clear your history.');
  };

  if (recentlyViewed.loading && !recentlyViewed.loaded) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Browsing" title="Recently Viewed" />
        <AccountLoading label="Loading your history" />
      </div>
    );
  }

  if (recentlyViewed.error && !recentlyViewed.data) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Browsing" title="Recently Viewed" />
        <AccountError message={recentlyViewed.error} onRetry={() => loadRecentlyViewed(true)} />
      </div>
    );
  }

  const items = recentlyViewed.data || [];

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Browsing"
        title="Recently Viewed"
        description="Products you've opened, saved to your account so your history follows you between devices."
        action={
          items.length > 0 && (
            <AccountButton variant="ghost" loading={clearing} onClick={handleClear}>
              <Trash2 className="w-3.5 h-3.5" />
              Clear History
            </AccountButton>
          )
        }
      />

      {items.length === 0 ? (
        <AccountEmpty
          icon={Eye}
          title="Nothing viewed yet."
          description="Products you open will show up here so you can pick up where you left off."
          actionLabel="Explore Products"
          onAction={onExploreShop}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map(({ product, viewedAt }) => {
            const wishlisted = wishlist.includes(product.id);
            const outOfStock = product.inStock === false || product.stock === 0;
            return (
              <article key={product.id} className="bg-white border border-[#E8D5A8] rounded-xl overflow-hidden flex flex-col group">
                <button
                  onClick={() => onSelectProduct(product)}
                  className="aspect-square bg-[#FAF9F6] overflow-hidden relative cursor-pointer block w-full"
                  aria-label={`View ${product.name}`}
                >
                  <ProductImage
                    src={product.images?.primary}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </button>

                <div className="p-3.5 flex-1 flex flex-col">
                  <button
                    onClick={() => onSelectProduct(product)}
                    className="font-serif text-[13.5px] text-[#121212] hover:text-[#C9972B] cursor-pointer text-left leading-snug"
                  >
                    {product.name}
                  </button>
                  <span className="font-serif text-[13px] text-[#121212] mt-1">{formatMoney(product.price)}</span>
                  <span className="text-[10.5px] text-[#9C9689] mt-0.5">Viewed {formatDate(viewedAt)}</span>

                  <div className="grid grid-cols-[1fr_auto] gap-1.5 mt-3 pt-3 border-t border-[#F1EBDD]">
                    <button
                      onClick={() => onAddToBag(product, product.shades?.[0], product.sizes?.[0], 1)}
                      disabled={outOfStock}
                      className="py-2 bg-[#0B0B0B] text-white text-[9.5px] font-semibold tracking-[0.12em] uppercase rounded-full hover:bg-[#171717] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                    >
                      <ShoppingBag className="w-3 h-3" />
                      {outOfStock ? 'Sold Out' : 'Add'}
                    </button>
                    <button
                      onClick={() => onToggleWishlist(product.id)}
                      aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
                      className={`px-2.5 py-2 border rounded-full transition-colors cursor-pointer ${
                        wishlisted ? 'border-[#F05A7E] text-[#F05A7E]' : 'border-[#E8D5A8] text-[#524C4C] hover:text-[#F05A7E]'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${wishlisted ? 'fill-[#F05A7E]' : ''}`} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
