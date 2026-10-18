import React, { useEffect, useState } from 'react';
import { useSnapCarousel } from '../../hooks/useSnapCarousel';
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Review } from '@glamirk/shared/types';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

export type FeaturedReview = Review & { productImage?: string };

interface FeaturedReviewsResponse {
  reviews: FeaturedReview[];
  count: number;
  average: number;
}

interface HomeReviewsSectionProps {
  onSelectProduct: (productId: string) => void;
  onReadAll: () => void;
}

/** Five stars with the filled row clipped to the rating, so 4.8 reads as 4.8. */
export const Stars: React.FC<{ rating: number; className: string }> = ({ rating, className }) => (
  <span className="relative inline-flex shrink-0" role="img" aria-label={`${rating} out of 5 stars`}>
    <span className="flex gap-0.5 text-[#E8D5A8]">
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className={className} />)}
    </span>
    <span className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ width: `${(rating / 5) * 100}%` }}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className={`${className} shrink-0 fill-[#C9972B] text-[#C9972B]`} />)}
    </span>
  </span>
);

const ReviewCard: React.FC<{ review: FeaturedReview; onSelectProduct: (id: string) => void }> = ({ review, onSelectProduct }) => {
  // A customer's own photo beats the catalogue shot; videos aren't shown here.
  const image = review.media?.find((m) => m.type === 'image')?.url || review.productImage;
  return (
    <article className="h-full flex gap-4 p-4 bg-white border border-[#E8D5A8] rounded-2xl">
      <div className="flex-1 min-w-0 flex flex-col">
        <Stars rating={review.rating} className="w-4 h-4" />
        <blockquote className="mt-3 text-sm text-[#121212] leading-relaxed line-clamp-5">
          “{review.comment}”
        </blockquote>
        <div className="mt-auto pt-4 flex items-center gap-2.5 min-w-0">
          <span aria-hidden="true" className="w-9 h-9 rounded-full bg-[#FCE8ED] text-[#F05A7E] text-sm font-bold flex items-center justify-center shrink-0">
            {review.customerName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-semibold text-[#121212]">
              <span className="truncate">{review.customerName}</span>
              {review.isVerifiedPurchase && <BadgeCheck className="w-4 h-4 shrink-0 fill-[#C9972B] text-white" aria-hidden="true" />}
            </span>
            <span className="block text-[11px] text-[#6B6B6B] truncate">
              {review.isVerifiedPurchase ? 'Verified Purchase' : review.productName}
            </span>
          </span>
        </div>
      </div>
      {image && (
        <button
          type="button"
          onClick={() => onSelectProduct(review.productId)}
          aria-label={`View ${review.productName}`}
          className="w-[38%] shrink-0 rounded-xl overflow-hidden bg-[#FCE8ED] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F05A7E]"
        >
          <img src={cloudinaryImageUrl(image, 'thumb')} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        </button>
      )}
    </article>
  );
};

export const HomeReviewsSection: React.FC<HomeReviewsSectionProps> = ({ onSelectProduct, onReadAll }) => {
  const [data, setData] = useState<FeaturedReviewsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<FeaturedReviewsResponse>('/api/reviews/featured').then((res) => {
      if (cancelled) return;
      if (res.data) setData(res.data);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The endpoint already returns only the newest 4★+ reviews.
  const featured = data?.reviews || [];
  const { trackRef, page, pageCount, goTo, onScroll: sync } = useSnapCarousel(featured.length, { wrap: true });

  if (!isLoading && featured.length === 0) return null;

  return (
    <section aria-labelledby="home-reviews-heading" className="home-section pt-0 bg-[#FCE8ED]/30 border-b border-[#E8D5A8]">
      <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative bg-white/40 border border-[#F5CCD7] rounded-[1.75rem] p-5 sm:p-8 xl:px-10 flex flex-col xl:flex-row gap-8 xl:gap-12">
          {/* Brand + rating panel; stacks above the cards until there's room for both */}
          <div className="xl:w-[17rem] shrink-0 flex flex-col justify-center">
            <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.3em] uppercase text-[#C9972B]">
              Customer Love <span aria-hidden="true" className="w-10 h-px bg-[#C9972B]/60" />
            </p>
            <h2 id="home-reviews-heading" className="mt-3 text-3xl sm:text-4xl font-extrabold text-[#121212] leading-tight">
              Real People.<br />
              <span className="text-[#F05A7E]">Real Results.</span>
            </h2>
            <p className="mt-4 text-sm text-[#6B6B6B] leading-relaxed max-w-xs">
              See why beauty lovers trust Glamirk for their everyday glow and confidence.
            </p>
            {data && data.count > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-3">
                  <Stars rating={data.average} className="w-6 h-6" />
                  <span className="text-2xl font-extrabold text-[#121212]">{data.average.toFixed(1)}/5</span>
                </div>
                <p className="mt-1.5 text-xs text-[#6B6B6B]">
                  from {data.count.toLocaleString('en-IN')} customer review{data.count === 1 ? '' : 's'}
                </p>
              </div>
            )}
          </div>

          {/* Carousel */}
          <div className="flex-1 min-w-0 flex flex-col">
            {isLoading ? (
              <div className="flex gap-4" aria-busy="true" aria-label="Loading reviews">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`h-60 flex-1 bg-white border border-[#E8D5A8] rounded-2xl animate-pulse ${i > 0 ? 'hidden min-[768px]:block' : ''} ${i > 1 ? 'min-[768px]:hidden min-[1400px]:block' : ''}`} />
                ))}
              </div>
            ) : (
              <>
                <div className="relative">
                  <div
                    ref={trackRef}
                    onScroll={sync}
                    role="region"
                    aria-roledescription="carousel"
                    aria-label="Customer reviews"
                    className="no-scrollbar flex gap-4 overflow-x-auto snap-x snap-mandatory motion-safe:scroll-smooth"
                  >
                    {featured.map((review) => (
                      <div key={review.id} className="snap-start shrink-0 basis-[86%] min-[640px]:basis-[60%] min-[768px]:basis-[calc((100%-1rem)/2)] min-[1400px]:basis-[calc((100%-2rem)/3)] min-h-60">
                        <ReviewCard review={review} onSelectProduct={onSelectProduct} />
                      </div>
                    ))}
                  </div>
                  {pageCount > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => goTo(page - 1)}
                        aria-label="Previous reviews"
                        className="hidden sm:flex absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#E8D5A8] shadow-sm items-center justify-center text-[#121212] hover:text-[#F05A7E] hover:border-[#F05A7E] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F05A7E]"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => goTo(page + 1)}
                        aria-label="Next reviews"
                        className="hidden sm:flex absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#E8D5A8] shadow-sm items-center justify-center text-[#121212] hover:text-[#F05A7E] hover:border-[#F05A7E] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F05A7E]"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-center gap-5">
                  <div className="sm:flex-1 flex flex-wrap justify-center sm:pl-[12rem] gap-1">
                    {pageCount > 1 &&
                      Array.from({ length: pageCount }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => goTo(i)}
                          aria-label={`Show review page ${i + 1} of ${pageCount}`}
                          aria-current={i === page ? 'true' : undefined}
                          className="w-6 h-6 flex items-center justify-center cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-[#F05A7E]"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full transition-colors ${i === page ? 'bg-[#F05A7E]' : 'bg-[#F5CCD7]'}`} />
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    onClick={onReadAll}
                    className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#F05A7E] text-white text-xs font-bold uppercase tracking-wider rounded-full hover:bg-[#E04A6E] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05A7E]"
                  >
                    Read all reviews
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
