/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Package, Truck, Info, ExternalLink, Check, Circle, Copy, CheckCheck } from 'lucide-react';
import { Order, OrderTracking } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { AccountButton, AccountCard, AccountEmpty, AccountError, AccountLoading, StatusBadge, formatDate, formatDateTime } from '../AccountUI';
import { ORDER_STATUS_LABEL, buildProgressStages, orderStatusTone } from './orderStatus';

interface OrderTrackSectionProps {
  order?: Order;
  orderId?: string;
  isOrdersLoading: boolean;
  onBackToOrders: () => void;
  onOpenOrder: (orderId: string) => void;
  onOpenHelp: (orderId: string) => void;
}

export const OrderTrackSection: React.FC<OrderTrackSectionProps> = ({
  order,
  orderId,
  isOrdersLoading,
  onBackToOrders,
  onOpenOrder,
  onOpenHelp,
}) => {
  const { fetchOrderTracking } = useAccount();
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = React.useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    const res = await fetchOrderTracking(orderId);
    setLoading(false);
    if (res.tracking) setTracking(res.tracking);
    else setError(res.error || 'Could not load tracking for this order.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !tracking) return <AccountLoading label="Loading tracking" rows={2} />;

  if (error && !tracking) {
    return <AccountError message={error} onRetry={load} />;
  }

  if (!tracking && !order) {
    if (isOrdersLoading) return <AccountLoading label="Loading tracking" rows={2} />;
    return (
      <AccountEmpty
        icon={Package}
        title="Order not found"
        description="We couldn't find this order in your account."
        actionLabel="Back to My Orders"
        onAction={onBackToOrders}
      />
    );
  }

  // The endpoint is the source of truth; `order` is only a fallback for the
  // brief window before the first tracking response lands.
  const status = tracking?.status || order!.status;
  const orderNumber = tracking?.orderNumber || order!.orderNumber;
  const stages = tracking
    ? buildProgressStages({ ...(order || ({} as Order)), status, timeline: tracking.timeline } as Order)
    : buildProgressStages(order!);

  const handleCopy = () => {
    if (!tracking?.trackingNumber) return;
    navigator.clipboard?.writeText(tracking.trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      <AccountCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-serif text-lg text-[#121212]">#{orderNumber}</span>
              <StatusBadge status={status} tone={orderStatusTone(status)} />
            </div>
            <p className="text-[11.5px] text-[#524C4C] mt-1">
              {status === 'DELIVERED'
                ? 'Delivered'
                : status === 'CANCELLED'
                ? 'This order was cancelled'
                : `Estimated delivery by ${formatDate(tracking?.estimatedDelivery || order?.estimatedDelivery)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AccountButton variant="ghost" onClick={() => onOpenOrder(order?.id || orderId || '')}>
              View Order
            </AccountButton>
            <AccountButton variant="ghost" onClick={() => onOpenHelp(order?.id || orderId || '')}>
              Get Help
            </AccountButton>
          </div>
        </div>
      </AccountCard>

      {/* Where the data actually comes from. Stated plainly rather than
          dressing internal fulfilment stages up as live courier scans. */}
      {tracking && (
        <div className="flex gap-3 bg-[#FAF9F6] border border-[#E8D5A8] rounded-xl p-4">
          <Info className="w-4 h-4 text-[#C9972B] shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-2">
            <p className="text-[11.5px] text-[#524C4C] leading-relaxed">{tracking.sourceNote}</p>
            {tracking.trackingNumber && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#524C4C]">
                  {tracking.courierPartner || 'Courier'} AWB
                </span>
                <code className="text-[12px] font-mono text-[#121212] bg-white border border-[#E8D5A8] rounded px-2 py-1">
                  {tracking.trackingNumber}
                </code>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-[0.1em] uppercase text-[#C9972B] hover:underline cursor-pointer"
                >
                  {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {tracking.courierTrackingUrl && (
                  <a
                    href={tracking.courierTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-[0.1em] uppercase text-[#C9972B] hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Track on courier site
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <AccountCard className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <Truck className="w-4 h-4 text-[#C9972B]" />
          <h2 className="font-serif text-base text-[#121212]">Shipment Progress</h2>
        </div>

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
                  {stage.label || ORDER_STATUS_LABEL[stage.status]}
                </span>
                <span className="text-[11px] text-[#524C4C]">
                  {stage.reachedAt ? formatDateTime(stage.reachedAt) : 'Pending'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </AccountCard>
    </div>
  );
};
