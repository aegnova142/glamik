import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Refuses to BUILD a bundle that cannot sign anyone in.
 *
 * The VITE_ values are inlined at build time, and the VPS runs `npm run build`
 * itself (see .github/workflows/deploy.yml) against whatever .env exists
 * there. If the Firebase values are missing from that file the build still
 * succeeds — it just produces a bundle where isFirebaseConfigured() is false,
 * so the sign-in screen falls back to the server OTP path, which answers 409,
 * and mobile login is dead with nothing anywhere saying why.
 *
 * Failing the build is the right severity: a deploy that cannot sign customers
 * in should not reach production quietly.
 *
 * Two ways the configuration can be wrong, and both throw:
 *   - SMS_PROVIDER=firebase but the client keys are missing
 *   - the client keys are present but SMS_PROVIDER does not select firebase
 *
 * A deployment that carries no VITE_FIREBASE_* keys at all wants no mobile
 * sign-in and builds exactly as before.
 */
export function assertFirebaseClientConfig(mode: string, envDir: string): void {
  // Vite does not expose non-VITE_ keys without the third argument, and
  // SMS_PROVIDER is the one that says whether any of this is required.
  const env = loadEnv(mode, envDir, '');
  const provider = (env.SMS_PROVIDER || '').trim().toLowerCase();

  if (provider !== 'firebase') {
    // The check below is gated on the very variable most likely to be wrong,
    // which left the worst case uncovered: Firebase credentials provisioned,
    // SMS_PROVIDER unset or stale, assertion skipped, bundle ships with
    // isFirebaseConfigured() false, and every sign-in dead-ends silently.
    //
    // Provisioned client credentials ARE the statement of intent. If they are
    // present, the provider switch disagreeing with them is a misconfiguration,
    // not a second opinion — and since SMS_PROVIDERS is empty, no other value
    // selects a working OTP path. Fail closed.
    //
    // A deployment that genuinely does not use mobile sign-in carries none of
    // these keys, falls through, and builds exactly as before.
    const configured = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN'].filter(
      (key) => (env[key] || '').trim()
    );
    if (configured.length) {
      throw new Error(
        `${configured.join(', ')} ${configured.length === 1 ? 'is' : 'are'} set, but SMS_PROVIDER is ` +
          `${provider ? `"${provider}"` : 'not set'} — so the build would ship a bundle with Firebase ` +
          'sign-in switched off and nothing saying why.\n' +
          'Firebase is the only OTP provider this app has; no other SMS_PROVIDER value selects a working one.\n' +
          'Set SMS_PROVIDER=firebase in the .env on the machine that runs `npm run build` — on the VPS that ' +
          'is the server itself, whose .env is separate from your local one. To build without mobile sign-in, ' +
          'remove the VITE_FIREBASE_* keys instead.'
      );
    }
    return;
  }

  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN'];
  const missing = required.filter((key) => !(env[key] || '').trim());

  // Names the keys, never the values — this output lands in CI logs.
  if (missing.length) {
    throw new Error(
      `SMS_PROVIDER is "firebase" but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing from ` +
        `the .env at ${envDir}.\n` +
        'These are inlined at BUILD time, so building without them produces a bundle that cannot sign anyone in.\n' +
        'Add them to the .env on the machine that runs `npm run build` — on the VPS that is the server itself, ' +
        'whose .env is separate from your local one.'
    );
  }

  // Caught here rather than at runtime, where it surfaces as every customer
  // getting a 401 from verifyIdToken's audience check and nothing in the log.
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_PROJECT_ID !== env.VITE_FIREBASE_PROJECT_ID) {
    throw new Error(
      'FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID name different projects ' +
        `in the .env at ${envDir}.\n` +
        'The browser would mint tokens for one and the backend would verify against the other, ' +
        'so every sign-in would fail its audience check.'
    );
  }
}

export default defineConfig(({ mode, command }) => {
  const envDir = path.resolve(__dirname, '..');

  // Build only. `npm run dev` must stay startable on a half-configured
  // machine — the backend already reports what is missing at boot, and
  // blocking dev would make the problem harder to work on, not easier.
  if (command === 'build') assertFirebaseClientConfig(mode, envDir);

  return {
    // One .env at the repo root serves every workspace (see .env.example), and
    // Vite otherwise looks only in its own root — so a VITE_ var set there was
    // picked up by `npm run dev`, where the backend has already loaded it into
    // process.env, but silently missing from `npm run build`, which runs
    // standalone. That produced a bundle with Firebase quietly disabled.
    //
    // Pointing envDir at the repo root makes both paths read the same file.
    // Only keys matching Vite's envPrefix (VITE_) are exposed to client code;
    // everything else in that file — DATABASE_URL, JWT_SECRET, the Razorpay
    // and SMTP secrets — is loaded by Vite but never reaches the bundle.
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      // @glamirk/shared is a workspace package shipping TypeScript source, and
      // it imports React. Without deduping, Vite can resolve React once for the
      // app and again for the linked package, which breaks hooks at runtime
      // ("invalid hook call") in a way that is painful to trace.
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      // Never pre-bundle the workspace package — pre-bundling would freeze a
      // copy of it in .vite/deps and shared edits would stop hot-reloading.
      exclude: ['@glamirk/shared'],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
