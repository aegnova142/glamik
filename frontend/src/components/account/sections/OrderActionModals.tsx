/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star } from 'lucide-react';
import { Order, OrderItem } from '@glamirk/shared/types';
import { AccountButton, AccountFormMessage, AccountField, inputClass } from '../AccountUI';

// Shared modal chrome for the three order actions that need confirmation.
// Kept in one file because they share the same shell, the same submit/error
// handling, and are only ever used from the orders screens.

const ModalShell: React.FC<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, subtitle, onClose, children }) => (
  <AnimatePresence>
    {open && (
      <div
        className="fixed inset-0 z-50 bg-[#0B0B0B]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="w-full sm:max-w-lg bg-white border border-[#E8D5A8] rounded-t-2xl sm:rounded-2xl shadow-2xl relative my-0 sm:my-8"
        >
          <div className="px-5 sm:px-7 py-5 border-b border-[#E8D5A8] pr-14">
            <h2 className="font-serif text-xl text-[#121212]">{title}</h2>
            {subtitle && <p className="text-[11.5px] text-[#6B6B6B] mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 text-[#6B6B6B] hover:text-[#121212] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="px-5 sm:px-7 py-6">{children}</div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// ==========================================
// CANCEL ORDER
// ==========================================

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Found a better price elsewhere',
  'Delivery is taking too long',
  'Want to change the shade or size',
  'Other',
];

export const CancelOrderModal: React.FC<{
  order: Order | null;
  onClose: () => void;
  onConfirm: (orderId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  showToast: (message: string) => void;
}> = ({ order, onClose, onConfirm, showToast }) => {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setReason(CANCEL_REASONS[0]);
      setDetail('');
      setError(null);
    }
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSubmitting(true);
    setError(null);
    const fullReason = reason === 'Other' && detail.trim() ? detail.trim() : reason;
    const res = await onConfirm(order.id, fullReason);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Could not cancel this order.');
      return;
    }
    showToast(`Order #${order.orderNumber} has been cancelled.`);
    onClose();
  };

  return (
    <ModalShell
      open={!!order}
      title="Cancel this order?"
      subtitle={order ? `Order #${order.orderNumber}` : undefined}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-[#6B6B6B] leading-relaxed bg-[#FAF9F6] border border-[#E8D5A8] rounded-lg p-3.5">
          Cancelling releases the reserved stock and stops the order from being dispatched. This cannot be undone — you
          would need to place a new order.
        </p>

        <AccountField label="Why are you cancelling?" htmlFor="cancel-reason" required>
          <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </AccountField>

        {reason === 'Other' && (
          <AccountField label="Tell us more" htmlFor="cancel-detail">
            <textarea
              id="cancel-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              maxLength={300}
              className={inputClass}
              placeholder="Optional"
            />
          </AccountField>
        )}

        <AccountFormMessage tone="error" message={error} />

        <div className="flex flex-wrap gap-3 pt-1">
          <AccountButton type="submit" variant="danger" loading={submitting}>
            Cancel Order
          </AccountButton>
          <AccountButton variant="ghost" onClick={onClose} disabled={submitting}>
            Keep Order
          </AccountButton>
        </div>
      </form>
    </ModalShell>
  );
};

// ==========================================
// RETURN / REPLACE
// ==========================================

const RETURN_REASONS = [
  'Damaged in transit',
  'Wrong product delivered',
  'Wrong shade or size',
  'Product quality not as expected',
  'Missing item from the order',
  'Other',
];

export const ReturnRequestModal: React.FC<{
  order: Order | null;
  onClose: () => void;
  onConfirm: (orderId: string, productId: string, reason: string, comment?: string) => Promise<{ success: boolean; error?: string }>;
  showToast: (message: string) => void;
}> = ({ order, onClose, onConfirm, showToast }) => {
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      // Pre-selecting the first item only makes sense per-order, so this is
      // reset every time the modal opens against a different one.
      setProductId(order.items[0]?.productId || '');
      setReason(RETURN_REASONS[0]);
      setComment('');
      setError(null);
    }
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !productId) return;
    setSubmitting(true);
    setError(null);
    const res = await onConfirm(order.id, productId, reason, comment.trim() || undefined);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Could not submit your return request.');
      return;
    }
    showToast('Your return request has been submitted.');
    onClose();
  };

  return (
    <ModalShell
      open={!!order}
      title="Request a return or replacement"
      subtitle={order ? `Order #${order.orderNumber}` : undefined}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <AccountField label="Which item?" htmlFor="return-product" required>
          <select id="return-product" value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
            {(order?.items || []).map((item) => (
              <option key={item.productId} value={item.productId}>
                {item.productName}
                {item.shade ? ` — ${item.shade.name}` : item.size ? ` — ${item.size}` : ''}
              </option>
            ))}
          </select>
        </AccountField>

        <AccountField label="Reason" htmlFor="return-reason" required>
          <select id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            {RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </AccountField>

        <AccountField label="Anything else we should know?" htmlFor="return-comment">
          <textarea
            id="return-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
            className={inputClass}
            placeholder="Optional — the more detail, the faster we can resolve it."
          />
        </AccountField>

        <AccountFormMessage tone="error" message={error} />

        <div className="flex flex-wrap gap-3 pt-1">
          <AccountButton type="submit" loading={submitting} disabled={!productId}>
            Submit Request
          </AccountButton>
          <AccountButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </AccountButton>
        </div>
      </form>
    </ModalShell>
  );
};

