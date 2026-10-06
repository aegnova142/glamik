/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CreditCard, Receipt, RotateCcw, Wallet } from 'lucide-react';
import { PaymentRecord, RefundRecord, ReturnStatus, RETURN_STATUSES } from '@glamirk/shared/types';
import { getPaymentMethodLabel, getPaymentStatusLabel } from '@glamirk/shared/utils/paymentDisplay';
import { useAccount } from '../../../context/AccountContext';
import { ProductImage } from '../../product/ProductImage';
import {
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  AccountSectionHeader,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatMoney,
} from '../AccountUI';

interface PaymentsSectionProps {
  onOpenOrder: (orderId: string) => void;
  onExploreShop: () => void;
}

type PaymentsTab = 'payments' | 'refunds';

/** A refund's progress through the return pipeline, as a 0-1 fraction. Drawn
 * from RETURN_STATUSES so the bar can never disagree with the statuses the
 * server actually sets. */
function refundProgress(status: ReturnStatus): number {
  const index = RETURN_STATUSES.indexOf(status);
  if (index < 0) return 0;
  return (index + 1) / RETURN_STATUSES.length;
}

const SummaryTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}> = ({ icon: Icon, label, value, hint }) => (
  <AccountCard className="p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#C9972B] stroke-[1.5]" />
      </div>
      <div className="min-w-0">
        <span className="text-[9.5px] font-semibold tracking-[0.18em] uppercase text-[#6B6B6B] block">{label}</span>
        <span className="font-serif text-xl text-[#121212] block mt-0.5">{value}</span>
        {hint && <span className="text-[10.5px] text-[#9C9689] block mt-0.5 leading-snug">{hint}</span>}
      </div>
    </div>
  </AccountCard>
);

