-- ==========================================================================
-- 020_notification_read_indexes.sql
-- ==========================================================================
--
-- Indexes for the four notification queries that run most often.
--
-- All four were sequential scans. That is harmless today — a few dozen rows —
-- but these are the only tables in the system that grow monotonically and are
-- never pruned: every order adds several notification rows forever, and the
-- customer's bell is read on every page load by every signed-in customer.
-- A seq scan plus a sort is cheap at 54 rows and ruinous at 540,000.
--
-- Verified with EXPLAIN before writing this; each plan below was
-- "Seq Scan -> Sort -> Limit".
--
-- INDEX-ONLY, NO SCHEMA CHANGE. Nothing is added, dropped or rewritten, so
-- this is safe to apply to a live database. CREATE INDEX does take a brief
-- lock against writes on these tables; at current row counts that is
-- milliseconds. (CONCURRENTLY is deliberately not used: it cannot run inside
-- the transaction the migration runner wraps each file in.)
-- ==========================================================================

-- The customer notification bell:
--   SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50
-- Composite rather than user_id alone, so the ORDER BY is satisfied by the
-- index and no sort is needed.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- The unread badge:
--   SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false
-- Partial, because read notifications are the overwhelming majority over
-- time and none of them can ever match. Keeps the index small enough to stay
-- cached even as the table grows.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id)
  WHERE is_read = false;

-- The admin notification bell:
--   SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 50
-- A global feed with no WHERE clause, so the index exists purely to supply
-- the ordering.
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created
  ON admin_notifications (created_at DESC);

-- The outbox worker's due query, which runs every 60 seconds:
--   WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR <= now())
--   ORDER BY created_at ASC LIMIT 50
--
-- Led by created_at, NOT by next_attempt_at. The ordering is the expensive
-- part here: the existing partial index satisfies the filter but leaves the
-- planner sorting every pending row just to take the oldest 50. Leading with
-- created_at lets the scan walk in output order and stop at 50.
--
-- next_attempt_at therefore becomes a filter rather than a search key, which
-- is the right trade: rows that are pending but NOT yet due are the ones
-- sitting in backoff, always a small minority of the pending set, so little
-- is read and discarded.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due_ordered
  ON notification_deliveries (created_at)
  WHERE status = 'PENDING';
