// MUST stay first: loads the repo-root .env before any module reads
// process.env (db.ts throws at import time if DATABASE_URL is missing).
import { env, warnOnWeakConfig } from './config/env';
import { PATHS } from './config/paths';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { pathToFileURL } from 'url';
import { createServer as createViteServer, type HmrOptions, type UserConfig } from 'vite';
import apiRouter from './routes/admin.routes';
import commerceRouter from './routes/customer.routes';
import accountRouter, { processScheduledAccountDeletions } from './routes/account.routes';
import { ensureSchema } from './db/db';
import { setupSocketIO } from './services/realtime.service';

// Express 4 does not forward a rejected promise from an async route handler
// to error middleware — left unhandled, Node's default since v15 is to kill
// the whole process. A single transient DB blip (Neon connection resets are
// common) would otherwise take the entire server down for every user rather
// than just failing the one request.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (server kept alive):', err);
});

/**
 * Resolve an app's own vite.config.ts ourselves instead of letting Vite's
 * `createServer` discover and load it from disk.
 *
 * Vite's normal config-loading esbuild-bundles a TS config into a throwaway
 * file under `<root>/node_modules/.vite-temp/`, then deletes it once loaded.
 * That single create+unlink is enough to make `tsx watch` — which restarts on
 * *any* file it sees get imported, not just files under its own cwd — restart
 * this whole process. The restart re-runs this function, which recreates the
 * Vite server, which recreates the temp file, forever.
 *
 * Importing the config module directly sidesteps that: this file is already
 * running under tsx's own in-memory TS transform, so a dynamic `import()` of
 * another workspace's `vite.config.ts` is transpiled the same way, with
 * nothing written to disk. `configFile: false` below then tells Vite not to
 * go looking for (and re-bundling) the file itself.
 */
async function loadViteConfig(root: string): Promise<UserConfig> {
  const configPath = path.join(root, 'vite.config.ts');
  const configUrl = pathToFileURL(configPath).href;

  // vite.config.ts is written expecting Vite's own loader, which bundles a TS
  // config to a CJS-compatible module specifically so __dirname/__filename
  // work the way config authors expect. A plain `import()` gives a genuine ES
  // module neither, so we supply the same guarantee ourselves: __dirname/
  // __filename are read as bare identifiers, which JS resolves through the
  // global object when nothing else binds them — no different in principle
  // from any other implicit-global read.
  const globals = globalThis as Record<string, unknown>;
  const previousDirname = globals.__dirname;
  const previousFilename = globals.__filename;
  globals.__dirname = root;
  globals.__filename = configPath;
  try {
    const mod = await import(configUrl);
    const configOrFactory = mod.default;
    const resolved =
      typeof configOrFactory === 'function'
        ? await configOrFactory({ command: 'serve', mode: 'development' })
        : configOrFactory;
    return resolved as UserConfig;
  } finally {
    globals.__dirname = previousDirname;
    globals.__filename = previousFilename;
  }
}


async function startServer() {
  const app = express();
  // Socket.IO needs the raw http.Server (not just the Express app) so it can
  // intercept the WebSocket upgrade handshake alongside normal HTTP requests
  // on the same port.
  const httpServer = createServer(app);
  const PORT = env.port;

  // Guarantee every table exists before any request is served, so no
  // individual route handler needs to defensively call this itself (routes
  // that only touch a normalized table — not the cms_state blob — never go
  // through loadDatabase(), which is where this used to happen as a side effect).
  warnOnWeakConfig();
  await ensureSchema();

  setupSocketIO(httpServer);

  // Body parsing middlewares
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Health check route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', atelier: 'Glamirk Beauty Central Server', time: new Date().toISOString() });
  });

  // API routes. The account router shares the /api/customer prefix with the
  // commerce router — their paths don't overlap, and Express falls through to
  // the next router when the first has no match.
  app.use('/api', apiRouter);
  app.use('/api/customer', commerceRouter);
  app.use('/api/customer', accountRouter);

  // Accounts are closed after a grace window rather than the instant someone
  // taps "delete", so something has to sweep for ones whose window has
  // elapsed. Runs at boot and daily thereafter.
  processScheduledAccountDeletions().catch((err) =>
    console.error('Scheduled account deletion sweep failed at startup:', err)
  );
  setInterval(() => {
    processScheduledAccountDeletions().catch((err) => console.error('Scheduled account deletion sweep failed:', err));
  }, 24 * 60 * 60 * 1000).unref?.();

  // Safety net: without this, an async route handler that throws (e.g. a
  // transient DB connection error) leaves its promise rejection unhandled by
  // Express and the request just hangs — the client never gets a response to
  // react to, so a flaky DB blip can strand a page in "loading" forever.
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  // ------------------------------------------------------------------
  // Serve the two frontends.
  //
  // Storefront at /, admin at /admin, both from this one process and one
  // origin — so there is no CORS to configure and the admin bundle is never
  // downloaded by a shopper.
  //
  // ORDER MATTERS: everything /admin must be registered before the
  // storefront's catch-all, or an admin deep link falls through and renders
  // the storefront instead.
  // ------------------------------------------------------------------
  const isProduction = env.isProduction;

  if (!isProduction) {
    // Two Vite dev servers in middleware mode on the same Express instance.
    // Each needs its own root and base so HMR and asset URLs resolve to the
    // right app.
    // Each middleware-mode Vite instance runs its own HMR websocket server.
    // Both configs are silent about the port, so both default to Vite's
    // standard 24678 — the second one to bind loses, and that app's browser
    // tab falls back to full-page reloads instead of hot updates. Explicit,
    // distinct ports avoid the collision. `hmr === false` (the DISABLE_HMR
    // escape hatch both configs support) is left alone rather than forced on.
    const withHmrPort = (hmr: boolean | HmrOptions | undefined, port: number): boolean | HmrOptions =>
      hmr === false ? hmr : { ...(typeof hmr === 'object' ? hmr : {}), port };

    const adminConfig = await loadViteConfig(PATHS.adminRoot);
    const adminVite = await createViteServer({
      ...adminConfig,
      configFile: false,
      root: PATHS.adminRoot,
      base: '/admin/',
      server: {
        ...adminConfig.server,
        middlewareMode: true,
        hmr: withHmrPort(adminConfig.server?.hmr, 24678),
      },
      appType: 'spa',
    });
    app.use('/admin', adminVite.middlewares);

    const frontendConfig = await loadViteConfig(PATHS.frontendRoot);
    const frontendVite = await createViteServer({
      ...frontendConfig,
      configFile: false,
      root: PATHS.frontendRoot,
      server: {
        ...frontendConfig.server,
        middlewareMode: true,
        hmr: withHmrPort(frontendConfig.server?.hmr, 24679),
      },
      appType: 'spa',
    });
    app.use(frontendVite.middlewares);
  } else {
    const frontendDist = PATHS.frontendDist;
    const adminDist = PATHS.adminDist;

    // `redirect: false` stops express.static bouncing /admin -> /admin/ with a
    // 301. Harmless in a browser, but it makes production behave differently
    // from dev (where Vite serves /admin directly) and adds a round trip to
    // every admin visit.
    app.use('/admin', express.static(adminDist, { redirect: false }));
    app.get('/admin', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
    app.get('/admin/*', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));

    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Glamirk Luxury Atelier Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Glamirk Atelier server:', err);
  process.exit(1);
});
