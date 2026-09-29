-- ==========================================================================
-- 002_orders_and_fulfilment.sql
-- ==========================================================================
--
-- Orders, their line items, and the status history that drives the customer
-- tracking timeline.
--
-- The status default moves from CONFIRMED to PLACED at the end of this file:
-- orders now begin life as PLACED and an admin confirms them explicitly.
--
-- Migrations 001-006 are the historical baseline extracted from the original
-- ensureSchema(). They are intentionally idempotent (IF NOT EXISTS), so
-- applying them to the existing production database is a safe no-op that just
-- records them as applied. New migrations from 007 onward need not be.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id),
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  subtotal NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  shipping_address JSONB,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'COD_PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_details JSONB;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size TEXT;

CREATE TABLE IF NOT EXISTS order_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'PLACED';

