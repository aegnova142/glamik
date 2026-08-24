import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { customerApiFetch } from '../utils/cmsClient';
import { CartItem, Product, Shade, ServerCartItem, Order, Address } from '../types';
import { useCustomerAuth } from './CustomerAuthContext';

interface MutationResult {
  success: boolean;
  error?: string;
  loginRequired?: boolean;
}

interface CheckoutResult extends MutationResult {
  order?: Order;
  whatsappUrl?: string;
}

interface CheckoutDetails {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  paymentMethod: 'cod';
  couponCode?: string;
}

interface CommerceContextType {
  cartItems: CartItem[];
  cartSubtotal: number;
  wishlist: string[];
  isCommerceLoading: boolean;
  addToCart: (product: Product, shade?: Shade, quantity?: number) => Promise<MutationResult>;
  updateCartItemQuantity: (index: number, quantity: number) => Promise<MutationResult>;
  removeCartItem: (index: number) => Promise<MutationResult>;
  clearCartLocally: () => void;
  toggleWishlist: (productId: string) => Promise<MutationResult>;
  refreshCommerce: () => Promise<void>;
  checkout: (shippingAddress: Address, details: CheckoutDetails) => Promise<CheckoutResult>;
}

const CommerceContext = createContext<CommerceContextType | undefined>(undefined);

function mapServerItem(item: ServerCartItem): CartItem {
  return {
    product: item.product,
    selectedShade: item.selectedShade,
    selectedSize: item.product?.selectedSize,
    quantity: item.quantity,
  };
}

export const CommerceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isCustomerLoggedIn } = useCustomerAuth();
  const [serverCartItems, setServerCartItems] = useState<ServerCartItem[]>([]);
  const [cartSubtotal, setCartSubtotal] = useState(0);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [isCommerceLoading, setIsCommerceLoading] = useState(false);

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

  const refreshCommerce = useCallback(async () => {
    if (!isCustomerLoggedIn) return;
    setIsCommerceLoading(true);
    await Promise.all([refreshCart(), refreshWishlist()]);
    setIsCommerceLoading(false);
  }, [isCustomerLoggedIn, refreshCart, refreshWishlist]);

  useEffect(() => {
    if (isCustomerLoggedIn) {
      refreshCommerce();
    } else {
      setServerCartItems([]);
      setCartSubtotal(0);
      setWishlist([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomerLoggedIn]);

  const addToCart = async (product: Product, shade?: Shade, quantity: number = 1): Promise<MutationResult> => {
    if (!isCustomerLoggedIn) return { success: false, loginRequired: true };
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

  const clearCartLocally = () => {
    setServerCartItems([]);
    setCartSubtotal(0);
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

  const value: CommerceContextType = {
    cartItems: serverCartItems.map(mapServerItem),
    cartSubtotal,
    wishlist,
    isCommerceLoading,
    addToCart,
    updateCartItemQuantity,
    removeCartItem,
    clearCartLocally,
    toggleWishlist,
    refreshCommerce,
    checkout,
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
