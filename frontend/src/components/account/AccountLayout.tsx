/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard,
  Package,
  Heart,
  Ticket,
  MapPin,
  User,
  Sparkles,
  Bot,
  Camera,
  CreditCard,
  Star,
  Eye,
  Headphones,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
} from 'lucide-react';
import { AccountSection } from '@glamirk/shared/types';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

export interface AccountNavItem {
  id: AccountSection;
  label: string;
  icon: React.ElementType;
  /** Live count rendered as a pill next to the label. */
  badge?: number;
}

export interface AccountNavEntry {
  id: AccountSection;
  label: string;
  icon: React.ElementType;
  /** Sub-sections rendered beneath this one. A parent with children is still
   * a real, navigable section in its own right — not just a folder. */
  children?: { id: AccountSection; label: string; icon: React.ElementType }[];
}

export const ACCOUNT_NAV: AccountNavEntry[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'My Orders', icon: Package },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  { id: 'rewards', label: 'Coupons & Rewards', icon: Ticket },
  { id: 'addresses', label: 'Saved Addresses', icon: MapPin },
  { id: 'payments', label: 'Payments & Refunds', icon: CreditCard },
  { id: 'profile', label: 'My Profile', icon: User },
  // The three beauty screens are grouped rather than listed flat: they are
  // one concern with three views, and at thirteen-plus top-level items the
  // sidebar had stopped reading as a list of destinations.
  {
    id: 'glam-profile',
    label: 'My Beauty Profile',
    icon: Sparkles,
    children: [
      { id: 'glam-profile', label: 'My Shade', icon: Sparkles },
      { id: 'shade-history', label: 'Shade History', icon: Bot },
      { id: 'try-on-history', label: 'Virtual Try-On', icon: Camera },
    ],
  },
  { id: 'reviews', label: 'My Reviews', icon: Star },
  { id: 'recently-viewed', label: 'Recently Viewed', icon: Eye },
  { id: 'help', label: 'Help Center', icon: Headphones },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Security & Settings', icon: Settings },
];

/** Flat list of every reachable section, derived from the tree above so the
 * two can't drift. */
export const ACCOUNT_NAV_FLAT: { id: AccountSection; label: string; icon: React.ElementType }[] = ACCOUNT_NAV.flatMap(
  (item) => (item.children ? item.children : [{ id: item.id, label: item.label, icon: item.icon }])
);

/** The sections nested under a given parent — used to decide whether a
 * collapsed group should still render as active. */
function groupContains(item: AccountNavEntry, section: AccountSection): boolean {
  if (item.id === section) return true;
  return (item.children || []).some((child) => child.id === section);
}

interface AccountLayoutProps {
  section: AccountSection;
  /** Set when a nested order screen is open — the sidebar still highlights
   * "My Orders", but the header shows a back link instead of the greeting. */
  nestedTitle?: string;
  onBack?: () => void;
  onNavigate: (section: AccountSection) => void;
  onLogout: () => void;
  badges?: Partial<Record<AccountSection, number>>;
  children: React.ReactNode;
}

