/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Plus, Pencil, Trash2, Star, X, Home, Briefcase, Building2, Receipt,
  MoreVertical, AlertTriangle,
} from 'lucide-react';
import { Address, ADDRESS_TYPE_OPTIONS, AddressType } from '@glamirk/shared/types';
import { AccountButton, AccountEmpty, AccountField, AccountFormMessage, AccountSectionHeader, inputClass } from '../AccountUI';
import { useCustomerAuth } from '../../../context/CustomerAuthContext';

interface AddressesSectionProps {
  addresses: Address[];
  onAddAddress: (address: Address) => Promise<{ success: boolean; addressId?: string; error?: string }>;
  onEditAddress: (addressId: string, address: Omit<Address, 'id'>) => Promise<{ success: boolean; error?: string }>;
  /** May report failure so the card is not removed on a false success.
   * Returning nothing is still treated as success, so existing callers
   * keep working unchanged. */
  onDeleteAddress: (
    addressId: string
  ) => Promise<void | { success: boolean; error?: string }> | void;
  onSetDefaultAddress: (addressId: string) => Promise<void> | void;
  showToast: (message: string) => void;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  Home: Home,
  Work: Briefcase,
  Other: Building2,
  Studio: Building2,
};

type AddressForm = Omit<Address, 'id'>;

// Matches the server's validateAddressPayload exactly — if these two ever
// disagree, the user gets a form that accepts input the API then rejects.
function validate(form: AddressForm): string | null {
  if (!form.name.trim()) return 'Please enter the full name for this address.';
  const digits = form.phone.replace(/\D/g, '');
  const significant = digits.length > 10 ? digits.slice(-10) : digits;
  if (significant.length !== 10 || !/^[6-9]/.test(significant)) {
    return 'Please enter a valid 10-digit Indian mobile number.';
  }
  if (!form.addressLine1.trim()) return 'Please enter the address.';
  if (!form.city.trim()) return 'Please enter the city.';
  if (!form.state.trim()) return 'Please enter the state.';
  if (!/^[1-9]\d{5}$/.test(form.pinCode.trim())) return 'Please enter a valid 6-digit PIN code.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Please enter a valid email address.';
  return null;
}

