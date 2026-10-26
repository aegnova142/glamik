# Configuration and runbook

## The two-key pattern

Payments, shipping and inventory all follow the same arrangement: a **live-mode
flag that defaults to off**, plus credentials. Real calls require both. Flipping
the flag alone cannot put a half-configured integration in front of customers.

```ts
enabled = liveMode && credentialsPresent
```

Every field is a **getter**, read at call time rather than captured at import, so
the webhook verifier and the log scrubber compare against the current value.

## Shipping

| Variable | Effect |
|---|---|
| `DELHIVERY_LIVE_MODE` | master switch. Off → mock adapter; in production the safety gate then blocks all courier calls |
| `DELHIVERY_TOKEN` | API token. Required for `enabled` |
| `DELHIVERY_PICKUP_NAME` | registered warehouse name. Required for `enabled`. **Must match Delhivery exactly** — case and spaces included |
| `DELHIVERY_BASE_URL` | validated: HTTPS + `delhivery.com` only. A bad value falls back rather than throwing |
| `DELHIVERY_WEBHOOK_SECRET` | Scan Push shared secret. No fallback in any environment — unconfigured rejects everything |
| `DELHIVERY_SELLER_NAME` / `_ADDRESS` | printed on the label as the return address |
| `DELHIVERY_PICKUP_TIME` | daily collection slot, `HH:MM:SS` |
| `DELHIVERY_DEFAULT_WEIGHT_KG` / `_LENGTH_CM` / `_BREADTH_CM` / `_HEIGHT_CM` | fallbacks for products with no recorded dimensions |

> **The warehouse name cannot be verified from code.** Reading the account's
> pickup list is a Settings-scope call this integration deliberately does not
> make, and the only other place it is validated is shipment creation — checking
> it that way would mean creating a real parcel. Confirm it by hand in
> Delhivery One → Settings → Warehouses.

### Two token realms — a trap worth knowing

Delhivery has two authentication realms, and a token can be valid for one and not
the other:

| Endpoints | Realm |
|---|---|
| `/api/cmu/create.json`, `/c/api/pin-codes/`, `/waybill/api/fetch/` | legacy CMU |
| `/fm/request/new/` (pickup), `/api/p/packing_slip` (label) | DRF — returns `{"detail":"Invalid token"}` |

A token that creates shipments successfully can still 401 on pickup and label.
If that happens, the token is wrong for the DRF realm — it is **not** an account
permission problem and nothing needs to be requested from Delhivery. Verify with:

```bash
npm run delhivery:check --workspace @glamirk/backend
```

Read-only: looks up one pincode, creates nothing. Prints the token's length and a
hash prefix, never its value.

## Payments

| Variable | Effect |
|---|---|
| `PAYMENTS_LIVE_MODE` | master switch, defaults off |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` | required for `enabled`. Only `keyId` ever reaches a browser |
| `RAZORPAY_WEBHOOK_SECRET` | without it webhooks are rejected as unverifiable |
| `PAYMENTS_MOCK_CHECKOUT` | development-only: offers the mock gateway as a real checkout option. Ignored in production |

## Inventory

| Variable | Effect |
|---|---|
| `INVENTORY_SQL_MODE` | whether SQL inventory is authoritative. Off → legacy JSONB decides |
| `INVENTORY_MIRROR_LEGACY` | whether the legacy document is written alongside SQL. **Leave on** — it is what makes rollback a flag flip rather than a restore |
| `INVENTORY_RESERVATION_MINUTES` | how long an unpaid order holds stock |

## Email

| Variable | Effect |
|---|---|
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` | transport. Unconfigured → every send silently no-ops |
| `SMTP_FROM` | must match the authenticated sender or a verified alias |
| `EMAIL_DELIVERY_DISABLED` | forces the suppressed transport |
| `NODE_ENV=test` | same effect — mail is captured, never transmitted |

`mailer.ts` is the single place a transporter is constructed and the single gate
on opening an SMTP connection. There were two identical copies once; two copies
meant two places to forget the test gate, and a suite that forgets it does not
fail loudly — it authenticates against whatever mailbox `.env` carries and emails
real customers.

Under test it returns a **capturing stub, not null**, so callers still run their
templates and a broken email body is caught by the suite instead of in production.

## Database

Production is **Neon** (serverless Postgres 18), reached over the pooler
endpoint.

Auto-migration is decided by the **target URL, not `NODE_ENV`**. The case that
went wrong twice was `NODE_ENV=development` on a laptop whose `.env` pointed at
production. A remote host is assumed production and refuses to auto-migrate;
`ALLOW_REMOTE_AUTO_MIGRATE=true` is the explicit opt-in for a genuine remote
dev/staging database, and it cannot override an explicit `DATABASE_ENV=production`.

### The idle window — read this before adding a periodic job

A serverless Postgres suspends its compute after a fixed idle window — **five
minutes on Neon**. Cost is driven by whether that window is ever reached, not
by how expensive each query is. So:

> **Every recurring job that touches the database must run less often than the
> provider's idle window.** One loop that doesn't is enough to keep the compute
> awake for all of them.

This is enforced by a single `SWEEP_INTERVAL_MS` (10 minutes) in `server.ts`,
shared by the reconciliation sweep and the notification outbox worker. It is
deliberately one constant rather than a per-job setting: independent intervals
are exactly how a 60-second loop silently undid a 5-minute one.

