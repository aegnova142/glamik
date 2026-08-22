# Glamirk Beauty

A full-stack luxury beauty e-commerce platform — shade-matching quiz, virtual try-on, shoppable content, and a complete self-serve CMS admin panel that controls nearly every pixel of the storefront without touching code.

## Tech Stack

**Frontend**
- React 19 + TypeScript
- Vite 6 (dev server & bundler)
- Tailwind CSS v4
- Motion (`motion/react`) for animation
- Lucide React for icons

**Backend**
- Node.js + Express 4 (single server, serves the API and the built frontend)
- PostgreSQL via [Neon](https://neon.tech) (serverless Postgres) — `pg` driver
- Two persistence patterns:
  - A single `cms_state` JSONB blob for site content (pages, hero, products, categories, footer, offers, journal, FAQs, benefits, looks, shade-finder journey, etc.)
  - Normalized relational tables for transactional data (`customers`, `wishlist_items`, `cart_items`, `orders`, `order_items`)
- JWT (`jsonwebtoken`) for both admin and customer authentication (shared secret, discriminated by a `role` claim — `admin` vs `customer`)
- `bcryptjs` for password hashing
- `multer` + `cloudinary` for admin media uploads
- `nodemailer` for transactional email (password-reset links) — optional, falls back to a dev-mode flow when unconfigured
- Google Identity Services (OAuth) for "Continue with Google" — optional, falls back to a "coming soon" state when unconfigured

**Language:** TypeScript end-to-end (frontend, backend, and shared types in `src/types.ts`).

## Project Structure

```
glamirk-beauty/
├── server.ts                  # Express entrypoint — mounts API routers, serves the built SPA
├── server/
│   ├── db.ts                  # Postgres pool, schema migrations, cms_state load/save, default seed data
│   ├── routes.ts               # Public CMS content routes + all /api/admin/* CRUD routes
│   └── commerce.ts             # Customer auth (register/login/Google/forgot-reset password), cart, wishlist, orders
├── src/
│   ├── App.tsx                  # Root component — client-side routing (state-based), global providers
│   ├── types.ts                 # Shared TypeScript interfaces for the whole app (CMS schema, Product, Order, etc.)
│   ├── context/
│   │   ├── CMSContext.tsx        # Public site content + all admin save/delete methods, live-syncs via SSE
│   │   └── CustomerAuthContext.tsx  # Customer session state, login/register/Google/forgot-password
│   ├── components/
│   │   ├── admin/                # Every admin CMS panel (AdminLayout + one file per content area)
│   │   ├── home/                 # Homepage sections (Hero carousel, Best Sellers, Shop the Look, FAQ, etc.)
│   │   ├── product/               # Shop listing, filters, product detail, Quick View, cards
│   │   ├── discovery/              # Find My Shade quiz, Virtual Try-On, Beauty Journey section
│   │   ├── cart-checkout/          # Cart drawer, bag page, checkout flow
│   │   ├── account/                # Customer sign-in/register/forgot-password modal, My Glam Suite dashboard
│   │   ├── content/                # About, Journal/Blog, Article detail, Legal/Policy pages, Support Center
│   │   ├── layout/                 # Navbar, Footer, Concierge popup
│   │   ├── marketing/, search/, social/
│   ├── data/                      # Static fallback/seed data (used only if the DB has nothing yet)
│   └── utils/                     # cmsClient (fetch wrappers + token storage), formValidation, googleAuth, seo
├── .env.example                  # Documented list of every environment variable the app reads
└── package.json
```

## Admin Panel — what's editable without touching code

Everything below is a real database-backed CRUD screen, not mocked data. Log in at `/admin` (see **Admin Access** below) to reach:

| Admin Tab | Controls |
|---|---|
| Overview Dashboard | Store snapshot / quick links |
| Hero Section | Multi-slide homepage hero carousel (badge, heading, description, CTAs, image per slide — autoplay/pause/drag/swipe are all driven by this data), trust indicators, trust bar |
| About Page | Founder story, brand snapshot, mission/vision, values, premium standards — all as expandable card content |
| Benefits & Optimization | The "Beauty you can trust" trust-pillar strip (icon, title, description per card) + its section heading |
| Find My Shade Journey | The "beauty journey" step-by-step section shown on the Find My Shade page (title + N steps, each with icon/title/description) |
| Shop The Look | Curated shoppable lifestyle looks |
| Pages & Sections Builder | Freeform custom page/section composer |
| Product Catalogue | Full product CRUD — pricing (with live discount-% ↔ price calculation), all image slots (primary/secondary/detail/texture/lifestyle/swatch) with cropped upload, shades, stock, Quick View/Try-On visibility toggles |
| Categories & Taxonomy | Shop-by-category tiles, subcategories |
| Offers & Campaigns | Promotional campaigns/offers with scheduling |
| Header Navigation | Site nav menu items/links |
| Footer Settings | Footer columns (with icons), brand block, social links, legal policy pages (Privacy/Terms/Shipping/Returns/Cookies), trust badges, payment method icons |
| Journal & Guides | Blog/editorial articles |
| Client FAQs | Support FAQ entries (also power the homepage FAQ section) |
| Media Library | Uploaded image asset browser |
| Global Store Settings | Site-wide configuration |
| Security & Audit Trail | Admin action audit log |

**Consistent patterns across every admin form:**
- Image uploads go through a shared crop tool (`ImageCropUploadModal`) that enforces the exact aspect ratio each section needs, shows the live output size, and exports WebP for fast page loads.
- "Order" / display-order fields auto-continue from the highest existing value (no collisions after deletions).
- Discount % and final price are two-way bound in the product form.

## Database

Postgres (Neon). Schema is created automatically on first boot (`server/db.ts` → `ensureSchema()`), including `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations for older databases, so you never run manual migrations.

Tables:
- `cms_state` — one JSONB row holding the entire content graph (pages, products, categories, navigation, footer, offers, journal, FAQs, hero, about, benefits, looks, shade journey, media, settings, audit log, admin users)
- `customers` — customer accounts (`password_hash`, plus `reset_token` / `reset_token_expiry` for password resets)
- `wishlist_items`, `cart_items` — per-customer, persisted server-side (not just localStorage)
- `orders`, `order_items` — order history

## Getting Started

**Prerequisites:** Node.js 18+, a Neon (or any) Postgres database, a Cloudinary account.

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in at least the required values (see table below).
3. Run the app (single command runs both the API and the Vite dev server):
   ```
   npm run dev
   ```
4. Open `http://localhost:3000`. Admin login lives at `http://localhost:3000/admin` — this URL is intentionally not linked anywhere in the public UI.

### Environment Variables

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | **Required** | Neon/Postgres connection string |
| `CLOUDINARY_URL` | **Required** | Admin media uploads |
| `JWT_SECRET` | Recommended | Signs admin + customer auth tokens |
| `GEMINI_API_KEY` | Optional | AI features (beauty assistant) |
| `APP_URL` | Optional | Used to build absolute links (e.g. password-reset emails) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional | Sends real "Forgot Password" emails. Without these, the reset flow still works end-to-end — the API just returns the reset token directly instead of emailing it |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Enables the real "Continue with Google" sign-in. Without it, the button shows a "coming soon" message |

Full setup notes for each are documented inline in `.env.example`.

## Build & Deploy

```
npm run build   # vite build (client) + esbuild bundle of server.ts -> dist/server.cjs
npm start        # runs the production bundle
```
