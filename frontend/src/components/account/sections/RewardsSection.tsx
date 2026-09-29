/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Ticket, Copy, CheckCheck, Award, Gift } from 'lucide-react';
import { AccountCoupon, CouponAvailability } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import {
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  AccountSectionHeader,
  formatDate,
  formatMoney,
} from '../AccountUI';

interface RewardsSectionProps {
  onExploreShop: () => void;
  showToast: (message: string) => void;
}

const TABS: { id: CouponAvailability | 'all'; label: string }[] = [
  { id: 'available', label: 'Available' },
  { id: 'used', label: 'Used' },
  { id: 'expired', label: 'Expired' },
];

function describeDiscount(coupon: AccountCoupon): string {
  if (coupon.discountType === 'percentage') return `${coupon.discountValue}% off`;
  if (coupon.discountType === 'flat') return `${formatMoney(coupon.discountValue)} off`;
  return 'Gift with purchase';
}

export const RewardsSection: React.FC<RewardsSectionProps> = ({ onExploreShop, showToast }) => {
  const { rewards, loadRewards, coupons, loadCoupons } = useAccount();
  const [tab, setTab] = useState<CouponAvailability | 'all'>('available');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    loadRewards();
    loadCoupons();
  }, [loadRewards, loadCoupons]);

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    showToast(`Code ${code} copied — apply it at checkout.`);
    setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2500);
  };

  const all = coupons.data || [];
  // 'ineligible' codes (scheduled, paused) are grouped under Available so a
  // customer can see what's coming, with the reason stated on the card.
  const visible = all.filter((c) => (tab === 'available' ? c.availability === 'available' || c.availability === 'ineligible' : c.availability === tab));

  const counts = {
    available: all.filter((c) => c.availability === 'available' || c.availability === 'ineligible').length,
    used: all.filter((c) => c.availability === 'used').length,
    expired: all.filter((c) => c.availability === 'expired').length,
  };

  const summary = rewards.data;

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Privileges"
        title="Coupons & Glam Rewards"
        description="Points are credited when an order is delivered. Every code is validated on our servers at checkout."
      />

      {/* Points */}
      {rewards.error ? (
        <AccountError message={rewards.error} onRetry={() => loadRewards(true)} />
      ) : rewards.loading && !summary ? (
        <AccountLoading label="Loading your rewards" rows={1} />
      ) : (
        <div className="bg-[#0B0B0B] text-[#FAF9F6] rounded-xl p-6 sm:p-8 border border-[#C9972B]/30">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 text-[9.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                <Award className="w-3.5 h-3.5" />
                Glamirk Privé · {summary?.tier || 'MEMBER'}
              </span>
              <div className="mt-2">
                <span className="font-serif text-4xl text-[#C9972B]">{summary?.points ?? 0}</span>
                <span className="text-sm text-[#9C9689] ml-2">points</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[9.5px] font-semibold tracking-[0.2em] uppercase text-[#C9972B] block">
                Lifetime Spend
              </span>
              <span className="font-serif text-xl">{formatMoney(summary?.lifetimeSpend || 0)}</span>
            </div>
          </div>

          {summary && summary.pointsToNextTier > 0 && (
            <div className="mt-6 pt-5 border-t border-[#C9972B]/20">
              <div className="flex justify-between text-[11px] text-[#9C9689] mb-2">
                <span>Next tier at {formatMoney(summary.nextTierThreshold)}</span>
                <span>{formatMoney(summary.pointsToNextTier)} to go</span>
              </div>
              <div className="h-1.5 bg-[#171717] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#C9972B] to-[#E3B84B] rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((summary.lifetimeSpend / Math.max(1, summary.nextTierThreshold)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coupons */}
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3.5 py-2 text-[10.5px] font-semibold tracking-[0.12em] uppercase rounded-full border transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-[#0B0B0B] text-white border-[#0B0B0B]'
                  : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:text-[#121212] hover:border-[#C9972B]'
              }`}
            >
              {t.label}
              {(counts as any)[t.id] > 0 && <span className="ml-1.5 opacity-70">{(counts as any)[t.id]}</span>}
            </button>
          ))}
        </div>

        {coupons.error ? (
          <AccountError message={coupons.error} onRetry={() => loadCoupons(true)} />
        ) : coupons.loading && !coupons.loaded ? (
          <AccountLoading label="Loading coupons" rows={2} />
        ) : visible.length === 0 ? (
          <AccountEmpty
            icon={Ticket}
            title={
              tab === 'available'
                ? 'No coupons available right now.'
                : tab === 'used'
                ? "You haven't used a coupon yet."
                : 'No expired coupons.'
            }
            description={
              tab === 'available'
                ? 'New promotions appear here the moment the atelier publishes them.'
                : undefined
            }
            actionLabel={tab === 'available' ? 'Explore Products' : undefined}
            onAction={tab === 'available' ? onExploreShop : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visible.map((coupon) => {
              const usable = coupon.availability === 'available';
              return (
                <article
                  key={`${coupon.code}-${coupon.availability}`}
                  className={`bg-white border rounded-xl overflow-hidden ${
                    usable ? 'border-[#C9972B]/50' : 'border-[#E8D5A8] opacity-80'
                  }`}
                >
                  <div className="p-5 flex gap-4">
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                        usable ? 'bg-[#0B0B0B]' : 'bg-[#FAF9F6] border border-[#E8D5A8]'
                      }`}
                    >
                      {coupon.discountType === 'gift' || coupon.discountType === 'gift_with_purchase' ? (
                        <Gift className={`w-4.5 h-4.5 ${usable ? 'text-[#C9972B]' : 'text-[#D6CEBC]'}`} />
                      ) : (
                        <Ticket className={`w-4.5 h-4.5 ${usable ? 'text-[#C9972B]' : 'text-[#D6CEBC]'}`} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-serif text-base text-[#121212] leading-snug">{coupon.title}</h3>
                          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#C9972B]">
                            {describeDiscount(coupon)}
                          </span>
                        </div>
                      </div>

                      {coupon.description && (
                        <p className="text-[11.5px] text-[#6B6B6B] leading-relaxed">{coupon.description}</p>
                      )}

                      <ul className="text-[11px] text-[#6B6B6B] space-y-0.5 pt-0.5">
                        {coupon.minOrderValue ? <li>Minimum order {formatMoney(coupon.minOrderValue)}</li> : <li>No minimum order</li>}
                        {coupon.endDate && coupon.availability !== 'used' && <li>Valid until {formatDate(coupon.endDate)}</li>}
                        {coupon.availability === 'used' && coupon.usedOn && <li>Used on {formatDate(coupon.usedOn)}</li>}
                        {coupon.availability === 'ineligible' && coupon.ineligibleReason && (
                          <li className="text-[#C9972B]">{coupon.ineligibleReason}</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  <div className="px-5 py-3 bg-[#FAF9F6] border-t border-dashed border-[#E8D5A8] flex items-center justify-between gap-3">
                    <code className="font-mono text-[13px] font-bold tracking-wider text-[#121212] truncate">
                      {coupon.code}
                    </code>
                    {usable ? (
                      <button
                        onClick={() => handleCopy(coupon.code)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] text-white text-[10px] font-semibold tracking-[0.12em] uppercase rounded-full hover:bg-[#171717] transition-colors cursor-pointer shrink-0"
                      >
                        {copiedCode === coupon.code ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedCode === coupon.code ? 'Copied' : 'Copy'}
                      </button>
                    ) : (
                      <span className="text-[9.5px] font-bold tracking-[0.14em] uppercase text-[#9C9689] shrink-0">
                        {coupon.availability === 'used' ? 'Used' : coupon.availability === 'expired' ? 'Expired' : 'Not yet active'}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Points ledger */}
      {summary && summary.transactions.length > 0 && (
        <AccountCard className="overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8D5A8]">
            <h2 className="font-serif text-lg text-[#121212]">Points Activity</h2>
          </div>
          <ul className="divide-y divide-[#F1EBDD]">
            {summary.transactions.map((tx) => (
              <li key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[13px] text-[#121212] block truncate">{tx.description}</span>
                  <span className="text-[11px] text-[#6B6B6B]">{formatDate(tx.createdAt)}</span>
                </div>
                <span
                  className={`font-mono text-[13px] font-semibold shrink-0 ${
                    tx.points >= 0 ? 'text-[#C9972B]' : 'text-[#C0392B]'
                  }`}
                >
                  {tx.points >= 0 ? '+' : ''}
                  {tx.points} pts
                </span>
              </li>
            ))}
          </ul>
        </AccountCard>
      )}
    </div>
  );
};
