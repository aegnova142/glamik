# Refund calculation — products, discount, GST, delivery

**Status: proposal. No code written, no migration run.**

Companion to `08-returns-proposal.md`. That document covers the return state
machine; this one covers the money, and specifically what happens when GST is
brought into it.

---

## 1. The current calculation flow, as built

### Checkout pricing engine
*(`customer.routes.ts:1554-1577`)*

```
subtotal = Σ (getCurrentPrice(product, shade, size) × quantity)   ← live catalog
{ discount, appliedCouponCode } = computeCouponDiscount(db, couponCode, subtotal)
shipping = (subtotal − discount) >= 999 ? 0 : 99
total    = max(0, subtotal − discount + shipping)
```

Four numbers are persisted on `orders`: `subtotal`, `discount`, `shipping`,
`total`. Plus `coupon_code`, `amount_paid`, `amount_refunded`.

### order_items

```
id, order_id, product_id, variant_id, product_name, quantity, price,
selected_size, created_at
```

`price` is the **unit price at order time** — correctly frozen, so a later
catalog change cannot alter history. That is the one piece of per-line
financial truth the system does preserve.

### Tax

```
assembleOrder: tax: 0          (orders.service.ts:320)
```

Hardcoded. The order-detail UI guards on `order.tax > 0`, so the line never
renders — dead code today.

### Invoice
*(`account.routes.ts`, `GET /account/orders/:id/invoice`)*

Totals block renders **Subtotal / Discount / Shipping / Total**. No tax line.
Footer reads *"Prices are inclusive of all applicable taxes."*

---

## 2. 🔴 Blocker: there is no GST data to refund proportionally

Requirements 1 and 3 ask for taxable value, GST rate, and CGST/SGST/IGST per
line, refunded against "original invoice tax details". **None of that exists,
and it cannot be reconstructed for any historical order.**

| Needed | Present? | Where it would live |
|---|---|---|
| GST rate per product | ❌ | `Product` has no `taxRate` / `gstRate` |
| HSN / SAC code | ❌ | nowhere |
| Taxable value per line | ❌ | `order_items` has `price`, `quantity` only |
| CGST / SGST / IGST split | ❌ | nowhere |
| Seller GSTIN | ❌ | nowhere |
| Seller state / place of supply | ❌ | buyer `Address.state` exists; **no origin state** to compare against |
| Order-level tax | ❌ | `tax: 0`, hardcoded |

The only GST reference in the entire codebase is a CMS policy string
(`db.ts:614`) stating prices are inclusive of applicable GST.

**I will not invent a rate.** Picking 18% would fabricate tax records for real
historical orders, and cosmetics in India are not uniformly rated — the correct
rate depends on the product and its HSN classification, which nobody has
recorded.

### A compliance observation, flagged not diagnosed

The invoice is titled **"Tax Invoice"** (`account.routes.ts`, the `.kicker`
div) but carries no GSTIN, no HSN, no tax rate and no tax amount. Whatever the
right answer is, that is a question for your accountant rather than something
to settle in code. Raising it because this work touches that document, and a
credit note for a return would inherit the same problem.

### What this does *not* break

**Refund amounts are already correct.** Prices are tax-inclusive, so GST is
embedded in `order_items.price`. Refunding the exact rupees a customer paid for
N units refunds the embedded GST in the right proportion automatically — the
arithmetic in §3 needs no tax field to produce the right *amount*.

The gap is **reporting**, not money: you cannot issue a GST-compliant credit
note, and you cannot file the tax component of a refund, because the split was
never recorded. That distinction decides how urgent this is.

---

## 3. Proposed formula

Work entirely in paise. Rupee arithmetic reintroduces the float drift
`toMinorUnits` exists to prevent.

### 3.1 Line allocation (frozen at order creation)

Given subtotal `S`, order-level discount `D`, lines `i` with
`Lᵢ = priceᵢ × qtyᵢ`:

```
dᵢ = floor(D × Lᵢ / S)                      provisional discount share
R  = D − Σdᵢ                                 leftover paise, 0 ≤ R < lineCount
     → 1 paisa to each of the R lines with the largest fractional remainder,
       ties by order_items.id ascending (deterministic)
Eᵢ = Lᵢ − dᵢ                                 line's net refundable amount
```

