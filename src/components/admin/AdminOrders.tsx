/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/cmsClient';
import { formatDate, formatDateTime } from '../../utils/dateFormat';
import { Order, OrderStatus, ReturnRequest, ORDER_STATUS_SEQUENCE, CANCELLABLE_ORDER_STATUSES, RETURN_STATUSES } from '../../types';
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

const ALL_ORDER_STATUSES: (OrderStatus | 'ALL')[] = ['ALL', ...ORDER_STATUS_SEQUENCE, 'CANCELLED', 'RETURN_REQUESTED'];

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

  const nextStatusOptions = (order: Order): OrderStatus[] => {
    const idx = ORDER_STATUS_SEQUENCE.indexOf(order.status);
    const options: OrderStatus[] = [];
    if (idx !== -1 && idx < ORDER_STATUS_SEQUENCE.length - 1) options.push(ORDER_STATUS_SEQUENCE[idx + 1]);
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
                      <img src={item.productImage} alt={item.productName} className="w-11 h-13 object-cover rounded border border-[#E8D5A8]/20" />
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

            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 space-y-1.5 text-xs">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">Payment</h3>
              <p className="text-[#FAF9F6] font-medium uppercase">{selectedOrder.payment.method}</p>
              <p className="text-[#6B6B6B]">Status: {selectedOrder.payment.status}</p>
            </div>

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
