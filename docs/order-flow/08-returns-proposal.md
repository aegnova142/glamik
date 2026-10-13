# Returns — current state, proposed design, open policy

**Status: proposal. No code has been written for any of this.**

Written against the working tree as of the refund/notification work (Groups
A–E). Everything under "Today" is read from the code; everything under
"Proposed" awaits approval.

Revision 3 — incorporates the approved return-policy decisions and the
refund-calculation rules derived from them.

---

## 1. Today

### The states that exist

```
RETURN_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PICKUP_SCHEDULED', 'REFUNDED']
```
*(`shared/src/types.ts:1105`)*

Linear, with no branch for a declined return and no state for "we have the
goods back".

### What actually happens

| Step | Where | Effect |
|---|---|---|
| Customer requests a return | `customer.routes.ts:2474` | inserts a `return_requests` row at `SUBMITTED` |
| Admin changes the status | `admin.routes.ts:975` | updates `return_requests.status`, notifies the customer, writes an audit entry |

That is the whole mechanism. **Moving a return to `APPROVED` or even
`REFUNDED` refunds nothing, restocks nothing, and does not touch the order.**
The status is a label.

### Guards that do exist

- Order must be `DELIVERED` (`customer.routes.ts:2483`)
- The product must be a line on that order (`:2487`)
- `UNIQUE (order_id, product_id)` — one return row per product per order,
  surfaced as a 409 at `:2491`

### Smaller gaps

- `SUBMITTED` has customer notification copy (`notifications.service.ts:15`)
  that the create route never fires.
- Nothing notifies the **store** that a return was requested.
- `RETURN_REQUESTED` / `RETURNED` exist in `ORDER_STATUS_SEQUENCE`; the return
  flow never sets either.
- `canReturn()` stays true after filing, so the button reappears and yields a
  raw 409.

---

## 2. Approved decisions

### Mechanics

1. **Partial-quantity returns are required.** Multiple partial returns per
   order line, bounded by remaining eligible quantity, safe under concurrency.
   Returned / inspected / restocked / refunded tracked at line level. Restock
   only after receipt **and** inspection — never on approval alone. Order-level
   `stock_restored` must not be the guard. Reservation and stock movement
   history preserved.
2. **COD refunds via bank transfer**, never through Razorpay. Auditable payout
   with pending / processing / paid / failed states, completed only on verified
   confirmation, with retry and duplicate-payout prevention. Gateway refunds and
   bank payouts distinct in storage, unified in the customer's history.
3. **Explicit linkage** between return requests, returned order lines and refund
   records. Never inferred from amounts or timestamps.

### Policy

4. **Return window: 7 days from successful delivery.**
   *Implementation note:* `orders` has **no `delivered_at` column** — only
   `shipments.delivered_at`, which is absent for an order an admin marks
   DELIVERED by hand. The reliable source today is the `order_status_history`
   row for `DELIVERED`, written by both the admin path and
   `transitionOrderStatus`. Proposal: add `orders.delivered_at`, set wherever
   that transition is made, and key the window on it — a derived timestamp
   from a history scan is fragile and unindexable.
5. **Cosmetics: sealed and unused only**, with exceptions for damaged or
   wrong-item deliveries. The exception bypasses the sealed test; it does not
   bypass inspection, and a damaged-claim unit that arrives resellable is a
   judgement call for the inspector.
6. **Discount allocation: proportional across eligible line items.** Worked out
   in §5.
7. **Approval reversal: audited reversal allowed before pickup; controlled
   review afterwards.** So `APPROVED → REJECTED` is a legal transition while the
   return is pre-pickup, and after `PICKUP_SCHEDULED` reversal requires the
   controlled-review path rather than a plain status change. Every reversal is
   audited with actor and reason.
8. **Fully returned order: set a separate `RETURNED` order status.** `RETURNED`
   already exists in `ORDER_STATUS_SEQUENCE` and is currently never set by the
   return flow.
9. **COD payout confirmation: verified against a bank statement or transaction
   reference**, supplying `reconciliation_ref`.
10. **Initiation and confirmation must be different authorised admins.**
    Enforced in the service and asserted in tests: `confirmed_by <> initiated_by`.
    A single admin cannot both start and complete a payout — same-person
    initiate-and-confirm defeats the control entirely.

## 3. Proposed state machine

