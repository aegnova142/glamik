/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Order, CANCELLABLE_ORDER_STATUSES, Shade } from '../../types';
import { formatDateTime } from '../../utils/dateFormat';
import { getPaymentMethodLabel, getPaymentStatusLabel } from '../../utils/paymentDisplay';
import {
  ArrowLeft,
  Truck,
  ShoppingBag,
  MapPin,
  CreditCard,
  RotateCcw,
  Download,
  X,
  Loader2,
  LogIn,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Found a better price',
  'Delivery taking too long',
  'Changed my mind',
  'Other',
];

const RETURN_REASONS = [
  'Damaged in transit / seal broken',
  'Incorrect shade or variant received',
  'Item defective or missing',
  'No longer needed',
  'Other',
];

function escapeHtml(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

interface OrderDetailPageProps {
  orders: Order[];
  orderId?: string;
  /** True while orders are still being fetched — this page is commonly
   * reached by direct URL/refresh/new tab/shared link/another device, all
   * of which can mount it before that fetch resolves. Without this it would
   * flash "Order Not Found" even when the order genuinely exists. */
  isLoading?: boolean;
  /** Orders are per-account; a logged-out visitor has nothing to fetch. */
  isLoggedIn?: boolean;
  onSignIn?: () => void;
  onBack: () => void;
  onTrackOrder: (orderId: string) => void;
  onReorder: (productId: string, shade?: Shade, size?: string) => void;
  onCancelOrder: (orderId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onSubmitReturn: (orderId: string, productId: string, reason: string, comment?: string) => Promise<{ success: boolean; error?: string }>;
  onExploreShop: () => void;
}

export const OrderDetailPage: React.FC<OrderDetailPageProps> = ({
  orders,
  orderId,
  isLoading = false,
  isLoggedIn = true,
  onSignIn,
  onBack,
  onTrackOrder,
  onReorder,
  onCancelOrder,
  onSubmitReturn,
  onExploreShop,
}) => {
  const order = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState(CANCEL_REASONS[0]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedReturnReason, setSelectedReturnReason] = useState(RETURN_REASONS[0]);
  const [returnComment, setReturnComment] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSubmitted, setReturnSubmitted] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#FAF9F6] py-16">
        <div className="flex flex-col items-center gap-3 text-[#6B6B6B]">
          <Loader2 className="h-8 w-8 animate-spin text-[#C9972B]" />
          <p className="text-xs uppercase tracking-wider">Loading your order...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="bg-[#FAF9F6] min-h-screen py-16 sm:py-24 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-[#0B0B0B] flex items-center justify-center mx-auto text-[#C9972B]">
            <LogIn className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl text-[#121212]">Sign In to View This Order</h1>
          <p className="text-xs text-[#6B6B6B]">
            Order details are tied to your Glamirk account. Sign in to view this order.
          </p>
          <button
            onClick={onSignIn}
            className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer"
          >
            SIGN IN
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bg-[#FAF9F6] min-h-screen py-16 sm:py-24 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-white border border-[#E8D5A8] flex items-center justify-center mx-auto text-[#C9972B]">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl text-[#121212]">Order Not Found</h1>
          <p className="text-xs text-[#6B6B6B]">
            We couldn't find that order. It may have been removed, belong to a different account, or the link may be incorrect.
          </p>
          <button
            onClick={onExploreShop}
            className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer"
          >
            EXPLORE THE SHOP
          </button>
        </div>
      </div>
    );
  }

  const canCancel = CANCELLABLE_ORDER_STATUSES.includes(order.status);
  const isDelivered = order.status === 'DELIVERED';

  const handleConfirmCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);
    const res = await onCancelOrder(order.id, selectedReason);
    setIsCancelling(false);
    if (res.success) {
      setIsCancelModalOpen(false);
    } else {
      setCancelError(res.error || 'Could not cancel this order. Please try again.');
    }
  };

  const handleConfirmReturn = async () => {
    setIsSubmittingReturn(true);
    setReturnError(null);
    const primaryItem = order.items[0];
    const res = await onSubmitReturn(order.id, primaryItem.productId, selectedReturnReason, returnComment.trim() || undefined);
    setIsSubmittingReturn(false);
    if (res.success) {
      setReturnSubmitted(true);
      setTimeout(() => {
        setIsReturnModalOpen(false);
        setReturnSubmitted(false);
        setReturnComment('');
      }, 1400);
    } else {
      setReturnError(res.error || 'Could not submit your return request. Please try again.');
    }
  };

  // Builds a self-contained printable receipt in a new tab and triggers the
  // browser print dialog — no PDF library, no server round-trip.
  const handleDownloadInvoice = () => {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;

    const itemRows = order.items
      .map(
        (item) => `
        <tr>
          <td>${escapeHtml(item.productName)}${item.shade ? ' — ' + escapeHtml(item.shade.name) : item.size ? ' — ' + escapeHtml(item.size) : ''}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">₹${item.price}</td>
          <td style="text-align:right">₹${item.price * item.quantity}</td>
        </tr>`
      )
      .join('');

    win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Invoice - ${escapeHtml(order.orderNumber)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #121212; padding: 40px; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.05em; }
  .muted { color: #6B6B6B; font-size: 12px; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th, td { padding: 10px 8px; border-bottom: 1px solid #E8D5A8; font-size: 13px; text-align: left; }
  .totals { margin-top: 16px; width: 260px; margin-left: auto; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .grand { font-weight: bold; font-size: 15px; border-top: 1px solid #121212; margin-top: 6px; padding-top: 8px; }
  .section { margin-top: 24px; font-size: 13px; }
  .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #C9972B; margin: 0 0 4px; }
</style>
</head>
<body>
  <h1>GLAMIRK BEAUTY</h1>
  <p class="muted">Tax Invoice / Receipt</p>
  <div class="section">
    <h3>Order Details</h3>
    <p>Order #: ${escapeHtml(order.orderNumber)}<br/>
    Date: ${escapeHtml(formatDateTime(order.createdAt))}<br/>
    Payment Method: ${escapeHtml(getPaymentMethodLabel(order.payment.method))}<br/>
    Payment Status: ${escapeHtml(getPaymentStatusLabel(order.payment.status))}</p>
  </div>
  <div class="section">
    <h3>Billed To</h3>
    <p>${escapeHtml(order.deliveryAddress?.name)}<br/>
    ${escapeHtml(order.deliveryAddress?.addressLine1)}${order.deliveryAddress?.addressLine2 ? ', ' + escapeHtml(order.deliveryAddress.addressLine2) : ''}<br/>
    ${escapeHtml(order.deliveryAddress?.city)}, ${escapeHtml(order.deliveryAddress?.state)} - ${escapeHtml(order.deliveryAddress?.pinCode)}<br/>
    Phone: ${escapeHtml(order.deliveryAddress?.phone)}</p>
  </div>
  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>₹${order.subtotal}</span></div>
    ${order.discount > 0 ? `<div><span>Discount</span><span>-₹${order.discount}</span></div>` : ''}
    <div><span>Shipping</span><span>${order.shipping === 0 ? 'FREE' : '₹' + order.shipping}</span></div>
    <div class="grand"><span>Total Paid</span><span>₹${order.total}</span></div>
  </div>
  <p class="muted" style="margin-top:40px;">Thank you for shopping with Glamirk Beauty.</p>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="bg-[#FAF9F6] min-h-screen py-10 sm:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-xs text-[#6B6B6B] hover:text-[#121212] font-medium transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK TO MY GLAM</span>
        </button>

        <div className="mb-8 border-b border-[#E8D5A8] pb-4">
          <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            ORDER DETAILS
          </span>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="font-serif text-3xl sm:text-4xl text-[#121212]">
              #{order.orderNumber}
            </h1>
            <span className="px-2.5 py-1 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-widest uppercase">
              {order.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Placed on {formatDateTime(order.createdAt)}
          </p>
        </div>

        <div className="bg-white border border-[#E8D5A8] p-6 sm:p-8 space-y-8 shadow-xs">
          {/* Items */}
          <div className="space-y-3">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
              ITEMS IN THIS ORDER
            </span>
            <div className="divide-y divide-[#FAF9F6] border border-[#E8D5A8] bg-[#FAF9F6]">
              {order.items.map((item, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-12 h-14 object-cover bg-white border border-[#E8D5A8] flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h5 className="font-serif text-sm text-[#121212] truncate">{item.productName}</h5>
                      <p className="text-xs text-[#6B6B6B]">
                        {item.shade ? `Shade: ${item.shade.name}` : item.size ? `Size: ${item.size}` : ''} • Qty: {item.quantity}
                      </p>
                      <p className="text-xs text-[#121212] font-medium mt-0.5">₹{item.price * item.quantity}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onReorder(item.productId, item.shade, item.size)}
                    className="px-4 py-2 border border-[#0B0B0B] bg-white text-[#121212] text-[11px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer flex-shrink-0"
                  >
                    BUY AGAIN
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Address + Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 bg-[#FAF9F6] border border-[#E8D5A8] space-y-1.5 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] font-semibold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> DELIVERY ADDRESS
              </span>
              <p className="font-medium text-[#121212]">{order.deliveryAddress?.name}</p>
              <p className="text-[#6B6B6B]">{order.deliveryAddress?.addressLine1}</p>
              {order.deliveryAddress?.addressLine2 && (
                <p className="text-[#6B6B6B]">{order.deliveryAddress.addressLine2}</p>
              )}
              <p className="text-[#6B6B6B]">
                {order.deliveryAddress?.city}, {order.deliveryAddress?.state} - {order.deliveryAddress?.pinCode}
              </p>
              <p className="text-[#6B6B6B]">{order.deliveryAddress?.phone}</p>
            </div>

            <div className="p-5 bg-[#FAF9F6] border border-[#E8D5A8] space-y-1.5 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B] font-semibold flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> PAYMENT
              </span>
              <p className="font-medium text-[#121212]">{getPaymentMethodLabel(order.payment.method)}</p>
              <p className="text-[#6B6B6B]">Payment Status: {getPaymentStatusLabel(order.payment.status)}</p>
              <div className="pt-2 mt-2 border-t border-white space-y-1">
                <div className="flex justify-between text-[#6B6B6B]">
                  <span>Subtotal</span>
                  <span>₹{order.subtotal}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-[#6B6B6B]">
                    <span>Discount</span>
                    <span>-₹{order.discount}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#6B6B6B]">
                  <span>Shipping</span>
                  <span>{order.shipping === 0 ? 'FREE' : `₹${order.shipping}`}</span>
                </div>
                <div className="flex justify-between font-semibold text-[#121212] pt-1">
                  <span>Total Paid</span>
                  <span>₹{order.total}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-[#E8D5A8]">
            <button
              onClick={() => onTrackOrder(order.id)}
              className="px-5 py-2.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex items-center gap-1.5 cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5 text-[#C9972B]" />
              <span>TRACK ORDER</span>
            </button>

            {canCancel && (
              <button
                onClick={() => setIsCancelModalOpen(true)}
                className="px-5 py-2.5 border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#FAF9F6] cursor-pointer flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>CANCEL ORDER</span>
              </button>
            )}

            <button
              onClick={handleDownloadInvoice}
              className="px-5 py-2.5 border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#FAF9F6] cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD INVOICE</span>
            </button>

            {isDelivered && (
              <button
                onClick={() => {
                  setReturnError(null);
                  setIsReturnModalOpen(true);
                }}
                className="px-5 py-2.5 border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#FAF9F6] cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>REQUEST RETURN</span>
              </button>
            )}
          </div>

          {/* Status history */}
          {order.timeline?.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-[#E8D5A8]">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
                STATUS HISTORY
              </span>
              <div className="space-y-2">
                {order.timeline.map((event, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-4 text-xs">
                    <div>
                      <span className="font-medium text-[#121212]">{event.status.replace(/_/g, ' ')}</span>
                      <p className="text-[#6B6B6B]">{event.note}</p>
                    </div>
                    <span className="text-[#6B6B6B] flex-shrink-0">
                      {formatDateTime(event.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cancel confirmation modal */}
      <AnimatePresence>
        {isCancelModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
            onClick={() => !isCancelling && setIsCancelModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-md w-full p-6 space-y-5 border border-[#E8D5A8]"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-xl text-[#121212]">Cancel Order</h3>
                <button
                  onClick={() => setIsCancelModalOpen(false)}
                  className="text-[#6B6B6B] hover:text-[#121212] cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[#6B6B6B]">
                Why would you like to cancel order #{order.orderNumber}? Any reserved stock will be released back to the catalog.
              </p>
              <div className="space-y-2">
                {CANCEL_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className="flex items-center gap-2.5 text-xs text-[#121212] cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      value={reason}
                      checked={selectedReason === reason}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-[#0B0B0B]"
                    />
                    {reason}
                  </label>
                ))}
              </div>
              {cancelError && <p className="text-xs text-red-600">{cancelError}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsCancelModalOpen(false)}
                  disabled={isCancelling}
                  className="flex-1 px-4 py-2.5 border border-[#E8D5A8] text-[#6B6B6B] text-xs font-semibold tracking-wider uppercase hover:bg-[#FAF9F6] cursor-pointer disabled:opacity-50"
                >
                  KEEP ORDER
                </button>
                <button
                  onClick={handleConfirmCancel}
                  disabled={isCancelling}
                  className="flex-1 px-4 py-2.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? 'CANCELLING…' : 'CONFIRM CANCEL'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Return request modal */}
      <AnimatePresence>
        {isReturnModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
            onClick={() => !isSubmittingReturn && setIsReturnModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-md w-full p-6 space-y-5 border border-[#E8D5A8]"
            >
              {returnSubmitted ? (
                <div className="py-6 text-center space-y-2">
                  <RotateCcw className="w-8 h-8 text-[#C9972B] mx-auto" />
                  <h3 className="font-serif text-xl text-[#121212]">Return Requested</h3>
                  <p className="text-xs text-[#6B6B6B]">We'll review your request and keep you updated.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-xl text-[#121212]">Request Return</h3>
                    <button
                      onClick={() => setIsReturnModalOpen(false)}
                      className="text-[#6B6B6B] hover:text-[#121212] cursor-pointer"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-[#6B6B6B]">
                    Why would you like to return an item from order #{order.orderNumber}?
                  </p>
                  <div className="space-y-2">
                    {RETURN_REASONS.map((reason) => (
                      <label key={reason} className="flex items-center gap-2.5 text-xs text-[#121212] cursor-pointer">
                        <input
                          type="radio"
                          name="return-reason"
                          value={reason}
                          checked={selectedReturnReason === reason}
                          onChange={() => setSelectedReturnReason(reason)}
                          className="accent-[#0B0B0B]"
                        />
                        {reason}
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={returnComment}
                    onChange={(e) => setReturnComment(e.target.value)}
                    placeholder="Additional details (optional)"
                    rows={2}
                    className="w-full p-2.5 text-xs bg-[#FAF9F6] border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden"
                  />
                  {returnError && <p className="text-xs text-red-600">{returnError}</p>}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setIsReturnModalOpen(false)}
                      disabled={isSubmittingReturn}
                      className="flex-1 px-4 py-2.5 border border-[#E8D5A8] text-[#6B6B6B] text-xs font-semibold tracking-wider uppercase hover:bg-[#FAF9F6] cursor-pointer disabled:opacity-50"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleConfirmReturn}
                      disabled={isSubmittingReturn}
                      className="flex-1 px-4 py-2.5 bg-[#0B0B0B] text-white text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingReturn ? 'SUBMITTING…' : 'SUBMIT REQUEST'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
