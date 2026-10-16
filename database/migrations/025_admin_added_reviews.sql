-- ==========================================================================
-- 025_admin_added_reviews.sql
-- ==========================================================================
--
-- Lets an admin publish a review a real customer gave outside the site
-- (WhatsApp, Instagram, email, in store) with that customer's consent.
--
-- Such a customer usually has no account, so customer_id becomes nullable and
-- the row is marked source = 'admin'. The CHECK keeps the two kinds apart: a
-- customer review always has its author's account, an admin-entered one never
-- borrows someone's account (which would put it in their My Reviews and let it
-- collide with a review they write themselves).
--
-- order_id links an admin-entered review to a real DELIVERED order; it is the
-- only way such a review earns "Verified Purchase", and the partial unique
-- index allows one review per order line.
--
-- Additive and compatible with the previous release: existing rows and every
-- insert the old code makes are source = 'customer' with a customer_id.
-- ==========================================================================

ALTER TABLE reviews ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'customer'
  CHECK (source IN ('customer', 'admin'));
-- whatsapp | instagram | email | phone | store | other — admin-only, never public.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source_channel TEXT;
-- Email of the admin who entered it.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS entered_by TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE reviews ADD CONSTRAINT reviews_source_author_check CHECK (
  (source = 'customer' AND customer_id IS NOT NULL) OR (source = 'admin' AND customer_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_product_uidx ON reviews (order_id, product_id) WHERE order_id IS NOT NULL;
