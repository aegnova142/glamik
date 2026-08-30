/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCommerce } from '../../context/CommerceContext';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { formatDateTime } from '../../utils/dateFormat';
import { useClickOutside } from '../../hooks/useClickOutside';

interface NotificationBellProps {
  onOpenOrder?: (orderId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onOpenOrder }) => {
  const { isCustomerLoggedIn } = useCustomerAuth();
  const { notifications, unreadNotificationCount, markNotificationRead, markAllNotificationsRead } = useCommerce();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setIsOpen(false));

  if (!isCustomerLoggedIn) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        id="nav-notification-bell"
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-[#FCE8ED] transition-colors cursor-pointer text-[#121212] hover:text-[#F05A7E]"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 stroke-[1.75]" />
        {unreadNotificationCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-[#F05A7E] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs">
            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white border border-[#E8D5A8] rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-3.5 border-b border-[#E8D5A8] flex items-center justify-between bg-[#FAF9F6]">
              <h4 className="font-serif text-sm text-[#121212]">Notifications</h4>
              {unreadNotificationCount > 0 && (
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="text-[10.5px] text-[#C9972B] hover:underline font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-[#FAF9F6]">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#6B6B6B]">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markNotificationRead(n.id);
                      if (n.orderId && onOpenOrder) {
                        setIsOpen(false);
                        onOpenOrder(n.orderId);
                      }
                    }}
                    className={`w-full text-left p-3.5 hover:bg-[#FAF9F6] transition-colors cursor-pointer flex items-start gap-2.5 ${
                      !n.isRead ? 'bg-[#FCE8ED]/40' : ''
                    }`}
                  >
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#F05A7E] mt-1.5 flex-shrink-0" />}
                    <div className={n.isRead ? 'pl-[14px]' : ''}>
                      <p className="text-xs font-semibold text-[#121212]">{n.title}</p>
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
