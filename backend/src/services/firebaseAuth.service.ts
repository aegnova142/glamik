// ==========================================
// FIREBASE PHONE AUTH — SERVER-SIDE TOKEN VERIFICATION
//
// The OTP provider for this deployment: there is no DLT registration, so
// Google sends the SMS and checks the code. This module's only job is to decide
// whether the ID token the browser hands back is genuine proof that a
// specific phone number was verified moments ago.
//
// What makes this safe to trust at all — and what a client-side OTP widget could
// not offer — is that the token is a SIGNED JWT with a documented schema.
// verifyIdToken checks Google's published signing certificates and validates
// `aud`/`iss` against our project id, so a forged or re-pointed token fails
// cryptographically rather than on a field we guessed at.
//
// No service account is needed: verification only requires the project id and
// Google's public certs. `checkRevoked` is deliberately NOT used — that call
// hits a private admin endpoint and would require credentials we do not ship.
//
// Nothing here generates or sends an OTP. In firebase mode the backend issues
// no codes at all; see issueOtp's bypass in otp.service.ts.
// ==========================================

import type { DecodedIdToken } from 'firebase-admin/auth';

/**
 * How recently the phone must have been verified.
 *
 * `auth_time` is when Google actually confirmed the code, so this is a
 * freshness bound on the verification itself, not on the token's own lifetime
 * (ID tokens live an hour and refresh silently). Five minutes is generous for
 * a human typing six digits and short enough that a token captured from an
 * old session is useless.
 *
 * This is the closest equivalent we have to the 60-second `expires_at` the
 * backend-managed path enforced: we cannot shorten Google's SMS window, but we can
 * refuse to mint a session off a stale verification.
 */
const MAX_AUTH_AGE_SECONDS = 5 * 60;

/** Clock skew tolerance, so a server a few seconds behind Google does not
 * reject a token that was issued legitimately. */
const CLOCK_SKEW_SECONDS = 60;

export type FirebaseVerifyResult =
  | { status: 'verified'; phoneRaw: string; uid: string }
  /** Signature, audience, issuer or expiry failed — or the token is garbage. */
  | { status: 'invalid'; detail: string }
  /** Genuine token, but not from a phone sign-in. */
  | { status: 'wrong_provider'; detail: string }
  /** Genuine phone token with no number on it — cannot identify anyone. */
  | { status: 'no_phone' }
  /** Verified too long ago to accept as proof of a live sign-in. */
  | { status: 'stale'; ageSeconds: number }
  /** FIREBASE_PROJECT_ID is not set, so nothing can be validated. */
  | { status: 'unconfigured' };

export function firebaseProjectId(): string | null {
  return process.env.FIREBASE_PROJECT_ID || null;
}

export function firebaseConfigured(): boolean {
  return !!firebaseProjectId();
}

/**
 * The project id the BROWSER was built against.
 *
 * Read from the backend's own process.env, which is legitimate here because
 * one .env at the repo root serves every workspace — Vite reads the same file
 * through envDir. It is a proxy for what got baked into the bundle, not proof:
 * a bundle built from a different .env would not be detected. Good enough to
 * catch the realistic mistake, which is the values simply being absent.
 */
export function firebaseClientProjectId(): string | null {
  return process.env.VITE_FIREBASE_PROJECT_ID || null;
}

/**
 * Whether the browser half is configured at all.
 *
 * Mirrors isFirebaseConfigured() in frontend/src/utils/firebaseAuth.ts — the
 * same two values, because those are the two nothing works without.
 */
export function firebaseClientConfigured(): boolean {
  return !!(process.env.VITE_FIREBASE_API_KEY && firebaseClientProjectId());
}

