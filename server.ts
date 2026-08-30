import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import apiRouter from './server/routes';
import commerceRouter from './server/commerce';
import { ensureSchema } from './server/db';
import { setupSocketIO } from './server/socket';

// Express 4 does not forward a rejected promise from an async route handler
// to error middleware — left unhandled, Node's default since v15 is to kill
// the whole process. A single transient DB blip (Neon connection resets are
// common) would otherwise take the entire server down for every user rather
// than just failing the one request.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (server kept alive):', err);
});

async function startServer() {
  const app = express();
  // Socket.IO needs the raw http.Server (not just the Express app) so it can
  // intercept the WebSocket upgrade handshake alongside normal HTTP requests
  // on the same port.
  const httpServer = createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Guarantee every table exists before any request is served, so no
  // individual route handler needs to defensively call this itself (routes
  // that only touch a normalized table — not the cms_state blob — never go
  // through loadDatabase(), which is where this used to happen as a side effect).
  await ensureSchema();

  setupSocketIO(httpServer);

  // Body parsing middlewares
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Health check route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', atelier: 'Glamirk Beauty Central Server', time: new Date().toISOString() });
  });

  // API routes
  app.use('/api', apiRouter);
  app.use('/api/customer', commerceRouter);

  // Safety net: without this, an async route handler that throws (e.g. a
  // transient DB connection error) leaves its promise rejection unhandled by
  // Express and the request just hangs — the client never gets a response to
  // react to, so a flaky DB blip can strand a page in "loading" forever.
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: 3000,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
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
