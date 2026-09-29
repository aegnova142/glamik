import { OrderStatus, OrderTimelineEvent, OrderTracking } from '@glamirk/shared/types';

// ==========================================
// SHIPMENT TRACKING INTEGRATION LAYER
//
// Glamirk has no courier account wired up yet. Rather than inventing
// plausible-looking scan events (which would be worse than useless — a
// customer would act on them), this module reports the real internal order
// status and says so explicitly via `source: 'internal'`.
//
// To connect a courier later, implement a CourierProvider and register it in
// resolveProvider() below. Nothing else in the app needs to change: the
// /account/orders/:id/track endpoint and the tracking UI already read
// whatever this returns, including the courier fields, which stay null until
// a provider fills them in.
// ==========================================

export interface CourierShipment {
  trackingNumber: string;
  courierPartner: string;
  trackingUrl?: string;
  /** Courier scans, newest last, already mapped onto Glamirk's own status
   * vocabulary so the timeline component doesn't need per-courier knowledge. */
  events: OrderTimelineEvent[];
  currentStatus?: OrderStatus;
}

export interface CourierProvider {
  readonly name: string;
  /** Returns null when the courier has no record of this AWB yet (a label
   * printed but not scanned) — the caller then falls back to internal status
   * rather than showing an empty tracking screen. */
  fetchShipment(trackingNumber: string): Promise<CourierShipment | null>;
}

/**
 * Registry for a real courier integration.
 *
 * Example of wiring one up:
 *
 *   const delhivery: CourierProvider = {
 *     name: 'Delhivery',
 *     async fetchShipment(awb) {
 *       const res = await fetch(`https://track.delhivery.com/api/v1/packages/json/?waybill=${awb}`, {
 *         headers: { Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}` },
 *       });
 *       if (!res.ok) return null;
 *       return mapDelhiveryResponse(await res.json());
 *     },
 *   };
 *   providers.set('delhivery', delhivery);
 */
const providers = new Map<string, CourierProvider>();

export function registerCourierProvider(key: string, provider: CourierProvider): void {
  providers.set(key.toLowerCase(), provider);
}

export function isCourierConfigured(): boolean {
  return providers.size > 0;
}

function resolveProvider(courierPartner?: string | null): CourierProvider | null {
  if (providers.size === 0) return null;
  if (courierPartner) {
    const match = providers.get(courierPartner.toLowerCase());
    if (match) return match;
  }
  // A single registered provider serves every shipment; with several, the
  // order's courier_partner column decides and an unknown value gets none
  // rather than being routed to an arbitrary carrier.
  return providers.size === 1 ? [...providers.values()][0] : null;
}

const INTERNAL_SOURCE_NOTE =
  'Live courier tracking is not connected yet. The stages below are Glamirk’s own fulfilment updates, recorded as your order moves through the atelier.';

const COURIER_SOURCE_NOTE = 'Live scans from your courier partner.';

const AWAITING_SCAN_NOTE =
  'Your shipment has been handed to the courier. Scan updates will appear here once it enters their network; until then these are Glamirk’s own fulfilment updates.';

/**
 * Builds the tracking view for one order. `order` is the already-assembled
 * Order plus the raw courier columns from the orders row.
 */
export async function buildOrderTracking(params: {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  timeline: OrderTimelineEvent[];
  estimatedDelivery: string;
  trackingNumber?: string | null;
  courierPartner?: string | null;
  courierTrackingUrl?: string | null;
}): Promise<OrderTracking> {
  const base: OrderTracking = {
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    status: params.status,
    timeline: params.timeline,
    estimatedDelivery: params.estimatedDelivery,
    trackingNumber: params.trackingNumber || undefined,
    courierPartner: params.courierPartner || undefined,
    courierTrackingUrl: params.courierTrackingUrl || undefined,
    source: 'internal',
    sourceNote: params.trackingNumber ? AWAITING_SCAN_NOTE : INTERNAL_SOURCE_NOTE,
  };

  const provider = resolveProvider(params.courierPartner);
  if (!provider || !params.trackingNumber) return base;

  try {
    const shipment = await provider.fetchShipment(params.trackingNumber);
    if (!shipment) return base;
    return {
      ...base,
      timeline: shipment.events.length > 0 ? shipment.events : base.timeline,
      status: shipment.currentStatus || base.status,
      trackingNumber: shipment.trackingNumber,
      courierPartner: shipment.courierPartner,
      courierTrackingUrl: shipment.trackingUrl || base.courierTrackingUrl,
      source: 'courier',
      sourceNote: COURIER_SOURCE_NOTE,
    };
  } catch (err) {
    // A courier API outage must degrade to internal status, never to an
    // error page for an order that is perfectly fine.
    console.error('Courier tracking lookup failed:', err);
    return base;
  }
}