```
                         ┌───────────────┐
                         │   SUBMITTED   │  customer files it (per line, with qty)
                         └───────┬───────┘
                                 │
                         ┌───────▼───────┐
                         │ UNDER_REVIEW  │
                         └───┬───────┬───┘
                   approve   │       │   decline
                   ┌─────────▼─┐   ┌─▼──────────┐
                   │ APPROVED  │   │ REJECTED * │ ← terminal; no money, no stock
                   └─────┬─────┘   └────────────┘
                         │
                 ┌───────▼─────────┐
                 │ PICKUP_SCHEDULED│
                 └───────┬─────────┘
                         │ parcel arrives
                 ┌───────▼─────────┐
                 │   RECEIVED *    │  goods physically back; qty recorded
                 └───────┬─────────┘
                         │ inspection, per line, per unit
              ┌──────────┴──────────┐
     passes   │                     │  fails
   ┌──────────▼────────┐   ┌────────▼──────────┐
   │   INSPECTED *     │   │ INSPECTION_FAILED*│ ← terminal; no refund
   │  RESTOCK the      │   │  no restock       │
   │  inspected qty    │   └───────────────────┘
   └──────────┬────────┘
              │ explicit, separate admin action
        ┌─────▼──────┐
        │  REFUNDED  │ ← money moves only here
        └────────────┘
```

`*` = does not exist today.

**A partial inspection split is possible and must be representable**: 2 of 3
returned units pass, 1 fails. The status lives on the *line*, with quantities
carrying the detail — `inspected_quantity: 2`, `failed_quantity: 1`.

### Side effects by transition

| Transition | Restock | Refund | Order status |
|---|---|---|---|
| → `UNDER_REVIEW` | — | — | — |
| → `APPROVED` | **no** | **no** | `RETURN_REQUESTED` |
| → `PICKUP_SCHEDULED` | — | — | — |
| → `RECEIVED` | no | no | — |
| → `INSPECTED` | **yes, inspected qty only** | no | — |
| → `REFUNDED` | no | **yes** | `RETURNED` once every line on the order is settled (decision 8) |
| → `REJECTED` / `INSPECTION_FAILED` | no | no | back to `DELIVERED` |

Restock and refund stay separated because they are independently reversible
mistakes. Restocking goods you never received oversells; refunding before
inspection pays for goods that may arrive damaged or not at all.

---

## 4. Schema plan

### 4.1 Line-level returns

`order_items` already has its own `id`, so a return references the **line**,
not `(order_id, product_id)`. That matters: one product can legitimately appear
as two lines with different variant or size, and keying on product would merge
them.

```sql
-- Migration 018

-- The cumulative guard. A conditional UPDATE against this column is atomic,
-- so two concurrent return requests cannot both pass — the same
-- claim-by-conditional-UPDATE pattern used by stock_committed and markOrderPaid.
ALTER TABLE order_items
  ADD COLUMN returned_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_returned_within_ordered
  CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);

-- return_requests becomes a HEADER: one per customer submission.
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS notes TEXT;
-- The blocker. One return per product per order makes partial returns and
-- repeat returns impossible.
DROP INDEX IF EXISTS return_requests_order_id_product_id_key;   -- (constraint, see note)

CREATE TABLE IF NOT EXISTS return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  -- Denormalised for the per-line restock key, which inventory_reservations
  -- is already indexed on: (order_id, product_id, variant_id, size_label).
  product_id TEXT NOT NULL,
  variant_id TEXT,
  size_label TEXT,

  quantity            INTEGER NOT NULL CHECK (quantity > 0),  -- requested
  received_quantity   INTEGER NOT NULL DEFAULT 0,
  inspected_quantity  INTEGER NOT NULL DEFAULT 0,             -- passed
  failed_quantity     INTEGER NOT NULL DEFAULT 0,
  restocked_quantity  INTEGER NOT NULL DEFAULT 0,
  refunded_amount_minor BIGINT NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (received_quantity  <= quantity),
  CHECK (inspected_quantity + failed_quantity <= received_quantity),
  CHECK (restocked_quantity <= inspected_quantity)
);
```

The `CHECK (restocked_quantity <= inspected_quantity)` is the rule *"never
restock an item merely because its return was approved"* expressed as a
database constraint rather than a convention — code cannot route around it.

**Note on dropping the unique constraint:** it is a table constraint, not a
bare index, so the migration must `ALTER TABLE return_requests DROP CONSTRAINT`
by its real name. Existing rows are unaffected and keep working as
single-quantity returns backfilled into `return_items` with `quantity = 1`.

### 4.2 Per-line restock

`restockReturnedOrder` (`inventory.service.ts`) restocks **every** reservation
on an order. It cannot serve one line — calling it for a single returned item
would put the whole order back into stock.

A new `restockReturnedLine({ orderId, productId, variantId, sizeLabel,
quantity, reason, actor })` is required, keyed exactly as
`inventory_reservations` already is. It must:

