-- ==========================================================================
-- 016_cart_items_size_unique.sql
-- ==========================================================================
--
-- A bag must be able to hold two SIZES of the same shade.
--
-- THE BUG THIS FIXES. Migration 001 created
--
--     UNIQUE (user_id, product_id, variant_id)
--
-- on cart_items, back when a shade was the whole sellable unit. Per-shade
-- sizes came later: a shade can now offer 30g at ₹699 and 50g at ₹899, and
-- `(product, variant, size)` is what identifies a unit everywhere else in the
-- system — it is the key the cart endpoint looks rows up by
-- (`variant_id IS NOT DISTINCT FROM $3 AND selected_size IS NOT DISTINCT FROM $4`),
-- the key order_items records, and the key the inventory table is indexed on.
--
-- The constraint never caught up. So the lookup correctly decided "this is a
-- new line", the INSERT then violated a constraint that still thought one
-- shade meant one row, and the request died with an unhandled 23505 — a 500,
-- not a message. A shopper simply could not put both sizes of one shade in
-- their bag.
--
-- WHY A MIGRATION IS UNAVOIDABLE. This is a constraint, not a rule in code:
-- no amount of application logic can insert a row the database refuses. The
-- only alternative would be to merge two differently-priced units onto one
-- cart line, which is not the same order.
--
-- WHAT THIS IS CAREFUL ABOUT. The replacement is a unique INDEX over
-- COALESCE'd columns rather than a table constraint, matching the idiom
-- migration 012 already uses for the inventory table
-- (`(product_id, COALESCE(variant_id,''), COALESCE(size_label,''))`).
--
-- That matters: in SQL, NULLs are distinct from each other, so the old
-- constraint never actually deduplicated shade-less products — two
-- `(user, product, NULL)` rows satisfied it. The endpoint's own
-- IS NOT DISTINCT FROM check is what has been preventing those, and a race
-- between two concurrent adds could have slipped one through. COALESCE makes
-- the index agree with the lookup instead of being weaker than it.
--
-- NOTHING IS DELETED. Any duplicates that the old constraint allowed are
-- MERGED — the oldest row survives and the others' quantities are added to it
-- — because those rows are things a shopper put in their bag, and dropping
-- them to make an index build would be fixing our bookkeeping by emptying
-- their basket.
--
-- `saved` is deliberately NOT part of the key, exactly as it was not part of
-- the old constraint. One unit is one row whichever list it is on: Add to Cart
-- finds a saved-for-later row and reactivates it rather than creating a second
-- one (see POST /cart/items). Adding `saved` to the key would permit the same
-- unit to exist twice, in both lists at once, and leave that lookup choosing
-- between them arbitrarily.
--
-- Nothing here touches orders, order_items, inventory, reservations or the
-- CMS document. Cart lines carry identity only — price and stock are resolved
-- live on every read — so no pricing is affected either way.
-- ==========================================================================

-- ==========================================
-- 1. Merge any duplicate lines the old constraint permitted.
-- ==========================================
WITH ranked AS (
  SELECT
    id,
    quantity,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id, product_id, COALESCE(variant_id, ''), COALESCE(selected_size, '')
      ORDER BY created_at, id
    ) AS keeper_id
  FROM cart_items
),
losers AS (
  SELECT keeper_id, SUM(quantity)::int AS extra_quantity
    FROM ranked
   WHERE id <> keeper_id
   GROUP BY keeper_id
)
UPDATE cart_items c
   SET quantity   = c.quantity + l.extra_quantity,
       updated_at = now()
  FROM losers l
 WHERE c.id = l.keeper_id;

DELETE FROM cart_items c
 USING (
   SELECT
     id,
     FIRST_VALUE(id) OVER (
       PARTITION BY user_id, product_id, COALESCE(variant_id, ''), COALESCE(selected_size, '')
       ORDER BY created_at, id
     ) AS keeper_id
   FROM cart_items
 ) d
 WHERE c.id = d.id AND d.id <> d.keeper_id;

-- ==========================================
-- 2. Swap the constraint for an index that includes the size.
--
-- The old constraint is dropped only after the new index exists, so there is
-- no window in which concurrent adds are unguarded.
-- ==========================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_unit
  ON cart_items (user_id, product_id, COALESCE(variant_id, ''), COALESCE(selected_size, ''));

ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_variant_id_key;

-- ==========================================
-- 3. Assert the result, in the style of 012/013 — a migration that silently
--    half-applied is worse than one that refused.
-- ==========================================
DO $$
DECLARE
  dupes INTEGER;
  has_index BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT 1
      FROM cart_items
     GROUP BY user_id, product_id, COALESCE(variant_id, ''), COALESCE(selected_size, '')
    HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION '016: % duplicate cart units survived the merge', dupes;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'cart_items' AND indexname = 'idx_cart_items_unit'
  ) INTO has_index;
  IF NOT has_index THEN
    RAISE EXCEPTION '016: idx_cart_items_unit was not created';
  END IF;

  RAISE NOTICE '016: cart lines are now keyed by (user, product, variant, size)';
END $$;