/**
 * Everything that must hold before mobile sign-in can actually complete.
 *
 * Checked as one thing because the halves fail together in ways neither can
 * see alone: the server verifies tokens for FIREBASE_PROJECT_ID while the
 * browser mints them for VITE_FIREBASE_PROJECT_ID, so if those disagree every
 * verifyIdToken call fails its audience check and every customer gets a 401
 * with nothing in the logs to say why.
 *
 * Returns the problems rather than a bare false so the boot banner and the
 * tests can both name what is wrong instead of saying "not configured".
 */
export function describeFirebaseReadiness(): { ready: boolean; problems: string[] } {
  const problems: string[] = [];

  if (!firebaseConfigured()) {
    problems.push('FIREBASE_PROJECT_ID is not set — the backend cannot verify ID tokens.');
  }
  if (!process.env.VITE_FIREBASE_API_KEY) {
    problems.push('VITE_FIREBASE_API_KEY is not set — the browser cannot reach Firebase.');
  }
  if (!firebaseClientProjectId()) {
    problems.push('VITE_FIREBASE_PROJECT_ID is not set — the browser cannot reach Firebase.');
  }

  const server = firebaseProjectId();
  const client = firebaseClientProjectId();
  if (server && client && server !== client) {
    // Names neither value: both are public, but printing configuration into
    // logs is a habit worth not having. The variable names are enough to fix it.
    problems.push(
      'FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID are different projects — ' +
        'every token the browser mints would fail the backend audience check.'
    );
  }

  return { ready: problems.length === 0, problems };
}

/** Whether a customer could actually complete a Firebase sign-in right now. */
export function firebaseSignInReady(): boolean {
  return describeFirebaseReadiness().ready;
}

/**
 * The in-flight or settled app initialisation. See ensureApp() for the
 * caching contract — in particular that a failure does not stay cached.
 *
 * firebase-admin is imported lazily inside initApp() rather than at module
 * load: it is a heavy dependency, and a deployment that never selects firebase
 * must not pay for it nor fail to boot because of it.
 */
let appPromise: Promise<unknown> | null = null;

/** Minimal shape this module needs from firebase-admin's Auth. */
interface IdTokenVerifier {
  verifyIdToken(token: string): Promise<DecodedIdToken>;
}

/**
 * Test seam, mirroring __resetCmsCacheForTests in db.ts.
 *
 * firebase-admin is reached through a dynamic import(), which under tsx is a
 * real ESM import and so cannot be intercepted by the CJS module loader. Rather
 * than contort the tests around that, the dependency is injectable: a test
 * supplies a stub verifier and no SDK, credential or network is involved.
 *
 * Deliberately not exported from any barrel and prefixed __: production code
 * must never call it, and leaving it unset is the normal path.
 */
let injectedAuth: IdTokenVerifier | null = null;

export function __setFirebaseAuthForTests(auth: IdTokenVerifier | null): void {
  injectedAuth = auth;
  appPromise = null;
}

/**
 * What ensureApp() actually runs. Separated from the caching around it so a
 * test can make initialisation fail on demand — the real one cannot be made to
 * fail, which would leave the retry path below unverifiable.
 */
let injectedAppInit: (() => Promise<unknown>) | null = null;

/** Test seam, same contract as __setFirebaseAuthForTests. Clears the cache so
 * the next ensureApp() starts from the injected initialiser. */
export function __setFirebaseAppInitForTests(init: (() => Promise<unknown>) | null): void {
  injectedAppInit = init;
  appPromise = null;
}

/** Test seam: drives the cached initialiser directly, without reaching
 * getAuth() — which would require a real app the injected one is standing in
 * for. Exists so the caching contract can be asserted on its own. */
export function __ensureFirebaseAppForTests(): Promise<unknown> {
  return ensureApp();
}

async function initApp(): Promise<unknown> {
  if (injectedAppInit) return injectedAppInit();

  const projectId = firebaseProjectId();
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set');

  const { getApps, initializeApp } = await import('firebase-admin/app');
  const existing = getApps();
  // Only project id. No credential: verifyIdToken needs neither, and passing
  // one would make this require a secret it does not use.
  return existing.length ? existing[0] : initializeApp({ projectId });
}

