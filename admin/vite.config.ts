import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // ADMIN_HOST lives in the repo-root .env, which the backend reads through
  // dotenv at runtime. Vite does NOT load that file into process.env for its
  // own config, and the deploy runs `npm run build` over SSH in a shell that
  // has never exported it — so reading process.env alone meant the variable was
  // always absent at build time and `base` silently fell back to '/admin/'.
  //
  // That produced /admin/assets/*.js on a host serving the admin at its root:
  // express.static found nothing, the SPA catch-all answered with index.html,
  // and the browser got text/html where it expected JavaScript. The build
  // succeeded, so nothing anywhere reported a problem.
  //
  // loadEnv reads the same file the server does, from the repo root (Vite's
  // root here is admin/). An explicitly exported variable still wins, so
  // `ADMIN_HOST=... npm run build` keeps overriding the file.
  const fileEnv = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const adminHost = (process.env.ADMIN_HOST ?? fileEnv.ADMIN_HOST ?? '').trim();

  // Where the admin is mounted decides how its asset URLs must be written,
  // so this is derived from the same ADMIN_HOST variable the server routes
  // on rather than configured separately — set one, both agree.
  //
  //   ADMIN_HOST set   -> served at the root of its own hostname -> '/'
  //   ADMIN_HOST unset -> served under /admin on the main host   -> '/admin/'
  //
  // Getting this wrong doesn't fail the build; it produces a bundle whose
  // asset URLs 404 at runtime. Printed because a wrong value is otherwise
  // invisible until someone opens the admin in a browser.
  const base = adminHost ? '/' : '/admin/';
  console.log(`[admin] building with base '${base}'${adminHost ? ` (ADMIN_HOST=${adminHost})` : ' (ADMIN_HOST not set)'}`);

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      // Same reasoning as the storefront: one React instance only, or hooks
      // break inside the linked @glamirk/shared package.
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      exclude: ['@glamirk/shared'],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
