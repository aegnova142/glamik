import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    // The admin is served from /admin, not the domain root, so every asset URL
    // Vite emits has to be prefixed or the bundle 404s once deployed.
    base: '/admin/',
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
