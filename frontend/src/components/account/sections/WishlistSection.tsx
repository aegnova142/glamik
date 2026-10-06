/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { Product, Shade } from '@glamirk/shared/types';
import { useCommerce } from '../../../context/CommerceContext';
import { AccountEmpty, AccountLoading, AccountSectionHeader, formatMoney } from '../AccountUI';
import { getCurrentPrice } from '@glamirk/shared/utils/productVariant';
import { ProductImage } from '../../product/ProductImage';

interface WishlistSectionProps {
  wishlist: string[];
  allProducts: Product[];
  onSelectProduct: (product: Product) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onToggleWishlist: (productId: string) => void;
  onExploreShop: () => void;
  showToast: (message: string) => void;
}

export const WishlistSection: React.FC<WishlistSectionProps> = ({
  wishlist,
  allProducts,
  onSelectProduct,
  onAddToBag,
  onToggleWishlist,
  onExploreShop,
  showToast,
}) => {
  const { isCommerceLoading } = useCommerce();

  // The wishlist is stored server-side as product ids against the customer, so
  // it survives refresh, sign-out/in and a change of device. Ids whose product
  // has since been removed from the catalogue simply drop out rather than
  // rendering a broken card.
  const products = wishlist
    .map((id) => allProducts.find((p) => p.id === id))
    .filter((p): p is Product => !!p);

  const handleMoveToBag = (product: Product) => {
    const shade = product.shades?.[0];
    const size = product.sizes?.[0];
    onAddToBag(product, shade, size, 1);
    onToggleWishlist(product.id);
    showToast(`Moved ${product.name} to your bag`);
  };

  if (isCommerceLoading && wishlist.length === 0) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Saved" title="My Wishlist" />
        <AccountLoading label="Loading your wishlist" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Saved"
        title="My Wishlist"
        description={
          products.length > 0
            ? `${products.length} ${products.length === 1 ? 'piece' : 'pieces'} saved to your account — available on any device you sign in from.`
            : undefined
        }
      />

      {products.length === 0 ? (
        <AccountEmpty
          icon={Heart}
          title="Your wishlist is empty."
          description="Save shades and skincare you love and they'll be waiting here, on any device."
          actionLabel="Explore Products"
          onAction={onExploreShop}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {products.map((product) => {
            const shade = product.shades?.[0];
            const price = getCurrentPrice(product, shade, product.sizes?.[0]);
            const compareAt = product.originalPrice;
            const outOfStock = product.inStock === false || product.stock === 0;

            return (
              <article
                key={product.id}
                className="bg-white border border-[#E8D5A8] rounded-xl overflow-hidden flex flex-col group"
              >
                <button
                  onClick={() => onSelectProduct(product)}
                  className="aspect-square bg-[#FAF9F6] overflow-hidden cursor-pointer relative block w-full"
                  aria-label={`View ${product.name}`}
                >
                  <ProductImage
                    src={product.images?.primary}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {outOfStock && (
                    <span className="absolute inset-x-0 bottom-0 bg-[#0B0B0B]/85 text-white text-[10px] font-semibold tracking-[0.16em] uppercase py-2">
                      Out of Stock
                    </span>
                  )}
                </button>

                <div className="p-4 flex-1 flex flex-col">
                  <span className="text-[9.5px] uppercase tracking-[0.14em] text-[#524C4C]">{product.subCategory}</span>
                  <button
                    onClick={() => onSelectProduct(product)}
                    className="font-serif text-[15px] text-[#121212] hover:text-[#C9972B] cursor-pointer text-left leading-snug mt-0.5"
                  >
                    {product.name}
                  </button>
                  {shade && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#524C4C] mt-1.5">
                      <span
                        className="w-3 h-3 rounded-full border border-[#0B0B0B]/10"
                        style={{ backgroundColor: shade.hex }}
                      />
                      {shade.name}
                    </span>
                  )}

                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-serif text-[15px] text-[#121212]">{formatMoney(price)}</span>
                    {compareAt && compareAt > price && (
                      <span className="text-[11.5px] text-[#9C9689] line-through">{formatMoney(compareAt)}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2 mt-4 pt-3 border-t border-[#F1EBDD]">
                    <button
                      onClick={() => handleMoveToBag(product)}
                      disabled={outOfStock}
                      className="py-2.5 bg-[#0B0B0B] text-white text-[10px] font-semibold tracking-[0.14em] uppercase rounded-full hover:bg-[#171717] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {outOfStock ? 'Unavailable' : 'Move to Bag'}
                    </button>
                    <button
                      onClick={() => onToggleWishlist(product.id)}
                      aria-label={`Remove ${product.name} from wishlist`}
                      className="px-3 py-2.5 border border-[#E8D5A8] rounded-full text-[#524C4C] hover:text-[#C0392B] hover:border-[#C0392B]/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
