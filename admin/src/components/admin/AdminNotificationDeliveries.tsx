/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Delivery Failures — the notification outbox, made visible.
 *
 * Until this screen existed, a notification that failed left a console line on
 * a server nobody reads. "The customer says they never got the shipping email"
 * had no answer: no record of whether it was attempted, what the provider
 * said, or whether trying again was worth anything.
 *
 * Two deliberate choices shape it:
 *
 * PENDING is shown next to FAILED. A delivery sitting at "attempt 4 of 5, next
 * try in 16 minutes" is the one most worth seeing, and it is not FAILED yet. A
 * screen that listed only terminal failures would go quiet exactly while
 * something was going wrong.
 *
 * SKIPPED is its own status, never dressed up as success. A WhatsApp message
 * that was not sent because no provider is configured is not a delivery. The
 * row says so, in the provider's own words.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { formatDateTime } from '@glamirk/shared/utils/dateFormat';
import {
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Mail,
  MessageCircle,
  Bell,
  Store,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  MinusCircle,
} from 'lucide-react';

interface DeliveryRecord {
  id: string;
  eventId: string;
  channel: string;
  eventType: string;
  orderId: string | null;
  orderNumber: string | null;
  recipient: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  attempts: number;
  totalAttempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  requeuedAt: string | null;
  requeuedBy: string | null;
  createdAt: string;
  updatedAt: string;
  canRetry: boolean;
  retryBlockedReason: string | null;
}

interface ListResponse {
  deliveries: DeliveryRecord[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  maxAttempts: number;
}

const PAGE_SIZE = 20;

const STATUS_FILTERS = ['ALL', 'FAILED', 'PENDING', 'SKIPPED', 'SENT'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const CHANNEL_FILTERS = ['ALL', 'email', 'whatsapp', 'inapp', 'admin_inapp', 'admin_whatsapp'] as const;
type ChannelFilter = (typeof CHANNEL_FILTERS)[number];

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  inapp: 'In-app',
  admin_inapp: 'Admin panel',
  admin_whatsapp: 'Admin WhatsApp',
};

const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  whatsapp: MessageCircle,
  inapp: Bell,
  admin_inapp: Store,
  admin_whatsapp: MessageCircle,
};

// SKIPPED is muted rather than red: nothing went wrong, the channel simply has
// nothing behind it yet. FAILED is the one that needs an operator.
const STATUS_STYLE: Record<string, string> = {
  SENT: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  PENDING: 'bg-[#C9972B]/10 text-[#C9972B] border-[#C9972B]/30',
  FAILED: 'bg-[#F05A7E]/10 text-[#F05A7E] border-[#F05A7E]/30',
  SKIPPED: 'bg-[#6B6B6B]/10 text-[#9A9A9A] border-[#6B6B6B]/40',
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  SENT: CheckCircle2,
  PENDING: Clock,
  FAILED: AlertCircle,
  SKIPPED: MinusCircle,
};

/** 'ORDER_OUT_FOR_DELIVERY' reads badly in a table; 'Order out for delivery'
 * does. The raw value stays available as the row's title attribute. */
