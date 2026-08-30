/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Star, ShieldCheck } from 'lucide-react';
import { Review } from '../../types';
import { apiFetch } from '../../utils/cmsClient';
import { formatDate } from '../../utils/dateFormat';

type SortOption = 'newest' | 'highest' | 'lowest';

interface ReviewsResponse {
  reviews: Review[];
  average: number;
  count: number;
  breakdown: { star: number; count: number }[];
}

interface ProductReviewsProps {
  productId: string;
  fallbackRating?: number;
  fallbackReviewCount?: number;
}

export const ProductReviews: React.FC<ProductReviewsProps> = ({
  productId,
  fallbackRating,
  fallbackReviewCount,
}) => {
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sort, setSort] = useState<SortOption>('newest');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiFetch<ReviewsResponse>(`/api/products/${productId}/reviews`).then((res) => {
      if (!cancelled && res.data) setData(res.data);
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const reviews = [...(data?.reviews || [])].sort((a, b) => {
    if (sort === 'highest') return b.rating - a.rating;
    if (sort === 'lowest') return a.rating - b.rating;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const average = data?.average ?? fallbackRating ?? 0;
  const count = data?.count ?? fallbackReviewCount ?? 0;
  const breakdown = data?.breakdown || [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 }));

  return (
    <div className="pt-10 border-t border-[#E8D5A8] space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block">
            Customer Voices
          </span>
          <h3 className="text-xl sm:text-2xl font-bold text-[#121212]">Ratings &amp; Reviews</h3>
        </div>
        {reviews.length > 1 && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="text-xs border border-[#E8D5A8] rounded-full px-3 py-1.5 bg-white text-[#121212] focus:outline-hidden cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="highest">Highest Rated</option>
            <option value="lowest">Lowest Rated</option>
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 bg-white border border-[#E8D5A8] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : count === 0 ? (
        <div className="p-6 bg-white border border-[#E8D5A8] rounded-2xl text-xs text-[#6B6B6B]">
          No reviews yet for this product — be the first to share your experience from your Order History once it's delivered.
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-6 p-5 bg-white border border-[#E8D5A8] rounded-2xl">
            <div className="flex flex-col items-center justify-center sm:border-r sm:border-[#E8D5A8] sm:pr-6 flex-shrink-0">
              <span className="text-4xl font-extrabold text-[#121212]">{average.toFixed(1)}</span>
              <div className="flex items-center gap-0.5 my-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${star <= Math.round(average) ? 'fill-[#C9972B] text-[#C9972B]' : 'text-[#E8D5A8]'}`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-[#6B6B6B]">{count} review{count === 1 ? '' : 's'}</span>
            </div>
            <div className="flex-1 space-y-1.5">
              {breakdown.map((b) => (
                <div key={b.star} className="flex items-center gap-2 text-[11px] text-[#6B6B6B]">
                  <span className="w-8">{b.star} star</span>
                  <div className="flex-1 h-1.5 bg-[#FCE8ED] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C9972B]"
                      style={{ width: count > 0 ? `${(b.count / count) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-6 text-right">{b.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reviews.map((rev) => (
              <div key={rev.id} className="p-5 bg-white border border-[#E8D5A8] rounded-2xl space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${star <= rev.rating ? 'fill-[#C9972B] text-[#C9972B]' : 'text-[#E8D5A8]'}`}
                      />
                    ))}
                  </div>
                  {rev.isVerifiedPurchase && (
                    <span className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5 rounded-full flex-shrink-0">
                      <ShieldCheck className="w-3 h-3" />
                      Verified Purchase
                    </span>
                  )}
                </div>
                {rev.title && <h4 className="text-sm font-bold text-[#121212]">{rev.title}</h4>}
                <p className="text-xs text-[#6B6B6B] leading-relaxed">{rev.comment}</p>
                {rev.photoUrl && (
                  <img src={rev.photoUrl} alt="Customer upload" className="w-16 h-16 object-cover rounded-lg border border-[#E8D5A8]" />
                )}
                <div className="pt-1 flex items-center justify-between text-[10.5px] text-[#6B6B6B]">
                  <span>{rev.customerName}</span>
                  <span>{formatDate(rev.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
