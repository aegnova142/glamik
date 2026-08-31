/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bell, Package, Truck, CheckCircle2 } from 'lucide-react';
import { formatDateTime } from '../../utils/dateFormat';
import { useSharedAdminNotifications } from '../../hooks/useSharedAdminNotifications';

interface AdminNotificationsProps {
  onNavigateTab: (tab: string) => void;
}

const ICONS_BY_TYPE: Record<string, React.ComponentType<{ className?: string }>> = {
  NEW_ORDER: Package,
  ORDER_DELIVERED: Truck,
};

export const AdminNotifications: React.FC<AdminNotificationsProps> = ({ onNavigateTab }) => {
  const { notifications, markRead, markAllRead } = useSharedAdminNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visible = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Store Notifications</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Every operational alert — new orders, deliveries, and system events — in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#171717] border border-[#E8D5A8]/30 rounded-lg overflow-hidden">
            <button
              onClick={() => setFilter('all')}
              className={`px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                filter === 'all' ? 'bg-[#C9972B] text-[#0B0B0B]' : 'text-[#FAF9F6] hover:bg-[#0B0B0B]'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                filter === 'unread' ? 'bg-[#C9972B] text-[#0B0B0B]' : 'text-[#FAF9F6] hover:bg-[#0B0B0B]'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#171717] hover:bg-[#F05A7E]/10 border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#C9972B] transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark All Read</span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden divide-y divide-[#0B0B0B]">
        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-8 h-8 text-[#6B6B6B] mx-auto mb-3" />
            <p className="text-xs text-[#6B6B6B]">
              {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
            </p>
          </div>
        ) : (
          visible.map((n) => {
            const Icon = ICONS_BY_TYPE[n.type] || Bell;
            return (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.isRead) markRead(n.id);
                  if (n.orderId) onNavigateTab('orders');
                }}
                className={`w-full text-left p-4 sm:p-5 flex items-start gap-3.5 hover:bg-[#0B0B0B]/60 transition-colors cursor-pointer ${
                  !n.isRead ? 'bg-[#C9972B]/5' : ''
                }`}
              >
                <div
                  className={`p-2 rounded-lg border shrink-0 ${
                    !n.isRead
                      ? 'bg-[#C9972B]/15 border-[#C9972B]/30 text-[#C9972B]'
                      : 'bg-[#0B0B0B] border-[#E8D5A8]/20 text-[#6B6B6B]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#FAF9F6]">{n.title}</p>
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#F05A7E] shrink-0" />}
                  </div>
                  <p className="text-xs text-[#6B6B6B] mt-1">{n.body}</p>
                  <p className="text-[10.5px] text-[#6B6B6B]/70 mt-1.5 font-mono">{formatDateTime(n.createdAt)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
