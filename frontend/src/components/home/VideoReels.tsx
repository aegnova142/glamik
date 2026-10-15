import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Volume2, VolumeX, X, ShoppingBag, Check, ArrowUpRight } from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { Product, Shade, CartItem, CMSVideoReelItem } from '@glamirk/shared/types';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';
import {
  getDefaultShade,
  resolveSizeSelection,
  getCurrentStock,
  isProductSellable,
  summarizeShade,
} from '@glamirk/shared/utils/productVariant';

interface VideoReelsProps {
  cartItems: CartItem[];
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  onSelectProduct: (product: Product) => void;
  /** Opens a custom reel's link (same-site path or https:// URL). */
  onNavigate: (href: string) => void;
}

interface Reel {
  item: CMSVideoReelItem;
  /** Absent for a custom-link reel (item.kind === 'link'). */
  product?: Product;
  /** Development-only stand-in (no video): shows the product photo and links to the product. */
  demo?: boolean;
}

// What one tap of Add to Cart would add, resolved the same way ProductCard does
// (default sellable shade, its default size, that unit's stock and price).
function useBuyable(product: Product, cartItems: CartItem[]) {
  return useMemo(() => {
    const shade = getDefaultShade(product);
    const size = resolveSizeSelection(product, shade, undefined);
    const canAdd = isProductSellable(product) && getCurrentStock(product, shade, size) > 0;
    const price = shade ? summarizeShade(product, shade).startingPrice : product.price;
    const inCart = cartItems.some(
      (c) =>
        c.product.id === product.id &&
        (c.selectedShade?.id || null) === (shade?.id || null) &&
        (c.selectedSize || null) === (size || null)
    );
    return { shade, size, canAdd, price, inCart };
  }, [product, cartItems]);
}

const CartButton: React.FC<{
  product: Product;
  cartItems: CartItem[];
  onQuickAdd: VideoReelsProps['onQuickAdd'];
  onGoToCart: () => void;
  className?: string;
}> = ({ product, cartItems, onQuickAdd, onGoToCart, className = '' }) => {
  const { shade, size, canAdd, inCart } = useBuyable(product, cartItems);
  const base = `flex w-full items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-all active:scale-[0.97] ${className}`;
  if (inCart) {
    return (
      <button type="button" onClick={onGoToCart} className={`${base} bg-[#121212] text-white hover:bg-[#2a2a2a]`}>
        <Check className="h-4 w-4" /> Go to Cart
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={!canAdd}
      onClick={() => onQuickAdd(product, shade, size)}
      className={`${base} bg-[#F05A7E] text-white shadow-[0_8px_18px_-10px_rgba(240,90,126,0.7)] hover:bg-[#E54D72] disabled:cursor-not-allowed disabled:bg-[#E8D5A8] disabled:text-[#6B6B6B] disabled:shadow-none`}
    >
      <ShoppingBag className="h-4 w-4" /> {canAdd ? 'Add to Cart' : 'Out of Stock'}
    </button>
  );
};

const Price: React.FC<{ product: Product; cartItems: CartItem[]; className?: string }> = ({ product, cartItems, className }) => {
  const { price } = useBuyable(product, cartItems);
  return (
    <span className={className}>
      {product.currency}
      {price}
    </span>
  );
};

// A soft "film advance" — a few tiny ratchet ticks over a short breath of
// filtered noise, generated with Web Audio (no asset, no library). Only ever
// called from a user's click/swipe, so autoplay rules are satisfied; any
// failure is swallowed and the carousel carries on silently.
let reelAudio: AudioContext | null = null;
let reelSoundUntil = 0;
function playReelSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    reelAudio = reelAudio || new Ctx();
    const ctx = reelAudio;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    if (now < reelSoundUntil) return; // never stack on top of a sound still playing
    const duration = 0.18;
    reelSoundUntil = now + duration;

    const master = ctx.createGain();
    master.gain.value = 0.09;
    master.connect(ctx.destination);

    // breathy mechanism bed
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.9;
    const bed = ctx.createGain();
    bed.gain.value = 0.35;
    noise.connect(band).connect(bed).connect(master);
    noise.start(now);

    // ratchet ticks
    [0, 0.045, 0.09, 0.13].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1700 - i * 120;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.5, now + t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.022);
      osc.connect(g).connect(master);
      osc.start(now + t);
      osc.stop(now + t + 0.03);
    });
  } catch {
    /* audio unavailable — navigation still works */
  }
}

