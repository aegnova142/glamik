import dotenv from 'dotenv';
import { PATHS } from './paths';
// Safe to import here: messaging.service reads process.env directly and
// imports nothing from this module, so there is no cycle.
import { describeOtpChannels } from '../services/messaging.service';
// Pure URL classification — no database connection, no import cycle.
import { classifyDatabaseTarget } from './databaseTarget';

/**
 * Environment loading.
 *
 * MUST be the first import in server.ts. `import 'dotenv/config'` (what this
 * replaces) resolves `.env` relative to the *working directory*, which after
 * the monorepo split is `backend/` — where there is no `.env`. A single
 * `.env` at the repo root serves every workspace, so it is loaded explicitly
 * by absolute path instead.
 */
dotenv.config({ path: PATHS.envFile });

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. ${hint} (see .env.example at the repo root).`);
  }
  return value;
}

/**
 * Development-only signing key.
 *
 * Deliberately named so that it is unmistakable in a log, a token dump, or a
 * code search. It is NOT a secret and is never reachable in production —
 * resolveJwtSecret throws there instead of returning it.
 */
export const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-not-for-production';

/**
 * Resolves the token-signing secret, and refuses to invent one in production.
 *
 * This used to be `process.env.JWT_SECRET || '<a literal committed in this
 * repository and in .env.example>'`. The fallback meant that a deployment which
 * simply forgot the variable — a fresh server, a clobbered .env, a deploy that
 * dropped it — kept booting happily while signing every admin session, every
 * customer session and every OTP hash with a value anyone holding the repo
 * could read. Nothing failed, nothing warned, and the tokens were forgeable.
 *
 * So production fails closed. An unsigned-for deployment is an outage, which is
 * loud and gets fixed in minutes; a silently forgeable admin session is a
 * breach, which is quiet and gets found much later.
 *
 * Development keeps a fallback, because requiring configuration to run the app
 * locally is how people end up pasting the production secret into their .env.
 *
 * Pure and exported so the behaviour can be tested directly, rather than only
 * through a module whose value is captured at import time.
 */
export function resolveJwtSecret(configured: string | undefined, isProduction: boolean): string {
  const value = (configured || '').trim();

  if (!value) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET is not set. Refusing to start in production with a default signing key — ' +
          'it would sign admin sessions, customer sessions and OTP hashes with a value committed ' +
          'to this repository. Generate one with `openssl rand -hex 32` and set JWT_SECRET. ' +
          'Note that changing it signs out every logged-in user.'
      );
    }
    return DEV_JWT_SECRET;
  }

  // The old committed default, rejected explicitly wherever it turns up. An
  // operator copying .env.example verbatim must not land back on it.
  if (value === 'glamirk_luxury_atelier_jwt_secret_2026' || value === DEV_JWT_SECRET) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET is set to a known public placeholder. Refusing to start in production: ' +
          'this value appears in the repository, so every session signed with it is forgeable. ' +
          'Generate a real one with `openssl rand -hex 32`.'
      );
    }
    return DEV_JWT_SECRET;
  }

  return value;
}

export const DELHIVERY_DEFAULT_BASE_URL = 'https://track.delhivery.com';

/**
 * Validates DELHIVERY_BASE_URL before it is allowed to prefix a request that
 * carries the API token.
 *
 * Every Delhivery call is
 * authenticated, so whatever this resolves to receives the token. An
 * unvalidated env var there is a credential-exfiltration primitive and an SSRF
 * sink. HTTPS and a delhivery.com host only, with loopback permitted for a
 * local test double. A bad value falls back rather than throwing, because a
 * typo should not take the server down at boot.
 */
