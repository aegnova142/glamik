/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { AccountSection, Address, Order, Product, Review, ReviewMedia, Shade } from '@glamirk/shared/types';
import { useAccount } from '../../context/AccountContext';
import { useCommerce } from '../../context/CommerceContext';
import { AccountLayout } from './AccountLayout';
import { OverviewSection } from './sections/OverviewSection';
import { OrdersSection } from './sections/OrdersSection';
import { OrderDetailSection } from './sections/OrderDetailSection';
import { OrderTrackSection } from './sections/OrderTrackSection';
import { WishlistSection } from './sections/WishlistSection';
import { AddressesSection } from './sections/AddressesSection';
import { ProfileSection } from './sections/ProfileSection';
import { GlamProfileSection } from './sections/GlamProfileSection';
import { ShadeHistorySection } from './sections/ShadeHistorySection';
import { TryOnHistorySection } from './sections/TryOnHistorySection';
import { PaymentsSection } from './sections/PaymentsSection';
import { RewardsSection } from './sections/RewardsSection';
import { ReviewsSection } from './sections/ReviewsSection';
import { RecentlyViewedSection } from './sections/RecentlyViewedSection';
import { HelpSection } from './sections/HelpSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { SettingsSection } from './sections/SettingsSection';

export interface AccountPageProps {
  section: AccountSection;
  orderId?: string;
  track?: boolean;

  orders: Order[];
  isOrdersLoading: boolean;
  savedAddresses: Address[];
  reviews: Review[];
  allProducts: Product[];
  wishlist: string[];

  onNavigateSection: (section: AccountSection) => void;
  onOpenOrder: (orderId: string) => void;
  onTrackOrder: (orderId: string) => void;
  onLogout: () => void;
  onExploreShop: () => void;
  onSelectProduct: (product: Product) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onToggleWishlist: (productId: string) => void;
  onOpenTryOn: (product: Product, shade?: Shade) => void;
  onOpenShadeFinder: () => void;
  onOpenSupportCenter: () => void;
  onOpenLegal: (policy: 'privacy' | 'terms') => void;

  onAddAddress: (address: Address) => Promise<{ success: boolean; addressId?: string; error?: string }>;
  onEditAddress: (addressId: string, address: Omit<Address, 'id'>) => Promise<{ success: boolean; error?: string }>;
  onDeleteAddress: (addressId: string) => Promise<void> | void;
  onSetDefaultAddress: (addressId: string) => Promise<void> | void;

