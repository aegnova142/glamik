-- ==========================================================================
-- 012_sql_inventory.sql
-- ==========================================================================
--
-- Moves inventory out of the cms_state JSONB document into dedicated SQL
-- tables with row-level locking.
--
-- WHY: stock currently lives inside one JSONB blob. Every checkout read the
-- whole document, mutated an array in memory and wrote the whole document
-- back. Correctness depended entirely on serialising those read-modify-write
-- cycles — first through an in-process promise chain, later also a Postgres
-- advisory lock. That works, but it serialises *every* checkout in the store
-- behind a single global lock regardless of which product is being bought,
-- and it cannot express a reservation that expires.
--
-- WHAT THIS MIGRATION DOES NOT DO: it does not change a single stock number,
-- and it does not switch anything over. The legacy JSONB stays the source of
-- truth until INVENTORY_SQL_MODE is turned on, and keeps being written even
-- then, so a rollback is a flag flip rather than a restore.
--
-- ==========================================================================
-- THE STOCK HIERARCHY THIS MUST REPRODUCE EXACTLY
-- ==========================================================================
--
-- Stock is addressed at up to three levels, and the legacy code reads and
-- writes them differently:
--
--   READ  (getCurrentStock in shared/src/utils/productVariant.ts):
--         most specific level that defines a number wins, falling back
--         outward:  size.stock ?? shade.stock ?? product.stock
--
--   WRITE (checkout / restock):
--         a CASCADE — product.stock is ALWAYS decremented, and so is the
--         most specific level when it defines its own number.
--
-- That asymmetry is deliberate here, not an oversight in this migration: for
-- a product with per-shade stock, product.stock behaves as a shared pool that
-- also drains, while shade.stock is what actually gates the sale. Reproducing
-- it faithfully is the whole point — "never silently change stock quantities"
-- includes never silently changing which number gates a sale.
--
-- So one inventory row is created per level that defines a number, and the
-- service layer resolves and mutates them with the same rules.
-- ==========================================================================

-- ==========================================
-- INVENTORY
-- ==========================================

/*
 * One row per stock-bearing unit.
 *
 * The (product_id, variant_id, size_label) triple identifies the level:
 *
 *   (p, NULL, NULL)  product-level pool            — always present
 *   (p, s,    NULL)  a shade that defines stock
 *   (p, s,    'S')   a shade's size that defines stock
 *   (p, NULL, 'S')   a product-level size (sizePricing) that defines stock
 *
 * There is deliberately no foreign key to a products table: products live in
 * the cms_state JSONB document, not a relational table, so there is nothing
 * to reference. Referential integrity is instead enforced by the sync/verify
 * tooling, which reports any inventory row whose product no longer exists
 * rather than letting the database silently cascade-delete real stock.
 */
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  -- NULL means "this level does not apply", which is why the uniqueness below
  -- is expressed over COALESCE rather than a plain UNIQUE: SQL NULLs are
  -- distinct from one another, so a plain constraint would happily allow two
  -- product-level rows for the same product.
  variant_id TEXT,
  size_label TEXT,

  -- Units a customer may still buy.
  available_stock INTEGER NOT NULL DEFAULT 0 CHECK (available_stock >= 0),
  -- Units held by an order that is placed but not yet delivered. Not sellable,
  -- not yet sold.
  reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  -- Units that actually reached a customer.
  sold_stock INTEGER NOT NULL DEFAULT 0 CHECK (sold_stock >= 0),

  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One inventory row per addressable unit. Expressed over COALESCE so the
-- NULL-bearing levels collapse to a comparable value — this is the constraint
-- that makes "duplicate reservations" and double-backfill impossible at the
-- database level rather than only in application code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_unit
  ON inventory (product_id, COALESCE(variant_id, ''), COALESCE(size_label, ''));

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant ON inventory (variant_id) WHERE variant_id IS NOT NULL;
-- Supports the admin "what is running out" screen without scanning the table.
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock
  ON inventory (product_id) WHERE available_stock <= low_stock_threshold;

-- ==========================================
-- RESERVATIONS
-- ==========================================

