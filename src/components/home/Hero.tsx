import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, Sparkles, ShieldCheck, Truck, Headphones, RotateCcw, Lock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { CMSHeroSlide } from '../../types';

const TRUST_BAR_VISIBLE_LIMIT = 3;
const AUTOPLAY_MS = 2000;
const AUTOPLAY_FADE_MS = 400; // automatic slide change
const MANUAL_FADE_MS = 150; // button/dot/swipe — snappy, feels instant
const DRAG_THRESHOLD_PX = 60;

interface HeroProps {
  onShopClick: () => void;
  onFindShadeClick: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  ShieldCheck,
  Sparkles,
  Truck,
  Headphones,
  RotateCcw,
  Lock,
};

const DEFAULT_HERO = {
  badgeText: 'Radiate Confidence Every Day',
  headingLine1: 'Beauty & Radiance',
  headingPrefix: 'for a ',
  headingHighlight: 'Better You',
  description: 'Discover premium beauty essentials and shade-matching formulations engineered to amplify your natural glow.',
  primaryCtaText: 'Shop Now',
  secondaryCtaText: 'Find My Shade',
  trustIndicators: [
    { id: 'ti-1', icon: 'ShieldCheck', text: 'Dermatologist Approved' },
    { id: 'ti-2', icon: 'Sparkles', text: 'Formulated for Indian Skin' },
    { id: 'ti-3', icon: 'ShieldCheck', text: '100% Vegan & Cruelty-Free' },
  ],
  image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85',
  imageBadgeLabel: 'SIGNATURE COLLECTION',
  imageProductName: 'Matte Liquid & Cleansing Balm',
  imagePrice: '₹299+',
  trustBar: [
    { id: 'tb-1', icon: 'ShieldCheck', title: '100% Authentic', subtitle: 'Certified original beauty' },
    { id: 'tb-2', icon: 'Sparkles', title: 'Expert Approved', subtitle: 'Dermatologically safe' },
    { id: 'tb-3', icon: 'Truck', title: 'Fast Delivery', subtitle: 'Express pan-India transit' },
  ],
};