  onCancelOrder: (orderId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onSubmitReview: (
    productId: string,
    rating: number,
    title: string,
    comment: string,
    media?: ReviewMedia[]
  ) => Promise<{ success: boolean; error?: string }>;
  onSubmitReturn: (orderId: string, productId: string, reason: string, comment?: string) => Promise<{ success: boolean; error?: string }>;

  showToast: (message: string) => void;
}

export const AccountPage: React.FC<AccountPageProps> = (props) => {
  const { section, orderId, track } = props;
  const { overview, loadOverview } = useAccount();
  const { unreadNotificationCount } = useCommerce();

  // The sidebar badges read from the same overview endpoint the dashboard
  // uses, so a count is never computed twice from two different sources.
  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // "Get Help" on an order deep-links into the Help section with that order
  // pre-selected. Held here (not in the URL) because it's a form default, not
  // a distinct page worth its own address.
  const [helpOrderId, setHelpOrderId] = React.useState<string | undefined>(undefined);

  // A confirmation link lands on /account/profile?verifyEmail=<token>.
  const [verifyEmailToken, setVerifyEmailToken] = React.useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('verifyEmail') || undefined;
  });

  const openHelpForOrder = (id: string) => {
    setHelpOrderId(id);
    props.onNavigateSection('help');
  };

  const order = orderId ? props.orders.find((o) => o.id === orderId) : undefined;

  const badges: Partial<Record<AccountSection, number>> = {
    orders: overview.data?.activeOrders,
    wishlist: overview.data?.wishlistCount,
    rewards: overview.data?.availableCoupons,
    reviews: overview.data?.pendingReviews,
    notifications: unreadNotificationCount,
    payments: overview.data?.pendingRefunds,
    help: overview.data?.openSupportTickets,
  };

  // Nested order screens keep "My Orders" highlighted in the sidebar and swap
  // the greeting banner for a back link.
  const nestedTitle =
    orderId && section === 'orders'
      ? track
        ? `Track Order${order ? ` #${order.orderNumber}` : ''}`
        : `Order${order ? ` #${order.orderNumber}` : ' Details'}`
      : undefined;

  const renderSection = () => {
    if (section === 'orders' && orderId) {
      return track ? (
        <OrderTrackSection
          order={order}
          orderId={orderId}
          isOrdersLoading={props.isOrdersLoading}
          onBackToOrders={() => props.onNavigateSection('orders')}
          onOpenOrder={props.onOpenOrder}
          onOpenHelp={openHelpForOrder}
        />
      ) : (
        <OrderDetailSection
          order={order}
          isLoading={props.isOrdersLoading}
          allProducts={props.allProducts}
          onTrackOrder={props.onTrackOrder}
          onBackToOrders={() => props.onNavigateSection('orders')}
          onOpenHelp={openHelpForOrder}
          onAddToBag={props.onAddToBag}
          onCancelOrder={props.onCancelOrder}
          onSubmitReturn={props.onSubmitReturn}
          showToast={props.showToast}
        />
      );
    }

    switch (section) {
      case 'orders':
        return (
          <OrdersSection
            orders={props.orders}
            isLoading={props.isOrdersLoading}
            allProducts={props.allProducts}
            onOpenOrder={props.onOpenOrder}
            onTrackOrder={props.onTrackOrder}
            onExploreShop={props.onExploreShop}
            onOpenHelp={openHelpForOrder}
            onAddToBag={props.onAddToBag}
            onCancelOrder={props.onCancelOrder}
            onSubmitReturn={props.onSubmitReturn}
            onSubmitReview={props.onSubmitReview}
            showToast={props.showToast}
          />
        );

      case 'wishlist':
        return (
          <WishlistSection
            wishlist={props.wishlist}
            allProducts={props.allProducts}
            onSelectProduct={props.onSelectProduct}
            onAddToBag={props.onAddToBag}
            onToggleWishlist={props.onToggleWishlist}
            onExploreShop={props.onExploreShop}
            showToast={props.showToast}
          />
        );

      case 'rewards':
        return <RewardsSection onExploreShop={props.onExploreShop} showToast={props.showToast} />;

      case 'addresses':
        return (
          <AddressesSection
            addresses={props.savedAddresses}
            onAddAddress={props.onAddAddress}
            onEditAddress={props.onEditAddress}
            onDeleteAddress={props.onDeleteAddress}
            onSetDefaultAddress={props.onSetDefaultAddress}
            showToast={props.showToast}
          />
        );

      case 'profile':
        return (
          <ProfileSection
            showToast={props.showToast}
            verifyEmailToken={verifyEmailToken}
            onVerifyTokenConsumed={() => {
              setVerifyEmailToken(undefined);
              // Strip the token from the address bar so a refresh doesn't
              // retry an already-spent (and now invalid) verification.
              if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search);
                params.delete('verifyEmail');
                const qs = params.toString();
                window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
              }
            }}
          />
        );

      case 'glam-profile':
        return <GlamProfileSection onOpenShadeFinder={props.onOpenShadeFinder} showToast={props.showToast} />;

      case 'shade-history':
        return (
          <ShadeHistorySection
            allProducts={props.allProducts}
            onOpenShadeFinder={props.onOpenShadeFinder}
            onSelectProduct={props.onSelectProduct}
            onOpenTryOn={props.onOpenTryOn}
            onAddToBag={props.onAddToBag}
            showToast={props.showToast}
          />
        );

      case 'try-on-history':
        return (
          <TryOnHistorySection
            allProducts={props.allProducts}
            onOpenTryOn={props.onOpenTryOn}
            onSelectProduct={props.onSelectProduct}
            onAddToBag={props.onAddToBag}
            showToast={props.showToast}
          />
        );

      case 'payments':
        return <PaymentsSection onOpenOrder={props.onOpenOrder} onExploreShop={props.onExploreShop} />;

      case 'reviews':
        return (
          <ReviewsSection
            onExploreShop={props.onExploreShop}
            onSubmitReview={props.onSubmitReview}
            showToast={props.showToast}
          />
        );

      case 'recently-viewed':
        return (
          <RecentlyViewedSection
            wishlist={props.wishlist}
            onSelectProduct={props.onSelectProduct}
            onAddToBag={props.onAddToBag}
            onToggleWishlist={props.onToggleWishlist}
            onExploreShop={props.onExploreShop}
            showToast={props.showToast}
          />
        );

      case 'help':
        return (
          <HelpSection
            orders={props.orders}
            initialOrderId={helpOrderId}
            onOpenSupportCenter={props.onOpenSupportCenter}
            showToast={props.showToast}
          />
        );

      case 'notifications':
        return <NotificationsSection showToast={props.showToast} />;

      case 'settings':
        return (
          <SettingsSection
            onNavigateSection={props.onNavigateSection}
            onLogout={props.onLogout}
            onOpenLegal={props.onOpenLegal}
            showToast={props.showToast}
          />
        );

      case 'overview':
      default:
        return (
          <OverviewSection
            orders={props.orders}
            onNavigateSection={props.onNavigateSection}
            onOpenOrder={props.onOpenOrder}
            onExploreShop={props.onExploreShop}
            onLogout={props.onLogout}
          />
        );
    }
  };

  return (
    <AccountLayout
      section={section}
      nestedTitle={nestedTitle}
      onBack={nestedTitle ? () => props.onNavigateSection('orders') : undefined}
      onNavigate={props.onNavigateSection}
      onLogout={props.onLogout}
      badges={badges}
    >
      {renderSection()}
    </AccountLayout>
  );
};
