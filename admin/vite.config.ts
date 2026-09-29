import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    // Where the admin is mounted decides how its asset URLs must be written,
    // so this is derived from the same ADMIN_HOST variable the server routes
    // on rather than configured separately — set one, both agree.
    //
    //   ADMIN_HOST set   -> served at the root of its own hostname -> '/'
    //   ADMIN_HOST unset -> served under /admin on the main host   -> '/admin/'
    //
    // Getting this wrong doesn't fail the build; it produces a bundle whose
    // asset URLs 404 at runtime.
    base: process.env.ADMIN_HOST?.trim() ? '/' : '/admin/',
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
