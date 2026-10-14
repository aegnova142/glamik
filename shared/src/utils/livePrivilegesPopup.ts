import type {
  CMSOffer,
  LivePrivilegesImage,
  LivePrivilegesOfferItem,
  LivePrivilegesPopupConfig,
} from '../types';
import { isSafeBannerUrl } from './homeBanners';

/**
 * "Live Privileges For You" popup — defaults, validation and the one function
 * that turns a config plus the live offers into the cards customers see.
 * Shared so the storefront modal, the admin live preview and the server's
 * save validation can never disagree.
 */

export const LIVE_PRIVILEGES_LIMITS = {
  maxWidth: [760, 1200],
  radius: [8, 32],
  overlayOpacity: [0.3, 0.9],
  blurPx: [0, 16],
  delayMs: [0, 10000],
  // The admin lists every offer (to order/hide them), so this is a sanity
  // cap on payload size, not a limit on how many cards can be shown.
  maxOffers: 50,
  text: { eyebrow: 60, title: 60, titleAccent: 40, description: 240, ctaLabel: 40, badge: 32, offerTitle: 80, offerDescription: 240 },
} as const;

export const BADGE_ICONS = ['crown', 'gift', 'sparkles', 'tag', 'none'] as const;

/** Starting point for a store that has never configured the popup. No image:
 * the panel shows a soft blush gradient until an admin uploads one. */
export const DEFAULT_LIVE_PRIVILEGES_POPUP: LivePrivilegesPopupConfig = {
  enabled: true,
  eyebrow: 'Exclusive Beauty Offers',
  title: 'Live Privileges',
  titleAccent: 'For You',
  description: 'Unlock special privileges and make every beauty moment even more special.',
  image: { url: '' },
  cta: { enabled: true, label: 'Continue Shopping', url: '/shop', showIcon: true },
  theme: {
    accent: '#E8336F',
    accentDeep: '#C2185B',
    gold: '#C9972B',
    surface: '#FAF9F6',
    heading: '#121212',
    body: '#4A4642',
    titleAccent: '#D63F6E',
  },
  layout: { maxWidth: 1108, radius: 22, overlayOpacity: 0.6, blurPx: 6 },
  display: { delayMs: 600, frequency: 'session' },
  offers: [],
};

