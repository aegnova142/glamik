# Tracking and webhooks

Two ways a scan reaches Glamirk, both ending in the same function.

| Path | Trigger | Status |
|---|---|---|
| **Scan Push** (webhook) | Delhivery POSTs on every scan | endpoint ready; **not yet enabled by Delhivery** |
| **Polling** | admin presses "Track" | live |

Both write through `recordTrackingEvents` and `applyShippingStatus`, under the
same dedupe key, so pressing "Track" on a parcel whose webhooks already arrived
adds nothing rather than duplicating its history.

## The webhook endpoint

```
POST https://glamirk.com/api/webhooks/delhivery
Content-Type: application/json
x-api-key: <DELHIVERY_WEBHOOK_SECRET>
```

`authorization` is accepted as an alternative header.

### Four steps, in this order

1. **Verify before reading anything.** An unverified body is attacker-controlled
   input and is never acted on. Checked *before* the JSON is parsed.
2. **Claim the event** in `webhook_events`. The unique `(source, event_id)` index
   is what makes processing idempotent across restarts — not an in-memory set.
3. **Acknowledge fast.** The HTTP response is sent as soon as the event is
   durably recorded; the work happens after. Providers retry on timeout.
4. **Record the outcome**, so a failed event can be found and replayed.

### Authentication

Constant-time comparison with a length pre-check (`timingSafeEqual` throws on a
length mismatch). **Fails closed**: with no secret configured nothing is
accepted, in any environment.

Verified live against production:

| Request | Response |
|---|---|
| no key | `401` |
| wrong key | `401` |
| same-length wrong key | `401` |
| correct key | `200 {"received":true,"duplicate":false}` |

The secret appears in no log line, no stored payload, and no stored error.

### Event ids

Delhivery sends no event id. Inventing a random one would defeat the purpose —
every redelivery would look new. One is derived from the fields Delhivery does
send on every push:

```
dlvstat-<sha256(waybill|orderId|statusType|status|timestamp)>
```

An identical redelivery collapses onto the same row; a genuine next status does
not. Scans get their own key (`dlvscan-…`) from waybill, order, date, activity
and location.

**Proven live:** two authenticated deliveries of the same body produced exactly
one `webhook_events` row; the second returned `duplicate` without reprocessing.

### Resolving which order a push is about

Two identifiers arrive and they mean different things: the waybill is the
tracking number we drew and stored, the reference is the order number we sent at
creation. **Both are values Glamirk wrote**, so both are checked against what we
hold rather than either being taken on trust.

Any identifier present on both sides that disagrees **stops processing**. A push
claiming one order's number and another's waybill is either a provider bug or
someone probing, and acting on either alone moves the wrong parcel's order.

Nothing in the payload can name an order directly. There is no path by which a
webhook can modify an arbitrary order.

## Status mapping

Delhivery reports a `(StatusType, Status)` pair. Neither alone is enough —
"Dispatched" means out-for-delivery on a forward shipment and in-transit on a
return; "Delivered" with type `DL` is a sale completed while "RTO" with type `DL`
is a parcel that came back.

| Pair | Glamirk status |
|---|---|
| `UD/Manifested` | `AWB_ASSIGNED` |
| `UD/Not Picked` | `PICKUP_SCHEDULED` |
| `UD/In Transit`, `UD/Pending` | `IN_TRANSIT` |
| `UD/Dispatched` | `OUT_FOR_DELIVERY` |
| `DL/Delivered` | `DELIVERED` |
| `RT/In Transit`, `RT/Pending`, `RT/Dispatched` | `RTO_INITIATED` |
| `DL/RTO`, `DL/DTO` | `RTO_DELIVERED` |
| `PP/Open`, `PP/Scheduled` | `PICKUP_SCHEDULED` |
| `PP/Dispatched` | `PICKED_UP` |
| `PU/In Transit`, `PU/Pending`, `PU/Dispatched` | `IN_TRANSIT` |
| `CN/Canceled`, `CN/Cancelled`, `CN/Closed` | `CANCELLED` |

**Anything outside this table maps to `null`.** Null means *record it verbatim,
change nothing*. Approximating an unknown status is how a parcel still in transit
gets marked delivered — which on this system also converts reserved stock into
sold.

A known status under the wrong type is still unknown (`PP/Delivered` → `null`).

## Applying a status

`applyShippingStatus` owns every transition. It:

- updates the shipment and the order's `shipping_status` by conditional UPDATE;
- returns `false` when neither moved — the common case for a redelivered webhook;
- **refuses to drag a terminal order backwards**, reading the order's status
  directly rather than from the conditional UPDATE's `RETURNING` (that returns
  nothing when `shipping_status` already matched, which once let a late scan
  move a `DELIVERED` order back to `SHIPPED`);
- on `DELIVERED`, marks a COD order `PAID` and converts reserved stock to sold;
- on `RTO_DELIVERED`, restores stock.

## Reconciliation

`reconcileStuckWebhookEvents` runs on an interval and replays events stuck at
`RECEIVED` or `FAILED` (attempt count < 5, older than two minutes). It handles
`razorpay` and `delhivery` sources, re-reading the stored payload through the
**same parser and the same strict mapping** as a live push — a stored payload
cannot take a more permissive path on its second attempt.

> This sweep replays **webhook events only**. It does not retry failed shipment
> bookings, pickups or labels. See [06](06-failure-and-safety.md#no-automatic-retry).

## Customer-facing tracking

`buildOrderTracking` (`shipping.service.ts`) assembles the tracking view. With no
courier provider registered — or one registered but no scan yet — it reports the
real internal order status and says so via `source: 'internal'`. Inventing
plausible-looking scan events would be worse than useless: a customer would act
on them.

In production the Delhivery provider is registered **only when live mode is on**,
so the mock is never a tracking source for a real customer.

> **Performance note:** this calls the courier API on every tracking page view,
> uncached. The scans are already stored in `shipment_tracking_events`; serving
> from there would remove a per-view upstream call.

## Enabling Scan Push

Request from Delhivery for client **GLAMIRK B2C**:

| Field | Value |
|---|---|
| URL | `https://glamirk.com/api/webhooks/delhivery` |
| Method | `POST` |
| Content-Type | `application/json` |
| Auth header | `x-api-key` |
| Auth value | the configured `DELHIVERY_WEBHOOK_SECRET` — share over a secure channel, never in a ticket |

Until they enable it, no scan arrives and the admin "Track" button is the only
way to refresh a shipment.
