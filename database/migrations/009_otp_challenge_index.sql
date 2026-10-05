-- ==========================================================================
-- 009_otp_challenge_index.sql
-- ==========================================================================
--
-- Supporting index for challenge-based OTP verification.
--
-- No new columns. The challenge identifier a client is handed is the existing
-- primary key `customer_otp_codes.id` — since this migration's companion
-- change, that value is 24 cryptographically random bytes rather than a
-- timestamp with a little entropy on the end, which is what makes it safe to
-- expose and impossible to enumerate from a neighbouring request. Verification
-- looks a row up by primary key, so it is already served by the PK index and
-- adding a second identifier column would only duplicate it.
--
-- What did need an index is the other hot query. Issuing a code has to find
-- the live codes for a number (to invalidate them) and count the number's
-- requests inside the rolling 24-hour window. The existing
-- idx_customer_otp_codes_phone_created covers the count. The live-code lookup
-- filters on two nullable state columns as well, and on a busy number most
-- rows in the window are spent — consumed, invalidated or expired. A partial
-- index keeps only the handful of rows that are actually live, so that lookup
-- stays constant-ish regardless of how much history a number accumulates.
--
-- Partial rather than a plain three-column index on purpose: the index then
-- holds almost nothing (at most one live row per number at a time, since
-- issuing a new code invalidates the previous one), which keeps it cheap to
-- maintain on the write path that runs on every single OTP request.
-- ==========================================================================

CREATE INDEX IF NOT EXISTS idx_customer_otp_codes_live
  ON customer_otp_codes (phone_e164, created_at DESC)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;
