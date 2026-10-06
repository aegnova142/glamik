/**
 * pm2 process definition for the Glamirk VPS.
 *
 * This file is now versioned in the repository rather than living only on the
 * server, so the running configuration is reviewable and travels with the code
 * that it launches.
 *
 * IMPORTANT — one-time step on the VPS after the monorepo split:
 * the previous config launched `dist/server.cjs` at the repo root. That path no
 * longer exists; the bundle is now at `backend/dist/server.cjs`. Replace the
 * old file and reload:
 *
 *   cd /var/www/glamirk
 *   pm2 delete glamirk-beauty || true
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Until that runs, pm2 will keep trying to start the old path and the deploy
 * will appear to succeed while the site stays down.
 */
module.exports = {
  apps: [
    {
      name: 'glamirk-beauty',
      // Relative to `cwd` below. The server resolves the repo root at runtime,
      // so it locates frontend/dist and admin/dist regardless of where pm2
      // launches it from.
      script: 'backend/dist/server.cjs',
      cwd: '/var/www/glamirk',
      instances: 1,
      // The app holds in-process state that must not be duplicated: the
      // stock-deduction mutex, the cms_state cache, rate-limit counters and
      // the Socket.IO event bus. Clustering would silently break all four.
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        ADMIN_HOST: 'admin.glamirk.com',
      },
      out_file: './logs/glamirk-out.log',
      error_file: './logs/glamirk-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
