/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper utility for API interactions with JWT token support
const TOKEN_KEY = 'glamirk_admin_jwt_token';
const USER_KEY = 'glamirk_admin_user';

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminAuth(token: string, user: any) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to store auth token:', err);
  }
}

export function clearAdminAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) {
    console.error('Failed to clear auth token:', err);
  }
}

export function getStoredAdminUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string; status: number }> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const status = res.status;
    if (status === 204) {
      return { status, data: {} as T };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || `Request failed with status ${status}`, status };
    }

    return { data, status };
  } catch (err: any) {
    return { error: err.message || 'Network error occurred', status: 500 };
  }
}

// ---------------------------------------------
// Customer-facing auth (separate JWT from admin)
// ---------------------------------------------
const CUSTOMER_TOKEN_KEY = 'glamirk_customer_jwt_token';
const CUSTOMER_USER_KEY = 'glamirk_customer_user';

export function getCustomerToken(): string | null {
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY) || sessionStorage.getItem(CUSTOMER_TOKEN_KEY);
  } catch {
    return null;
  }
}

// "Remember me" (default true) persists the session across browser restarts
// via localStorage; unchecked, it's kept in sessionStorage and clears when
// the tab/browser closes.
export function setCustomerAuth(token: string, user: any, remember: boolean = true) {
  try {
    if (remember) {
      localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
      localStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user));
      sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
      sessionStorage.removeItem(CUSTOMER_USER_KEY);
    } else {
      sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token);
      sessionStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user));
      localStorage.removeItem(CUSTOMER_TOKEN_KEY);
      localStorage.removeItem(CUSTOMER_USER_KEY);
    }
  } catch (err) {
    console.error('Failed to store customer auth token:', err);
  }
}

export function clearCustomerAuth() {
  try {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_USER_KEY);
    sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
    sessionStorage.removeItem(CUSTOMER_USER_KEY);
  } catch (err) {
    console.error('Failed to clear customer auth token:', err);
  }
}

export function getStoredCustomerUser(): any | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_USER_KEY) || sessionStorage.getItem(CUSTOMER_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function customerApiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string; status: number }> {
  const token = getCustomerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const status = res.status;
    if (status === 204) {
      return { status, data: {} as T };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || `Request failed with status ${status}`, status };
    }

    return { data, status };
  } catch (err: any) {
    return { error: err.message || 'Network error occurred', status: 500 };
  }
}