export const AccountLayout: React.FC<AccountLayoutProps> = ({
  section,
  nestedTitle,
  onBack,
  onNavigate,
  onLogout,
  badges = {},
  children,
}) => {
  const { customerUser } = useCustomerAuth();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const mobileNavRef = React.useRef<HTMLDivElement>(null);
  useClickOutside(mobileNavRef, () => setMobileNavOpen(false));

  const firstName = (customerUser?.name || '').trim().split(/\s+/)[0] || 'there';
  const activeItem = ACCOUNT_NAV_FLAT.find((item) => item.id === section);

  // A group starts open when the customer is already inside it, so landing on
  // /account/try-on-history from a link doesn't show a collapsed sidebar with
  // nothing highlighted.
  const [openGroups, setOpenGroups] = React.useState<Set<AccountSection>>(
    () => new Set(ACCOUNT_NAV.filter((item) => item.children && groupContains(item, section)).map((item) => item.id))
  );

  // Navigating into a group from outside it (e.g. the Overview card grid)
  // has to expand it too — the initial state above only runs once.
  React.useEffect(() => {
    const parent = ACCOUNT_NAV.find((item) => item.children && groupContains(item, section));
    if (parent) setOpenGroups((prev) => (prev.has(parent.id) ? prev : new Set(prev).add(parent.id)));
  }, [section]);

  const toggleGroup = (id: AccountSection) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** A group's badge is the sum of its children's, so a collapsed group still
   * shows that something inside it needs attention. */
  const groupBadge = (item: AccountNavEntry): number | undefined => {
    if (!item.children) return badges[item.id];
    const total = item.children.reduce((sum, child) => sum + (badges[child.id] || 0), 0);
    return total > 0 ? total : undefined;
  };

  const handleNavigate = (next: AccountSection) => {
    setMobileNavOpen(false);
    onNavigate(next);
  };

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212]">
      {/* Greeting banner — the one deliberately dark, editorial surface in the
          account, so the rest of the page can stay light and readable. */}
      <div className="bg-[#0B0B0B] text-[#FAF9F6] border-b border-[#C9972B]/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {nestedTitle && onBack ? (
            <div className="space-y-3">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.18em] uppercase text-[#C9972B] hover:text-[#E3B84B] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back to My Orders
              </button>
              <h1 className="font-serif text-2xl sm:text-3xl">{nestedTitle}</h1>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4 min-w-0">
                {customerUser?.avatarUrl ? (
                  <img
                    src={cloudinaryImageUrl(customerUser.avatarUrl, 'avatar')}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-14 h-14 rounded-full object-cover border border-[#C9972B]/50 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#171717] border border-[#C9972B]/40 flex items-center justify-center shrink-0">
                    <span className="font-serif text-lg text-[#C9972B]">{firstName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-[9.5px] font-semibold tracking-[0.26em] uppercase text-[#C9972B] block">
                    Glamirk Atelier
                  </span>
                  <h1 className="font-serif text-2xl sm:text-3xl truncate">Hello, {firstName} 👋</h1>
                  <p className="text-[11.5px] text-[#9C9689] mt-0.5">Welcome back to Glamirk</p>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 border border-[#C9972B]/50 text-[#C9972B] text-[10.5px] font-semibold tracking-[0.16em] uppercase rounded-full hover:bg-[#C9972B] hover:text-[#0B0B0B] transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:items-start">
          {/* Desktop sidebar — a genuine two-pane layout, not a stretched
              mobile list: it sticks alongside the content while it scrolls. */}
          <nav aria-label="Account sections" className="hidden lg:block sticky top-24">
            <div className="bg-white border border-[#E8D5A8] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E8D5A8] bg-[#FAF9F6]">
                <span className="text-[9.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">Account</span>
              </div>
              <ul className="py-2">
                {ACCOUNT_NAV.map((item) => {
                  const Icon = item.icon;
                  const badge = groupBadge(item);

                  if (item.children) {
                    const expanded = openGroups.has(item.id);
                    const inGroup = groupContains(item, section);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => toggleGroup(item.id)}
                          aria-expanded={expanded}
                          aria-controls={`account-group-${item.id}`}
                          className={`w-full text-left px-5 py-2.5 text-[12.5px] flex items-center gap-3 transition-colors cursor-pointer border-l-2 ${
                            inGroup
                              ? 'border-[#C9972B] text-[#121212] font-semibold'
                              : 'border-transparent text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FAF9F6]'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${inGroup ? 'text-[#C9972B]' : ''}`} />
                          <span className="truncate flex-1">{item.label}</span>
                          {badge !== undefined && badge > 0 && (
                            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 bg-[#0B0B0B] text-[#E3B84B] text-[9.5px] font-bold rounded-full flex items-center justify-center">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                          <ChevronDown
                            className={`w-3.5 h-3.5 shrink-0 text-[#9C9689] transition-transform ${
                              expanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {expanded && (
                          <ul id={`account-group-${item.id}`}>
                            {item.children.map((child) => {
                              const ChildIcon = child.icon;
                              const childActive = child.id === section;
                              const childBadge = badges[child.id];
                              return (
                                <li key={child.id}>
                                  <button
                                    onClick={() => handleNavigate(child.id)}
                                    aria-current={childActive ? 'page' : undefined}
                                    className={`w-full text-left pl-12 pr-5 py-2 text-[12px] flex items-center gap-2.5 transition-colors cursor-pointer border-l-2 ${
                                      childActive
                                        ? 'border-[#C9972B] bg-[#FAF9F6] text-[#121212] font-semibold'
                                        : 'border-transparent text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FAF9F6]'
                                    }`}
                                  >
                                    <ChildIcon
                                      className={`w-3.5 h-3.5 shrink-0 ${childActive ? 'text-[#C9972B]' : ''}`}
                                    />
                                    <span className="truncate flex-1">{child.label}</span>
                                    {childBadge !== undefined && childBadge > 0 && (
                                      <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 bg-[#0B0B0B] text-[#E3B84B] text-[9.5px] font-bold rounded-full flex items-center justify-center">
                                        {childBadge > 99 ? '99+' : childBadge}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }

                  const isActive = item.id === section;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleNavigate(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full text-left px-5 py-2.5 text-[12.5px] flex items-center gap-3 transition-colors cursor-pointer border-l-2 ${
                          isActive
                            ? 'border-[#C9972B] bg-[#FAF9F6] text-[#121212] font-semibold'
                            : 'border-transparent text-[#6B6B6B] hover:text-[#121212] hover:bg-[#FAF9F6]'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#C9972B]' : ''}`} />
                        <span className="truncate flex-1">{item.label}</span>
                        {badge !== undefined && badge > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 bg-[#0B0B0B] text-[#E3B84B] text-[9.5px] font-bold rounded-full flex items-center justify-center">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-[#E8D5A8] p-2">
                <button
                  onClick={onLogout}
                  className="w-full text-left px-3 py-2.5 text-[12.5px] text-[#C0392B] flex items-center gap-3 hover:bg-[#FDF3F2] rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </nav>

          {/* Mobile section picker — a dropdown rather than a 13-item list, so
              the content stays above the fold on a phone. */}
          <div className="lg:hidden mb-5 relative" ref={mobileNavRef}>
            <button
              id="account-mobile-section-picker"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-expanded={mobileNavOpen}
              aria-label="Choose an account section"
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-white border border-[#E8D5A8] rounded-xl cursor-pointer"
            >
              <span className="flex items-center gap-3 min-w-0">
                {activeItem && <activeItem.icon className="w-4 h-4 text-[#C9972B] shrink-0" />}
                <span className="text-[13px] font-semibold text-[#121212] truncate">
                  {activeItem?.label || 'Account'}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-[#6B6B6B] shrink-0 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {mobileNavOpen && (
              <motion.ul
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                id="account-mobile-section-list"
                className="absolute z-30 left-0 right-0 mt-2 bg-white border border-[#E8D5A8] rounded-xl shadow-[0_18px_40px_rgba(11,11,11,0.12)] overflow-hidden max-h-[60vh] overflow-y-auto"
              >
                {/* Flattened with a heading per group rather than made
                    collapsible: this list is already inside a dropdown, and
                    nesting a second layer of tapping to reach a shade history
                    would be two taps too many on a phone. */}
                {ACCOUNT_NAV.map((item) => {
                  const rows = item.children || [{ id: item.id, label: item.label, icon: item.icon }];
                  return (
                    <React.Fragment key={item.id}>
                      {item.children && (
                        <li
                          aria-hidden="true"
                          className="px-4 pt-3 pb-1 text-[9.5px] font-semibold tracking-[0.2em] uppercase text-[#9C9689]"
                        >
                          {item.label}
                        </li>
                      )}
                      {rows.map((row) => {
                        const Icon = row.icon;
                        const isActive = row.id === section;
                        const badge = badges[row.id];
                        return (
                          <li key={row.id}>
                            <button
                              onClick={() => handleNavigate(row.id)}
                              aria-current={isActive ? 'page' : undefined}
                              className={`w-full text-left py-3 text-[13px] flex items-center gap-3 transition-colors cursor-pointer ${
                                item.children ? 'pl-7 pr-4' : 'px-4'
                              } ${isActive ? 'bg-[#FAF9F6] text-[#121212] font-semibold' : 'text-[#6B6B6B]'}`}
                            >
                              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#C9972B]' : ''}`} />
                              <span className="flex-1 truncate">{row.label}</span>
                              {badge !== undefined && badge > 0 && (
                                <span className="min-w-[18px] h-[18px] px-1.5 bg-[#0B0B0B] text-[#E3B84B] text-[9.5px] font-bold rounded-full flex items-center justify-center">
                                  {badge > 99 ? '99+' : badge}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
                <li className="border-t border-[#E8D5A8]">
                  <button
                    onClick={onLogout}
                    className="w-full text-left px-4 py-3 text-[13px] text-[#C0392B] flex items-center gap-3 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </li>
              </motion.ul>
            )}
          </div>

          <main className="min-w-0 space-y-6 pb-4">{children}</main>
        </div>
      </div>
    </div>
  );
};
