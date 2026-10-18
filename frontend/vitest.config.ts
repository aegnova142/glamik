import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

// ==========================================
// Test runner for the storefront.
//
// Deliberately a SEPARATE file from vite.config.ts rather than a `test` key
// inside it: the app config is loaded by the backend's dev server too (see
// loadAppViteConfig in backend/src/server.ts), and adding a Vitest-only key
// there would put test configuration on the serving path for no reason.
//
// The alias and dedupe below mirror vite.config.ts. They are repeated rather
// than imported because that file is written for Vite's own loader; copying
// the two lines that matter is cheaper than making it importable, and a drift
// between them would surface immediately as an unresolved import in a test.
// ==========================================

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    // @glamirk/shared ships TypeScript source and imports React; without this
    // a test can resolve React twice and every hook throws "invalid hook call".
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The sign-in screen runs a 1s countdown ticker and a 700ms success delay,
    // so a few assertions legitimately wait. Still far below a hang.
    testTimeout: 10_000,
  },
});
