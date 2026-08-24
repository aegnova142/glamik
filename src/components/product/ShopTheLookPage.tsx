import React, { useState, useEffect, useRef } from 'react';
import { GLAMIRK_LOOKS } from '../../data/looks';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { Look, Product, Shade } from '../../types';
import { ShoppingBag, ArrowRight, Sparkles, Check, Tag, Copy } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { OffersPopupModal } from '../marketing/OffersPopupModal';

const OFFERS_POPUP_SESSION_KEY = 'glamirk_offers_popup_shown';

interface ShopTheLookPageProps {
  onAddLookToBag: (items: { product: Product; shade?: Shade; size?: string }[]) => void;
  onSelectProduct: (product: Product) => void;
  onOpenShadeFinder: () => void;
}

export const ShopTheLookPage: React.FC<ShopTheLookPageProps> = ({
  onAddLookToBag,
  onSelectProduct,
  onOpenShadeFinder,
}) => {
  const { looks, activeOffers } = useCMS();
  const displayLooks = looks && looks.length > 0 ? looks : GLAMIRK_LOOKS;
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isOffersPopupOpen, setIsOffersPopupOpen] = useState(false);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Greet the admin's active offers once per browser session, the first
  // time the shopper lands on this page — not on every visit. The ref makes
  // sure this decision only ever runs once per mount, even if `activeOffers`
  // updates its array reference again later (a 30s poll, an SSE update).
  const hasCheckedOffersPopupRef = useRef(false);
  useEffect(() => {
    if (hasCheckedOffersPopupRef.current) return;
    if (activeOffers.length === 0) return;
    hasCheckedOffersPopupRef.current = true;
    if (!sessionStorage.getItem(OFFERS_POPUP_SESSION_KEY)) {
      sessionStorage.setItem(OFFERS_POPUP_SESSION_KEY, '1');
      setIsOffersPopupOpen(true);
    }
  }, [activeOffers]);

  const filterTabs = ['ALL', 'EVERYDAY GLAM', 'DATE NIGHT', 'WEDDING GLAM', 'MINIMAL GLAM'];

  const filteredLooks = selectedFilter === 'ALL'
    ? displayLooks
    : displayLooks.filter((l) => l.category === selectedFilter);

  return (
    <div className="bg-[#FAF9F6] min-h-screen">
      {/* Editorial Header */}
      <div className="bg-[#0B0B0B] text-[#FAF9F6] py-14 sm:py-20 px-4 sm:px-6 lg:px-8 border-b border-[#171717] relative overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-3 relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C9972B]" />
            <span className="text-[10.5px] font-semibold tracking-[0.26em] uppercase text-[#C9972B]">
              EDITORIAL ARCHIVE
            </span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl text-[#FAF9F6] tracking-tight">
            SHOP THE LOOK
          </h1>

          <p className="text-xs sm:text-sm text-[#C9972B] font-light max-w-xl leading-relaxed">
            Cohesive cosmetic compositions designed around key Indian moments and celebrations. Explore every curated formulation behind each signature aesthetic.
          </p>
        </div>
      </div>

      {/* Active Offers & Campaigns */}
      {activeOffers.length > 0 && (
        <div className="bg-[#FCE8ED] border-b border-[#E8D5A8] py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#F05A7E]" />
              <span className="text-[10.5px] font-bold tracking-[0.24em] uppercase text-[#F05A7E]">
                Live Privileges
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="bg-white border border-[#E8D5A8] p-5 space-y-2.5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    {offer.tag && (
                      <span className="text-[9.5px] tracking-widest uppercase font-semibold text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5">
                        {offer.tag}
                      </span>
                    )}
                    {offer.couponCode && (
                      <button
                        onClick={() => handleCopyCode(offer.couponCode!)}
                        className="flex items-center gap-1 font-mono text-xs font-semibold tracking-wider text-[#121212] bg-[#FAF9F6] px-2 py-1 border border-[#E8D5A8] hover:border-[#C9972B] transition-colors cursor-pointer"
                      >
                        {copiedCode === offer.couponCode ? (
                          <Check className="w-3 h-3 text-[#C9972B]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {offer.couponCode}
                      </button>
                    )}
                  </div>
                  <h3 className="font-serif text-base text-[#121212]">
                    {offer.publicTitle || offer.name}
                  </h3>
                  <p className="text-xs text-[#6B6B6B] leading-relaxed">{offer.description}</p>
                  {offer.minOrderValue > 0 && (
                    <p className="text-[10.5px] text-[#6B6B6B] font-mono">
                      Minimum bag value: ₹{offer.minOrderValue}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Look Category Filter Tabs */}
      <div className="bg-[#FAF9F6] border-b border-[#E8D5A8] sticky top-16 z-20 backdrop-blur-md bg-[#FAF9F6]/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedFilter(tab)}
              className={`px-4 py-2 text-xs font-medium tracking-wider uppercase whitespace-nowrap transition-all ${
                selectedFilter === tab
                  ? 'bg-[#0B0B0B] text-[#FAF9F6] shadow-xs'
                  : 'bg-[#FAF9F6] text-[#6B6B6B] hover:text-[#121212] border border-[#E8D5A8]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Looks Showcase List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-16">
        {filteredLooks.map((look) => {
          const resolvedProducts = look.productsUsed.map((item) => {
            const prod = GLAMIRK_PRODUCTS.find((p) => p.id === item.productId) || GLAMIRK_PRODUCTS[0];
            const matchingShade = prod.shades?.find((s) => s.name === item.shadeName) || prod.shades?.[0];
            return {
              product: prod,
              role: item.role,
              shade: matchingShade,
              size: prod.selectedSize || (prod.sizes ? prod.sizes[0] : undefined),
            };
          });

          const lookTotalPrice = resolvedProducts.reduce((sum, item) => sum + item.product.price, 0);

          return (
            <div
              key={look.id}
              className="bg-[#FAF9F6] border border-[#E8D5A8] grid grid-cols-1 lg:grid-cols-12 overflow-hidden shadow-xs"
            >
              {/* Left Look Editorial Image (5 cols) */}
              <div className="lg:col-span-5 relative aspect-[4/5] lg:aspect-auto overflow-hidden bg-[#FAF9F6] flex items-center justify-center">
                {look.video ? (
                  <video
                    src={look.video}
                    poster={look.image}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={look.image}
                    alt={look.title}
                    className="w-full h-full object-contain"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B]/75 via-transparent to-transparent lg:hidden" />
                <div className="absolute bottom-4 left-4 right-4 text-white lg:hidden">
                  <span className="text-[10px] tracking-widest uppercase text-[#C9972B] block">
                    {look.category}
                  </span>
                  <h3 className="font-serif text-2xl text-white">
                    {look.title}
                  </h3>
                </div>
              </div>

              {/* Right Look Content & Products (7 cols) */}
              <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between space-y-8">
                <div className="space-y-4">
                  <div className="hidden lg:block space-y-1">
                    <span className="text-[10.5px] uppercase tracking-[0.24em] text-[#C9972B] font-semibold">
                      {look.category}
                    </span>
                    <h2 className="font-serif text-3xl text-[#121212]">
                      {look.title}
                    </h2>
                  </div>

                  <p className="font-serif text-base text-[#121212] italic">
                    &ldquo;{look.tagline}&rdquo;
                  </p>

                  <p className="text-xs sm:text-sm text-[#6B6B6B] font-light leading-relaxed">
                    {look.description}
                  </p>

                  {/* Products Breakdown */}
                  <div className="space-y-3 pt-4">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-[#121212] block">
                      Included Creations:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {resolvedProducts.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => onSelectProduct(item.product)}
                          className="p-3 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center gap-3 cursor-pointer hover:border-[#0B0B0B] transition-all"
                        >
                          <div className="w-12 h-14 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                            <img
                              src={item.product.images.primary}
                              alt={item.product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] uppercase tracking-wider text-[#C9972B] font-semibold block">
                              {item.role}
                            </span>
                            <h4 className="font-serif text-xs sm:text-sm font-medium text-[#121212] truncate">
                              {item.product.name}
                            </h4>
                            {item.shade && (
                              <span className="text-[10.5px] text-[#6B6B6B] block truncate">
                                Shade: {item.shade.name}
                              </span>
                            )}
                            <span className="font-serif text-xs text-[#121212] font-medium block mt-0.5">
                              ₹{item.product.price}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bundle Footer */}
                <div className="pt-6 border-t border-[#E8D5A8] flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-left">
                    <span className="text-xs text-[#6B6B6B] uppercase tracking-wider block">
                      Total Set Value ({resolvedProducts.length} Items):
                    </span>
                    <span className="font-serif text-2xl font-medium text-[#121212]">
                      ₹{lookTotalPrice}
                    </span>
                  </div>

                  <button
                    onClick={() => onAddLookToBag(resolvedProducts.map(p => ({ product: p.product, shade: p.shade, size: p.size })))}
                    className="w-full sm:w-auto px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#C9972B]" />
                    <span>ADD COMPLETE LOOK TO BAG</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <OffersPopupModal
        isOpen={isOffersPopupOpen}
        onClose={() => setIsOffersPopupOpen(false)}
        offers={activeOffers}
      />
    </div>
  );
};