- move units from the **sold** counter (a delivered order's reservations are
  `COMMITTED`, not `ACTIVE`) — taking from the wrong counter invents or loses
  stock
- write an `inventory_transactions` row per movement, preserving the audit
  history the existing paths maintain
- be guarded by `restocked_quantity`, claimed with a conditional UPDATE, **not**
  by order-level `stock_restored` — which is a single boolean per order and
  cannot express "2 of 3 lines restocked"

`stock_restored` keeps its current meaning for whole-order cancellation and RTO
and is left alone.

### 4.3 Explicit linkage

```sql
ALTER TABLE refunds ADD COLUMN return_id      TEXT REFERENCES return_requests(id) ON DELETE SET NULL;
ALTER TABLE refunds ADD COLUMN return_item_id TEXT REFERENCES return_items(id)    ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_return ON refunds (return_id) WHERE return_id IS NOT NULL;
```

Nullable because a refund may legitimately have no return behind it — a
cancelled prepaid order is refunded directly. `ON DELETE SET NULL` so deleting
a return never erases the record that money moved.

### 4.4 COD bank-transfer payouts

`refunds` stays the **single money-event table**, so the customer's refund
history is one query and the Group A invariant
`SUM(refunds PROCESSED) == orders.amount_refunded` continues to hold for both
kinds. A discriminator says how the money moved; the mechanics of a bank
transfer live in their own table.

```sql
ALTER TABLE refunds ADD COLUMN method TEXT NOT NULL DEFAULT 'GATEWAY';
  -- 'GATEWAY' | 'BANK_TRANSFER'

CREATE TABLE IF NOT EXISTS refund_payouts (
  id TEXT PRIMARY KEY,
  refund_id TEXT NOT NULL UNIQUE REFERENCES refunds(id) ON DELETE CASCADE,
  order_id  TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'INR',

  -- A reference to a beneficiary verified out of band, NOT raw bank details.
  -- Account number and IFSC are deliberately absent: storing them here would
  -- put card-adjacent data in the order database for no operational gain.
  beneficiary_ref TEXT NOT NULL,
  -- Optional display hint only, e.g. "HDFC ••••4321". Never sufficient to pay.
  beneficiary_label TEXT,

  -- 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED'
  status TEXT NOT NULL DEFAULT 'PENDING',

  -- The bank/UTR reference proving the transfer happened. Required to reach PAID.
  reconciliation_ref TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,

  initiated_by TEXT NOT NULL,
  idempotency_key TEXT,
  failure_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- PAID is unreachable without proof and an identified confirmer.
  CONSTRAINT payout_paid_requires_proof
    CHECK (status <> 'PAID' OR (reconciliation_ref IS NOT NULL AND confirmed_by IS NOT NULL))
);

-- Duplicate-payout prevention, mirroring refunds.idempotency_key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_payouts_idempotency
  ON refund_payouts (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- One payout per bank reference: a retried transfer that already settled
-- cannot be recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_payouts_reconciliation
  ON refund_payouts (reconciliation_ref) WHERE reconciliation_ref IS NOT NULL;
```

**The rule that matters:** a COD `refunds` row stays `PENDING` until its payout
reaches `PAID`. The `payout_paid_requires_proof` constraint makes "an admin
clicked Refund" insufficient at the database level — reaching `PAID` requires a
reconciliation reference and a named confirmer. `orders.amount_refunded` is
only incremented when the refund becomes `PROCESSED`, so a merely-initiated
payout never reports as money returned.

Retry: a `FAILED` payout may be retried, producing a **new attempt** against
the same refund — so `refund_payouts.refund_id UNIQUE` may need relaxing to a
partial unique on `(refund_id) WHERE status <> 'FAILED'`, keeping one live
payout per refund while preserving failed attempts as history. *Flagging this
as a design detail to settle at implementation.*

`refundOrderPayment` keeps its current COD refusal — the bank-transfer path is
a separate service entry point, so there is no way for a COD order to reach the
Razorpay API by accident.

---

## 5. Refund calculation

**Approved rule: proportional allocation of order-level discount across
eligible line items.** This section works that out to the paisa, because the
rounding is where it goes wrong.

### 5.1 Why allocation must be frozen, not recomputed

A line's refundable amount depends on the order's subtotal, its discount and
the coupon that produced it. All three are mutable *after* the order:

- product prices change in the CMS
- a coupon can be edited or deleted outright
- `computeCouponDiscount` reads `db.globalSettings` live

Recomputing at refund time could therefore produce a different answer from the
one the customer agreed to — and two partial returns months apart could
allocate differently and fail to sum to what was paid.

