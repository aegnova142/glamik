-- ==========================================================================
-- 008_customer_phone_otp_login.sql
-- ==========================================================================
--
-- Mobile + OTP sign-in for customers.
--
-- Three changes, all additive to the customer side. Admin accounts live in
-- the cms_state JSONB document (see backend/src/db/db.ts), not in this table,
-- so nothing here can reach admin authentication.
--
-- 1. email loses NOT NULL.
--    A customer who signs in with a phone number has no email address to
--    give, and the honest representation of that is NULL. The alternative —
--    minting a synthetic address like 9876543210@phone.invalid — would put a
--    fake address in the profile UI and, worse, in the `to:` field of order
--    confirmation mail. UNIQUE is kept: Postgres allows many NULLs in a
--    unique index, so email stays unique among the accounts that have one.
--
-- 2. phone_e164 + a unique index.
--    The existing `phone` column is free text ("+91 98765 43210", "98765
--    43210", …) and is matched by reducing both sides to their last 10
--    digits (customer.routes.ts). That is fine for a password login where the
--    password still has to match, but it cannot carry a uniqueness guarantee,
--    and OTP login needs one: the number IS the identity, so two rows holding
--    the same number would make "which account does this OTP sign into?"
--    ambiguous. phone_e164 is the normalised, canonical form; `phone` keeps
--    whatever the customer typed and is still what the profile screen shows.
--
-- 3. customer_otp_codes.
--    One row per OTP issued. Deliberately a table rather than more columns on
--    `customers`: an OTP is issued against a phone *number*, which may not
--    belong to an account yet, and the request/verify history is what the
--    rate limiting and attempt caps are counted from.
--
-- password_hash keeps its NOT NULL. Phone-only accounts satisfy it the same
-- way Google sign-ins already do — a random, never-shared bcrypt hash — so
-- this migration does not have to weaken a constraint that still holds for
-- every other sign-in path.
-- ==========================================================================

-- ==========================================
-- 1. EMAIL BECOMES OPTIONAL
-- ==========================================

ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;

-- ==========================================
-- 2. CANONICAL PHONE NUMBER
-- ==========================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_e164 TEXT;

-- Backfill from the free-text column so customers who registered with a
-- mobile number sign straight into their existing account — with their
-- orders, cart, wishlist and addresses — rather than getting a second one.
--
-- Two deliberate restrictions:
--   * only rows whose last 10 digits are a plausible Indian mobile
--     ([6-9] followed by 9 digits) are backfilled; anything else is left NULL
--     and simply resolves through the legacy matcher at sign-in time.
--   * a number claimed by more than one live account is skipped, because
--     picking one here would silently pin the number to whichever row won.
--     Those are resolved at sign-in instead, where the choice is at least
--     made against a verified OTP.
WITH normalised AS (
  SELECT
    id,
    '+91' || right(regexp_replace(phone, '\D', '', 'g'), 10) AS e164
  FROM customers
  WHERE phone IS NOT NULL
    AND deleted_at IS NULL
    AND right(regexp_replace(phone, '\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$'
    -- Guards against a 4-digit extension or similar landing a bogus +91:
    -- an Indian mobile is 10 digits, optionally with 91/+91/0 in front.
    AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 12
),
unambiguous AS (
  SELECT e164 FROM normalised GROUP BY e164 HAVING count(*) = 1
)
UPDATE customers c
SET phone_e164 = n.e164
FROM normalised n
JOIN unambiguous u ON u.e164 = n.e164
WHERE c.id = n.id;

-- Partial so the many accounts without a number don't collide with each
-- other on NULL, and so a soft-deleted account doesn't hold a number hostage
-- against the person re-registering with it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_e164_unique
  ON customers (phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;

-- ==========================================
-- 3. ISSUED OTP CODES
-- ==========================================

CREATE TABLE IF NOT EXISTS customer_otp_codes (
  id TEXT PRIMARY KEY,
  -- Not a foreign key to customers: an OTP is routinely issued to a number
  -- that has no account yet — that is how sign-up happens.
  phone_e164 TEXT NOT NULL,
  -- HMAC-SHA256 of the code, never the code itself. A 6-digit code is a
  -- 1,000,000-wide space, so a plain digest would be reversible by anyone
  -- who read this table; keying the hash with a server-side secret is what
  -- makes the stored value useless on its own.
  code_hash TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('sms', 'whatsapp')),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Failed verification attempts against this specific code.
  attempts INTEGER NOT NULL DEFAULT 0,
  -- Set the moment the code is accepted, which is what makes it single-use.
  consumed_at TIMESTAMPTZ,
  -- Set when a newer code supersedes this one, or when it burns through its
  -- attempt limit. Distinct from consumed_at so the two can be told apart
  -- when working out which error message the customer should see.
  invalidated_at TIMESTAMPTZ,
  request_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The hot path: "most recent live code for this number", plus the windowed
-- counts the resend throttle is derived from.
CREATE INDEX IF NOT EXISTS idx_customer_otp_codes_phone_created
  ON customer_otp_codes (phone_e164, created_at DESC);
