// ==========================================
// FIREBASE PHONE AUTH — CLIENT
//
// Google sends the SMS and checks the code; the only thing this module hands
// the backend is the resulting ID token, which the server verifies
// cryptographically (backend/src/services/firebaseAuth.service.ts).
//
// Config is read from Vite env vars. Every value here is public by design —
// it ships in the browser bundle, exactly as Firebase intends — but it is
// still read from the environment rather than written inline, so a
// different project can be pointed at without a code change.
//
// getAnalytics is deliberately NOT used: it would pull in a second SDK, set
// cookies, and none of it is needed to verify a phone number.
// ==========================================

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type Auth,
  type ConfirmationResult,
} from 'firebase/auth';

const env = (import.meta as any).env ?? {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** The two values nothing works without. Checked so the sign-in screen can
 * fall back instead of throwing an initialisation error at the customer. */
export function isFirebaseConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let app: FirebaseApp | null = null;

/** Initialised on first use, not at import: a deployment on another provider
 * should not pay for this, and getApps() keeps a hot reload from registering
 * the app twice. */
function firebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  if (!app) {
    const existing = getApps();
    app = existing.length ? existing[0] : initializeApp(firebaseConfig as any);
  }
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

/** The element the invisible reCAPTCHA attaches to. Must exist in the DOM
 * before createRecaptcha() runs. */
export const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

let verifier: RecaptchaVerifier | null = null;

/**
 * Builds the invisible reCAPTCHA verifier, replacing any previous one.
 *
 * A verifier is SINGLE USE. After a failed or completed sign-in attempt its
 * token is spent, and reusing it makes signInWithPhoneNumber fail with an
 * opaque error that looks like a network problem. So every call clears the old
 * instance first — this is the single most common way a Firebase phone flow
 * breaks on the second attempt.
 */
export function createRecaptcha(): RecaptchaVerifier {
  clearRecaptcha();
  verifier = new RecaptchaVerifier(firebaseAuth(), RECAPTCHA_CONTAINER_ID, { size: 'invisible' });
  return verifier;
}

export function clearRecaptcha(): void {
  if (verifier) {
    try {
      verifier.clear();
    } catch {
      // Already torn down, or the container left the DOM — either way there is
      // nothing to recover and throwing here would mask the real error.
    }
    verifier = null;
  }
}

/** Sends the code. `e164` must include the country code, e.g. "+919876543210". */
export async function sendFirebaseOtp(e164: string): Promise<ConfirmationResult> {
  const recaptcha = createRecaptcha();
  return signInWithPhoneNumber(firebaseAuth(), e164, recaptcha);
}

/**
 * Checks the code and returns a fresh ID token for the backend.
 *
 * `getIdToken(true)` forces a refresh so the token carries the auth_time of
 * the verification that just happened — the backend rejects anything older
 * than five minutes, and a cached token could otherwise fail that check.
 */
export async function confirmFirebaseOtp(confirmation: ConfirmationResult, code: string): Promise<string> {
  const credential = await confirmation.confirm(code);
  return credential.user.getIdToken(true);
}

/**
 * Turns a Firebase error code into something a customer can act on.
 *
 * Anything unrecognised falls through to a generic line rather than surfacing
 * Firebase's internal wording, which leaks SDK details and reads like a bug
 * report.
 */
export function describeFirebaseError(err: unknown): string {
  const code = String((err as any)?.code || '');
  switch (code) {
    case 'auth/invalid-verification-code':
      return 'Incorrect OTP. Please try again.';
    case 'auth/code-expired':
      return 'This OTP has expired. Please request a new one.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/invalid-phone-number':
      return 'Please enter a valid mobile number.';
    case 'auth/quota-exceeded':
      return "We couldn't send the OTP right now. Please try again later.";
    case 'auth/unauthorized-domain':
      // A configuration fault, not the customer's. Say something honest
      // without asking them to retry something that cannot succeed.
      return 'OTP sign-in is unavailable on this site. Please contact support.';
    case 'auth/captcha-check-failed':
      return 'Verification failed. Please try again.';
    default:
      return "We couldn't send the OTP right now. Please try again.";
  }
}
