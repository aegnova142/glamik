# Seeds

Running `npm run seed` writes Glamirk's default content graph into the
`cms_state` row: the starter catalog, categories, hero, footer, journal, FAQs,
looks, try-on models and store settings.

## Where the seed data lives

The catalog modules are **not** in this folder — they live in
`shared/src/data/` (`products`, `editorial`, `commerce`, `looks`, `models`,
`journal`, `taxonomy`).

That is deliberate. The same data is read by three workspaces:

- the **backend**, to seed a fresh database;
- the **storefront**, as an offline fallback when the CMS hasn't loaded;
- the **admin**, for taxonomy options.

Anything used by two or more workspaces belongs in `@glamirk/shared`. Keeping a
second copy here would be the exact drift trap the shared package exists to
prevent.

The runner that assembles and writes it is `backend/src/db/seed.ts`, invoked by
`backend/src/db/cli-seed.ts`. It needs the connection pool, so it lives with the
backend rather than in this folder.

## Behaviour

```bash
npm run seed                 # safe: skips entirely if cms_state already has content
npm run seed -- --force      # replaces cms_state with the defaults
```

Seeding is **idempotent by default**. On a store with real content, overwriting
`cms_state` would destroy every admin edit ever made — so that only happens when
you ask for it explicitly with `--force`.

You rarely need to run this at all: `loadDatabase()` seeds an empty database on
first boot automatically. The command exists so "rebuild from zero" is a single
documented step rather than a side effect.

## Adding SQL seeds

If you ever need row-level seed data for the *normalised* tables (as opposed to
the `cms_state` content graph), add numbered `.sql` files here and extend
`cli-seed.ts` to apply them after the content seed. Nothing does today —
customers, orders and the rest are all created through the running application.
