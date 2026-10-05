-- ==========================================================================
-- 011_payments_shipments_webhooks.sql
-- ==========================================================================
--
-- Online payments (Razorpay) and real shipping (Shiprocket).
--
-- Three separate lifecycles, three separate columns. Until now `orders.status`
-- carried a bit of all three — PLACED meant "payment settled enough to
-- proceed", SHIPPED meant a courier had it. Collapsing them worked while every
-- order was Cash on Delivery and no courier was integrated; it stops working
-- the moment a payment can fail independently of an order, or a courier can
-- mark an RTO on an order that is otherwise fine.
--
-- ADDITIVE ONLY. Existing rows keep their current `status` values (PLACED,
-- PACKED and the rest stay legal — see ORDER_STATUSES in shared/src/types.ts),
-- and the new columns are backfilled from data already present rather than
-- from guesses. No historical order is rewritten or deleted.
-- ==========================================================================

-- ==========================================
-- ORDERS — the three lifecycles
-- ==========================================

-- Payment lifecycle, independent of fulfilment. 'PENDING' is the state an
-- online order sits in between "customer pressed Pay" and "gateway confirmed",
-- which previously had no representation at all.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status TEXT;

-- payment_status already exists (migration 002) carrying 'COD_PENDING'/'PAID'.
-- It is reused rather than replaced: every existing value stays meaningful,
-- and the new states (PENDING, FAILED, CANCELLED, REFUNDED, PARTIALLY_REFUNDED,
-- EXPIRED) extend the same column. No CHECK constraint, deliberately — the
-- application owns this vocabulary (PAYMENT_STATUSES in shared types) and a
-- constraint here would mean a two-place deploy ordering problem every time a
-- state is added.

-- Amount actually collected, in the same rupee unit as orders.total. Kept
-- separate from `total` so a partial refund is visible without having to
-- replay the payments ledger.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_refunded NUMERIC NOT NULL DEFAULT 0;

-- Set when an order is cancelled so the reason survives for support, instead
-- of living only in the status-history note.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Whether this order's stock has been taken out of inventory. Online orders
-- deduct at payment confirmation, not at order creation — without this flag a
-- retried webhook could deduct the same order's stock twice, and a failed
-- payment would leak stock that was never really sold.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_committed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN NOT NULL DEFAULT false;

-- Backfill, derived strictly from what each row already says.
--
-- Every pre-existing order was COD and was created already past the payment
-- step, so its stock was committed at creation — that is a fact about how the
-- old checkout worked, not an assumption.
UPDATE orders SET stock_committed = true WHERE stock_committed = false;

-- A cancelled order had its stock restocked by the old cancel path, so it must
-- not be restocked a second time if it is ever touched again.
UPDATE orders SET stock_restored = true WHERE status = 'CANCELLED';

-- Money collected: COD counts as collected only once delivered.
UPDATE orders SET amount_paid = total
WHERE amount_paid = 0 AND (payment_status = 'PAID' OR status = 'DELIVERED');

-- Shipping lifecycle seeded from the order status it used to be mixed into.
UPDATE orders SET shipping_status = CASE
  WHEN status = 'DELIVERED'        THEN 'DELIVERED'
  WHEN status = 'OUT_FOR_DELIVERY' THEN 'OUT_FOR_DELIVERY'
  WHEN status = 'SHIPPED'          THEN 'IN_TRANSIT'
  WHEN status = 'CANCELLED'        THEN 'CANCELLED'
  WHEN tracking_number IS NOT NULL THEN 'AWB_ASSIGNED'
  ELSE 'NOT_SHIPPED'
END
WHERE shipping_status IS NULL;

ALTER TABLE orders ALTER COLUMN shipping_status SET DEFAULT 'NOT_SHIPPED';

-- ==========================================
-- PAYMENTS LEDGER
-- ==========================================