export const PaymentsSection: React.FC<PaymentsSectionProps> = ({ onOpenOrder, onExploreShop }) => {
  const { payments, loadPayments } = useAccount();
  const [tab, setTab] = useState<PaymentsTab>('payments');

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const header = (
    <AccountSectionHeader
      kicker="Billing"
      title="Payments & Refunds"
      description="Every payment on your orders and the progress of any money coming back to you."
    />
  );

  if (payments.loading && !payments.loaded) {
    return (
      <div className="space-y-6">
        {header}
        <AccountLoading label="Loading your payments" />
      </div>
    );
  }

  if (payments.error && !payments.data) {
    return (
      <div className="space-y-6">
        {header}
        <AccountError message={payments.error} onRetry={() => loadPayments(true)} />
      </div>
    );
  }

  const data = payments.data;
  const paymentRows: PaymentRecord[] = data?.payments || [];
  const refundRows: RefundRecord[] = data?.refunds || [];

  const tabs: { id: PaymentsTab; label: string; count: number }[] = [
    { id: 'payments', label: 'Payments', count: paymentRows.length },
    { id: 'refunds', label: 'Refunds', count: refundRows.length },
  ];

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <SummaryTile icon={Receipt} label="Total Paid" value={formatMoney(data?.totalPaid || 0)} />
        <SummaryTile
          icon={Wallet}
          label="Due on Delivery"
          value={formatMoney(data?.pendingCod || 0)}
          hint="Across orders still on their way"
        />
        <SummaryTile icon={RotateCcw} label="Refunded" value={formatMoney(data?.totalRefunded || 0)} />
      </div>

      {/* Glamirk is Cash on Delivery only today. Saying so plainly is better
          than an empty "saved cards" panel implying a feature that isn't
          there — and it explains why the list below looks the way it does. */}
      <div className="bg-[#FAF9F6] border border-[#E8D5A8] rounded-xl px-4 py-3.5 flex items-start gap-3">
        <CreditCard className="w-4 h-4 text-[#C9972B] shrink-0 mt-0.5 stroke-[1.5]" />
        <p className="text-[11.5px] text-[#6B6B6B] leading-relaxed">
          All Glamirk orders are Cash on Delivery at the moment, so there are no saved cards or UPI handles to manage
          here. When online payment arrives, your saved methods will live on this page.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Payments and refunds">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-[11px] font-semibold tracking-[0.14em] uppercase rounded-full border whitespace-nowrap transition-colors cursor-pointer ${
              tab === t.id
                ? 'bg-[#0B0B0B] text-white border-[#0B0B0B]'
                : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:border-[#C9972B]'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 opacity-70">({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === 'payments' &&
        (paymentRows.length === 0 ? (
          <AccountEmpty
            icon={Receipt}
            title="No payments yet."
            description="Once you place an order, every payment on it will be listed here."
            actionLabel="Explore Products"
            onAction={onExploreShop}
          />
        ) : (
          <div className="space-y-3">
            {paymentRows.map((p) => (
              <AccountCard key={p.orderId} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <button
                      onClick={() => onOpenOrder(p.orderId)}
                      className="font-serif text-[15px] text-[#121212] hover:text-[#C9972B] transition-colors cursor-pointer text-left"
                    >
                      Order #{p.orderNumber}
                    </button>
                    <p className="text-[11px] text-[#6B6B6B]">
                      {formatDate(p.placedAt)} · {getPaymentMethodLabel(p.method)}
                      {p.instrumentLabel && <span className="text-[#9C9689]"> · {p.instrumentLabel}</span>}
                    </p>
                    {p.paidAt && <p className="text-[10.5px] text-[#9C9689]">Paid {formatDateTime(p.paidAt)}</p>}
                  </div>
                  <div className="text-right shrink-0 space-y-1.5">
                    <span className="font-serif text-lg text-[#121212] block">{formatMoney(p.amount)}</span>
                    <StatusBadge
                      status={getPaymentStatusLabel(p.status)}
                      tone={p.status === 'PAID' ? 'positive' : 'neutral'}
                    />
                  </div>
                </div>
              </AccountCard>
            ))}
          </div>
        ))}

      {tab === 'refunds' &&
        (refundRows.length === 0 ? (
          <AccountEmpty
            icon={RotateCcw}
            title="No refunds in progress."
            description="If you return something, you'll be able to follow the refund here from request to settlement."
          />
        ) : (
          <div className="space-y-3">
            {refundRows.map((r) => {
              const settled = r.status === 'REFUNDED';
              return (
                <AccountCard key={r.returnId} className="p-4 sm:p-5 space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-14 h-14 rounded-lg bg-[#FAF9F6] border border-[#E8D5A8] overflow-hidden shrink-0">
                      <ProductImage preset="thumb" src={r.productImage} alt={r.productName} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-serif text-[14.5px] text-[#121212] leading-snug">{r.productName}</p>
                      <button
                        onClick={() => onOpenOrder(r.orderId)}
                        className="text-[11px] text-[#6B6B6B] hover:text-[#C9972B] transition-colors cursor-pointer"
                      >
                        Order #{r.orderNumber}
                      </button>
                      <p className="text-[10.5px] text-[#9C9689]">Requested {formatDate(r.requestedAt)}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <span className="font-serif text-[15px] text-[#121212] block">{formatMoney(r.amount)}</span>
                      <StatusBadge status={r.status} tone={settled ? 'positive' : 'progress'} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-1.5 bg-[#F1EBDD] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C9972B] rounded-full transition-[width] duration-500"
                        style={{ width: `${refundProgress(r.status) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10.5px] text-[#9C9689]">
                      {settled
                        ? `Settled ${formatDate(r.updatedAt)}`
                        : r.method === 'cod'
                        ? // A COD order was never charged to an instrument, so
                          // there is nothing to reverse automatically. Saying
                          // this up front avoids someone waiting on a card
                          // refund that is never going to arrive.
                          'This was a Cash on Delivery order, so our team will arrange your refund directly.'
                        : `Refund to your ${getPaymentMethodLabel(r.method)} once the return is approved.`}
                    </p>
                  </div>
                </AccountCard>
              );
            })}
          </div>
        ))}
    </div>
  );
};