Largest-remainder guarantees `ΣEᵢ = S − D` exactly. Naive rounding leaves the
sum short or over; since the refund service clamps to
`amount_paid − amount_refunded`, a shortfall silently under-refunds the final
line and an overage is clamped, hiding the error.

**Frozen, not recomputed.** Prices change in the CMS, coupons can be deleted,
and `computeCouponDiscount` reads live settings — recomputing at refund time
could produce a different answer from the one the customer agreed to.

### 3.2 Partial quantity

Per-unit division does not telescope: three single-unit returns can sum to less
than one three-unit return. Use incremental allocation:

```
refund(k units) = floor(Eᵢ × (returnedSoFar + k) / qtyᵢ)
                − floor(Eᵢ ×  returnedSoFar      / qtyᵢ)
```

Line of 3, `Eᵢ = 1000p`: 333 + 333 + **334** = 1000 ✓; all three at once = 1000 ✓.

### 3.3 GST component — conditional on §4 being implemented

With tax-inclusive pricing and a known rate `r` for the line:

```
taxableᵢ = round(Eᵢ / (1 + r))
gstᵢ     = Eᵢ − taxableᵢ              ← subtraction, never a second rounding
```

Computing `gst` by subtraction rather than `round(taxable × r)` guarantees
`taxable + gst == E` exactly, with no reconciling paisa.

For a partial refund of amount `A` from that line:

```
refundTaxable = round(A / (1 + r))
refundGst     = A − refundTaxable
```

Intra-state → `CGST = SGST = refundGst / 2` (odd paisa to CGST by convention).
Inter-state → `IGST = refundGst`. **Requires a seller state, which does not
exist** (§2).

### 3.4 Delivery charge

Treated **separately from product lines** and never folded into `ΣEᵢ`.

| Scenario | Proposed treatment |
|---|---|
| Full cancellation **before dispatch** | refund `total` in full, shipping included — nothing was shipped |
| Full return of every line, after delivery | **policy — unresolved**, see §5 |
| Partial return | **do not refund shipping**, default. The delivery was performed |
| Damaged / wrong item | **recommend refunding shipping** — the fault is ours |

Requirement 6 is satisfied by construction: shipping is outside the line
allocation, so no partial return can refund it by accident.

### 3.5 Worked example

A ₹600 ×1, B ₹400 ×1, coupon −₹100, shipping ₹99, total ₹999, paid ₹999.

```
S = 100000p   D = 10000p
A: d = 6000  →  E_A = 54000p (₹540)
B: d = 4000  →  E_B = 36000p (₹360)
ΣE = 90000p = S − D ✓ ;  ΣE + shipping = 99900p = total ✓
```

Return A only → refund **₹540**, not ₹600. Shipping not refunded. If a rate of
18% were recorded: taxable ₹457.63, GST ₹82.37 — shown for shape only, **not a
proposal to adopt that rate**.

---

## 4. Required schema changes (backward-compatible)

All additive. Historical rows keep working; nothing is dropped or rewritten.

### 4.1 Capture the allocation (needed regardless of GST)

```sql
-- Migration 018
ALTER TABLE order_items ADD COLUMN allocated_discount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN net_amount_minor         BIGINT NOT NULL DEFAULT 0;  -- Eᵢ
ALTER TABLE order_items ADD COLUMN returned_quantity        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD CONSTRAINT order_items_returned_within_ordered
  CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);
```

Backfill for existing orders is **safe and exact**: `subtotal` and `discount`
are already frozen on the order row, so §3.1 reproduces the allocation those
orders were actually charged. No invention involved.

### 4.2 Capture tax (needed only if GST reporting is wanted)

```sql
-- Migration 019 — NOT backfillable; see below
ALTER TABLE order_items ADD COLUMN gst_rate_bp        INTEGER;      -- basis points, 1800 = 18%
ALTER TABLE order_items ADD COLUMN hsn_code           TEXT;
ALTER TABLE order_items ADD COLUMN taxable_value_minor BIGINT;
ALTER TABLE order_items ADD COLUMN cgst_minor          BIGINT;
ALTER TABLE order_items ADD COLUMN sgst_minor          BIGINT;
ALTER TABLE order_items ADD COLUMN igst_minor          BIGINT;

ALTER TABLE orders ADD COLUMN place_of_supply TEXT;    -- buyer state at order time
ALTER TABLE orders ADD COLUMN seller_gstin    TEXT;
```

