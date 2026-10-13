/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { formatDate, formatDateTime } from '@glamirk/shared/utils/dateFormat';
import {
  Order,
  OrderStatus,
  ReturnRequest,
  ORDER_STATUS_SEQUENCE,
  ORDER_STATUSES,
  CANCELLABLE_ORDER_STATUSES,
  canonicalOrderStatus,
  RETURN_STATUSES,
  PaymentRecordDetail,
  RefundRecordDetail,
  RefundSummary,
  OrderTimelineEvent,
} from '@glamirk/shared/types';
import {
  Package,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Truck,
  RotateCcw,
  AlertCircle,
  Check,
} from 'lucide-react';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

// Every status an order may actually hold, including the legacy spellings —
// filtering by a status no order can have would silently return nothing.
const ALL_ORDER_STATUSES: (OrderStatus | 'ALL')[] = ['ALL', ...ORDER_STATUSES];

const STATUS_BADGE_COLOR: Record<string, string> = {
  PLACED: 'bg-[#C9972B]/10 text-[#C9972B] border-[#C9972B]/30',
  CONFIRMED: 'bg-[#C9972B]/10 text-[#C9972B] border-[#C9972B]/30',
  PACKED: 'bg-[#C9972B]/10 text-[#C9972B] border-[#C9972B]/30',
  SHIPPED: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  OUT_FOR_DELIVERY: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  DELIVERED: 'bg-green-500/10 text-green-400 border-green-500/30',
  CANCELLED: 'bg-[#F05A7E]/10 text-[#F05A7E] border-[#F05A7E]/30',
  RETURN_REQUESTED: 'bg-[#F05A7E]/10 text-[#F05A7E] border-[#F05A7E]/30',
  SUBMITTED: 'bg-[#C9972B]/10 text-[#C9972B] border-[#C9972B]/30',
  UNDER_REVIEW: 'bg-[#C9972B]/10 text-[#C9972B] border-[#C9972B]/30',
  APPROVED: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  PICKUP_SCHEDULED: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  REFUNDED: 'bg-green-500/10 text-green-400 border-green-500/30',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${STATUS_BADGE_COLOR[status] || 'bg-[#0B0B0B] text-[#6B6B6B] border-[#E8D5A8]/20'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

interface PaymentDetailResponse {
  payments: PaymentRecordDetail[];
  refunds: RefundRecordDetail[];
  refundSummary: RefundSummary;
}

interface TrackingSyncResponse {
  awb: string;
  waybill: string;
  providerStatus?: string | null;
  status?: string | null;
  events?: OrderTimelineEvent[];
  courierName?: string;
  applied: boolean;
  newScans: number;
  orderStatusChanged: boolean;
}

const PAGE_SIZE = 20;

export const AdminOrders: React.FC = () => {
  const [tab, setTab] = useState<'orders' | 'returns'>('orders');

  // Orders list state
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Order detail / status update state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Payments & refunds panel. Server state only — a refund is never drawn
  // optimistically, because "refunded" has to mean the provider and the
  // database both confirmed it.
  const [paymentDetail, setPaymentDetail] = useState<PaymentDetailResponse | null>(null);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundConfirm, setRefundConfirm] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Courier sync. Deliberate POST only — the GET on the same path is
  // read-only and never applies anything.
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<TrackingSyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Returns state
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [isLoadingReturns, setIsLoadingReturns] = useState(false);
  const [returnUpdatingId, setReturnUpdatingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setIsLoadingOrders(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter !== 'ALL') qs.set('status', statusFilter);
    const res = await apiFetch<{ orders: Order[]; total: number }>(`/api/admin/orders?${qs.toString()}`);
    if (res.data) {
      setOrders(res.data.orders);
      setTotal(res.data.total);
    }
    setIsLoadingOrders(false);
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const fetchPaymentDetail = async (orderId: string) => {
    setIsLoadingPayments(true);
    const res = await apiFetch<PaymentDetailResponse>(`/api/admin/orders/${orderId}/payments`);
    if (res.data) setPaymentDetail(res.data);
    setIsLoadingPayments(false);
  };

  // Loaded when an order is opened, and cleared when it closes so the next
  // order never briefly shows the previous one's refunds.
  useEffect(() => {
    setPaymentDetail(null);
    setRefundAmount('');
    setRefundReason('');
    setRefundConfirm(false);
    setRefundError(null);
    setSyncResult(null);
    setSyncError(null);
    if (selectedOrder) fetchPaymentDetail(selectedOrder.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder?.id]);

  const handleRefund = async () => {
    if (!selectedOrder || !paymentDetail) return;
    setIsRefunding(true);
    setRefundError(null);

    // One key per confirmed attempt. If the response is lost and the admin
    // clicks again, the server replays the original refund instead of issuing
    // a second one.
    const idempotencyKey = `admin-${selectedOrder.id}-${Date.now()}`;
    const amount = Number(refundAmount) > 0 ? Number(refundAmount) : paymentDetail.refundSummary.refundable;

    const res = await apiFetch<{ order: Order }>(`/api/admin/orders/${selectedOrder.id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason: refundReason || 'Refunded by store', idempotencyKey }),
    });

    if (res.error) {
      setRefundError(res.error);
    } else {
      setRefundConfirm(false);
      setRefundAmount('');
      setRefundReason('');
      if (res.data?.order) setSelectedOrder(res.data.order);
      // Refetched rather than patched locally: the panel shows what the
      // database holds, including the provider refund id we only learn here.
      await fetchPaymentDetail(selectedOrder.id);
      await fetchOrders();
    }
    setIsRefunding(false);
  };

  const handleSyncTracking = async () => {
    if (!selectedOrder) return;
    setIsSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    // POST, not GET. The GET on this path returns the same courier payload but
    // writes nothing; reconciling is an explicit action with an audit entry.
    const res = await apiFetch<TrackingSyncResponse>(`/api/admin/orders/${selectedOrder.id}/shipment/track`, {
      method: 'POST',
    });

    if (res.error) {
      // Shown verbatim: a 502 here means the courier was unreachable, and
      // "could not reach the courier" is the honest thing to tell an operator
      // rather than a generic failure.
      setSyncError(res.error);
    } else if (res.data) {
      setSyncResult(res.data);
      // The order may have moved, so refresh from the server rather than
      // guessing locally what the sync did.
      if (res.data.orderStatusChanged) await fetchOrders();
    }
    setIsSyncing(false);
  };

  const fetchReturns = async () => {
    setIsLoadingReturns(true);
    const res = await apiFetch<{ returns: ReturnRequest[] }>('/api/admin/returns');
    if (res.data) setReturns(res.data.returns);
    setIsLoadingReturns(false);
  };

  useEffect(() => {
    if (tab === 'returns') fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /**
   * The moves this order may legally make next.
   *
   * Statuses are normalised through canonicalOrderStatus first so an order
   * still on a legacy PLACED/PACKED value offers the same next step as a
   * modern one — without that it would find no index on the ladder and offer
   * nothing but "cancel", stranding every pre-split order.
   *
   * Mirrors isValidStatusTransition on the server: anything offered here is
   * accepted there, and anything it would reject is never shown.
   */
  const nextStatusOptions = (order: Order): OrderStatus[] => {
    const current = canonicalOrderStatus(order.status);
    const options: OrderStatus[] = [];

    const idx = ORDER_STATUS_SEQUENCE.indexOf(current);
    if (idx !== -1 && idx < ORDER_STATUS_SEQUENCE.length - 1) options.push(ORDER_STATUS_SEQUENCE[idx + 1]);

    // Post-delivery outcomes, offered only where the server would honour them.
    if (current === 'DELIVERED') options.push('RETURN_REQUESTED');
    if (current === 'RETURN_REQUESTED') options.push('RETURNED');
    if (current === 'SHIPPED' || current === 'OUT_FOR_DELIVERY') options.push('RTO');

    if (CANCELLABLE_ORDER_STATUSES.includes(order.status)) options.push('CANCELLED');
    return options;
  };

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!selectedOrder) return;
    setIsUpdatingStatus(true);
    setStatusError(null);
    const res = await apiFetch<{ order: Order }>(`/api/admin/orders/${selectedOrder.id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus, note: statusNote.trim() || undefined }),
    });
    setIsUpdatingStatus(false);
    if (res.data?.order) {
      setSelectedOrder(res.data.order);
      setOrders((prev) => prev.map((o) => (o.id === res.data!.order.id ? res.data!.order : o)));
      setStatusNote('');
    } else {
      setStatusError(res.error || 'Could not update order status.');
    }
  };

  const handleUpdateReturnStatus = async (id: string, status: ReturnRequest['status']) => {
    setReturnUpdatingId(id);
    const res = await apiFetch<{ return: ReturnRequest }>(`/api/admin/returns/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    setReturnUpdatingId(null);
    if (res.data?.return) {
      setReturns((prev) => prev.map((r) => (r.id === id ? res.data!.return : r)));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ==========================================
  // Order Detail View
  // ==========================================
  if (selectedOrder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedOrder(null);
              setStatusError(null);
            }}
            className="p-2 rounded-lg bg-[#171717] text-[#E8D5A8] border border-[#E8D5A8]/20 hover:text-[#FAF9F6] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-serif text-xl text-[#FAF9F6]">Order #{selectedOrder.orderNumber}</h2>
            <span className="text-xs text-[#6B6B6B]">
              Placed {formatDateTime(selectedOrder.createdAt)}
            </span>
          </div>
          <div className="ml-auto">
            <StatusBadge status={selectedOrder.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {/* Items */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B]">Items</h3>
              <div className="divide-y divide-[#0B0B0B]">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img src={cloudinaryImageUrl(item.productImage, 'thumb')} alt={item.productName} className="w-11 h-13 object-cover rounded border border-[#E8D5A8]/20" />
                      <div>
                        <p className="text-xs text-[#FAF9F6] font-medium">{item.productName}</p>
                        <p className="text-[11px] text-[#6B6B6B]">
                          {item.shade ? `Shade: ${item.shade.name}` : item.size ? `Size: ${item.size}` : ''} • Qty: {item.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-[#FAF9F6]">₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-[#0B0B0B] space-y-1 text-xs text-[#6B6B6B]">
                <div className="flex justify-between"><span>Subtotal</span><span>₹{selectedOrder.subtotal}</span></div>
                {selectedOrder.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-₹{selectedOrder.discount}</span></div>}
                <div className="flex justify-between"><span>Shipping</span><span>{selectedOrder.shipping === 0 ? 'FREE' : `₹${selectedOrder.shipping}`}</span></div>
                <div className="flex justify-between text-sm font-semibold text-[#FAF9F6] pt-1"><span>Total</span><span>₹{selectedOrder.total}</span></div>
              </div>
            </div>

            {/* Timeline */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B]">Status History</h3>
              <div className="space-y-2">
                {selectedOrder.timeline.map((event, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-[#FAF9F6]">{event.status.replace(/_/g, ' ')}</span>
                      <p className="text-[#6B6B6B]">{event.note}</p>
                    </div>
                    <span className="text-[#6B6B6B] flex-shrink-0">
                      {formatDateTime(event.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            {/* Customer / Address */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 space-y-1.5 text-xs">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">Delivery Address</h3>
              <p className="text-[#FAF9F6] font-medium">{selectedOrder.deliveryAddress?.name}</p>
              <p className="text-[#6B6B6B]">{selectedOrder.deliveryAddress?.addressLine1}</p>
              <p className="text-[#6B6B6B]">{selectedOrder.deliveryAddress?.city}, {selectedOrder.deliveryAddress?.state} - {selectedOrder.deliveryAddress?.pinCode}</p>
              <p className="text-[#6B6B6B] font-mono">{selectedOrder.deliveryAddress?.phone}</p>
            </div>

            {/* Payments & Refunds.
                Replaces a two-line static block that showed only
                order.payment.method and .status. Everything here is server
                state: the panel refetches after a refund rather than
                optimistically drawing one, because "refunded" must mean the
                provider and the database both said so. */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B]">Payments & Refunds</h3>
                <button
                  onClick={() => fetchPaymentDetail(selectedOrder.id)}
                  disabled={isLoadingPayments}
                  className="text-[10px] text-[#6B6B6B] hover:text-[#C9972B] disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingPayments ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <div>
                <p className="text-[#FAF9F6] font-medium uppercase">{selectedOrder.payment.method}</p>
                <p className="text-[#6B6B6B]">Status: {selectedOrder.payment.status}</p>
              </div>

              {isLoadingPayments && !paymentDetail && <p className="text-[#6B6B6B]">Loading…</p>}

              {paymentDetail && (
                <>
                  <div className="pt-2 border-t border-[#E8D5A8]/10 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#6B6B6B]">Collected</span>
                      <span className="text-[#FAF9F6]">₹{paymentDetail.refundSummary.amountPaid}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B6B6B]">Refunded</span>
                      <span className="text-[#FAF9F6]">₹{paymentDetail.refundSummary.amountRefunded}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-[#6B6B6B]">Refundable</span>
                      <span className="text-[#C9972B]">₹{paymentDetail.refundSummary.refundable}</span>
                    </div>
                  </div>

                  {/* Gateway attempts */}
                  {paymentDetail.payments.length > 0 && (
                    <div className="pt-2 border-t border-[#E8D5A8]/10 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-[#6B6B6B]">Gateway Attempts</p>
                      {paymentDetail.payments.map((p) => (
                        <div key={p.id} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[#FAF9F6] font-mono text-[10.5px] truncate">
                              {p.providerPaymentId || p.providerOrderId || p.id}
                            </p>
                            <p className="text-[#6B6B6B] text-[10px]">
                              {p.method || '—'} · {formatDateTime(p.createdAt)}
                            </p>
                            {p.errorDescription && (
                              <p className="text-[#F05A7E] text-[10px]">{p.errorDescription}</p>
                            )}
                          </div>
                          <span className="text-[#FAF9F6] text-[10.5px] shrink-0">
                            ₹{p.amount} · {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Refund history — persisted rows only */}
                  <div className="pt-2 border-t border-[#E8D5A8]/10 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-[#6B6B6B]">Refund History</p>
                    {paymentDetail.refunds.length === 0 ? (
                      <p className="text-[#6B6B6B] text-[10.5px]">No refunds recorded.</p>
                    ) : (
                      paymentDetail.refunds.map((r) => (
                        <div key={r.id} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[#FAF9F6] text-[10.5px]">
                              ₹{r.amount}
                              <span
                                className={
                                  r.status === 'PROCESSED'
                                    ? ' text-[#4ADE80]'
                                    : r.status === 'FAILED'
                                      ? ' text-[#F05A7E]'
                                      : ' text-[#C9972B]'
                                }
                              >
                                {' '}
                                · {r.status}
                              </span>
                            </p>
                            <p className="text-[#6B6B6B] text-[10px]">
                              {formatDateTime(r.createdAt)}
                              {r.createdBy ? ` · ${r.createdBy}` : ''}
                            </p>
                            {r.reason && <p className="text-[#6B6B6B] text-[10px] italic">{r.reason}</p>}
                            {r.providerRefundId && (
                              <p className="text-[#6B6B6B] text-[10px] font-mono">{r.providerRefundId}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Refund action. Hidden outright — not merely disabled —
                      when it could never succeed, which is exactly the two
                      refusals refundOrderPayment enforces. */}
                  {paymentDetail.refundSummary.isCod ? (
                    <p className="pt-2 border-t border-[#E8D5A8]/10 text-[10.5px] text-[#6B6B6B]">
                      Cash on Delivery — there is no captured payment to reverse. Refund this outside the gateway.
                    </p>
                  ) : !paymentDetail.refundSummary.canRefund ? (
                    <p className="pt-2 border-t border-[#E8D5A8]/10 text-[10.5px] text-[#6B6B6B]">
                      Nothing left to refund on this order.
                    </p>
                  ) : (
                    <div className="pt-2 border-t border-[#E8D5A8]/10 space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-[#6B6B6B]">Issue Refund</p>
                      <input
                        type="number"
                        min={1}
                        max={paymentDetail.refundSummary.refundable}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder={`Up to ₹${paymentDetail.refundSummary.refundable}`}
                        className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                      />
                      <input
                        type="text"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="Reason (recorded against the refund)"
                        className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                      />
                      {refundError && (
                        <div className="flex items-start gap-1.5 text-[#F05A7E] text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span>{refundError}</span>
                        </div>
                      )}
                      {refundConfirm ? (
                        <div className="space-y-2">
                          <p className="text-[10.5px] text-[#F05A7E]">
                            Refund ₹{refundAmount || paymentDetail.refundSummary.refundable} to the customer? This
                            moves real money and cannot be undone here.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={handleRefund}
                              disabled={isRefunding}
                              className="flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider bg-[#F05A7E] text-white hover:bg-[#D94A6C] disabled:opacity-50 cursor-pointer"
                            >
                              {isRefunding ? 'Refunding…' : 'Confirm Refund'}
                            </button>
                            <button
                              onClick={() => setRefundConfirm(false)}
                              disabled={isRefunding}
                              className="px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider border border-[#E8D5A8]/30 text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-50 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setRefundError(null);
                            setRefundConfirm(true);
                          }}
                          className="w-full px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider bg-[#F05A7E]/10 text-[#F05A7E] border border-[#F05A7E]/30 hover:bg-[#F05A7E]/20 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Issue Refund</span>
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Shipment & courier tracking.
                The sync button is a POST. GET on the same path is strictly
                read-only — it used to reconcile as a side effect, so a browser
                prefetch or a retried timeout could advance an order and mark a
                COD order PAID. Reconciling is a deliberate act now, and an
                audited one. */}
            {selectedOrder.shipment || selectedOrder.trackingNumber ? (
              <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 space-y-3 text-xs">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B]">Shipment</h3>

                <div className="space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B6B6B]">Courier</span>
                    <span className="text-[#FAF9F6]">
                      {selectedOrder.shipment?.courierName || selectedOrder.courierPartner || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B6B6B]">AWB</span>
                    <span className="text-[#FAF9F6] font-mono text-[10.5px] truncate">
                      {selectedOrder.shipment?.awbCode || selectedOrder.trackingNumber || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B6B6B]">Shipping status</span>
                    <span className="text-[#FAF9F6]">{selectedOrder.shipment?.status || selectedOrder.shippingStatus || '—'}</span>
                  </div>
                  {selectedOrder.shipment?.isCod && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#6B6B6B]">COD</span>
                      <span className="text-[#C9972B]">Collect on delivery</span>
                    </div>
                  )}
                  {/* The courier's own failure, surfaced rather than swallowed —
                      a booking that half-succeeded says so here. */}
                  {selectedOrder.shipment?.lastError && (
                    <p className="text-[#F05A7E] text-[10.5px] pt-1">{selectedOrder.shipment.lastError}</p>
                  )}
                </div>

                <div className="pt-2 border-t border-[#E8D5A8]/10 space-y-2">
                  <button
                    onClick={handleSyncTracking}
                    disabled={isSyncing}
                    className="w-full px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider bg-[#C9972B] text-[#0B0B0B] hover:bg-[#E3B84B] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing…' : 'Sync with courier'}</span>
                  </button>
                  <p className="text-[10px] text-[#6B6B6B]">
                    Fetches the courier's latest scans and applies them to this order.
                  </p>

                  {syncError && (
                    <div className="flex items-start gap-1.5 text-[#F05A7E] text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{syncError}</span>
                    </div>
                  )}

                  {/* Only ever what the courier actually returned. */}
                  {syncResult && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#6B6B6B]">Courier reports</span>
                        <span className="text-[#FAF9F6]">{syncResult.providerStatus || 'no status'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#6B6B6B]">Mapped to</span>
                        <span className="text-[#FAF9F6]">
                          {/* null means the provider sent a pair this build does
                              not recognise. Recorded, never guessed at. */}
                          {syncResult.status || 'unrecognised — recorded only'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#6B6B6B]">New scans</span>
                        <span className="text-[#FAF9F6]">{syncResult.newScans}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#6B6B6B]">Order moved</span>
                        <span className={syncResult.orderStatusChanged ? 'text-[#4ADE80]' : 'text-[#6B6B6B]'}>
                          {syncResult.orderStatusChanged ? 'yes' : 'no change'}
                        </span>
                      </div>

                      {syncResult.events && syncResult.events.length > 0 && (
                        <div className="pt-1.5 space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-[#6B6B6B]">Courier Scans</p>
                          {syncResult.events.slice(0, 8).map((ev, idx) => (
                            <div key={idx} className="text-[10.5px]">
                              <span className="text-[#FAF9F6]">{ev.status}</span>
                              {ev.note && <span className="text-[#6B6B6B]"> — {ev.note}</span>}
                              <span className="text-[#6B6B6B]"> · {formatDateTime(ev.timestamp)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Status Update */}
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B]">Update Status</h3>
              {nextStatusOptions(selectedOrder).length === 0 ? (
                <p className="text-xs text-[#6B6B6B]">This order has reached a final state.</p>
              ) : (
                <>
                  <textarea
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Optional note for this status change..."
                    rows={2}
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                  {statusError && (
                    <div className="flex items-center gap-1.5 text-[#F05A7E] text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{statusError}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {nextStatusOptions(selectedOrder).map((status) => (
                      <button
                        key={status}
                        disabled={isUpdatingStatus}
                        onClick={() => handleUpdateStatus(status)}
                        className={`px-3.5 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                          status === 'CANCELLED'
                            ? 'bg-[#F05A7E]/10 text-[#F05A7E] border border-[#F05A7E]/30 hover:bg-[#F05A7E]/20'
                            : 'bg-[#C9972B] text-[#0B0B0B] hover:bg-[#E3B84B]'
                        }`}
                      >
                        {status === 'CANCELLED' ? <AlertCircle className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                        <span>{isUpdatingStatus ? 'Updating…' : `Mark ${status.replace(/_/g, ' ')}`}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // List / Tabs View
  // ==========================================
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Order Management</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">Track fulfillment, advance dispatch status, and process return requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (tab === 'orders' ? fetchOrders() : fetchReturns())}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#171717] hover:bg-[#0B0B0B] border border-[#E8D5A8]/30 text-[#FAF9F6] text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C9972B] ${isLoadingOrders || isLoadingReturns ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[#E8D5A8]/15 pb-3">
        <button
          onClick={() => setTab('orders')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
            tab === 'orders' ? 'bg-[#C9972B] text-[#0B0B0B]' : 'bg-[#171717] text-[#6B6B6B] hover:text-[#FAF9F6]'
          }`}
        >
          Orders
        </button>
        <button
          onClick={() => setTab('returns')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
            tab === 'returns' ? 'bg-[#C9972B] text-[#0B0B0B]' : 'bg-[#171717] text-[#6B6B6B] hover:text-[#FAF9F6]'
          }`}
        >
          Returns {returns.length > 0 ? `(${returns.length})` : ''}
        </button>
      </div>

      {tab === 'orders' && (
        <>
          <div className="flex flex-wrap gap-2">
            {ALL_ORDER_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                  statusFilter === s ? 'bg-[#C9972B] text-[#0B0B0B]' : 'bg-[#171717] text-[#6B6B6B] border border-[#E8D5A8]/20 hover:text-[#FAF9F6]'
                }`}
              >
                {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/20 overflow-hidden">
            {isLoadingOrders ? (
              <div className="p-10 text-center text-xs text-[#6B6B6B]">Loading orders…</div>
            ) : orders.length === 0 ? (
              <div className="p-10 text-center text-xs text-[#6B6B6B] flex flex-col items-center gap-2">
                <Package className="w-8 h-8 text-[#6B6B6B]" />
                <span>No orders found for this filter.</span>
              </div>
            ) : (
              <div className="divide-y divide-[#0B0B0B]">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="w-full p-4 flex items-center justify-between gap-4 hover:bg-[#0B0B0B] transition-colors cursor-pointer text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#FAF9F6]">#{order.orderNumber}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                        {order.deliveryAddress?.name} • {order.items.length} item{order.items.length === 1 ? '' : 's'} •{' '}
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm font-mono text-[#FAF9F6] flex-shrink-0">₹{order.total}</span>
                  </button>
                ))}
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
              <span className="text-xs text-[#6B6B6B]">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-2 rounded-lg bg-[#171717] border border-[#E8D5A8]/20 text-[#FAF9F6] disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'returns' && (
        <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/20 overflow-hidden">
          {isLoadingReturns ? (
            <div className="p-10 text-center text-xs text-[#6B6B6B]">Loading return requests…</div>
          ) : returns.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#6B6B6B] flex flex-col items-center gap-2">
              <RotateCcw className="w-8 h-8 text-[#6B6B6B]" />
              <span>No return requests yet.</span>
            </div>
          ) : (
            <div className="divide-y divide-[#0B0B0B]">
              {returns.map((ret) => (
                <div key={ret.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#FAF9F6]">Order #{ret.orderNumber}</span>
                        <StatusBadge status={ret.status} />
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">{ret.productName} • Reason: {ret.reason}</p>
                      {ret.comment && <p className="text-[11px] text-[#6B6B6B] mt-1 italic">"{ret.comment}"</p>}
                      <p className="text-[10px] text-[#6B6B6B] mt-1">
                        Requested {formatDateTime(ret.requestedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {RETURN_STATUSES.map((status) => (
                      <button
                        key={status}
                        disabled={returnUpdatingId === ret.id || ret.status === status}
                        onClick={() => handleUpdateReturnStatus(ret.id, status)}
                        className={`px-3 py-1.5 rounded-lg text-[10.5px] font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1 ${
                          ret.status === status
                            ? 'bg-[#C9972B] text-[#0B0B0B]'
                            : 'bg-[#0B0B0B] text-[#6B6B6B] border border-[#E8D5A8]/20 hover:text-[#FAF9F6]'
                        }`}
                      >
                        {ret.status === status && <Check className="w-3 h-3" />}
                        <span>{status.replace(/_/g, ' ')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