export function resolveDelhiveryBaseUrl(raw: string | undefined | null): string {
  if (!raw) return DELHIVERY_DEFAULT_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.warn('[config] DELHIVERY_BASE_URL is not a valid URL — using the default Delhivery host.');
    return DELHIVERY_DEFAULT_BASE_URL;
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isDelhivery = host === 'delhivery.com' || host.endsWith('.delhivery.com');

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    console.warn('[config] DELHIVERY_BASE_URL must use HTTPS — using the default Delhivery host.');
    return DELHIVERY_DEFAULT_BASE_URL;
  }
  if (!isDelhivery && !isLoopback) {
    console.warn('[config] DELHIVERY_BASE_URL is not a Delhivery host — using the default Delhivery host.');
    return DELHIVERY_DEFAULT_BASE_URL;
  }
  if (parsed.username || parsed.password) {
    console.warn('[config] DELHIVERY_BASE_URL must not embed credentials — using the default Delhivery host.');
    return DELHIVERY_DEFAULT_BASE_URL;
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,

  get databaseUrl(): string {
    return required('DATABASE_URL', 'Add your Neon Postgres connection string to .env');
  },

  /**
   * Signs admin tokens, customer tokens, and — via OTP_HASH_SECRET's fallback
   * in otp.service — the stored OTP hashes.
   *
   * In production this throws rather than falling back. See resolveJwtSecret.
   */
  get jwtSecret(): string {
    return resolveJwtSecret(process.env.JWT_SECRET, this.isProduction);
  },

  appUrl: process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null,
  cloudinaryUrl: process.env.CLOUDINARY_URL || null,

  /**
   * Hostname the admin back office is served from, e.g. `admin.glamirk.com`.
   *
   * Unset (the default) keeps the original layout: admin lives at `/admin` on
   * the same host as the storefront. Set it and admin moves to its own
   * hostname, with `/admin` on the main host becoming a redirect.
   *
   * Opt-in on purpose. A deploy that shipped the subdomain switch before DNS
   * and TLS were actually pointing at the box would take the back office
   * offline; leaving this unset means the deploy is a no-op until the
   * infrastructure is genuinely ready.
   *
   * The admin bundle's Vite `base` is derived from this same variable at build
   * time (see admin/vite.config.ts) — asset URLs have to agree with where the
   * app is mounted, so the two cannot be configured separately.
   */
  adminHost: process.env.ADMIN_HOST?.trim().toLowerCase() || null,

  /**
   * Image & video upload limits.
   *
   * Read through getters rather than captured at import time so a test can set
   * the variable before exercising a route, matching how every other block
   * here that needs to be overridable behaves.
   *
   * The ceilings are deliberately separate. multer buffers the whole body in
   * memory, so the single number it is given has to be the larger of the two
   * (a video), and the image limit is then re-applied once the magic bytes
   * have said which one this actually is. Giving images the video ceiling
   * would mean a 60 MB "product photo" was fully buffered before anything
   * noticed.
   */
  media: {
    /** Per-image ceiling, enforced after the real type is known. */
    get maxImageBytes(): number {
      const mb = Number(process.env.MEDIA_MAX_IMAGE_MB);
      return (Number.isFinite(mb) && mb > 0 ? mb : 20) * 1024 * 1024;
    },
    /** Per-video ceiling. Also what multer is configured with. */
    get maxVideoBytes(): number {
      const mb = Number(process.env.MEDIA_MAX_VIDEO_MB);
      return (Number.isFinite(mb) && mb > 0 ? mb : 60) * 1024 * 1024;
    },
    /**
     * Whether SVG uploads are accepted at all.
     *
     * On by default because the site logo and favicon in production are
     * already SVGs uploaded through this pipeline — turning it off would be a
     * silent regression for an admin trying to replace the logo. SVG is the
     * one accepted format that is also a script host, so it is never stored as
     * received: it is sanitised first (see sanitizeSvg), and it is excluded
     * from the f_auto/q_auto delivery transform because rasterising a logo is
     * not what anyone asked for. Set MEDIA_ALLOW_SVG=false to refuse it.
     */
    get allowSvg(): boolean {
      return process.env.MEDIA_ALLOW_SVG !== 'false';
    },
  },

  /**
   * Razorpay — online payments.
   *
   * `liveMode` is the master switch and defaults to OFF. With it off the
   * gateway adapter resolves to a deterministic in-process mock: the whole
   * checkout → pay → verify → webhook path is exercisable end to end without
   * a single packet reaching Razorpay, and no real customer can be charged by
   * a misconfigured deploy. Turning it on additionally requires real
   * credentials to be present, so flipping the flag alone cannot accidentally
   * put a half-configured gateway in front of customers.
   *
   * The key secret and webhook secret are read here and never leave the
   * server: only `keyId` is ever sent to a browser, which is exactly what
   * Razorpay's checkout script expects to receive.
   */
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || null,
    keySecret: process.env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null,
    get liveMode(): boolean {
      return process.env.PAYMENTS_LIVE_MODE === 'true';
    },
    get credentialsPresent(): boolean {
      return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    },
    /** True only when real calls should be made. Everything else runs on the mock. */
    get enabled(): boolean {
      return this.liveMode && this.credentialsPresent;
    },
  },

  /**
   * Delhivery One — the active shipping provider.
   *
   * Same two-key arrangement as payments: DELHIVERY_LIVE_MODE defaults to off, and even when on, real
   * calls require a token. With it off nothing reaches Delhivery — no waybill
   * is drawn from the client's pool, no shipment is created, no pickup is
   * booked — and the mock adapter answers instead.
   *
   * Getters throughout, so the token comparison and the log scrubber read the
   * current value rather than whatever the environment looked like at import.
   */
  delhivery: {
    get apiToken(): string | null {
      return process.env.DELHIVERY_TOKEN || null;
    },
    get baseUrl(): string {
      return resolveDelhiveryBaseUrl(process.env.DELHIVERY_BASE_URL);
    },
    /**
     * Registered warehouse name, which must match Delhivery's record exactly —
     * case and spaces included. A mismatch is the commonest reason
     * create.json rejects a shipment, and the API's own error does not say so.
     * Deliberately has no default: inventing one would turn a configuration
     * gap into a run of failed shipments.
     */
    get pickupLocation(): string | null {
      return process.env.DELHIVERY_PICKUP_NAME?.trim() || null;
    },
    get sellerName(): string {
      return process.env.DELHIVERY_SELLER_NAME?.trim() || 'Glamirk Beauty';
    },
    get sellerAddress(): string | null {
      return process.env.DELHIVERY_SELLER_ADDRESS?.trim() || null;
    },
    /** Daily collection slot, HH:MM:SS as Delhivery expects it. Configurable
     * because it is a warehouse operating decision, not a code constant. */
    get pickupTime(): string {
      const raw = process.env.DELHIVERY_PICKUP_TIME?.trim();
      return raw && /^\d{2}:\d{2}:\d{2}$/.test(raw) ? raw : '14:00:00';
    },
    /** Scan Push shared secret. No fallback in any environment — an
     * unconfigured webhook rejects everything rather than accepting anything. */
    get webhookSecret(): string | null {
      return process.env.DELHIVERY_WEBHOOK_SECRET || null;
    },
    /** Fallbacks for products with no shipping dimensions recorded. */
    get defaultWeightKg(): number {
      return Number(process.env.DELHIVERY_DEFAULT_WEIGHT_KG) || 0.3;
    },
    get defaultLengthCm(): number {
      return Number(process.env.DELHIVERY_DEFAULT_LENGTH_CM) || 15;
    },
    get defaultBreadthCm(): number {
      return Number(process.env.DELHIVERY_DEFAULT_BREADTH_CM) || 10;
    },
    get defaultHeightCm(): number {
      return Number(process.env.DELHIVERY_DEFAULT_HEIGHT_CM) || 5;
    },
    get liveMode(): boolean {
      return process.env.DELHIVERY_LIVE_MODE === 'true';
    },
    get credentialsPresent(): boolean {
      return !!(process.env.DELHIVERY_TOKEN && process.env.DELHIVERY_PICKUP_NAME?.trim());
    },
    get enabled(): boolean {
      return this.liveMode && this.credentialsPresent;
    },
  },

  // Every field here is a getter rather than a value captured at module load.
  // The flags below always were, and the credentials being different was a
  // genuine inconsistency: the webhook verifier and the log scrubber both
  // read these at call time and would otherwise compare against whatever the
  // environment looked like at the instant this module was first imported.

  /**
   * SQL inventory.
   *
   * Off by default, exactly like the payment and shipping switches. With it
   * off the legacy cms_state JSONB document remains the single source of
   * truth and every stock check behaves as it does today; the SQL tables are
   * populated and verifiable but gate nothing.
   *
   * Turning it on makes SQL authoritative for reads and writes. The JSONB
   * document keeps being mirrored on every mutation, so turning it back off is
   * a complete rollback rather than a restore from backup.
   */
  inventory: {
    get sqlMode(): boolean {
      return process.env.INVENTORY_SQL_MODE === 'true';
    },
    /** Whether the legacy JSONB is still written alongside SQL. Keeping this
     * on is what makes the rollback path real; it should only be turned off
     * once SQL has been authoritative in production long enough to trust. */
    get mirrorLegacy(): boolean {
      return process.env.INVENTORY_MIRROR_LEGACY !== 'false';
    },
    /** How long an unpaid online order may hold its stock. */
    get reservationMinutes(): number {
      return Number(process.env.INVENTORY_RESERVATION_MINUTES) || 30;
    },
  },

  smtp: {
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    from: process.env.SMTP_FROM || 'Glamirk Beauty <no-reply@glamirk.com>',
    get configured(): boolean {
      return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    },
  },
} as const;

