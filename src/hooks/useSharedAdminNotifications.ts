import { useEffect, useState } from 'react';
import { apiFetch, getAdminToken } from '../utils/cmsClient';
import { getSocket } from '../utils/socket';
import { AppNotification } from '../types';

// Socket.IO push (below) is the primary channel — polling is just a
// resilience net in case the connection drops without a 'disconnect' event.
const FALLBACK_POLL_INTERVAL_MS = 60000;

// AdminNotificationBell is mounted twice at once (mobile top bar + sidebar,
// simultaneously in the DOM — CSS just hides whichever doesn't apply to the
// current viewport). Module-level singleton state means however many
// instances mount, there's exactly one poll interval and one socket
// subscription, and marking a notification read in one instance updates
// every other instance's badge immediately instead of waiting for its next
// independent poll.
let sharedNotifications: AppNotification[] = [];
const listeners = new Set<(notifications: AppNotification[]) => void>();
let singletonsStarted = false;

function setShared(notifications: AppNotification[]) {
  sharedNotifications = notifications;
  listeners.forEach((listener) => listener(sharedNotifications));
}

async function fetchNotifications() {
  const res = await apiFetch<{ notifications: AppNotification[] }>('/api/admin/notifications');
  if (res.data) setShared(res.data.notifications || []);
}

function ensureSingletonsStarted() {
  if (singletonsStarted) return;
  singletonsStarted = true;

  fetchNotifications();
  setInterval(fetchNotifications, FALLBACK_POLL_INTERVAL_MS);

  const socket = getSocket();
  const authenticate = () => {
    const token = getAdminToken();
    if (token) socket.emit('authenticate', { token });
  };
  authenticate();
  socket.on('connect', authenticate);
  socket.on('event', (event: any) => {
    if (event?.type === 'NEW_ADMIN_NOTIFICATION') {
      const incoming = event.data?.notification as AppNotification | undefined;
      if (incoming) {
        setShared(sharedNotifications.some((n) => n.id === incoming.id) ? sharedNotifications : [incoming, ...sharedNotifications]);
      }
    }
  });
}

export function useSharedAdminNotifications() {
  const [notifications, setNotifications] = useState(sharedNotifications);

  useEffect(() => {
    ensureSingletonsStarted();
    listeners.add(setNotifications);
    setNotifications(sharedNotifications);
    return () => {
      listeners.delete(setNotifications);
    };
  }, []);

  const markRead = async (id: string) => {
    setShared(sharedNotifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await apiFetch(`/api/admin/notifications/${id}/read`, { method: 'POST' });
  };

  const markAllRead = async () => {
    setShared(sharedNotifications.map((n) => ({ ...n, isRead: true })));
    await apiFetch('/api/admin/notifications/read-all', { method: 'POST' });
  };

  return { notifications, markRead, markAllRead };
}