const reelName = (r: Reel) => r.product?.name ?? r.item.customTitle ?? '';

const STRIP_BTN =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50 xl:h-14 xl:w-14';

// Bottom strip of a product reel: bag button (add / go to cart), name, live price.
const ProductStrip: React.FC<{
  product: Product;
  active: boolean;
  cartItems: CartItem[];
  onQuickAdd: VideoReelsProps['onQuickAdd'];
  onGoToCart: () => void;
}> = ({ product, active, cartItems, onQuickAdd, onGoToCart }) => {
  const { shade, size, canAdd, inCart } = useBuyable(product, cartItems);
  return (
    <>
      <button
        type="button"
        tabIndex={active ? 0 : -1}
        disabled={!inCart && !canAdd}
        onClick={(e) => {
          e.stopPropagation();
          if (inCart) onGoToCart();
          else onQuickAdd(product, shade, size);
        }}
        className={STRIP_BTN}
        aria-label={inCart ? `${product.name} is in your bag — go to cart` : canAdd ? `Add ${product.name} to cart` : `${product.name} is out of stock`}
        title={inCart ? 'Go to Cart' : canAdd ? 'Add to Cart' : 'Out of Stock'}
      >
        {inCart ? <Check className="h-6 w-6" /> : <ShoppingBag className="h-6 w-6 stroke-[1.75]" />}
      </button>
      <div className="min-w-0 pb-0.5 text-white">
        <p className="line-clamp-2 text-base font-semibold leading-snug xl:text-lg">{product.name}</p>
        <Price product={product} cartItems={cartItems} className="mt-1 block text-xl font-bold xl:text-[22px]" />
      </div>
    </>
  );
};

const DEFAULT_SUBTITLE = 'Explore quick videos of our bestsellers, real results and beauty rituals.';

// Editorial card: still (admin thumbnail, else the video's own first frame)
// under a play button; product name, price and a bag button at the foot.
// Only the centred card is interactive — tapping a side card brings it to the
// centre instead, so a stray tap never starts a video or adds to cart.
const ReelCard: React.FC<{
  reel: Reel;
  active: boolean;
  onOpen: () => void;
  onActivate: () => void;
  cartItems: CartItem[];
  onQuickAdd: VideoReelsProps['onQuickAdd'];
  onGoToCart: () => void;
  onNavigate: (href: string) => void;
  style?: React.CSSProperties;
}> = ({ reel, active, onOpen, onActivate, cartItems, onQuickAdd, onGoToCart, onNavigate, style }) => {
  const { item, product } = reel;
  const name = reelName(reel);
  const still = item.posterUrl;
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div
      style={style}
      className="reel-card relative w-[min(72vw,320px)] shrink-0 transition-[transform,opacity] duration-[550ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none sm:w-[min(44vw,320px)] md:w-[min(34vw,320px)] lg:w-[290px] xl:w-[310px]"
    >
      <div className="relative aspect-[10/13] w-full overflow-hidden rounded-[30px] bg-[#FCE8ED] shadow-[0_22px_40px_-24px_rgba(18,18,18,0.55)]">
        {still ? (
          <img src={cloudinaryImageUrl(still, 'card')} alt="" loading="lazy" draggable={false} className="h-full w-full select-none object-cover" />
        ) : (
          <video ref={videoRef} src={`${item.videoUrl}#t=0.1`} muted loop playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        {reel.demo && (
          <span className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#121212] backdrop-blur-sm">
            Demo preview
          </span>
        )}

        <button
          type="button"
          onClick={onOpen}
          onMouseEnter={() => active && videoRef.current?.play().catch(() => {})}
          onMouseLeave={() => videoRef.current?.pause()}
          tabIndex={active ? 0 : -1}
          className="absolute inset-0 rounded-[30px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          aria-label={reel.demo ? `Demo preview — view ${name}` : `Play video: ${name}`}
        >
          <span className="absolute left-1/2 top-[48%] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#F05A7E] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-transform hover:scale-105 sm:h-16 sm:w-16">
            <Play className="ml-1 h-6 w-6 fill-current sm:h-7 sm:w-7" />
          </span>
        </button>

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 sm:p-5">
          {product ? (
            <ProductStrip product={product} active={active} cartItems={cartItems} onQuickAdd={onQuickAdd} onGoToCart={onGoToCart} />
          ) : (
            <>
              <button
                type="button"
                tabIndex={active ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.linkUrl) onNavigate(item.linkUrl);
                }}
                className={STRIP_BTN}
                aria-label={`Shop ${name}`}
                title="Shop"
              >
                <ArrowUpRight className="h-6 w-6 stroke-[1.75]" />
              </button>
              <div className="min-w-0 pb-0.5 text-white">
                <p className="line-clamp-2 text-base font-semibold leading-snug xl:text-lg">{name}</p>
                {item.priceLabel && <span className="mt-1 block text-xl font-bold xl:text-[22px]">{item.priceLabel}</span>}
              </div>
            </>
          )}
        </div>

        {!active && (
          <button
            type="button"
            onClick={onActivate}
            tabIndex={-1}
            className="absolute inset-0 z-20 cursor-pointer rounded-[30px]"
            aria-label={`Show ${name}`}
          />
        )}
      </div>
    </div>
  );
};

