import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Camera, ChevronDown, ChevronLeft, ChevronRight, Heart, PenLine, Users } from 'lucide-react';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';
import { FeaturedReview, Stars } from '../home/HomeReviewsSection';
import { HelpfulButton } from '../product/HelpfulButton';

type Sort = 'recent' | 'helpful' | 'highest' | 'lowest';
/** 'all' | 'photos' | '1'-'5' | 'mention:<id>' */
type Filter = string;

interface ReviewsPageResponse {
  reviews: FeaturedReview[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    count: number;
    average: number;
    verifiedBuyers: number;
    withPhotos: number;
    positivePercent: number;
    breakdown: { star: number; count: number }[];
  };
  mentions: { id: string; label: string; count: number }[];
}

interface ReviewsPageProps {
  onNavigateHome: () => void;
  onSelectProduct: (productId: string) => void;
  onWriteReview: () => void;
  onRequireLogin: () => void;
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function timeAgo(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 7) return relativeTime.format(-days, 'day');
  if (days < 30) return relativeTime.format(-Math.round(days / 7), 'week');
  if (days < 365) return relativeTime.format(-Math.round(days / 30), 'month');
  return relativeTime.format(-Math.round(days / 365), 'year');
}

/** 1 … 4 5 6 … 20 style list; numbers are pages, null is a gap. */
function pageList(current: number, total: number): (number | null)[] {
  const keep = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4, 5].forEach((p) => keep.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3, total - 4].forEach((p) => keep.add(p));
  const pages = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? [null, p] : [p]));
}

const chip = (active: boolean) =>
  `shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05A7E] ${
    active ? 'bg-[#F05A7E] border-[#F05A7E] text-white' : 'bg-white border-[#E8D5A8] text-[#121212] hover:border-[#F05A7E] hover:text-[#F05A7E]'
  }`;

