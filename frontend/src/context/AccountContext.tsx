/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { customerApiFetch, getCustomerToken, setCustomerAuth } from '@glamirk/shared/utils/cmsClient';
import { useCustomerAuth } from './CustomerAuthContext';
import {
  AccountCoupon,
  AccountOverview,
  CustomerProfile,
  CustomerSession,
  Gender,
  GlamProfile,
  NotificationPreferences,
  OrderTracking,
  PaymentsSummary,
  Product,
  ReviewableProduct,
  ReviewMedia,
  RewardsSummary,
  ShadeHistoryEntry,
  SupportTicket,
  TryOnHistoryEntry,
  TryOnMode,
} from '@glamirk/shared/types';

// ==========================================
// ACCOUNT DATA
//
// Each section of the account owns its own slice, fetched on demand the first
// time that section is opened rather than all at once on sign-in — opening
// "Addresses" shouldn't wait on the rewards ledger. Every slice carries its
// own loading and error state so a single failing endpoint degrades one panel
// instead of blanking the whole account.
// ==========================================

export interface Slice<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** True once a fetch has completed (successfully or not) — distinguishes
   * "no data yet" from "genuinely empty", which is what stops an empty state
   * flashing before the first response lands. */
  loaded: boolean;
}

function emptySlice<T>(): Slice<T> {
  return { data: null, loading: false, error: null, loaded: false };
}

export interface MutationResult {
  success: boolean;
  error?: string;
}

interface AccountContextType {
  overview: Slice<AccountOverview>;
  profile: Slice<CustomerProfile>;
  glamProfile: Slice<GlamProfile | null>;
  shadeHistory: Slice<ShadeHistoryEntry[]>;
  rewards: Slice<RewardsSummary>;
  coupons: Slice<AccountCoupon[]>;
  notificationPreferences: Slice<NotificationPreferences>;
  recentlyViewed: Slice<{ product: Product; viewedAt: string }[]>;
  reviewableProducts: Slice<ReviewableProduct[]>;
  sessions: Slice<CustomerSession[]>;
  supportTickets: Slice<SupportTicket[]>;
  payments: Slice<PaymentsSummary>;
  tryOnHistory: Slice<TryOnHistoryEntry[]>;

  loadOverview: (force?: boolean) => Promise<void>;
  loadProfile: (force?: boolean) => Promise<void>;
  loadGlamProfile: (force?: boolean) => Promise<void>;
  loadShadeHistory: (force?: boolean) => Promise<void>;
  loadRewards: (force?: boolean) => Promise<void>;
  loadCoupons: (force?: boolean) => Promise<void>;
  loadNotificationPreferences: (force?: boolean) => Promise<void>;
  loadRecentlyViewed: (force?: boolean) => Promise<void>;
  loadReviewableProducts: (force?: boolean) => Promise<void>;
  loadSessions: (force?: boolean) => Promise<void>;
  loadSupportTickets: (force?: boolean) => Promise<void>;
  loadPayments: (force?: boolean) => Promise<void>;
  loadTryOnHistory: (force?: boolean) => Promise<void>;

  updateProfile: (input: {
    firstName: string;
    lastName?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: Gender | '';
  }) => Promise<MutationResult>;
  uploadAvatar: (file: File) => Promise<MutationResult>;
  removeAvatar: () => Promise<MutationResult>;
  sendEmailVerification: () => Promise<MutationResult & { emailSent?: boolean; verificationToken?: string }>;
  verifyEmail: (token: string) => Promise<MutationResult>;

  saveGlamProfile: (input: GlamProfile) => Promise<MutationResult>;
  recordShadeResult: (entry: Partial<ShadeHistoryEntry>) => Promise<MutationResult>;
  deleteShadeResult: (id: string) => Promise<MutationResult>;

  saveNotificationPreferences: (prefs: NotificationPreferences) => Promise<MutationResult>;

  trackProductView: (productId: string) => Promise<void>;
  clearRecentlyViewed: () => Promise<MutationResult>;
  removeRecentlyViewed: (productId: string) => Promise<MutationResult>;

