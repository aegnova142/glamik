// ==========================================
// SHIPPING PROVIDER — provider-neutral contract
//
// The previous interface lived inside shiprocket.service.ts and was shaped by
// Shiprocket's own model: pick a courier from quoted rates, create a shipment,
// then buy an AWB for it, then generate a manifest and an invoice as separate
// documents. That is one aggregator's workflow, not a general one.
//
// Delhivery does none of those things. A waybill is drawn from a pool BEFORE
// the shipment exists, Delhivery chooses the carrier itself (there is no rate
// shopping and nothing to select), and there is no manifest or invoice
// endpoint at all. Renaming the old methods onto it would have produced an
// adapter full of functions that either lie or throw.
//
// So the contract is expressed as capabilities a provider either has or does
// not, and callers ask rather than assume. Optional methods are genuinely
// optional: `capabilities.ratesShopping === false` means no caller should be
// reaching for a courier list, and `fetchWaybill` being absent means the
// provider allocates its own tracking number at creation time.
// ==========================================

import { ShippingStatus, OrderTimelineEvent } from '@glamirk/shared/types';

/**
 * One open shape rather than a discriminated union on `ok`.
 *
 * This project compiles without `strict`, where narrowing on a literal-boolean
 * discriminant is unreliable — the same reason validateAddressPayload in
 * customer.routes.ts is written this way. Callers check `ok` and then read
 * `value`/`error`.
 */
export interface ProviderResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  /** True when retrying could plausibly succeed: timeout, network, 5xx, 429. */
  retryable?: boolean;
}

/**
 * What a provider can actually do.
 *
 * Declared rather than inferred so that orchestration can branch on a fact
 * instead of on `typeof provider.someMethod === 'function'`, and so adding a
 * third provider later forces an explicit answer for each one.
 */
export interface ProviderCapabilities {
  /** Returns a list of carriers with prices to choose between. Aggregators do;
   *  a carrier operating its own network does not. */
  ratesShopping: boolean;
  /** Tracking numbers must be drawn before a shipment is created. */
  waybillPreallocation: boolean;
  /** Pickups are booked per warehouse and date, not per shipment. */
  warehouseLevelPickup: boolean;
  /** A shipment's details can be edited after creation. */
  shipmentEdit: boolean;
  /** Produces a printable handover manifest as its own document. */
  manifest: boolean;
  /** Produces a tax invoice as its own document. */
  invoice: boolean;
}

// ------------------------------------------
// Inputs
// ------------------------------------------

export interface ShipmentAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pinCode: string;
  country?: string;
}

export interface ShipmentItem {
  name: string;
  sku: string;
  units: number;
  sellingPrice: number;
}

/**
 * Everything a provider needs to create a forward shipment.
 *
 * Deliberately describes the *order*, not any provider's payload. Each adapter
 * maps these fields onto its own request shape.
 */
export interface CreateShipmentInput {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  address: ShipmentAddress;
  items: ShipmentItem[];
  subtotal: number;
  discount: number;
  total: number;
  isCod: boolean;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  /** Pre-allocated tracking number, when capabilities.waybillPreallocation. */
  waybill?: string;
  /** Invoice/receipt reference printed on the label where the provider supports it. */
  sellerInvoice?: string;
}

/**
 * How the shipment is being paid for.
 *
 * Named in Glamirk's terms. Adapters translate — Delhivery, for instance, maps
 * these onto Prepaid / COD / Pickup / REPL.
 */
export type ShipmentPaymentMode = 'PREPAID' | 'COD' | 'REVERSE_PICKUP' | 'REPLACEMENT';

// ------------------------------------------
// Outputs
// ------------------------------------------

export interface ServiceabilityResult {
  serviceable: boolean;
  /** Set when the provider says "not right now" rather than "never" — an
   * embargo, a temporary suspension. Distinguishing the two matters: one is a
   * permanent refusal to sell, the other is worth retrying. */
  temporary: boolean;
  /** The provider's own wording, kept verbatim for operators. */
  remark?: string;
  city?: string;
  state?: string;
  codAvailable?: boolean;
  prepaidAvailable?: boolean;
  raw?: unknown;
}