function humanEvent(eventType: string): string {
  const words = eventType.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "in 4 minutes" / "2 hours ago" — a backoff window is far easier to judge as
 * a duration than as a timestamp. */
function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const deltaMs = new Date(iso).getTime() - Date.now();
  const future = deltaMs > 0;
  const mins = Math.round(Math.abs(deltaMs) / 60000);
  if (mins < 1) return future ? 'in under a minute' : 'just now';
  if (mins < 60) return future ? `in ${mins} min` : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

export const AdminNotificationDeliveries: React.FC = () => {
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('FAILED');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  // Per-row outcome of the last retry, so a result is attached to the thing it
  // happened to rather than announced in a banner at the top of the page.
  const [retryResult, setRetryResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const qs = new URLSearchParams({
      status: statusFilter,
      channel: channelFilter,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (search) qs.set('search', search);

    const res = await apiFetch<ListResponse>(`/api/admin/notifications/deliveries?${qs.toString()}`);
    if (res.error || !res.data) {
      setLoadError(res.error || 'Could not load notification deliveries.');
      setDeliveries([]);
      setTotal(0);
    } else {
      setDeliveries(res.data.deliveries || []);
      setTotal(res.data.total || 0);
      setCounts(res.data.counts || {});
    }
    setIsLoading(false);
  }, [statusFilter, channelFilter, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced so typing an order number does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleRetry = async (delivery: DeliveryRecord) => {
    setRetryingId(delivery.id);
    setRetryResult((prev) => ({ ...prev, [delivery.id]: undefined as any }));

    const res = await apiFetch<{ ok: boolean; delivery: DeliveryRecord | null; status: string }>(
      `/api/admin/notifications/deliveries/${delivery.id}/retry`,
      { method: 'POST' }
    );

    if (res.error) {
      // Includes the configuration blocks and the "another admin just retried
      // it" race — both are information, not faults.
      setRetryResult((prev) => ({ ...prev, [delivery.id]: { ok: false, message: res.error! } }));
    } else {
      const after = res.data?.delivery;
      // Report what actually happened, not what was hoped for. The backend
      // attempts the delivery immediately, so this is the real outcome.
      const message =
        after?.status === 'SENT'
          ? 'Delivered.'
          : after?.status === 'SKIPPED'
          ? `Skipped: ${after.lastError || 'channel declined to send.'}`
          : after?.status === 'FAILED'
          ? `Failed again: ${after.lastError || 'no reason given.'}`
          : 'Queued — the worker will attempt it shortly.';
      setRetryResult((prev) => ({ ...prev, [delivery.id]: { ok: after?.status === 'SENT', message } }));
      if (after) {
        setDeliveries((prev) => prev.map((d) => (d.id === after.id ? after : d)));
      }
    }
    setRetryingId(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const failedCount = counts.FAILED || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Delivery Failures</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Every email, WhatsApp and in-app notification the store has tried to send — including the ones that did not
            arrive, and why.
          </p>
        </div>

        <button
          onClick={() => void load()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-2 bg-[#171717] hover:bg-[#C9972B]/10 border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#C9972B] transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {failedCount > 0 && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#F05A7E]/5 border border-[#F05A7E]/20">
          <AlertCircle className="w-4 h-4 text-[#F05A7E] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#FAF9F6]">
            <span className="font-semibold text-[#F05A7E]">
              {failedCount} notification{failedCount === 1 ? '' : 's'} gave up after exhausting retries.
            </span>{' '}
            Fix the cause shown in the row, then retry — a retry restores the full attempt budget.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                statusFilter === s
                  ? 'bg-[#C9972B] text-[#0B0B0B]'
                  : 'bg-[#171717] text-[#6B6B6B] border border-[#E8D5A8]/20 hover:text-[#FAF9F6]'
              }`}
            >
              {s === 'ALL' ? 'All' : s} {s !== 'ALL' && counts[s] ? `(${counts[s]})` : ''}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex flex-wrap gap-2">
            {CHANNEL_FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setChannelFilter(c);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  channelFilter === c
                    ? 'bg-[#E8D5A8]/20 text-[#E8D5A8] border border-[#E8D5A8]/40'
                    : 'bg-[#171717] text-[#6B6B6B] border border-[#E8D5A8]/20 hover:text-[#FAF9F6]'
                }`}
              >
                {c === 'ALL' ? 'All channels' : CHANNEL_LABEL[c] || c}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order number or event type…"
              className="w-full pl-9 pr-3 py-2 bg-[#171717] border border-[#E8D5A8]/20 rounded-lg text-xs text-[#FAF9F6] placeholder:text-[#6B6B6B] focus:outline-none focus:border-[#C9972B]/50"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/20 overflow-hidden">
        {loadError ? (
          <div className="p-10 text-center flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 text-[#F05A7E]" />
            <p className="text-xs text-[#F05A7E]">{loadError}</p>
            <button
              onClick={() => void load()}
              className="px-3.5 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#C9972B] cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : isLoading && deliveries.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#6B6B6B]">Loading notification deliveries…</div>
        ) : deliveries.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#6B6B6B] flex flex-col items-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-[#6B6B6B]" />
            <span>
              {statusFilter === 'FAILED'
                ? 'No failed deliveries. Every notification the store has sent either arrived or is still queued.'
                : 'No notification deliveries match these filters.'}
            </span>
          </div>
        ) : (
          <div className="divide-y divide-[#0B0B0B]">
            {deliveries.map((d) => {
              const ChannelIcon = CHANNEL_ICON[d.channel] || Bell;
              const StatusIcon = STATUS_ICON[d.status] || AlertCircle;
              const result = retryResult[d.id];
              const isRetrying = retryingId === d.id;

              return (
                <div key={d.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center flex-wrap gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${
                            STATUS_STYLE[d.status] || STATUS_STYLE.SKIPPED
                          }`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {d.status}
                        </span>

                        <span className="inline-flex items-center gap-1 text-[11px] text-[#E8D5A8]">
                          <ChannelIcon className="w-3 h-3" />
                          {CHANNEL_LABEL[d.channel] || d.channel}
                        </span>

                        <span className="text-xs font-semibold text-[#FAF9F6]" title={d.eventType}>
                          {humanEvent(d.eventType)}
                        </span>

                        {d.orderNumber && (
                          <span className="text-[11px] font-mono text-[#6B6B6B]">#{d.orderNumber}</span>
                        )}
                      </div>

                      <p className="text-[11px] text-[#6B6B6B]">
                        {d.recipient && <>To {d.recipient} • </>}
                        Attempt {d.attempts} of {d.maxAttempts}
                        {d.totalAttempts > d.attempts && <> ({d.totalAttempts} overall)</>}
                        {d.lastAttemptAt && <> • Last tried {relativeTime(d.lastAttemptAt)}</>}
                        {d.status === 'PENDING' && d.nextAttemptAt && (
                          <> • Next attempt {relativeTime(d.nextAttemptAt)}</>
                        )}
                        {d.status === 'SENT' && d.sentAt && <> • Delivered {formatDateTime(d.sentAt)}</>}
                      </p>
                    </div>

                    <div className="flex-shrink-0">
                      {d.canRetry ? (
                        <button
                          onClick={() => void handleRetry(d)}
                          disabled={isRetrying}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B]/10 border border-[#C9972B]/40 rounded-lg text-[11px] font-semibold text-[#C9972B] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                        >
                          <RotateCcw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                          {isRetrying ? 'Retrying…' : 'Retry'}
                        </button>
                      ) : (
                        <span
                          className="text-[10px] text-[#6B6B6B] italic max-w-[160px] block text-right"
                          title={d.retryBlockedReason || ''}
                        >
                          {d.status === 'SENT' ? 'Delivered' : 'Retry unavailable'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* The provider's own words. The only thing that tells an
                      operator what to actually fix. */}
                  {d.lastError && (
                    <p className="text-[11px] text-[#F05A7E]/90 bg-[#0B0B0B] rounded-lg px-3 py-2 break-words">
                      {d.lastError}
                    </p>
                  )}

                  {!d.canRetry && d.retryBlockedReason && d.status !== 'SENT' && d.status !== 'PENDING' && (
                    <p className="text-[11px] text-[#C9972B]/90 bg-[#C9972B]/5 border border-[#C9972B]/20 rounded-lg px-3 py-2">
                      {d.retryBlockedReason}
                    </p>
                  )}

                  {result && (
                    <p
                      className={`text-[11px] rounded-lg px-3 py-2 ${
                        result.ok
                          ? 'text-emerald-400 bg-emerald-500/5 border border-emerald-500/20'
                          : 'text-[#E8D5A8] bg-[#E8D5A8]/5 border border-[#E8D5A8]/20'
                      }`}
                    >
                      {result.message}
                    </p>
                  )}

                  <p className="text-[10px] text-[#6B6B6B]/70">
                    Created {formatDateTime(d.createdAt)} • Updated {formatDateTime(d.updatedAt)}
                    {d.requeuedBy && <> • Retried by {d.requeuedBy}</>}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-2 rounded-lg bg-[#171717] border border-[#E8D5A8]/20 text-[#FAF9F6] disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-[#6B6B6B]">
            Page {page} of {totalPages} • {total} total
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-2 rounded-lg bg-[#171717] border border-[#E8D5A8]/20 text-[#FAF9F6] disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
