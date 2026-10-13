# Three lifecycles, not one

An order carries three independent status columns. Collapsing them into one is
the mistake this design exists to avoid: "where is the parcel" and "have we been
paid" are different questions, and a COD order answers them in the opposite
order from a prepaid one.

| Column | Question | Vocabulary |
|---|---|---|
| `orders.status` | Where is the order in the business process? | `OrderStatus` |
| `orders.payment_status` | Have we been paid? | `PaymentStatus` |
| `orders.shipping_status` | Where is the parcel? | `ShippingStatus` |

All three are defined in `shared/src/types.ts`.

## Order status

```
PENDING_PAYMENT → CONFIRMED → PROCESSING → READY_TO_SHIP
                → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
```

That is `ORDER_STATUS_SEQUENCE` — the canonical ladder. Off-ladder terminal
states: `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, `RTO`.

`PLACED` and `PACKED` are **legacy spellings** that exist on rows written before
the lifecycle split. `ORDER_STATUS_ALIASES` maps them onto the ladder
(`PLACED → CONFIRMED`), and `canonicalOrderStatus()` is what comparison code
must use. Never compare `status` as a raw string.

### Terminal statuses

```ts
TERMINAL_ORDER_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED', 'RTO']
```

An order in one of these is never moved backwards by a courier scan. This is
enforced in `applyShippingStatus`, and it is a real defect class — a late
"in transit" scan arriving after delivery would otherwise un-deliver the order
and re-send its "on the way" email.

## Payment status

```
PENDING · PAID · FAILED · CANCELLED · EXPIRED
REFUNDED · PARTIALLY_REFUNDED · COD_PENDING
```

`COD_PENDING` is the resting state of a cash order: the sale is real, the money
is not collected yet. It becomes `PAID` at the moment the courier reports
delivery — cash in hand is the only honest definition of a COD order being paid.

Only `markOrderPaid` may set `PAID`, and only via a conditional UPDATE, so a
webhook arriving after the browser's verify call produces one commit and one
no-op rather than two.

## Shipping status

```
NOT_SHIPPED · PICKUP_SCHEDULED · AWB_ASSIGNED · PICKED_UP
IN_TRANSIT · OUT_FOR_DELIVERY · DELIVERED · FAILED_DELIVERY
RTO_INITIATED · RTO_DELIVERED · CANCELLED
```

`NOT_SHIPPED` is truthful and load-bearing: an order whose booking failed stays
here rather than being dressed up as shipped.

> **Note on `PICKED_UP`:** Delhivery's forward flow has no "picked up" status.
> A parcel moves `Not Picked → In Transit`, so a forward shipment skips
> `PICKED_UP` entirely. The status is only reached on reverse pickups
> (`PP/Dispatched`). This is a vocabulary mismatch, not a bug.

## How shipping drives order status

`SHIPPING_TO_ORDER_STATUS` (in `shared/src/types.ts`) is the single mapping:

| Shipping status | Order status |
|---|---|
| `PICKED_UP` | `SHIPPED` |
| `IN_TRANSIT` | `SHIPPED` |
| `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` |
| `DELIVERED` | `DELIVERED` |
| `RTO_INITIATED` | `RTO` |
| `RTO_DELIVERED` | `RTO` |

There is exactly one copy of this table. A second copy once lived in
`delhivery.service.ts`; the two drifting apart would mean the timeline a
customer sees disagrees with the status the order is in, so it was removed.

## Who may write what

| Writer | May set |
|---|---|
| `markOrderPaid` | `payment_status = PAID` — nothing else may |
| `transitionOrderStatus` | `status`, conditionally, with side effects |
| `applyShippingStatus` | `shipping_status`, and `status` via the table above |
| `createShipmentForOrder` | `tracking_number`, `courier_partner`, `courier_tracking_url` — **only after Delhivery accepts** |
| Admin manual tracking route | the same three columns, deliberately, by a human |

Every one of these is a conditional UPDATE. Two concurrent callers racing the
same transition produce one winner and one no-op, never two sets of emails.
