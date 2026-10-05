/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CANCELLABLE_ORDER_STATUSES,
  canonicalOrderStatus,
  Order,
  OrderStatus,
  ORDER_STATUS_SEQUENCE,
} from '@glamirk/shared/types';

// Shared order-status vocabulary for the account screens. All of it derives
// from the single source of truth in src/types.ts that the server enforces —
// so what the UI offers can never drift from what the API will accept.

export const ORDER_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'SHIPPED', label: 'Shipped' },
  { id: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'RETURNED', label: 'Returned' },
  { id: 'REFUNDED', label: 'Refunded' },
] as const;

export type OrderFilterId = (typeof ORDER_FILTERS)[number]['id'];

export function matchesOrderFilter(order: Order, filter: OrderFilterId): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'PROCESSING':
      // Covers both spellings of the pre-dispatch stages, so an order placed
      // before the lifecycle split still appears under the same tab.
      return ['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'READY_TO_SHIP'].includes(order.status);
    case 'SHIPPED':
      return order.status === 'SHIPPED';
    case 'OUT_FOR_DELIVERY':
      return order.status === 'OUT_FOR_DELIVERY';
    case 'DELIVERED':
      return order.status === 'DELIVERED';
    case 'CANCELLED':
      // An RTO is a cancellation from the customer's point of view: the parcel
      // never arrived and the order ended.
      return order.status === 'CANCELLED' || order.status === 'RTO';
    // "Returned" is a return still in flight; once the money is back it moves
    // to "Refunded" instead, so the two tabs never both claim the same order.
    case 'RETURNED':
      return !!order.refundStatus && order.refundStatus !== 'REFUNDED';
    case 'REFUNDED':
      return order.refundStatus === 'REFUNDED';
    default:
      return true;
  }
}

export function orderStatusTone(status: OrderStatus): 'neutral' | 'positive' | 'negative' | 'progress' {
  if (status === 'DELIVERED') return 'positive';
  if (status === 'CANCELLED' || status === 'RTO') return 'negative';
  if (status === 'RETURN_REQUESTED' || status === 'RETURNED' || status === 'PENDING_PAYMENT') return 'neutral';
  return 'progress';
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting Payment',
  // Legacy spellings. Still shown on orders placed before the lifecycle
  // split, worded so a customer sees a sensible stage rather than an
  // internal code.
  PLACED: 'Order Placed',
  PACKED: 'Packed',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being Prepared',
  READY_TO_SHIP: 'Ready to Ship',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return Requested',
  RETURNED: 'Returned',
  RTO: 'Returned to Sender',
};

/** Mirrors the server's CANCELLABLE_ORDER_STATUSES so the button is only
 * shown when the API would actually honour it. */
export function canCancel(order: Order): boolean {
  return CANCELLABLE_ORDER_STATUSES.includes(order.status);
}

/** Returns can only be raised against delivered orders — the same rule
 * POST /orders/:orderId/returns enforces. */
export function canReturn(order: Order): boolean {
  return order.status === 'DELIVERED';
}

export function canReview(order: Order): boolean {
  return order.status === 'DELIVERED';
}

/**
 * The stages to draw on a progress timeline, each marked reached or not.
 *
 * Only statuses the order genuinely passed through are marked complete: the
 * timeline rows come from order_status_history, so an order sitting at PACKED
 * shows Shipped and beyond as pending rather than implying movement that
 * hasn't happened. A cancelled order is shown as its real, truncated history
 * instead of being forced onto the delivery track.
 */
export function buildProgressStages(order: Order): { status: OrderStatus; label: string; reachedAt?: string; complete: boolean }[] {
  // Keyed by canonical status: a legacy PLACED history row satisfies the
  // CONFIRMED stage, so an order placed before the lifecycle split still shows
  // its early stages as genuinely reached rather than as pending.
  const reached = new Map<string, string>();
  for (const event of order.timeline || []) {
    const key = canonicalOrderStatus(event.status);
    if (!reached.has(key)) reached.set(key, event.timestamp);
  }

  // An order that ended early is shown as its real, truncated history rather
  // than being forced onto the delivery track it never completed.
  if (order.status === 'CANCELLED' || order.status === 'RTO' || order.status === 'RETURNED') {
    return (order.timeline || []).map((event) => ({
      status: event.status,
      label: ORDER_STATUS_LABEL[event.status] || event.status,
      reachedAt: event.timestamp,
      complete: true,
    }));
  }

  // Legacy PLACED/PACKED orders are normalised onto the canonical ladder so
  // they render against the same stages as everything else — without this
  // they would find no index and show every stage as pending.
  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(canonicalOrderStatus(order.status));
  return ORDER_STATUS_SEQUENCE
    // A paid or COD order never shows an "awaiting payment" stage it has
    // already passed; only an order actually sitting there does.
    .filter((status) => status !== 'PENDING_PAYMENT' || order.status === 'PENDING_PAYMENT')
    .map((status) => {
      const index = ORDER_STATUS_SEQUENCE.indexOf(status);
      return {
        status,
        label: ORDER_STATUS_LABEL[status],
        // A legacy event (PLACED) satisfies the stage it maps to (CONFIRMED).
        reachedAt: reached.get(status),
        complete: reached.has(status) || (currentIndex >= 0 && index <= currentIndex),
      };
    });
}
