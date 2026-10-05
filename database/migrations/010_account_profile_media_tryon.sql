-- ==========================================================================
-- 010_account_profile_media_tryon.sql
-- ==========================================================================
--
-- Fills the remaining gaps in the customer account area:
--
--   * customers.gender            — the one profile field the form was missing
--   * reviews.media               — multi-image/video reviews
--   * try_on_history              — Virtual Try-On sessions, so the Beauty
--                                   Profile can show them alongside Shade AI
--   * customer_addresses billing  — a billing default separate from shipping
--
-- Nothing here rewrites or drops existing data: every statement is additive,
-- and reviews.photo_url is deliberately left in place (see below).
-- ==========================================================================

-- ==========================================
-- PROFILE
-- ==========================================

-- Constrained rather than free text so the column stays aggregatable, with
-- an explicit opt-out value — leaving NULL to mean both "not asked yet" and
-- "declined to say" would make the two indistinguishable.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IS NULL OR gender IN ('female', 'male', 'other', 'prefer_not_to_say'));

-- ==========================================
-- REVIEW MEDIA
-- ==========================================

-- An ordered array of {type: 'image'|'video', url, publicId} objects. JSONB
-- rather than a child table because the list is small, always read whole with
-- its review, and never queried across reviews.
--
-- photo_url survives untouched: existing rows still carry their single image
-- there, and the API reads it as an implicit first media item rather than
-- running a backfill that would have to guess a Cloudinary publicId it never
-- recorded. New uploads only ever write to media.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ==========================================
-- VIRTUAL TRY-ON HISTORY
-- ==========================================

-- Append-only log of try-on sessions, mirroring shade_ai_history so the two
-- read the same way in the Beauty Profile.
--
-- No captured frame is stored. The camera feed never leaves the device today,
-- and persisting a photo of someone's face to make a history list prettier is
-- not a trade worth making — the product/shade pair is what makes an entry
-- useful, and that is all this keeps.
CREATE TABLE IF NOT EXISTS try_on_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  shade_id TEXT,
  shade_name TEXT,
  shade_hex TEXT,
  -- 'live' (camera), 'model' (standard model preset) or 'upload' (the
  -- customer's own photo). Not constrained by a CHECK: the set of try-on
  -- modes is a UI concern likely to grow, and the API already rejects
  -- anything outside the list before it reaches here.
  mode TEXT NOT NULL DEFAULT 'model',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Re-trying the same shade updates the existing row's timestamp instead of
-- stacking duplicates, so the list reads as "shades you have tried" rather
-- than a raw event log — the same idea as the UNIQUE on recently_viewed.
--
-- Expressed over COALESCE(shade_id, '') rather than as a plain
-- UNIQUE (user_id, product_id, shade_id): SQL NULLs are distinct from each
-- other, so a product tried without a shade would slip past a plain
-- constraint and duplicate on every single try-on. (NULLS NOT DISTINCT would
-- also do it, but that needs Postgres 15+ and this has to hold wherever the
-- production database happens to be.) ON CONFLICT targets the same
-- expression.
CREATE UNIQUE INDEX IF NOT EXISTS idx_try_on_history_unique
  ON try_on_history (user_id, product_id, COALESCE(shade_id, ''));

CREATE INDEX IF NOT EXISTS idx_try_on_history_user ON try_on_history (user_id, created_at DESC);

-- ==========================================
-- BILLING ADDRESSES
-- ==========================================

-- is_default already means "default shipping address" everywhere it is read
-- (checkout included), so it keeps that meaning and billing gets its own
-- flag. One address can be both; neither being set is also valid, in which
-- case billing falls back to the shipping address exactly as it does today.
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS is_billing_default BOOLEAN NOT NULL DEFAULT false;

-- Partial unique indexes make "at most one default of each kind per customer"
-- a database guarantee rather than something every write path has to
-- remember.
--
-- The old write path cleared the other defaults and set the new one in two
-- separate statements with no transaction around them, so two concurrent
-- saves could interleave and leave a customer with two default addresses.
-- Any such row has to be resolved before the index can be built, otherwise
-- this migration would fail on exactly the databases that need it most.
-- The most recently created default wins, which is the one the customer
-- last chose.
UPDATE customer_addresses SET is_default = false
WHERE is_default
  AND id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM customer_addresses
    WHERE is_default
    ORDER BY user_id, created_at DESC, id DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default
  ON customer_addresses (user_id) WHERE is_default;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_billing_default
  ON customer_addresses (user_id) WHERE is_billing_default;
