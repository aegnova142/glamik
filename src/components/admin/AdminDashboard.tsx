/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useCMS } from '../../context/CMSContext';
import { apiFetch } from '../../utils/cmsClient';
import {
  Package,
  FileText,
  Tag,
  Clock,
  Image as ImageIcon,
  Activity,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  IndianRupee,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import { LiveOfferCountdown } from '../marketing/LiveOfferCountdown';

interface AdminDashboardProps {
  onNavigateTab: (tab: string) => void;
}

interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  totalCustomers: number;
  recentOrders: { orderNumber: string; customerName: string; status: string; total: number; createdAt: string }[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const { products, pages, offers, categories, journalArticles, refreshPublicContent } = useCMS();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const publishedProducts = (products || []).filter((p) => p.inStock);
  const publishedPages = (pages || []).filter((p) => p.status === 'published');
  const activeOffers = (offers || []).filter((o) => o.status === 'active');
  const scheduledOffers = (offers || []).filter((o) => o.status === 'scheduled');

  const fetchAnalytics = async () => {
    setIsLoadingAnalytics(true);
    const res = await apiFetch<AnalyticsSummary>('/api/admin/analytics/summary');
    if (res.data) setAnalytics(res.data);
    setIsLoadingAnalytics(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshPublicContent(), fetchAnalytics()]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome */}
      <div className="p-6 md:p-8 rounded-2xl bg-gradient-to-r from-[#0B0B0B] via-[#171717] to-[#0B0B0B] border border-[#E8D5A8]/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/30">
              Live Real-Time Engine Active
            </span>
            <span className="text-xs text-[#6B6B6B]">Store Timezone: Asia/Kolkata</span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl text-[#FAF9F6] tracking-wide">
            Glamirk Atelier Content Management
          </h1>
          <p className="text-xs md:text-sm text-[#6B6B6B] mt-1 max-w-2xl">
            Manage your pages, catalog, sections, and scheduled promotions in real time. Changes propagate immediately to all storefront visitors.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#171717] hover:bg-[#0B0B0B] border border-[#E8D5A8]/30 text-[#FAF9F6] text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C9972B] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync Live Store</span>
          </button>
        </div>
      </div>

      {/* Store Performance — real order/revenue analytics, not CMS content counts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-lg text-[#FAF9F6] tracking-wide">Store Performance</h2>
          {isLoadingAnalytics && <span className="text-[11px] text-[#6B6B6B]">Loading…</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Total Revenue</span>
              <div className="w-9 h-9 rounded-lg bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B]">
                <IndianRupee className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-[#FAF9F6]">₹{(analytics?.totalRevenue ?? 0).toLocaleString('en-IN')}</span>
            </div>
            <p className="mt-3 pt-3 border-t border-[#E8D5A8]/10 text-xs text-[#6B6B6B]">Excludes cancelled orders</p>
          </div>

          <div
            onClick={() => onNavigateTab('orders')}
            className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all cursor-pointer group shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Total Orders</span>
              <div className="w-9 h-9 rounded-lg bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-[#FAF9F6]">{analytics?.totalOrders ?? 0}</span>
            </div>
            <p className="mt-3 pt-3 border-t border-[#E8D5A8]/10 text-xs text-[#C9972B]">View all orders →</p>
          </div>

          <div
            onClick={() => onNavigateTab('orders')}
            className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#F05A7E]/50 transition-all cursor-pointer group shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Pending Fulfillment</span>
              <div className="w-9 h-9 rounded-lg bg-[#F05A7E]/10 flex items-center justify-center text-[#F05A7E] group-hover:scale-105 transition-transform">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-[#F05A7E]">{analytics?.pendingOrders ?? 0}</span>
            </div>
            <p className="mt-3 pt-3 border-t border-[#E8D5A8]/10 text-xs text-[#6B6B6B]">Not yet delivered</p>
          </div>

          <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Total Customers</span>
              <div className="w-9 h-9 rounded-lg bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B]">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-[#FAF9F6]">{analytics?.totalCustomers ?? 0}</span>
            </div>
            <p className="mt-3 pt-3 border-t border-[#E8D5A8]/10 text-xs text-[#6B6B6B]">Registered accounts</p>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      {analytics && analytics.recentOrders.length > 0 && (
        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-[#FAF9F6] tracking-wide">Recent Orders</h2>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-xs text-[#C9972B] hover:underline font-semibold cursor-pointer"
            >
              Manage Orders →
            </button>
          </div>
          <div className="divide-y divide-[#0B0B0B]">
            {analytics.recentOrders.map((order) => (
              <div key={order.orderNumber} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-[#FAF9F6]">#{order.orderNumber}</span>
                  <span className="text-[#6B6B6B] ml-2">{order.customerName}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] uppercase tracking-wider text-[#C9972B]">{order.status.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-[#FAF9F6]">₹{order.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Products Card */}
        <div
          onClick={() => onNavigateTab('products')}
          className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Product Catalogue</span>
            <div className="w-9 h-9 rounded-lg bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-105 transition-transform">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-[#FAF9F6]">{products.length}</span>
            <span className="text-xs text-[#6B6B6B]">total items</span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-between text-xs">
            <span className="text-[#C9972B]">{publishedProducts.length} In Stock</span>
            <span className="text-[#6B6B6B]">{products.length - publishedProducts.length} Draft/Out</span>
          </div>
        </div>

        {/* Offers Card */}
        <div
          onClick={() => onNavigateTab('offers')}
          className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#F05A7E]/50 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Active Offers</span>
            <div className="w-9 h-9 rounded-lg bg-[#F05A7E]/10 flex items-center justify-center text-[#F05A7E] group-hover:scale-105 transition-transform">
              <Tag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-[#F05A7E]">{activeOffers.length}</span>
            <span className="text-xs text-[#6B6B6B]">active campaigns</span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-between text-xs">
            <span className="text-[#C9972B]">{scheduledOffers.length} Scheduled</span>
            <span className="text-[#6B6B6B]">{offers.length} Total</span>
          </div>
        </div>

        {/* Pages Card */}
        <div
          onClick={() => onNavigateTab('pages')}
          className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Pages & Sections</span>
            <div className="w-9 h-9 rounded-lg bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-[#FAF9F6]">{pages.length}</span>
            <span className="text-xs text-[#6B6B6B]">managed pages</span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-between text-xs">
            <span className="text-[#C9972B]">{publishedPages.length} Published</span>
            <span className="text-[#6B6B6B]">1 Homepage</span>
          </div>
        </div>

        {/* Journal / Blog Card */}
        <div
          onClick={() => onNavigateTab('blog')}
          className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Editorial Journal</span>
            <div className="w-9 h-9 rounded-lg bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-[#FAF9F6]">{journalArticles.length}</span>
            <span className="text-xs text-[#6B6B6B]">articles live</span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#E8D5A8]/10 flex items-center justify-between text-xs">
            <span className="text-[#C9972B]">Beauty Guides</span>
            <span className="text-[#6B6B6B]">Atelier Notes</span>
          </div>
        </div>
      </div>

      {/* Active Scheduled Offers Spotlight */}
      {activeOffers.length > 0 && (
        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#C9972B]" />
              <h2 className="font-serif text-lg text-[#FAF9F6] tracking-wide">Live Active Offers & Countdowns</h2>
            </div>
            <button
              onClick={() => onNavigateTab('offers')}
              className="text-xs text-[#F05A7E] hover:underline font-semibold cursor-pointer"
            >
              Manage Offers →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeOffers.map((offer) => (
              <div
                key={offer.id}
                className="p-4 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30 mb-1">
                      {offer.tag || 'ACTIVE OFFER'}
                    </span>
                    <h3 className="font-semibold text-sm text-[#FAF9F6]">{offer.publicTitle || offer.name}</h3>
                    <p className="text-xs text-[#6B6B6B] line-clamp-1">{offer.description}</p>
                    {offer.couponCode && (
                      <p className="text-xs text-[#C9972B] font-mono mt-1">Code: {offer.couponCode}</p>
                    )}
                  </div>
                </div>

                {offer.showCountdown && offer.endDate && (
                  <div className="pt-2 border-t border-[#E8D5A8]/10">
                    <LiveOfferCountdown targetDate={offer.endDate} compact />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Admin Actions */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
        <h2 className="font-serif text-lg text-[#FAF9F6] tracking-wide mb-4">Quick Store Management Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <button
            onClick={() => onNavigateTab('orders')}
            className="p-4 rounded-lg bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#F05A7E]/50 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#F05A7E]/10 flex items-center justify-center text-[#F05A7E] group-hover:scale-110 transition-transform">
              <Truck className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-[#FAF9F6]">Manage Orders</span>
          </button>

          <button
            onClick={() => onNavigateTab('products')}
            className="p-4 rounded-lg bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-110 transition-transform">
              <Package className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-[#FAF9F6]">Add / Edit Products</span>
          </button>

          <button
            onClick={() => onNavigateTab('pages')}
            className="p-4 rounded-lg bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-[#FAF9F6]">Page Builder</span>
          </button>

          <button
            onClick={() => onNavigateTab('offers')}
            className="p-4 rounded-lg bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#F05A7E]/50 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#F05A7E]/10 flex items-center justify-center text-[#F05A7E] group-hover:scale-110 transition-transform">
              <Tag className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-[#FAF9F6]">Create Offer</span>
          </button>

          <button
            onClick={() => onNavigateTab('media')}
            className="p-4 rounded-lg bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-110 transition-transform">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-[#FAF9F6]">Media Library</span>
          </button>

          <button
            onClick={() => onNavigateTab('navigation')}
            className="p-4 rounded-lg bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/20 hover:border-[#C9972B]/50 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] group-hover:scale-110 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-[#FAF9F6]">Header & Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