const ReelPlayer: React.FC<
  { reels: Reel[]; index: number; onIndex: (i: number) => void; onClose: () => void } & VideoReelsProps
> = ({ reels, index, onIndex, onClose, cartItems, onQuickAdd, onGoToCart, onSelectProduct, onNavigate }) => {
  const [muted, setMuted] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { item, product } = reels[index];
  const name = reelName(reels[index]);
  const hasPrev = index > 0;
  const hasNext = index < reels.length - 1;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasNext, hasPrev, onClose, onIndex]);

  const navBtn =
    'flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#121212] shadow-lg transition hover:bg-white disabled:opacity-0';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Video: ${name}`}
      onClick={onClose}
    >
      <button type="button" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} disabled={!hasPrev} className={`${navBtn} absolute left-6 hidden md:flex`} aria-label="Previous video">
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative h-[100dvh] w-full overflow-hidden bg-black sm:h-[min(88vh,820px)] sm:w-auto sm:aspect-[9/16] sm:rounded-2xl"
      >
        <video
          key={item.id}
          src={item.videoUrl}
          poster={item.posterUrl ? cloudinaryImageUrl(item.posterUrl, 'card') : undefined}
          autoPlay
          loop
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
        />

        {/* top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent p-4">
          {product?.images?.primary && (
            <img src={cloudinaryImageUrl(product.images.primary, 'thumb')} alt="" className="h-10 w-10 shrink-0 rounded-full border border-white/70 object-cover" />
          )}
          <p className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-white">{name}</p>
          <button type="button" onClick={() => setMuted((m) => !m)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60" aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button ref={closeRef} type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60" aria-label="Close video">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* mobile prev/next */}
        <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between md:hidden">
          <button type="button" onClick={() => onIndex(index - 1)} disabled={!hasPrev} className={`${navBtn} h-9 w-9 bg-white/70`} aria-label="Previous video">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onIndex(index + 1)} disabled={!hasNext} className={`${navBtn} h-9 w-9 bg-white/70`} aria-label="Next video">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* product panel */}
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/90 p-3.5 backdrop-blur-md sm:inset-x-4 sm:bottom-4">
          {product ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Price product={product} cartItems={cartItems} className="text-lg font-bold text-[#121212]" />
                <button type="button" onClick={() => { onClose(); onSelectProduct(product); }} className="text-xs font-semibold text-[#F05A7E] underline-offset-2 hover:underline">
                  View Product
                </button>
              </div>
              <CartButton product={product} cartItems={cartItems} onQuickAdd={onQuickAdd} onGoToCart={() => { onClose(); onGoToCart(); }} className="mt-2.5 h-11" />
            </>
          ) : (
            <>
              {item.priceLabel && <span className="block text-lg font-bold text-[#121212]">{item.priceLabel}</span>}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (item.linkUrl) onNavigate(item.linkUrl);
                }}
                className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#F05A7E] text-[13px] font-semibold text-white transition hover:bg-[#E54D72] active:scale-[0.97]"
              >
                Shop Now <ArrowUpRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <button type="button" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} disabled={!hasNext} className={`${navBtn} absolute right-6 hidden md:flex`} aria-label="Next video">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
};

const SOUND_KEY = 'glamirk-reel-sound';

/** "Watch It. Love It." — admin-managed shoppable video carousel (Admin → Home Page → Watch It. Love It.).
 *  A centred carousel: the active reel sits in the middle of the page with its
 *  neighbours either side. Swipe (touch), drag (mouse), trackpad, arrows and
 *  dots all move the same `active` index; the track follows the pointer live
 *  and snaps to the nearest card on release. */
export const VideoReels: React.FC<VideoReelsProps> = (props) => {
  const { globalSettings, products } = useCMS();
  const config = globalSettings?.videoReels;
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [dragDx, setDragDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [geo, setGeo] = useState({ vw: 0, card: 0, step: 0 });
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const gesture = useRef<{ id: number; x: number; y: number; t: number; lastX: number; lastT: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef({ acc: 0, lock: 0 });

  // Reels whose product was deleted are dropped rather than shown without a price.
  const reels: Reel[] = useMemo(() => {
    const real: Reel[] = config?.enabled
      ? config.items.flatMap((item): Reel[] => {
          if (!item.videoUrl) return [];
          if (item.kind === 'link') return item.customTitle && item.linkUrl ? [{ item }] : [];
          const product = products.find((p) => p.id === item.productId);
          return product ? [{ item, product }] : [];
        })
      : [];
    if (!import.meta.env.DEV) return real;
    // ponytail: dev-only test cards appended after the real reels — catalogue
    // products and their own photos, badged "Demo preview", no fake videos.
    // Stripped from production builds; delete this block once enough real reels exist.
    const demo: Reel[] = [];
    for (const key of ['primary', 'secondary'] as const) {
      for (const product of products) {
        const img = product.images?.[key];
        if (img && !demo.some((d) => d.item.posterUrl === img)) {
          demo.push({ item: { id: `demo-${product.id}-${key}`, videoUrl: '', posterUrl: img, productId: product.id }, product, demo: true });
        }
      }
    }
    return [...real, ...demo];
  }, [config, products]);

  // ── laptop: hover near either edge of the stage to glide through the reels ──
  const [hoverDir, setHoverDir] = useState<-1 | 0 | 1>(0);
  const goRef = useRef<(dir: number) => void>(() => {});
  useEffect(() => {
    if (hoverDir === 0) return;
    goRef.current(hoverDir);
    const id = window.setInterval(() => goRef.current(hoverDir), 900);
    return () => window.clearInterval(id);
  }, [hoverDir]);

  // Start on the middle reel so the row opens balanced (15 reels → reel 8).
  const startedFor = useRef(-1);
  useEffect(() => {
    if (startedFor.current !== reels.length) {
      startedFor.current = reels.length;
      setActive(Math.floor((reels.length - 1) / 2));
    }
  }, [reels.length]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = () => {
      const card = trackRef.current?.querySelector<HTMLElement>('.reel-card');
      if (!card) return;
      const gap = parseFloat(getComputedStyle(trackRef.current!).columnGap) || 0;
      setGeo({ vw: vp.clientWidth, card: card.offsetWidth, step: card.offsetWidth + gap });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [reels.length]);

  if (reels.length === 0) return null;
  const last = reels.length - 1;

  const go = (next: number) => {
    const target = Math.max(0, Math.min(last, next));
    if (target === active) return; // nothing to move to — stays silent
    setActive(target);
    if (soundOn) playReelSound();
  };
  goRef.current = (dir) => go(active + dir);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      /* preference just won't persist */
    }
  };

  // ── pointer: touch swipe and mouse drag share one path ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, lastX: e.clientX, lastT: e.timeStamp, axis: null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // mouse hovering (no button held): outer 22% of the stage on either side glides
    if (e.pointerType === 'mouse' && !gesture.current) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const f = (e.clientX - r.left) / r.width;
      const dir = f < 0.22 ? -1 : f > 0.78 ? 1 : 0;
      if (dir !== hoverDir) setHoverDir(dir);
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'y') {
        gesture.current = null; // vertical intent: let the page scroll
        return;
      }
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released — the drag still works without capture */
      }
      setDragging(true);
    }
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    // rubber-band past either end
    const atEdge = (dx > 0 && active === 0) || (dx < 0 && active === last);
    setDragDx(atEdge ? dx * 0.35 : dx);
  };
  const endGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;
    const dx = e.clientX - g.x;
    const velocity = (e.clientX - g.lastX) / Math.max(1, e.timeStamp - g.lastT); // px/ms at release
    suppressClick.current = Math.abs(dx) > 6;
    let target = active - Math.round(dx / (geo.step || 1));
    if (target === active && (Math.abs(dx) > 40 || Math.abs(velocity) > 0.4)) target += dx < 0 ? 1 : -1;
    setDragging(false);
    setDragDx(0);
    go(target);
  };

  // two-finger horizontal trackpad scroll → one card per deliberate swipe
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const w = wheel.current;
    if (e.timeStamp < w.lock) return;
    w.acc += e.deltaX;
    if (Math.abs(w.acc) > 50) {
      go(active + (w.acc > 0 ? 1 : -1));
      w.acc = 0;
      w.lock = e.timeStamp + 420;
    }
  };

  const base = geo.vw / 2 - geo.card / 2 - active * geo.step;
  const ease = 'duration-[550ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none';

  return (
    <section className="home-section overflow-hidden" aria-labelledby="video-reels-heading" aria-roledescription="carousel">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
          <div className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[#C9972B] sm:text-[13px]">Shop the Video</span>
            <h2 id="video-reels-heading" className="mt-2 font-serif text-[34px] font-semibold leading-tight text-[#121212] sm:text-5xl">
              {config?.title || 'Watch It. Love It.'}
            </h2>
            <p className="mt-2 font-serif text-lg leading-snug text-[#5A5A5A] sm:text-xl">{config?.subtitle || DEFAULT_SUBTITLE}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={toggleSound}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#8A7F76] transition hover:text-[#121212] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05A7E]"
              aria-label={soundOn ? 'Turn carousel sound off' : 'Turn carousel sound on'}
              aria-pressed={soundOn}
              title={soundOn ? 'Sound on' : 'Sound off'}
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Full-width stage, faded at the edges; the active card is centred in it. */}
      <div
        ref={viewportRef}
        className={`relative select-none overscroll-x-contain [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)] [touch-action:pan-y] ${dragging ? 'cursor-grabbing' : hoverDir === -1 ? 'cursor-w-resize' : hoverDir === 1 ? 'cursor-e-resize' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={() => setHoverDir(0)}
        onWheel={onWheel}
        onClickCapture={(e) => {
          // the click that ends a drag must not play a video or add to cart
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        <div
          ref={trackRef}
          className={`flex w-max gap-5 py-4 [perspective:1400px] sm:gap-6 ${dragging ? '' : `transition-transform ${ease}`}`}
          style={{ transform: `translate3d(${base + dragDx}px,0,0)`, visibility: geo.vw ? 'visible' : 'hidden' }}
        >
          {reels.map((reel, i) => {
            // continuous distance from centre (follows the finger while dragging)
            const o = i - active - (geo.step ? dragDx / geo.step : 0);
            const d = Math.min(Math.abs(o), 2.5);
            return (
              <ReelCard
                key={reel.item.id}
                reel={reel}
                active={i === active && !dragging}
                onOpen={() => (reel.demo && reel.product ? props.onSelectProduct(reel.product) : setOpenIndex(i))}
                onActivate={() => go(i)}
                cartItems={props.cartItems}
                onQuickAdd={props.onQuickAdd}
                onGoToCart={props.onGoToCart}
                onNavigate={props.onNavigate}
                style={{
                  transform: `rotateY(${Math.max(-2, Math.min(2, o)) * -6}deg) scale(${1 - Math.min(d, 2) * 0.07})`,
                  opacity: 1 - Math.max(0, d - 1) * 0.4,
                  zIndex: 10 - Math.round(d),
                  transition: dragging ? 'none' : undefined,
                }}
              />
            );
          })}
        </div>
      </div>

      {reels.length > 1 && (
        <div className="mx-auto mt-6 flex max-w-7xl flex-wrap items-center justify-center gap-2 px-4" role="group" aria-label="Choose video">
          {reels.map((reel, i) => (
            <button
              key={reel.item.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Video ${i + 1}: ${reelName(reel)}`}
              aria-current={i === active}
              className={`h-2 rounded-full transition-all duration-300 ${i === active ? 'w-6 bg-[#F05A7E]' : 'w-2 bg-[#E2D9D2] hover:bg-[#C9B9AC]'}`}
            />
          ))}
        </div>
      )}

      {openIndex !== null && (
        <ReelPlayer reels={reels} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} {...props} />
      )}
    </section>
  );
};
