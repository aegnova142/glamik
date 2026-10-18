/**
 * The saved-addresses screen.
 *
 * Two behaviours here are worth protecting from a careless edit.
 *
 * DELETE ASKS FIRST. It used to fire on the click, with no undo and no way to
 * tell two similar cards apart afterwards. The confirmation lives inside the
 * card rather than in a native dialog, because window.confirm() cannot say
 * WHICH address is about to go.
 *
 * A FAILED DELETE LEAVES THE CARD. Removing it optimistically and restoring it
 * on error is how a customer ends up believing an address was deleted when the
 * server refused.
 *
 * Ownership, validation and the order-history snapshot are enforced server
 * side and covered by backend/src/test/addresses.db.e2e.ts — not re-asserted
 * here, because this layer cannot enforce them.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AddressesSection } from '../components/account/sections/AddressesSection';
import { CustomerAuthProvider } from '../context/CustomerAuthContext';

const ADDRESS = {
  id: 'addr-1',
  name: 'Asha Verma',
  type: 'Home' as const,
  phone: '9876501234',
  addressLine1: '12 Marine Drive',
  area: 'Churchgate',
  landmark: 'Opposite the pier',
  city: 'Mumbai',
  state: 'Maharashtra',
  pinCode: '400020',
  // Required by the Address type even though the backend treats it as
  // optional — supplied so the fixture typechecks.
  email: '',
  isDefault: true,
};

const SECOND = { ...ADDRESS, id: 'addr-2', name: 'Work desk', type: 'Work' as const, isDefault: false };

function renderSection(over: Partial<React.ComponentProps<typeof AddressesSection>> = {}) {
  const onDeleteAddress = over.onDeleteAddress ?? vi.fn(async () => ({ success: true }));
  const onAddAddress = over.onAddAddress ?? vi.fn(async () => ({ success: true }));
  const onEditAddress = over.onEditAddress ?? vi.fn(async () => ({ success: true }));
  const onSetDefaultAddress = over.onSetDefaultAddress ?? vi.fn();
  const showToast = over.showToast ?? vi.fn();

  render(
    <CustomerAuthProvider>
    <AddressesSection
      addresses={over.addresses ?? [ADDRESS]}
      onAddAddress={onAddAddress as any}
      onEditAddress={onEditAddress as any}
      onDeleteAddress={onDeleteAddress as any}
      onSetDefaultAddress={onSetDefaultAddress as any}
      showToast={showToast as any}
      {...(over as any)}
    />
    </CustomerAuthProvider>
  );
  return { onDeleteAddress, onAddAddress, onEditAddress, onSetDefaultAddress, showToast };
}

/** Opens the three-dot menu on the first card. */
async function openMenu(user: ReturnType<typeof userEvent.setup>, name = ADDRESS.name) {
  await user.click(screen.getByRole('button', { name: new RegExp(`actions for ${name}`, 'i') }));
  return screen.getByRole('menu');
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('address card — the three-dot menu', () => {
  it('hides Edit and Delete until the menu is opened', () => {
    renderSection();
    expect(screen.queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('offers Edit and Delete once opened', async () => {
    const user = userEvent.setup();
    renderSection();
    const menu = await openMenu(user);

    expect(within(menu).getByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  it('Edit loads that address into the form', async () => {
    const user = userEvent.setup();
    renderSection();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /edit/i }));

    // The form opens in edit mode, pre-filled from the chosen card.
    expect(await screen.findByText(/edit address/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(ADDRESS.addressLine1)).toBeInTheDocument();
    expect(screen.getByDisplayValue(ADDRESS.pinCode)).toBeInTheDocument();
  });
});

describe('address card — deleting', () => {
  it('does NOT delete on the first click', async () => {
    const user = userEvent.setup();
    const { onDeleteAddress } = renderSection();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /delete/i }));

    // Confirmation shown, nothing sent.
    expect(await screen.findByText(/delete this address\?/i)).toBeInTheDocument();
    expect(onDeleteAddress).not.toHaveBeenCalled();
  });

  it('names what happens to existing orders', async () => {
    const user = userEvent.setup();
    renderSection();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /delete/i }));

    expect(await screen.findByText(/orders already placed to it keep their own copy/i)).toBeInTheDocument();
  });

  it('deletes only after confirming', async () => {
    const user = userEvent.setup();
    const { onDeleteAddress } = renderSection();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(onDeleteAddress).toHaveBeenCalledWith(ADDRESS.id));
    expect(onDeleteAddress).toHaveBeenCalledTimes(1);
  });

  it('"Keep it" cancels without deleting', async () => {
    const user = userEvent.setup();
    const { onDeleteAddress } = renderSection();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /keep it/i }));

    expect(onDeleteAddress).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(/delete this address\?/i)).not.toBeInTheDocument());
  });

  it('deletes the address the menu was opened on, not the first one', async () => {
    const user = userEvent.setup();
    const { onDeleteAddress } = renderSection({ addresses: [ADDRESS, SECOND] });

    const menu = await openMenu(user, SECOND.name);
    await user.click(within(menu).getByRole('menuitem', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(onDeleteAddress).toHaveBeenCalledWith(SECOND.id));
  });

  it('keeps the card and shows the reason when the server refuses', async () => {
    const user = userEvent.setup();
    const onDeleteAddress = vi.fn(async () => ({ success: false, error: 'Address is in use.' }));
    renderSection({ onDeleteAddress: onDeleteAddress as any });

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /yes, delete/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/address is in use/i);
    // The card is still there — the delete did not happen.
    expect(screen.getByText(ADDRESS.addressLine1)).toBeInTheDocument();
  });

  it('treats a caller that returns nothing as success', async () => {
    // The older prop signature returned void. It must keep working.
    const user = userEvent.setup();
    const onDeleteAddress = vi.fn(async () => undefined);
    renderSection({ onDeleteAddress: onDeleteAddress as any });

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(onDeleteAddress).toHaveBeenCalledWith(ADDRESS.id));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
