/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CANCELLABLE_ORDER_STATUSES, Order, OrderStatus, ORDER_STATUS_SEQUENCE } from '@glamirk/shared/types';

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
] as const;

export type OrderFilterId = (typeof ORDER_FILTERS)[number]['id'];

export function matchesOrderFilter(order: Order, filter: OrderFilterId): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'PROCESSING':
      return ['PLACED', 'CONFIRMED', 'PACKED'].includes(order.status);
    case 'SHIPPED':
      return order.status === 'SHIPPED';
    case 'OUT_FOR_DELIVERY':
      return order.status === 'OUT_FOR_DELIVERY';
    case 'DELIVERED':
      return order.status === 'DELIVERED';
    case 'CANCELLED':
      return order.status === 'CANCELLED';
    case 'RETURNED':
      return order.status === 'RETURN_REQUESTED';
    default:
      return true;
  }
}

export function orderStatusTone(status: OrderStatus): 'neutral' | 'positive' | 'negative' | 'progress' {
  if (status === 'DELIVERED') return 'positive';
  if (status === 'CANCELLED') return 'negative';
  if (status === 'RETURN_REQUESTED') return 'neutral';
  return 'progress';
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: 'Order Placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return Requested',
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
  const reached = new Map<string, string>();
  for (const event of order.timeline || []) {
    if (!reached.has(event.status)) reached.set(event.status, event.timestamp);
  }

  if (order.status === 'CANCELLED') {
    return (order.timeline || []).map((event) => ({
      status: event.status,
      label: ORDER_STATUS_LABEL[event.status] || event.status,
      reachedAt: event.timestamp,
      complete: true,
    }));
  }

  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(order.status);
  return ORDER_STATUS_SEQUENCE.map((status, index) => ({
    status,
    label: ORDER_STATUS_LABEL[status],
    reachedAt: reached.get(status),
    complete: reached.has(status) || (currentIndex >= 0 && index <= currentIndex),
  }));
}