const ReviewCard: React.FC<{ review: FeaturedReview; onSelectProduct: (id: string) => void; onRequireLogin: () => void }> = ({
  review,
  onSelectProduct,
  onRequireLogin,
}) => {
  const image = review.media?.find((m) => m.type === 'image')?.url || review.productImage;
  const details = [review.shadeName && `Shade: ${review.shadeName}`, review.skinTone && `${review.skinTone} skin`, review.undertone && `${review.undertone} undertone`]
    .filter(Boolean)
    .join(' · ');
  return (
    <article className="h-full flex flex-col p-4 bg-white border border-[#E8D5A8] rounded-2xl">
      <div className="flex gap-3 flex-1">
        <div className="flex-1 min-w-0">
          <Stars rating={review.rating} className="w-4 h-4" />
          {review.title && <h3 className="mt-2.5 text-base font-bold text-[#121212] leading-snug">{review.title}</h3>}
          {review.comment ? (
            <p className="mt-2 text-[13px] text-[#6B6B6B] leading-relaxed line-clamp-6">“{review.comment}”</p>
          ) : (
            !review.title && <p className="mt-2 text-[13px] text-[#6B6B6B] italic">Rated {review.rating} out of 5</p>
          )}
          {details && <p className="mt-2 text-[11px] text-[#C9972B]">{details}</p>}
        </div>
        {image && (
          <button
            type="button"
            onClick={() => onSelectProduct(review.productId)}
            aria-label={review.productName ? `View ${review.productName}` : 'View product'}
            className="w-[44%] self-start aspect-[4/5] shrink-0 rounded-xl overflow-hidden bg-[#FCE8ED] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F05A7E]"
          >
            <img src={cloudinaryImageUrl(image, 'thumb')} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          </button>
        )}
      </div>
      <div className="mt-4 flex items-end gap-2.5">
        <span aria-hidden="true" className="w-9 h-9 rounded-full bg-[#FCE8ED] text-[#F05A7E] text-sm font-bold flex items-center justify-center shrink-0">
          {review.customerName.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1 text-sm font-semibold text-[#121212]">
            <span className="truncate">{review.customerName}</span>
            {review.isVerifiedPurchase && <BadgeCheck className="w-4 h-4 shrink-0 fill-[#C9972B] text-white" aria-hidden="true" />}
          </span>
          <span className="block text-[11px] text-[#6B6B6B] truncate">
            {review.isVerifiedPurchase ? 'Verified Purchase' : review.productName}
          </span>
        </span>
        <time dateTime={review.date} className="text-[11px] text-[#6B6B6B] shrink-0">{timeAgo(review.date)}</time>
      </div>
      <div className="mt-3 pt-3 border-t border-[#F5E9D0]">
        <HelpfulButton reviewId={review.id} count={review.helpfulCount || 0} onRequireLogin={onRequireLogin} />
      </div>
    </article>
  );
};

export const ReviewsPage: React.FC<ReviewsPageProps> = ({ onNavigateHome, onSelectProduct, onWriteReview, onRequireLogin }) => {
  const banner = useCMS().globalSettings?.reviewsBanner;
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReviewsPageResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sort, page: String(page) });
    if (filter === 'photos') params.set('photos', '1');
    else if (filter.startsWith('mention:')) params.set('mention', filter.slice(8));
    else if (filter !== 'all') params.set('rating', filter);
    setStatus('loading');
    apiFetch<ReviewsPageResponse>(`/api/reviews?${params}`).then((res) => {
      if (cancelled) return;
      if (res.data) setData(res.data);
      setStatus(res.data ? 'ready' : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [filter, sort, page, retry]);

  const applyFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };
  const goToPage = (next: number) => {
    setPage(next);
    resultsRef.current?.scrollIntoView({ block: 'start' });
  };

  const stats = data?.stats;
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const breakdownCount = (star: number) => stats?.breakdown.find((b) => b.star === star)?.count ?? 0;
  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: 'All Reviews', count: stats?.count },
    { id: 'photos', label: 'With Photos', count: stats?.withPhotos },
    ...[5, 4, 3, 2, 1].map((s) => ({ id: String(s), label: `${s} Star`, count: stats ? breakdownCount(s) : undefined })),
  ];

  return (
    <div className="bg-[#FCE8ED]/30 pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#FCE8ED]/70 via-[#FCE8ED]/40 to-[#FCE8ED]/70 border-b border-[#F5CCD7]">
        {/* Admin → Other Pages → Customer Reviews Hero */}
        {banner?.enabled && banner.imageUrl && (
          <img
            src={cloudinaryImageUrl(banner.imageUrl, 'gallery')}
            alt=""
            aria-hidden="true"
            className="hidden md:block absolute right-0 top-0 h-full w-[36%] object-cover object-center [mask-image:linear-gradient(to_right,transparent,black_55%)]"
          />
        )}
        {banner?.enabled && (banner.mobileImageUrl || banner.imageUrl) && (
          <img
            src={cloudinaryImageUrl(banner.mobileImageUrl || banner.imageUrl, 'card')}
            alt=""
            aria-hidden="true"
            className="md:hidden absolute right-0 top-0 h-full w-[55%] object-cover opacity-40 [mask-image:linear-gradient(to_right,transparent,black_60%)]"
          />
        )}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
          <nav aria-label="Breadcrumb" className="text-xs text-[#6B6B6B]">
            <ol className="flex items-center gap-2">
              <li>
                <button type="button" onClick={onNavigateHome} className="hover:text-[#F05A7E] transition-colors cursor-pointer">Home</button>
              </li>
              <li aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
              <li aria-current="page" className="text-[#121212] font-medium">Customer Reviews</li>
            </ol>
          </nav>
          <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#121212] tracking-tight">
            Customer <span className="text-[#F05A7E]">Reviews</span>
          </h1>
          <p className="mt-3 text-sm sm:text-lg text-[#6B6B6B] max-w-xl">
            Real people. Real results. See why beauty lovers trust Glamirk.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Ratings summary */}
        <section aria-label="Ratings summary" className="mt-6 bg-white/70 border border-[#E8D5A8] rounded-2xl p-5 sm:p-6 grid grid-cols-2 lg:grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-5 lg:gap-0 lg:divide-x divide-[#E8D5A8]">
          {stats && stats.count > 0 ? (
            <>
              <div className="col-span-2 lg:col-span-1 text-center lg:pr-8">
                <p className="text-4xl sm:text-5xl font-extrabold text-[#121212]">{stats.average.toFixed(1)}/5</p>
                <div className="mt-2 flex justify-center"><Stars rating={stats.average} className="w-6 h-6" /></div>
                <p className="mt-2 text-sm text-[#6B6B6B]">
                  from {stats.count.toLocaleString('en-IN')} review{stats.count === 1 ? '' : 's'}
                </p>
              </div>
              {[
                { icon: Users, value: stats.verifiedBuyers.toLocaleString('en-IN'), label: 'Verified Buyers' },
                { icon: Heart, value: `${stats.positivePercent}%`, label: 'Rated 4★ or Higher' },
                { icon: Camera, value: stats.withPhotos.toLocaleString('en-IN'), label: 'Reviews with Photos' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex items-center gap-3 lg:justify-center lg:px-4">
                  <Icon className="w-9 h-9 sm:w-10 sm:h-10 text-[#C9972B] shrink-0" strokeWidth={1.25} aria-hidden="true" />
                  <div>
                    <p className="text-xl sm:text-2xl font-semibold text-[#121212]">{value}</p>
                    <p className="text-xs sm:text-sm text-[#6B6B6B]">{label}</p>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="col-span-2 lg:col-span-4 text-sm text-[#6B6B6B]">
              {status === 'loading' ? 'Loading ratings…' : 'No reviews yet — reviews appear here once customers rate their delivered orders.'}
            </p>
          )}
          <div className="col-span-2 lg:col-span-1 flex justify-center lg:pl-8">
            <button
              type="button"
              onClick={onWriteReview}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-[#F05A7E] text-white text-sm font-semibold uppercase tracking-wide rounded-full hover:bg-[#E04A6E] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05A7E]"
            >
              Write a Review <PenLine className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* Filters + sort */}
        <div ref={resultsRef} className="scroll-mt-24 mt-6 flex flex-col-reverse md:flex-row md:items-center gap-3">
          <div role="group" aria-label="Filter reviews" className="flex-1 min-w-0 flex gap-2.5 overflow-x-auto no-scrollbar md:flex-wrap py-1">
            {filters.map((f) => (
              <button key={f.id} type="button" onClick={() => applyFilter(f.id)} aria-pressed={filter === f.id} className={chip(filter === f.id)}>
                {f.label}
                {f.count !== undefined && ` (${f.count.toLocaleString('en-IN')})`}
              </button>
            ))}
          </div>
          <label className="relative self-end md:self-auto shrink-0">
            <span className="sr-only">Sort reviews</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                setPage(1);
              }}
              className="appearance-none pl-5 pr-10 py-2.5 text-xs font-medium bg-white border border-[#E8D5A8] rounded-full text-[#121212] cursor-pointer focus:border-[#F05A7E] focus:outline-none"
            >
              <option value="recent">Most Recent</option>
              <option value="helpful">Most Helpful</option>
              <option value="highest">Highest Rated</option>
              <option value="lowest">Lowest Rated</option>
            </select>
            <ChevronDown className="pointer-events-none w-4 h-4 text-[#6B6B6B] absolute right-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_15.5rem] gap-5 items-start">
          {/* Results */}
          <section aria-label="Reviews" aria-busy={status === 'loading'}>
            {status === 'error' ? (
              <div className="p-8 bg-white border border-[#E8D5A8] rounded-2xl text-center text-sm text-[#6B6B6B]">
                We couldn't load reviews right now.{' '}
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="text-[#F05A7E] font-semibold underline cursor-pointer">
                  Try again
                </button>
              </div>
            ) : !data ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => <div key={i} className="h-64 bg-white border border-[#E8D5A8] rounded-2xl animate-pulse" />)}
              </div>
            ) : data.reviews.length === 0 ? (
              <div className="p-8 bg-white border border-[#E8D5A8] rounded-2xl text-center text-sm text-[#6B6B6B]">
                {filter === 'all' ? 'No reviews yet.' : 'No reviews match this filter yet.'}
                {filter !== 'all' && (
                  <button type="button" onClick={() => applyFilter('all')} className="ml-1 text-[#F05A7E] font-semibold underline cursor-pointer">
                    Show all reviews
                  </button>
                )}
              </div>
            ) : (
              <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
                {data.reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} onSelectProduct={onSelectProduct} onRequireLogin={onRequireLogin} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <nav aria-label="Review pages" className="mt-6 flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="w-9 h-9 rounded-full bg-white border border-[#E8D5A8] flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default hover:enabled:border-[#F05A7E]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageList(page, totalPages).map((p, i) =>
                  p === null ? (
                    <span key={`gap-${i}`} className="w-6 text-center text-xs text-[#6B6B6B]" aria-hidden="true">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToPage(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                      className={`w-9 h-9 rounded-full text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05A7E] ${
                        p === page ? 'bg-[#F05A7E] text-white' : 'bg-white border border-[#F5CCD7] text-[#121212] hover:border-[#F05A7E]'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                  className="w-9 h-9 rounded-full bg-white border border-[#E8D5A8] flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default hover:enabled:border-[#F05A7E]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </nav>
            )}
          </section>

          {/* Sidebar */}
          {stats && stats.count > 0 && (
            <aside className="bg-white border border-[#E8D5A8] rounded-2xl p-5">
              <h2 className="text-base font-bold text-[#121212]">Customer Ratings</h2>
              <ul className="mt-4 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = breakdownCount(star);
                  return (
                    <li key={star}>
                      <button
                        type="button"
                        onClick={() => applyFilter(String(star))}
                        aria-pressed={filter === String(star)}
                        aria-label={`Show ${star} star reviews (${count})`}
                        className={`w-full flex items-center gap-3 py-1.5 px-1 rounded-lg text-xs cursor-pointer hover:bg-[#FCE8ED]/60 ${filter === String(star) ? 'bg-[#FCE8ED]/60' : ''}`}
                      >
                        <span className="w-10 text-left text-[#121212]">{star} Star</span>
                        <span className="flex-1 h-2 bg-[#FCE8ED] rounded-full overflow-hidden">
                          <span className="block h-full bg-[#F05A7E] rounded-full" style={{ width: `${(count / stats.count) * 100}%` }} />
                        </span>
                        <span className="w-10 text-right text-[#6B6B6B]">{count.toLocaleString('en-IN')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {data && data.mentions.length > 0 && (
                <>
                  <h2 className="mt-6 pt-5 border-t border-[#E8D5A8] text-base font-bold text-[#121212]">Customers Also Mention</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {data.mentions.map((m) => {
                      const id = `mention:${m.id}`;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => applyFilter(filter === id ? 'all' : id)}
                          aria-pressed={filter === id}
                          aria-label={`${m.label}: ${m.count} review${m.count === 1 ? '' : 's'}`}
                          className={`px-3 py-1.5 rounded-full text-[11px] cursor-pointer transition-colors ${
                            filter === id ? 'bg-[#F05A7E] text-white' : 'bg-[#FCE8ED] text-[#6B6B6B] hover:text-[#F05A7E]'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
