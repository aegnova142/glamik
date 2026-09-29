# Glamirk Beauty

A full-stack luxury beauty e-commerce platform — shade-matching quiz, virtual try-on, a complete
customer account system, and a self-serve CMS admin panel that controls nearly every pixel of the
storefront without touching code.

## Structure

An npm-workspaces monorepo. Three deployable apps and one shared library:

```
glamirk/
├── frontend/   @glamirk/frontend   storefront (Vite + React)      → served at /
├── admin/      @glamirk/admin      admin panel (Vite + React)     → served at /admin
├── backend/    @glamirk/backend    Express API + serves both bundles
├── shared/     @glamirk/shared     code used by two or more of the above
├── database/   migrations + seeds
└── ecosystem.config.cjs            pm2 process definition (VPS)
```

**Why `shared/` exists.** `types.ts` (~1500 lines) and `CMSContext.tsx` are each used by the
storefront, the admin *and* — for types — the backend. Duplicating them would guarantee silent
drift. The rule is simply: **anything imported by two or more workspaces lives in `shared/`.**
It ships TypeScript source (no build step), so edits hot-reload everywhere.

The backend imports only `@glamirk/shared/types` and `@glamirk/shared/data`, never the React
subpaths, so nothing browser-only reaches the server bundle.

## Quick start

```bash
npm install                 # one root install links every workspace
cp .env.example .env        # fill in DATABASE_URL and CLOUDINARY_URL at minimum
npm run dev                 # API + storefront + admin on http://localhost:3000
```

| Command | Effect |
|---|---|
| `npm run dev` | Backend with both Vite dev servers mounted (one process, HMR for both apps) |
| `npm run build` | Builds storefront → admin → backend, in dependency order |
| `npm start` | Runs the built backend, serving both bundles |
| `npm run lint` | `tsc --noEmit` across all four workspaces |
| `npm run migrate` | Apply pending database migrations |
| `npm run seed` | Populate default content (skips if the store already has any) |

Storefront at `http://localhost:3000`, admin at `http://localhost:3000/admin` — one origin, so
there is no CORS to configure and the admin bundle is never downloaded by a shopper.

## Tech stack

**Frontend / Admin** — React 19, Vite 6, Tailwind CSS v4, Motion, Lucide, MediaPipe Tasks Vision
(face landmarks for virtual try-on).

**Backend** — Node + Express 4, PostgreSQL via [Neon](https://neon.tech) (`pg`), Socket.IO for
realtime, JWT auth (`jsonwebtoken`), `bcryptjs`, `multer` + Cloudinary for uploads, `nodemailer`
for transactional email (optional — falls back to in-app flows when unconfigured).

TypeScript end-to-end, and the whole repo typechecks clean.

### Backend layering

```
backend/src/
├── config/       env loading (repo-root .env) and filesystem paths
├── db/           Postgres pool, cms_state load/save, schema
├── auth/         JWT signing, sessions, token-version revocation
├── middleware/   requireCustomer, requireAdmin, rate limiting
├── services/     business logic: orders, rewards, reviews, shipping, email, notifications, realtime
├── routes/       admin, customer and account routers
├── ai/           recommendation + analysis logic
└── server.ts
```

## Data model

Two persistence patterns, deliberately:

- **`cms_state`** — one JSONB row holding the whole content graph (products, categories, pages,
  offers, journal, FAQs, hero, footer, media, settings, audit log). The admin edits whole documents
  and publishes atomically.
- **Normalised tables** — customers, orders, cart, wishlist, addresses, reviews, returns,
  notifications, rewards, sessions. These need constraints, indexes and concurrent-safe updates.

Schema lives in [`database/migrations/`](database/migrations) as numbered,
forward-only SQL files with a `schema_migrations` ledger. They are applied
automatically at boot, so there is still nothing to run by hand — but the schema
now has a history, can be rebuilt from zero deterministically, and shows up in
code review. See [`database/README.md`](database/README.md).

## Authentication

One JWT secret, two identities discriminated by a `role` claim (`admin` vs `customer`). Customer
tokens additionally carry a `token_version`, checked on every request — which is what makes logout,
"log out of all devices", password change and password reset genuinely invalidate a token rather
than just dropping it client-side.

## Customer account

`/account` with sections for orders (with tracking, invoices, cancel/return), wishlist, addresses,
profile, Glam profile, Shade AI history, rewards and coupons, reviews, recently viewed, help centre,
notification preferences and settings. Every endpoint scopes its queries to the authenticated
session — no route accepts a user id from the client.

## Admin panel

Log in at `/admin` (not linked from the public UI). Every screen is real database-backed CRUD:
hero, about, benefits, shade journey, shop-the-look, page builder, product catalogue, categories,
offers, promo banners, navigation, footer, journal, FAQs, media library, try-on models, orders,
notifications, global settings and an audit trail.

## Deployment

The VPS pulls `main`, runs `npm ci && npm run build`, and reloads pm2 from the versioned
`ecosystem.config.cjs`. See the header comment in that file — **it points at
`backend/dist/server.cjs`, and the old copy on the server must be replaced once** after the
monorepo split, or pm2 will keep launching a path that no longer exists.

`render.yaml` is kept in sync for Render deploys.

## Environment

Everything is documented inline in [`.env.example`](.env.example). `DATABASE_URL` and
`CLOUDINARY_URL` are required; `JWT_SECRET` is strongly recommended; SMTP and
`VITE_GOOGLE_CLIENT_ID` are optional and degrade gracefully when absent.
