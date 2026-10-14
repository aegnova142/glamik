import React, { useState, useEffect, useRef } from 'react';
import { GLAMIRK_LOOKS } from '@glamirk/shared/data/looks';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { CMSOffer, Look, Product, Shade } from '@glamirk/shared/types';
import { ArrowRight, Sparkles, Check, Tag, Copy, Heart } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { OffersPopupModal } from '../marketing/OffersPopupModal';
import { Leaf, Petal, OrnamentDefs } from '../marketing/BotanicalOrnaments';
import { ProductImage } from './ProductImage';

const OFFERS_POPUP_SESSION_KEY = 'glamirk_offers_popup_shown';
const FILTER_TABS = ['ALL', 'EVERYDAY GLAM', 'DATE NIGHT', 'WEDDING GLAM', 'MINIMAL GLAM'];

const formatPrice = (value: number) => `₹ ${value.toLocaleString('en-IN')}`;

interface ShopTheLookPageProps {
  onAddLookToBag: (items: { product: Product; shade?: Shade; size?: string }[]) => void;
  onSelectProduct: (product: Product) => void;
  onOpenShadeFinder: () => void;
  /** Product ids the customer has saved. Omit to hide the heart buttons. */
  wishlist?: string[];
  onToggleWishlist?: (productId: string) => void;
}

