import React from 'react';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { Product, Shade } from '@glamirk/shared/types';
import { Heart, ShoppingBag, Trash2, ArrowRight, Sparkles } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { ProductImage } from '../product/ProductImage';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

interface WishlistPageProps {
  wishlist: string[];
  onRemoveFromWishlist: (productId: string) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onSelectProduct: (product: Product) => void;
  onExploreShop: () => void;
}

export const WishlistPage: React.FC<WishlistPageProps> = ({
  wishlist,
  onRemoveFromWishlist,
  onQuickAdd,
  onSelectProduct,
  onExploreShop,
}) => {
  const { products: cmsProducts, globalSettings } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const wishlistedProducts = catalogProducts.filter((p) => wishlist.includes(p.id));

  // Admin-managed (Admin → Wishlist Banner). No image = plain black hero with
  // the gold rule details below, which is also what shows if the image fails.
  const banner = globalSettings?.wishlistBanner;
  const bannerUrl = banner?.enabled ? banner.imageUrl : '';
  const bannerMobileUrl = banner?.enabled ? banner.mobileImageUrl || banner.imageUrl : '';
  const [bannerFailed, setBannerFailed] = React.useState(false);
  React.useEffect(() => setBannerFailed(false), [bannerUrl, bannerMobileUrl]);
  const showBanner = !!(bannerUrl || bannerMobileUrl) && !bannerFailed;

  return (
    <div className="bg-[#FAF9F6] min-h-screen">
      {/* Hero — fixed height so the banner image never shifts the layout as it loads */}
      <section className="relative overflow-hidden bg-[#0B0B0B] text-[#FAF9F6] min-h-[300px] sm:min-h-[260px] lg:min-h-[280px] flex items-center">
        {showBanner && (
          <picture>
            {bannerMobileUrl && <source media="(max-width: 767px)" srcSet={cloudinaryImageUrl(bannerMobileUrl, 'detail')} />}
            <img
              src={cloudinaryImageUrl(bannerUrl || bannerMobileUrl, 'hero')}
              alt="Luxury lipstick, blush and gold compacts from the Glamirk collection"
              onError={() => setBannerFailed(true)}
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover object-[70%_center] md:object-right opacity-55 md:opacity-100"
            />
          </picture>
        )}
        {/* Keeps the heading readable whatever the admin uploads */}
        <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#0B0B0B] md:from-30% via-[#0B0B0B]/75 md:via-[#0B0B0B]/70 md:via-60% to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#C9972B]/50 to-transparent" />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
          <div className="flex items-center gap-3">
            <Heart className="w-4 h-4 text-[#F05A7E] fill-[#F05A7E] shrink-0" aria-hidden="true" />
            <span className="text-[10.5px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-[#F05A7E]">
              YOUR PRIVATE SELECTION
            </span>
            <span className="hidden sm:block w-24 lg:w-36 h-px bg-gradient-to-r from-[#C9972B] to-transparent" aria-hidden="true" />
          </div>

          <h1 className="font-serif text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-7xl text-[#FAF9F6] tracking-tight mt-3">
            YOUR BEAUTY <span className="text-[#C9972B]">EDIT</span>
          </h1>

          <p className="text-sm sm:text-lg text-[#F05A7E] font-light mt-3">
            {wishlistedProducts.length} saved creation{wishlistedProducts.length === 1 ? '' : 's'} waiting for your vanity
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        {wishlistedProducts.length === 0 ? (
          <div className="relative overflow-hidden text-center max-w-[560px] mx-auto rounded-md border border-[#C9972B]/60 bg-[#FAF9F6] bg-[radial-gradient(circle_at_0%_100%,#FCE8ED_0%,transparent_35%),radial-gradient(circle_at_100%_0%,#FCE8ED_0%,transparent_30%)] shadow-[0_10px_40px_rgba(201,151,43,0.08)] px-5 py-9 sm:px-12 sm:py-12">
            <Heart className="w-11 h-11 mx-auto text-[#F05A7E] stroke-[1.3]" aria-hidden="true" />

            <div className="flex items-center justify-center gap-2 my-5 text-[#C9972B]" aria-hidden="true">
              <span className="w-14 h-px bg-[#C9972B]/70" />
              <Sparkles className="w-3 h-3" />
              <span className="w-14 h-px bg-[#C9972B]/70" />
            </div>

            <h2 className="font-serif text-[1.7rem] sm:text-4xl leading-tight text-[#121212]">
              YOUR BEAUTY EDIT IS <br />
              <span className="text-[#C9972B]">EMPTY.</span>
            </h2>

            <p className="text-sm sm:text-[15px] text-[#6B6B6B] leading-relaxed mt-4 max-w-md mx-auto">
              Your beauty edit is currently empty. Tap the heart icon on any product to save your favourite shades, looks or essentials here for a more personalised experience.
            </p>

            <button
              onClick={onExploreShop}
              className="mt-7 w-full sm:w-auto px-10 py-4 bg-[#E0265F] text-white text-xs font-semibold tracking-[0.18em] sm:tracking-[0.25em] uppercase whitespace-nowrap rounded-[3px] border border-[#C9972B]/70 shadow-[0_6px_18px_rgba(224,38,95,0.25)] hover:bg-[#C81E54] hover:shadow-[0_8px_24px_rgba(224,38,95,0.35)] transition-all inline-flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>EXPLORE GLAMIRK</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {wishlistedProducts.map((product) => (
              <div
                key={product.id}
                className="bg-[#FAF9F6] border border-[#F3D9E0] p-4 flex flex-col justify-between group"
              >
                <div>
                  <div
                    className="aspect-[4/5] bg-[#FAF9F6] overflow-hidden mb-4 cursor-pointer flex items-center justify-center"
                    onClick={() => onSelectProduct(product)}
                  >
                    <ProductImage
                      src={product.images.primary}
                      alt={product.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>

                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] block">
                        {product.subCategory}
                      </span>
                      <h3
                        onClick={() => onSelectProduct(product)}
                        className="font-serif text-lg text-[#121212] font-medium leading-snug cursor-pointer hover:text-[#F05A7E] transition-colors"
                      >
                        {product.name}
                      </h3>
                    </div>

                    <button
                      onClick={() => onRemoveFromWishlist(product.id)}
                      className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors"
                      title="Remove from wishlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-[#6B6B6B] line-clamp-1 font-light mt-1">
                    {product.subtitle}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-[#F3D9E0] flex items-center justify-between">
                  <span className="font-serif text-base font-medium text-[#121212]">
                    {product.currency}{product.price}
                  </span>

                  <button
                    onClick={() => {
                      onQuickAdd(product, product.shades?.[0], product.selectedSize || product.sizes?.[0]);
                    }}
                    className="px-4 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-[10.5px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-[#F05A7E]" />
                    <span>MOVE TO BAG</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
