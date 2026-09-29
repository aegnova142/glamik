import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  customerApiFetch,
  getCustomerToken,
  setCustomerAuth,
  clearCustomerAuth,
  getStoredCustomerUser,
} from '@glamirk/shared/utils/cmsClient';
import { CustomerUser } from '@glamirk/shared/types';

interface CustomerAuthContextType {
  customerUser: CustomerUser | null;
  isCustomerLoggedIn: boolean;
  customerLoading: boolean;
  /** `identifier` accepts an email address or a registered mobile number. */
  customerLogin: (identifier: string, password: string, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  customerLoginWithGoogle: (accessToken: string, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  customerRegister: (name: string, email: string, password: string, phone?: string) => Promise<{ success: boolean; error?: string }>;
  customerLogout: () => Promise<void>;
  /** Re-reads the signed-in customer from the server — used after a profile
   * edit so the navbar greeting and avatar update without a page reload. */
  refreshCustomerUser: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; resetToken?: string; error?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export const CustomerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [customerUser, setCustomerUser] = useState<CustomerUser | null>(() => getStoredCustomerUser());
  const [customerLoading, setCustomerLoading] = useState(true);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) {
      setCustomerLoading(false);
      return;
    }
    customerApiFetch<{ user: CustomerUser }>('/api/customer/auth/me').then((res) => {
      if (res.data?.user) {
        setCustomerUser(res.data.user);
      } else if (res.status === 401 || res.status === 403) {
        // Token is genuinely invalid/expired — safe to log out.
        clearCustomerAuth();
        setCustomerUser(null);
      }
      // Any other failure (transient DB hiccup, network blip, 5xx) is not
      // proof the session is invalid — keep the locally cached user so a
      // flaky request on a fresh page load doesn't silently sign people out.
      setCustomerLoading(false);
    });
  }, []);

  const refreshCustomerUser = async (): Promise<void> => {
    if (!getCustomerToken()) return;
    const res = await customerApiFetch<{ user: CustomerUser }>('/api/customer/auth/me');
    if (res.data?.user) {
      setCustomerUser(res.data.user);
      // Keep the cached copy in step with the server so a page reload doesn't
      // momentarily show the pre-edit name from storage.
      const remembered = !!localStorage.getItem('glamirk_customer_jwt_token');
      const token = getCustomerToken();
      if (token) setCustomerAuth(token, res.data.user, remembered);
    }
  };

  const customerLogin = async (identifier: string, password: string, remember: boolean = true): Promise<{ success: boolean; error?: string }> => {
    const res = await customerApiFetch<{ token: string; user: CustomerUser }>('/api/customer/auth/login', {
      method: 'POST',
      // `email` is still sent alongside `identifier` so an older server build
      // (which only reads `email`) keeps working during a rolling deploy.
      body: JSON.stringify({ identifier, email: identifier, password }),
    });
    if (res.data?.token) {
      setCustomerAuth(res.data.token, res.data.user, remember);
      setCustomerUser(res.data.user);
      return { success: true };
    }
    return { success: false, error: res.error || 'Invalid email or password.' };
  };

  const customerLoginWithGoogle = async (accessToken: string, remember: boolean = true): Promise<{ success: boolean; error?: string }> => {
    const res = await customerApiFetch<{ token: string; user: CustomerUser }>('/api/customer/auth/google', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    });
    if (res.data?.token) {
      setCustomerAuth(res.data.token, res.data.user, remember);
      setCustomerUser(res.data.user);
      return { success: true };
    }
    return { success: false, error: res.error || 'Google sign-in failed.' };
  };

  const customerRegister = async (
    name: string,
    email: string,
    password: string,
    phone?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const res = await customerApiFetch<{ token: string; user: CustomerUser }>('/api/customer/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, phone }),
    });
    if (res.data?.token) {
      setCustomerAuth(res.data.token, res.data.user);
      setCustomerUser(res.data.user);
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not create your account.' };
  };

  const customerLogout = async (): Promise<void> => {
    // The token is captured before anything is cleared, then local state is
    // dropped immediately so the UI reflects the sign-out on the very next
    // render. Awaiting the server round-trip first (the obvious ordering)
    // leaves the navbar and bottom nav still showing the signed-in customer
    // for as long as the request takes — seconds on a slow connection, and
    // forever if it hangs.
    const token = getCustomerToken();
    clearCustomerAuth();
    setCustomerUser(null);

    // Retiring the session server-side still matters (otherwise the device
    // lingers under "active sessions"), so it's fired afterwards with the
    // captured token — customerApiFetch can no longer read one from storage.
    // Best-effort: a failure here must never block a sign-out the user asked
    // for, and they are already signed out locally regardless.
    if (token) {
      fetch('/api/customer/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; resetToken?: string; error?: string }> => {
    const res = await customerApiFetch<{ success: boolean; resetToken: string }>('/api/customer/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (res.data?.success) {
      return { success: true, resetToken: res.data.resetToken };
    }
    return { success: false, error: res.error || 'Could not process your request.' };
  };

  const resetPassword = async (token: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const res = await customerApiFetch<{ success: boolean; token: string; user: CustomerUser }>('/api/customer/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
    if (res.data?.success) {
      // The server signs the user straight back in on a successful reset —
      // no need to make them retype the password they just set.
      if (res.data.token && res.data.user) {
        setCustomerAuth(res.data.token, res.data.user, true);
        setCustomerUser(res.data.user);
      }
      return { success: true };
    }
    return { success: false, error: res.error || 'Could not reset your password.' };
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customerUser,
        isCustomerLoggedIn: !!customerUser,
        customerLoading,
        customerLogin,
        customerLoginWithGoogle,
        customerRegister,
        customerLogout,
        refreshCustomerUser,
        requestPasswordReset,
        resetPassword,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
};

export const useCustomerAuth = (): CustomerAuthContextType => {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return ctx;
};
