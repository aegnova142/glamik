/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Package, Truck, FileDown, RotateCcw, XCircle, Headphones, Check, Circle } from 'lucide-react';
import { Order, OrderItem, Product, Shade } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { ProductImage } from '../../product/ProductImage';
import {
  AccountButton,
  AccountCard,
  AccountEmpty,
  AccountLoading,
  StatusBadge,
  formatDateTime,
  formatMoney,
} from '../AccountUI';
import { buildProgressStages, canCancel, canReturn, orderStatusTone } from './orderStatus';
import { getPaymentMethodLabel, getPaymentStatusLabel } from '@glamirk/shared/utils/paymentDisplay';
import { CancelOrderModal, ReturnRequestModal } from './OrderActionModals';

interface OrderDetailSectionProps {
  order?: Order;
  isLoading: boolean;
  allProducts: Product[];
  onTrackOrder: (orderId: string) => void;
  onBackToOrders: () => void;
  onOpenHelp: (orderId: string) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onCancelOrder: (orderId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onSubmitReturn: (orderId: string, productId: string, reason: string, comment?: string) => Promise<{ success: boolean; error?: string }>;
  showToast: (message: string) => void;
}

export const OrderDetailSection: React.FC<OrderDetailSectionProps> = ({
  order,
  isLoading,
  allProducts,
  onTrackOrder,
  onBackToOrders,
  onOpenHelp,
  onAddToBag,
  onCancelOrder,
  onSubmitReturn,
  showToast,
}) => {
  const { openInvoice } = useAccount();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  if (isLoading && !order) return <AccountLoading label="Loading this order" rows={2} />;

  if (!order) {
    return (
      <AccountEmpty
        icon={Package}
        title="Order not found"
        description="We couldn't find this order in your account. It may belong to a different account, or the link may be incorrect."
        actionLabel="Back to My Orders"
        onAction={onBackToOrders}
      />
    );
  }

  const address: any = order.deliveryAddress || {};
  const stages = buildProgressStages(order);

  const handleBuyAgain = (item: OrderItem) => {
    const product = allProducts.find((p) => p.id === item.productId);
    if (!product) {
      showToast('This product is no longer available.');
      return;
    }
    const shade = item.shade ? product.shades?.find((s) => s.id === item.shade!.id) : undefined;
    onAddToBag(product, shade || product.shades?.[0], item.size, item.quantity);
  };

  const handleInvoice = async () => {
    setInvoiceBusy(true);
    const res = await openInvoice(order.id, order.orderNumber);
    setInvoiceBusy(false);
    if (!res.success) showToast(res.error || 'Could not generate this invoice.');
  };

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <AccountCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-serif text-lg text-[#121212]">#{order.orderNumber}</span>
              <StatusBadge status={order.status} tone={orderStatusTone(order.status)} />
            </div>
            <p className="text-[11.5px] text-[#6B6B6B] mt-1">Placed {formatDateTime(order.createdAt)}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#6B6B6B] block">Order Total</span>
            <span className="font-serif text-xl text-[#121212]">{formatMoney(order.total)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#F1EBDD]">
          <AccountButton variant="secondary" onClick={() => onTrackOrder(order.id)}>
            <Truck className="w-3.5 h-3.5" />
            Track Order
          </AccountButton>
          <AccountButton variant="ghost" loading={invoiceBusy} onClick={handleInvoice}>
            <FileDown className="w-3.5 h-3.5" />
            Download Invoice
          </AccountButton>
          <AccountButton variant="ghost" onClick={() => onOpenHelp(order.id)}>
            <Headphones className="w-3.5 h-3.5" />
            Get Help
          </AccountButton>
          {canReturn(order) && (
            <AccountButton variant="ghost" onClick={() => setReturnOpen(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
              Return / Replace
            </AccountButton>
          )}
          {canCancel(order) && (
            <AccountButton variant="danger" onClick={() => setCancelOpen(true)}>
              <XCircle className="w-3.5 h-3.5" />
              Cancel Order
            </AccountButton>
          )}
        </div>
      </AccountCard>

      {/* Progress timeline. Only stages the order has genuinely reached are
          filled in — the rest render as pending rather than implying movement
          that hasn't been recorded. */}
      <AccountCard className="p-5">
        <h2 className="font-serif text-base text-[#121212] mb-5">Order Progress</h2>
        <ol className="space-y-0">
          {stages.map((stage, index) => (
            <li key={`${stage.status}-${index}`} className="flex gap-3.5 relative pb-6 last:pb-0">
              {index < stages.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute left-[11px] top-6 bottom-0 w-px ${stage.complete ? 'bg-[#C9972B]' : 'bg-[#E8D5A8]'}`}
                />
              )}
              <span
                className={`relative z-10 w-[23px] h-[23px] rounded-full flex items-center justify-center shrink-0 border ${
                  stage.complete ? 'bg-[#C9972B] border-[#C9972B] text-white' : 'bg-white border-[#E8D5A8] text-[#D6CEBC]'
                }`}
              >
                {stage.complete ? <Check className="w-3 h-3 stroke-[3]" /> : <Circle className="w-2 h-2 fill-current" />}
              </span>
              <div className="min-w-0 pt-0.5">
                <span className={`text-[13px] block ${stage.complete ? 'text-[#121212] font-semibold' : 'text-[#9C9689]'}`}>
                  {stage.label}
                </span>
                <span className="text-[11px] text-[#6B6B6B]">
                  {stage.reachedAt ? formatDateTime(stage.reachedAt) : 'Pending'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </AccountCard>

      {/* Items */}
      <AccountCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8D5A8]">
          <h2 className="font-serif text-base text-[#121212]">Items in this order</h2>
        </div>
        <ul className="divide-y divide-[#F1EBDD]">
          {order.items.map((item, idx) => (
            <li key={`${item.productId}-${idx}`} className="px-5 py-4 flex gap-4">
              <ProductImage src={item.productImage} alt="" className="w-16 h-20 object-cover border border-[#E8D5A8] rounded shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-sm text-[#121212]">{item.productName}</h3>
                <p className="text-[11.5px] text-[#6B6B6B] mt-0.5">
                  {item.shade ? `Shade: ${item.shade.name}` : item.size ? `Size: ${item.size}` : 'Standard'}
                </p>
                <p className="text-[11.5px] text-[#6B6B6B]">
                  Qty {item.quantity} × {formatMoney(item.price)}
                </p>
                <button
                  onClick={() => handleBuyAgain(item)}
                  className="mt-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#C9972B] hover:underline cursor-pointer"
                >
                  Buy Again
                </button>
              </div>
              <span className="font-serif text-sm text-[#121212] shrink-0">{formatMoney(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
      </AccountCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Payment summary */}
        <AccountCard className="p-5">
          <h2 className="font-serif text-base text-[#121212] mb-4">Payment Summary</h2>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-[#6B6B6B]">Subtotal</dt>
              <dd className="text-[#121212]">{formatMoney(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#6B6B6B]">Discount</dt>
                <dd className="text-[#2E7D32]">−{formatMoney(order.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-[#6B6B6B]">Shipping</dt>
              <dd className="text-[#121212]">{order.shipping > 0 ? formatMoney(order.shipping) : 'Free'}</dd>
            </div>
            {/* Tax is only listed when the order actually carries one — the
                store's prices are tax-inclusive, so showing a ₹0 GST line
                would be misleading. */}
            {order.tax > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#6B6B6B]">Tax / GST</dt>
                <dd className="text-[#121212]">{formatMoney(order.tax)}</dd>
              </div>
            )}
            <div className="flex justify-between pt-3 border-t border-[#E8D5A8] font-semibold">
              <dt className="text-[#121212]">Total Paid</dt>
              <dd className="font-serif text-base text-[#121212]">{formatMoney(order.total)}</dd>
            </div>
          </dl>
          <div className="mt-4 pt-4 border-t border-[#F1EBDD] space-y-1 text-[11.5px] text-[#6B6B6B]">
            <p>Payment method: {getPaymentMethodLabel(order.payment.method)}</p>
            <p>Payment status: {getPaymentStatusLabel(order.payment.status)}</p>
            {order.discount > 0 && <p className="text-[#2E7D32]">Prices are inclusive of all applicable taxes.</p>}
          </div>
        </AccountCard>

        {/* Delivery */}
        <AccountCard className="p-5">
          <h2 className="font-serif text-base text-[#121212] mb-4">Delivery Address</h2>
          {address?.addressLine1 ? (
            <address className="not-italic text-[13px] text-[#121212] leading-relaxed space-y-0.5">
              <p className="font-semibold">{address.name}</p>
              <p className="text-[#6B6B6B]">
                {address.addressLine1}
                {address.addressLine2 ? `, ${address.addressLine2}` : ''}
              </p>
              {address.area && <p className="text-[#6B6B6B]">{address.area}</p>}
              <p className="text-[#6B6B6B]">
                {address.city}, {address.state} — {address.pinCode}
              </p>
              {address.landmark && <p className="text-[#6B6B6B]">Landmark: {address.landmark}</p>}
              <p className="text-[#6B6B6B] pt-2">{address.phone}</p>
              {address.email && <p className="text-[#6B6B6B]">{address.email}</p>}
            </address>
          ) : (
            <p className="text-xs text-[#6B6B6B]">No delivery address was recorded for this order.</p>
          )}
        </AccountCard>
      </div>

      <CancelOrderModal
        order={cancelOpen ? order : null}
        onClose={() => setCancelOpen(false)}
        onConfirm={onCancelOrder}
        showToast={showToast}
      />
      <ReturnRequestModal
        order={returnOpen ? order : null}
        onClose={() => setReturnOpen(false)}
        onConfirm={onSubmitReturn}
        showToast={showToast}
      />
    </div>
  );
};
