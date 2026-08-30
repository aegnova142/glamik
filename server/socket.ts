import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { subscribeToEvents, JWT_SECRET } from './db';

// Replaces the old single-stream SSE endpoint (`GET /api/events`). The
// internal event bus in server/db.ts (subscribeToEvents/broadcastEvent) is
// unchanged — every existing broadcastEvent(...) call site across
// routes.ts/commerce.ts/notifications.ts keeps working exactly as before.
// Only the delivery mechanism changes: instead of one SSE route writing
// every event to every connected response stream (client-side filtered),
// sockets join rooms and only receive what's actually addressed to them.
export function setupSocketIO(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer);

  io.on('connection', (socket) => {
    // A freshly-connected socket starts in no room — it still receives
    // un-targeted broadcasts (e.g. CMS_UPDATE) via io.emit below, but joins
    // no customer/admin room until it proves who it is. The client calls
    // this on connect and again on every login, since one socket connection
    // can outlive a login/logout cycle within the same browser tab.
    socket.on('authenticate', ({ token }: { token?: string }) => {
      if (!token) return;
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.role === 'customer' && decoded.id) {
          socket.join(`customer:${decoded.id}`);
        } else if (decoded?.role === 'admin') {
          socket.join('admin');
        }
      } catch {
        // Invalid/expired token — socket just stays unauthenticated.
      }
    });
  });

  // Single subscriber, registered once at startup (not per-connection).
  subscribeToEvents((event) => {
    if (event.type === 'NEW_NOTIFICATION' && event.data?.userId) {
      io.to(`customer:${event.data.userId}`).emit('event', event);
    } else if (event.type === 'NEW_ADMIN_NOTIFICATION') {
      io.to('admin').emit('event', event);
    } else {
      io.emit('event', event);
    }
  });

  return io;
}
