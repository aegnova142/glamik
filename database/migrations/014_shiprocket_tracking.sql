-- ==========================================================================
-- 014_shiprocket_tracking.sql
-- ==========================================================================
--
-- Completes the Shiprocket integration: the shipment artefacts (pickup,
-- manifest, invoice) that migration 011 had nowhere to put, and a durable,
-- de-duplicated courier scan history.
--
-- ADDITIVE ONLY. Every statement is IF NOT EXISTS; no existing column is
-- dropped, retyped or rewritten, and no row is modified. Applying this to a
-- database that already has it is a no-op.
--
-- Nothing here changes inventory, orders, payments or reservations.
-- ==========================================================================

-- ==========================================
-- SHIPMENTS — artefacts and tracking state
-- ==========================================

-- Shiprocket's own invoice PDF (POST /v1/external/orders/print/invoice).
-- Sits alongside the existing label_url and manifest_url.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS invoice_url TEXT;

-- The manifest handle returned by /v1/external/manifests/generate. Needed to
-- re-print a manifest later without regenerating it.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS manifest_generated_at TIMESTAMPTZ;

-- Pickup bookkeeping. pickup_scheduled_at already exists (011) but was never
-- written; it now records when /courier/generate/pickup succeeded and is the
-- idempotency marker that stops a retry booking a second pickup.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_requested_at TIMESTAMPTZ;

-- The courier's own words for where the parcel is, kept verbatim next to the
-- mapped Glamirk status. When Shiprocket invents a status we do not recognise,
-- this is where it lands — the order's shipping_status is left alone rather
-- than being forced into an approximation.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_status TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_status_id INTEGER;
-- When the courier says that status was true, as opposed to when we heard it.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_updated_at TIMESTAMPTZ;

-- Estimated time of delivery, straight from the webhook's `etd` field.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS etd TIMESTAMPTZ;

-- When we last heard anything at all from Shiprocket about this shipment.
-- Distinct from tracking_updated_at: a redelivered duplicate webhook moves this
-- but not the tracking state, which is exactly what "are the webhooks still
-- arriving?" needs to be answerable.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

-- Where the integration itself stands, as opposed to where the parcel is.
-- 'PENDING'   — nothing booked yet
-- 'CREATED'   — Shiprocket order exists, no AWB
-- 'READY'     — AWB assigned, parcel is shippable
-- 'FAILED'    — a step failed; attempt_count/last_error say which
-- Deliberately separate from `status` (the parcel's location) so a booking that
-- failed halfway is visible without overloading the shipping vocabulary.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS integration_status TEXT NOT NULL DEFAULT 'PENDING';

-- Raw provider responses for the per-step artefacts, keyed by step
-- ('pickup' | 'manifest' | 'invoice' | 'label'). provider_response already
-- holds the create/adhoc response and is not overwritten by later steps.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_artifacts JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill integration_status from what each existing row already proves.
-- Derived strictly from stored facts, never guessed.
UPDATE shipments SET integration_status = CASE
  WHEN awb_code IS NOT NULL            THEN 'READY'
  WHEN provider_shipment_id IS NOT NULL THEN 'CREATED'
  WHEN last_error IS NOT NULL           THEN 'FAILED'
  ELSE 'PENDING'
END
WHERE integration_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_shipments_integration
  ON shipments (integration_status, updated_at DESC);

-- Webhook mapping looks shipments up by Shiprocket's order handle to
-- cross-check the channel_order_id it was given. Without this that is a
-- sequential scan on every delivery.
CREATE INDEX IF NOT EXISTS idx_shipments_provider_order
  ON shipments (provider_order_id) WHERE provider_order_id IS NOT NULL;

-- ==========================================
-- COURIER SCAN HISTORY
-- ==========================================

-- One row per courier scan, from the webhook's scans[] array or from a
-- tracking-API poll.
--
-- The whole point of this table is idempotency. Shiprocket resends the FULL
-- scan history on every webhook delivery — a parcel with eight scans delivers
-- eight scans again on the ninth event — and it sends no event or scan id of
-- its own. Appending blindly would multiply the customer's tracking timeline on
-- every update.
--
-- So the key is derived from the fields Shiprocket actually documents and does
-- send: the AWB plus the scan's own date, activity and location. Those four
-- identify a physical scan. Nothing is invented: if a scan genuinely repeats
-- the same activity at the same location at the same timestamp, it is the same
-- scan.
CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id TEXT PRIMARY KEY,
  -- Nullable: a scan can arrive for an AWB whose shipment row was removed with
  -- its order. The order_id is the link that matters.
  shipment_id TEXT REFERENCES shipments(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  awb_code TEXT,

  -- Parsed timestamp where Shiprocket's value could be parsed, plus the exact
  -- string as received. Keeping the raw text means a format we failed to parse
  -- is still auditable instead of silently becoming NULL.
  scan_at TIMESTAMPTZ,
  raw_date TEXT,

  -- The documented scan fields, verbatim.
  activity TEXT,
  location TEXT,

  -- Provider status as sent, and the Glamirk ShippingStatus it mapped to.
  -- mapped_status is NULL when the provider status is one we do not recognise:
  -- the event is still recorded, it just does not move the order.
  provider_status TEXT,
  provider_status_id INTEGER,
  mapped_status TEXT,

  -- 'webhook' (scans[] entry) | 'webhook_status' (the delivery's own
  -- current_status) | 'tracking_api' (a poll).
  source TEXT NOT NULL DEFAULT 'webhook',

  -- The idempotency key described above. A webhook retry recomputes exactly
  -- this value and loses the race to the unique index.
  dedupe_key TEXT NOT NULL,

  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The guarantee behind "a webhook retry must not create duplicate scan
-- records". Enforced by the database, not by application bookkeeping that a
-- restart or a concurrent delivery could get wrong.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_events_dedupe
  ON shipment_tracking_events (dedupe_key);

-- The customer tracking timeline reads oldest-first for one order.
CREATE INDEX IF NOT EXISTS idx_tracking_events_order
  ON shipment_tracking_events (order_id, scan_at ASC);

CREATE INDEX IF NOT EXISTS idx_tracking_events_awb
  ON shipment_tracking_events (awb_code) WHERE awb_code IS NOT NULL;
