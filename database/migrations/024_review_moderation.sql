-- ==========================================================================
-- 024_review_moderation.sql
-- ==========================================================================
--
-- Reviews become moderated, rating-only reviews become possible, beauty
-- details (shade / skin tone / undertone) get columns, and shoppers can mark a
-- review helpful.
--
-- MODERATION. A new or edited review is 'pending' and invisible on the
-- storefront until an admin approves it. Rows that already existed were live
-- before this migration, so they are added as 'approved' (the column is
-- created with that default, then the default is switched to 'pending' for
-- everything written from now on). Rejected rows stay in the table so the
-- customer can see why, edit and resubmit.
--
-- RATING-ONLY. comment stays NOT NULL but may be '' — every reader already
-- treats it as text, so an empty string needs no null checks anywhere.
-- ==========================================================================

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE reviews ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderation_note TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS shade_name TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS skin_tone TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS undertone TEXT;

ALTER TABLE reviews ALTER COLUMN comment SET DEFAULT '';

CREATE INDEX IF NOT EXISTS reviews_status_created_idx ON reviews (status, created_at DESC);

-- One vote per (review, customer). A vote is a row; un-voting deletes it.
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, customer_id)
);