export const ShopTheLookPage: React.FC<ShopTheLookPageProps> = ({
  onAddLookToBag,
  onSelectProduct,
  wishlist,
  onToggleWishlist,
}) => {
  const { looks, activeOffers, products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const displayLooks = looks && looks.length > 0 ? looks : GLAMIRK_LOOKS;
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [copyStatus, setCopyStatus] = useState<{ code: string; ok: boolean } | null>(null);
  const [isOffersPopupOpen, setIsOffersPopupOpen] = useState(false);

  const handleCopyCode = async (code: string) => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard is unavailable on insecure origins and in some embedded
      // browsers — say so rather than pretending it worked.
      ok = false;
    }
    setCopyStatus({ code, ok });
    window.setTimeout(() => setCopyStatus((s) => (s?.code === code ? null : s)), 2200);
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

  const filteredLooks =
    selectedFilter === 'ALL' ? displayLooks : displayLooks.filter((l) => l.category === selectedFilter);

  return (
    <div className="bg-[var(--stl-surface)] min-h-screen font-sans text-[var(--stl-ink)]">
      {/* Editorial hero */}
      <section className="relative overflow-hidden bg-[#0B0B0B] text-[#FAF9F6]">
        <HeroBotanicals />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-9 pb-8 sm:pt-10 sm:pb-7 lg:pt-10 lg:pb-6">
          <div className="max-w-[600px]">
            <p className="flex items-center gap-2.5 text-[11px] sm:text-[13px] font-medium tracking-[0.3em] uppercase text-[var(--stl-gold)]">
              <Sparkles className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              Editorial Archive
            </p>
            <h1 className="font-serif !font-semibold text-[42px] sm:text-[56px] lg:text-[66px] leading-[1.02] tracking-[0.01em] text-[#FAF9F6] mt-3">
              SHOP THE LOOK
            </h1>
            <p className="mt-2 sm:mt-3 text-[15px] sm:text-[18px] leading-[1.45] text-[var(--stl-gold-bright)]">
              Cohesive cosmetic compositions designed around key Indian moments and celebrations. Explore every
              curated formulation behind each signature aesthetic.
            </p>
          </div>
        </div>
      </section>

      {/* Live privileges — the admin's active offers, exactly as configured */}
      {activeOffers.length > 0 && (
        <section
          aria-labelledby="stl-privileges"
          className="bg-[linear-gradient(180deg,#FCE8ED_0%,#FBEFF2_100%)] border-b border-[var(--stl-border-soft)]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
            <h2
              id="stl-privileges"
              className="flex items-center gap-2.5 text-[12px] sm:text-[13px] font-medium tracking-[0.3em] uppercase text-[var(--stl-pink)]"
            >
              <Tag className="w-[18px] h-[18px]" strokeWidth={1.5} aria-hidden="true" />
              Live Privileges
            </h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {activeOffers.map((offer, i) => (
                <PrivilegeCard
                  key={offer.id}
                  offer={offer}
                  variant={i % 2 === 0 ? 'gift' : 'swatch'}
                  copyStatus={copyStatus?.code === offer.couponCode ? copyStatus : null}
                  onCopy={handleCopyCode}
                />
              ))}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {copyStatus
              ? copyStatus.ok
                ? `Code ${copyStatus.code} copied to clipboard.`
                : `Could not copy automatically. The code is ${copyStatus.code}.`
              : ''}
          </p>
        </section>
      )}

      {/* Category filters */}
      <div className="bg-[var(--stl-surface)] border-b border-[var(--stl-border-soft)]">
        <div
          role="group"
          aria-label="Filter looks by occasion"
          className="stl-no-scrollbar max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex sm:justify-center gap-2.5 sm:gap-3 overflow-x-auto"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={selectedFilter === tab}
              onClick={() => setSelectedFilter(tab)}
              className={`stl-filter shrink-0 h-10 ${tab === 'ALL' ? 'px-8' : 'px-5 sm:px-6'} text-[12px] sm:text-[13px] tracking-[0.08em] uppercase whitespace-nowrap rounded-[2px] cursor-pointer`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Looks */}
      <p className="sr-only" aria-live="polite">
        {filteredLooks.length} {filteredLooks.length === 1 ? 'look' : 'looks'} shown
      </p>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7 space-y-8 sm:space-y-10">
        {filteredLooks.length === 0 ? (
          <div className="border border-[var(--stl-border)] bg-[var(--stl-card)] px-6 py-14 text-center">
            <Sparkles className="w-6 h-6 mx-auto text-[var(--stl-gold)]" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="font-serif !font-semibold text-[26px] mt-3">
              No {selectedFilter.toLowerCase()} looks yet
            </h2>
            <p className="text-[15px] text-[var(--stl-muted)] mt-2">
              New compositions are added to the archive regularly.
            </p>
            <button
              type="button"
              onClick={() => setSelectedFilter('ALL')}
              className="stl-filter mt-5 h-10 px-6 text-[13px] tracking-[0.08em] uppercase cursor-pointer"
            >
              View all looks
            </button>
          </div>
        ) : (
          filteredLooks.map((look, index) => (
            <LookCard
              key={look.id}
              look={look}
              catalog={catalogProducts}
              isFirst={index === 0}
              wishlist={wishlist}
              onToggleWishlist={onToggleWishlist}
              onSelectProduct={onSelectProduct}
              onAddLookToBag={onAddLookToBag}
            />
          ))
        )}
      </div>

      <OffersPopupModal isOpen={isOffersPopupOpen} onClose={() => setIsOffersPopupOpen(false)} offers={activeOffers} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const PrivilegeCard: React.FC<{
  offer: CMSOffer;
  variant: 'gift' | 'swatch';
  copyStatus: { ok: boolean } | null;
  onCopy: (code: string) => void;
}> = ({ offer, variant, copyStatus, onCopy }) => (
  <article className="relative overflow-hidden bg-[var(--stl-surface)] border border-[var(--stl-border)] shadow-[var(--stl-shadow-card)] min-h-[172px]">
    <PrivilegeArt variant={variant} />
    <div className={`relative z-10 py-5 sm:py-6 pr-5 sm:pr-6 ${variant === 'gift' ? 'pl-[92px] sm:pl-[108px]' : 'pl-5 sm:pl-[30px]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {offer.tag && (
          <span className="px-3 py-1 text-[10.5px] sm:text-[11px] font-medium tracking-[0.08em] uppercase text-[#A87918] bg-[#C9972B]/10">
            {offer.tag}
          </span>
        )}
        {offer.couponCode && (
          <button
            type="button"
            onClick={() => onCopy(offer.couponCode!)}
            aria-label={`Copy code ${offer.couponCode}`}
            className="stl-focus ml-auto flex items-center gap-2 h-[30px] px-3 bg-white border border-[var(--stl-border)] hover:border-[var(--stl-pink)] text-[12px] sm:text-[13px] font-semibold tracking-[0.1em] text-[var(--stl-ink)] transition-colors cursor-pointer"
          >
            {copyStatus?.ok ? (
              <Check className="w-4 h-4 text-[#2E7D4F]" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            )}
            {copyStatus ? (copyStatus.ok ? 'COPIED' : offer.couponCode) : offer.couponCode}
          </button>
        )}
      </div>
      <h3 className="font-serif !font-semibold text-[22px] sm:text-[26px] leading-tight text-[var(--stl-ink)] mt-3">
        {offer.publicTitle || offer.name}
      </h3>
      <p className="text-[14px] sm:text-[15px] leading-[1.45] text-[var(--stl-ink-soft)] mt-2 max-w-[340px]">
        {offer.description}
      </p>
      {offer.minOrderValue > 0 && (
        <p className="mt-3 pt-3 border-t border-[var(--stl-border-soft)] max-w-[310px] text-[13px] sm:text-[14px] text-[var(--stl-ink-soft)]">
          Minimum bag value:&nbsp;&nbsp;₹{offer.minOrderValue.toLocaleString('en-IN')}
        </p>
      )}
    </div>
  </article>
);

/** Small decorative still-life per card: a ribboned gift box, or a swatch of
 * pink product with petals. Kept to the card's edge, never behind text. */
const PrivilegeArt: React.FC<{ variant: 'gift' | 'swatch' }> = ({ variant }) => {
  const uid = React.useId().replace(/:/g, '');
  return variant === 'gift' ? (
    <svg aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 w-[86px] sm:w-[100px] h-auto" viewBox="0 0 100 150">
      <OrnamentDefs id={`pv-gift-${uid}`} />
      <defs>
        <linearGradient id={`pv-box-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF4F6" />
          <stop offset="1" stopColor="#F4C6D2" />
        </linearGradient>
      </defs>
      <rect x="6" y="52" width="66" height="62" rx="3" fill={`url(#pv-box-${uid})`} stroke="#E8D5A8" />
      <rect x="2" y="42" width="74" height="14" rx="2" fill="#FBDDE5" stroke="#E8D5A8" />
      <rect x="35" y="42" width="8" height="72" fill="#D9AE4F" />
      <path d="M39 42c-14-16-24-8-16 0M39 42c14-16 24-8 16 0" fill="none" stroke="#C9972B" strokeWidth="3" strokeLinecap="round" />
      <Petal id={`pv-gift-${uid}`} transform="translate(52 126) rotate(-30) scale(0.55)" />
      <Petal id={`pv-gift-${uid}`} transform="translate(14 132) rotate(10) scale(0.4)" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="absolute right-0 bottom-2 w-[120px] sm:w-[140px] h-auto opacity-90" viewBox="0 0 150 140">
      <OrnamentDefs id={`pv-swatch-${uid}`} />
      <defs>
        <linearGradient id={`pv-cream-${uid}`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#FBE3EA" />
          <stop offset="0.6" stopColor="#F2A7B9" />
          <stop offset="1" stopColor="#E77E99" />
        </linearGradient>
      </defs>
      <path d="M150 22C112 18 70 30 40 56c-14 12-6 26 12 22 30-7 62-22 98-20Z" fill={`url(#pv-cream-${uid})`} />
      <path d="M150 64c-26 2-52 14-70 30-8 7-2 15 9 12 22-6 40-16 61-16Z" fill={`url(#pv-cream-${uid})`} opacity="0.8" />
      <Petal id={`pv-swatch-${uid}`} transform="translate(112 128) rotate(-55) scale(0.6)" />
      <Petal id={`pv-swatch-${uid}`} transform="translate(30 12) rotate(25) scale(0.3)" />
    </svg>
  );
};

// ---------------------------------------------------------------------------

const LookCard: React.FC<{
  look: Look;
  catalog: Product[];
  isFirst: boolean;
  wishlist?: string[];
  onToggleWishlist?: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onAddLookToBag: ShopTheLookPageProps['onAddLookToBag'];
}> = ({ look, catalog, isFirst, wishlist, onToggleWishlist, onSelectProduct, onAddLookToBag }) => {
  // A product id that no longer exists in the catalogue is skipped. It used
  // to fall back to the first catalogue product, which put an unrelated item
  // (and its price) into the look.
  const items = look.productsUsed.flatMap((item) => {
    const product = catalog.find((p) => p.id === item.productId);
    if (!product) return [];
    const shade = product.shades?.find((s) => s.name === item.shadeName) || product.shades?.[0];
    return [{ product, shade, size: product.selectedSize || product.sizes?.[0] }];
  });
  const headingId = `look-${look.id}-title`;

  return (
    <article
      aria-labelledby={headingId}
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] bg-[var(--stl-surface)] border border-[var(--stl-border)] overflow-hidden"
    >
      <div className="relative aspect-[4/5] sm:aspect-[4/3] lg:aspect-auto lg:min-h-[400px] bg-[var(--stl-blush)]">
        {look.video ? (
          <video
            src={look.video}
            poster={look.image || undefined}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: look.imageFocus || '50% 50%' }}
          />
        ) : look.image ? (
          <ProductImage
            preset="gallery"
            sizes="(min-width: 1024px) 44vw, 100vw"
            src={look.image}
            alt={`${look.title} look — editorial portrait`}
            priority={isFirst}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: look.imageFocus || '50% 50%' }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(160deg,#FCE8ED,#F7DCC9)] text-[#A87918]">
            <Sparkles className="w-7 h-7" strokeWidth={1.25} aria-hidden="true" />
            <span className="text-[12px] tracking-[0.3em] uppercase">Editorial image coming soon</span>
          </div>
        )}
      </div>

      <div className="flex flex-col p-5 sm:p-8 lg:px-9 lg:py-7">
        <p className="text-[11px] sm:text-[12px] font-medium tracking-[0.3em] uppercase text-[var(--stl-gold)]">
          {look.category}
        </p>
        <h2 id={headingId} className="font-serif !font-semibold text-[30px] sm:text-[38px] leading-[1.1] uppercase text-[var(--stl-ink)] mt-2">
          {look.title}
        </h2>
        {look.tagline && (
          <p className="font-serif italic text-[17px] sm:text-[19px] leading-snug text-[var(--stl-ink)] mt-1.5">
            &ldquo;{look.tagline}&rdquo;
          </p>
        )}
        {look.description && (
          <p className="text-[14px] leading-[1.55] text-[var(--stl-ink-soft)] mt-2 line-clamp-3">{look.description}</p>
        )}

        {items.length > 0 ? (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-5" aria-label={`Products in ${look.title}`}>
            {items.map(({ product }, i) => {
              const saved = wishlist?.includes(product.id) ?? false;
              return (
                <li
                  // The same product can appear twice (e.g. two shades).
                  key={`${product.id}-${i}`}
                  className="relative bg-white border border-[var(--stl-border-soft)] hover:border-[var(--stl-gold)] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    className="stl-focus block w-full text-left p-2.5 sm:p-3 cursor-pointer"
                  >
                    <span className="block h-[92px] sm:h-[100px]">
                      <ProductImage
                        preset="thumb"
                        src={product.images.primary}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    </span>
                    <span className="block mt-2 text-[12px] sm:text-[13px] leading-snug text-[var(--stl-ink)] line-clamp-2">
                      {product.name}
                    </span>
                    <span className="block mt-1 text-[12px] sm:text-[13px] font-semibold text-[var(--stl-ink)]">
                      {formatPrice(product.price)}
                    </span>
                  </button>
                  {onToggleWishlist && (
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(product.id)}
                      aria-pressed={saved}
                      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                      className="stl-focus absolute top-1.5 right-1.5 grid place-items-center w-8 h-8 rounded-full text-[var(--stl-gold)] hover:text-[var(--stl-pink)] hover:bg-[var(--stl-blush)] transition-colors cursor-pointer"
                    >
                      <Heart className="w-[18px] h-[18px]" strokeWidth={1.5} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-5 text-[14px] text-[var(--stl-muted)]">The products for this look are being restocked.</p>
        )}

        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => onAddLookToBag(items.map(({ product, shade, size }) => ({ product, shade, size })))}
          aria-label={`Shop this look — add all ${items.length} products to your bag`}
          className="stl-cta mt-5 lg:mt-auto lg:translate-y-0 w-full h-12 sm:h-[46px] flex items-center justify-center gap-3 text-[13px] sm:text-[14px] font-medium tracking-[0.22em] uppercase cursor-pointer"
        >
          Shop this look
          <ArrowRight className="stl-cta-arrow w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};

// ---------------------------------------------------------------------------

/** Gold leaves and pink petals at the hero's outer edges. The right cluster
 * sits beyond the 600px text column on desktop and fades back on small
 * screens so it never competes with the heading. */
const HeroBotanicals: React.FC = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0">
    <div className="absolute inset-0 bg-[radial-gradient(60%_90%_at_78%_40%,rgba(201,151,43,0.12),transparent_70%)]" />
    {/* Only where the gutter is wide enough to hold it clear of the copy. */}
    <svg className="absolute left-0 top-0 h-full w-[120px] hidden 2xl:block" viewBox="0 0 120 240" preserveAspectRatio="xMinYMid slice">
      <OrnamentDefs id="hero-l" />
      <path d="M-4 236C40 190 70 120 96 40" stroke="#C9972B" strokeOpacity="0.7" strokeWidth="1.2" fill="none" />
      <Leaf id="hero-l" transform="translate(30 200) rotate(-70) scale(0.65)" />
      <Leaf id="hero-l" transform="translate(58 150) rotate(-25) scale(0.55)" />
      <Leaf id="hero-l" transform="translate(62 140) rotate(-120) scale(0.5)" />
      <Petal id="hero-l" transform="translate(40 40) rotate(40) scale(0.95)" />
      <Petal id="hero-l" transform="translate(70 170) rotate(70) scale(0.6)" />
    </svg>
    <svg
      className="absolute right-0 top-0 h-full w-auto opacity-[0.12] sm:opacity-50 lg:opacity-100"
      viewBox="0 0 660 240"
      preserveAspectRatio="xMaxYMid meet"
    >
      <OrnamentDefs id="hero-r" />
      <g fill="#E3B84B">
        <circle cx="120" cy="200" r="1.4" /><circle cx="170" cy="150" r="1" /><circle cx="300" cy="215" r="1.2" />
        <circle cx="360" cy="36" r="1" /><circle cx="455" cy="195" r="1.5" /><circle cx="520" cy="30" r="1.1" />
        <circle cx="610" cy="120" r="1.2" /><circle cx="250" cy="60" r="0.9" />
      </g>
      <g className="drop-shadow-[0_0_8px_rgba(227,184,75,0.35)]">
        <path d="M80 250C130 175 190 115 270 60" stroke="#C9972B" strokeOpacity="0.65" strokeWidth="1.2" fill="none" />
        <path d="M150 250C200 200 240 150 330 120" stroke="#C9972B" strokeOpacity="0.45" strokeWidth="1" fill="none" />
        <Leaf id="hero-r" transform="translate(110 225) rotate(-62) scale(0.85)" />
        <Leaf id="hero-r" transform="translate(140 180) rotate(-20) scale(0.8)" />
        <Leaf id="hero-r" transform="translate(150 175) rotate(-100) scale(0.7)" />
        <Leaf id="hero-r" transform="translate(185 135) rotate(-35) scale(0.85)" />
        <Leaf id="hero-r" transform="translate(200 125) rotate(-115) scale(0.75)" />
        <Leaf id="hero-r" transform="translate(235 92) rotate(-50) scale(0.7)" />
        <Leaf id="hero-r" transform="translate(250 80) rotate(-140) scale(0.55)" />
        <Leaf id="hero-r" transform="translate(220 205) rotate(-10) scale(0.7)" />
        <Leaf id="hero-r" transform="translate(275 150) rotate(-30) scale(0.65)" />
        <Petal id="hero-r" transform="translate(215 180) rotate(-72) scale(1.15)" />
        <Petal id="hero-r" transform="translate(275 128) rotate(-18) scale(0.95)" />
        <Petal id="hero-r" transform="translate(170 118) rotate(-108) scale(0.85)" />
        <Petal id="hero-r" transform="translate(318 210) rotate(-40) scale(0.7)" />
        <path d="M500 250C545 195 590 150 660 110" stroke="#C9972B" strokeOpacity="0.65" strokeWidth="1.2" fill="none" />
        <Leaf id="hero-r" transform="translate(540 225) rotate(-78) scale(0.8)" />
        <Leaf id="hero-r" transform="translate(575 180) rotate(-150) scale(0.75)" />
        <Leaf id="hero-r" transform="translate(590 165) rotate(-38) scale(0.7)" />
        <Leaf id="hero-r" transform="translate(625 135) rotate(-120) scale(0.6)" />
        <Petal id="hero-r" transform="translate(525 150) rotate(-58) scale(1.35)" />
        <Petal id="hero-r" transform="translate(600 95) rotate(-30) scale(0.6)" />
        <Petal id="hero-r" transform="translate(470 58) rotate(80) scale(0.3)" />
      </g>
    </svg>
  </div>
);
