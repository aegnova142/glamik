import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
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
