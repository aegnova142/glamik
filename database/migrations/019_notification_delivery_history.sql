-- ==========================================================================
-- 019_notification_delivery_history.sql
-- ==========================================================================
--
-- Keeps a delivery's history readable after an admin retries it.
--
-- THE PROBLEM. retryNotification() sets attempts = 0, deliberately: the reason
-- an operator presses Retry is that they just fixed the underlying cause (bad
-- SMTP password, newly approved template), which the previous five attempts
-- could not have known about, so they deserve a full budget again. But that
-- reset also erased the only evidence that the delivery had ever struggled. A
-- row showing "attempts: 0, PENDING" looks brand new, and an admin cannot tell
-- a first send from the fourth rescue of a message that has been failing all
-- week.
--
-- total_attempts is the cumulative count and is NEVER reset. attempts stays as
-- it is — the live budget the backoff policy spends — and the two together say
-- "attempt 1 of 5, 12 overall", which is the sentence an operator actually
-- needs.
--
-- WHY last_attempt_at, when updated_at exists. updated_at moves for any write,
-- including a requeue that sent nothing. Showing it as "last attempt" would
-- claim a delivery was attempted at a moment when it was only re-queued.
-- last_attempt_at is written solely by the worker, immediately before the
-- channel is called, so the UI's "last tried" column means what it says.
--
-- requeued_by records which admin pressed Retry. The CMS audit log already
-- records the action, but it is a separate 300-entry ring buffer; by the time
-- a recurring failure is investigated the entry may have aged out, while this
-- column sits on the row being investigated.
--
-- ADDITIVE ONLY. Every column is nullable or defaulted, so existing rows
-- remain valid and nothing already written changes meaning. Backfilling
-- total_attempts from attempts is correct for existing rows precisely because
-- none of them can have been retried yet — the retry UI does not exist until
-- this migration lands.
-- ==========================================================================

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS total_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS requeued_at TIMESTAMPTZ;

-- Admin email rather than id: the id means nothing when read months later,
-- and the admin user table is small enough that the address is stable.
ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS requeued_by TEXT;

-- Existing rows have never been retried, so their live count IS their total.
UPDATE notification_deliveries
  SET total_attempts = attempts
  WHERE total_attempts = 0 AND attempts > 0;

-- The admin list is filtered by status and ordered by recency; without this
-- the panel sequentially scans every notification ever sent.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_updated
  ON notification_deliveries (status, updated_at DESC);
