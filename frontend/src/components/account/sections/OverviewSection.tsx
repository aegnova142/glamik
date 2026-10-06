/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import {
  Package,
  Heart,
  Ticket,
  Headphones,
  User,
  MapPin,
  Bell,
  Sparkles,
  Bot,
  Star,
  Eye,
  Settings,
  LogOut,
  Award,
  ChevronRight,
} from 'lucide-react';
import { AccountSection, Order } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { AccountCard, AccountError, AccountSectionHeader, formatDate, formatMoney, StatusBadge } from '../AccountUI';
import { orderStatusTone } from './orderStatus';
import { ProductImage } from '../../product/ProductImage';

interface OverviewSectionProps {
  orders: Order[];
  onNavigateSection: (section: AccountSection) => void;
  onOpenOrder: (orderId: string) => void;
  onExploreShop: () => void;
  onLogout: () => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  orders,
  onNavigateSection,
  onOpenOrder,
  onExploreShop,
  onLogout,
}) => {
  const { overview, loadOverview } = useAccount();

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const stats = overview.data;
  const recentOrders = orders.slice(0, 3);

  const summary = [
    { label: 'Total Orders', value: stats?.totalOrders, section: 'orders' as AccountSection, icon: Package },
    { label: 'Wishlist', value: stats?.wishlistCount, section: 'wishlist' as AccountSection, icon: Heart },
    { label: 'Glam Rewards', value: stats?.rewardPoints, suffix: 'pts', section: 'rewards' as AccountSection, icon: Award },
    { label: 'Available Coupons', value: stats?.availableCoupons, section: 'rewards' as AccountSection, icon: Ticket },
  ];

  const quickActions = [
    { id: 'orders' as AccountSection, label: 'My Orders', icon: Package, hint: 'Track, return or reorder' },
    { id: 'wishlist' as AccountSection, label: 'Wishlist', icon: Heart, hint: 'Everything you have saved' },
    { id: 'rewards' as AccountSection, label: 'Coupons & Rewards', icon: Ticket, hint: 'Points and promo codes' },
    { id: 'help' as AccountSection, label: 'Help Center', icon: Headphones, hint: 'Get help with an order' },
  ];

  const manageLinks = [
    { id: 'profile' as AccountSection, label: 'My Profile', icon: User },
    { id: 'addresses' as AccountSection, label: 'Saved Addresses', icon: MapPin },
    { id: 'notifications' as AccountSection, label: 'Notification Preferences', icon: Bell },
    { id: 'glam-profile' as AccountSection, label: 'My Glam Profile', icon: Sparkles },
    { id: 'shade-history' as AccountSection, label: 'Shade AI History', icon: Bot },
    { id: 'reviews' as AccountSection, label: 'My Reviews', icon: Star },
    { id: 'recently-viewed' as AccountSection, label: 'Recently Viewed', icon: Eye },
    { id: 'settings' as AccountSection, label: 'Account Settings', icon: Settings },
  ];

  return (
    <div className="space-y-7">
      <AccountSectionHeader
        kicker="Your Suite"
        title="Account Overview"
        description="Everything you have ordered, saved and earned, in one place."
      />

      {overview.error && <AccountError message={overview.error} onRetry={() => loadOverview(true)} />}

      {/* Summary strip — values come from the customer's own rows, so a
          skeleton shows until the real number arrives rather than a zero that
          would read as "you have nothing". */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {summary.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => onNavigateSection(item.section)}
              className="bg-white border border-[#E8D5A8] rounded-xl p-4 sm:p-5 text-left hover:border-[#C9972B] transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className="w-4 h-4 text-[#C9972B]" />
                <ChevronRight className="w-3.5 h-3.5 text-[#D6CEBC] group-hover:text-[#C9972B] transition-colors" />
              </div>
              {overview.loading && !stats ? (
                <div className="h-7 w-14 bg-[#F1EBDD] rounded animate-pulse" />
              ) : (
                <span className="font-serif text-2xl sm:text-3xl text-[#121212] block leading-none">
                  {item.value ?? 0}
                  {item.suffix && <span className="text-sm text-[#524C4C] ml-1">{item.suffix}</span>}
                </span>
              )}
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#524C4C] mt-2 block">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onNavigateSection(action.id)}
              className="bg-white border border-[#E8D5A8] rounded-xl p-5 flex items-center gap-4 text-left hover:border-[#C9972B] hover:shadow-[0_8px_24px_rgba(201,151,43,0.08)] transition-all cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-[#C9972B]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-serif text-base text-[#121212] block">{action.label}</span>
                <span className="text-[11.5px] text-[#524C4C]">{action.hint}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#D6CEBC] group-hover:text-[#C9972B] transition-colors shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Recent orders */}
      <AccountCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8D5A8] flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-[#121212]">Recent Orders</h2>
          {orders.length > 0 && (
            <button
              onClick={() => onNavigateSection('orders')}
              className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[#C9972B] hover:underline cursor-pointer"
            >
              View all
            </button>
          )}
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-xs text-[#524C4C]">You haven&apos;t placed an order yet.</p>
            <button
              onClick={onExploreShop}
              className="px-6 py-3 bg-[#0B0B0B] text-white text-[11px] font-semibold tracking-[0.16em] uppercase rounded-full hover:bg-[#171717] transition-colors cursor-pointer"
            >
              Start Shopping
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[#F1EBDD]">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <button
                  onClick={() => onOpenOrder(order.id)}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                >
                  <ProductImage
                    src={order.items[0]?.productImage}
                    alt=""
                    className="w-12 h-14 object-cover border border-[#E8D5A8] rounded shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-serif text-sm text-[#121212]">#{order.orderNumber}</span>
                      <StatusBadge status={order.status} tone={orderStatusTone(order.status)} />
                    </div>
                    <p className="text-[11.5px] text-[#524C4C] mt-1 truncate">
                      {order.items[0]?.productName}
                      {order.items.length > 1 ? ` + ${order.items.length - 1} more` : ''}
                    </p>
                    <p className="text-[11px] text-[#9C9689] mt-0.5">Placed {formatDate(order.createdAt)}</p>
                  </div>
                  <span className="font-serif text-sm text-[#121212] shrink-0">{formatMoney(order.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AccountCard>

      {/* Manage */}
      <AccountCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8D5A8]">
          <h2 className="font-serif text-lg text-[#121212]">Manage Your Account</h2>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-[#F1EBDD]">
          {manageLinks.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.id} className="sm:border-b sm:border-[#F1EBDD]">
                <button
                  onClick={() => onNavigateSection(link.id)}
                  className="w-full px-5 py-3.5 flex items-center gap-3 text-left text-[13px] text-[#121212] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                >
                  <Icon className="w-4 h-4 text-[#C9972B] shrink-0" />
                  <span className="flex-1 truncate">{link.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#D6CEBC] shrink-0" />
                </button>
              </li>
            );
          })}
          <li className="sm:border-b sm:border-[#F1EBDD]">
            <button
              onClick={onLogout}
              className="w-full px-5 py-3.5 flex items-center gap-3 text-left text-[13px] text-[#C0392B] hover:bg-[#FDF3F2] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="flex-1">Logout</span>
            </button>
          </li>
        </ul>
      </AccountCard>
    </div>
  );
};
