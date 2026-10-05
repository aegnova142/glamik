-- ==========================================================================
-- 013_sql_inventory_reservations.sql
-- ==========================================================================
--
-- Backfills the inventory_reservations rows that migration 012 did not create.
--
-- WHY THIS IS NEEDED
--
-- Migration 012 set inventory.reserved_stock to a number derived from in-flight
-- orders, but created no reservation rows behind it. The counter was correct
-- and inventory:verify passed — legacy and SQL agreed on every unit — but the
-- counter had nothing backing it, and the reservation rows are what the order
-- state machine actually operates on:
--
--   * a cancellation calls releaseOrderReservations(), which releases the
--     ACTIVE rows for that order. With none, it releases zero — and the
--     customer's stock would stay locked in reserved_stock forever, never
--     returning to sale.
--
--   * a delivery calls commitOrderReservations(), which converts ACTIVE rows
--     into sold_stock. With none, it converts zero — reserved never drains and
--     sold never rises.
--
-- On production that was 66 units across 4 products (60 of them one lipstick
-- collection) that would have been permanently stranded the moment
-- INVENTORY_SQL_MODE was switched on.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
--   * It does not touch the legacy cms_state JSONB.
--   * It does not change available_stock or sold_stock.
--   * It does not change reserved_stock either — the counter is already
--     correct; this supplies the rows that justify it.
--   * It creates nothing for delivered, cancelled, returned or RTO orders.
-- ==========================================================================

-- ==========================================
-- BACKFILL
-- ==========================================

/*
 * One reservation per (order, inventory row).
 *
 * Grouped rather than one row per order_item, because two lines of the same
 * order can resolve to the same inventory row — two shades of a product that
 * both fall back to the product-level pool, for instance. The partial unique
 * index idx_reservations_order_unit_active permits only one ACTIVE reservation
 * per (order, inventory row), so those lines must be summed into a single
 * reservation rather than inserted separately.
 *
 * The inventory row is resolved through exactly the same fallback chain
 * migration 012 used, and that getCurrentStock uses:
 *
 *     (product, variant, size) -> (product, variant) -> (product)
 *
 * Using the same resolution is what guarantees these quantities reconcile with
 * the reserved_stock figure 012 already recorded. The assertion at the bottom
 * of this file proves it rather than assuming it.
 *
 * Order lines whose product has no inventory row at all — a product deleted
 * from the catalogue after the order was placed — resolve to NULL and are
 * excluded. There is nothing to reserve against: the inventory row does not
 * exist, and inventing one would create stock for a product that is no longer
 * sold. Those units were likewise excluded from 012's reserved_stock, which is
 * why the two still reconcile.
 */
WITH in_flight_lines AS (
  SELECT
    oi.order_id,
    o.user_id,
    oi.quantity,
    COALESCE(
      -- most specific: this exact variant and size
      (SELECT i.id FROM inventory i
        WHERE i.product_id = oi.product_id
          AND i.variant_id IS NOT DISTINCT FROM oi.variant_id
          AND i.size_label IS NOT DISTINCT FROM oi.selected_size),
      -- then: this variant, no size dimension
      (SELECT i.id FROM inventory i
        WHERE i.product_id = oi.product_id
          AND i.variant_id IS NOT DISTINCT FROM oi.variant_id
          AND i.size_label IS NULL),
      -- finally: the product-level pool
      (SELECT i.id FROM inventory i
        WHERE i.product_id = oi.product_id
          AND i.variant_id IS NULL
          AND i.size_label IS NULL)
    ) AS inventory_id
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  -- Genuinely in flight, by exactly the definition migration 012 used and the
  -- application still uses: committed stock, not yet given back, not finished.
  WHERE o.status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'RTO')
    AND o.stock_committed = true
    AND o.stock_restored = false
),
grouped AS (
  SELECT
    order_id,
    user_id,
    inventory_id,
    SUM(quantity)::int AS quantity
  FROM in_flight_lines
  WHERE inventory_id IS NOT NULL
  GROUP BY order_id, user_id, inventory_id
)
INSERT INTO inventory_reservations
  (id, inventory_id, order_id, user_id, product_id, variant_id, size_label, quantity, status, expires_at)
