/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDateTime } from '../../utils/dateFormat';
import { useSharedAdminNotifications } from '../../hooks/useSharedAdminNotifications';

interface AdminNotificationBellProps {
  onViewAll?: () => void;
}

const DROPDOWN_WIDTH = 320;
const DROPDOWN_MARGIN = 12;

export const AdminNotificationBell: React.FC<AdminNotificationBellProps> = ({ onViewAll }) => {
  // This component is mounted twice at once (mobile top bar + sidebar are
  // both always in the DOM — CSS just hides whichever doesn't apply to the
  // current viewport), so the fetch/poll/socket-subscription logic lives in
  // a shared singleton hook rather than here, to avoid two independent
  // pollers and sockets, and to keep both instances' badges in sync.
  const { notifications, markRead, markAllRead } = useSharedAdminNotifications();
  const [isOpen, setIsOpen] = useState(false);
  // Rendered in a portal (below) so its width/position is never constrained
  // by whichever narrow parent the button happens to live in — previously
  // the sidebar-mounted instance rendered an absolutely-positioned w-80
  // (320px) panel anchored right-0 inside a ~256-288px sidebar column,
  // which pushed its left edge off the browser viewport entirely (visible
  // as cut-off text like "vered" instead of "Delivered"). Computing a fixed
  // viewport position from the button's own bounding rect and clamping it
  // to stay on-screen fixes that at the root, for both mount points.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The dropdown itself lives in a portal (see below), so it is NOT a DOM
  // descendant of `ref` even though it's a React child of it — a plain
  // ref.contains() outside-click check would treat every click inside the
  // dropdown (mark read, mark all read, view all) as "outside" and close it
  // before the click handler runs. This ref lets the outside-click check
  // below cover both the button and the portalled panel.
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Coordinates are computed once on open from the button's bounding rect.
  // Rather than tracking scroll/resize to keep them in sync (more moving
  // parts for a rarely-open popover), just close on either — the same
  // popover-dismissal UX users already expect elsewhere.
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(DROPDOWN_MARGIN, rect.right - DROPDOWN_WIDTH),
      window.innerWidth - DROPDOWN_WIDTH - DROPDOWN_MARGIN
    );
    setCoords({ top: rect.bottom + 8, left });
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
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

      {createPortal(
        <AnimatePresence>
          {isOpen && coords && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              style={{ position: 'fixed', top: coords.top, left: coords.left, width: DROPDOWN_WIDTH }}
              className="max-w-[calc(100vw-24px)] bg-[#171717] border border-[#E8D5A8]/30 rounded-xl shadow-2xl overflow-hidden z-[100]"
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

              {onViewAll && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onViewAll();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 p-3 text-[11px] font-semibold uppercase tracking-wider text-[#C9972B] hover:bg-[#0B0B0B] border-t border-[#E8D5A8]/15 transition-colors cursor-pointer"
                >
                  <span>View All Notifications</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
