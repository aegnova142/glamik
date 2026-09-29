/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Monitor,
  LogOut,
  ShieldAlert,
  User,
  Bell,
  MapPin,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { AccountSection } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import {
  AccountButton,
  AccountCard,
  AccountField,
  AccountFormMessage,
  AccountLoading,
  AccountSectionHeader,
  formatDateTime,
  inputClass,
} from '../AccountUI';

interface SettingsSectionProps {
  onNavigateSection: (section: AccountSection) => void;
  onLogout: () => void;
  onOpenLegal: (policy: 'privacy' | 'terms') => void;
  showToast: (message: string) => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  onNavigateSection,
  onLogout,
  onOpenLegal,
  showToast,
}) => {
  const {
    profile,
    loadProfile,
    sessions,
    loadSessions,
    changePassword,
    revokeSession,
    logoutAllDevices,
    requestAccountDeletion,
    cancelAccountDeletion,
  } = useAccount();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [logoutAllBusy, setLogoutAllBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    loadSessions();
  }, [loadProfile, loadSessions]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }

    setPasswordBusy(true);
    const res = await changePassword(currentPassword, newPassword);
    setPasswordBusy(false);

    if (!res.success) {
      setPasswordError(res.error || 'Could not change your password.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess('Password changed. Every other device has been signed out.');
    showToast('Password changed');
    loadSessions(true);
  };

  const handleLogoutAll = async () => {
    setLogoutAllBusy(true);
    const res = await logoutAllDevices();
    setLogoutAllBusy(false);
    showToast(res.success ? 'All other devices have been signed out.' : res.error || 'Could not sign out your other devices.');
    if (res.success) loadSessions(true);
  };

  const handleRevoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    const res = await revokeSession(sessionId);
    setRevokingId(null);
    if (!res.success) showToast(res.error || 'Could not remove that device.');
  };

  const handleRequestDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    setDeleteBusy(true);
    const res = await requestAccountDeletion(deletePassword, deleteConfirmation);
    setDeleteBusy(false);

    if (!res.success) {
      setDeleteError(res.error || 'Could not schedule your account closure.');
      return;
    }
    setDeleteOpen(false);
    setDeletePassword('');
    setDeleteConfirmation('');
    showToast('Account closure scheduled.');
  };

  const handleCancelDeletion = async () => {
    const res = await cancelAccountDeletion();
    showToast(res.success ? 'Account closure cancelled.' : res.error || 'Could not cancel the closure.');
  };

  const shortcuts: { id: AccountSection; label: string; description: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', description: 'Name, mobile number and date of birth', icon: User },
    { id: 'notifications', label: 'Notification Settings', description: 'What we contact you about, and how', icon: Bell },
    { id: 'addresses', label: 'Saved Addresses', description: 'Where your orders are delivered', icon: MapPin },
    { id: 'glam-profile', label: 'Account Preferences', description: 'Your Glam profile and shade preferences', icon: ShieldCheck },
  ];

  const deletionRequested = profile.data?.deletionRequestedAt;

  return (
    <div className="space-y-6">
      <AccountSectionHeader kicker="Security" title="Account Settings" description="Manage your sign-in, devices and privacy." />

      {/* Pending closure banner */}
      {deletionRequested && (
        <div className="bg-[#FDF3F2] border border-[#C0392B]/30 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-3 min-w-0">
            <AlertTriangle className="w-5 h-5 text-[#C0392B] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-[13.5px] font-semibold text-[#C0392B]">Your account is scheduled to close</h3>
              <p className="text-[11.5px] text-[#6B6B6B] mt-0.5 leading-relaxed">
                Requested on {formatDateTime(deletionRequested)}. Your account stays fully usable until the grace period
                ends — you can cancel any time before then.
              </p>
            </div>
          </div>
          <AccountButton variant="secondary" onClick={handleCancelDeletion}>
            Keep My Account
          </AccountButton>
        </div>
      )}

      {/* Shortcuts */}
      <AccountCard className="overflow-hidden">
        <ul className="divide-y divide-[#F1EBDD]">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigateSection(item.id)}
                  className="w-full px-5 py-4 flex items-center gap-3.5 text-left hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                >
                  <Icon className="w-4 h-4 text-[#C9972B] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] text-[#121212] block">{item.label}</span>
                    <span className="text-[11px] text-[#6B6B6B]">{item.description}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#D6CEBC] shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </AccountCard>

      {/* Password */}
      <AccountCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8D5A8] flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-[#C9972B]" />
          <h2 className="font-serif text-lg text-[#121212]">Change Password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="p-5 space-y-4">
          <AccountField label="Current Password" htmlFor="current-password" required className="sm:max-w-sm">
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </AccountField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AccountField label="New Password" htmlFor="new-password" required hint="At least 8 characters">
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </AccountField>
            <AccountField label="Confirm New Password" htmlFor="confirm-password" required>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </AccountField>
          </div>

          <p className="text-[11px] text-[#6B6B6B]">
            Changing your password signs you out everywhere else — this device stays signed in.
          </p>

          <AccountFormMessage tone="error" message={passwordError} />
          <AccountFormMessage tone="success" message={passwordSuccess} />

          <AccountButton type="submit" loading={passwordBusy} disabled={!currentPassword || !newPassword}>
            Update Password
          </AccountButton>
        </form>
      </AccountCard>

      {/* Devices */}
      <AccountCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8D5A8] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-4 h-4 text-[#C9972B]" />
            <h2 className="font-serif text-lg text-[#121212]">Active Sessions</h2>
          </div>
          <AccountButton variant="ghost" loading={logoutAllBusy} onClick={handleLogoutAll}>
            <LogOut className="w-3.5 h-3.5" />
            Log out of all devices
          </AccountButton>
        </div>

        {sessions.loading && !sessions.loaded ? (
          <div className="p-5">
            <AccountLoading label="Loading your devices" rows={1} />
          </div>
        ) : (sessions.data || []).length === 0 ? (
          <div className="p-5">
            <p className="text-xs text-[#6B6B6B]">No other devices are signed in to this account.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F1EBDD]">
            {(sessions.data || []).map((session) => (
              <li key={session.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] text-[#121212]">{session.userAgent || 'Unknown device'}</span>
                    {session.isCurrent && (
                      <span className="px-2 py-0.5 bg-[#F3F8F3] border border-[#2E7D32]/25 rounded-full text-[9px] font-bold tracking-[0.12em] uppercase text-[#2E7D32]">
                        This device
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#6B6B6B]">
                    Last active {formatDateTime(session.lastSeenAt)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                  </span>
                </div>
                {session.isCurrent ? (
                  <AccountButton variant="ghost" onClick={onLogout}>
                    Log out
                  </AccountButton>
                ) : (
                  <AccountButton variant="ghost" loading={revokingId === session.id} onClick={() => handleRevoke(session.id)}>
                    Remove
                  </AccountButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </AccountCard>

      {/* Privacy */}
      <AccountCard className="p-5 space-y-3">
        <h2 className="font-serif text-lg text-[#121212]">Privacy</h2>
        <p className="text-[12px] text-[#6B6B6B] leading-relaxed">
          We keep your orders, addresses and preferences to run your account and deliver what you buy. You control every
          marketing message from Notification Preferences.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <AccountButton variant="ghost" onClick={() => onOpenLegal('privacy')}>
            Privacy Policy
          </AccountButton>
          <AccountButton variant="ghost" onClick={() => onOpenLegal('terms')}>
            Terms of Service
          </AccountButton>
        </div>
      </AccountCard>

      {/* Danger zone */}
      <AccountCard className="border-[#C0392B]/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#C0392B]/20 bg-[#FDF3F2] flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-[#C0392B]" />
          <h2 className="font-serif text-lg text-[#C0392B]">Close Account</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-[12px] text-[#6B6B6B] leading-relaxed space-y-2">
            <p>Closing your account is scheduled rather than instant, so an accidental request can be undone. Before it takes effect you can cancel from this page.</p>
            <p className="text-[#121212] font-medium">Once the closure completes:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You will no longer be able to sign in.</li>
              <li>Your saved addresses, wishlist, Glam profile and reward points are removed.</li>
              <li>Your cart is emptied and any unused coupons become unavailable to you.</li>
              <li>Past orders and invoices are retained as legally required accounting records.</li>
            </ul>
          </div>

          {!deleteOpen ? (
            <AccountButton variant="danger" disabled={!!deletionRequested} onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-3.5 h-3.5" />
              {deletionRequested ? 'Closure already scheduled' : 'Delete My Account'}
            </AccountButton>
          ) : (
            <form onSubmit={handleRequestDeletion} className="space-y-4 pt-2 border-t border-[#F1EBDD]">
              <AccountField label="Confirm your password" htmlFor="delete-password" required className="sm:max-w-sm">
                <input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className={inputClass}
                />
              </AccountField>
              <AccountField
                label="Type DELETE to confirm"
                htmlFor="delete-confirm"
                required
                className="sm:max-w-sm"
                hint="This is deliberately awkward — it should never happen by accident."
              >
                <input
                  id="delete-confirm"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  className={inputClass}
                  placeholder="DELETE"
                />
              </AccountField>

              <AccountFormMessage tone="error" message={deleteError} />

              <div className="flex flex-wrap gap-3">
                <AccountButton
                  type="submit"
                  variant="danger"
                  loading={deleteBusy}
                  disabled={deleteConfirmation.trim().toUpperCase() !== 'DELETE' || !deletePassword}
                >
                  Schedule Account Closure
                </AccountButton>
                <AccountButton
                  variant="ghost"
                  disabled={deleteBusy}
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </AccountButton>
              </div>
            </form>
          )}
        </div>
      </AccountCard>

      <AccountButton variant="secondary" fullWidth onClick={onLogout} className="sm:hidden">
        <LogOut className="w-3.5 h-3.5" />
        Logout
      </AccountButton>
    </div>
  );
};