  recordTryOn: (input: { productId: string; shadeId?: string; mode: TryOnMode }) => Promise<void>;
  deleteTryOnEntry: (id: string) => Promise<MutationResult>;
  clearTryOnHistory: () => Promise<MutationResult>;

  changePassword: (currentPassword: string, newPassword: string) => Promise<MutationResult>;
  revokeSession: (sessionId: string) => Promise<MutationResult>;
  logoutAllDevices: () => Promise<MutationResult>;
  requestAccountDeletion: (password: string, confirmation: string) => Promise<MutationResult & { scheduledFor?: string }>;
  cancelAccountDeletion: () => Promise<MutationResult>;

  submitSupportTicket: (input: { topic: string; message: string; orderId?: string }) => Promise<MutationResult>;

  fetchOrderTracking: (orderId: string) => Promise<{ tracking?: OrderTracking; error?: string }>;
  openInvoice: (orderId: string, orderNumber: string) => Promise<MutationResult>;

  deleteReview: (reviewId: string) => Promise<MutationResult>;
  /** Uploads one attachment and returns it for the composer to hold until the
   * review itself is submitted. */
  uploadReviewMedia: (file: File) => Promise<MutationResult & { media?: ReviewMedia }>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

const GENERIC_ERROR = 'Something went wrong. Please try again.';

export const AccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isCustomerLoggedIn, customerUser, refreshCustomerUser } = useCustomerAuth();

  const [overview, setOverview] = useState<Slice<AccountOverview>>(emptySlice);
  const [profile, setProfile] = useState<Slice<CustomerProfile>>(emptySlice);
  const [glamProfile, setGlamProfile] = useState<Slice<GlamProfile | null>>(emptySlice);
  const [shadeHistory, setShadeHistory] = useState<Slice<ShadeHistoryEntry[]>>(emptySlice);
  const [rewards, setRewards] = useState<Slice<RewardsSummary>>(emptySlice);
  const [coupons, setCoupons] = useState<Slice<AccountCoupon[]>>(emptySlice);
  const [notificationPreferences, setNotificationPreferences] = useState<Slice<NotificationPreferences>>(emptySlice);
  const [recentlyViewed, setRecentlyViewed] = useState<Slice<{ product: Product; viewedAt: string }[]>>(emptySlice);
  const [reviewableProducts, setReviewableProducts] = useState<Slice<ReviewableProduct[]>>(emptySlice);
  const [sessions, setSessions] = useState<Slice<CustomerSession[]>>(emptySlice);
  const [supportTickets, setSupportTickets] = useState<Slice<SupportTicket[]>>(emptySlice);
  const [payments, setPayments] = useState<Slice<PaymentsSummary>>(emptySlice);
  const [tryOnHistory, setTryOnHistory] = useState<Slice<TryOnHistoryEntry[]>>(emptySlice);

  // Guards against a second fetch firing while the first is still in flight —
  // React 18 StrictMode double-invokes effects in development, and a section
  // can be mounted from both the sidebar and a deep link in the same tick.
  const inFlight = useRef<Set<string>>(new Set());

  const resetAll = useCallback(() => {
    inFlight.current.clear();
    setOverview(emptySlice);
    setProfile(emptySlice);
    setGlamProfile(emptySlice);
    setShadeHistory(emptySlice);
    setRewards(emptySlice);
    setCoupons(emptySlice);
    setNotificationPreferences(emptySlice);
    setRecentlyViewed(emptySlice);
    setReviewableProducts(emptySlice);
    setSessions(emptySlice);
    setSupportTickets(emptySlice);
    setPayments(emptySlice);
    setTryOnHistory(emptySlice);
  }, []);

  // Signing out must drop every cached slice — otherwise the next person to
  // sign in on this device would briefly see the previous account's orders,
  // addresses and points before the new fetches resolved.
  useEffect(() => {
    if (!isCustomerLoggedIn) resetAll();
  }, [isCustomerLoggedIn, resetAll]);

  // Switching accounts without signing out in between (sign in as someone else
  // from the same tab) has to clear just as thoroughly as a sign-out.
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const id = customerUser?.id || null;
    if (previousUserId.current && previousUserId.current !== id) resetAll();
    previousUserId.current = id;
  }, [customerUser?.id, resetAll]);

  /** Shared fetch-into-slice helper: one place that owns the loading flag,
   * the in-flight guard, and error capture. */
  function makeLoader<T>(
    key: string,
    endpoint: string,
    setter: React.Dispatch<React.SetStateAction<Slice<T>>>,
    select: (payload: any) => T
  ) {
    return async (force = false) => {
      if (!getCustomerToken()) return;
      if (inFlight.current.has(key)) return;

      let shouldRun = true;
      setter((prev) => {
        if (prev.loaded && !force) {
          shouldRun = false;
          return prev;
        }
        return { ...prev, loading: true, error: null };
      });
      if (!shouldRun) return;

      inFlight.current.add(key);
      const res = await customerApiFetch<any>(endpoint);
      inFlight.current.delete(key);

      if (res.data) {
        setter({ data: select(res.data), loading: false, error: null, loaded: true });
      } else {
        setter((prev) => ({ ...prev, loading: false, error: res.error || GENERIC_ERROR, loaded: true }));
      }
    };
  }

  const loadOverview = useCallback(
    makeLoader<AccountOverview>('overview', '/api/customer/account/overview', setOverview, (d) => d.overview),
    []
  );
  const loadProfile = useCallback(
    makeLoader<CustomerProfile>('profile', '/api/customer/account/profile', setProfile, (d) => d.profile),
    []
  );
  const loadGlamProfile = useCallback(
    makeLoader<GlamProfile | null>('glam', '/api/customer/account/glam-profile', setGlamProfile, (d) => d.glamProfile),
    []
  );
  const loadShadeHistory = useCallback(
    makeLoader<ShadeHistoryEntry[]>('shade', '/api/customer/account/shade-history', setShadeHistory, (d) => d.history || []),
    []
  );
  const loadRewards = useCallback(
    makeLoader<RewardsSummary>('rewards', '/api/customer/account/rewards', setRewards, (d) => d.rewards),
    []
  );
  const loadCoupons = useCallback(
    makeLoader<AccountCoupon[]>('coupons', '/api/customer/account/coupons', setCoupons, (d) => d.coupons || []),
    []
  );
  const loadNotificationPreferences = useCallback(
    makeLoader<NotificationPreferences>(
      'notif-prefs',
      '/api/customer/account/notification-preferences',
      setNotificationPreferences,
      (d) => d.preferences
    ),
    []
  );
  const loadRecentlyViewed = useCallback(
    makeLoader<{ product: Product; viewedAt: string }[]>(
      'recently-viewed',
      '/api/customer/account/recently-viewed',
      setRecentlyViewed,
      (d) => d.items || []
    ),
    []
  );
  const loadReviewableProducts = useCallback(
    makeLoader<ReviewableProduct[]>('reviewable', '/api/customer/reviews/eligible', setReviewableProducts, (d) => d.products || []),
    []
  );
  const loadSessions = useCallback(
    makeLoader<CustomerSession[]>('sessions', '/api/customer/account/sessions', setSessions, (d) => d.sessions || []),
    []
  );
  const loadSupportTickets = useCallback(
    makeLoader<SupportTicket[]>('tickets', '/api/customer/account/support-tickets', setSupportTickets, (d) => d.tickets || []),
    []
  );
  const loadPayments = useCallback(
    makeLoader<PaymentsSummary>('payments', '/api/customer/account/payments', setPayments, (d) => d.payments),
    []
  );
  const loadTryOnHistory = useCallback(
    makeLoader<TryOnHistoryEntry[]>('try-on', '/api/customer/account/try-on-history', setTryOnHistory, (d) => d.entries || []),
    []
  );

  // ------------------------------------------
  // Profile mutations
  // ------------------------------------------

  const updateProfile = async (input: {
    firstName: string;
    lastName?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: Gender | '';
  }): Promise<MutationResult> => {
    const res = await customerApiFetch<{ profile: CustomerProfile }>('/api/customer/account/profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    if (res.data?.profile) {
      setProfile({ data: res.data.profile, loading: false, error: null, loaded: true });
      // The navbar greeting and bottom-nav label read from the session user,
      // so a name change has to propagate there too, not just into this slice.
      await refreshCustomerUser();
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not save your profile.' };
  };

  const uploadAvatar = async (file: File): Promise<MutationResult> => {
    const token = getCustomerToken();
    if (!token) return { success: false, error: 'Please sign in to continue.' };

    const form = new FormData();
    form.append('file', file);
    try {
      // Deliberately bypasses customerApiFetch: that helper sets a JSON
      // Content-Type, which would stop the browser writing the multipart
      // boundary and the upload would arrive unparseable.
      const res = await fetch('/api/customer/account/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: payload.error || 'Could not upload your photo.' };
      setProfile({ data: payload.profile, loading: false, error: null, loaded: true });
      await refreshCustomerUser();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not upload your photo.' };
    }
  };

  const removeAvatar = async (): Promise<MutationResult> => {
    const res = await customerApiFetch<{ profile: CustomerProfile }>('/api/customer/account/profile/avatar', {
      method: 'DELETE',
    });
    if (res.data?.profile) {
      setProfile({ data: res.data.profile, loading: false, error: null, loaded: true });
      await refreshCustomerUser();
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not remove your photo.' };
  };

  const sendEmailVerification = async () => {
    const res = await customerApiFetch<{ success: boolean; emailSent: boolean; verificationToken?: string }>(
      '/api/customer/account/profile/send-email-verification',
      { method: 'POST' }
    );
    if (res.data?.success) {
      return { success: true, emailSent: res.data.emailSent, verificationToken: res.data.verificationToken };
    }
    return { success: false, error: res.error || 'Could not send the verification email.' };
  };

  const verifyEmail = async (token: string): Promise<MutationResult> => {
    const res = await customerApiFetch<{ profile: CustomerProfile }>('/api/customer/account/profile/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (res.data?.profile) {
      setProfile({ data: res.data.profile, loading: false, error: null, loaded: true });
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not verify your email address.' };
  };

  // ------------------------------------------
  // Glam profile & shade history
  // ------------------------------------------

  const saveGlamProfile = async (input: GlamProfile): Promise<MutationResult> => {
    const res = await customerApiFetch<{ glamProfile: GlamProfile }>('/api/customer/account/glam-profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    if (res.data?.glamProfile) {
      setGlamProfile({ data: res.data.glamProfile, loading: false, error: null, loaded: true });
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not save your Glam profile.' };
  };

  const recordShadeResult = async (entry: Partial<ShadeHistoryEntry>): Promise<MutationResult> => {
    const res = await customerApiFetch<{ entry: ShadeHistoryEntry }>('/api/customer/account/shade-history', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    if (res.data?.entry) {
      const created = res.data.entry;
      setShadeHistory((prev) => ({ ...prev, data: [created, ...(prev.data || [])] }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not save this shade result.' };
  };

  const deleteShadeResult = async (id: string): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean }>(`/api/customer/account/shade-history/${id}`, {
      method: 'DELETE',
    });
    if (res.data?.success) {
      setShadeHistory((prev) => ({ ...prev, data: (prev.data || []).filter((e) => e.id !== id) }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not remove this result.' };
  };

  // ------------------------------------------
  // Notification preferences
  // ------------------------------------------

  const saveNotificationPreferences = async (prefs: NotificationPreferences): Promise<MutationResult> => {
    const res = await customerApiFetch<{ preferences: NotificationPreferences }>(
      '/api/customer/account/notification-preferences',
      { method: 'PUT', body: JSON.stringify({ preferences: prefs }) }
    );
    if (res.data?.preferences) {
      // The server's normalised copy wins, not the optimistic local one — it
      // is the version that forces transactional topics back on.
      setNotificationPreferences({ data: res.data.preferences, loading: false, error: null, loaded: true });
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not save your preferences.' };
  };

  // ------------------------------------------
  // Recently viewed
  // ------------------------------------------

  const trackProductView = async (productId: string): Promise<void> => {
    if (!getCustomerToken()) return;
    await customerApiFetch('/api/customer/account/recently-viewed', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    });
    setRecentlyViewed((prev) => ({ ...prev, loaded: false }));
  };

  const clearRecentlyViewed = async (): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean }>('/api/customer/account/recently-viewed', { method: 'DELETE' });
    if (res.data?.success) {
      setRecentlyViewed({ data: [], loading: false, error: null, loaded: true });
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not clear your browsing history.' };
  };

  const removeRecentlyViewed = async (productId: string): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean }>(
      `/api/customer/account/recently-viewed/${encodeURIComponent(productId)}`,
      { method: 'DELETE' }
    );
    if (res.data?.success) {
      setRecentlyViewed((prev) => ({ ...prev, data: (prev.data || []).filter((i) => i.product.id !== productId) }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not remove this item.' };
  };

  // ------------------------------------------
  // Virtual Try-On history
  // ------------------------------------------

  /** Fire-and-forget, like trackProductView: a failure to record history must
   * never interrupt the try-on the customer is actually using. */
  const recordTryOn = async (input: { productId: string; shadeId?: string; mode: TryOnMode }): Promise<void> => {
    if (!getCustomerToken()) return;
    await customerApiFetch('/api/customer/account/try-on-history', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setTryOnHistory((prev) => ({ ...prev, loaded: false }));
  };

  const deleteTryOnEntry = async (id: string): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean }>(`/api/customer/account/try-on-history/${id}`, {
      method: 'DELETE',
    });
    if (res.data?.success) {
      setTryOnHistory((prev) => ({ ...prev, data: (prev.data || []).filter((e) => e.id !== id) }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not remove this entry.' };
  };

  const clearTryOnHistory = async (): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean }>('/api/customer/account/try-on-history', {
      method: 'DELETE',
    });
    if (res.data?.success) {
      setTryOnHistory({ data: [], loading: false, error: null, loaded: true });
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not clear your try-on history.' };
  };

  // ------------------------------------------
  // Review media
  // ------------------------------------------

  const uploadReviewMedia = async (file: File): Promise<MutationResult & { media?: ReviewMedia }> => {
    const token = getCustomerToken();
    if (!token) return { success: false, error: 'Please sign in to continue.' };

    const form = new FormData();
    form.append('file', file);
    try {
      // Same reason as uploadAvatar: customerApiFetch would set a JSON
      // Content-Type and the multipart boundary would never be written.
      const res = await fetch('/api/customer/account/reviews/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: payload.error || 'Could not upload that file.' };
      return { success: true, media: payload.media };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not upload that file.' };
    }
  };

  // ------------------------------------------
  // Security
  // ------------------------------------------

  const changePassword = async (currentPassword: string, newPassword: string): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean; token: string }>('/api/customer/account/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.data?.success) {
      // The server invalidated every token for this account, including the one
      // this tab is holding — swap in the replacement it issued, or the very
      // next request would 401 the user out of the screen they just used.
      if (res.data.token && customerUser) {
        setCustomerAuth(res.data.token, customerUser, true);
      }
      setSessions((prev) => ({ ...prev, loaded: false }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not change your password.' };
  };

  const revokeSession = async (sessionId: string): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean }>(`/api/customer/account/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (res.data?.success) {
      setSessions((prev) => ({ ...prev, data: (prev.data || []).filter((s) => s.id !== sessionId) }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not sign out that device.' };
  };

  const logoutAllDevices = async (): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean; token: string }>('/api/customer/account/sessions/logout-all', {
      method: 'POST',
    });
    if (res.data?.success) {
      if (res.data.token && customerUser) {
        setCustomerAuth(res.data.token, customerUser, true);
      }
      setSessions((prev) => ({ ...prev, loaded: false }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not sign out your other devices.' };
  };

  const requestAccountDeletion = async (password: string, confirmation: string) => {
    const res = await customerApiFetch<{ success: boolean; scheduledFor: string; profile: CustomerProfile }>(
      '/api/customer/account/delete',
      { method: 'POST', body: JSON.stringify({ password, confirmation }) }
    );
    if (res.data?.success) {
      setProfile({ data: res.data.profile, loading: false, error: null, loaded: true });
      return { success: true, scheduledFor: res.data.scheduledFor };
    }
    return { success: false, error: res.error || 'Could not schedule your account closure.' };
  };

  const cancelAccountDeletion = async (): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean; profile: CustomerProfile }>('/api/customer/account/delete/cancel', {
      method: 'POST',
    });
    if (res.data?.success) {
      setProfile({ data: res.data.profile, loading: false, error: null, loaded: true });
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not cancel the closure request.' };
  };

  // ------------------------------------------
  // Support, tracking, invoices, reviews
  // ------------------------------------------

  const submitSupportTicket = async (input: { topic: string; message: string; orderId?: string }): Promise<MutationResult> => {
    const res = await customerApiFetch<{ ticket: SupportTicket }>('/api/customer/account/support-tickets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (res.data?.ticket) {
      const ticket = res.data.ticket;
      setSupportTickets((prev) => ({ ...prev, data: [ticket, ...(prev.data || [])], loaded: true }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not send your request.' };
  };

  const fetchOrderTracking = async (orderId: string) => {
    const res = await customerApiFetch<{ tracking: OrderTracking }>(`/api/customer/account/orders/${orderId}/tracking`);
    if (res.data?.tracking) return { tracking: res.data.tracking };
    return { error: res.error || 'Could not load tracking for this order.' };
  };

  const openInvoice = async (orderId: string, orderNumber: string): Promise<MutationResult> => {
    const token = getCustomerToken();
    if (!token) return { success: false, error: 'Please sign in to continue.' };
    try {
      // Fetched with the auth header and opened as a blob rather than linked
      // directly, because a plain <a href> navigation can't carry the bearer
      // token — and the endpoint must stay authenticated.
      const res = await fetch(`/api/customer/account/orders/${orderId}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return { success: false, error: payload.error || 'Could not generate this invoice.' };
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        // Pop-up blocked — fall back to a direct download so the customer
        // still ends up with the invoice.
        const link = document.createElement('a');
        link.href = url;
        link.download = `glamirk-invoice-${orderNumber}.html`;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not generate this invoice.' };
    }
  };

  const deleteReview = async (reviewId: string): Promise<MutationResult> => {
    const res = await customerApiFetch<{ success: boolean }>(`/api/customer/reviews/${reviewId}`, { method: 'DELETE' });
    if (res.data?.success) {
      setReviewableProducts((prev) => ({ ...prev, loaded: false }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not delete this review.' };
  };

  const value: AccountContextType = {
    overview,
    profile,
    glamProfile,
    shadeHistory,
    rewards,
    coupons,
    notificationPreferences,
    recentlyViewed,
    reviewableProducts,
    sessions,
    supportTickets,
    payments,
    tryOnHistory,
    loadOverview,
    loadProfile,
    loadGlamProfile,
    loadShadeHistory,
    loadRewards,
    loadCoupons,
    loadNotificationPreferences,
    loadRecentlyViewed,
    loadReviewableProducts,
    loadSessions,
    loadSupportTickets,
    loadPayments,
    loadTryOnHistory,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    sendEmailVerification,
    verifyEmail,
    saveGlamProfile,
    recordShadeResult,
    deleteShadeResult,
    saveNotificationPreferences,
    trackProductView,
    clearRecentlyViewed,
    removeRecentlyViewed,
    recordTryOn,
    deleteTryOnEntry,
    clearTryOnHistory,
    changePassword,
    revokeSession,
    logoutAllDevices,
    requestAccountDeletion,
    cancelAccountDeletion,
    submitSupportTicket,
    fetchOrderTracking,
    openInvoice,
    deleteReview,
    uploadReviewMedia,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};

export const useAccount = (): AccountContextType => {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return ctx;
};