SELECT
  -- Deterministic id: re-running produces the same value, so the primary key
  -- is a second, independent guard against duplication alongside the ON
  -- CONFLICT below. Hashed to keep it bounded regardless of id lengths.
  'rsv-mig013-' || md5(g.order_id || ':' || g.inventory_id),
  g.inventory_id,
  g.order_id,
  g.user_id,
  i.product_id,
  i.variant_id,
  i.size_label,
  g.quantity,
  'ACTIVE',
  -- No expiry. These orders are already confirmed and past the payment window;
  -- an expiry would make the sweep release stock for orders that are genuinely
  -- on their way to a customer. Matches what commitOrderStock() sets for a
  -- confirmed order.
  NULL
FROM grouped g
JOIN inventory i ON i.id = g.inventory_id
-- Idempotency. A second run finds the existing ACTIVE reservation for this
-- (order, inventory row) and inserts nothing.
ON CONFLICT (order_id, inventory_id) WHERE status = 'ACTIVE' DO NOTHING;

-- ==========================================
-- ASSERTION
-- ==========================================

/*
 * Proves the backfill reconciles before this migration is allowed to commit.
 *
 * The migration runner wraps each file in BEGIN/COMMIT, so raising here rolls
 * the whole thing back and fails the deploy loudly. That is the correct
 * outcome: a reservation backfill that does not match the counter it is meant
 * to justify would leave inventory in a state where cancellations silently
 * lose stock — exactly the defect this migration exists to repair.
 *
 * Checked per inventory row, not in aggregate: two products whose errors
 * cancelled out would pass a total-only check while both being wrong.
 */
DO $$
DECLARE
  bad_row RECORD;
  mismatch_count INT := 0;
  detail TEXT := '';
BEGIN
  FOR bad_row IN
    SELECT i.id, i.product_id, i.reserved_stock,
           COALESCE(SUM(r.quantity), 0)::int AS active_qty
    FROM inventory i
    LEFT JOIN inventory_reservations r
      ON r.inventory_id = i.id AND r.status = 'ACTIVE'
    GROUP BY i.id, i.product_id, i.reserved_stock
    HAVING i.reserved_stock <> COALESCE(SUM(r.quantity), 0)
  LOOP
    mismatch_count := mismatch_count + 1;
    detail := detail || format(
      E'\n  %s: reserved_stock=%s but active reservations=%s',
      bad_row.product_id, bad_row.reserved_stock, bad_row.active_qty
    );
  END LOOP;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Migration 013 did not reconcile: % inventory row(s) disagree with their reservations.%',
      mismatch_count, detail
      USING HINT = 'Rolled back. Investigate before retrying — do not adjust counters by hand.';
  END IF;
END $$;

-- ==========================================
-- AUDIT
-- ==========================================

/*
 * One transaction-log entry per reservation created, so the backfill appears
 * in the same history as every later movement.
 *
 * Quantity 0 and identical before/after values on purpose: no stock moved.
 * reserved_stock was already correct; this migration supplied the rows behind
 * it. Recording a non-zero movement would misrepresent that as stock changing
 * hands.
 */
INSERT INTO inventory_transactions (
  id, inventory_id, product_id, variant_id, size_label, operation, quantity,
  previous_available, new_available, previous_reserved, new_reserved,
  previous_sold, new_sold, order_id, reservation_id, actor, reason
)
SELECT
  'invtx-mig013-' || md5(r.id),
  r.inventory_id, r.product_id, r.variant_id, r.size_label,
  'MIGRATE', 0,
  i.available_stock, i.available_stock,
  i.reserved_stock, i.reserved_stock,
  i.sold_stock, i.sold_stock,
  r.order_id, r.id, 'system',
  'Reservation row backfilled for an in-flight order (migration 013); counters unchanged'
FROM inventory_reservations r
JOIN inventory i ON i.id = r.inventory_id
WHERE r.id LIKE 'rsv-mig013-%'
ON CONFLICT (id) DO NOTHING;
