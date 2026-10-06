/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Package, Truck, RotateCcw, FileDown, Headphones, Star, XCircle, Eye, RefreshCw } from 'lucide-react';
import { Order, OrderItem, Product, ReviewMedia, Shade } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { useCommerce } from '../../../context/CommerceContext';
import {
  AccountButton,
  AccountEmpty,
  AccountLoading,
  AccountSectionHeader,
  StatusBadge,
  formatDate,
  formatMoney,
} from '../AccountUI';
import { ORDER_FILTERS, OrderFilterId, canCancel, canReturn, canReview, matchesOrderFilter, orderStatusTone } from './orderStatus';
import { getPaymentMethodLabel, getPaymentStatusLabel } from '@glamirk/shared/utils/paymentDisplay';
import { CancelOrderModal, ReturnRequestModal, WriteReviewModal } from './OrderActionModals';
import { ProductImage } from '../../product/ProductImage';

interface OrdersSectionProps {
  orders: Order[];
  isLoading: boolean;
  allProducts: Product[];
  onOpenOrder: (orderId: string) => void;
  onTrackOrder: (orderId: string) => void;
  onExploreShop: () => void;
  onOpenHelp: (orderId: string) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onCancelOrder: (orderId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onSubmitReturn: (orderId: string, productId: string, reason: string, comment?: string) => Promise<{ success: boolean; error?: string }>;
  onSubmitReview: (
    productId: string,
    rating: number,
    title: string,
    comment: string,
    media?: ReviewMedia[]
  ) => Promise<{ success: boolean; error?: string }>;
  showToast: (message: string) => void;
}

export const OrdersSection: React.FC<OrdersSectionProps> = ({
  orders,
  isLoading,
  allProducts,
  onOpenOrder,
  onTrackOrder,
  onExploreShop,
  onOpenHelp,
  onAddToBag,
  onCancelOrder,
  onSubmitReturn,
  onSubmitReview,
  showToast,
}) => {
  const { openInvoice } = useAccount();
  const { reorder } = useCommerce();
  const [filter, setFilter] = useState<OrderFilterId>('ALL');
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [returnTarget, setReturnTarget] = useState<Order | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ order: Order; item: OrderItem } | null>(null);
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => orders.filter((order) => matchesOrderFilter(order, filter)), [orders, filter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of ORDER_FILTERS) {
      map[f.id] = orders.filter((order) => matchesOrderFilter(order, f.id)).length;
    }
    return map;
  }, [orders]);

  const handleBuyAgain = (item: OrderItem) => {
    // The catalogue is live, so an item from an old order may since have been
    // discontinued — say so rather than silently adding nothing.
    const product = allProducts.find((p) => p.id === item.productId);
    if (!product) {
      showToast('This product is no longer available.');
      return;
    }
    const shade = item.shade ? product.shades?.find((s) => s.id === item.shade!.id) : undefined;
    onAddToBag(product, shade || product.shades?.[0], item.size, item.quantity);
  };

  const handleInvoice = async (order: Order) => {
    setInvoiceBusyId(order.id);
    const res = await openInvoice(order.id, order.orderNumber);
    setInvoiceBusyId(null);
    if (!res.success) showToast(res.error || 'Could not generate this invoice.');
  };

  const handleReorder = async (order: Order) => {
    setReorderBusyId(order.id);
    const res = await reorder(order.id);
    setReorderBusyId(null);

    if (!res.success) {
      showToast(res.error || 'Could not add these items to your bag.');
      return;
    }

    const missing = res.unavailable || [];
    if (res.addedCount === 0) {
      showToast('Nothing from this order is available to buy right now.');
    } else if (missing.length > 0) {
      // Naming the first missing item is more use than a bare count — it
      // tells them what to go looking for.
      showToast(
        missing.length === 1
          ? `Added to bag — ${missing[0].productName} is ${missing[0].reason}.`
          : `Added to bag — ${missing.length} items are unavailable.`
      );
    } else {
      showToast(`${res.addedCount} ${res.addedCount === 1 ? 'item' : 'items'} added to your bag`);
    }
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Purchases" title="My Orders" />
        <AccountLoading label="Loading your orders" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Purchases"
        title="My Orders"
        description="Track, return, reorder or get help with anything you have bought from Glamirk."
      />

      {orders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {ORDER_FILTERS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`shrink-0 px-3.5 py-2 text-[10.5px] font-semibold tracking-[0.12em] uppercase rounded-full border transition-colors cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#0B0B0B] text-white border-[#0B0B0B]'
                  : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:text-[#121212] hover:border-[#C9972B]'
              }`}
            >
              {tab.label}
              {counts[tab.id] > 0 && <span className="ml-1.5 opacity-70">{counts[tab.id]}</span>}
            </button>
          ))}
        </div>
      )}

      {orders.length === 0 ? (
        <AccountEmpty
          icon={Package}
          title="You haven't placed an order yet."
          description="Once you order, every purchase will appear here with tracking, invoices and easy reordering."
          actionLabel="Start Shopping"
          onAction={onExploreShop}
        />
      ) : filtered.length === 0 ? (
        <AccountEmpty
          icon={Package}
          title="No orders in this category"
          description="Try a different filter to see the rest of your order history."
          actionLabel="Show all orders"
          onAction={() => setFilter('ALL')}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => (
            <article key={order.id} className="bg-white border border-[#E8D5A8] rounded-xl overflow-hidden">
              {/* Header */}
              <div className="px-4 sm:px-5 py-4 bg-[#FAF9F6] border-b border-[#E8D5A8] flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-serif text-base text-[#121212]">#{order.orderNumber}</span>
                    <StatusBadge status={order.status} tone={orderStatusTone(order.status)} />
                  </div>
                  <p className="text-[11.5px] text-[#6B6B6B] mt-1">
                    Placed {formatDate(order.createdAt)} · {getPaymentMethodLabel(order.payment.method)} ·{' '}
                    {getPaymentStatusLabel(order.payment.status)}
                  </p>
                </div>
                <span className="font-serif text-base text-[#121212] shrink-0">{formatMoney(order.total)}</span>
              </div>

              {/* Items */}
              <ul className="divide-y divide-[#F1EBDD]">
                {order.items.map((item, idx) => (
                  <li key={`${item.productId}-${idx}`} className="px-4 sm:px-5 py-4 flex gap-3.5">
                    <ProductImage preset="thumb"
                      src={item.productImage}
                      alt=""
                      className="w-14 h-16 object-cover border border-[#E8D5A8] rounded shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-serif text-sm text-[#121212] leading-snug">{item.productName}</h3>
                      <p className="text-[11.5px] text-[#6B6B6B] mt-0.5">
                        {item.shade ? `Shade: ${item.shade.name}` : item.size ? `Size: ${item.size}` : 'Standard'} · Qty{' '}
                        {item.quantity} · {formatMoney(item.price)}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        <button
                          onClick={() => handleBuyAgain(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#E8D5A8] rounded-full text-[10px] font-semibold tracking-[0.1em] uppercase text-[#121212] hover:border-[#C9972B] transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3 text-[#C9972B]" />
                          Buy Again
                        </button>
                        {canReview(order) && (
                          <button
                            onClick={() => setReviewTarget({ order, item })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#E8D5A8] rounded-full text-[10px] font-semibold tracking-[0.1em] uppercase text-[#121212] hover:border-[#C9972B] transition-colors cursor-pointer"
                          >
                            <Star className="w-3 h-3 text-[#C9972B]" />
                            Rate Product
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Order-level actions. Cancel and Return only render when the
                  order's status actually permits them, matching the server. */}
              <div className="px-4 sm:px-5 py-3.5 border-t border-[#E8D5A8] bg-[#FDFCF9] flex flex-wrap gap-2">
                <AccountButton variant="secondary" onClick={() => onOpenOrder(order.id)}>
                  <Eye className="w-3.5 h-3.5" />
                  View Order
                </AccountButton>
                <AccountButton variant="ghost" onClick={() => onTrackOrder(order.id)}>
                  <Truck className="w-3.5 h-3.5" />
                  Track Order
                </AccountButton>
                <AccountButton variant="ghost" loading={invoiceBusyId === order.id} onClick={() => handleInvoice(order)}>
                  <FileDown className="w-3.5 h-3.5" />
                  Invoice
                </AccountButton>
                <AccountButton
                  variant="ghost"
                  loading={reorderBusyId === order.id}
                  onClick={() => handleReorder(order)}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reorder
                </AccountButton>
                <AccountButton variant="ghost" onClick={() => onOpenHelp(order.id)}>
                  <Headphones className="w-3.5 h-3.5" />
                  Get Help
                </AccountButton>
                {canReturn(order) && (
                  <AccountButton variant="ghost" onClick={() => setReturnTarget(order)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Return / Replace
                  </AccountButton>
                )}
                {canCancel(order) && (
                  <AccountButton variant="danger" onClick={() => setCancelTarget(order)}>
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel Order
                  </AccountButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <CancelOrderModal
        order={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={onCancelOrder}
        showToast={showToast}
      />
      <ReturnRequestModal
        order={returnTarget}
        onClose={() => setReturnTarget(null)}
        onConfirm={onSubmitReturn}
        showToast={showToast}
      />
      <WriteReviewModal
        target={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onConfirm={onSubmitReview}
        showToast={showToast}
      />
    </div>
  );
};