// ==========================================
// WRITE / EDIT A REVIEW
// ==========================================

export const WriteReviewModal: React.FC<{
  target: { order: Order; item: OrderItem } | { productId: string; productName: string } | null;
  initialRating?: number;
  initialTitle?: string;
  initialComment?: string;
  onClose: () => void;
  onConfirm: (productId: string, rating: number, title: string, comment: string) => Promise<{ success: boolean; error?: string }>;
  showToast: (message: string) => void;
}> = ({ target, initialRating = 5, initialTitle = '', initialComment = '', onClose, onConfirm, showToast }) => {
  const productId = target ? ('item' in target ? target.item.productId : target.productId) : '';
  const productName = target ? ('item' in target ? target.item.productName : target.productName) : '';

  const [rating, setRating] = useState(initialRating);
  const [title, setTitle] = useState(initialTitle);
  const [comment, setComment] = useState(initialComment);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setRating(initialRating);
      setTitle(initialTitle);
      setComment(initialComment);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return;
    if (comment.trim().length < 5) {
      setError('Please write a little more about the product.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await onConfirm(productId, rating, title.trim(), comment.trim());
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Could not submit your review.');
      return;
    }
    showToast('Thank you — your review has been posted.');
    onClose();
  };

  return (
    <ModalShell open={!!target} title="Rate this product" subtitle={productName} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <AccountField label="Your rating" required>
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                onClick={() => setRating(value)}
                className="p-1 cursor-pointer"
              >
                <Star
                  className={`w-6 h-6 transition-colors ${
                    value <= rating ? 'fill-[#C9972B] text-[#C9972B]' : 'text-[#D6CEBC]'
                  }`}
                />
              </button>
            ))}
          </div>
        </AccountField>

        <AccountField label="Headline" htmlFor="review-title">
          <input
            id="review-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className={inputClass}
            placeholder="Sum it up in a few words"
          />
        </AccountField>

        <AccountField label="Your review" htmlFor="review-comment" required>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={1000}
            className={inputClass}
            placeholder="How did it wear? How was the shade match?"
          />
        </AccountField>

        <AccountFormMessage tone="error" message={error} />

        <div className="flex flex-wrap gap-3 pt-1">
          <AccountButton type="submit" loading={submitting}>
            Post Review
          </AccountButton>
          <AccountButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </AccountButton>
        </div>
      </form>
    </ModalShell>
  );
};
