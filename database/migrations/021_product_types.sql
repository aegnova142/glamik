-- ==========================================================================
-- 021_product_types.sql
-- ==========================================================================
--
-- Admin-defined product types ("Lipstick", "Sindoor", "Lip Care"), as a
-- normalized table keyed by an immutable id.
--
-- WHY A TABLE AND NOT MORE JSONB. The catalog lives in the cms_state document
-- and this migration does not move it — that would touch checkout, inventory
-- and orders, which is a different piece of work. But the TYPE list is the one
-- part that needs what a document cannot give:
--
--   * case-insensitive uniqueness, enforced where it cannot be raced. Two
--     admins creating "Lip Care" and "lip care" in the same second is a check
--     application code loses; a unique index wins it every time.
--   * a stable id to reference, so a rename is a rename and not an orphaning.
--
-- WHY IDS RATHER THAN NAMES. shared/src/data/taxonomy.ts carries a comment
-- explaining that Shop's filter was deliberately moved OFF admin-editable data
-- because renaming a category, or a value drifting to "Eyes " with a trailing
-- space, made products silently vanish from the filters. That diagnosis was
-- right, but the cause was keying on the NAME. A product referencing
-- type_id 'ptype-lips' keeps resolving after someone renames that type from
-- "Lips" to "Lip Colour" — the display label changes and nothing is orphaned.
-- Keying on an id is what makes a dynamic list safe, so the filter can be
-- driven by admin data again without reinstating that bug.
--
-- BACKFILL. Every distinct subCategory already present in the catalog becomes
-- a type, so legacy products map onto one from the moment this applies and no
-- product is left untyped. Done here in SQL rather than in application code so
-- that a database which has run this migration is never in a half-populated
-- state, regardless of whether the app has started yet.
--
-- Products are NOT rewritten. Product.subCategory keeps its current value and
-- stays the legacy bridge: resolveProductType() in shared/ matches a product
-- with no typeId to a type by name. That is what keeps existing ?subCategory=
-- links, existing filters and existing saved products working untouched.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS product_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- The top-level section this type belongs to ('Makeup' | 'Skin' | 'Nails').
  -- Nullable on purpose: a type that has not been assigned one still has to
  -- list and still has to filter, it simply does not nest under a section.
  category    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness. A functional index rather than a CHECK or an
-- application guard: "Lip Care" and "lip care" are the same type to a human,
-- and the database is the only layer that can say so under concurrency.
CREATE UNIQUE INDEX IF NOT EXISTS product_types_name_lower_idx
  ON product_types (LOWER(name));

-- Slugs address a type in a URL (?type=lip-care), so they must be unique too.
CREATE UNIQUE INDEX IF NOT EXISTS product_types_slug_idx
  ON product_types (slug);

-- The storefront's only read: active types in display order. Covered so the
-- list never costs a sequential scan as the catalog grows.
CREATE INDEX IF NOT EXISTS product_types_active_order_idx
  ON product_types (is_active, sort_order, name);

-- --------------------------------------------------------------------------
-- Backfill from the existing catalog.
--
-- DISTINCT ON (LOWER(...)) collapses values that differ only by case or
-- surrounding whitespace — exactly the drift the taxonomy comment describes —
-- so the unique index below cannot be violated by two spellings of one type.
-- NULLIF(TRIM(...), '') drops products carrying an empty subCategory.
--
-- The id is derived from the slug rather than random, so re-running this on a
-- database that already has these rows is a no-op rather than a duplicate.
-- --------------------------------------------------------------------------
INSERT INTO product_types (id, name, slug, category, is_active, sort_order)
SELECT
  'ptype-' || slug,
  name,
  slug,
  category,
  TRUE,
  row_number() OVER (ORDER BY LOWER(name))
FROM (
  SELECT DISTINCT ON (LOWER(NULLIF(TRIM(p->>'subCategory'), '')))
    NULLIF(TRIM(p->>'subCategory'), '') AS name,
    -- Lowercase, non-alphanumerics to single hyphens, trimmed of leading and
    -- trailing hyphens. Mirrors slugify() in shared/utils/productType.ts; the
    -- two must agree or a backfilled row and an app-created row could collide.
    TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(TRIM(p->>'subCategory')), '[^a-z0-9]+', '-', 'g')) AS slug,
    NULLIF(TRIM(p->>'category'), '') AS category
  FROM cms_state,
       LATERAL jsonb_array_elements(COALESCE(data->'products', '[]'::jsonb)) AS p
  WHERE NULLIF(TRIM(p->>'subCategory'), '') IS NOT NULL
  -- Tie-break on the TRIMMED name, not the raw value: between "Lips" and
  -- " lips " the raw ordering puts the leading space first and the type would
  -- be named "lips". Comparing trimmed values makes the capitalised spelling
  -- win, which is the one a shopper should see on a filter row.
  ORDER BY LOWER(NULLIF(TRIM(p->>'subCategory'), '')), NULLIF(TRIM(p->>'subCategory'), '')
) AS distinct_types
WHERE slug <> ''
ON CONFLICT DO NOTHING;