Rate stored in **basis points as an integer**, not a float — 18% is `1800`.
A float rate reintroduces exactly the drift the paise arithmetic avoids.

All **nullable on purpose**. An order placed before this migration has
`gst_rate_bp IS NULL`, which reads correctly as *"no tax detail was recorded"*
— not as zero tax. Refund logic must branch on null and omit the tax breakdown
rather than computing one from a default.

`Product` also needs `gstRate` / `hsnCode` so new orders can capture the rate
at checkout, the same way `price` is captured today.

**There is no backfill.** The source data never existed. Any attempt to
populate these for historical orders would be fabrication.

### 4.3 Refund-side tax record

```sql
-- Migration 020
ALTER TABLE refunds ADD COLUMN taxable_value_minor BIGINT;
ALTER TABLE refunds ADD COLUMN cgst_minor BIGINT;
ALTER TABLE refunds ADD COLUMN sgst_minor BIGINT;
ALTER TABLE refunds ADD COLUMN igst_minor BIGINT;
ALTER TABLE refunds ADD COLUMN credit_note_ref TEXT;
```

Null for refunds on orders with no recorded tax detail — which is every order
today.

---

## 5. Unresolved policy

1. **Is GST reporting actually required of this business?** If turnover is
   below the registration threshold, §4.2 and §4.3 are unnecessary and the
   invoice should stop calling itself a Tax Invoice. If it is required, a
   rate must be assigned per product and the historical gap acknowledged with
   your accountant. **This decision gates everything tax-related below.**
2. **GST rate per product** — who supplies it, and against which HSN codes?
3. **Seller state / GSTIN** — needed before CGST/SGST vs IGST can be decided
   at all.
4. **Shipping on a full post-delivery return** — refunded or retained?
5. **Shipping on damaged / wrong-item returns** — my recommendation is to
   refund it; needs confirming.
6. **Historical orders** — if GST is adopted, what happens to returns on
   pre-migration orders? Proposed: refund the correct amount (which already
   works) and issue a credit note without a tax split, flagged as such.

---

## 6. What is already guaranteed by existing code

Requirements 7 and 8 are **met today** by the Group A work, and need no new
design:

- **Refunds never exceed capture** — clamped to `amount_paid − amount_refunded`
  inside the per-order advisory lock.
- **Concurrency is atomic** — `withOrderRefundLock` is non-queueing; a second
  concurrent refund is refused, not queued. Verified by test: removing the lock
  produces two real gateway refunds.
- **Idempotent retries** — `(order_id, idempotency_key)` unique; a replay
  returns the original refund without calling the gateway.
- **Prepaid uses the verified captured payment** — `refundOrderPayment` selects
  the `PAID` payment row with a non-null `provider_payment_id`.
- **COD never reaches Razorpay** — refused outright before any gateway call;
  the bank-transfer path is a separate service entry point.
- **Auditable** — `refunds` holds provider refund id, amount, reason, actor,
  gateway response, timestamps.

---

## 7. Test plan (requirement 10)

| Scenario | Asserts |
|---|---|
| Full cancellation pre-dispatch | refund == `amount_paid`, shipping included |
| Full return, all lines | `Σ refunds == ΣEᵢ`; shipping per §5.4 |
| Partial return, 1 of 3 units | incremental allocation; shipping untouched |
| Coupon allocation | `ΣEᵢ == subtotal − discount` exactly |
| Rounding, 3 lines / indivisible discount | largest-remainder; no paisa lost |
| Sequential partials | 333 + 333 + 334 == 1000 |
| GST rounding *(if adopted)* | `taxable + gst == E`; split halves correctly |
| Null tax detail | refund succeeds; tax fields stay null, nothing invented |
| Delivery charge | never refunded by a partial return |
| Repeated request | same idempotency key → one refund |
| Concurrent requests | exactly one succeeds, one `busy` |
| COD | never calls the gateway; payout path only |
