import React, { useState } from 'react';
import { ArrowRight, Check, Copy, Crown, Gift, ShoppingBag, Sparkles, Tag, X } from 'lucide-react';
import type { LivePrivilegesPopupConfig } from '../types';
import type { LivePrivilegesCard } from '../utils/livePrivilegesPopup';
import { cloudinaryImageUrl } from '../utils/cloudinaryImage';

/**
 * The "Live Privileges For You" popup body. Purely presentational: the
 * storefront wraps it in a dialog (focus trap, overlay, Escape), and the
 * admin renders it inline as the live preview, so the preview is exactly
 * what customers get.
 *
 * `layout`: 'responsive' follows the viewport (stacked below md); 'split' and
 * 'stacked' force one form, for the admin's desktop/mobile preview toggle.
 */
export interface LivePrivilegesPopupViewProps {
  config: LivePrivilegesPopupConfig;
  cards: LivePrivilegesCard[];
  layout?: 'responsive' | 'split' | 'stacked';
  titleId?: string;
  onClose?: () => void;
  onCta?: () => void;
}

const BADGE_ICON = { crown: Crown, gift: Gift, sparkles: Sparkles, tag: Tag } as const;

export const LivePrivilegesPopupView: React.FC<LivePrivilegesPopupViewProps> = ({
  config,
  cards,
  layout = 'responsive',
  titleId = 'live-privileges-title',
  onClose,
  onCta,
}) => {
  const [copy, setCopy] = useState<{ code: string; ok: boolean } | null>(null);
  const t = config.theme;
  const split = layout === 'split';
  const stacked = layout === 'stacked';
  // Column/row classes per mode. Responsive = stacked on phones, split from md.
  const grid = split ? 'grid-cols-[38fr_62fr]' : stacked ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-[38fr_62fr]';
  // On phones the panel grows with its copy (the image covers whatever
  // height that is) — a fixed height clipped the title at 320px.
  const imagePanel = split ? 'min-h-0' : stacked ? 'min-h-[220px]' : 'min-h-[220px] sm:min-h-[260px] md:min-h-0';
  const mobileImg = config.mobileImage?.url ? config.mobileImage : null;

  const handleCopy = async (code: string) => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      ok = false; // insecure origin / permission denied — say so, don't pretend
    }
    setCopy({ code, ok });
    window.setTimeout(() => setCopy((c) => (c?.code === code ? null : c)), 2200);
  };

  const style = {
    '--lp-accent': t.accent,
    '--lp-accent-deep': t.accentDeep,
    '--lp-gold': t.gold,
    '--lp-surface': t.surface,
    '--lp-heading': t.heading,
    '--lp-body': t.body,
    '--lp-title-accent': t.titleAccent,
    maxWidth: config.layout.maxWidth,
    borderRadius: config.layout.radius,
  } as React.CSSProperties;

  return (
    <div
      style={style}
      className={`relative grid ${grid} w-full overflow-hidden bg-[var(--lp-surface)] border border-[color-mix(in_srgb,var(--lp-gold)_60%,transparent)] shadow-[0_30px_80px_-24px_rgba(11,11,11,0.55)] font-sans`}
    >
      {/* Close — pinned to the popup's corner so it never sits on a card. */}
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close offers"
            className={`absolute z-20 grid place-items-center w-11 h-11 rounded-full bg-white/95 border border-[color-mix(in_srgb,var(--lp-gold)_55%,transparent)] text-[var(--lp-heading)] shadow-sm hover:bg-white hover:border-[var(--lp-gold)] active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-gold)] focus-visible:ring-offset-2 cursor-pointer ${
              split ? 'top-3.5 right-3.5' : 'top-2.5 right-2.5'
            }`}
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        )}

      {/* ------------- Image panel ------------- */}
      <div className={`relative overflow-hidden bg-[linear-gradient(160deg,#FDF1F4_0%,#F9DCE4_55%,#F3C9D5_100%)] ${imagePanel}`}>
        {config.image.url && (
          // Forced layouts (admin preview) pick the image explicitly; the live
          // site lets the browser switch at md, focal point included.
          <picture>
            {mobileImg && layout === 'responsive' && (
              <source media="(max-width: 767px)" srcSet={cloudinaryImageUrl(mobileImg.url, 'gallery')} />
            )}
            <img
              src={cloudinaryImageUrl(stacked && mobileImg ? mobileImg.url : config.image.url, 'gallery')}
              alt=""
              className={`absolute inset-0 w-full h-full object-cover ${
                layout === 'responsive' ? '[object-position:var(--lp-focus-m)] md:[object-position:var(--lp-focus)]' : '[object-position:var(--lp-focus-now)]'
              }`}
              style={
                {
                  '--lp-focus': config.image.focus || '50% 50%',
                  '--lp-focus-m': (mobileImg ? mobileImg.focus : config.image.focus) || '50% 50%',
                  '--lp-focus-now': (stacked && mobileImg ? mobileImg.focus : config.image.focus) || '50% 50%',
                } as React.CSSProperties
              }
            />
          </picture>
        )}
        {/* Soft wash so the overlaid copy stays readable on any photo. */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 ${
            split ? 'bg-[linear-gradient(180deg,rgba(253,241,244,0.92)_0%,rgba(253,241,244,0.55)_38%,transparent_62%)]' : 'bg-[linear-gradient(180deg,rgba(253,241,244,0.94)_0%,rgba(253,241,244,0.6)_55%,rgba(253,241,244,0.1)_100%)] md:bg-[linear-gradient(180deg,rgba(253,241,244,0.92)_0%,rgba(253,241,244,0.55)_38%,transparent_62%)]'
          }`}
        />
        <div className={`relative z-10 p-6 ${split ? 'p-[52px] pr-8' : stacked ? 'p-6 pr-14' : 'p-6 pr-14 sm:p-8 md:p-[52px] md:pr-8'}`}>
          {config.eyebrow && (
            <p className="flex items-center gap-2 text-[11px] sm:text-[13px] font-medium tracking-[0.24em] uppercase text-[var(--lp-gold)]">
              <Sparkles className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
              {config.eyebrow}
            </p>
          )}
          <h2
            id={titleId}
            className={`font-serif !font-semibold leading-[1.02] text-[var(--lp-heading)] mt-3 ${
              split ? 'text-[59px]' : stacked ? 'text-[34px]' : 'text-[32px] min-[360px]:text-[38px] sm:text-[46px] md:text-[clamp(40px,4.4vw,58px)]'
            }`}
          >
            {config.title}
            {config.titleAccent && (
              <span className="block italic font-medium text-[var(--lp-title-accent)]">{config.titleAccent}</span>
            )}
          </h2>
          {config.description && (
            <p
              className={`text-[var(--lp-body)] leading-[1.5] mt-4 max-w-[270px] ${
                split ? 'text-[17px]' : stacked ? 'text-[14px]' : 'text-[14px] sm:text-[16px] md:text-[17px]'
              }`}
            >
              {config.description}
            </p>
          )}
        </div>
      </div>

      {/* ------------- Offers panel ------------- */}
      <div className={`relative flex flex-col min-h-0 ${split ? 'p-[30px] pt-[44px]' : stacked ? 'p-4 pt-5' : 'p-4 pt-5 sm:p-6 md:p-[30px] md:pt-[44px]'}`}>

        {cards.length === 0 ? (
          <p className="text-[14px] text-[var(--lp-body)] py-10 text-center">No privileges are live right now.</p>
        ) : (
          <ul className="space-y-4 overflow-y-auto min-h-0 -mr-1 pr-1" aria-label="Available offers">
            {cards.map((card) => {
              const Icon = card.badgeIcon !== 'none' ? BADGE_ICON[card.badgeIcon] : null;
              const state = copy?.code === card.couponCode ? copy : null;
              // Leave room for the artwork on wide layouts; never on phones.
              const textW = card.artworkUrl ? (split ? 'max-w-[68%]' : stacked ? '' : 'md:max-w-[68%]') : '';
              return (
                <li
                  key={card.offerId}
                  className="relative overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--lp-gold)_55%,transparent)] bg-[linear-gradient(110deg,#FFFFFF_0%,#FFFDFB_55%,#FCEEF1_100%)]"
                >
                  {card.artworkUrl && (
                    <img
                      src={cloudinaryImageUrl(card.artworkUrl, 'thumb')}
                      alt=""
                      className={`pointer-events-none absolute right-0 bottom-0 h-[78%] w-[34%] object-contain object-right-bottom opacity-95 ${
                        split ? '' : stacked ? 'hidden' : 'hidden md:block'
                      }`}
                    />
                  )}
                  <div className={`relative ${split ? 'p-6' : stacked ? 'p-4' : 'p-4 sm:p-5 md:p-6'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2.5">
                      {card.badge ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] font-medium tracking-[0.06em] uppercase text-[color-mix(in_srgb,var(--lp-gold)_85%,black)] bg-[color-mix(in_srgb,var(--lp-gold)_12%,white)]">
                          {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />}
                          {card.badge}
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopy(card.couponCode)}
                        aria-label={`Copy coupon code ${card.couponCode}`}
                        className={`relative z-10 inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] bg-white border text-[13px] sm:text-[15px] font-semibold tracking-[0.06em] text-[var(--lp-heading)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-gold)] cursor-pointer ${
                          state?.ok ? 'border-[#2E7D4F]' : 'border-[#D9D4CD] hover:border-[var(--lp-gold)]'
                        }`}
                      >
                        {state?.ok ? (
                          <Check className="w-4 h-4 text-[#2E7D4F]" aria-hidden="true" />
                        ) : (
                          <Copy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                        )}
                        {state ? (state.ok ? 'COPIED!' : card.couponCode) : card.couponCode}
                      </button>
                    </div>
                    <h3 className={`font-serif !font-semibold leading-tight text-[var(--lp-heading)] mt-3 ${textW} ${split ? 'text-[30px]' : 'text-[24px] sm:text-[28px]'}`}>
                      {card.title}
                    </h3>
                    {card.description && (
                      <p className={`text-[14px] sm:text-[16px] leading-[1.5] text-[var(--lp-body)] mt-2 ${textW}`}>{card.description}</p>
                    )}
                    <div className={`mt-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--lp-gold)_25%,transparent)] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] sm:text-[15px] text-[var(--lp-body)] ${textW}`}>
                      {card.minOrderValue > 0 && (
                        <span className="inline-flex items-center gap-2">
                          <ShoppingBag className="w-[18px] h-[18px] text-[var(--lp-accent)]" strokeWidth={1.6} aria-hidden="true" />
                          Minimum bag value: ₹{card.minOrderValue.toLocaleString('en-IN')}
                        </span>
                      )}
                      {card.discountLabel && (
                        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--lp-accent)]">
                          {card.discountLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {config.cta.enabled && (
          <button
            type="button"
            onClick={onCta}
            className="group shrink-0 mt-5 w-full h-[56px] sm:h-[62px] rounded-[14px] border border-[color-mix(in_srgb,var(--lp-gold)_70%,transparent)] bg-[linear-gradient(90deg,var(--lp-accent),var(--lp-accent-deep))] text-white text-[14px] sm:text-[17px] font-medium tracking-[0.14em] uppercase flex items-center justify-center gap-3.5 shadow-[0_10px_24px_-14px_var(--lp-accent-deep)] hover:brightness-105 active:translate-y-px transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-gold)] focus-visible:ring-offset-2 cursor-pointer"
          >
            {config.cta.showIcon && <ShoppingBag className="w-5 h-5 text-[#F6D98B]" strokeWidth={1.6} aria-hidden="true" />}
            {config.cta.label}
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}

        {/* Small gold flourish under the CTA, as in the reference. */}
        <div aria-hidden="true" className="shrink-0 mt-3 flex items-center justify-center gap-3 text-[var(--lp-gold)]">
          <span className="h-px w-16 bg-[color-mix(in_srgb,var(--lp-gold)_55%,transparent)]" />
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="h-px w-16 bg-[color-mix(in_srgb,var(--lp-gold)_55%,transparent)]" />
        </div>

        <p className="sr-only" aria-live="polite">
          {copy ? (copy.ok ? `Code ${copy.code} copied to clipboard.` : `Could not copy automatically. The code is ${copy.code}.`) : ''}
        </p>
      </div>
    </div>
  );
};
