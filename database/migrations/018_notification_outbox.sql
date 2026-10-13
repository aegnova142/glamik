-- ==========================================================================
-- 018_notification_outbox.sql
-- ==========================================================================
--
-- One notification engine, replacing nineteen hand-paired call sites.
--
-- WHAT THIS REPLACES. Every place that moved an order called notifyX(...) and
-- sendOrderStatusEmail(...) side by side — nineteen of them across
-- admin.routes, customer.routes and fulfillment.service. Each pair had to
-- remember the same things independently: don't fire twice, don't fire before
-- the write commits, don't let a mail failure break the transition. Adding a
-- channel meant editing all nineteen, and one that was missed simply went
-- quiet. Refunds and payment failures were already missing from several.
--
-- THE TWO TABLES.
--
-- notification_events is an OUTBOX. A business transition records the fact
-- that something happened, with a frozen payload, and returns. Nothing is
-- sent inline, so a slow SMTP round-trip can no longer sit inside a request
-- that has already changed an order, and a provider outage cannot roll back
-- a payment.
--
-- notification_deliveries is one row per (event, channel). It is where
-- "we tried, it failed, here is the provider's own words, here is attempt 3
-- of 5" lives — which previously existed only as a console.error nobody could
-- query. This is what makes failed notifications visible to an admin.
--
-- EXACTLY-ONCE. dedupe_key is UNIQUE and the caller composes it from the
-- transition itself, e.g. 'ord-123:ORDER_SHIPPED'. A repeated admin click, a
-- redelivered courier webhook and the reconciliation sweep all produce the
-- same key, so the second INSERT does nothing. That is the same mechanism
-- webhook_events already uses for provider deliveries — applied one level up,
-- to the business event rather than the transport.
--
-- WHY A FROZEN PAYLOAD. Rendering happens later, possibly minutes later after
-- a retry. Reading the order again at that point could pick up a status that
-- has since moved on, and send a customer a message describing a state their
-- order is no longer in. The payload captures what was true when the event
-- occurred.
--
-- ADDITIVE ONLY. No existing table is altered. The in-app notifications and
-- admin_notifications tables keep working exactly as they do; this sits
-- alongside them and will route to them rather than replacing them.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  -- Null for events with no signed-in recipient (an admin-only alert).
  user_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  -- ORDER_CONFIRMED | PAYMENT_FAILED | ORDER_SHIPPED | REFUND_COMPLETED | ...
  event_type TEXT NOT NULL,
  -- Composed by the caller from the transition. UNIQUE is the exactly-once
  -- guarantee; see the header.
  dedupe_key TEXT NOT NULL,
  -- Everything the templates need, captured at the moment the event happened.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_dedupe
  ON notification_events (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notification_events_order
  ON notification_events (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  -- 'email' | 'whatsapp' | 'inapp'
  channel TEXT NOT NULL,
  -- 'PENDING'  queued, not yet attempted
  -- 'SENT'     the provider accepted it
  -- 'FAILED'   permanently given up on, after max attempts or a hard refusal
  -- 'SKIPPED'  deliberately not sent: channel unconfigured, customer opted
  --            out, or no address/number on file. Distinct from FAILED so an
  --            admin can tell "we chose not to" from "we tried and could not".
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  -- The provider's own words, not a paraphrase. An SMTP 535 or a Meta
  -- template rejection is the only thing that tells an operator what to fix.
  last_error TEXT,
  -- Bounded backoff. Null means "due now".
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One delivery per channel per event. Makes the worker safe to run
  -- concurrently and makes a retry an UPDATE rather than a second send.
  UNIQUE (event_id, channel)
);

-- The worker's query: what is due, oldest first.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
  ON notification_deliveries (next_attempt_at)
  WHERE status = 'PENDING';

-- The admin's query: what is broken.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_failed
  ON notification_deliveries (updated_at DESC)
  WHERE status = 'FAILED';
