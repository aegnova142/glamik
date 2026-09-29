# Glamirk Database

Postgres (Neon in production). This folder is the source of truth for **schema**.

```
database/
├── migrations/   numbered, forward-only SQL — applied in order, exactly once each
├── seeds/        what gets seeded, and how
└── README.md
```

## Migrations

| File | Contents |
|---|---|
| `001_core_cms_and_customers.sql` | `cms_state`, `customers`, `wishlist_items`, `cart_items` |
| `002_orders_and_fulfilment.sql` | `orders`, `order_items`, `order_status_history` |
| `003_reviews_returns_notifications.sql` | `reviews`, `return_requests`, `notifications`, `admin_notifications` |
| `004_customer_addresses.sql` | `customer_addresses` |
| `005_account_system.sql` | sessions, beauty profiles, shade history, notification prefs, recently viewed, rewards ledger, coupon redemptions, support tickets |
| `006_order_shipment_fields.sql` | courier/AWB columns on `orders` |

These six were extracted verbatim from the `ensureSchema()` string that previously
lived in `backend/src/db/db.ts`. The extraction was verified two ways:

1. Every one of the 58 SQL statements is present, in the original order.
2. Building two scratch databases — one from the old inline SQL, one from these
   files — produces **identical** `information_schema` output: 188 columns, 175
   constraints, 49 keys/checks, 36 indexes, across all 20 tables.

**001–006 are the historical baseline and are intentionally idempotent**
(`IF NOT EXISTS` throughout), so applying them to the existing production
database is a safe no-op that simply records them as applied. Migrations from
007 onward need not be idempotent, because the ledger guarantees they run once.

### Rules

- **Migrations are immutable once applied.** To change the schema, add a new
  file — never edit an old one. The runner stores a checksum per migration and
  warns loudly if a previously-applied file has changed, because two databases
  silently disagreeing about their schema is very expensive to debug.
- **Numbered prefixes are zero-padded**, so lexical order is chronological order.
- **One concern per file.** Each runs in its own transaction: either the whole
  file lands and is recorded, or none of it does and startup fails loudly.

## Applying them

Nothing has to be run by hand — the server applies pending migrations at boot
(`ensureSchema()` in `backend/src/db/db.ts` now delegates to the runner). The
CLI exists for CI, a fresh database, or migrating before switching traffic:

```bash
npm run migrate                 # apply anything pending
npm run seed                    # populate default content (skips if present)
npm run seed -- --force         # overwrite cms_state — destroys admin edits
```

The ledger lives in `schema_migrations` (`version`, `checksum`, `applied_at`).

## Rebuilding from zero

```bash
createdb glamirk            # or any empty Postgres database
export DATABASE_URL="postgresql://user:pass@localhost:5432/glamirk"
npm run migrate
npm run seed
npm run dev
```

TLS is negotiated automatically for managed providers and skipped for
`localhost`, so a local Postgres works without extra configuration.

## Two persistence patterns

Glamirk deliberately uses both, and the split matters:

| Data | Where | Why |
|---|---|---|
| Content: products, categories, pages, offers, journal, FAQs, hero, footer, media, settings | a single `cms_state` JSONB row | The admin edits whole documents and publishes atomically; one row means one transactional save and no partially-published state |
| Transactional: customers, orders, cart, wishlist, addresses, reviews, returns, notifications, rewards, sessions | normalised tables | These need constraints, indexes, foreign keys and concurrent-safe updates |

Normalising the content graph was considered and deliberately **not** done — it
would rewrite all 26 admin panels and the entire storefront read path on a live
store, for no benefit the JSONB row doesn't already provide.
