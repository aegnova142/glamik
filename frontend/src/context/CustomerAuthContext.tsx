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

  // --- Mobile + OTP sign-in ---
  /** Which OTP channels the server can actually deliver on, so the picker
   * never offers a dead option. */
  fetchOtpChannels: () => Promise<OtpChannelAvailability>;
  /** Asks the server to send a code. Never returns the code itself. */
  requestOtp: (params: {
    phone: string;
    countryCode: string;
    method: OtpDeliveryMethod;
  }) => Promise<OtpRequestOutcome>;
  /** Verifies a code against a server challenge and, on success, signs the
   * customer in. The phone number is NOT sent — the server reads it from the
   * challenge, so the client cannot nominate which account it signs into. */
  verifyOtp: (params: { challengeId: string; code: string; remember?: boolean }) => Promise<OtpVerifyOutcome>;
}

export type OtpDeliveryMethod = 'sms' | 'whatsapp';

export interface OtpChannelAvailability {
  sms: boolean;
  whatsapp: boolean;
  countryCodes: string[];
  otpLength: number;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}

export interface OtpRequestOutcome {
  success: boolean;
  error?: string;
  /** Opaque handle for this sign-in attempt. Sent back to verify; never the
   * code itself, which the client never sees. */
  challengeId?: string;
  /** Masked for display, e.g. "+91 ******3210". */
  maskedPhone?: string;
  /** ISO instant the backend stops accepting the code. The countdown is
   * rendered from this absolute instant, never from a client-side timer
   * started at 60 seconds — which is also what makes it survive a refresh. */
  expiresAt?: string;
  /** ISO instant the resend button unlocks. */
  resendAvailableAt?: string;
  /** Present on a 429 so the UI can show a precise wait. */
  retryAfterSeconds?: number;
  /** True when the number has used all its daily OTP requests. */
  dailyLimitReached?: boolean;
  /** False when the chosen channel has no provider configured at all, so the
   * UI can steer the customer to the other one rather than inviting a retry
   * that cannot succeed. */
  channelAvailable?: boolean;
}

export interface OtpVerifyOutcome {
  success: boolean;
  error?: string;
  /** True when the code is dead and only a fresh one will do — the UI swaps
   * the verify button for "Resend OTP" instead of leaving them retrying. */
  mustResend?: boolean;
  attemptsRemaining?: number;
  /** True when this sign-in created the account. */
  isNewAccount?: boolean;
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

  // ------------------------------------------
  // Mobile + OTP sign-in
  //
  // Thin wrappers over the two endpoints. All the rules that matter — expiry,
  // single use, attempt caps, throttling — are enforced server-side; nothing
  // here is load-bearing for security, and no response ever carries the code.
  // ------------------------------------------

  const fetchOtpChannels = async (): Promise<OtpChannelAvailability> => {
    const res = await customerApiFetch<OtpChannelAvailability>('/api/customer/auth/otp/channels');
    // On a network failure, assume SMS works rather than hiding both options
    // and stranding the customer on a screen with nothing to click. A send
    // that then fails reports a real error.
    return (
      res.data || {
        sms: true,
        whatsapp: false,
        countryCodes: ['+91'],
        otpLength: 6,
        expiresInSeconds: 60,
        resendCooldownSeconds: 60,
      }
    );
  };

  const requestOtp = async (params: {
    phone: string;
    countryCode: string;
    method: OtpDeliveryMethod;
  }): Promise<OtpRequestOutcome> => {
    const res = await customerApiFetch<{
      success: boolean;
      challengeId: string;
      maskedPhone: string;
      expiresAt: string;
      resendAvailableAt: string;
    }>('/api/customer/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    if (res.data?.success) {
      return {
        success: true,
        challengeId: res.data.challengeId,
        maskedPhone: res.data.maskedPhone,
        expiresAt: res.data.expiresAt,
        resendAvailableAt: res.data.resendAvailableAt,
      };
    }
    return {
      success: false,
      error: res.error || "We couldn't send the OTP right now. Please try again.",
      retryAfterSeconds: res.details?.retryAfterSeconds,
      dailyLimitReached: res.details?.dailyLimitReached,
      channelAvailable: res.details?.channelAvailable,
    };
  };

  const verifyOtp = async (params: {
    challengeId: string;
    code: string;
    remember?: boolean;
  }): Promise<OtpVerifyOutcome> => {
    const { remember = true, ...body } = params;
    const res = await customerApiFetch<{
      token: string;
      user: CustomerUser;
      isNewAccount: boolean;
    }>('/api/customer/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (res.data?.token) {
      // Same storage and same session shape as every other sign-in path, so a
      // customer who signed in by OTP is indistinguishable from one who used
      // a password everywhere downstream.
      setCustomerAuth(res.data.token, res.data.user, remember);
      setCustomerUser(res.data.user);
      return { success: true, isNewAccount: res.data.isNewAccount };
    }
    return {
      success: false,
      error: res.error || 'Incorrect OTP. Please try again.',
      mustResend: !!(res.details?.mustResend || res.details?.expired),
      attemptsRemaining: res.details?.attemptsRemaining,
    };
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
        fetchOtpChannels,
        requestOtp,
        verifyOtp,
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
