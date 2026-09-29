/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLoginModal } from './components/admin/AdminLoginModal';

/**
 * Admin shell.
 *
 * This is the same gate the storefront's App.tsx used to apply at
 * `currentRoute.page === 'admin'` — unchanged behaviour, just lifted into its
 * own app so admin code no longer ships in the shopper bundle.
 *
 * `isAdminAuthenticated` comes from CMSContext and flips as soon as the login
 * succeeds, so the modal needs no success handler of its own to swap in the
 * dashboard.
 */
export default function App() {
  const { isAdminAuthenticated } = useCMS();

  // Leaving the admin means leaving this app entirely, so it's a real
  // navigation rather than a route change — the storefront is a separate
  // bundle served at /.
  const exitToStorefront = () => {
    window.location.href = '/';
  };

  if (!isAdminAuthenticated) {
    return <AdminLoginModal isOpen onClose={exitToStorefront} onSuccess={() => undefined} />;
  }

  return <AdminLayout onExitAdmin={exitToStorefront} />;
}