export const Hero: React.FC<HeroProps> = ({ onShopClick, onFindShadeClick }) => {
  const { heroContent } = useCMS();
  const hero = heroContent || DEFAULT_HERO;
  const [showAllTrustBar, setShowAllTrustBar] = useState(false);
  const visibleTrustBar = showAllTrustBar ? hero.trustBar : hero.trustBar.slice(0, TRUST_BAR_VISIBLE_LIMIT);

  // Slide 1 is always the primary hero content configured above; any extra
  // admin-managed slides are appended after it.
  const primarySlide: CMSHeroSlide = {
    id: 'slide-primary',
    badgeText: hero.badgeText,
    headingLine1: hero.headingLine1,
    headingPrefix: hero.headingPrefix,
    headingHighlight: hero.headingHighlight,
    description: hero.description,
    primaryCtaText: hero.primaryCtaText,
    secondaryCtaText: hero.secondaryCtaText,
    image: hero.image,
    imageBadgeLabel: hero.imageBadgeLabel,
    imageProductName: hero.imageProductName,
    imagePrice: hero.imagePrice,
  };
  const slides: CMSHeroSlide[] = [primarySlide, ...((hero as { slides?: CMSHeroSlide[] }).slides || [])];
  const slideCount = slides.length;

  const [displayIndex, setDisplayIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [fadeMs, setFadeMs] = useState(MANUAL_FADE_MS);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const dragDeltaX = useRef(0);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against double-click/rapid-click skipping multiple slides while a
  // transition is already in flight — the buttons stay enabled, extra clicks
  // during the fade window are just ignored rather than queued.
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    if (displayIndex >= slideCount) setDisplayIndex(0);
  }, [slideCount, displayIndex]);

  const goToIndex = useCallback(
    (index: number, duration: number = MANUAL_FADE_MS) => {
      if (isTransitioningRef.current) return;
      const nextIndex = ((index % slideCount) + slideCount) % slideCount;
      if (nextIndex === displayIndex) return;
      const isWrapForward = displayIndex === slideCount - 1 && nextIndex === 0;
      const isWrapBackward = displayIndex === 0 && nextIndex === slideCount - 1;
      const dir: 1 | -1 = isWrapBackward ? -1 : isWrapForward ? 1 : nextIndex > displayIndex ? 1 : -1;
      isTransitioningRef.current = true;
      setDirection(dir);
      setFadeMs(duration);
      setVisible(false);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = setTimeout(() => {
        setDisplayIndex(nextIndex);
        setVisible(true);
        isTransitioningRef.current = false;
      }, duration);
    },
    [slideCount, displayIndex]
  );

  const goNext = useCallback(() => goToIndex(displayIndex + 1), [displayIndex, goToIndex]);
  const goPrev = useCallback(() => goToIndex(displayIndex - 1), [displayIndex, goToIndex]);

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, []);

  // Autoplay re-arms a fresh AUTOPLAY_MS countdown every time displayIndex
  // actually changes — whether that change came from this same timer or from
  // a manual Prev/Next/dot/swipe action — so manual navigation always resets
  // the clock instead of racing an already-scheduled tick.
  useEffect(() => {
    if (slideCount <= 1 || isHovering || isDragging) return;
    const timer = setTimeout(() => {
      goToIndex(displayIndex + 1, AUTOPLAY_FADE_MS);
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [slideCount, isHovering, isDragging, displayIndex, goToIndex]);

  // Keyboard navigation: ArrowLeft = previous, ArrowRight = next.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTypingTarget) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext]);

  const handleDragStart = (clientX: number) => {
    dragStartX.current = clientX;
    dragDeltaX.current = 0;
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number) => {
    if (dragStartX.current === null) return;
    dragDeltaX.current = clientX - dragStartX.current;
  };

  const handleDragEnd = () => {
    if (dragStartX.current === null) return;
    if (dragDeltaX.current > DRAG_THRESHOLD_PX) {
      goPrev();
    } else if (dragDeltaX.current < -DRAG_THRESHOLD_PX) {
      goNext();
    }
    dragStartX.current = null;
    dragDeltaX.current = 0;
    setIsDragging(false);
  };

  const activeSlide = slides[displayIndex] || primarySlide;

  return (
    <section
      id="hero-section"
      className="relative overflow-hidden bg-[#FAF9F6]"
    >
      {/* Background decorative gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 h-[500px] w-[500px] rounded-full bg-[#FCE8ED]/70 blur-3xl" />
        <div className="absolute -right-20 top-0 h-[500px] w-[400px] rounded-full bg-[#FCE8ED] blur-3xl" />
        <div className="absolute left-[45%] top-10 h-[250px] w-[250px] rounded-full bg-[#E3B84B]/10 blur-3xl" />
      </div>

      {/* Gold decorative curve */}
      <div className="pointer-events-none absolute left-0 top-0 hidden h-full w-[130px] lg:block">
        <div className="absolute left-[30px] top-[-30px] h-[570px] w-[70px] rounded-[50%] border-l-2 border-[#C9972B]/70 rotate-[12deg]" />
        <div className="absolute left-[58px] top-[30px] h-[470px] w-[45px] rounded-[50%] border-l border-[#E3B84B]/50 rotate-[10deg]" />
      </div>

      {/* Pink right decoration */}
      <div className="pointer-events-none absolute right-[-80px] top-0 hidden h-full w-[300px] overflow-hidden lg:block">
        <div className="absolute right-[-80px] top-[-50px] h-[650px] w-[260px] rounded-[50%] bg-gradient-to-br from-[#FCE8ED] via-[#F05A7E]/30 to-transparent rotate-[20deg]" />
        <div className="absolute right-[40px] top-[-20px] h-[650px] w-[90px] rounded-[50%] border-l border-[#C9972B]/50 rotate-[25deg]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-5 pb-8 pt-8 sm:px-8 lg:px-10 lg:pb-10 lg:pt-10">

        {/* HERO SLIDE — swipe/drag surface */}
        <div
          className="relative select-none touch-pan-y"
          onMouseDown={(e) => handleDragStart(e.clientX)}
          onMouseMove={(e) => {
            if (isDragging) handleDragMove(e.clientX);
          }}
          onMouseUp={handleDragEnd}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
          onTouchEnd={handleDragEnd}
        >
          {/* HERO GRID */}
          <div
            className="grid items-center gap-10 lg:grid-cols-[1fr_430px] lg:gap-14 ease-out"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateX(0)' : `translateX(${direction * 28}px)`,
              transitionProperty: 'opacity, transform',
              transitionDuration: `${fadeMs}ms`,
            }}
          >

            {/* LEFT CONTENT */}
            <div className="relative z-10 max-w-[650px]">

              {/* Badge */}
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#E8D5A8] bg-white px-4 py-2 text-[11px] font-semibold text-[#F05A7E] shadow-sm">
                <Sparkles size={13} className="text-[#C9972B]" />
                {activeSlide.badgeText}
              </div>

              {/* Gold line */}
              <div className="mb-4 h-[2px] w-10 bg-[#C9972B]" />

              {/* Heading */}
              <h1 className="max-w-[620px] text-[42px] font-extrabold leading-[1.03] tracking-[-1.8px] text-[#121212] sm:text-[50px] lg:text-[58px]">
                {activeSlide.headingLine1}
                <br />
                {activeSlide.headingPrefix}
                <span className="text-[#F05A7E]">
                  {activeSlide.headingHighlight}
                </span>
              </h1>

              {/* Description */}
              <p className="mt-5 max-w-[540px] text-[15px] leading-7 text-[#6B6B6B] sm:text-[16px]">
                {activeSlide.description}
              </p>

              {/* Buttons */}
              <div className="mt-7 flex flex-wrap gap-4">

                {/* Primary */}
                <button
                  id="hero-shop-cta-btn"
                  onClick={onShopClick}
                  className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#0B0B0B] px-7 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(11,11,11,0.18)] transition-all duration-300 hover:bg-[#C9972B] hover:text-[#0B0B0B] cursor-pointer"
                >
                  {activeSlide.primaryCtaText}
                  <ArrowRight
                    size={17}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </button>

                {/* Secondary */}
                <button
                  id="hero-find-shade-cta-btn"
                  onClick={onFindShadeClick}
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-[#C9972B] bg-white px-7 text-sm font-semibold text-[#121212] transition-all duration-300 hover:border-[#F05A7E] hover:bg-[#FCE8ED] hover:text-[#F05A7E] cursor-pointer"
                >
                  <Sparkles size={16} className="text-[#F05A7E]" />
                  {activeSlide.secondaryCtaText}
                </button>
              </div>

              {/* Trust indicators */}
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-[11px] text-[#6B6B6B]">
                {hero.trustIndicators.map((ti) => {
                  const Icon = ICON_MAP[ti.icon] || ShieldCheck;
                  return (
                    <div key={ti.id} className="flex items-center gap-2">
                      <Icon size={16} className="text-[#F05A7E]" />
                      <span>{ti.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT IMAGE */}
            <div
              className="relative z-10 mx-auto w-full max-w-[430px]"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => {
                setIsHovering(false);
                if (isDragging) handleDragEnd();
              }}
            >

              {/* Gold glow */}
              <div className="absolute -inset-5 rounded-[35px] bg-[#E3B84B]/10 blur-2xl" />

              {/* Image card */}
              <div className="relative overflow-hidden rounded-[20px] border border-[#E8D5A8] bg-[#0B0B0B] shadow-[0_20px_50px_rgba(11,11,11,0.16)]">

                <div className="relative aspect-[0.91] w-full">

                  {/* Subject photo fills the card — background stays true to each slide's own image instead of a fixed studio tint */}
                  <img
                    src={activeSlide.image}
                    alt="Premium beauty collection"
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  {/* Product information */}
                  <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 bg-[#0B0B0B]/95 px-5 py-4">

                    <div className="min-w-0">
                      <p className="text-[9px] font-bold tracking-wide text-[#E3B84B] line-clamp-1">
                        {activeSlide.imageBadgeLabel}
                      </p>

                      <p className="mt-1 text-[12px] font-medium text-white line-clamp-1">
                        {activeSlide.imageProductName}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="rounded-full bg-gradient-to-r from-[#C9972B] to-[#E3B84B] px-4 py-2 text-[11px] font-bold text-[#0B0B0B] shrink-0 whitespace-nowrap">
                      {activeSlide.imagePrice}
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prev arrow + Dots + Next arrow — all in a single line */}
        {slideCount > 1 && (
          <div className="relative z-20 mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border border-[#E8D5A8] text-[#121212] shadow-sm hover:bg-[#FCE8ED] transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>

            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goToIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === displayIndex ? 'w-6 bg-[#F05A7E]' : 'w-2 bg-[#E8D5A8]'
                }`}
              />
            ))}

            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border border-[#E8D5A8] text-[#121212] shadow-sm hover:bg-[#FCE8ED] transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* TRUST BAR */}
        <div className="relative z-20 mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:mt-10">
          {visibleTrustBar.map((badge) => {
            const Icon = ICON_MAP[badge.icon] || ShieldCheck;
            return (
              <div
                key={badge.id}
                className="flex items-center gap-3 rounded-[18px] border border-[#E8D5A8]/70 bg-white px-5 py-5 shadow-[0_10px_35px_rgba(11,11,11,0.08)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FCE8ED] bg-[#FCE8ED]">
                  <Icon size={18} className="text-[#F05A7E]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#121212] line-clamp-1">
                    {badge.title}
                  </p>
                  <p className="mt-1 text-[9px] text-[#6B6B6B] line-clamp-2">
                    {badge.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {hero.trustBar.length > TRUST_BAR_VISIBLE_LIMIT && (
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setShowAllTrustBar((prev) => !prev)}
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-[#C9972B] hover:text-[#F05A7E] transition-colors cursor-pointer"
            >
              <span>{showAllTrustBar ? 'View Less' : `View More (${hero.trustBar.length - TRUST_BAR_VISIBLE_LIMIT})`}</span>
              {showAllTrustBar ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        )}

      </div>
    </section>
  );
};
