import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  customerApiFetch,
  getCustomerToken,
  setCustomerAuth,
  clearCustomerAuth,
  getStoredCustomerUser,
} from '../utils/cmsClient';
import { CustomerUser } from '../types';

interface CustomerAuthContextType {
  customerUser: CustomerUser | null;
  isCustomerLoggedIn: boolean;
  customerLoading: boolean;
  customerLogin: (email: string, password: string, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  customerLoginWithGoogle: (accessToken: string, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  customerRegister: (name: string, email: string, password: string, phone?: string) => Promise<{ success: boolean; error?: string }>;
  customerLogout: () => void;
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
      } else {
        clearCustomerAuth();
        setCustomerUser(null);
      }
      setCustomerLoading(false);
    });
  }, []);

  const customerLogin = async (email: string, password: string, remember: boolean = true): Promise<{ success: boolean; error?: string }> => {
    const res = await customerApiFetch<{ token: string; user: CustomerUser }>('/api/customer/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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

  const customerLogout = () => {
    clearCustomerAuth();
    setCustomerUser(null);
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
