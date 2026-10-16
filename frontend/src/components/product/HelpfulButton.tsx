import React, { useEffect, useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { customerApiFetch } from '@glamirk/shared/utils/cmsClient';
import { useCustomerAuth } from '../../context/CustomerAuthContext';

// Which reviews this shopper has already marked helpful, fetched once per
// session and shared by every button on the page.
let votedIds: Promise<Set<string>> | null = null;
let votedFor: string | null = null;
function loadVotedIds(customerId: string): Promise<Set<string>> {
  if (!votedIds || votedFor !== customerId) {
    votedFor = customerId;
    votedIds = customerApiFetch<{ reviewIds: string[] }>('/api/customer/reviews/helpful').then(
      (res) => new Set(res.data?.reviewIds || [])
    );
  }
  return votedIds;
}

interface HelpfulButtonProps {
  reviewId: string;
  count: number;
  onRequireLogin?: () => void;
}

export const HelpfulButton: React.FC<HelpfulButtonProps> = ({ reviewId, count, onRequireLogin }) => {
  const { customerUser, isCustomerLoggedIn } = useCustomerAuth();
  const [voted, setVoted] = useState(false);
  const [total, setTotal] = useState(count);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setTotal(count), [count]);
  useEffect(() => {
    if (!isCustomerLoggedIn || !customerUser?.id) return setVoted(false);
    let cancelled = false;
    loadVotedIds(customerUser.id).then((ids) => !cancelled && setVoted(ids.has(reviewId)));
    return () => {
      cancelled = true;
    };
  }, [isCustomerLoggedIn, customerUser?.id, reviewId]);

  const toggle = async () => {
    if (!isCustomerLoggedIn) return onRequireLogin?.();
    setBusy(true);
    setError('');
    const res = await customerApiFetch<{ helpful: boolean; helpfulCount: number }>(`/api/customer/reviews/${reviewId}/helpful`, {
      method: 'POST',
    });
    setBusy(false);
    if (!res.data) return setError(res.error || 'Could not save your vote.');
    setVoted(res.data.helpful);
    setTotal(res.data.helpfulCount);
    votedIds?.then((ids) => (res.data!.helpful ? ids.add(reviewId) : ids.delete(reviewId)));
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={voted}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] transition-colors cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#F05A7E] ${
          voted ? 'border-[#F05A7E] text-[#F05A7E] bg-[#FCE8ED]' : 'border-[#E8D5A8] text-[#6B6B6B] hover:border-[#F05A7E] hover:text-[#F05A7E]'
        }`}
      >
        <ThumbsUp className={`w-3 h-3 ${voted ? 'fill-[#F05A7E]' : ''}`} aria-hidden="true" />
        Helpful{total > 0 && ` (${total})`}
      </button>
      {error && <span role="alert" className="text-[10px] text-[#C0392B]">{error}</span>}
    </span>
  );
};
