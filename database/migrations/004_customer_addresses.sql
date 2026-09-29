-- ==========================================================================
-- 004_customer_addresses.sql
-- ==========================================================================
--
-- Saved delivery addresses.
--
-- area and landmark are separate columns because Indian addresses routinely
-- carry both, and cramming them into address_line2 made them useless for
-- anything but display.
--
-- Migrations 001-006 are the historical baseline extracted from the original
-- ensureSchema(). They are intentionally idempotent (IF NOT EXISTS), so
-- applying them to the existing production database is a safe no-op that just
-- records them as applied. New migrations from 007 onward need not be.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Home',
  phone TEXT NOT NULL,
  email TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pin_code TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indian addresses are routinely given as "area/locality" plus a
-- landmark; without dedicated columns both were being crammed into
-- address_line2, which made them unusable for anything but display.
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS landmark TEXT;