export const AddressesSection: React.FC<AddressesSectionProps> = ({
  addresses,
  onAddAddress,
  onEditAddress,
  onDeleteAddress,
  onSetDefaultAddress,
  showToast,
}) => {
  const { customerUser } = useCustomerAuth();

  const emptyForm = (): AddressForm => ({
    name: customerUser?.name || '',
    type: 'Home',
    phone: customerUser?.phone || '',
    email: customerUser?.email || '',
    addressLine1: '',
    addressLine2: '',
    area: '',
    landmark: '',
    city: '',
    state: '',
    pinCode: '',
    // The very first address saved becomes both defaults, mirroring what the
    // server does — otherwise checkout would have nothing preselected.
    isDefault: addresses.length === 0,
    isBillingDefault: addresses.length === 0,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Which card's three-dot menu is open. */
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  /** Which card is showing "really delete?". */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  const [form, setForm] = useState<AddressForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (address: Address) => {
    const { id, ...rest } = address;
    setForm({ ...rest, email: rest.email || '' });
    setEditingId(id);
    setError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setError(null);
  };

  const set = <K extends keyof AddressForm>(key: K, value: AddressForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    const res = editingId
      ? await onEditAddress(editingId, form)
      : await onAddAddress({ ...form, id: `addr-${Date.now()}` });
    setSaving(false);

    if (!res.success) {
      setError(res.error || 'Could not save this address.');
      return;
    }
    showToast(editingId ? 'Address updated' : 'New address saved');
    closeForm();
  };

  /**
   * Deleting an address is irreversible and the card carries no undo, so it
   * asks first. The confirmation lives inside the card rather than in a
   * window.confirm(): a native dialog cannot say WHICH address is about to
   * go, and these cards look alike.
   */
  const handleDelete = async (address: Address) => {
    setMenuOpenId(null);
    setDeletingId(address.id);
    setDeleteError(null);
    try {
      const res = await onDeleteAddress(address.id);
      // The caller may return nothing (older signature) — absence of an
      // explicit failure is treated as success, which is what it always was.
      if (res && res.success === false) {
        // The card stays put. Removing it optimistically and then restoring
        // it on failure is how a customer ends up believing an address was
        // deleted when it was not.
        setDeleteError({ id: address.id, message: res.error || 'Could not remove this address.' });
        return;
      }
      setConfirmingId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Delivery"
        title="Saved Addresses"
        description="These are the addresses offered at checkout. Your default is selected automatically."
        action={
          !formOpen && (
            <AccountButton onClick={openCreate}>
              <Plus className="w-3.5 h-3.5" />
              Add Address
            </AccountButton>
          )
        }
      />

      <AnimatePresence>
        {formOpen && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="bg-white border border-[#E8D5A8] rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#E8D5A8] flex items-center justify-between">
              <h2 className="font-serif text-lg text-[#121212]">{editingId ? 'Edit address' : 'Add a new address'}</h2>
              <button type="button" onClick={closeForm} aria-label="Close" className="p-1 text-[#6B6B6B] hover:text-[#121212] cursor-pointer">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AccountField label="Full Name" htmlFor="addr-name" required>
                  <input id="addr-name" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
                </AccountField>
                <AccountField label="Mobile Number" htmlFor="addr-phone" required hint="10-digit Indian mobile number">
                  <input
                    id="addr-phone"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    inputMode="tel"
                    className={inputClass}
                    placeholder="9876543210"
                  />
                </AccountField>
              </div>

              <AccountField label="Address Line" htmlFor="addr-line1" required>
                <input
                  id="addr-line1"
                  value={form.addressLine1}
                  onChange={(e) => set('addressLine1', e.target.value)}
                  className={inputClass}
                  placeholder="House / flat number, street"
                />
              </AccountField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AccountField label="Apartment / Building" htmlFor="addr-line2">
                  <input id="addr-line2" value={form.addressLine2 || ''} onChange={(e) => set('addressLine2', e.target.value)} className={inputClass} />
                </AccountField>
                <AccountField label="Area / Locality" htmlFor="addr-area">
                  <input id="addr-area" value={form.area || ''} onChange={(e) => set('area', e.target.value)} className={inputClass} />
                </AccountField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AccountField label="City" htmlFor="addr-city" required>
                  <input id="addr-city" value={form.city} onChange={(e) => set('city', e.target.value)} className={inputClass} />
                </AccountField>
                <AccountField label="State" htmlFor="addr-state" required>
                  <input id="addr-state" value={form.state} onChange={(e) => set('state', e.target.value)} className={inputClass} />
                </AccountField>
                <AccountField label="PIN Code" htmlFor="addr-pin" required>
                  <input
                    id="addr-pin"
                    value={form.pinCode}
                    onChange={(e) => set('pinCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    className={inputClass}
                    placeholder="560001"
                  />
                </AccountField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AccountField label="Landmark" htmlFor="addr-landmark" hint="Optional — helps our courier find you">
                  <input id="addr-landmark" value={form.landmark || ''} onChange={(e) => set('landmark', e.target.value)} className={inputClass} />
                </AccountField>
                <AccountField label="Address Type">
                  <div className="flex gap-2">
                    {ADDRESS_TYPE_OPTIONS.map((type) => {
                      const Icon = TYPE_ICON[type];
                      const active = form.type === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => set('type', type as AddressType)}
                          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-[11px] font-semibold tracking-[0.1em] uppercase transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#0B0B0B] text-white border-[#0B0B0B]'
                              : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:border-[#C9972B]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </AccountField>
              </div>

              {/* Two independent defaults: one address can be both, and most
                  customers will leave them matched. Kept as separate opt-ins
                  rather than a single "default" so a customer who bills to a
                  different address can actually say so. */}
              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.isDefault}
                    onChange={(e) => set('isDefault', e.target.checked)}
                    className="w-4 h-4 accent-[#C9972B] cursor-pointer"
                  />
                  <span className="text-[12.5px] text-[#121212]">Use this as my default delivery address</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.isBillingDefault}
                    onChange={(e) => set('isBillingDefault', e.target.checked)}
                    className="w-4 h-4 accent-[#C9972B] cursor-pointer"
                  />
                  <span className="text-[12.5px] text-[#121212]">Use this as my default billing address</span>
                </label>
              </div>

              <AccountFormMessage tone="error" message={error} />

              <div className="flex flex-wrap gap-3 pt-2">
                <AccountButton type="submit" loading={saving}>
                  {editingId ? 'Save Changes' : 'Save Address'}
                </AccountButton>
                <AccountButton variant="ghost" onClick={closeForm} disabled={saving}>
                  Cancel
                </AccountButton>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {addresses.length === 0 && !formOpen ? (
        <AccountEmpty
          icon={MapPin}
          title="No saved addresses."
          description="Add an address once and it will be ready to select at checkout."
          actionLabel="Add Address"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {addresses.map((address) => {
            const Icon = TYPE_ICON[address.type] || Building2;
            return (
              <article key={address.id} className="bg-white border border-[#E8D5A8] rounded-xl p-5 flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FAF9F6] border border-[#E8D5A8] rounded-full text-[9.5px] font-bold tracking-[0.14em] uppercase text-[#121212]">
                    <Icon className="w-3 h-3 text-[#C9972B]" />
                    {address.type}
                  </span>
                  <span className="flex items-center gap-2.5 shrink-0">
                    {address.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold tracking-[0.14em] uppercase text-[#C9972B]">
                        <Star className="w-3 h-3 fill-[#C9972B]" />
                        Delivery
                      </span>
                    )}
                    {address.isBillingDefault && (
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold tracking-[0.14em] uppercase text-[#6B6B6B]">
                        <Receipt className="w-3 h-3" />
                        Billing
                      </span>
                    )}
                  </span>
                </div>

                <address className="not-italic text-[13px] leading-relaxed flex-1">
                  <p className="font-semibold text-[#121212]">{address.name}</p>
                  <p className="text-[#6B6B6B]">
                    {address.addressLine1}
                    {address.addressLine2 ? `, ${address.addressLine2}` : ''}
                  </p>
                  {address.area && <p className="text-[#6B6B6B]">{address.area}</p>}
                  <p className="text-[#6B6B6B]">
                    {address.city}, {address.state} — {address.pinCode}
                  </p>
                  {address.landmark && <p className="text-[#6B6B6B]">Landmark: {address.landmark}</p>}
                  <p className="text-[#6B6B6B] pt-1.5">{address.phone}</p>
                </address>

                <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-[#F1EBDD]">
                  {!address.isDefault && (
                    <button
                      onClick={() => onSetDefaultAddress(address.id)}
                      className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#C9972B] hover:underline cursor-pointer"
                    >
                      Set as default
                    </button>
                  )}
                  <div className="relative ml-auto">
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpenId === address.id ? null : address.id)}
                      aria-label={`Actions for ${address.name}'s address`}
                      aria-expanded={menuOpenId === address.id}
                      aria-haspopup="menu"
                      className="p-1.5 rounded-full text-[#6B6B6B] hover:text-[#121212] hover:bg-[#F1EBDD] transition-colors cursor-pointer"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpenId === address.id && (
                      <div
                        role="menu"
                        className="absolute right-0 bottom-full mb-1 w-36 bg-white border border-[#E8D5A8] rounded-lg shadow-lg overflow-hidden z-20"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenId(null);
                            openEdit(address);
                          }}
                          className="w-full text-left px-3 py-2 text-[11.5px] text-[#121212] hover:bg-[#FBF7EF] flex items-center gap-2 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenId(null);
                            setDeleteError(null);
                            setConfirmingId(address.id);
                          }}
                          className="w-full text-left px-3 py-2 text-[11.5px] text-[#C0392B] hover:bg-[#FBF7EF] flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Confirmation, in the card it belongs to. */}
                {confirmingId === address.id && (
                  <div className="mt-3 p-3 rounded-lg bg-[#FDF3F2] border border-[#C0392B]/30 space-y-2.5">
                    <p className="text-[11.5px] text-[#121212] flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#C0392B] shrink-0 mt-px" />
                      <span>
                        Delete this address? Orders already placed to it keep their own copy and are
                        not affected.
                      </span>
                    </p>
                    {deleteError?.id === address.id && (
                      <p className="text-[11px] text-[#C0392B]" role="alert">
                        {deleteError.message}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDelete(address)}
                        disabled={deletingId === address.id}
                        className="px-3 py-1.5 rounded-full bg-[#C0392B] text-white text-[10px] font-semibold tracking-[0.1em] uppercase disabled:opacity-50 cursor-pointer"
                      >
                        {deletingId === address.id ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(null);
                          setDeleteError(null);
                        }}
                        disabled={deletingId === address.id}
                        className="px-3 py-1.5 rounded-full border border-[#E8D5A8] text-[10px] font-semibold tracking-[0.1em] uppercase text-[#121212] disabled:opacity-50 cursor-pointer"
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
