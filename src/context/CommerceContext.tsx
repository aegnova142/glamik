import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { customerApiFetch, getCustomerToken } from '../utils/cmsClient';
import { CartItem, Product, Shade, ServerCartItem, Order, Address, Review, ReturnRequest, Coupon, PaymentMethodType, AppNotification } from '../types';
import { useCustomerAuth } from './CustomerAuthContext';
import { getSocket } from '../utils/socket';

interface MutationResult {
  success: boolean;
  error?: string;
  loginRequired?: boolean;
}

interface CheckoutResult extends MutationResult {
  order?: Order;
  whatsappUrl?: string;
}

interface CancelOrderResult extends MutationResult {
  order?: Order;
}

interface SubmitReviewResult extends MutationResult {
  review?: Review;
}

interface SubmitReturnResult extends MutationResult {
  return?: ReturnRequest;
}

interface ValidateCouponResult extends MutationResult {
  coupon?: Coupon;
  discount?: number;
}

interface UpdateAddressResult extends MutationResult {
  addresses?: Address[];
}

interface CheckoutDetails {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  paymentMethod: Exclude<PaymentMethodType, 'online'>;
  couponCode?: string;
  /** Demo-only payment inputs — never a real card number is stored server-side, only the last 4 digits. */
  upiId?: string;
  cardNumber?: string;
  bankName?: string;
  walletProvider?: string;
}

