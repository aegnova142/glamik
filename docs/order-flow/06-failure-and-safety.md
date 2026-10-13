# Failure modes and safety

## The safety gate

**In production, a real customer order can never reach the mock courier.**

`getShipmentProvider()` returns the mock whenever `env.delhivery.enabled` is
false — in *every* environment, production included. Before the gate existed,
`markOrderPaid` booked through whatever came back, so a paid production order was
written a `MOCKWB…` waybill and a `mock.delhivery.local` tracking URL: a tracking
number the customer can click, resolving to nothing, for a parcel nobody booked.
The order looked shipped and never was.

### How it is enforced

`courierCallsBlocked()` guards the three functions that make courier calls:

```
createShipmentForOrder   ensureWarehousePickup   ensureShipmentLabel
```

Inside the service functions, **not at the call sites** — because the hole was
never one call site. `markOrderPaid` alone is reached from the browser verify
call, the Razorpay webhook and the reconciliation sweep, and the admin
pickup/label actions bypassed the route-level check entirely.

### Why it is airtight

In production `!env.isProduction` is false, so:

```
shipmentsEnabled()  ⟺  env.delhivery.enabled  ⟺  live provider selected
```

The gate opens **exactly** when the live provider is selected. Not approximately
— the same expression decides both. There is no state where a gated function
runs and the mock answers.

Outside production the mock *is* the point, so the gate is a no-op in development
and in tests.

### Blocked means nothing is written

No shipments row, no waybill, no tracking number. An order with no shipment is
the truthful record of "not booked yet", and it is what the admin booking screen
already looks for. A row naming the mock provider would be worse than none.

`cancelShipmentForOrder` is deliberately **not** gated: it returns early without
an `awb_code`, which no order can obtain in mock mode, and cancelling is a
reversing action rather than a creating one.

## When a step fails

| Step fails | What happens | Order state |
|---|---|---|
| Serviceability | `fail()` → shipment `PENDING` + reason | untouched, `NOT_SHIPPED` |
| COD refused at pincode | `fail()` with "must be prepaid or address changed" | untouched |
| Waybill allocation | `fail()`; ambiguous outcomes flagged | untouched |
| `create.json` rejected | `fail()` with Delhivery's own remark | untouched |
| Label | logged, **non-fatal** — booking still succeeds | AWB assigned |
| Pickup | row `FAILED` + reason | untouched, AWB assigned |

`fail()` writes only to `shipments`: `last_error`, `integration_status = PENDING`,
`status = PENDING`. It never touches `orders.tracking_number`. The order's
shipping lifecycle stays `NOT_SHIPPED` — nothing has moved, and showing a
customer anything else would be a lie.

**The Glamirk order is never cancelled, refunded or stock-released because a
courier call failed.** A parcel we have not booked yet is still a sale we owe the
customer. `integration_status` becomes `PENDING` rather than `FAILED` so the
admin list reads it as "waiting to be booked", which is what it is.

This was observed live: the pickup for `GLM87268832` fired automatically at
+5.60s and failed with a 401. The pickup row recorded `FAILED` with the reason;
the order and shipment were untouched; no fake tracking appeared.

## No automatic retry

**This is the main operational gap.**

The background sweeps in `server.ts` are: scheduled account deletions, webhook
reconciliation, inventory consistency, pending-payment expiry, reservation
expiry. **None of them retries a failed shipment booking, pickup, or label.**

| Failed step | Who retries it |
|---|---|
| Shipment booking | nobody — admin must press **Create Shipment** |
| Pickup | the *next order that day* re-attempts it (the partial index only blocks `OPEN` rows). If no further order arrives, admin must press **Request Pickup** |
| Label | nobody — admin must press **Generate Label** |

So the system is fully automatic on the happy path and **silently stops** on
failure. There is no alert either.

### Safe to automate

A bounded sweep would close this, and the underlying functions are already
idempotent and gated:

- shipments with `integration_status = 'PENDING'` and `attempt_count < 5` →
  `createShipmentForOrder()` (the per-order advisory lock already prevents
  duplicates)
- today's `FAILED` pickups → `ensureWarehousePickup()`
- `READY` shipments with a null `label_url` → `ensureShipmentLabel()`

The `attempt_count >= 5` cap prevents an infinite loop. This is an addition, not
a redesign.

## Idempotency inventory

Every one of these is a database guarantee, not a check-then-act:

| Operation | Guard |
|---|---|
| Stock commit | `orders.stock_committed` conditional UPDATE inside the lock |
| Stock restore | `orders.stock_restored`, same shape |
| Mark paid | `payment_status <> 'PAID'` conditional UPDATE |
| Order transition | conditional on the status we believe it is in |
| Shipment booking | advisory lock + unique `order_id` + unique `waybill` |
| Pickup | partial unique index on `(provider, location, date) WHERE OPEN` |
| Label | idempotent by stored URL |
| Webhook event | unique `(source, event_id)` |
| Tracking scan | unique `dedupe_key` — `ON CONFLICT DO NOTHING`, not a prior SELECT, because two deliveries can be in flight at once |

## Secret handling

- The API token lives only in env and only in the server process. It is sent as
  `Authorization: Token …`, never logged, never returned to a browser.
- `scrubDelhiverySecrets()` strips token-shaped material from any operator-facing
  string before it reaches a log, `shipments.last_error`, or an admin response.
- `DELHIVERY_BASE_URL` is validated at startup: HTTPS and a `delhivery.com` host
  only (loopback allowed for a test double), no embedded credentials. Whatever it
  resolves to receives the token on every request, so an unvalidated value there
  is a credential-exfiltration primitive and an SSRF sink.
- Verified in production: zero occurrences of the token or webhook secret across
  both log files, all stored webhook payloads, and all stored errors.

## Test coverage

648 assertions across 8 suites. The safety-critical ones are **mutation-verified**
— the fix was reverted and the test confirmed to fail for the right reason:

| Property | Reverting the fix produces |
|---|---|
| Mock cannot book in production | `tracking_number — MOCKWB00000001`, `shipping_status — AWB_ASSIGNED`, a booked van |
| One order, one parcel | `courier asked to create 2 parcels`, `2 waybills drawn` |
| No backward drag | `DELIVERED order dragged to SHIPPED` |
| Form body encoding | `"format=json&data=…` with a leading quote |
| Waybill never auto-retried | `attempts=2` |
| Edit allowlist | `cancellation reached Delhivery` |

A row count alone never caught the duplicate-parcel bug — the pre-existing
"5 concurrent bookings produce one shipment row" check passed with the bug live.
The replacement counts parcels and waybills at the provider instead.