export interface CreatedShipment {
  /** The provider's own handle for the shipment, where it has one distinct
   * from the tracking number. */
  providerShipmentId?: string;
  /** The tracking number the customer will use. */
  waybill: string;
  /** The order reference the provider echoed back. */
  providerOrderRef?: string;
  courierName?: string;
  trackingUrl?: string;
  raw?: unknown;
}

export interface TrackingScan {
  /** Raw timestamp string exactly as received, kept so an unparseable format
   * stays auditable rather than silently becoming null. */
  rawDate: string | null;
  scanAt: Date | null;
  activity: string | null;
  location: string | null;
  /** Provider status code/type pair, verbatim. */
  providerStatus: string | null;
  providerStatusType: string | null;
}

export interface TrackingResult {
  /** Mapped Glamirk status, or null when the provider reported something this
   * build does not recognise. Null means "record it, change nothing" — never
   * guess, because guessing DELIVERED converts reserved stock into sold. */
  status: ShippingStatus | null;
  providerStatus: string | null;
  providerStatusType: string | null;
  scans: TrackingScan[];
  events: OrderTimelineEvent[];
  courierName?: string;
  deliveredAt?: string;
  /** Estimated delivery, where the provider supplies one. */
  expectedDelivery?: string;
  raw?: unknown;
}

export interface PickupRequestInput {
  /** Registered warehouse name. Must match the provider's record exactly. */
  pickupLocation: string;
  /** YYYY-MM-DD */
  pickupDate: string;
  /** HH:MM:SS */
  pickupTime: string;
  expectedPackageCount: number;
}

export interface PickupRequestResult {
  /** The provider's reference for the booked pickup, where it returns one. */
  pickupId?: string;
  scheduledFor?: string;
  raw?: unknown;
}

// ------------------------------------------
// The contract
// ------------------------------------------

export interface ShipmentProvider {
  readonly name: string;
  readonly isMock: boolean;
  readonly capabilities: ProviderCapabilities;

  /** Can this destination be delivered to at all? Checked before a shipment is
   * created, so an unserviceable pincode fails early and cheaply. */
  checkPincode(input: {
    deliveryPincode: string;
    isCod: boolean;
  }): Promise<ProviderResult<ServiceabilityResult>>;

  /** Draws a tracking number. Present only when
   * capabilities.waybillPreallocation. */
  fetchWaybill?(): Promise<ProviderResult<{ waybill: string }>>;

  createShipment(input: CreateShipmentInput, paymentMode: ShipmentPaymentMode): Promise<ProviderResult<CreatedShipment>>;

  track(waybill: string, orderRef?: string): Promise<ProviderResult<TrackingResult>>;

  getLabel(input: { waybill: string }): Promise<ProviderResult<{ labelUrl: string; raw?: unknown }>>;

  /** Books a collection. Warehouse-level for providers where
   * capabilities.warehouseLevelPickup — one booking covers every parcel
   * waiting at that warehouse that day, which is why the caller must not call
   * it per shipment. */
  requestPickup(input: PickupRequestInput): Promise<ProviderResult<PickupRequestResult>>;

  /** Cancels a shipment that has not yet moved. Returns ok:false with a
   * non-retryable error when the provider refuses — which is the normal answer
   * once a parcel is in transit. */
  cancelShipment(input: { waybill: string }): Promise<ProviderResult<void>>;

  /** Edits shipment details. Present only when capabilities.shipmentEdit. */
  editShipment?(input: { waybill: string; changes: Record<string, unknown> }): Promise<ProviderResult<void>>;

  /** Estimated transit time. Advisory only — nothing in checkout may depend on
   * it, so the signature permits failure and callers must tolerate it. */
  expectedTat?(input: {
    originPin: string;
    destinationPin: string;
    expectedPickupDate?: string;
  }): Promise<ProviderResult<{ expectedDeliveryDate?: string; raw?: unknown }>>;
}
