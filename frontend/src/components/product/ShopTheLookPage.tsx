import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GLAMIRK_LOOKS } from '@glamirk/shared/data/looks';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { CMSOffer, Look, Product, Shade } from '@glamirk/shared/types';
import { ArrowRight, Sparkles, Check, Tag, Copy, Heart } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { OffersPopupModal } from '../marketing/OffersPopupModal';
import { Petal, OrnamentDefs } from '../marketing/BotanicalOrnaments';
import { ProductImage } from './ProductImage';
import { isLivePrivilegesScheduled, resolveLivePrivilegesCards } from '@glamirk/shared/utils/livePrivilegesPopup';

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
  /** Where the Live Privileges popup's CTA goes (in-app path or https URL). */
  onNavigate?: (url: string) => void;
}

export const ShopTheLookPage: React.FC<ShopTheLookPageProps> = ({
  onAddLookToBag,
  onSelectProduct,
  wishlist,
  onToggleWishlist,
  onNavigate,
}) => {
  const { looks, activeOffers, products: cmsProducts, livePrivilegesPopup } = useCMS();
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

  // The Live Privileges popup, as the admin published it: only when enabled,
  // inside its schedule, and with at least one live card — never empty.
  const popupCards = useMemo(
    () => resolveLivePrivilegesCards(livePrivilegesPopup, activeOffers),
    [livePrivilegesPopup, activeOffers]
  );
  const popupEligible =
    livePrivilegesPopup.enabled && isLivePrivilegesScheduled(livePrivilegesPopup) && popupCards.length > 0;
  const { delayMs, frequency } = livePrivilegesPopup.display;

  // Opens at most once per mount. `hasOpened` is set only when it actually
  // opens, so a content refresh that re-runs this effect before the delay
  // elapses simply reschedules instead of cancelling the popup for good.
  const hasOpenedOffersPopupRef = useRef(false);
  useEffect(() => {
    if (hasOpenedOffersPopupRef.current || !popupEligible) return;
    let seen = false;
    try {
      seen = frequency === 'session' && !!sessionStorage.getItem(OFFERS_POPUP_SESSION_KEY);
    } catch {
      /* storage blocked — treat as not seen */
    }
    if (seen) return;
    const timer = window.setTimeout(() => {
      hasOpenedOffersPopupRef.current = true;
      try {
        sessionStorage.setItem(OFFERS_POPUP_SESSION_KEY, '1');
      } catch {
        /* storage blocked — the popup still works, it may just show again */
      }
      setIsOffersPopupOpen(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [popupEligible, delayMs, frequency]);

  const filteredLooks =
    selectedFilter === 'ALL' ? displayLooks : displayLooks.filter((l) => l.category === selectedFilter);

  return (
    <div className="bg-[var(--stl-surface)] min-h-screen font-sans text-[var(--stl-ink)]">
      {/* The design opens straight on the filters; the page heading stays for screen readers. */}
      <h1 className="sr-only">Shop the Look</h1>

      {/* Category filters */}
      <div
        role="group"
        aria-label="Filter looks by occasion"
        className="stl-no-scrollbar max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 flex sm:justify-center gap-2.5 sm:gap-5 overflow-x-auto"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={selectedFilter === tab}
            onClick={() => setSelectedFilter(tab)}
            className={`stl-filter shrink-0 h-10 ${tab === 'ALL' ? 'px-10' : 'px-6 sm:px-8'} text-[12px] sm:text-[13px] font-medium tracking-[0.06em] uppercase whitespace-nowrap rounded-[4px] cursor-pointer`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Looks */}
      <p className="sr-only" aria-live="polite">
        {filteredLooks.length} {filteredLooks.length === 1 ? 'look' : 'looks'} shown
      </p>
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-10 space-y-6 sm:space-y-8">
        {filteredLooks.length === 0 ? (
          <div className="border border-[var(--stl-border-soft)] rounded-[10px] bg-[var(--stl-card)] px-6 py-14 text-center">
            <Sparkles className="w-6 h-6 mx-auto text-[var(--stl-gold)]" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="font-['Cormorant_Garamond',Georgia,serif] !font-semibold text-[28px] mt-3">
              No {selectedFilter.toLowerCase()} looks yet
            </h2>
            <p className="text-[15px] text-[var(--stl-muted)] mt-2">
              New compositions are added to the archive regularly.
            </p>
            <button
              type="button"
              onClick={() => setSelectedFilter('ALL')}
              className="stl-filter mt-5 h-10 px-6 rounded-[4px] text-[13px] tracking-[0.08em] uppercase cursor-pointer"
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

      {/* Live privileges — the admin's active offers, exactly as configured.
          Below the looks, which the design leads with. */}
      {activeOffers.length > 0 && (
        <section
          aria-labelledby="stl-privileges"
          className="bg-[linear-gradient(180deg,#FCE8ED_0%,#FBEFF2_100%)] border-y border-[var(--stl-border-soft)]"
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

      <OffersPopupModal
        isOpen={isOffersPopupOpen && popupEligible}
        onClose={() => setIsOffersPopupOpen(false)}
        config={livePrivilegesPopup}
        cards={popupCards}
        onNavigate={(url) => onNavigate?.(url)}
      />
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
  const editorial = LOOK_EDITORIAL[look.category];

  return (
    <article
      aria-labelledby={headingId}
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,47fr)_minmax(0,53fr)] bg-[#FFFDF9] border border-[var(--stl-border-soft)] rounded-[10px] overflow-hidden"
    >
      <div className="relative aspect-[4/5] sm:aspect-[4/3] lg:aspect-auto lg:min-h-[500px] bg-[var(--stl-blush)]">
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

        {/* Editorial overlay: script title + heart top-left, caption bottom-left.
            A soft left-edge shade keeps the white type readable on light photos. */}
        {(look.image || look.video) && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(18,10,14,0.38)_0%,rgba(18,10,14,0.12)_38%,transparent_60%)]">
            <p className="absolute left-[7%] top-[10%] font-['Allura',cursive] text-white leading-[0.85] text-[52px] sm:text-[64px] lg:text-[72px] -rotate-[8deg] drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
              {toTitleCase(look.title).split(' ').map((word, i) => (
                <span key={i} className="block" style={{ paddingLeft: `${i * 0.45}em` }}>{word}</span>
              ))}
              <Heart className="ml-[1.6em] mt-1 w-8 h-8 sm:w-9 sm:h-9 text-white" strokeWidth={1.25} />
            </p>
            {editorial && (
              <p className="absolute left-[7%] bottom-[7%] pt-4 border-t border-[var(--stl-gold-bright)]/80 w-[5.5rem] text-[10px] sm:text-[11px] leading-[1.9] tracking-[0.32em] uppercase text-white">
                {editorial.caption.map((w) => <span key={w} className="block whitespace-nowrap">{w}</span>)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative flex flex-col p-5 sm:p-8 lg:pl-10 lg:pr-6 lg:py-9">
        {/* Side words with a sparkle, as in the editorial layout (wide screens only). */}
        {editorial && (
          <div aria-hidden="true" className="hidden xl:flex absolute right-6 top-9 gap-3">
            <Sparkles className="w-6 h-6 mt-[-6px] text-[var(--stl-gold-bright)]" strokeWidth={1.25} />
            <p className="pl-3 border-l border-[var(--stl-gold-bright)]/70 pt-8 text-[11px] leading-[2] tracking-[0.3em] uppercase text-[var(--stl-ink-soft)]">
              {editorial.side.map((w) => <span key={w} className="block">{w}</span>)}
            </p>
          </div>
        )}

        <div className="xl:pr-32">
          <p className="flex items-center gap-4 text-[12px] sm:text-[13px] font-medium tracking-[0.32em] uppercase text-[var(--stl-gold)]">
            {look.category}
            <span aria-hidden="true" className="relative w-24 sm:w-40 h-px bg-[var(--stl-gold)]/70 after:absolute after:-right-px after:-top-[3px] after:border-y-[3.5px] after:border-y-transparent after:border-l-[6px] after:border-l-[var(--stl-gold)]/70" />
          </p>
          <h2
            id={headingId}
            className="font-['Cormorant_Garamond',Georgia,serif] !font-semibold text-[38px] sm:text-[46px] xl:text-[54px] leading-[1.02] uppercase whitespace-normal xl:whitespace-nowrap text-[var(--stl-ink)] mt-3"
          >
            {look.title}
          </h2>
          {look.tagline && (
            <p className="font-['Cormorant_Garamond',Georgia,serif] italic text-[19px] sm:text-[22px] leading-snug text-[var(--stl-ink)] mt-3">
              &ldquo;{look.tagline}&rdquo;
            </p>
          )}
          {look.description && (
            <p className="text-[14px] sm:text-[15.5px] leading-[1.65] text-[var(--stl-ink-soft)] mt-3 line-clamp-4">{look.description}</p>
          )}
        </div>

        {items.length > 0 ? (
          <ul className="flex flex-wrap gap-3 mt-6" aria-label={`Products in ${look.title}`}>
            {items.map(({ product }, i) => {
              const saved = wishlist?.includes(product.id) ?? false;
              return (
                <li
                  // The same product can appear twice (e.g. two shades).
                  key={`${product.id}-${i}`}
                  className="relative w-[calc(50%-0.375rem)] sm:w-[170px] bg-white border border-[var(--stl-border-soft)] rounded-[8px] shadow-[0_6px_18px_-12px_rgba(201,151,43,0.5)] hover:border-[var(--stl-gold)] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    aria-label={`View ${product.name}, ${formatPrice(product.price)}`}
                    className="stl-focus block w-full text-left px-4 pt-4 pb-3.5 rounded-[8px] cursor-pointer"
                  >
                    <span className="block h-[110px] sm:h-[120px]">
                      <ProductImage
                        preset="thumb"
                        src={product.images.primary}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    </span>
                    <span className="block mt-3 text-[13px] sm:text-[14px] leading-snug text-[var(--stl-ink)] line-clamp-2">
                      {product.name}
                    </span>
                    <span className="block mt-1 text-[14px] sm:text-[15px] font-semibold text-[var(--stl-ink)]">
                      {formatPrice(product.price)}
                    </span>
                  </button>
                  {onToggleWishlist && (
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(product.id)}
                      aria-pressed={saved}
                      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                      className="stl-focus absolute top-2 right-2 grid place-items-center w-8 h-8 rounded-full text-[var(--stl-pink)] hover:bg-[var(--stl-blush)] transition-colors cursor-pointer"
                    >
                      <Heart className="w-[18px] h-[18px]" strokeWidth={1.5} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-6 text-[14px] text-[var(--stl-muted)]">The products for this look are being restocked.</p>
        )}

        {/* Pushes the CTA to the bottom on tall cards, but never closer than 1.5rem. */}
        <div aria-hidden="true" className="flex-1 min-h-6" />
        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => onAddLookToBag(items.map(({ product, shade, size }) => ({ product, shade, size })))}
          aria-label={`Shop this look — add all ${items.length} products to your bag`}
          className="stl-cta w-full h-[52px] rounded-[5px] flex items-center justify-center gap-3.5 text-[14px] sm:text-[16px] font-medium tracking-[0.24em] uppercase cursor-pointer"
        >
          Shop this look
          <ArrowRight className="stl-cta-arrow w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};

/** Short editorial words per occasion — decorative design copy for the image
 * caption and the side column, not product claims. Unknown categories get none. */
const LOOK_EDITORIAL: Record<string, { caption: string[]; side: string[] }> = {
  'EVERYDAY GLAM': { caption: ['Effortless', 'Beauty', 'Everyday'], side: ['Simple', 'Elegant', 'Radiant', 'You'] },
  'DATE NIGHT': { caption: ['Bold', 'Refined', 'Unforgettable'], side: ['Made for', 'Special', 'Moments'] },
  'WEDDING GLAM': { caption: ['Timeless', 'Bridal', 'Radiance'], side: ['Your', 'Forever', 'Moment'] },
  'MINIMAL GLAM': { caption: ['Soft', 'Bare', 'Beautiful'], side: ['Less', 'Is', 'More'] },
};

const toTitleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