/** Logged once at boot so a misconfigured deployment is visible immediately. */
export function warnOnWeakConfig(): void {
  // ----------------------------------------------------------------------
  // Which database is this process actually pointed at?
  //
  // Reported first and unmissably, because a developer running what they
  // believe is a local server against the live database is how migrations 012
  // and 013 reached production. Automatic migration is already refused for
  // such a target, but every other write this process makes — orders, stock,
  // CMS edits — still lands on real customer data, and that deserves to be
  // stated out loud rather than discovered.
  //
  // Only the host is ever printed. The connection string contains a password.
  // ----------------------------------------------------------------------
  const target = classifyDatabaseTarget(process.env.DATABASE_URL || '');
  if (target.kind === 'local') {
    console.log(`[config] database: ${target.host} (local — automatic migrations enabled)`);
  } else if (!env.isProduction) {
    console.warn(
      '\n' +
        '  ====================================================================\n' +
        '   WARNING: this is a NON-PRODUCTION process using a PRODUCTION-CLASS\n' +
        '   database.\n' +
        `   target: ${target.host}\n` +
        `   reason: ${target.reason}\n` +
        '\n' +
        '   Automatic migrations are refused for this target, but every other\n' +
        '   write still affects real data. Point DATABASE_URL at a local\n' +
        '   database unless you intend this.\n' +
        '  ====================================================================\n'
    );
  } else {
    console.log(`[config] database: ${target.host} (automatic migrations disabled — ${target.reason})`);
  }

  // In production an unset JWT_SECRET no longer reaches here — resolveJwtSecret
  // throws before the app can serve anything. This warning is for development,
  // where the fallback is deliberately still allowed, so nobody mistakes a dev
  // token for a real one.
  if (!env.isProduction && !process.env.JWT_SECRET) {
    console.warn(
      '[config] JWT_SECRET is not set — signing with the development-only key. ' +
        'Fine locally; production refuses to start without a real one.'
    );
  }
  if (!env.cloudinaryUrl) {
    console.warn('[config] CLOUDINARY_URL is not set — admin media uploads will fail until it is configured.');
  }
  if (!env.smtp.configured) {
    console.warn('[config] SMTP is not configured — transactional email is disabled; flows fall back to in-app delivery.');
  }

  // Payments and shipping are deliberately inert until explicitly switched on.
  // Each line below states which mode is actually active, so "why did no real
  // shipment appear" is answerable from the boot log rather than by reading
  // code.
  if (env.razorpay.enabled) {
    console.warn('[config] Razorpay is in LIVE mode — real customer payments will be processed.');
  } else if (env.razorpay.liveMode && !env.razorpay.credentialsPresent) {
    console.warn(
      '[config] PAYMENTS_LIVE_MODE is true but RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are missing — ' +
        'online payments stay on the mock adapter. Set both, or unset the flag.'
    );
  } else {
    console.log('[config] Payments are in MOCK mode — no real charges. Set PAYMENTS_LIVE_MODE=true with credentials to go live.');
  }
  if (env.razorpay.enabled && !env.razorpay.webhookSecret) {
    console.warn(
      '[config] RAZORPAY_WEBHOOK_SECRET is not set — payment webhooks will be rejected as unverifiable. ' +
        'Payments still work, but status reconciliation depends on the verify call alone.'
    );
  }

  if (env.delhivery.enabled) {
    console.warn('[config] Delhivery is in LIVE mode — real shipments and pickups will be created.');
  } else if (env.delhivery.liveMode && !env.delhivery.credentialsPresent) {
    console.warn(
      '[config] DELHIVERY_LIVE_MODE is true but DELHIVERY_TOKEN/DELHIVERY_PICKUP_NAME are missing — ' +
        'shipping stays on the mock adapter.'
    );
  } else {
    console.log('[config] Shipping is in MOCK mode — no real shipment. Set DELHIVERY_LIVE_MODE=true with credentials to go live.');
  }

  // Mobile + OTP is the primary customer sign-in, so an unconfigured channel
  // is a customer-facing outage rather than a degraded extra.
  const channels = describeOtpChannels();
  if (!channels.sms && !channels.whatsapp) {
    console.warn(
      '[config] No OTP delivery channel is configured — customers cannot sign in with a mobile number. ' +
        'Set SMS_PROVIDER (+ its credentials) and/or WHATSAPP_PROVIDER; see .env.example.'
    );
  } else {
    if (!channels.sms) {
      console.warn('[config] SMS OTP is not configured — the sign-in screen will offer WhatsApp only.');
    }
    if (!channels.whatsapp) {
      console.warn('[config] WhatsApp OTP is not configured — the sign-in screen will offer SMS only.');
    }
  }
}