**Allocation is computed once, at order creation, and stored per line.**
Proposed: `order_items.allocated_refund_minor BIGINT NOT NULL DEFAULT 0`,
written in the same transaction that writes the line. Returns draw down
against it and never recompute.

*Backfill for existing orders:* compute from the stored `subtotal`/`discount`
on the order row, which are themselves frozen. Historical orders have no
coupon re-evaluation risk because those two numbers were captured at checkout.

### 5.2 The allocation, in paise

Work entirely in minor units. Rupee arithmetic reintroduces the float drift
`toMinorUnits` exists to avoid.

Given subtotal `S`, order-level discount `D`, and lines `i` with
`L_i = price_i × quantity_i` (so `ΣL_i = S`):

```
1.  dᵢ = floor(D × Lᵢ / S)                 provisional discount share
2.  R  = D − Σdᵢ                            leftover paise, 0 ≤ R < lineCount
3.  distribute 1 paisa to each of the R lines with the largest fractional
    remainder; ties broken by order_items.id ascending, so the result is
    deterministic and reproducible
4.  Eᵢ = Lᵢ − dᵢ                            the line's refundable amount
```

Largest-remainder is what guarantees `ΣEᵢ = S − D` **exactly**. Naive rounding
leaves the sum short or over, and since Group A clamps every refund to
`amount_paid − amount_refunded`, a shortfall silently under-refunds the last
line while an overage gets clamped and hides the error.

### 5.3 Per-unit, across multiple partial returns

Dividing `Eᵢ` by quantity and rounding per unit does **not** telescope: three
returns of one unit can sum to less than one return of three.

Use incremental allocation against the quantity already returned:

```
refund(k units) = floor(Eᵢ × (returnedSoFar + k) / qtyᵢ)
                − floor(Eᵢ ×  returnedSoFar      / qtyᵢ)
```

This is exact, needs only `returned_quantity` (already tracked), and sums to
`Eᵢ` for any sequence of partial returns.

**Worked example** — line of 3 units, `Eᵢ = 1000` paise:

| Return | Formula | Refund |
|---|---|---|
| 1 unit | `floor(1000×1/3) − 0` | 333 |
| 1 unit | `floor(1000×2/3) − floor(1000×1/3)` | 333 |
| 1 unit | `floor(1000×3/3) − floor(1000×2/3)` | **334** |
| | **total** | **1000** ✓ |

All three at once: `floor(1000×3/3) − 0 = 1000` ✓ — same total either way.

### 5.4 Worked example, whole order

Order: A = ₹600 ×1, B = ₹400 ×1, subtotal ₹1000, coupon −₹100, shipping ₹99,
total ₹999.

```
S = 100000p   D = 10000p
A: d = floor(10000 × 60000/100000) = 6000  →  E_A = 54000p  (₹540)
B: d = floor(10000 × 40000/100000) = 4000  →  E_B = 36000p  (₹360)
ΣE = 90000p = S − D ✓     (shipping sits outside — see 5.5)
```

Returning A alone refunds **₹540**, not ₹600. Refunding the sticker price
would return more than the customer paid for that item.

### 5.5 Shipping and tax

**Tax: nothing to do.** `assembleOrder` hardcodes `tax: 0`
(`orders.service.ts:320`) and prices are tax-inclusive. No tax component is
apportioned. Stated explicitly so it is not "fixed" later by someone adding a
GST line to the refund maths.

**Shipping: still an open decision** — see §8. The approved decision covered
discount allocation only. Shipping is not part of `ΣEᵢ` above, so whatever is
chosen is additive to the model rather than a change to it.

### 5.6 Edge cases