-- Append-mostly record of every payment attempt against an order, including
-- the ones that failed. The order carries the current state; this carries how
-- it got there, which is what makes a disputed charge answerable.
--
-- One row per gateway payment attempt. An order can have several: a failed
-- card, then a successful UPI retry.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- 'razorpay' | 'cod'. Named rather than assumed, so a second gateway can be
  -- added without reinterpreting existing rows.
  provider TEXT NOT NULL DEFAULT 'razorpay',
  -- The gateway's own order handle (Razorpay order_id), created server-side.
  provider_order_id TEXT,
  -- The gateway's payment handle, present once an attempt is actually made.
  provider_payment_id TEXT,
  provider_signature TEXT,
  -- Smallest currency unit (paise), exactly as the gateway expects it. Stored
  -- as the gateway sees it so a reconciliation never has to re-derive it
  -- through a float multiplication.
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'PENDING',
  method TEXT,
  -- Gateway error code/description for a failed attempt, kept so support can
  -- tell a customer why their bank declined without guessing.
  error_code TEXT,
  error_description TEXT,
  -- Full gateway payload for audit. Never contains card numbers: Razorpay
  -- returns only a masked/tokenised instrument.
  gateway_response JSONB,
  refunded_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at DESC);

-- A gateway payment id must map to exactly one ledger row. This is what makes
-- webhook processing idempotent at the database level rather than only in
-- application logic: a duplicate "payment captured" callback hits this
-- constraint instead of creating a second credit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment
  ON payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

-- Likewise one gateway order per attempt, so a retried "create payment order"
-- call cannot leave two open gateway orders for the same checkout.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_order
  ON payments (provider, provider_order_id) WHERE provider_order_id IS NOT NULL;

-- ==========================================
-- SHIPMENTS
-- ==========================================

-- One row per shipment created with the courier aggregator.
--
-- The existing tracking_number/courier_partner/courier_tracking_url columns on
-- `orders` are kept and still written, because the tracking UI and admin
-- already read them. This table is the fuller record behind them — aggregator
-- ids, dimensions, label/manifest URLs, the pickup state — which the order row
-- has nowhere to put.
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'shiprocket',
  -- Aggregator handles. provider_order_id is Shiprocket's order record;
  -- provider_shipment_id is the shipment within it; awb_code is the courier's
  -- own tracking number.
  provider_order_id TEXT,
  provider_shipment_id TEXT,
  awb_code TEXT,
  courier_company_id TEXT,
  courier_name TEXT,
  tracking_url TEXT,
  label_url TEXT,
  manifest_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  -- What was quoted/charged by the courier, for margin reporting. Nullable:
  -- not every flow returns it.
  freight_charge NUMERIC,
  applied_weight NUMERIC,
  is_cod BOOLEAN NOT NULL DEFAULT false,
  pickup_scheduled_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  -- Last raw aggregator payload, for debugging a mismatch without replaying
  -- the whole API conversation.
  provider_response JSONB,
  -- Retry bookkeeping for shipment creation, so a transient aggregator outage
  -- is retried a bounded number of times rather than forever.
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one shipment per order. This is the database-level guarantee behind
-- "do not create duplicate Shiprocket shipments for the same order" — a
-- double-clicked admin button or a retried job hits this, not the aggregator.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_order ON shipments (order_id);

CREATE INDEX IF NOT EXISTS idx_shipments_awb ON shipments (awb_code) WHERE awb_code IS NOT NULL;

-- ==========================================
-- WEBHOOK EVENTS
-- ==========================================

-- Every inbound webhook, recorded before it is acted on.
--
-- This is the idempotency ledger: processing checks for an existing row with
-- the same (source, event_id) and returns early if it finds one. Gateways and
-- aggregators both retry aggressively and both can deliver out of order, so
-- "we already handled this" has to be a durable fact, not an in-memory set
-- that a restart would forget.
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  -- 'razorpay' | 'shiprocket'
  source TEXT NOT NULL,
  -- The provider's own event identifier where it sends one; otherwise a
  -- deterministic hash of the payload, computed by the handler.
  event_id TEXT NOT NULL,
  event_type TEXT,
  order_id TEXT,
  -- 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'IGNORED'
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  payload JSONB,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_unique ON webhook_events (source, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON webhook_events (order_id, received_at DESC);
-- Supports the reconciliation sweep, which looks for events that never
-- reached PROCESSED.
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
  ON webhook_events (received_at) WHERE status <> 'PROCESSED';

-- ==========================================
-- INDEXES FOR THE ADMIN ORDER FILTERS
-- ==========================================

-- The admin list filters and sorts by these; without indexes each filter is a
-- sequential scan over every order ever placed.
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON orders (shipping_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders (payment_method, created_at DESC);
-- The customer's own order list — previously an unindexed scan filtered by
-- user_id on every account page load.
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_id, created_at DESC);
-- order_items is read once per order detail and once per reorder; the lookup
-- is always by order_id.
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