interface CommerceContextType {
  cartItems: CartItem[];
  cartSubtotal: number;
  savedItems: CartItem[];
  wishlist: string[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  isCommerceLoading: boolean;
  addToCart: (product: Product, shade?: Shade, quantity?: number) => Promise<MutationResult>;
  updateCartItemQuantity: (index: number, quantity: number) => Promise<MutationResult>;
  removeCartItem: (index: number) => Promise<MutationResult>;
  saveForLater: (index: number) => Promise<MutationResult>;
  moveToCart: (index: number) => Promise<MutationResult>;
  removeSavedItem: (index: number) => Promise<MutationResult>;
  clearCartLocally: () => void;
  toggleWishlist: (productId: string) => Promise<MutationResult>;
  refreshCommerce: () => Promise<void>;
  checkout: (shippingAddress: Address, details: CheckoutDetails) => Promise<CheckoutResult>;
  cancelOrder: (orderId: string, reason?: string) => Promise<CancelOrderResult>;
  submitReview: (productId: string, rating: number, title: string, comment: string) => Promise<SubmitReviewResult>;
  submitReturnRequest: (orderId: string, productId: string, reason: string, comment?: string) => Promise<SubmitReturnResult>;
  validateCoupon: (couponCode: string, subtotal: number) => Promise<ValidateCouponResult>;
  updateAddress: (addressId: string, address: Omit<Address, 'id'>) => Promise<UpdateAddressResult>;
}

const CommerceContext = createContext<CommerceContextType | undefined>(undefined);

const GUEST_CART_KEY = 'glamirk_guest_cart';

/** Guest cart item shape stored in localStorage — mirrors CartItem but keeps
 * only what's needed to re-render + re-sync to the server on login. */
interface GuestCartItem {
  product: Product;
  selectedShade?: Shade;
  selectedSize?: string;
  quantity: number;
}

function loadGuestCart(): GuestCartItem[] {
  try {
    const saved = localStorage.getItem(GUEST_CART_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveGuestCart(items: GuestCartItem[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

function guestCartSubtotal(items: GuestCartItem[]): number {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
}

function mapServerItem(item: ServerCartItem): CartItem {
  return {
    product: item.product,
    selectedShade: item.selectedShade,
    selectedSize: item.product?.selectedSize,
    quantity: item.quantity,
  };
}

function mapGuestItem(item: GuestCartItem): CartItem {
  return {
    product: item.product,
    selectedShade: item.selectedShade,
    selectedSize: item.selectedSize,
    quantity: item.quantity,
  };
}

export const CommerceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isCustomerLoggedIn, customerUser } = useCustomerAuth();
  const [serverCartItems, setServerCartItems] = useState<ServerCartItem[]>([]);
  const [cartSubtotal, setCartSubtotal] = useState(0);
  const [savedServerItems, setSavedServerItems] = useState<ServerCartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isCommerceLoading, setIsCommerceLoading] = useState(false);

  // Guest (logged-out) cart — lives entirely in localStorage until the visitor signs in.
  const [guestCartItems, setGuestCartItems] = useState<GuestCartItem[]>(() => loadGuestCart());

  useEffect(() => {
    saveGuestCart(guestCartItems);
  }, [guestCartItems]);

  const refreshCart = useCallback(async () => {
    const res = await customerApiFetch<{ items: ServerCartItem[]; subtotal: number }>('/api/customer/cart');
    if (res.data) {
      setServerCartItems(res.data.items || []);
      setCartSubtotal(res.data.subtotal || 0);
    }
  }, []);

  const refreshWishlist = useCallback(async () => {
    const res = await customerApiFetch<{ items: Product[] }>('/api/customer/wishlist');
    if (res.data) {
      setWishlist((res.data.items || []).map((p) => p.id));
    }
  }, []);

  const refreshSavedItems = useCallback(async () => {
    const res = await customerApiFetch<{ items: ServerCartItem[] }>('/api/customer/cart/saved');
    if (res.data) {
      setSavedServerItems(res.data.items || []);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    const res = await customerApiFetch<{ notifications: AppNotification[] }>('/api/customer/notifications');
    if (res.data) {
      setNotifications(res.data.notifications || []);
    }
  }, []);

  const refreshCommerce = useCallback(async () => {
    if (!isCustomerLoggedIn) return;
    setIsCommerceLoading(true);
    await Promise.all([refreshCart(), refreshWishlist(), refreshSavedItems(), refreshNotifications()]);
    setIsCommerceLoading(false);
  }, [isCustomerLoggedIn, refreshCart, refreshWishlist, refreshSavedItems, refreshNotifications]);

  // Merges whatever was sitting in the guest (localStorage) cart into the
  // server cart the moment a visitor signs in, then clears the local copy —
  // so items added before login aren't lost.
  const mergeGuestCartIntoServer = useCallback(async () => {
    const pending = loadGuestCart();
    if (pending.length === 0) return;
    for (const item of pending) {
      await customerApiFetch<{ items: ServerCartItem[]; subtotal: number }>('/api/customer/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: item.product.id, variantId: item.selectedShade?.id, quantity: item.quantity }),
      });
    }
    setGuestCartItems([]);
    saveGuestCart([]);
  }, []);

  useEffect(() => {
    if (isCustomerLoggedIn) {
      (async () => {
        await mergeGuestCartIntoServer();
        await refreshCommerce();
      })();
    } else {
      setServerCartItems([]);
      setCartSubtotal(0);
      setSavedServerItems([]);
      setWishlist([]);
      setNotifications([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomerLoggedIn]);

  // Real-time push over the shared Socket.IO connection. The server joins
  // this socket to a `customer:{id}` room on authenticate, so it only ever
  // receives notifications addressed to this signed-in customer — the id
  // check below is a defensive no-op, not the real filter.
  useEffect(() => {
    if (!isCustomerLoggedIn || !customerUser) return;

    const socket = getSocket();
    const token = getCustomerToken();
    const authenticate = () => {
      if (token) socket.emit('authenticate', { token });
    };
    authenticate();

    const handleEvent = (event: any) => {
      if (event?.type === 'NEW_NOTIFICATION' && event.data?.userId === customerUser.id) {
        const incoming = event.data.notification as AppNotification;
        setNotifications((prev) => (prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]));
      }
    };
    socket.on('event', handleEvent);
    socket.on('connect', authenticate);

    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', authenticate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomerLoggedIn]);

  const addToCart = async (product: Product, shade?: Shade, quantity: number = 1): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) {
      // Guest checkout-free flow: keep the item in localStorage, no login required.
      setGuestCartItems((prev) => {
        const existingIndex = prev.findIndex(
          (item) => item.product.id === product.id && item.selectedShade?.id === shade?.id
        );
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
          };
          return updated;
        }
        return [...prev, { product, selectedShade: shade, selectedSize: product.selectedSize, quantity }];
      });
      return { success: true };
    }
    const res = await customerApiFetch<{ items: ServerCartItem[]; subtotal: number }>('/api/customer/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, variantId: shade?.id, quantity }),
    });
    if (res.data) {
      setServerCartItems(res.data.items || []);
      setCartSubtotal(res.data.subtotal || 0);
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not add this item to your bag.' };
  };

  const updateCartItemQuantity = async (index: number, quantity: number): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) {
      const item = guestCartItems[index];
      if (!item) return { success: false, error: 'Item not found in bag.' };
      setGuestCartItems((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], quantity };
        return updated;
      });
      return { success: true };
    }
    const item = serverCartItems[index];
    if (!item) return { success: false, error: 'Item not found in bag.' };
    const res = await customerApiFetch<{ items: ServerCartItem[]; subtotal: number }>(`/api/customer/cart/items/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
    if (res.data) {
      setServerCartItems(res.data.items || []);
      setCartSubtotal(res.data.subtotal || 0);
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not update quantity.' };
  };

  const removeCartItem = async (index: number): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) {
      const item = guestCartItems[index];
      if (!item) return { success: false, error: 'Item not found in bag.' };
      setGuestCartItems((prev) => prev.filter((_, i) => i !== index));
      return { success: true };
    }
    const item = serverCartItems[index];
    if (!item) return { success: false, error: 'Item not found in bag.' };
    const res = await customerApiFetch<{ items: ServerCartItem[]; subtotal: number }>(`/api/customer/cart/items/${item.id}`, {
      method: 'DELETE',
    });
    if (res.data) {
      setServerCartItems(res.data.items || []);
      setCartSubtotal(res.data.subtotal || 0);
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not remove this item.' };
  };

  const saveForLater = async (index: number): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const item = serverCartItems[index];
    if (!item) return { success: false, error: 'Item not found in bag.' };
    const res = await customerApiFetch<{ items: ServerCartItem[]; subtotal: number; savedItems: ServerCartItem[] }>(
      `/api/customer/cart/items/${item.id}/save`,
      { method: 'POST' }
    );
    if (res.data) {
      setServerCartItems(res.data.items || []);
      setCartSubtotal(res.data.subtotal || 0);
      setSavedServerItems(res.data.savedItems || []);
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not save this item for later.' };
  };

  const moveToCart = async (index: number): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const item = savedServerItems[index];
    if (!item) return { success: false, error: 'Item not found.' };
    const res = await customerApiFetch<{ items: ServerCartItem[]; subtotal: number; savedItems: ServerCartItem[] }>(
      `/api/customer/cart/items/${item.id}/unsave`,
      { method: 'POST' }
    );
    if (res.data) {
      setServerCartItems(res.data.items || []);
      setCartSubtotal(res.data.subtotal || 0);
      setSavedServerItems(res.data.savedItems || []);
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not move this item to your bag.' };
  };

  const removeSavedItem = async (index: number): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const item = savedServerItems[index];
    if (!item) return { success: false, error: 'Item not found.' };
    const res = await customerApiFetch<{ items: ServerCartItem[]; subtotal: number }>(`/api/customer/cart/items/${item.id}`, {
      method: 'DELETE',
    });
    if (res.data) {
      setSavedServerItems((prev) => prev.filter((i) => i.id !== item.id));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not remove this item.' };
  };

  const markNotificationRead = async (id: string): Promise<void> => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await customerApiFetch(`/api/customer/notifications/${id}/read`, { method: 'POST' });
  };

  const markAllNotificationsRead = async (): Promise<void> => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await customerApiFetch('/api/customer/notifications/read-all', { method: 'POST' });
  };

  const clearCartLocally = () => {
    setServerCartItems([]);
    setCartSubtotal(0);
    setGuestCartItems([]);
    saveGuestCart([]);
  };

  const toggleWishlist = async (productId: string): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const res = await customerApiFetch<{ inWishlist: boolean; productId: string }>(`/api/customer/wishlist/toggle/${productId}`, {
      method: 'POST',
    });
    if (res.data) {
      setWishlist((prev) =>
        res.data!.inWishlist ? [...prev.filter((id) => id !== productId), productId] : prev.filter((id) => id !== productId)
      );
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not update your wishlist.' };
  };

  const checkout = async (shippingAddress: Address, details: CheckoutDetails): Promise<CheckoutResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const idempotencyKey = 'checkout-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const res = await customerApiFetch<{ order: Order; whatsappUrl?: string }>('/api/customer/checkout', {
      method: 'POST',
      body: JSON.stringify({ shippingAddress, idempotencyKey, ...details }),
    });
    if (res.data?.order) {
      clearCartLocally();
      return { success: true, order: res.data.order, whatsappUrl: res.data.whatsappUrl };
    }
    return { success: false, error: res.error || 'Checkout failed. Please try again.' };
  };

  const cancelOrder = async (orderId: string, reason?: string): Promise<CancelOrderResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const res = await customerApiFetch<{ order: Order }>(`/api/customer/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (res.data?.order) {
      return { success: true, order: res.data.order };
    }
    return { success: false, error: res.error || 'Could not cancel this order.' };
  };

