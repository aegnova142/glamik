/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDateTime } from '../../utils/dateFormat';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useSharedAdminNotifications } from '../../hooks/useSharedAdminNotifications';

export const AdminNotificationBell: React.FC = () => {
  // This component is mounted twice at once (mobile top bar + sidebar are
  // both always in the DOM — CSS just hides whichever doesn't apply to the
  // current viewport), so the fetch/poll/socket-subscription logic lives in
  // a shared singleton hook rather than here, to avoid two independent
  // pollers and sockets, and to keep both instances' badges in sync.
  const { notifications, markRead, markAllRead } = useSharedAdminNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setIsOpen(false));

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative" ref={ref}>
      <button
        id="admin-notification-bell"
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-2 rounded-lg bg-[#171717] hover:bg-[#0B0B0B] border border-[#E8D5A8]/30 text-[#FAF9F6] transition-colors cursor-pointer"
        title="Store notifications"
        aria-label="Store notifications"
      >
        <Bell className="w-4 h-4 text-[#C9972B]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-[#F05A7E] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-[#171717] border border-[#E8D5A8]/30 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-3.5 border-b border-[#E8D5A8]/15 flex items-center justify-between bg-[#0B0B0B]">
              <h4 className="font-serif text-sm text-[#FAF9F6]">Store Notifications</h4>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10.5px] text-[#C9972B] hover:underline font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-[#0B0B0B]">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#6B6B6B]">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    className={`w-full text-left p-3.5 hover:bg-[#0B0B0B] transition-colors cursor-pointer flex items-start gap-2.5 ${
                      !n.isRead ? 'bg-[#C9972B]/5' : ''
                    }`}
                  >
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#F05A7E] mt-1.5 flex-shrink-0" />}
                    <div className={n.isRead ? 'pl-[14px]' : ''}>
                      <p className="text-xs font-semibold text-[#FAF9F6]">{n.title}</p>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-[#6B6B6B] mt-1">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
