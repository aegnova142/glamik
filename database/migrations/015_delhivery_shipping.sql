-- ==========================================================================
-- 015_delhivery_shipping.sql
-- ==========================================================================
--
-- Delhivery One (B2C) replaces Shiprocket as the active shipping provider.
--
-- ADDITIVE ONLY. Migrations 011 and 014 are applied and therefore immutable —
-- they are not edited, renamed, or re-run. In particular 011 created
-- `shipments.provider DEFAULT 'shiprocket'`, and that column keeps every value
-- it already holds; only the default for NEW rows changes here.
--
-- NO DATA IS REWRITTEN. Historical shipments, webhook_events and tracking rows
-- stay exactly as they are, Shiprocket provenance included, so past orders
-- remain readable and auditable.
--
-- Nothing here touches orders, payments, reservations or inventory.
-- ==========================================================================

-- ==========================================
-- SHIPMENTS — Delhivery's model
-- ==========================================

-- New shipments are Delhivery's. Existing rows are untouched: this changes the
-- default for future inserts only, so a row written before the migration still
-- reads 'shiprocket' and still means it.
ALTER TABLE shipments ALTER COLUMN provider SET DEFAULT 'delhivery';

-- Delhivery's tracking number. `awb_code` (011) already holds the customer-
-- facing tracking number and keeps doing so — this is deliberately NOT a
-- rename. The two providers allocate it at opposite ends of the flow, and a
-- separate column records which waybill was drawn from the client pool and
-- when, independently of whether the shipment that was meant to use it was
-- ever accepted.
--
-- That distinction is what makes the retry safe: a waybill drawn but not yet
-- spent must be reused rather than replaced, or every retry leaks one.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS waybill TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS waybill_fetched_at TIMESTAMPTZ;

-- The (StatusType, Status) pair Delhivery last reported, kept verbatim next to
-- the mapped Glamirk status. When Delhivery reports a pair this build does not
-- recognise, the mapped status is left alone and these still record what
-- actually arrived.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_status_type TEXT;

-- A waybill belongs to exactly one shipment. This is the database-level
-- guarantee behind "a retried creation must not produce a second shipment":
-- a retry that reuses its stored waybill collides here rather than quietly
-- creating a duplicate parcel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_waybill
  ON shipments (waybill) WHERE waybill IS NOT NULL;

-- ==========================================
-- PICKUP REQUESTS
-- ==========================================

-- Delhivery books pickups per warehouse per day, not per parcel: one request
-- covers every package waiting at that location that day.
--
-- Shiprocket's model was per shipment, which is why pickup state lived on the
-- shipments row. That shape cannot express "one open booking covering eleven
-- parcels", and without somewhere to record it every shipment created in an
-- afternoon would book its own van.
CREATE TABLE IF NOT EXISTS shipment_pickup_requests (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'delhivery',
  -- The registered warehouse name, exactly as the provider knows it.
  pickup_location TEXT NOT NULL,
  pickup_date DATE NOT NULL,
  pickup_time TEXT,
  expected_package_count INTEGER NOT NULL DEFAULT 1,
  -- The provider's own reference, where it returns one.
  provider_pickup_id TEXT,
  -- 'OPEN'   — booked, the van has not been yet
  -- 'CLOSED' — the day is done, or the booking was superseded
  -- 'FAILED' — the provider refused; last_error says why
  status TEXT NOT NULL DEFAULT 'OPEN',
  provider_response JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one OPEN booking per warehouse per day. This is what prevents
-- duplicate pickups: the second request of the afternoon loses the insert
-- rather than booking a second van.
--
-- Partial, so a closed or failed booking does not block a fresh one for the
-- same day — a refused pickup must be retryable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pickup_open_per_location_day
  ON shipment_pickup_requests (provider, pickup_location, pickup_date)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_pickup_requests_date
  ON shipment_pickup_requests (pickup_date DESC, status);

-- ==========================================
-- TRACKING EVENTS — provider provenance
-- ==========================================

-- 014 created shipment_tracking_events for Shiprocket scans. The columns are
-- provider-neutral already (awb_code, activity, location, raw_date), so the
-- table is reused rather than replaced — and existing Shiprocket rows stay
-- readable alongside Delhivery ones.
--
-- What was missing is which provider a row came from. Backfilled to
-- 'shiprocket' below, because every row that exists today is one.
ALTER TABLE shipment_tracking_events ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'delhivery';

-- Delhivery reports a (StatusType, Status) pair; 014's single provider_status
-- column cannot hold both.
ALTER TABLE shipment_tracking_events ADD COLUMN IF NOT EXISTS provider_status_type TEXT;

-- Existing rows predate Delhivery, so they are Shiprocket's. Scoped by
-- created_at rather than rewritten wholesale: this migration is the boundary,
-- and anything written after it is Delhivery's.
UPDATE shipment_tracking_events
   SET provider = 'shiprocket'
 WHERE provider = 'delhivery'
   AND created_at < now();

CREATE INDEX IF NOT EXISTS idx_tracking_events_provider
  ON shipment_tracking_events (provider, created_at DESC);

-- ==========================================
-- WEBHOOK EVENTS
-- ==========================================

-- webhook_events.source already distinguishes providers ('razorpay',
-- 'shiprocket'); Delhivery pushes land under 'delhivery'. No schema change is
-- needed and none is made — the unique (source, event_id) index that makes
-- processing idempotent works unchanged for a third source.
--
-- Historical 'shiprocket' rows are left exactly as they are.