  const submitReview = async (productId: string, rating: number, title: string, comment: string): Promise<SubmitReviewResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const res = await customerApiFetch<{ review: Review }>('/api/customer/reviews', {
      method: 'POST',
      body: JSON.stringify({ productId, rating, title, comment }),
    });
    if (res.data?.review) {
      return { success: true, review: res.data.review };
    }
    return { success: false, error: res.error || 'Could not submit your review.' };
  };

  const submitReturnRequest = async (
    orderId: string,
    productId: string,
    reason: string,
    comment?: string
  ): Promise<SubmitReturnResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const res = await customerApiFetch<{ return: ReturnRequest }>(`/api/customer/orders/${orderId}/returns`, {
      method: 'POST',
      body: JSON.stringify({ productId, reason, comment }),
    });
    if (res.data?.return) {
      return { success: true, return: res.data.return };
    }
    return { success: false, error: res.error || 'Could not submit your return request.' };
  };

  const validateCoupon = async (couponCode: string, subtotal: number): Promise<ValidateCouponResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const res = await customerApiFetch<{ coupon: Coupon; discount: number }>('/api/customer/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ couponCode, subtotal }),
    });
    if (res.data?.coupon) {
      return { success: true, coupon: res.data.coupon, discount: res.data.discount };
    }
    return { success: false, error: res.error || 'Invalid coupon code.' };
  };

  const updateAddress = async (addressId: string, address: Omit<Address, 'id'>): Promise<UpdateAddressResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
    const res = await customerApiFetch<{ addresses: Address[] }>(`/api/customer/addresses/${addressId}`, {
      method: 'PUT',
      body: JSON.stringify(address),
    });
    if (res.data?.addresses) {
      return { success: true, addresses: res.data.addresses };
    }
    return { success: false, error: res.error || 'Could not update this address.' };
  };

  const value: CommerceContextType = {
    cartItems: isCustomerLoggedIn ? serverCartItems.map(mapServerItem) : guestCartItems.map(mapGuestItem),
    cartSubtotal: isCustomerLoggedIn ? cartSubtotal : guestCartSubtotal(guestCartItems),
    savedItems: savedServerItems.map(mapServerItem),
    wishlist,
    notifications,
    unreadNotificationCount: notifications.filter((n) => !n.isRead).length,
    markNotificationRead,
    markAllNotificationsRead,
    isCommerceLoading,
    addToCart,
    updateCartItemQuantity,
    removeCartItem,
    saveForLater,
    moveToCart,
    removeSavedItem,
    clearCartLocally,
    toggleWishlist,
    refreshCommerce,
    checkout,
    cancelOrder,
    submitReview,
    submitReturnRequest,
    validateCoupon,
    updateAddress,
  };

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
};

export const useCommerce = (): CommerceContextType => {
  const ctx = useContext(CommerceContext);
  if (!ctx) {
    throw new Error('useCommerce must be used within a CommerceProvider');
  }
  return ctx;
};
