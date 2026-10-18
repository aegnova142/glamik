/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Monitor,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import type { LivePrivilegesAdminView } from '@glamirk/shared/context/CMSContext';
import { LivePrivilegesPopupView } from '@glamirk/shared/components';
import type { CMSOffer, LivePrivilegesImage, LivePrivilegesOfferItem, LivePrivilegesPopupConfig } from '@glamirk/shared/types';
import {
  BADGE_ICONS,
  LIVE_PRIVILEGES_LIMITS as L,
  offerDiscountLabel,
  resolveLivePrivilegesCards,
  validateLivePrivilegesConfig,
} from '@glamirk/shared/utils/livePrivilegesPopup';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';
import { useFileUpload } from '../../hooks/useFileUpload';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_MB = 20;

const input =
  'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B] focus-visible:ring-2 focus-visible:ring-[#C9972B]/40';
const label = 'block text-[11px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';
const btn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9972B]/60';
const card = 'p-4 sm:p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4';

/** datetime-local <-> ISO, in the admin's local time. */
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';

interface Props {
  /** Jumps to Offers & Campaigns, where coupon rules live. */
  onOpenOffers?: () => void;
}

export const AdminLivePrivileges: React.FC<Props> = ({ onOpenOffers }) => {
  const { fetchLivePrivilegesAdmin, saveLivePrivilegesDraft, publishLivePrivileges, discardLivePrivilegesDraft, fetchFullAdminState } =
    useCMS();
  const [view, setView] = useState<LivePrivilegesAdminView | null>(null);
  const [form, setForm] = useState<LivePrivilegesPopupConfig | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const [allOffers, setAllOffers] = useState<CMSOffer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'draft' | 'publish' | 'discard'>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const load = async () => {
    setLoadError(null);
    const [res, full] = await Promise.all([fetchLivePrivilegesAdmin(), fetchFullAdminState()]);
    if (!res.data) {
      setLoadError(res.error || 'Could not load the popup settings.');
      return;
    }
    const offers: CMSOffer[] = Array.isArray(full?.offers) ? full.offers : [];
    setAllOffers(offers);
    applyView(res.data, offers);
  };

  /** Server view → form, listing every offer so the admin can order/hide all of them. */
  const applyView = (v: LivePrivilegesAdminView, offers: CMSOffer[] = allOffers) => {
    const listed = new Set(v.draft.offers.map((o) => o.offerId));
    const known = new Set(offers.map((o) => o.id));
    const merged: LivePrivilegesPopupConfig = {
      ...v.draft,
      offers: [
        ...v.draft.offers.filter((o) => known.has(o.offerId)),
        ...offers.filter((o) => !listed.has(o.id)).map((o) => ({ offerId: o.id, visible: true })),
      ],
    };
    setView(v);
    setForm(merged);
    setBaseline(JSON.stringify(merged));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = !!form && JSON.stringify(form) !== baseline;
  const draftDiffersFromPublished = !!view && JSON.stringify(view.draft) !== JSON.stringify(view.published);
  const clientErrors = useMemo(() => (form ? validateLivePrivilegesConfig(form) : []), [form]);

  // Preview uses only offers that are live right now — the same rule the
  // storefront applies — so it never shows a card customers would not see.
  const liveOffers = useMemo(() => allOffers.filter((o) => o.status === 'active'), [allOffers]);
  const cards = useMemo(() => (form ? resolveLivePrivilegesCards(form, liveOffers) : []), [form, liveOffers]);

  if (loadError) {
    return (
      <div className={card} role="alert">
        <p className="flex items-center gap-2 text-sm text-[#FF9AB2]">
          <AlertCircle className="w-4 h-4" /> {loadError}
        </p>
        <button type="button" className={btn} onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!form || !view) {
    return (
      <p className="flex items-center gap-2 text-sm text-[#B5B0AA]" role="status">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading popup settings…
      </p>
    );
  }

  const set = (patch: Partial<LivePrivilegesPopupConfig>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setOffer = (i: number, patch: Partial<LivePrivilegesOfferItem>) =>
    setForm((f) => (f ? { ...f, offers: f.offers.map((o, j) => (j === i ? { ...o, ...patch } : o)) } : f));
  const moveOffer = (i: number, d: -1 | 1) =>
    setForm((f) => {
      if (!f) return f;
      const next = [...f.offers];
      const j = i + d;
      if (j < 0 || j >= next.length) return f;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...f, offers: next };
    });

  const run = async (kind: 'draft' | 'publish' | 'discard') => {
    if (kind !== 'discard' && clientErrors.length) {
      setStatus({ kind: 'error', text: `Fix these first: ${clientErrors.join(' · ')}` });
      return;
    }
    if (kind === 'discard' && !window.confirm('Discard the draft and go back to the published version?')) return;
    if (kind === 'publish' && !window.confirm('Publish these changes? Customers will see them on Shop the Look right away.')) return;
    setBusy(kind);
    setStatus(null);
    const res =
      kind === 'draft'
        ? await saveLivePrivilegesDraft(form)
        : kind === 'publish'
          ? await publishLivePrivileges(form)
          : await discardLivePrivilegesDraft();
    setBusy(null);
    if (!res.data) {
      // Keep the admin's edits; say what the server said.
      setStatus({ kind: 'error', text: res.error || 'The server did not accept the change.' });
      return;
    }
    applyView(res.data);
    setStatus({
      kind: 'ok',
      text: kind === 'draft' ? 'Draft saved. Customers still see the published version.' : kind === 'publish' ? 'Published — live on Shop the Look.' : 'Draft discarded.',
    });
  };

  return (
    <div className="space-y-5">
      {/* ---------------- Header / publishing ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Live Privileges Popup</h2>
          <p className="text-xs text-[#B5B0AA] mt-1">
            Shown on Shop the Look. Last published {fmt(view.publishedAt)}
            {view.updatedBy ? ` · last edited by ${view.updatedBy}` : ''}.{' '}
            {dirty ? (
              <span className="text-[#F6C177]">Unsaved changes.</span>
            ) : !view.published ? (
              <span className="text-[#F6C177]">Not published yet — customers see the default popup.</span>
            ) : draftDiffersFromPublished ? (
              <span className="text-[#F6C177]">Saved draft differs from what customers see.</span>
            ) : (
              <span>Draft matches the live version.</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/shop-the-look" target="_blank" rel="noreferrer" className={btn} title="Opens the store — shows the published version only">
            <ExternalLink className="w-3.5 h-3.5" /> View live store
          </a>
          <button type="button" className={btn} disabled={!!busy || (!dirty && !draftDiffersFromPublished)} onClick={() => void run('discard')}>
            {busy === 'discard' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Discard
          </button>
          <button type="button" className={btn} disabled={!!busy || !dirty} aria-busy={busy === 'draft'} onClick={() => void run('draft')}>
            {busy === 'draft' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save draft
          </button>
          <button
            type="button"
            disabled={!!busy || (!dirty && !draftDiffersFromPublished && !!view.published)}
            aria-busy={busy === 'publish'}
            onClick={() => void run('publish')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D5A8]"
          >
            {busy === 'publish' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Publish
          </button>
        </div>
      </div>

      <div role="status" aria-live="polite">
        {status && (
          <p
            className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
              status.kind === 'ok' ? 'border-[#8FD3A6]/40 bg-[#8FD3A6]/10 text-[#8FD3A6]' : 'border-[#F05A7E]/40 bg-[#F05A7E]/10 text-[#FF9AB2]'
            }`}
          >
            {status.kind === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {status.text}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5 items-start">
        {/* ================= Form ================= */}
        <div className="space-y-5 min-w-0">
          <section className={card} aria-labelledby="lp-general">
            <h3 id="lp-general" className="font-serif text-lg text-[#FAF9F6]">Content</h3>
            <label className="flex items-center gap-2.5 text-xs text-[#FAF9F6] cursor-pointer w-fit">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="w-4 h-4 accent-[#F05A7E]" />
              Show the popup on Shop the Look
            </label>
            <TextField id="lp-eyebrow" label="Eyebrow" value={form.eyebrow} max={L.text.eyebrow} onChange={(v) => set({ eyebrow: v })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField id="lp-title" label="Title" value={form.title} max={L.text.title} onChange={(v) => set({ title: v })} />
              <TextField id="lp-accent" label="Title accent (italic line)" value={form.titleAccent} max={L.text.titleAccent} onChange={(v) => set({ titleAccent: v })} />
            </div>
            <TextField id="lp-desc" label="Supporting text" value={form.description} max={L.text.description} multiline onChange={(v) => set({ description: v })} />
          </section>

          <section className={card} aria-labelledby="lp-images">
            <h3 id="lp-images" className="font-serif text-lg text-[#FAF9F6]">Images</h3>
            <ImageField
              id="lp-image"
              title="Main campaign image"
              hint="Left panel on desktop. Portrait works best (at least 900 × 1300 px). JPEG, PNG or WebP up to 20 MB."
              aspect="aspect-[38/62] max-w-[220px]"
              value={form.image}
              onChange={(image) => set({ image })}
            />
            <ImageField
              id="lp-mobile-image"
              title="Mobile image (optional)"
              hint="Used on phones instead of the main image. Leave empty to reuse the main image."
              aspect="aspect-[390/230] max-w-[300px]"
              value={form.mobileImage}
              optional
              onChange={(mobileImage) => set({ mobileImage: mobileImage?.url ? mobileImage : undefined })}
            />
          </section>

          <section className={card} aria-labelledby="lp-offers">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="lp-offers" className="font-serif text-lg text-[#FAF9F6]">Offer cards</h3>
              {onOpenOffers && (
                <button type="button" className={btn} onClick={onOpenOffers}>
                  <ExternalLink className="w-3.5 h-3.5" /> Edit coupon rules in Offers &amp; Campaigns
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#B5B0AA]">
              Each card is a real offer. Its coupon code, discount, minimum order and schedule come from Offers &amp; Campaigns —
              the same rules checkout uses — so they are shown read-only here. Only offers that are live right now appear to customers.
            </p>
            {form.offers.length === 0 && <p className="text-xs text-[#B5B0AA]">No offers exist yet. Create one in Offers &amp; Campaigns.</p>}
            <ol className="space-y-3">
              {form.offers.map((item, i) => {
                const offer = allOffers.find((o) => o.id === item.offerId);
                if (!offer) return null;
                const live = offer.status === 'active';
                const problem = !offer.couponCode ? 'No coupon code — this card is never shown.' : !live ? `Offer is ${offer.status} — hidden until it is live.` : null;
                return (
                  <li key={item.offerId} className={`p-3 rounded-lg border ${item.visible ? 'border-[#E8D5A8]/25 bg-[#0B0B0B]' : 'border-[#E8D5A8]/10 bg-[#0B0B0B]/50'} space-y-3`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-[#B5B0AA] w-5">{i + 1}.</span>
                      <span className="text-sm text-[#FAF9F6] font-semibold">{offer.publicTitle || offer.name}</span>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${live ? 'bg-[#8FD3A6]/15 text-[#8FD3A6]' : 'bg-[#F6C177]/15 text-[#F6C177]'}`}>
                        {offer.status}
                      </span>
                      <span className="ml-auto flex gap-1">
                        <button type="button" className={btn} aria-label={`Move ${offer.publicTitle} up`} disabled={i === 0} onClick={() => moveOffer(i, -1)}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className={btn} aria-label={`Move ${offer.publicTitle} down`} disabled={i === form.offers.length - 1} onClick={() => moveOffer(i, 1)}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className={btn}
                          aria-pressed={item.visible}
                          onClick={() => setOffer(i, { visible: !item.visible })}
                        >
                          {item.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          {item.visible ? 'Shown' : 'Hidden'}
                        </button>
                      </span>
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-[11px]">
                      <div><dt className="text-[#B5B0AA]">Coupon</dt><dd className="text-[#FAF9F6] font-semibold tracking-wider">{offer.couponCode || '—'}</dd></div>
                      <div><dt className="text-[#B5B0AA]">Discount</dt><dd className="text-[#FAF9F6]">{offerDiscountLabel(offer) || offer.discountType}</dd></div>
                      <div><dt className="text-[#B5B0AA]">Min. bag</dt><dd className="text-[#FAF9F6]">₹{(offer.minOrderValue || 0).toLocaleString('en-IN')}</dd></div>
                    </dl>
                    {problem && (
                      <p className="flex items-center gap-1.5 text-[11px] text-[#F6C177]">
                        <AlertCircle className="w-3.5 h-3.5" /> {problem}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] gap-2">
                      <div>
                        <label htmlFor={`lp-icon-${i}`} className={label}>Badge icon</label>
                        <select id={`lp-icon-${i}`} value={item.badgeIcon || 'sparkles'} onChange={(e) => setOffer(i, { badgeIcon: e.target.value as LivePrivilegesOfferItem['badgeIcon'] })} className={input}>
                          {BADGE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                        </select>
                      </div>
                      <TextField id={`lp-badge-${i}`} label="Badge text" placeholder={offer.tag} value={item.badgeText || ''} max={L.text.badge} onChange={(v) => setOffer(i, { badgeText: v })} />
                    </div>
                    <TextField id={`lp-otitle-${i}`} label="Card title" placeholder={offer.publicTitle || offer.name} value={item.title || ''} max={L.text.offerTitle} onChange={(v) => setOffer(i, { title: v })} />
                    <TextField id={`lp-odesc-${i}`} label="Card description" placeholder={offer.description} value={item.description || ''} max={L.text.offerDescription} multiline onChange={(v) => setOffer(i, { description: v })} />
                    <ImageField
                      id={`lp-art-${i}`}
                      title="Card artwork (optional)"
                      hint="Decorative image on the right of the card. Transparent PNG/WebP works best."
                      aspect="aspect-square max-w-[120px]"
                      value={item.artworkUrl ? { url: item.artworkUrl } : undefined}
                      optional
                      noFocus
                      onChange={(img) => setOffer(i, { artworkUrl: img?.url || undefined })}
                    />
                  </li>
                );
              })}
            </ol>
          </section>

          <section className={card} aria-labelledby="lp-cta">
            <h3 id="lp-cta" className="font-serif text-lg text-[#FAF9F6]">Button</h3>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-[#FAF9F6] cursor-pointer">
                <input type="checkbox" checked={form.cta.enabled} onChange={(e) => set({ cta: { ...form.cta, enabled: e.target.checked } })} className="w-4 h-4 accent-[#F05A7E]" />
                Show the button
              </label>
              <label className="flex items-center gap-2 text-xs text-[#FAF9F6] cursor-pointer">
                <input type="checkbox" checked={form.cta.showIcon} onChange={(e) => set({ cta: { ...form.cta, showIcon: e.target.checked } })} className="w-4 h-4 accent-[#F05A7E]" />
                Shopping-bag icon
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField id="lp-cta-label" label="Label" value={form.cta.label} max={L.text.ctaLabel} onChange={(v) => set({ cta: { ...form.cta, label: v } })} />
              <TextField id="lp-cta-url" label="Destination" placeholder="/shop or https://…" value={form.cta.url} max={500} onChange={(v) => set({ cta: { ...form.cta, url: v } })} />
            </div>
          </section>

          <section className={card} aria-labelledby="lp-theme">
            <h3 id="lp-theme" className="font-serif text-lg text-[#FAF9F6]">Theme &amp; layout</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ['accent', 'Button start'],
                  ['accentDeep', 'Button end'],
                  ['gold', 'Gold / borders'],
                  ['surface', 'Offer panel'],
                  ['heading', 'Headings'],
                  ['body', 'Body text'],
                  ['titleAccent', 'Title accent'],
                ] as const
              ).map(([key, text]) => (
                <div key={key}>
                  <label htmlFor={`lp-c-${key}`} className={label}>{text}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      aria-label={`${text} colour picker`}
                      value={/^#[0-9a-f]{6}$/i.test(form.theme[key]) ? form.theme[key] : '#000000'}
                      onChange={(e) => set({ theme: { ...form.theme, [key]: e.target.value.toUpperCase() } })}
                      className="w-8 h-8 rounded border border-[#E8D5A8]/30 bg-transparent cursor-pointer"
                    />
                    <input id={`lp-c-${key}`} value={form.theme[key]} maxLength={7} onChange={(e) => set({ theme: { ...form.theme, [key]: e.target.value } })} className={input} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RangeField id="lp-width" label="Popup width" unit="px" min={L.maxWidth[0]} max={L.maxWidth[1]} step={4} value={form.layout.maxWidth} onChange={(v) => set({ layout: { ...form.layout, maxWidth: v } })} />
              <RangeField id="lp-radius" label="Corner radius" unit="px" min={L.radius[0]} max={L.radius[1]} step={1} value={form.layout.radius} onChange={(v) => set({ layout: { ...form.layout, radius: v } })} />
              <RangeField id="lp-overlay" label="Background darkness" unit="%" min={30} max={90} step={5} value={Math.round(form.layout.overlayOpacity * 100)} onChange={(v) => set({ layout: { ...form.layout, overlayOpacity: v / 100 } })} />
              <RangeField id="lp-blur" label="Background blur" unit="px" min={L.blurPx[0]} max={L.blurPx[1]} step={1} value={form.layout.blurPx} onChange={(v) => set({ layout: { ...form.layout, blurPx: v } })} />
            </div>
          </section>

          <section className={card} aria-labelledby="lp-display">
            <h3 id="lp-display" className="font-serif text-lg text-[#FAF9F6]">When it appears</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RangeField id="lp-delay" label="Opening delay" unit="s" min={0} max={10} step={0.5} value={form.display.delayMs / 1000} onChange={(v) => set({ display: { ...form.display, delayMs: Math.round(v * 1000) } })} />
              <div>
                <label htmlFor="lp-freq" className={label}>Frequency</label>
                <select id="lp-freq" value={form.display.frequency} onChange={(e) => set({ display: { ...form.display, frequency: e.target.value as 'session' | 'every-visit' } })} className={input}>
                  <option value="session">Once per browser session</option>
                  <option value="every-visit">Every visit to Shop the Look</option>
                </select>
              </div>
              <div>
                <label htmlFor="lp-start" className={label}>Show from (optional)</label>
                <input id="lp-start" type="datetime-local" value={toLocalInput(form.display.startAt)} onChange={(e) => set({ display: { ...form.display, startAt: fromLocalInput(e.target.value) } })} className={input} />
              </div>
              <div>
                <label htmlFor="lp-end" className={label}>Show until (optional)</label>
                <input id="lp-end" type="datetime-local" value={toLocalInput(form.display.endAt)} onChange={(e) => set({ display: { ...form.display, endAt: fromLocalInput(e.target.value) } })} className={input} />
              </div>
            </div>
          </section>

          {clientErrors.length > 0 && (
            <ul className="p-3 rounded-lg border border-[#F05A7E]/40 bg-[#F05A7E]/10 text-[11px] text-[#FF9AB2] space-y-1" aria-label="Problems to fix before saving">
              {clientErrors.map((e) => (
                <li key={e} className="flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {e}</li>
              ))}
            </ul>
          )}
        </div>

        {/* ================= Live preview ================= */}
        <div className="2xl:sticky 2xl:top-4 space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-lg text-[#FAF9F6]">Live preview <span className="text-[11px] font-sans text-[#B5B0AA]">(unsaved edits included)</span></h3>
            <div role="group" aria-label="Preview size" className="flex gap-1">
              <button type="button" className={btn} aria-pressed={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>
                <Monitor className="w-3.5 h-3.5" /> Desktop
              </button>
              <button type="button" className={btn} aria-pressed={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>
                <Smartphone className="w-3.5 h-3.5" /> Mobile
              </button>
            </div>
          </div>
          {!form.enabled && <p className="text-[11px] text-[#F6C177]">The popup is switched off — customers will not see it.</p>}
          {cards.length === 0 && <p className="text-[11px] text-[#F6C177]">No live offers with a coupon code — customers will not see the popup.</p>}
          <ScaledPreview designWidth={previewMode === 'desktop' ? form.layout.maxWidth : 390}>
            <div
              className="p-4 flex justify-center"
              style={{ background: `rgba(11,11,11,${form.layout.overlayOpacity})`, borderRadius: 12 }}
            >
              <LivePrivilegesPopupView
                config={form}
                cards={cards}
                layout={previewMode === 'desktop' ? 'split' : 'stacked'}
                titleId="lp-preview-title"
                onClose={() => undefined}
                onCta={() => undefined}
              />
            </div>
          </ScaledPreview>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const TextField: React.FC<{
  id: string;
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  multiline?: boolean;
  onChange: (v: string) => void;
}> = ({ id, label: text, value, max, placeholder, multiline, onChange }) => (
  <div>
    <label htmlFor={id} className={label}>
      {text} <span className="normal-case font-normal text-[#B5B0AA]">({value.length}/{max})</span>
    </label>
    {multiline ? (
      <textarea id={id} rows={2} maxLength={max} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
    ) : (
      <input id={id} maxLength={max} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
    )}
  </div>
);

const RangeField: React.FC<{
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}> = ({ id, label: text, unit, min, max, step, value, onChange }) => (
  <div>
    <label htmlFor={id} className={label}>
      {text} <span className="normal-case font-normal text-[#B5B0AA]">{value}{unit}</span>
    </label>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#C9972B]" />
  </div>
);

/** Upload (drag/drop or pick), preview, focal point and remove — the image
 * goes to the existing media library; only its URL is stored in the config. */
const ImageField: React.FC<{
  id: string;
  title: string;
  hint: string;
  aspect: string;
  value?: LivePrivilegesImage;
  optional?: boolean;
  noFocus?: boolean;
  onChange: (img: LivePrivilegesImage | undefined) => void;
}> = ({ id, title, hint, aspect, value, optional, noFocus, onChange }) => {
  const { upload, isUploading, phase, progress, error } = useFileUpload({
    acceptedTypes: IMAGE_TYPES,
    maxSizeBytes: IMAGE_MAX_MB * 1024 * 1024,
    typeErrorMessage: 'Please choose a JPEG, PNG or WebP image.',
  });
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const m = /^([\d.]+)% ([\d.]+)%$/.exec(value?.focus || '');
  const [fx, fy] = m ? [Number(m[1]), Number(m[2])] : [50, 50];
  const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)));
  const setFocus = (x: number, y: number) => value && onChange({ ...value, focus: `${clamp(x)}% ${clamp(y)}%` });

  const handle = async (file?: File) => {
    const item = await upload(file);
    if (item) onChange({ url: item.url });
  };

  return (
    <div className="space-y-2">
      <div>
        <span className={label} id={`${id}-label`}>{title}</span>
        <p className="text-[11px] text-[#B5B0AA]">{hint}</p>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {value?.url ? (
          noFocus ? (
            <img src={cloudinaryImageUrl(value.url, 'thumb')} alt="" className={`w-full ${aspect} object-contain rounded-lg border border-[#E8D5A8]/30 bg-[#0B0B0B]`} />
          ) : (
            <button
              type="button"
              aria-label={`${title}: set focal point. Currently ${fx}% across, ${fy}% down. Click the image or use arrow keys.`}
              onClick={(e) => {
                if (e.detail === 0) return; // keyboard activation: arrows move it
                const r = e.currentTarget.getBoundingClientRect();
                setFocus(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 10 : 2;
                const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                if (!d[e.key]) return;
                e.preventDefault();
                setFocus(fx + d[e.key][0], fy + d[e.key][1]);
              }}
              className={`relative w-full ${aspect} overflow-hidden rounded-lg border border-[#E8D5A8]/30 bg-[#0B0B0B] cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9972B]`}
            >
              <img src={cloudinaryImageUrl(value.url, 'tile')} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: value.focus || '50% 50%' }} />
              <span aria-hidden="true" className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" style={{ left: `${fx}%`, top: `${fy}%` }} />
            </button>
          )
        ) : null}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handle(e.dataTransfer.files?.[0]);
          }}
          className={`flex-1 min-w-[180px] rounded-lg border border-dashed p-3 text-center ${dragging ? 'border-[#C9972B] bg-[#C9972B]/10' : 'border-[#E8D5A8]/30 bg-[#0B0B0B]'}`}
        >
          <UploadCloud className="w-5 h-5 mx-auto text-[#C9972B]" aria-hidden="true" />
          <p className="text-[11px] text-[#FAF9F6] mt-1">Drag an image here, or</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" className={btn} disabled={isUploading} onClick={() => fileRef.current?.click()} aria-describedby={`${id}-label`}>
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              {value?.url ? 'Replace' : 'Choose image'}
            </button>
            {value?.url && !noFocus && value.focus && (
              <button type="button" className={btn} onClick={() => onChange({ url: value.url })}>
                <Crosshair className="w-3.5 h-3.5" /> Centre
              </button>
            )}
            {value?.url && optional && (
              <button type="button" className={btn} onClick={() => window.confirm(`Remove the ${title.toLowerCase()}?`) && onChange(undefined)}>
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void handle(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div role="status" aria-live="polite" className="mt-2 text-[11px] min-h-[1rem]">
            {isUploading && (
              <span className="text-[#E8D5A8]">{phase === 'processing' ? 'Processing…' : `Uploading… ${progress}%`}</span>
            )}
            {!isUploading && error && (
              <span className="inline-flex items-center gap-1 text-[#FF9AB2]"><AlertCircle className="w-3.5 h-3.5" /> {error}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Renders children at a fixed design width and scales them to fit, so the
 * desktop preview shows the real 1100px composition inside the admin column. */
const ScaledPreview: React.FC<{ designWidth: number; children: React.ReactNode }> = ({ designWidth, children }) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const width = designWidth + 32; // inner padding of the backdrop
      const scale = Math.min(1, outer.current.clientWidth / width);
      setBox({ scale, height: inner.current.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [designWidth]);
  return (
    <div ref={outer} className="w-full overflow-hidden" style={{ height: box.height || undefined }}>
      <div ref={inner} style={{ width: designWidth + 32, transform: `scale(${box.scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
};
