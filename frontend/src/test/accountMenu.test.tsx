/**
 * The header account menu.
 *
 * Two states share one dropdown, and the signed-out one is the interesting
 * half: it offers the same destinations as the signed-in menu rather than a
 * stripped-down version. That is deliberate — the menu does not change shape
 * when you sign in, and picking "My Profile" while logged out carries the
 * destination through authentication instead of dropping it.
 *
 * What is asserted here is the CONTRACT between the menu and App.tsx: which
 * callback fires with which section. The routing that follows — storing the
 * pending route, opening the gate, landing the customer on the section they
 * asked for after sign-in — lives in App.tsx's protected-route guard and is
 * exercised there, not duplicated in this file.
 *
 * No account data is rendered while signed out; if that ever regresses, the
 * last test in the first block fails.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// CMSContext fetches the whole storefront document on mount; the navbar only
// reads two fields from it, so it is stubbed rather than stood up.
vi.mock('@glamirk/shared/context/CMSContext', () => ({
  useCMS: () => ({
    globalSettings: { siteName: 'GLAMIRK', logoUrl: null },
    shopMegaMenu: null,
  }),
}));

// The notification bell in the navbar reads the commerce context, which
// otherwise stands up the whole cart/wishlist/notification stack.
vi.mock('../context/CommerceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/CommerceContext')>();
  return {
    ...actual,
    useCommerce: () => ({
      notifications: [],
      unreadNotificationCount: 0,
      markNotificationRead: () => undefined,
      markAllNotificationsRead: () => undefined,
    }),
  };
});

import { Navbar } from '../components/layout/Navbar';
import { CustomerAuthProvider } from '../context/CustomerAuthContext';

const noop = () => undefined;

function renderNavbar(overrides: Partial<React.ComponentProps<typeof Navbar>> = {}) {
  const onNavigateAccount = vi.fn();
  const onOpenAuth = vi.fn();
  const onCustomerLogout = vi.fn();

  render(
    <CustomerAuthProvider>
      <Navbar
        currentRoute={{ page: 'home' }}
        cartCount={0}
        wishlistCount={0}
        onOpenCart={noop}
        onOpenWishlist={noop}
        onOpenSearch={noop}
        onOpenShadeFinder={noop}
        onOpenTryOn={noop}
        onNavigateAccount={onNavigateAccount}
        onOpenAuth={onOpenAuth}
        onCustomerLogout={onCustomerLogout}
        onNavigateHome={noop}
        onNavigateShop={noop}
        onNavigateShopTheLook={noop}
        onOpenAssistant={noop}
        {...overrides}
      />
    </CustomerAuthProvider>
  );

  return { onNavigateAccount, onOpenAuth, onCustomerLogout };
}

/**
 * Opens the account dropdown and returns the user-event instance.
 *
 * The trigger's accessible name follows the visible one: "Login menu" while
 * signed out, where the button shows that word, and "Account" once signed in,
 * where it shows only an avatar. Matching either keeps this helper usable from
 * both groups. "Login menu" is also what keeps it distinct from the Login
 * button INSIDE the dropdown, which is why the queries below can stay exact.
 */
async function openAccountMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^(login menu|account)$/i }));
  await screen.findByRole('menu');
  return user;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // Signed out: no /auth/me call should be needed, but the provider may probe.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({}), { status: 401 }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('account menu — signed out', () => {
  it('opens the dropdown from the header icon', async () => {
    renderNavbar();
    await openAccountMenu();

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('offers Login, and Sign Up for a new customer', async () => {
    renderNavbar();
    await openAccountMenu();

    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument();
    expect(screen.getByText(/new customer\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign up$/i })).toBeInTheDocument();
  });

  it('offers My Profile alongside the other account links', async () => {
    renderNavbar();
    await openAccountMenu();

    for (const label of ['My Profile', 'Orders', 'Wishlist', 'Coupons & Rewards', 'Help Center']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('Login opens the authentication modal on the sign-in path', async () => {
    const { onOpenAuth } = renderNavbar();
    const user = await openAccountMenu();

    await user.click(screen.getByRole('button', { name: /^login$/i }));
    expect(onOpenAuth).toHaveBeenCalledWith('login');
  });

  it('Sign Up opens the same modal on the registration path', async () => {
    const { onOpenAuth } = renderNavbar();
    const user = await openAccountMenu();

    await user.click(screen.getByRole('button', { name: /^sign up$/i }));
    expect(onOpenAuth).toHaveBeenCalledWith('register');
  });

  it('My Profile routes to the profile section, carrying the destination', async () => {
    const { onNavigateAccount, onOpenAuth } = renderNavbar();
    const user = await openAccountMenu();

    await user.click(screen.getByRole('menuitem', { name: /my profile/i }));

    // Routing, not a sign-in prompt: App.tsx's guard sees the account route,
    // remembers it, and opens the gate. Going straight to the modal from here
    // would lose which section was asked for.
    expect(onNavigateAccount).toHaveBeenCalledWith('profile');
    expect(onOpenAuth).not.toHaveBeenCalled();
  });

  it('closes the dropdown when a link is chosen', async () => {
    renderNavbar();
    const user = await openAccountMenu();

    await user.click(screen.getByRole('menuitem', { name: /my profile/i }));
    // AnimatePresence keeps it mounted for the exit transition.
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('shows no account data and no logout while signed out', async () => {
    renderNavbar();
    await openAccountMenu();

    expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/hello,/i)).not.toBeInTheDocument();
  });
});

describe('account menu — signed in', () => {
  const CUSTOMER = {
    id: 'cust-1',
    name: 'Asha Verma',
    phone: '+91 9876543210',
    phoneVerified: true,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };

  /**
   * Seeds a session AND lets it survive revalidation. The provider re-checks a
   * stored token against /auth/me on mount, so leaving the default 401 stub in
   * place would clear the session before the menu rendered — correct
   * behaviour, wrong fixture.
   */
  function signIn() {
    localStorage.setItem('glamirk_customer_jwt_token', 'jwt.test.token');
    localStorage.setItem('glamirk_customer_user', JSON.stringify(CUSTOMER));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/auth/me')) {
          return new Response(JSON.stringify({ user: CUSTOMER }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );
  }

  it('greets the customer instead of offering sign-in', async () => {
    signIn();
    renderNavbar();
    await openAccountMenu();

    expect(await screen.findByText(/hello, asha/i)).toBeInTheDocument();
    expect(screen.queryByText(/new customer\?/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sign up$/i })).not.toBeInTheDocument();
  });

  it('My Profile goes straight to the profile section', async () => {
    signIn();
    const { onNavigateAccount, onOpenAuth } = renderNavbar();
    const user = await openAccountMenu();

    await user.click(await screen.findByRole('menuitem', { name: /my profile/i }));

    expect(onNavigateAccount).toHaveBeenCalledWith('profile');
    // Already authenticated — nothing should prompt.
    expect(onOpenAuth).not.toHaveBeenCalled();
  });

  it('offers logout', async () => {
    signIn();
    const { onCustomerLogout } = renderNavbar();
    const user = await openAccountMenu();

    await user.click(await screen.findByRole('menuitem', { name: /logout/i }));
    expect(onCustomerLogout).toHaveBeenCalledTimes(1);
  });
});
