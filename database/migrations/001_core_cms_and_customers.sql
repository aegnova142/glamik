-- ==========================================================================
-- 001_core_cms_and_customers.sql
-- ==========================================================================
--
-- Content store, customer accounts, and the two per-customer collections that
-- hang off them.
--
-- cms_state is deliberately a single JSONB row: the admin edits whole content
-- documents and publishes atomically, so one row means one transactional save
-- and no partially-published state.
--
-- Migrations 001-006 are the historical baseline extracted from the original
-- ensureSchema(). They are intentionally idempotent (IF NOT EXISTS), so
-- applying them to the existing production database is a safe no-op that just
-- records them as applied. New migrations from 007 onward need not be.
-- ==========================================================================


CREATE TABLE IF NOT EXISTS cms_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  reset_token TEXT,
  reset_token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id, variant_id)
);

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_size TEXT;

