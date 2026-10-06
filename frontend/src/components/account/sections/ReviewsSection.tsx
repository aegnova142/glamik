/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Star, Pencil, Trash2, BadgeCheck } from 'lucide-react';
import { Review, ReviewableProduct } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { ProductImage } from '../../product/ProductImage';
import {
  AccountButton,
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  AccountSectionHeader,
  formatDate,
} from '../AccountUI';
import { WriteReviewModal } from './OrderActionModals';

interface ReviewsSectionProps {
  onExploreShop: () => void;
  onSubmitReview: (productId: string, rating: number, title: string, comment: string) => Promise<{ success: boolean; error?: string }>;
  showToast: (message: string) => void;
}

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`w-3.5 h-3.5 ${n <= rating ? 'fill-[#C9972B] text-[#C9972B]' : 'text-[#D6CEBC]'}`} />
    ))}
  </span>
);

export const ReviewsSection: React.FC<ReviewsSectionProps> = ({ onExploreShop, onSubmitReview, showToast }) => {
  const { reviewableProducts, loadReviewableProducts, deleteReview } = useAccount();
  const [editing, setEditing] = useState<{ item: ReviewableProduct; review?: Review } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadReviewableProducts();
  }, [loadReviewableProducts]);

  const handleDelete = async (reviewId: string) => {
    setDeletingId(reviewId);
    const res = await deleteReview(reviewId);
    setDeletingId(null);
    if (res.success) {
      showToast('Review deleted');
      loadReviewableProducts(true);
    } else {
      showToast(res.error || 'Could not delete this review.');
    }
  };

  const handleSubmit = async (productId: string, rating: number, title: string, comment: string) => {
    const res = await onSubmitReview(productId, rating, title, comment);
    if (res.success) loadReviewableProducts(true);
    return res;
  };

  if (reviewableProducts.loading && !reviewableProducts.loaded) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Community" title="My Reviews" />
        <AccountLoading label="Loading your reviews" />
      </div>
    );
  }

  if (reviewableProducts.error && !reviewableProducts.data) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Community" title="My Reviews" />
        <AccountError message={reviewableProducts.error} onRetry={() => loadReviewableProducts(true)} />
      </div>
    );
  }

  const items = reviewableProducts.data || [];
  const pending = items.filter((i) => !i.existingReview);
  const written = items.filter((i) => i.existingReview);

  return (
    <div className="space-y-7">
      <AccountSectionHeader
        kicker="Community"
        title="My Reviews"
        description="You can review anything that has been delivered to you. Verified-purchase reviews earn 50 Glam points."
      />

      {items.length === 0 ? (
        <AccountEmpty
          icon={Star}
          title="Nothing to review yet."
          description="Once an order is delivered, the products in it will appear here for you to rate."
          actionLabel="Explore Products"
          onAction={onExploreShop}
        />
      ) : (
        <>
          {/* Awaiting a review */}
          {pending.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif text-lg text-[#121212]">
                Waiting for your review{' '}
                <span className="text-[#C9972B] text-sm">({pending.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pending.map((item) => (
                  <AccountCard key={item.productId} className="p-4 flex gap-4">
                    <ProductImage src={item.productImage} alt="" className="w-16 h-20 object-cover border border-[#E8D5A8] rounded shrink-0" />
                    <div className="min-w-0 flex-1 flex flex-col">
                      <h3 className="font-serif text-sm text-[#121212] leading-snug">{item.productName}</h3>
                      <p className="text-[11px] text-[#524C4C] mt-0.5">
                        Delivered · Order #{item.orderNumber}
                      </p>
                      <div className="mt-auto pt-3">
                        <AccountButton onClick={() => setEditing({ item })}>
                          <Star className="w-3.5 h-3.5" />
                          Write a Review
                        </AccountButton>
                      </div>
                    </div>
                  </AccountCard>
                ))}
              </div>
            </section>
          )}

          {/* Already written */}
          {written.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif text-lg text-[#121212]">
                Your reviews <span className="text-[#C9972B] text-sm">({written.length})</span>
              </h2>
              <div className="space-y-4">
                {written.map((item) => {
                  const review = item.existingReview!;
                  return (
                    <AccountCard key={item.productId} className="p-5">
                      <div className="flex gap-4">
                        <ProductImage src={item.productImage} alt="" className="w-14 h-16 object-cover border border-[#E8D5A8] rounded shrink-0" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-serif text-sm text-[#121212]">{item.productName}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <Stars rating={review.rating} />
                                <span className="text-[11px] text-[#524C4C]">{formatDate(review.date)}</span>
                              </div>
                            </div>
                            {review.isVerifiedPurchase && (
                              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold tracking-[0.12em] uppercase text-[#2E7D32] shrink-0">
                                <BadgeCheck className="w-3.5 h-3.5" />
                                Verified
                              </span>
                            )}
                          </div>

                          {review.title && <p className="font-serif text-[14px] text-[#121212]">{review.title}</p>}
                          <p className="text-[12.5px] text-[#524C4C] leading-relaxed">{review.comment}</p>

                          <div className="flex flex-wrap gap-2 pt-2">
                            <AccountButton variant="ghost" onClick={() => setEditing({ item, review })}>
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </AccountButton>
                            <AccountButton
                              variant="ghost"
                              loading={deletingId === review.id}
                              onClick={() => handleDelete(review.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </AccountButton>
                          </div>
                        </div>
                      </div>
                    </AccountCard>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Keyed so the modal remounts per product — otherwise its initial
          rating/title/comment would stay on the previously-opened review. */}
      <WriteReviewModal
        key={editing ? `${editing.item.productId}-${editing.review?.id || 'new'}` : 'none'}
        target={editing ? { productId: editing.item.productId, productName: editing.item.productName } : null}
        initialRating={editing?.review?.rating ?? 5}
        initialTitle={editing?.review?.title || ''}
        initialComment={editing?.review?.comment || ''}
        onClose={() => setEditing(null)}
        onConfirm={handleSubmit}
        showToast={showToast}
      />
    </div>
  );
};