/**
 * The initialised app, created once and reused — but NOT cached on failure.
 *
 * A cached rejected promise would be permanent: every later sign-in would
 * re-await the same failure and the only cure would be a restart. So a failure
 * un-caches itself and the next caller starts a fresh attempt, while callers
 * arriving while an attempt is in flight still share it rather than each
 * initialising their own app.
 */
function ensureApp(): Promise<unknown> {
  if (appPromise) return appPromise;

  const pending = initApp();

  // The identity check matters: by the time this runs a retry may already have
  // installed a newer promise, and clearing that one would undo it.
  //
  // Attached before the cache is read back so the rejection is always observed
  // — without it Node reports an unhandled rejection in the window before a
  // caller awaits.
  pending.catch(() => {
    if (appPromise === pending) appPromise = null;
  });

  appPromise = pending;
  return pending;
}

async function adminAuth(): Promise<IdTokenVerifier> {
  if (injectedAuth) return injectedAuth;

  const projectId = firebaseProjectId();
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set');

  await ensureApp();
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth() as unknown as IdTokenVerifier;
}

/** Truncated and stripped of newlines so a Google error page cannot flood the
 * log. Never reaches the customer — the route maps failures to its own wording. */
function briefly(text: string): string {
  const collapsed = String(text).replace(/\s+/g, ' ').trim();
  return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
}

/**
 * Verifies a Firebase ID token and extracts the proven phone number.
 *
 * Four independent checks, every one of which must pass:
 *
 *   1. the signature, audience, issuer and expiry (verifyIdToken)
 *   2. `firebase.sign_in_provider === 'phone'` — an email or Google token is
 *      a perfectly valid Firebase token and must not buy a phone session
 *   3. `auth_time` within MAX_AUTH_AGE_SECONDS — replay protection
 *   4. a `phone_number` claim actually exists
 *
 * Never throws: every outcome is a tagged result so the route decides what the
 * customer sees.
 */
export async function verifyFirebasePhoneToken(idToken: unknown): Promise<FirebaseVerifyResult> {
  if (!firebaseConfigured()) return { status: 'unconfigured' };

  const token = typeof idToken === 'string' ? idToken.trim() : '';
  if (!token) return { status: 'invalid', detail: 'missing token' };

  let decoded: DecodedIdToken;
  try {
    const auth = await adminAuth();
    // checkRevoked omitted on purpose — see the module header.
    decoded = await auth.verifyIdToken(token);
  } catch (err) {
    return { status: 'invalid', detail: briefly((err as Error).message) };
  }

  const provider = (decoded as any)?.firebase?.sign_in_provider;
  if (provider !== 'phone') {
    return { status: 'wrong_provider', detail: briefly(String(provider || 'unknown')) };
  }

  // auth_time is in seconds since epoch, like the rest of the JWT claims.
  const authTime = Number((decoded as any).auth_time);
  if (!Number.isFinite(authTime)) {
    return { status: 'invalid', detail: 'auth_time missing' };
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - authTime;
  // A negative age means Google's clock is ahead of ours; tolerate the same
  // skew either way rather than rejecting a token from the future.
  if (ageSeconds > MAX_AUTH_AGE_SECONDS || ageSeconds < -CLOCK_SKEW_SECONDS) {
    return { status: 'stale', ageSeconds };
  }

  const phoneRaw = (decoded as any).phone_number;
  if (!phoneRaw || typeof phoneRaw !== 'string') return { status: 'no_phone' };

  return { status: 'verified', phoneRaw, uid: String(decoded.uid || '') };
}

/** Exposed for tests so the freshness bound does not have to be duplicated. */
export const firebaseAuthPolicy = {
  maxAuthAgeSeconds: MAX_AUTH_AGE_SECONDS,
  clockSkewSeconds: CLOCK_SKEW_SECONDS,
};