| # | Case | Proposed handling |
|---|---|---|
| 1 | **Rounding across 3+ lines** | largest-remainder (5.2); `ΣEᵢ = S − D` exactly |
| 2 | **Sequential partial returns of one line** | incremental allocation (5.3); telescopes to `Eᵢ` |
| 3 | **Return drops basket below the coupon's `minOrderValue`** (e.g. GLAM799 needs ₹799) | **do not** claw back the discount. It was earned at purchase. Retroactive removal would refund *less* than the line is worth and is indefensible to a customer |
| 4 | **Return drops basket below `FREE_SHIPPING_THRESHOLD`** (₹999) | **do not** charge shipping retroactively, same reasoning |
| 5 | **Damaged / wrong item** | bypasses the sealed-and-unused test. Whether it *also* refunds shipping is open — §8 |
| 6 | **Full return of every line** | `Σ refunds = ΣEᵢ = S − D`. Whether shipping is added depends on §8 |
| 7 | **Line fully refunded, further return attempted** | blocked by `returned_quantity <= quantity`, before any money moves |
| 8 | **`D = 0`** (no coupon) | `Eᵢ = Lᵢ`; the algorithm degenerates correctly, no special case |
| 9 | **COD order** | `amount_paid` is set to `total` on delivery, so the same clamp applies; the payout path differs, the arithmetic does not |
| 10 | **Partial inspection** — 2 of 3 units pass | refund the **inspected** quantity only: `refund(2)` by 5.3. The failed unit is neither restocked nor refunded |
| 11 | **Order already partially refunded for another reason** | Group A's clamp (`amount_paid − amount_refunded`) still applies on top, so total refunds can never exceed collection regardless of allocation |
| 12 | **Allocation sum vs `amount_paid`** | `ΣEᵢ + shipping == total == amount_paid` must hold at order creation; worth asserting in a test, since a mismatch would make the last refund clamp |

---

## 6. Invariants

1. `order_items.returned_quantity <= order_items.quantity` — DB constraint.
2. `SUM(return_items.quantity) per order_item_id == order_items.returned_quantity`.
3. `restocked_quantity <= inspected_quantity <= received_quantity <= quantity` — DB constraints.
4. Units restocked at most once per returned unit, guarded per line.
5. `SUM(refunds.amount_minor WHERE status='PROCESSED') == orders.amount_refunded * 100`, across both methods.
6. A COD refund is `PROCESSED` only if its payout is `PAID`.
7. A payout is `PAID` only with a reconciliation reference and a confirmer — DB constraint.
8. Refund total per return line never exceeds that line's eligible amount.
9. Every inventory movement writes an `inventory_transactions` row.

---

## 7. Migration plan

| # | Contents | Risk |
|---|---|---|
| 018 | `order_items.returned_quantity` + CHECK; `return_items`; drop the one-return-per-product constraint; backfill existing returns as `quantity = 1` | additive except the constraint drop, which only widens |
| 019 | `refunds.return_id`, `refunds.return_item_id`, `refunds.method` | additive, defaulted |
| 020 | `refund_payouts` + indexes + CHECK | additive |

All forward-only and additive. Nothing is dropped or rewritten except the
constraint that currently blocks the feature, and that removal cannot invalidate
an existing row.

---

## 8. Unresolved — require approval before implementation

The policy decisions are settled. Three narrower questions remain, all
surfaced by working the refund maths through.

1. **Is shipping refunded, and when?** Decision 6 covered discount allocation;
   shipping sits outside `ΣEᵢ` and nothing has been decided. Three defensible
   options:
   - never refund shipping (simplest, and the shipping was genuinely incurred)
   - refund it only on a **full** order return
   - refund it whenever the fault is ours — a damaged or wrong item
   My recommendation is the third: a customer who received the wrong product
   should not be out of pocket for its delivery. It needs saying explicitly
   because the model has no opinion of its own.

2. **Who counts as an "authorised admin" for payout confirmation?** Decision 10
   requires `confirmed_by <> initiated_by`, which the service can enforce
   today. But there is no admin *role* model in this codebase —
   `requireAdmin` checks only `role === 'admin'`, so every admin is equal. Two
   options: accept any second admin, or introduce a finance role. The first is
   implementable now; the second is a wider change.

3. **Retry shape for a failed payout.** `refund_payouts.refund_id UNIQUE`
   conflicts with retrying. Proposed: partial unique on
   `(refund_id) WHERE status <> 'FAILED'` — one live payout per refund, failed
   attempts preserved as history. Flagged rather than quietly chosen.

### Carried forward from the schema work

4. **`orders.delivered_at` does not exist** (see decision 4). The 7-day window
   needs it, or a fragile scan of `order_status_history`. Proposed as part of
   migration 018.

## 9. Suggested sequencing, once the above is decided

1. Migrations 018–020
2. `restockReturnedLine` with its per-line guard and transaction history
3. Return state machine in the service layer, each transition idempotent in the
   style of `markOrderPaid` / `recordProviderRefund`
4. COD payout service: initiate → confirm, with retry and duplicate prevention
5. `notifyAdminReturnRequested`; fire the existing `SUBMITTED` customer copy
6. Admin UI: per-line quantities, receipt, inspection, refund, payout confirmation
7. Customer UI: show a return in flight; stop re-offering the button; unified
   refund history across both methods
8. Tests: cumulative quantity under concurrency, restock exactly once per unit,
   partial inspection split, refund limits per line, COD never reaching
   Razorpay, payout not `PAID` without proof
