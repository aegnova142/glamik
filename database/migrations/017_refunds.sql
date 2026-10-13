-- ==========================================================================
-- 017_refunds.sql
-- ==========================================================================
--
-- A per-refund history, and the durable claim that makes refunding safe.
--
-- WHAT WAS MISSING. Refund state lived entirely in two aggregates:
-- `orders.amount_refunded` and `payments.refunded_minor` (both migration 011).
-- A running total answers "how much went back" and nothing else — not when,
-- not why, not who authorised it, and not which Razorpay refund it was. The
-- gateway's own refund id was returned by the adapter and thrown away, so a
-- figure in our ledger could not be reconciled against the figure in theirs.
--
-- THE BUG THIS ALSO FIXES. refundOrderPayment read `amount_refunded`, computed
-- what was refundable, called Razorpay, and only then wrote the new total.
-- Nothing serialised that sequence. Two concurrent requests — an admin
-- double-clicking is enough — both read the same starting figure, both decided
-- the full amount was available, and both issued a real refund. The
-- `LEAST(amount_minor, refunded_minor + $2)` clamp then capped the RECORDED
-- total at the captured amount, so the second refund did not show up anywhere.
-- Money left twice; the ledger said once.
--
-- A row here is inserted as PENDING *before* the gateway is called, inside a
-- per-order advisory lock. That makes the claim durable: a process that dies
-- mid-refund leaves a visible PENDING row to reconcile, rather than money that
-- moved with no local trace. It is deliberately not a pre-increment of
-- `amount_refunded` — that would need a compensating decrement on failure, and
-- a crash between the two would understate what is refundable forever.
--
-- ADDITIVE ONLY. No existing column is altered, dropped or rewritten.
-- `orders.amount_refunded` and `payments.refunded_minor` keep their meaning and
-- stay the aggregate every existing read already uses; this table is the
-- per-event history underneath them. Historical orders simply have no rows,
-- which reads correctly as "no itemised refund history recorded".
-- ==========================================================================

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- The captured payment being reversed. ON DELETE SET NULL rather than
  -- CASCADE: if a payment row is ever removed, the fact that money went back
  -- to a customer must survive it.
  payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  -- Razorpay's own refund handle (rfnd_...). Null while PENDING, set once the
  -- gateway confirms. This is what makes reconciliation against their
  -- dashboard possible at all.
  provider_refund_id TEXT,
  -- Smallest currency unit, matching payments.amount_minor, so no
  -- reconciliation ever has to re-derive a figure through a float multiply.
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  -- 'PENDING'  claimed, gateway not yet answered
  -- 'PROCESSED' gateway confirmed; aggregates have been updated
  -- 'FAILED'   gateway refused; aggregates deliberately left untouched
  status TEXT NOT NULL DEFAULT 'PENDING',
  -- Previously passed to Razorpay in `notes` and never kept locally, so the
  -- store could not answer "why did we refund this?" from its own records.
  reason TEXT,
  -- Supplied by the caller so a retried HTTP request maps onto the original
  -- refund instead of issuing a second one. Optional: the advisory lock
  -- already stops concurrent duplicates, this additionally stops a sequential
  -- retry after a lost response.
  idempotency_key TEXT,
  -- Admin id, or 'system' for the automatic refund on customer cancellation.
  created_by TEXT,
  error_code TEXT,
  error_description TEXT,
  gateway_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per gateway refund, and the key that stops a redelivered webhook
-- applying the same refund twice.
--
-- Keyed on provider_refund_id ALONE, deliberately. A Razorpay refund handle is
-- already globally unique, whereas `provider` records which ADAPTER wrote the
-- row — 'razorpay' live, 'razorpay-mock' in tests. Including it in the key
-- would mean the same refund arriving through two adapters counted twice,
-- which is exactly the mismatch that makes a dedupe look like it works until
-- the day it matters.
--
-- Partial so the many PENDING/FAILED rows, which legitimately have no provider
-- id, do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_provider_refund
  ON refunds (provider_refund_id) WHERE provider_refund_id IS NOT NULL;

-- The idempotency guarantee. Scoped to the order so two different orders may
-- reuse a key without interfering.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idempotency
  ON refunds (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Refund history for one order, newest first — the admin panel's read path.
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds (order_id, created_at DESC);

-- Reconciliation sweep: refunds that were claimed but never resolved, which is
-- what a crash between the claim and the gateway's answer leaves behind.
CREATE INDEX IF NOT EXISTS idx_refunds_unresolved
  ON refunds (created_at) WHERE status = 'PENDING';