Ten and not five — five *equals* the window, so a sweep lands just as it is
about to be reached and resets it. Clear the window, don't match it.

**What happens if you get this wrong**, from the 2026-10-23 outage: the outbox
worker was on 60 seconds, the compute never slept, the account exhausted its
allowance, and Neon began refusing every connection with `SQLSTATE 53000` —
including `SELECT 1`. The running process kept serving from its established
pool, so the site returned 200 while every database-backed feature failed. It
stayed invisible for three days, until a restart put the boot-time schema check
in front of a database that would no longer answer and the site went to 502.

Two lessons worth keeping: a healthy HTTP status is not a healthy application,
and quota exhaustion is a *latent* failure that detonates on the next restart.

The jobs currently in `server.ts`, all clear of the window:

| Job | Interval |
|---|---|
| Scheduled account deletions | 24 h |
| Inventory consistency check | 1 h |
| Reconciliation sweep | `SWEEP_INTERVAL_MS` (10 min) |
| Notification outbox worker | `SWEEP_INTERVAL_MS` (10 min) |

## Runbook

### Going live with shipping

```bash
cd /var/www/glamirk
cp .env .env.bak.$(date +%Y%m%d%H%M%S)
# set DELHIVERY_LIVE_MODE="true", DELHIVERY_TOKEN, DELHIVERY_PICKUP_NAME
pm2 restart glamirk-beauty
npm run delhivery:check --workspace @glamirk/backend
```

Expect `effective mode: LIVE — real shipments will be created`.

The startup banner also logs it, but **pm2's log capture has been seen to drop
that line** — trust `delhivery:check`, not the absence of a log entry.

### Rolling back shipping

Set `DELHIVERY_LIVE_MODE="false"` and restart. In production the safety gate then
blocks every courier call, so orders stop booking rather than booking against the
mock. Orders stay truthful and can be booked once live mode returns.

### When an order did not ship

1. Admin → the order → **Create Shipment**. Idempotent; resumes a partial booking.
2. If the parcel exists but no van is coming → **Request Pickup**.
3. If there is no label → **Generate Label**.

Check `shipments.last_error` first — it carries the provider's own wording,
already scrubbed of anything secret-shaped.

### Verifying production state read-only

The production database host resolves to both IPv4 and IPv6; if IPv6 is
unreachable from where you are, `dns.lookup` may pick it and fail. Resolve IPv4
explicitly and keep `servername` set to the original host — Neon routes by SNI,
so dropping it reaches the wrong project.

### When the database refuses every connection

Symptom: `SQLSTATE 53000`, *"Your account or project has exceeded the quota."*
It comes from Neon's proxy, so the network and the connection string are fine —
this is an account-level flag, not a routing problem.

Confirm it is account-wide rather than endpoint-specific before doing anything
else: run a bare `SELECT 1` against **both** the pooler host and the same host
with `-pooler` removed. If both refuse, no connection-string change will help.

What does *not* work: `pg_dump` (it needs a connection, so the data cannot be
exported out of the problem), restoring an old dump over production (you would
be overwriting live data with stale data), and waiting quietly — the compute
stays suspended.

What works: clear the quota, either by upgrading the plan or by waiting for the
allowance to reset at the start of the next calendar month. The data is
suspended, never deleted; access returns intact.

Two things to be careful about while it is down:

- **A running process can mask it completely.** The boot-time schema check runs
  once at startup, so a process that started before the quota hit keeps serving
  from its established pool and the site still returns 200. The outage only
  becomes visible on the next restart. Do not read a healthy homepage as a
  healthy database — check `logs/glamirk-error.log` for `53000`.
- **Do not cut over to a replacement database to "get the site up".** It
  produces a storefront with no catalogue while Razorpay is live, and every
  order taken on the replacement then has to be reconciled by hand against the
  originals. If the outage must be visible to customers, a maintenance page is
  the cheaper mistake.

Afterwards, find the loop that caused it — see **The idle window** above.

## Current production state

Verified on the VPS, 2026-10-26:

| | |
|---|---|
| Database | **Neon**, Postgres 18.6, paid plan, pooler endpoint |
| `DELHIVERY_LIVE_MODE` | `true` |
| `DELHIVERY_PICKUP_NAME` | `GLAMIRK BEAUTY PRIVATE LIMITED` |
| Delhivery API | verified — shipment, pickup and label all succeed |
| Scan Push | **not yet enabled by Delhivery** |
| Razorpay | **LIVE** (`rzp_live_` key) — real payments are processed |
| OTP sign-in | **live** — `SMS_PROVIDER=firebase`, Firebase Phone Auth |
| WhatsApp | **not configured** — `WHATSAPP_ACCESS_TOKEN` empty, so WhatsApp OTP and order messages are `SKIPPED`, not failed |
| SMTP | **not configured** — `SMTP_HOST` is still the `smtp.example.com` placeholder, so no order emails go out |
| Inventory | legacy authoritative, SQL mirrored (`INVENTORY_SQL_MODE` unset) |

Two of these are worth not misreading. **Razorpay is live**, so anything
purchasable on the storefront can take a real payment — there is no sandbox
between a test product and a customer's card. And **SMTP is not live**: the
notification outbox will mark email deliveries `SKIPPED` rather than failing,
which is honest but easy to mistake for "sent" when scanning
`notification_deliveries`.
