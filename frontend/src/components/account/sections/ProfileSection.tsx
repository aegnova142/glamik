/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, BadgeCheck, AlertTriangle, Mail, Phone } from 'lucide-react';
import { useAccount } from '../../../context/AccountContext';
import {
  AccountButton,
  AccountCard,
  AccountError,
  AccountField,
  AccountFormMessage,
  AccountLoading,
  AccountSectionHeader,
  formatDate,
  inputClass,
} from '../AccountUI';

interface ProfileSectionProps {
  showToast: (message: string) => void;
  /** Present when the customer arrived from a "confirm your email" link. */
  verifyEmailToken?: string;
  onVerifyTokenConsumed?: () => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ showToast, verifyEmailToken, onVerifyTokenConsumed }) => {
  const { profile, loadProfile, updateProfile, uploadAvatar, removeAvatar, sendEmailVerification, verifyEmail } = useAccount();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);
  const [phoneVerifyNotice, setPhoneVerifyNotice] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Seed the form from the server copy once, then leave it alone — refilling
  // on every profile refresh would wipe out whatever the user is mid-way
  // through typing.
  useEffect(() => {
    if (!profile.data || dirty) return;
    setFirstName(profile.data.firstName || profile.data.name?.split(' ')[0] || '');
    setLastName(profile.data.lastName || profile.data.name?.split(' ').slice(1).join(' ') || '');
    setPhone(profile.data.phone || '');
    setDateOfBirth(profile.data.dateOfBirth || '');
  }, [profile.data, dirty]);

  // A verification link lands on /account/profile?verifyEmail=<token>.
  useEffect(() => {
    if (!verifyEmailToken) return;
    (async () => {
      const res = await verifyEmail(verifyEmailToken);
      if (res.success) showToast('Your email address has been confirmed.');
      else setVerifyNotice(res.error || 'Could not verify your email address.');
      onVerifyTokenConsumed?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEmailToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, '');
      const significant = digits.length > 10 ? digits.slice(-10) : digits;
      if (significant.length !== 10 || !/^[6-9]/.test(significant)) {
        setError('Please enter a valid 10-digit Indian mobile number.');
        return;
      }
    }

    setSaving(true);
    const res = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      dateOfBirth: dateOfBirth || undefined,
    });
    setSaving(false);

    if (!res.success) {
      setError(res.error || 'Could not save your profile.');
      return;
    }
    setDirty(false);
    setSuccess('Your profile has been updated.');
    showToast('Profile updated');
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the same file still fires a change event.
    e.target.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Please choose an image under 5 MB.');
      return;
    }
    setAvatarBusy(true);
    setError(null);
    const res = await uploadAvatar(file);
    setAvatarBusy(false);
    if (res.success) showToast('Profile photo updated');
    else setError(res.error || 'Could not upload your photo.');
  };

  const handleAvatarRemove = async () => {
    setAvatarBusy(true);
    const res = await removeAvatar();
    setAvatarBusy(false);
    if (res.success) showToast('Profile photo removed');
    else setError(res.error || 'Could not remove your photo.');
  };

  const handleSendVerification = async () => {
    setVerifyBusy(true);
    setVerifyNotice(null);
    const res = await sendEmailVerification();
    setVerifyBusy(false);
    if (!res.success) {
      setVerifyNotice(res.error || 'Could not send the verification email.');
      return;
    }
    if (res.emailSent) {
      setVerifyNotice('Verification email sent — check your inbox. The link expires in 24 hours.');
    } else if (res.verificationToken) {
      // No SMTP is configured on this store, so the token is returned
      // directly. Confirming it here keeps the flow genuinely working rather
      // than pointing at an inbox nothing was sent to.
      const confirm = await verifyEmail(res.verificationToken);
      setVerifyNotice(
        confirm.success
          ? 'Email confirmed. (Email delivery is not configured on this store, so we confirmed it directly.)'
          : confirm.error || 'Could not confirm your email address.'
      );
    }
  };

  const handleVerifyPhone = () => {
    setPhoneVerifyNotice(
      'Mobile verification is not available yet — an SMS provider has not been connected to this store. Your number is saved and used for delivery updates.'
    );
  };

  if (profile.loading && !profile.data) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="You" title="My Profile" />
        <AccountLoading label="Loading your profile" rows={2} />
      </div>
    );
  }

  if (profile.error && !profile.data) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="You" title="My Profile" />
        <AccountError message={profile.error} onRetry={() => loadProfile(true)} />
      </div>
    );
  }

  const data = profile.data;
  const initial = (firstName || data?.name || '?').charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="You"
        title="My Profile"
        description="Your details, used for order confirmations and delivery updates."
      />

      {/* Photo */}
      <AccountCard className="p-5">
        <div className="flex items-center gap-5 flex-wrap">
          {data?.avatarUrl ? (
            <img src={data.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border border-[#E8D5A8]" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-center">
              <span className="font-serif text-2xl text-[#C9972B]">{initial}</span>
            </div>
          )}
          <div className="space-y-2 min-w-0">
            <div>
              <h2 className="font-serif text-lg text-[#121212]">{data?.name}</h2>
              <p className="text-[11.5px] text-[#524C4C]">Member since {formatDate(data?.createdAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarPick}
                className="hidden"
              />
              <AccountButton variant="ghost" loading={avatarBusy} onClick={() => fileInputRef.current?.click()}>
                <Camera className="w-3.5 h-3.5" />
                {data?.avatarUrl ? 'Change Photo' : 'Add Photo'}
              </AccountButton>
              {data?.avatarUrl && (
                <AccountButton variant="ghost" disabled={avatarBusy} onClick={handleAvatarRemove}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </AccountButton>
              )}
            </div>
          </div>
        </div>
      </AccountCard>

      {/* Contact verification */}
      <AccountCard className="divide-y divide-[#F1EBDD]">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Mail className="w-4 h-4 text-[#C9972B] shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#524C4C] block">Email</span>
              <span className="text-[13px] text-[#121212] truncate block">{data?.email}</span>
            </div>
          </div>
          {data?.emailVerified ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase text-[#2E7D32]">
              <BadgeCheck className="w-4 h-4" />
              Verified
            </span>
          ) : (
            <AccountButton variant="secondary" loading={verifyBusy} onClick={handleSendVerification}>
              Verify Email
            </AccountButton>
          )}
        </div>
        {verifyNotice && (
          <div className="px-5 py-3">
            <AccountFormMessage tone="success" message={verifyNotice} />
          </div>
        )}

        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Phone className="w-4 h-4 text-[#C9972B] shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#524C4C] block">Mobile</span>
              <span className="text-[13px] text-[#121212] truncate block">{data?.phone || 'Not added yet'}</span>
            </div>
          </div>
          {data?.phoneVerified ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase text-[#2E7D32]">
              <BadgeCheck className="w-4 h-4" />
              Verified
            </span>
          ) : (
            data?.phone && (
              <AccountButton variant="ghost" onClick={handleVerifyPhone}>
                Verify Mobile
              </AccountButton>
            )
          )}
        </div>
        {phoneVerifyNotice && (
          <div className="px-5 py-3 flex gap-2.5 bg-[#FAF9F6]">
            <AlertTriangle className="w-4 h-4 text-[#C9972B] shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-[#524C4C] leading-relaxed">{phoneVerifyNotice}</p>
          </div>
        )}
      </AccountCard>

      {/* Editable details */}
      <AccountCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8D5A8]">
          <h2 className="font-serif text-lg text-[#121212]">Personal Details</h2>
        </div>
        <form
          onSubmit={handleSubmit}
          onChange={() => setDirty(true)}
          className="p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AccountField label="First Name" htmlFor="profile-first" required>
              <input id="profile-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
            </AccountField>
            <AccountField label="Last Name" htmlFor="profile-last">
              <input id="profile-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </AccountField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AccountField
              label="Email"
              htmlFor="profile-email"
              hint="Your email is your sign-in ID and can't be changed here — contact support to update it."
            >
              <input id="profile-email" value={data?.email || ''} disabled className={inputClass} />
            </AccountField>
            <AccountField label="Mobile Number" htmlFor="profile-phone" hint="Used for delivery updates">
              <input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className={inputClass}
                placeholder="9876543210"
              />
            </AccountField>
          </div>

          <AccountField label="Date of Birth" htmlFor="profile-dob" hint="Optional — so we can send you a birthday treat" className="sm:max-w-xs">
            <input
              id="profile-dob"
              type="date"
              value={dateOfBirth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={inputClass}
            />
          </AccountField>

          <AccountFormMessage tone="error" message={error} />
          <AccountFormMessage tone="success" message={success} />

          <div className="pt-2">
            <AccountButton type="submit" loading={saving}>
              Save Changes
            </AccountButton>
          </div>
        </form>
      </AccountCard>
    </div>
  );
};
