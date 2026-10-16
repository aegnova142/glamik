import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Loader2, Plus, Star, ThumbsUp, X } from 'lucide-react';
import { Review, ReviewStatus, REVIEW_SKIN_TONES, REVIEW_UNDERTONES } from '@glamirk/shared/types';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

type AdminReview = Review & {
  productImage?: string;
  source?: 'customer' | 'admin';
  sourceChannel?: string;
  enteredBy?: string;
};

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone call' },
  { id: 'store', label: 'In store' },
  { id: 'other', label: 'Other' },
];

const fieldClass = 'w-full px-3 py-2 text-xs bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[#FAF9F6]';
const labelClass = 'block text-[10px] uppercase tracking-wider text-[#E8D5A8] mb-1';

/**
 * Publishes feedback a real customer gave off the site. It goes live at once
 * and looks like any other review; the channel and who entered it are kept
 * for the admin only. Verified Purchase comes only from a real delivered order.
 */
const AddReviewForm: React.FC<{ onDone: (message: string) => void; onCancel: () => void }> = ({ onDone, onCancel }) => {
  const products = useCMS().products || [];
  const [form, setForm] = useState({
    productId: '',
    customerName: '',
    sourceChannel: '',
    rating: 0,
    title: '',
    comment: '',
    shadeName: '',
    skinTone: '',
    undertone: '',
    orderNumber: '',
    consent: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const shades = products.find((p) => p.id === form.productId)?.shades?.map((s) => s.name) || [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId || !form.customerName.trim() || !form.sourceChannel || !form.rating) {
      return setError('Product, customer name, where they gave it, and a star rating are required.');
    }
    if (!form.consent) return setError("Tick the box to confirm the customer agreed to publishing.");
    setSaving(true);
    setError('');
    const res = await apiFetch<{ review: Review; verificationNote?: string }>('/api/admin/reviews', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        shadeName: form.shadeName || undefined,
        skinTone: form.skinTone || undefined,
        undertone: form.undertone || undefined,
      }),
    });
    setSaving(false);
    if (!res.data) return setError(res.error || 'Could not publish the review.');
    onDone(
      `Published ${form.customerName.trim()}'s review${res.data.review.isVerifiedPurchase ? ' with Verified Purchase' : ''}.` +
        (res.data.verificationNote ? ` Note: ${res.data.verificationNote}` : '')
    );
  };

  return (
    <form onSubmit={submit} className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
      <div>
        <h3 className="font-serif text-lg text-[#FAF9F6]">Add a customer's review</h3>
        <p className="text-[11px] text-[#6B6B6B] mt-0.5">
          For genuine feedback a customer gave you directly (WhatsApp, Instagram, email…). It is published straight away and
          looks like any other review. Don't write reviews on a customer's behalf.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="md:col-span-1">
          <span className={labelClass}>Product *</span>
          <select value={form.productId} onChange={(e) => set({ productId: e.target.value, shadeName: '' })} className={fieldClass}>
            <option value="">Choose a product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          <span className={labelClass}>Customer name *</span>
          <input value={form.customerName} onChange={(e) => set({ customerName: e.target.value })} maxLength={60} placeholder="e.g. Priya Sharma" className={fieldClass} />
        </label>
        <label>
          <span className={labelClass}>Where they gave it *</span>
          <select value={form.sourceChannel} onChange={(e) => set({ sourceChannel: e.target.value })} className={fieldClass}>
            <option value="">Choose</option>
            {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <div>
        <span className={labelClass}>Rating *</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => set({ rating: n })} className="p-0.5 cursor-pointer">
              <Star className={`w-6 h-6 ${n <= form.rating ? 'fill-[#C9972B] text-[#C9972B]' : 'text-[#6B6B6B]'}`} />
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={labelClass}>Headline</span>
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={100} className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Review text (customer's own words)</span>
        <textarea value={form.comment} onChange={(e) => set({ comment: e.target.value })} maxLength={1000} rows={4} className={fieldClass} />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { key: 'shadeName' as const, label: 'Shade', options: shades },
          { key: 'skinTone' as const, label: 'Skin tone', options: [...REVIEW_SKIN_TONES] },
          { key: 'undertone' as const, label: 'Undertone', options: [...REVIEW_UNDERTONES] },
        ].map((f) => (
          <label key={f.key}>
            <span className={labelClass}>{f.label}</span>
            <select value={form[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} disabled={!f.options.length} className={`${fieldClass} disabled:opacity-40`}>
              <option value="">Not given</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>

      <label className="block">
        <span className={labelClass}>Order number (optional)</span>
        <input value={form.orderNumber} onChange={(e) => set({ orderNumber: e.target.value })} placeholder="e.g. GLM-10234" className={fieldClass} />
        <span className="block mt-1 text-[10.5px] text-[#6B6B6B]">
          The review is published either way. "Verified Purchase" is added only if this is a real order (not cancelled or
          unpaid) that contains the product.
        </span>
      </label>

      <label className="flex items-start gap-2 text-xs text-[#FAF9F6] cursor-pointer">
        <input type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-0.5" />
        This is the customer's genuine feedback and they agreed to have it published on the website.
      </label>

      {error && <div className="p-3 rounded-lg bg-[#F05A7E]/10 border border-[#F05A7E]/40 text-xs text-[#F05A7E]">{error}</div>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#F05A7E] text-white text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Publish review
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-lg border border-[#E8D5A8]/30 text-[#FAF9F6] text-xs uppercase tracking-wider cursor-pointer">
          Cancel
        </button>
      </div>
    </form>
  );
};

interface AdminReviewsResponse {
  reviews: AdminReview[];
  counts: Record<ReviewStatus, number>;
  page: number;
  pageSize: number;
}

const TABS: { id: ReviewStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

/**
 * Review moderation queue. Every customer review lands here as Pending and is
 * invisible on the storefront until approved. Approving also grants the
 * reviewer's points (verified purchases only) and updates the product rating;
 * rejecting can carry a reason the customer sees in My Reviews.
 */
export const AdminReviews: React.FC = () => {
  const [tab, setTab] = useState<ReviewStatus>('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<AdminReviewsResponse>(`/api/admin/reviews?status=${tab}&page=${page}`);
    setLoading(false);
    if (!res.data) return setError(res.error || 'Could not load reviews.');
    // Moderating the last item on the last page empties it: step back a page.
    const lastPage = Math.max(1, Math.ceil((res.data.counts[tab] || 0) / res.data.pageSize));
    if (page > lastPage) return setPage(lastPage);
    setData(res.data);
  }, [tab, page]);

  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    load();
  }, [load, refresh]);

  const moderate = async (review: AdminReview, status: 'approved' | 'rejected', note?: string) => {
    setBusyId(review.id);
    setError('');
    const res = await apiFetch(`/api/admin/reviews/${review.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, reviewedVersion: review.date }),
    });
    setBusyId(null);
    setRejecting(null);
    if (res.error) setError(res.error);
    // Reload either way: on a 409 the admin needs to see the edited text.
    load();
  };

  const totalPages = data ? Math.max(1, Math.ceil((data.counts[tab] || 0) / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Customer Reviews</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            New and edited reviews wait here. Nothing appears on the website until you approve it.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setNotice('');
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#F05A7E] text-white text-xs uppercase tracking-wider cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Review
          </button>
        )}
      </div>

      {adding && (
        <AddReviewForm
          onCancel={() => setAdding(false)}
          onDone={(message) => {
            setAdding(false);
            setNotice(message);
            setTab('approved');
            setPage(1);
            setRefresh((n) => n + 1);
          }}
        />
      )}
      {notice && <div className="p-3 rounded-lg bg-[#2E7D32]/15 border border-[#2E7D32]/50 text-xs text-[#81C784]">{notice}</div>}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-xs uppercase tracking-wider border cursor-pointer ${
              tab === t.id ? 'bg-[#F05A7E] border-[#F05A7E] text-white' : 'border-[#E8D5A8]/30 text-[#FAF9F6] hover:bg-[#171717]'
            }`}
          >
            {t.label} ({data?.counts[t.id] ?? '…'})
          </button>
        ))}
      </div>

      {error && <div className="p-3 rounded-lg bg-[#F05A7E]/10 border border-[#F05A7E]/40 text-xs text-[#F05A7E]">{error}</div>}

      {loading && !data ? (
        <div className="flex items-center gap-2 text-xs text-[#6B6B6B]"><Loader2 className="w-4 h-4 animate-spin" /> Loading reviews…</div>
      ) : data && data.reviews.length === 0 ? (
        <div className="p-8 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 text-center text-sm text-[#6B6B6B]">
          {tab === 'pending' ? 'No reviews waiting for approval.' : `No ${tab} reviews.`}
        </div>
      ) : (
        <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {data?.reviews.map((r) => (
            <div key={r.id} className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 flex flex-col md:flex-row gap-4">
              {r.productImage && (
                <img src={cloudinaryImageUrl(r.productImage, 'thumb')} alt="" className="w-16 h-20 object-cover rounded-lg shrink-0" />
              )}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-semibold text-[#FAF9F6]">{r.productName || r.productId}</span>
                  <span className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'fill-[#C9972B] text-[#C9972B]' : 'text-[#6B6B6B]'}`} />
                    ))}
                  </span>
                  <span className="text-[#6B6B6B]">{r.customerName} · {new Date(r.date).toLocaleString('en-IN')}</span>
                  {r.isVerifiedPurchase && (
                    <span className="inline-flex items-center gap-1 text-[#4CAF50]"><BadgeCheck className="w-3.5 h-3.5" /> Verified purchase</span>
                  )}
                  {r.source === 'admin' && (
                    <span className="px-2 py-0.5 rounded-full bg-[#E8D5A8]/10 border border-[#E8D5A8]/30 text-[10px] text-[#E8D5A8]">
                      Added by admin · via {CHANNELS.find((c) => c.id === r.sourceChannel)?.label || r.sourceChannel}
                      {r.enteredBy ? ` · ${r.enteredBy}` : ''}
                    </span>
                  )}
                  {!!r.helpfulCount && (
                    <span className="inline-flex items-center gap-1 text-[#6B6B6B]"><ThumbsUp className="w-3 h-3" /> {r.helpfulCount}</span>
                  )}
                </div>
                {r.title && <p className="text-sm font-semibold text-[#FAF9F6]">{r.title}</p>}
                <p className="text-sm text-[#D6CEBC] whitespace-pre-line break-words">
                  {r.comment || <em className="text-[#6B6B6B]">Rating only — no text.</em>}
                </p>
                {(r.shadeName || r.skinTone || r.undertone) && (
                  <p className="text-[11px] text-[#C9972B]">
                    {[r.shadeName && `Shade: ${r.shadeName}`, r.skinTone && `${r.skinTone} skin`, r.undertone && `${r.undertone} undertone`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {!!r.media?.length && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.media.map((m) => (
                      <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-[#E8D5A8]/30">
                        {m.type === 'video' ? (
                          <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={cloudinaryImageUrl(m.url, 'thumb')} alt="Customer upload" className="w-full h-full object-cover" />
                        )}
                      </a>
                    ))}
                  </div>
                )}
                {r.status === 'rejected' && r.moderationNote && (
                  <p className="text-[11px] text-[#F05A7E]">Rejection reason: {r.moderationNote}</p>
                )}

                {rejecting?.id === r.id && (
                  <div className="pt-2 space-y-2">
                    <input
                      autoFocus
                      value={rejecting.note}
                      onChange={(e) => setRejecting({ id: r.id, note: e.target.value })}
                      maxLength={300}
                      placeholder="Reason shown to the customer (optional)"
                      className="w-full px-3 py-2 text-xs bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[#FAF9F6]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => moderate(r, 'rejected', rejecting.note)}
                        disabled={busyId === r.id}
                        className="px-4 py-2 rounded-lg bg-[#F05A7E] text-white text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                      >
                        Confirm reject
                      </button>
                      <button onClick={() => setRejecting(null)} className="px-4 py-2 rounded-lg border border-[#E8D5A8]/30 text-[#FAF9F6] text-xs uppercase tracking-wider cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex md:flex-col gap-2 shrink-0">
                {r.status !== 'approved' && (
                  <button
                    onClick={() => moderate(r, 'approved')}
                    disabled={busyId === r.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#2E7D32] hover:bg-[#388E3C] text-white text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                  </button>
                )}
                {r.status !== 'rejected' && rejecting?.id !== r.id && (
                  <button
                    onClick={() => setRejecting({ id: r.id, note: '' })}
                    disabled={busyId === r.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-[#F05A7E]/60 text-[#F05A7E] hover:bg-[#F05A7E]/10 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> {r.status === 'approved' ? 'Unpublish' : 'Reject'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-[#FAF9F6]">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className="p-2 rounded-lg border border-[#E8D5A8]/30 disabled:opacity-40 cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          Page {page} of {totalPages}
          <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} aria-label="Next page" className="p-2 rounded-lg border border-[#E8D5A8]/30 disabled:opacity-40 cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