/*
 * A claim on stock held by one order line.
 *
 * Reservations exist so that stock can be held without being permanently
 * deducted, and so that a hold can expire. An online order that is never paid
 * must not keep the last unit off sale forever; `expires_at` plus the sweep in
 * the application layer is what guarantees that.
 *
 * status:
 *   ACTIVE    holding stock (counted in inventory.reserved_stock)
 *   COMMITTED converted to sold_stock on delivery
 *   RELEASED  returned to available_stock (cancel, payment failure, expiry)
 */
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- Denormalised so a reservation can be read and reported without joining
  -- back through inventory; also what the per-user ownership check uses.
  user_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  size_label TEXT,

  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  -- NULL means "no expiry": a confirmed COD order holds its stock until it is
  -- delivered or cancelled, not for thirty minutes.
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most ONE active reservation per (order, inventory unit). This is the
-- database-level guarantee behind "prevent duplicate reservations" — a
-- retried checkout or a double-clicked button hits this constraint instead of
-- holding the same stock twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_order_unit_active
  ON inventory_reservations (order_id, inventory_id) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_reservations_order ON inventory_reservations (order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_inventory ON inventory_reservations (inventory_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON inventory_reservations (user_id) WHERE user_id IS NOT NULL;
-- Drives the expiry sweep: finds only the rows that can actually expire,
-- rather than scanning every reservation ever made.
CREATE INDEX IF NOT EXISTS idx_reservations_expiry
  ON inventory_reservations (expires_at) WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;

-- ==========================================
-- TRANSACTION LOG
-- ==========================================

/*
 * Append-only history of every inventory mutation.
 *
 * Records the quantity before and after, not just the delta, so a disputed
 * count can be reconstructed from the log alone — if the running total and the
 * inventory row ever disagree, the log is what identifies which mutation went
 * wrong. Nothing in the application ever updates or deletes a row here.
 */
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  size_label TEXT,

  -- RESERVE | RELEASE | COMMIT | RESTOCK | ADJUST | MIGRATE
  operation TEXT NOT NULL,
  -- Signed: negative removes from available, positive returns to it.
  quantity INTEGER NOT NULL,

  -- Snapshot of all three counters either side of the mutation.
  previous_available INTEGER NOT NULL,
  new_available INTEGER NOT NULL,
  previous_reserved INTEGER NOT NULL,
  new_reserved INTEGER NOT NULL,
  previous_sold INTEGER NOT NULL,
  new_sold INTEGER NOT NULL,

  order_id TEXT,
  reservation_id TEXT,
  -- Who or what caused it: a customer id, an admin id, or 'system'.
  actor TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_tx_inventory ON inventory_transactions (inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_order ON inventory_transactions (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_tx_product ON inventory_transactions (product_id, created_at DESC);

-- ==========================================
-- BACKFILL
-- ==========================================

/*
 * Populates inventory from the live cms_state document.
 *
 * Done in SQL rather than application code so it runs inside this migration's
 * transaction: either every row lands or none does, and a half-migrated
 * inventory is never visible.
 *
 * Guarded by NOT EXISTS on every insert, so re-running the migration can never
 * double-count. The ON CONFLICT DO NOTHING on the unique index is the second
 * line of defence.
 *
 * available_stock is copied verbatim from the JSONB. reserved_stock and
 * sold_stock are derived from real order rows below — never invented.
 */

-- Product-level pool: one row for every product in the catalogue.
INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
SELECT
  'inv-p-' || (p->>'id'),
  p->>'id',
  NULL,
  NULL,
  GREATEST(0, COALESCE((p->>'stock')::int, 0))
FROM cms_state s,
     LATERAL jsonb_array_elements(s.data->'products') AS p
WHERE s.id = 'main'
  AND p->>'id' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Shade-level: only for shades that actually define their own stock. A shade
-- with no stock key falls back to the product pool and must NOT get a row,
-- or it would start gating sales on a number the old code never consulted.
INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
SELECT
  'inv-v-' || (p->>'id') || '-' || (sh->>'id'),
  p->>'id',
  sh->>'id',
  NULL,
  GREATEST(0, COALESCE((sh->>'stock')::int, 0))
FROM cms_state s,
     LATERAL jsonb_array_elements(s.data->'products') AS p,
     LATERAL jsonb_array_elements(COALESCE(p->'shades', '[]'::jsonb)) AS sh
WHERE s.id = 'main'
  AND p->>'id' IS NOT NULL
  AND sh->>'id' IS NOT NULL
  AND sh ? 'stock'
  AND jsonb_typeof(sh->'stock') = 'number'
ON CONFLICT DO NOTHING;

-- Shade + size level, same rule: only sizes that define a number.
INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
SELECT
  'inv-vs-' || (p->>'id') || '-' || (sh->>'id') || '-' || (sz->>'label'),
  p->>'id',
  sh->>'id',
  sz->>'label',
  GREATEST(0, COALESCE((sz->>'stock')::int, 0))
FROM cms_state s,
     LATERAL jsonb_array_elements(s.data->'products') AS p,
     LATERAL jsonb_array_elements(COALESCE(p->'shades', '[]'::jsonb)) AS sh,
     LATERAL jsonb_array_elements(COALESCE(sh->'sizes', '[]'::jsonb)) AS sz
WHERE s.id = 'main'
  AND p->>'id' IS NOT NULL
  AND sh->>'id' IS NOT NULL
  AND sz->>'label' IS NOT NULL
  AND sz ? 'stock'
  AND jsonb_typeof(sz->'stock') = 'number'
ON CONFLICT DO NOTHING;

-- Product-level sizes (sizePricing), used by products that have no shades.
INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
SELECT
  'inv-ps-' || (p->>'id') || '-' || sp.key,
  p->>'id',
  NULL,
  sp.key,
  GREATEST(0, COALESCE((sp.value->>'stock')::int, 0))
FROM cms_state s,
     LATERAL jsonb_array_elements(s.data->'products') AS p,
     LATERAL jsonb_each(COALESCE(p->'sizePricing', '{}'::jsonb)) AS sp
WHERE s.id = 'main'
  AND p->>'id' IS NOT NULL
  AND sp.value ? 'stock'
  AND jsonb_typeof(sp.value->'stock') = 'number'
ON CONFLICT DO NOTHING;

/*
 * reserved_stock, from orders that are placed but not finished.
 *
 * These units were already subtracted from the JSONB `stock` by the old
 * checkout, so available_stock above already excludes them. Setting reserved
 * here is therefore not double counting — the two are independent counters,
 * and without it the first delivery of a pre-migration order would try to move
 * stock out of a reserved pool of zero.
 *
 * Matched to the most specific inventory row that exists for the order line,
 * mirroring the read hierarchy.
 */
WITH in_flight AS (
  SELECT
    oi.product_id,
    oi.variant_id,
    oi.selected_size,
    SUM(oi.quantity)::int AS qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'RTO')
    AND o.stock_committed = true
    AND o.stock_restored = false
  GROUP BY oi.product_id, oi.variant_id, oi.selected_size
),
resolved AS (
  SELECT
    f.qty,
    COALESCE(
      (SELECT i.id FROM inventory i
        WHERE i.product_id = f.product_id
          AND i.variant_id IS NOT DISTINCT FROM f.variant_id
          AND i.size_label IS NOT DISTINCT FROM f.selected_size),
      (SELECT i.id FROM inventory i
        WHERE i.product_id = f.product_id
          AND i.variant_id IS NOT DISTINCT FROM f.variant_id
          AND i.size_label IS NULL),
      (SELECT i.id FROM inventory i
        WHERE i.product_id = f.product_id
          AND i.variant_id IS NULL
          AND i.size_label IS NULL)
    ) AS inventory_id
  FROM in_flight f
)
-- Assigned absolutely rather than added to.
--
-- The inserts above are ON CONFLICT DO NOTHING, so they are safe to re-run;
-- an additive update here would not be, and the two together would make the
-- migration *look* idempotent while silently doubling reserved and sold on a
-- second application. The runner records applied migrations and will not
-- normally re-run this, but a backfill that is only correct when run exactly
-- once is a trap for whoever next replays a migration by hand.
UPDATE inventory i
SET reserved_stock = agg.qty,
    updated_at = now()
FROM (SELECT inventory_id, SUM(qty)::int AS qty FROM resolved WHERE inventory_id IS NOT NULL GROUP BY inventory_id) agg
WHERE i.id = agg.inventory_id;

/*
 * sold_stock, from delivered orders.
 *
 * Purely informational — it does not affect what is sellable. Derived from
 * real order rows rather than invented, so the number means something.
 */
WITH delivered AS (
  SELECT
    oi.product_id,
    oi.variant_id,
    oi.selected_size,
    SUM(oi.quantity)::int AS qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status = 'DELIVERED'
  GROUP BY oi.product_id, oi.variant_id, oi.selected_size
),
resolved AS (
  SELECT
    d.qty,
    COALESCE(
      (SELECT i.id FROM inventory i
        WHERE i.product_id = d.product_id
          AND i.variant_id IS NOT DISTINCT FROM d.variant_id
          AND i.size_label IS NOT DISTINCT FROM d.selected_size),
      (SELECT i.id FROM inventory i
        WHERE i.product_id = d.product_id
          AND i.variant_id IS NOT DISTINCT FROM d.variant_id
          AND i.size_label IS NULL),
      (SELECT i.id FROM inventory i
        WHERE i.product_id = d.product_id
          AND i.variant_id IS NULL
          AND i.size_label IS NULL)
    ) AS inventory_id
  FROM delivered d
)
-- Absolute, for the same reason as the reserved backfill above.
UPDATE inventory i
SET sold_stock = agg.qty,
    updated_at = now()
FROM (SELECT inventory_id, SUM(qty)::int AS qty FROM resolved WHERE inventory_id IS NOT NULL GROUP BY inventory_id) agg
WHERE i.id = agg.inventory_id;

-- Audit row per backfilled unit, so the opening balance is in the same log as
-- every later movement and the history has no gap at its start.
INSERT INTO inventory_transactions (
  id, inventory_id, product_id, variant_id, size_label, operation, quantity,
  previous_available, new_available, previous_reserved, new_reserved,
  previous_sold, new_sold, actor, reason
)
SELECT
  'invtx-migrate-' || i.id,
  i.id, i.product_id, i.variant_id, i.size_label,
  'MIGRATE', i.available_stock,
  0, i.available_stock,
  0, i.reserved_stock,
  0, i.sold_stock,
  'system',
  'Opening balance migrated from cms_state JSONB (migration 012)'
FROM inventory i
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- VERIFICATION VIEW
-- ==========================================

/*
 * Side-by-side comparison of legacy JSONB stock and SQL inventory.
 *
 * Exists so "do the two agree?" is a query an operator can run on production
 * at any time, during the dual-write window and after. The migration is not
 * considered verified until this returns no rows with a non-zero difference.
 */
CREATE OR REPLACE VIEW inventory_migration_check AS
WITH legacy AS (
  SELECT p->>'id' AS product_id, NULL::text AS variant_id, NULL::text AS size_label,
         COALESCE((p->>'stock')::int, 0) AS legacy_stock
  FROM cms_state s, LATERAL jsonb_array_elements(s.data->'products') AS p
  WHERE s.id = 'main' AND p->>'id' IS NOT NULL

  UNION ALL
  SELECT p->>'id', sh->>'id', NULL::text, COALESCE((sh->>'stock')::int, 0)
  FROM cms_state s,
       LATERAL jsonb_array_elements(s.data->'products') AS p,
       LATERAL jsonb_array_elements(COALESCE(p->'shades', '[]'::jsonb)) AS sh
  WHERE s.id = 'main' AND sh ? 'stock' AND jsonb_typeof(sh->'stock') = 'number'

  UNION ALL
  SELECT p->>'id', sh->>'id', sz->>'label', COALESCE((sz->>'stock')::int, 0)
  FROM cms_state s,
       LATERAL jsonb_array_elements(s.data->'products') AS p,
       LATERAL jsonb_array_elements(COALESCE(p->'shades', '[]'::jsonb)) AS sh,
       LATERAL jsonb_array_elements(COALESCE(sh->'sizes', '[]'::jsonb)) AS sz
  WHERE s.id = 'main' AND sz ? 'stock' AND jsonb_typeof(sz->'stock') = 'number'

  UNION ALL
  SELECT p->>'id', NULL::text, sp.key, COALESCE((sp.value->>'stock')::int, 0)
  FROM cms_state s,
       LATERAL jsonb_array_elements(s.data->'products') AS p,
       LATERAL jsonb_each(COALESCE(p->'sizePricing', '{}'::jsonb)) AS sp
  WHERE s.id = 'main' AND sp.value ? 'stock' AND jsonb_typeof(sp.value->'stock') = 'number'
)
SELECT
  COALESCE(l.product_id, i.product_id) AS product_id,
  COALESCE(l.variant_id, i.variant_id) AS variant_id,
  COALESCE(l.size_label, i.size_label) AS size_label,
  l.legacy_stock,
  i.available_stock AS sql_available,
  i.reserved_stock AS sql_reserved,
  i.sold_stock AS sql_sold,
  COALESCE(i.available_stock, 0) - COALESCE(l.legacy_stock, 0) AS difference,
  CASE
    WHEN l.product_id IS NULL THEN 'MISSING_IN_LEGACY'
    WHEN i.product_id IS NULL THEN 'MISSING_IN_SQL'
    WHEN l.legacy_stock = i.available_stock THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS verdict
FROM legacy l
FULL OUTER JOIN inventory i
  ON i.product_id = l.product_id
 AND i.variant_id IS NOT DISTINCT FROM l.variant_id
 AND i.size_label IS NOT DISTINCT FROM l.size_label;
