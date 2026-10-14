-- ==========================================================================
-- 022_product_sections.sql
-- ==========================================================================
--
-- Admin-defined sections ("Makeup", "Skin", "Nails", "Fragrance"), the level
-- above product types.
--
-- WHY. Migration 021 made the TYPE dimension admin-definable, but the section
-- above it stayed a closed 'Makeup' | 'Skin' | 'Nails' union enforced by a
-- hardcoded <select> in the admin. So an admin could invent "Lip Care" but not
-- "Fragrance", and the product form showed one dropdown they could extend and
-- one they could not, with no visible reason for the difference.
--
-- SAME SHAPE AS product_types, DELIBERATELY. Immutable id, freely renameable
-- name, slug as URL identity, case-insensitive uniqueness in the database, and
-- an is_active flag that hides without orphaning. Sections and types are the
-- same kind of object at two levels, so they get the same rules rather than a
-- second set to learn.
--
-- WHY NOT ONE TABLE WITH A parent_id. A self-referencing taxonomy would be
-- fewer tables and more cleverness: selectableTypes(), the counts and the
-- delete guards all mean different things for a section than for a type, and
-- expressing that as "rows whose parent is null" would put a branch in every
-- one of them. Two tables keep each query saying what it means.
--
-- WHY NOT CMSCategory. Those records already exist and are admin-editable —
-- but they are the homepage category GRID: marketing copy, images, display
-- order, free-text names. They are a presentation concern, and binding a
-- product's section to them would make the catalog depend on whether someone
-- renamed a homepage tile.
--
-- BACKFILL. Every distinct Product.category already in the catalog becomes a
-- section, so no product is left unsectioned. Products are NOT rewritten:
-- Product.category keeps its current value and remains the legacy bridge,
-- matched by name exactly as subCategory is for types.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS product_sections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Makeup" and "makeup" are one section to a human, so they are one row here.
-- Same reasoning as product_types_name_lower_idx: only the database can decide
-- a whole-table property under concurrency.
CREATE UNIQUE INDEX IF NOT EXISTS product_sections_name_lower_idx
  ON product_sections (LOWER(name));

CREATE UNIQUE INDEX IF NOT EXISTS product_sections_slug_idx
  ON product_sections (slug);

CREATE INDEX IF NOT EXISTS product_sections_active_order_idx
  ON product_sections (is_active, sort_order, name);

-- --------------------------------------------------------------------------
-- Backfill from the existing catalog.
--
-- Mirrors 021's backfill exactly, including the tie-break on the TRIMMED name
-- so a capitalised spelling wins over a whitespace-padded one, and the
-- slug-derived id so re-running is a no-op rather than a duplicate.
-- --------------------------------------------------------------------------
INSERT INTO product_sections (id, name, slug, is_active, sort_order)
SELECT
  'psec-' || slug,
  name,
  slug,
  TRUE,
  row_number() OVER (ORDER BY LOWER(name))
FROM (
  SELECT DISTINCT ON (LOWER(NULLIF(TRIM(p->>'category'), '')))
    NULLIF(TRIM(p->>'category'), '') AS name,
    TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(TRIM(p->>'category')), '[^a-z0-9]+', '-', 'g')) AS slug
  FROM cms_state,
       LATERAL jsonb_array_elements(COALESCE(data->'products', '[]'::jsonb)) AS p
  WHERE NULLIF(TRIM(p->>'category'), '') IS NOT NULL
  ORDER BY LOWER(NULLIF(TRIM(p->>'category'), '')), NULLIF(TRIM(p->>'category'), '')
) AS distinct_sections
WHERE slug <> ''
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- A section every type can point at.
--
-- product_types.category holds a section NAME. Any name already in use there
-- but absent from the catalog's products (a type assigned to a section no
-- product currently sits in) would otherwise have no row, and the admin's
-- section dropdown would not be able to show the type's own current value.
-- --------------------------------------------------------------------------
INSERT INTO product_sections (id, name, slug, is_active, sort_order)
SELECT
  'psec-' || slug,
  name,
  slug,
  TRUE,
  1000 + row_number() OVER (ORDER BY LOWER(name))
FROM (
  SELECT DISTINCT ON (LOWER(NULLIF(TRIM(category), '')))
    NULLIF(TRIM(category), '') AS name,
    TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(TRIM(category)), '[^a-z0-9]+', '-', 'g')) AS slug
  FROM product_types
  WHERE NULLIF(TRIM(category), '') IS NOT NULL
  ORDER BY LOWER(NULLIF(TRIM(category), '')), NULLIF(TRIM(category), '')
) AS type_sections
WHERE slug <> ''
ON CONFLICT DO NOTHING;