const HEX = /^#[0-9a-f]{6}$/i;
const FOCUS = /^(100|[1-9]?\d)(\.\d+)?% (100|[1-9]?\d)(\.\d+)?%$/;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const inRange = (v: unknown, [lo, hi]: readonly [number, number]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const validDate = (v: unknown) => v === undefined || v === '' || (isStr(v) && !Number.isNaN(Date.parse(v)));

/** An image URL is either empty, an http(s) URL, or a same-origin path. */
function imageProblem(img: unknown, label: string, required: boolean): string | null {
  if (img === undefined && !required) return null;
  if (!isObj(img) || !isStr(img.url)) return `${label} is invalid`;
  if (img.url && !isSafeBannerUrl(img.url)) return `${label} must be an https:// URL from the media library`;
  if (img.focus !== undefined && img.focus !== '' && !(isStr(img.focus) && FOCUS.test(img.focus))) {
    return `${label} focal point must look like "50% 30%"`;
  }
  return null;
}

/** Server-side validation of an admin save. Empty list = safe to store. */
export function validateLivePrivilegesConfig(input: unknown): string[] {
  const e: string[] = [];
  if (!isObj(input)) return ['Invalid popup configuration'];
  const c = input;
  const L = LIVE_PRIVILEGES_LIMITS;
  const text = (v: unknown, label: string, max: number, required = false) => {
    if (!isStr(v)) return e.push(`${label} is required`);
    if (required && !v.trim()) e.push(`${label} cannot be empty`);
    if (v.length > max) e.push(`${label} must be at most ${max} characters`);
  };

  if (typeof c.enabled !== 'boolean') e.push('Enabled must be on or off');
  text(c.eyebrow, 'Eyebrow', L.text.eyebrow);
  text(c.title, 'Title', L.text.title, true);
  text(c.titleAccent, 'Title accent', L.text.titleAccent);
  text(c.description, 'Description', L.text.description);
  const imgErr = imageProblem(c.image, 'Main image', true);
  if (imgErr) e.push(imgErr);
  if (c.mobileImage !== undefined && c.mobileImage !== null) {
    const m = imageProblem(c.mobileImage, 'Mobile image', false);
    if (m) e.push(m);
  }

  if (!isObj(c.cta)) e.push('Button settings are missing');
  else {
    if (typeof c.cta.enabled !== 'boolean' || typeof c.cta.showIcon !== 'boolean') e.push('Button switches are invalid');
    text(c.cta.label, 'Button label', L.text.ctaLabel, c.cta.enabled === true);
    if (!isStr(c.cta.url) || (c.cta.enabled && !isSafeBannerUrl(c.cta.url))) {
      e.push('Button destination must be a site path like /shop or an https:// URL');
    }
  }

  if (!isObj(c.theme)) e.push('Theme colours are missing');
  else {
    for (const k of ['accent', 'accentDeep', 'gold', 'surface', 'heading', 'body', 'titleAccent'] as const) {
      if (!isStr(c.theme[k]) || !HEX.test(c.theme[k])) e.push(`Colour "${k}" must be a hex value like #C9972B`);
    }
  }

  if (!isObj(c.layout)) e.push('Layout settings are missing');
  else {
    if (!inRange(c.layout.maxWidth, L.maxWidth)) e.push(`Popup width must be ${L.maxWidth[0]}–${L.maxWidth[1]}px`);
    if (!inRange(c.layout.radius, L.radius)) e.push(`Corner radius must be ${L.radius[0]}–${L.radius[1]}px`);
    if (!inRange(c.layout.overlayOpacity, L.overlayOpacity)) e.push('Overlay darkness must be between 30% and 90%');
    if (!inRange(c.layout.blurPx, L.blurPx)) e.push(`Background blur must be ${L.blurPx[0]}–${L.blurPx[1]}px`);
  }

  if (!isObj(c.display)) e.push('Display settings are missing');
  else {
    if (!inRange(c.display.delayMs, L.delayMs)) e.push('Opening delay must be 0–10 seconds');
    if (c.display.frequency !== 'session' && c.display.frequency !== 'every-visit') e.push('Frequency is invalid');
    if (!validDate(c.display.startAt) || !validDate(c.display.endAt)) e.push('Schedule dates are invalid');
    if (c.display.startAt && c.display.endAt && Date.parse(c.display.startAt) >= Date.parse(c.display.endAt)) {
      e.push('Schedule end must be after its start');
    }
  }

  if (!Array.isArray(c.offers)) e.push('Offer list is invalid');
  else {
    if (c.offers.length > L.maxOffers) e.push(`At most ${L.maxOffers} offers can be listed`);
    const seen = new Set<string>();
    c.offers.forEach((o: unknown, i: number) => {
      const n = `Offer ${i + 1}`;
      if (!isObj(o) || !isStr(o.offerId) || !o.offerId) return e.push(`${n} is missing its linked offer`);
      if (seen.has(o.offerId)) e.push(`${n} is listed twice`);
      seen.add(o.offerId);
      if (typeof o.visible !== 'boolean') e.push(`${n}: visibility is invalid`);
      if (o.badgeIcon !== undefined && !(BADGE_ICONS as readonly string[]).includes(o.badgeIcon)) e.push(`${n}: badge icon is invalid`);
      if (o.badgeText !== undefined && (!isStr(o.badgeText) || o.badgeText.length > L.text.badge)) e.push(`${n}: badge text is too long`);
      if (o.title !== undefined && (!isStr(o.title) || o.title.length > L.text.offerTitle)) e.push(`${n}: title is too long`);
      if (o.description !== undefined && (!isStr(o.description) || o.description.length > L.text.offerDescription)) e.push(`${n}: description is too long`);
      if (o.artworkUrl !== undefined && o.artworkUrl !== '' && !(isStr(o.artworkUrl) && isSafeBannerUrl(o.artworkUrl))) {
        e.push(`${n}: artwork must be an https:// URL from the media library`);
      }
    });
  }
  return e;
}

const cleanImage = (img: any): LivePrivilegesImage => ({ url: String(img.url).trim(), ...(img.focus ? { focus: img.focus } : {}) });
const opt = (v: any) => (isStr(v) && v.trim() ? v.trim() : undefined);

/** Copies only known fields out of an already-validated payload, so nothing
 * an admin client adds can end up in customer-facing content. */
export function normalizeLivePrivilegesConfig(c: any): LivePrivilegesPopupConfig {
  return {
    enabled: c.enabled,
    eyebrow: c.eyebrow.trim(),
    title: c.title.trim(),
    titleAccent: c.titleAccent.trim(),
    description: c.description.trim(),
    image: cleanImage(c.image),
    ...(c.mobileImage && c.mobileImage.url ? { mobileImage: cleanImage(c.mobileImage) } : {}),
    cta: { enabled: c.cta.enabled, label: c.cta.label.trim(), url: c.cta.url.trim(), showIcon: c.cta.showIcon },
    theme: { ...pick(c.theme, ['accent', 'accentDeep', 'gold', 'surface', 'heading', 'body', 'titleAccent']) },
    layout: { maxWidth: c.layout.maxWidth, radius: c.layout.radius, overlayOpacity: c.layout.overlayOpacity, blurPx: c.layout.blurPx },
    display: {
      delayMs: c.display.delayMs,
      frequency: c.display.frequency,
      ...(opt(c.display.startAt) ? { startAt: c.display.startAt } : {}),
      ...(opt(c.display.endAt) ? { endAt: c.display.endAt } : {}),
    },
    offers: c.offers.map(
      (o: any): LivePrivilegesOfferItem => ({
        offerId: o.offerId,
        visible: o.visible,
        ...(o.badgeIcon ? { badgeIcon: o.badgeIcon } : {}),
        ...(opt(o.badgeText) ? { badgeText: opt(o.badgeText) } : {}),
        ...(opt(o.title) ? { title: opt(o.title) } : {}),
        ...(opt(o.description) ? { description: opt(o.description) } : {}),
        ...(opt(o.artworkUrl) ? { artworkUrl: opt(o.artworkUrl) } : {}),
      })
    ),
  };
}

function pick<T extends Record<string, any>, K extends keyof T>(o: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  keys.forEach((k) => (out[k] = o[k]));
  return out;
}

/** Inside its optional schedule window. */
export function isLivePrivilegesScheduled(config: LivePrivilegesPopupConfig, now: Date = new Date()): boolean {
  const t = now.getTime();
  if (config.display.startAt && Date.parse(config.display.startAt) > t) return false;
  if (config.display.endAt && Date.parse(config.display.endAt) < t) return false;
  return true;
}

export interface LivePrivilegesCard {
  offerId: string;
  badge: string;
  badgeIcon: NonNullable<LivePrivilegesOfferItem['badgeIcon']>;
  title: string;
  description: string;
  couponCode: string;
  minOrderValue: number;
  discountLabel: string | null;
  artworkUrl?: string;
}

/** "15% off" / "₹150 off" — from the real discount rule, never invented. */
export function offerDiscountLabel(offer: Pick<CMSOffer, 'discountType' | 'discountValue'>): string | null {
  if (!(offer.discountValue > 0)) return null;
  if (offer.discountType === 'percentage') return `${offer.discountValue}% off`;
  if (offer.discountType === 'flat') return `₹${offer.discountValue.toLocaleString('en-IN')} off`;
  return null;
}

/**
 * The cards customers see. `liveOffers` must already be filtered to offers
 * that are active right now (status + date window) — the storefront gets
 * exactly that list from /cms/content. Listed offers come first in the
 * admin's order; a live offer the admin has not listed yet is appended, so a
 * newly created coupon still shows up. Offers without a coupon code are
 * skipped: the card's whole point is the code.
 */
export function resolveLivePrivilegesCards(config: LivePrivilegesPopupConfig, liveOffers: CMSOffer[]): LivePrivilegesCard[] {
  const byId = new Map(liveOffers.map((o) => [o.id, o]));
  const listed = new Set(config.offers.map((o) => o.offerId));
  const items: LivePrivilegesOfferItem[] = [
    ...config.offers,
    ...liveOffers.filter((o) => !listed.has(o.id)).map((o) => ({ offerId: o.id, visible: true })),
  ];
  return items.flatMap((item) => {
    const offer = byId.get(item.offerId);
    if (!item.visible || !offer || !offer.couponCode) return [];
    return [
      {
        offerId: offer.id,
        badge: item.badgeText || offer.tag || '',
        badgeIcon: item.badgeIcon || 'sparkles',
        title: item.title || offer.publicTitle || offer.name,
        description: item.description || offer.description,
        couponCode: offer.couponCode,
        minOrderValue: offer.minOrderValue || 0,
        discountLabel: offerDiscountLabel(offer),
        ...(item.artworkUrl ? { artworkUrl: item.artworkUrl } : {}),
      },
    ];
  });
}
