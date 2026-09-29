import dotenv from 'dotenv';
import { PATHS } from './paths';

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

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,

  get databaseUrl(): string {
    return required('DATABASE_URL', 'Add your Neon Postgres connection string to .env');
  },

  // Signs both admin and customer tokens. The fallback keeps local development
  // working without configuration, but a real deployment must set this — the
  // warning below fires once at boot if it hasn't.
  jwtSecret: process.env.JWT_SECRET || 'glamirk_luxury_atelier_jwt_secret_2026',

  appUrl: process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null,
  cloudinaryUrl: process.env.CLOUDINARY_URL || null,

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
  if (env.isProduction && !process.env.JWT_SECRET) {
    console.warn(
      '[config] JWT_SECRET is not set — running on the built-in development fallback. ' +
        'Set it in .env before serving real customers; every existing session is invalidated when you do.'
    );
  }
  if (!env.cloudinaryUrl) {
    console.warn('[config] CLOUDINARY_URL is not set — admin media uploads will fail until it is configured.');
  }
  if (!env.smtp.configured) {
    console.warn('[config] SMTP is not configured — transactional email is disabled; flows fall back to in-app delivery.');
  }
}
