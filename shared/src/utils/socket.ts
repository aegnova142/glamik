/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { io, Socket } from 'socket.io-client';

// One socket per browser tab, shared across CMSContext / CommerceContext /
// AdminNotificationBell — replaces the three independent EventSource
// connections each of those used to open against the old SSE endpoint.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: true });
  }
  return socket;
}
