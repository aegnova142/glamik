# 03 — Shop flow

## How types reach the storefront

They ride inside the **single content payload Shop already fetches**:

```
GET /api/cms/content  →  { products, categories, productTypes, … }
```

No second endpoint, so adding dynamic types costs **zero extra round trips**.
Served from the in-process cache, so it costs no extra query either, except on
the first call after an admin edit.

**Inactive types are included in that payload.** A product assigned to a
deactivated type must still resolve to it, or it would fall back to the legacy
name match and could disappear from the catalog entirely. `selectableTypes()`
on the client decides what a shopper is actually offered.

## What a shopper is offered

`selectableTypes(types, counts)` keeps a type only when it is **active** *and*
**has at least one product**, then orders by `sortOrder` then name.

Dropping empty types matters: a filter row that always yields "no products" is
a dead end rather than a choice.

## The two surfaces

| Surface | File | Was |
|---|---|---|
| Pill row | `ShopPage.tsx` | 5 hardcoded entries — "Matte Lipsticks", "Luxury Sindoor", "Cleansing Rituals", "New Launches" |
| Filter sidebar | `FilterPanel.tsx` | Derived from the fixed `PRODUCT_TAXONOMY` constant |

Both are now `useMemo` over `productTypes`. Creating a type in the admin puts
it in both with no edit to either file.

### The one pill that is still hardcoded

**New Launches** is not a type — it is a view *across* every type, so it cannot
come from the type list. It stays a fixed pill, rendered only when something in
the catalog is actually tagged `NEW`.

It filters on `product.tag === 'NEW'`, which is what the `newest` sort already
treats as the marker. The pill it replaces was pinned to
`category: 'Makeup', subCategory: null`, so it listed Makeup products carrying
no `NEW` tag and **hid the one product that had it**. Its `isNew: true` flag
was declared and never read.

## Filtering

`FilterState` carries three related fields:

```ts
typeId?: string | null;   // the selected type
category?: string | null; // legacy, kept in step for URLs
subCategory?: string | null;
tag?: string | null;      // 'NEW' — a separate dimension
```

The predicate:

```ts
if (filters.tag && product.tag !== filters.tag) return false;

if (filters.typeId) {
  const resolved = resolveProductType(product, byId, byName);
  if (resolved?.id !== filters.typeId) return false;
} else {
  if (filters.category && product.category !== filters.category) return false;
  if (filters.subCategory && product.subCategory !== filters.subCategory) return false;
}
```

The `else` branch is the **untouched original**. A URL arriving with no
resolvable type still filters exactly as it did before this feature.

Type and tag are **mutually exclusive** — every pill sets all four fields, so
picking New Launches clears the type and picking a type clears the tag. Leaving
the other dimension set would silently intersect two pills while only one
looked selected.

### One rule, one place

`resolveProductType` is the same function the cart endpoint and the admin read.
Shop's filter and the server's notion of a valid type cannot drift into
disagreeing, which is precisely how products silently stopped appearing under
the old name-keyed system.

Indexes (`indexTypesById`, `indexTypesByName`) are built once per catalog/type
change and reused by the filter, the pills and the counts — otherwise each
would re-resolve every product on every keystroke.

## URLs stay in their current shape

Selecting a type sets `typeId` internally but navigates to the **existing**
param shape:

```
/shop?category=Makeup&subCategory=Lips     ← unchanged, SEO-safe
/shop?tag=NEW                              ← new, for New Launches
```

Published links keep working, and links copied from the new UI look like the
old ones. On arrival, an effect upgrades `?subCategory=` to the matching type
id once the type list has loaded — scoped to the case where no type is chosen
yet, so it can never overwrite a shopper's own click.

**Verified:**

| URL | Result |
|---|---|
| `?category=Makeup&subCategory=Lips` | filters, `LIPS` pill highlighted |
| `?category=Makeup&subCategory=Lip%20Care` | resolves the newly created type |
| `?tag=NEW` | 1 product, `NEW LAUNCHES` highlighted, chip shown |

## Counts and pagination

The header states what is on screen *and* the totals:

```
Showing 1–12 of 14 products
Showing 1–1 of 1 (filtered from 14) products
```

`PAGE_SIZE = 12` — fills the 4-across desktop grid in exact rows and divides
evenly at every breakpoint (1/2/3/4 columns).

Pagination is **client-side**, over a catalog the storefront already holds in
full from the single content call. Paging at the server would turn one request
into one request per page without reducing any work, because filter and sort
both run over the whole catalog anyway.

Two guards:

- Page resets to 1 when filters or sort change.
- Page is **clamped** to `totalPages` — 40 results on page 3, filter down to 8,
  and page 3 no longer exists. Clamping rather than resetting means narrowing
  from page 1 does not feel like a jump.

The pager renders only when `totalPages > 1`, so a small catalog looks exactly
as it did before.

**Verified** (14 products): page 1 → 12 cards `1–12 of 14`; page 2 → 2 cards
`13–14 of 14`; Previous → page 1; filtering from page 2 down to a single result
retires the pager and shows the product rather than stranding an empty page.

## Accessibility and states

- Pager is a `<nav aria-label="Product pages">` with `aria-current="page"` and
  per-button `aria-label`.
- The admin picker is a `role="combobox"` over a `role="listbox"`, with
  `aria-selected` on each option.
- The manager states **loading**, **error with a Retry**, and **empty**
  explicitly — never a blank panel.
- Errors use `role="alert"`.
- A sold-out swatch carries its state in the `aria-label`, not only in dimming.
