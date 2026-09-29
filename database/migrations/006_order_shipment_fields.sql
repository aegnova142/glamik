-- ==========================================================================
-- 006_order_shipment_fields.sql
-- ==========================================================================
--
-- Courier/AWB fields on orders, populated by whichever shipping integration is
-- connected (see backend/src/services/shipping.service.ts).
--
-- Null while no provider is configured — the tracking screen then shows real
-- internal fulfilment status and says so, rather than inventing courier scans.
--
-- Migrations 001-006 are the historical baseline extracted from the original
-- ensureSchema(). They are intentionally idempotent (IF NOT EXISTS), so
-- applying them to the existing production database is a safe no-op that just
-- records them as applied. New migrations from 007 onward need not be.
-- ==========================================================================

-- Shipment fields populated by whichever courier integration is wired
-- up (see server/shipping.ts). Null while none is configured — the
-- tracking UI then shows internal order status only, never invented
-- courier scans.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_partner TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_tracking_url TEXT;
