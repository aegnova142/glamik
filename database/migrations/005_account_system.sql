-- ==========================================================================
-- 005_account_system.sql
-- ==========================================================================
--
-- The customer account system: richer profiles, device sessions, token
-- revocation, beauty/shade personalisation, notification preferences,
-- browsing history, the rewards ledger, coupon redemptions and support tickets.
--
-- Migrations 001-006 are the historical baseline extracted from the original
-- ensureSchema(). They are intentionally idempotent (IF NOT EXISTS), so
-- applying them to the existing production database is a safe no-op that just
-- records them as applied. New migrations from 007 onward need not be.
-- ==========================================================================

-- ==========================================
-- ACCOUNT SYSTEM
-- ==========================================

-- Profile fields. name stays the canonical display name (every existing
-- query reads it); first/last are the editable halves the profile form
-- writes, and name is kept in sync on save so nothing downstream breaks.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMPTZ;

-- Bumped on "log out of all devices", password reset and password
-- change. Every customer JWT carries the value it was signed with, and
-- requireCustomer rejects tokens whose version is stale — which is what
-- makes logout actually invalidate a session rather than just dropping
-- the token on the client (a copied token would otherwise stay valid
-- for its full 30-day life).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Soft delete: the row is retained (orders reference it) but the
-- account can no longer authenticate. Scheduled rather than immediate
-- so an accidental deletion is recoverable during the grace window.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);

-- One row per signed-in device/browser, created at login and deleted on
-- logout. Purely informational (the token_version above is what
-- actually enforces revocation for "log out everywhere").
CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_user ON customer_sessions (user_id);

-- The Glam beauty profile. One row per customer (the shade quiz
-- overwrites it), holding the same fields the existing BeautyProfile
-- type already carries so the quiz and the account page share a shape.
CREATE TABLE IF NOT EXISTS beauty_profiles (
  user_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  skin_tone TEXT,
  undertone TEXT,
  skin_type TEXT,
  primary_concern TEXT,
  finish_preference TEXT,
  style_preference TEXT,
  occasion TEXT,
  makeup_preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
  beauty_interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_looks JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_shade_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only log of Shade AI / Find My Shade runs, so a customer can
-- revisit an earlier match instead of only ever seeing the latest.
CREATE TABLE IF NOT EXISTS shade_ai_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  skin_tone TEXT,
  undertone TEXT,
  occasion TEXT,
  finish_preference TEXT,
  style_preference TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommended_product_id TEXT,
  recommended_shade_id TEXT,
  recommended_shade_name TEXT,
  recommended_shade_hex TEXT,
  match_reason TEXT,
  recommended_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shade_history_user ON shade_ai_history (user_id, created_at DESC);

-- Per-customer notification opt-ins. Absent row = system defaults (see
-- DEFAULT_NOTIFICATION_PREFERENCES in src/types.ts); a row only exists
-- once the customer has actually changed something.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-side browsing history for signed-in customers. Guests keep
-- using the existing localStorage list; this is what survives a device
-- change, and the two are merged on login.
CREATE TABLE IF NOT EXISTS recently_viewed (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON recently_viewed (user_id, viewed_at DESC);

-- Glam Rewards. The balance is never stored as a mutable number — it is
-- always the SUM of this ledger, so a double-credit bug can't silently
-- inflate someone's points beyond what's traceable to a real event.
CREATE TABLE IF NOT EXISTS reward_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  order_id TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, reference)
);

CREATE INDEX IF NOT EXISTS idx_reward_tx_user ON reward_transactions (user_id, created_at DESC);

-- Records which coupon a customer has actually redeemed, so the rewards
-- page can split codes into available/used rather than guessing.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  coupon_code TEXT NOT NULL,
  order_id TEXT,
  discount NUMERIC NOT NULL DEFAULT 0,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions (user_id);

-- Help Center requests raised from the account area. Real rows an admin
-- can act on — not a simulated chat widget.
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id TEXT,
  topic TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  admin_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, created_at DESC);

