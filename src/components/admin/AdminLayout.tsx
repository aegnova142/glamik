/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import {
  LayoutDashboard,
  FileText,
  Package,
  Layers,
  Tag,
  Menu as MenuIcon,
  X,
  Image as ImageIcon,
  BookOpen,
  HelpCircle,
  Settings,
  ShieldCheck,
  LogOut,
  ExternalLink,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { AdminHero } from './AdminHero';
import { AdminAbout } from './AdminAbout';
import { AdminBenefits } from './AdminBenefits';
import { AdminShadeFinder } from './AdminShadeFinder';
import { AdminShadeIntelligence } from './AdminShadeIntelligence';
import { AdminLooks } from './AdminLooks';
import { AdminPages } from './AdminPages';
import { AdminProducts } from './AdminProducts';
import { AdminCategories } from './AdminCategories';
import { AdminOffers } from './AdminOffers';
import { AdminPromoBanners } from './AdminPromoBanners';
import { AdminNavigation } from './AdminNavigation';
import { AdminFooter } from './AdminFooter';
import { AdminBlog } from './AdminBlog';
import { AdminFaqs } from './AdminFaqs';
import { AdminMediaLibrary } from './AdminMediaLibrary';
import { AdminSettings } from './AdminSettings';
import { AdminSecurity } from './AdminSecurity';

interface AdminLayoutProps {
  onExitAdmin: () => void;
}

type AdminTab =
  | 'dashboard'
  | 'hero'
  | 'about'
  | 'benefits'
  | 'shadeFinder'
  | 'shadeIntelligence'
  | 'looks'
  | 'pages'
  | 'products'
  | 'categories'
  | 'offers'
  | 'promoBanners'
  | 'navigation'
  | 'footer'
  | 'blog'
  | 'faqs'
  | 'media'
  | 'settings'
  | 'security';

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onExitAdmin }) => {
  const { adminUser, adminLogout } = useCMS();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  type NavItem = { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> };

  const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
      label: 'Overview',
      items: [{ id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard }],
    },
    {
      label: 'Homepage & Content',
      items: [
        { id: 'hero', label: 'Hero Section', icon: Sparkles },
        { id: 'about', label: 'About Page', icon: FileText },
        { id: 'benefits', label: 'Benefits & Optimization', icon: ShieldCheck },
        { id: 'shadeFinder', label: 'Find My Shade Journey', icon: Sparkles },
        { id: 'shadeIntelligence', label: 'Shade Intelligence (Home)', icon: Sparkles },
        { id: 'looks', label: 'Shop The Look', icon: Sparkles },
        { id: 'blog', label: 'Journal & Guides', icon: BookOpen },
        { id: 'pages', label: 'Pages & Sections Builder', icon: FileText },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { id: 'products', label: 'Product Catalogue', icon: Package },
        { id: 'categories', label: 'Categories & Taxonomy', icon: Layers },
      ],
    },
    {
      label: 'Marketing',
      items: [
        { id: 'offers', label: 'Offers & Campaigns', icon: Tag },
        { id: 'promoBanners', label: 'Promo Banner Popup', icon: ImageIcon },
      ],
    },
    {
      label: 'Site Structure',
      items: [
        { id: 'navigation', label: 'Header Navigation', icon: MenuIcon },
        { id: 'footer', label: 'Footer Settings', icon: Layers },
        { id: 'faqs', label: 'Client FAQs', icon: HelpCircle },
      ],
    },
    {
      label: 'Assets',
      items: [{ id: 'media', label: 'Media Library', icon: ImageIcon }],
    },
    {
      label: 'System',
      items: [
        { id: 'settings', label: 'Global Store Settings', icon: Settings },
        { id: 'security', label: 'Security & Audit Trail', icon: ShieldCheck },
      ],
    },
  ];

  const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

  const handleLogout = () => {
    adminLogout();
    onExitAdmin();
  };

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-[#FAF9F6] flex flex-col font-sans">
      {/* Top Mobile Bar */}
      <div className="lg:hidden flex items-center justify-between p-3.5 bg-[#171717] border-b border-[#E8D5A8]/20 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 -ml-1 text-[#FAF9F6] hover:text-[#C9972B] active:scale-95 transition-all"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-[#F05A7E]" /> : <MenuIcon className="w-5 h-5" />}
          </button>
          <span className="font-serif text-lg tracking-widest text-[#FAF9F6]">GLAMIRK</span>
          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/30 font-bold">
            CMS
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExitAdmin}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-[#FAF9F6] font-medium transition-colors"
          >
            <ExternalLink className="w-3 h-3 text-[#C9972B]" />
            <span>Store</span>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded-lg border border-[#E8D5A8]/20 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Horizontal Quick Navigation Bar */}
      <div className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-[#0B0B0B] border-b border-[#E8D5A8]/15 overflow-x-auto no-scrollbar sticky top-[57px] z-30">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                isActive
                  ? 'bg-[#F05A7E] text-white shadow-sm font-bold'
                  : 'bg-[#171717] text-[#FAF9F6]/60 hover:text-[#FAF9F6] border border-[#E8D5A8]/20'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label.replace(' & ', '/').replace(' Overview', '').replace(' Catalogue', '').replace(' Settings', '')}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop Overlay */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-[#0B0B0B]/75 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-50 w-72 lg:w-64 bg-[#171717] border-r border-[#E8D5A8]/20 flex flex-col justify-between transform transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div>
            {/* Brand Logo & Version */}
            <div className="p-6 border-b border-[#E8D5A8]/15">
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl tracking-wider text-[#FAF9F6]">GLAMIRK</span>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/30 font-bold">
                  CMS ATELIER
                </span>
              </div>
              <p className="text-[11px] text-[#6B6B6B] mt-1">Full-Stack Real-Time Content Hub</p>
            </div>

            {/* Navigation items, grouped */}
            <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-230px)]">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-3.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B]">
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#C9972B] text-[#0B0B0B] shadow-sm font-bold'
                            : 'text-[#FAF9F6] hover:bg-[#0B0B0B] hover:text-[#C9972B]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-[#0B0B0B]' : 'text-[#C9972B]'}`} />
                          <span>{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>

          {/* Admin User Footer */}
          <div className="p-4 border-t border-[#E8D5A8]/15 bg-[#0B0B0B]/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-[#FAF9F6] truncate">
                  {adminUser?.name || 'Administrator'}
                </p>
                <p className="text-[10px] text-[#6B6B6B] truncate font-mono">
                  {adminUser?.email || 'tryweb@gmail.com'}
                </p>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#C9972B]/10 text-[#E3B84B] border border-[#C9972B]/40">
                AUTH
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onExitAdmin}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#171717] hover:bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-[11px] font-semibold text-[#FAF9F6] transition-colors cursor-pointer"
                title="View Live Storefront"
              >
                <ExternalLink className="w-3 h-3 text-[#C9972B]" />
                <span>Store</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center justify-center p-1.5 bg-[#171717] hover:bg-[#F05A7E]/20 text-[#F05A7E] border border-[#E8D5A8]/30 rounded text-xs transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#0B0B0B]">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard' && <AdminDashboard onNavigateTab={(t) => setActiveTab(t as AdminTab)} />}
            {activeTab === 'hero' && <AdminHero />}
            {activeTab === 'about' && <AdminAbout />}
            {activeTab === 'benefits' && <AdminBenefits />}
            {activeTab === 'shadeFinder' && <AdminShadeFinder />}
            {activeTab === 'shadeIntelligence' && <AdminShadeIntelligence />}
            {activeTab === 'looks' && <AdminLooks />}
            {activeTab === 'pages' && <AdminPages />}
            {activeTab === 'products' && <AdminProducts />}
            {activeTab === 'categories' && <AdminCategories />}
            {activeTab === 'offers' && <AdminOffers />}
            {activeTab === 'promoBanners' && <AdminPromoBanners />}
            {activeTab === 'navigation' && <AdminNavigation />}
            {activeTab === 'footer' && <AdminFooter />}
            {activeTab === 'blog' && <AdminBlog />}
            {activeTab === 'faqs' && <AdminFaqs />}
            {activeTab === 'media' && <AdminMediaLibrary />}
            {activeTab === 'settings' && <AdminSettings />}
            {activeTab === 'security' && <AdminSecurity />}
          </div>
        </main>
      </div>
    </div>
  );
};
