/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, BadgeCheck, Mail, Phone } from 'lucide-react';
import { Gender, GENDER_OPTIONS } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { useCustomerAuth } from '../../../context/CustomerAuthContext';
import {
  sendFirebaseOtp,
  confirmFirebaseOtp,
  clearRecaptcha,
  isFirebaseConfigured,
  describeFirebaseError,
  RECAPTCHA_CONTAINER_ID,
} from '../../../utils/firebaseAuth';
import {
  normalizePhoneInput,
  validatePhoneNumber,
  DEFAULT_COUNTRY_CODE,
  COUNTRY_PHONE_RULES,
} from '@glamirk/shared/utils/formValidation';
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
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

interface ProfileSectionProps {
  showToast: (message: string) => void;
  /** Present when the customer arrived from a "confirm your email" link. */
  verifyEmailToken?: string;
  onVerifyTokenConsumed?: () => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ showToast, verifyEmailToken, onVerifyTokenConsumed }) => {
  const {
    profile, loadProfile, updateProfile, uploadAvatar, removeAvatar,
    sendEmailVerification, verifyEmail, changePhone,
  } = useAccount();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [email, setEmail] = useState('');
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  // The six-digit email verification screen. Mirrors the phone OTP screen:
  // same box count, same Edit affordance, same countdown-gated resend.
  const EMAIL_CODE_LENGTH = 6;
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDigits, setCodeDigits] = useState<string[]>(Array(EMAIL_CODE_LENGTH).fill(''));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMasked, setCodeMasked] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [codeResendAt, setCodeResendAt] = useState<number | null>(null);
  const [codeMustResend, setCodeMustResend] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const codeInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // One ticker drives both countdowns. Only runs while the screen is open.
  useEffect(() => {
    if (!codeOpen) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [codeOpen]);

  const codeSecondsLeft = codeExpiresAt ? Math.max(0, Math.ceil((codeExpiresAt - nowMs) / 1000)) : 0;
  const resendInSeconds = codeResendAt ? Math.max(0, Math.ceil((codeResendAt - nowMs) / 1000)) : 0;
  const codeExpired = codeExpiresAt !== null && codeSecondsLeft === 0;
  const canResendCode = codeOpen && resendInSeconds === 0 && !codeBusy;
  const codeComplete = codeDigits.join('').length === EMAIL_CODE_LENGTH;

  const formatCountdown = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

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
    setGender(profile.data.gender || '');
    setEmail(profile.data.email || '');
  }, [profile.data, dirty]);

  // Older "confirm your email" messages carried a ?verifyEmail=<token> link.
  // Verification is a six-digit code now, so such a link has nothing to
  // redeem — say so rather than failing silently, and clear it from the URL.
  useEffect(() => {
    if (!verifyEmailToken) return;
    setVerifyNotice('That confirmation link is no longer valid. Request a new code below.');
    onVerifyTokenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEmailToken]);


  // ------------------------------------------
  // CHANGING THE VERIFIED MOBILE NUMBER
  //
  // The number is the identity, so this reuses the sign-in machinery rather
  // than inventing a second one: Google sends and checks the code, the backend
  // verifies the resulting ID token, and only then does the account move.
  //
  // Three loading states instead of one. "Swapping" is the window where the
  // server has already changed the number and the tab is still holding the
  // token that change invalidated - showing "verifying" there would be a lie
  // about what can still fail.
  // ------------------------------------------
  const { applyReplacementToken } = useCustomerAuth();
  const PHONE_CODE_LENGTH = 6;

  const [phonePanelOpen, setPhonePanelOpen] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'number' | 'code'>('number');
  const [newCountryCode, setNewCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [newPhone, setNewPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState<string[]>(Array(PHONE_CODE_LENGTH).fill(''));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneSwapping, setPhoneSwapping] = useState(false);
  const phoneInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  /**
   * The Firebase ConfirmationResult. A ref, not state: it is never rendered,
   * and a re-render must not replace the object confirm() has to be called on.
   */
  const confirmationRef = useRef<Awaited<ReturnType<typeof sendFirebaseOtp>> | null>(null);

  const phoneBusy = phoneSending || phoneVerifying || phoneSwapping;
  const phoneCodeComplete = phoneCode.join('').length === PHONE_CODE_LENGTH;

  /** Drops the verifier and the challenge. A spent verifier is the usual
   *  reason a second attempt fails with an opaque error. */
  const resetPhoneFlow = () => {
    clearRecaptcha();
    confirmationRef.current = null;
    setPhoneCode(Array(PHONE_CODE_LENGTH).fill(''));
  };

  const closePhonePanel = () => {
    resetPhoneFlow();
    setPhonePanelOpen(false);
    setPhoneStep('number');
    setNewPhone('');
    setPhoneError(null);
  };

  // Leaving the screen mid-flow must not strand a live verifier on a container
  // that is about to be unmounted.
  useEffect(() => () => clearRecaptcha(), []);

  const sendPhoneCode = async () => {
    const digits = normalizePhoneInput(newPhone, newCountryCode);
    const check = validatePhoneNumber(newCountryCode, digits);
    if (!digits || !check.valid) {
      setPhoneError(check.error || 'Please enter a valid mobile number.');
      return;
    }
    if (!isFirebaseConfigured()) {
      setPhoneError('Mobile verification is unavailable right now. Please try again later.');
      return;
    }

    setPhoneSending(true);
    setPhoneError(null);
    try {
      // A fresh verifier per attempt is built inside sendFirebaseOtp.
      confirmationRef.current = await sendFirebaseOtp(`${newCountryCode}${digits}`);
      setPhoneCode(Array(PHONE_CODE_LENGTH).fill(''));
      setPhoneStep('code');
      window.setTimeout(() => phoneInputsRef.current[0]?.focus(), 50);
    } catch (err) {
      resetPhoneFlow();
      setPhoneError(describeFirebaseError(err));
    } finally {
      setPhoneSending(false);
    }
  };

  const submitPhoneCode = async (value: string) => {
    if (value.length !== PHONE_CODE_LENGTH || phoneBusy) return;
    const confirmation = confirmationRef.current;
    if (!confirmation) {
      setPhoneError('That code is no longer valid. Please request a new one.');
      setPhoneStep('number');
      return;
    }

    setPhoneVerifying(true);
    setPhoneError(null);

    let idToken: string;
    try {
      idToken = await confirmFirebaseOtp(confirmation, value);
    } catch (err) {
      setPhoneVerifying(false);
      setPhoneError(describeFirebaseError(err));
      setPhoneCode(Array(PHONE_CODE_LENGTH).fill(''));
      window.setTimeout(() => phoneInputsRef.current[0]?.focus(), 50);
      return;
    }
    setPhoneVerifying(false);

    setPhoneSwapping(true);
    const res = await changePhone(idToken);
    // The challenge is spent either way: a Firebase code is single use.
    resetPhoneFlow();

    if (res.success) {
      if (res.unchanged) {
        // Already this account's number. Nothing to swap - the server issued
        // no replacement token, and storing `undefined` would sign them out.
        setPhoneSwapping(false);
        closePhonePanel();
        showToast('That is already your number.');
        return;
      }
      // ORDER MATTERS. bumpTokenVersion killed the token this tab holds, so
      // the replacement goes in BEFORE any request that would use the old one.
      if (res.token && res.user) applyReplacementToken(res.token, res.user);
      await loadProfile(true);
      setPhoneSwapping(false);
      closePhonePanel();
      showToast('Mobile number updated');
      return;
    }

    setPhoneSwapping(false);
    if (res.status === 409) {
      // Recoverable by entering a different number, so the panel stays open.
      setPhoneError('That mobile number is already in use on another account.');
      setPhoneStep('number');
    } else if (res.status === 401) {
      setPhoneError('That code has expired or could not be verified. Please request a new one.');
      setPhoneStep('number');
    } else if (res.status === 503) {
      setPhoneError('Mobile verification is unavailable right now. Please try again later.');
    } else {
      setPhoneError(res.error || 'Could not change your mobile number.');
    }
  };

  /** One digit per box, advancing as they are typed. */
  const setPhoneDigit = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setPhoneCode((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    setPhoneCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < digits.length && index + i < PHONE_CODE_LENGTH; i++) {
        next[index + i] = digits[i];
      }
      const landed = Math.min(index + digits.length, PHONE_CODE_LENGTH - 1);
      window.setTimeout(() => phoneInputsRef.current[landed]?.focus(), 0);
      const joined = next.join('');
      if (joined.length === PHONE_CODE_LENGTH) window.setTimeout(() => void submitPhoneCode(joined), 0);
      return next;
    });
  };

  const handlePhoneKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !phoneCode[index] && index > 0) {
      e.preventDefault();
      phoneInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      phoneInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < PHONE_CODE_LENGTH - 1) {
      e.preventDefault();
      phoneInputsRef.current[index + 1]?.focus();
    }
  };

  const handlePhonePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PHONE_CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(PHONE_CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setPhoneCode(next);
    const landed = Math.min(pasted.length, PHONE_CODE_LENGTH - 1);
    window.setTimeout(() => phoneInputsRef.current[landed]?.focus(), 0);
    if (pasted.length === PHONE_CODE_LENGTH) window.setTimeout(() => void submitPhoneCode(pasted), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // A name is no longer required to save: accounts created by mobile + OTP
    // start without one, and someone setting only their date of birth should
    // not be made to invent a name first. Supplying a BLANK name is still
    // refused below by the server, which will not overwrite a real name with
    // nothing — so the field is simply omitted when empty.
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
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
      // Omitted rather than sent blank — an absent key leaves the stored name
      // alone, which is what an empty box should mean here.
      ...(firstName.trim() ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}),
      email: trimmedEmail,
      phone: phone.trim(),
      dateOfBirth: dateOfBirth || undefined,
      gender,
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
    setCodeError(null);
    const res = await sendEmailVerification();
    setVerifyBusy(false);

    if (!res.success) {
      setVerifyNotice(res.error || 'Could not send the verification code.');
      return;
    }
    if (res.alreadyVerified) {
      setVerifyNotice('This address is already verified.');
      return;
    }

    setCodeDigits(Array(EMAIL_CODE_LENGTH).fill(''));
    setCodeMustResend(false);
    setCodeMasked(res.maskedEmail || email || '');
    setCodeExpiresAt(res.expiresAt ? new Date(res.expiresAt).getTime() : null);
    setCodeResendAt(res.resendAvailableAt ? new Date(res.resendAvailableAt).getTime() : null);
    setNowMs(Date.now());
    setCodeOpen(true);
    window.setTimeout(() => codeInputsRef.current[0]?.focus(), 50);

    setVerifyNotice(
      res.emailSent
        ? null
        : // No SMTP on this store. The code is shown rather than pretending an
          // email went out — and it is said plainly that none did.
          `Email delivery is not configured on this store, so no message was sent. Your code is ${res.devCode}.`
    );
  };

  const submitCode = async (value: string) => {
    if (value.length !== EMAIL_CODE_LENGTH || codeBusy) return;
    setCodeBusy(true);
    setCodeError(null);
    const res = await verifyEmail(value);
    setCodeBusy(false);

    if (res.success) {
      setCodeOpen(false);
      setVerifyNotice(null);
      showToast('Your email address has been confirmed.');
      return;
    }

    setCodeError(
      res.attemptsRemaining !== undefined
        ? `${res.error} ${res.attemptsRemaining} attempt${res.attemptsRemaining === 1 ? '' : 's'} left.`
        : res.error || 'Could not verify your email address.'
    );
    if (res.mustResend) setCodeMustResend(true);
    else {
      setCodeDigits(Array(EMAIL_CODE_LENGTH).fill(''));
      window.setTimeout(() => codeInputsRef.current[0]?.focus(), 50);
    }
  };

  /** One digit per box, advancing as they are typed. */
  const setCodeDigit = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setCodeDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    setCodeDigits((prev) => {
      const next = [...prev];
      // Typing over a filled box, or a keyboard that delivers several digits
      // at once, spreads forward rather than being truncated.
      for (let i = 0; i < digits.length && index + i < EMAIL_CODE_LENGTH; i++) {
        next[index + i] = digits[i];
      }
      const landed = Math.min(index + digits.length, EMAIL_CODE_LENGTH - 1);
      window.setTimeout(() => codeInputsRef.current[landed]?.focus(), 0);
      const joined = next.join('');
      if (joined.length === EMAIL_CODE_LENGTH) window.setTimeout(() => void submitCode(joined), 0);
      return next;
    });
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      e.preventDefault();
      codeInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      codeInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < EMAIL_CODE_LENGTH - 1) {
      e.preventDefault();
      codeInputsRef.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(EMAIL_CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCodeDigits(next);
    const landed = Math.min(pasted.length, EMAIL_CODE_LENGTH - 1);
    window.setTimeout(() => codeInputsRef.current[landed]?.focus(), 0);
    if (pasted.length === EMAIL_CODE_LENGTH) window.setTimeout(() => void submitCode(pasted), 0);
  };

  /**
   * Compares two numbers by their last ten digits.
   *
   * phoneE164 is canonical ("+919876543210") while `phone` is whatever the
   * customer typed ("+91 98765 43210", "09876543210"). Comparing the strings
   * would call the same number different and show a contradiction.
   */
  const samePhone = (a: string, b: string) => {
    const digits = (v: string) => v.replace(/\D/g, '').slice(-10);
    return digits(a).length === 10 && digits(a) === digits(b);
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
            <img src={cloudinaryImageUrl(data.avatarUrl, 'avatar')} alt="" loading="lazy" decoding="async" className="w-20 h-20 rounded-full object-cover border border-[#E8D5A8]" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-center">
              <span className="font-serif text-2xl text-[#C9972B]">{initial}</span>
            </div>
          )}
          <div className="space-y-2 min-w-0">
            <div>
              <h2 className="font-serif text-lg text-[#121212]">{data?.name}</h2>
              <p className="text-[11.5px] text-[#6B6B6B]">Member since {formatDate(data?.createdAt)}</p>
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
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#6B6B6B] block">Email</span>
              <span className="text-[13px] text-[#121212] truncate block">{data?.email || 'Not added yet'}</span>
            </div>
          </div>
          {data?.emailVerified ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase text-[#2E7D32]">
              <BadgeCheck className="w-4 h-4" />
              Verified
            </span>
          ) : (
            !codeOpen && (
              <AccountButton variant="secondary" loading={verifyBusy} onClick={handleSendVerification}>
                Verify Email
              </AccountButton>
            )
          )}
        </div>
        {verifyNotice && (
          <div className="px-5 py-3">
            <AccountFormMessage tone="success" message={verifyNotice} />
          </div>
        )}

        {/* Six-digit code screen. Deliberately the same shape as the phone OTP
            screen — same box count, same Edit affordance, same countdown — so
            the two verifications do not feel like different products. */}
        {codeOpen && !data?.emailVerified && (
          <div className="p-5 space-y-4">
            <p className="text-[11.5px] text-[#6B6B6B] leading-relaxed text-center">
              Please enter the verification code we&rsquo;ve sent you on{' '}
              <span className="text-[#121212] font-medium">{codeMasked}</span>{' '}
              <button
                type="button"
                onClick={() => {
                  // Back to the form to correct the address. The code dies
                  // server-side the moment the address changes.
                  setCodeOpen(false);
                  setCodeError(null);
                  window.setTimeout(() => document.getElementById('profile-email')?.focus(), 50);
                }}
                aria-label="Edit email address"
                className="font-semibold text-[#C9972B] hover:underline cursor-pointer"
              >
                Edit
              </button>
            </p>

            <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
              {codeDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    codeInputsRef.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={EMAIL_CODE_LENGTH}
                  aria-label={`Email code digit ${i + 1}`}
                  value={digit}
                  disabled={codeBusy || codeExpired || codeMustResend}
                  onChange={(e) => setCodeDigit(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`w-11 sm:w-12 py-3 text-center text-lg font-mono rounded-lg bg-[#FFFDF8] border text-[#121212] focus:outline-none transition-colors disabled:opacity-40 ${
                    codeError
                      ? 'border-[#C0392B]/60 focus:border-[#C0392B]'
                      : digit
                        ? 'border-[#C9972B] focus:border-[#C9972B]'
                        : 'border-[#E8D5A8] focus:border-[#C9972B]'
                  }`}
                />
              ))}
            </div>

            {codeError && <AccountFormMessage tone="error" message={codeError} />}

            <div className="text-center">
              {codeExpired || codeMustResend ? (
                <p className="text-[11px] text-[#C0392B]" role="status">
                  That code is no longer valid. Please request a new one.
                </p>
              ) : (
                <p className="text-[11px] text-[#6B6B6B]">
                  Code expires in{' '}
                  <span className="font-mono text-[#121212] tabular-nums">{formatCountdown(codeSecondsLeft)}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <AccountButton
                loading={codeBusy}
                disabled={!codeComplete || codeExpired || codeMustResend}
                onClick={() => void submitCode(codeDigits.join(''))}
              >
                Verify
              </AccountButton>
              <button
                type="button"
                onClick={handleSendVerification}
                disabled={!canResendCode}
                className="text-[11px] font-semibold text-[#C9972B] hover:underline disabled:text-[#6B6B6B] disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
              >
                {canResendCode ? 'Resend code' : `Resend in ${formatCountdown(resendInSeconds)}`}
              </button>
            </div>
          </div>
        )}

        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Phone className="w-4 h-4 text-[#C9972B] shrink-0" />
            <div className="min-w-0">
              {/* Two different numbers, deliberately shown as two different
                  things. phoneE164 is the one Firebase proved and the one that
                  signs this customer in; `phone` is free text they can edit and
                  is only a courier contact. Showing the editable one under a
                  "Verified" badge — which is what happened before — claimed
                  proof for a value nobody ever checked. */}
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#6B6B6B] block">
                {data?.phoneE164 ? 'Mobile — your sign-in number' : 'Mobile'}
              </span>
              <span className="text-[13px] text-[#121212] truncate block">
                {data?.phoneE164 || data?.phone || 'Not added yet'}
              </span>
              {data?.phoneE164 && data?.phone && !samePhone(data.phoneE164, data.phone) && (
                <span className="text-[11px] text-[#6B6B6B] block mt-0.5">
                  Contact number for deliveries: {data.phone} — not verified
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data?.phoneE164 ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase text-[#2E7D32]">
                <BadgeCheck className="w-4 h-4" />
                Verified
              </span>
            ) : (
              <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#6B6B6B]">
                Not verified
              </span>
            )}
            {!phonePanelOpen && (
              <AccountButton variant="secondary" onClick={() => setPhonePanelOpen(true)}>
                {data?.phoneE164 ? 'Change' : 'Add Mobile'}
              </AccountButton>
            )}
          </div>
        </div>

        {/* Firebase attaches its invisible reCAPTCHA here. It must exist in
            the DOM before sendFirebaseOtp() runs, and this is the only copy on
            this screen - two containers would mean two verifiers. */}
        {phonePanelOpen && <div id={RECAPTCHA_CONTAINER_ID} />}

        {phonePanelOpen && (
          <div className="p-5 space-y-4 border-t border-[#F1EBDD]">
            {phoneStep === 'number' ? (
              <>
                <p className="text-[11.5px] text-[#6B6B6B] leading-relaxed">
                  We will send a one-time code to confirm the new number. It becomes the number you
                  sign in with, and other devices will be signed out.
                </p>
                <div className="grid grid-cols-[7rem_1fr] gap-2 sm:max-w-sm">
                  <select
                    aria-label="Country code"
                    value={newCountryCode}
                    onChange={(e) => {
                      setNewCountryCode(e.target.value);
                      setNewPhone((prev) => normalizePhoneInput(prev, e.target.value));
                    }}
                    disabled={phoneBusy}
                    className={inputClass}
                  >
                    {COUNTRY_PHONE_RULES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    id="new-phone"
                    aria-label="New mobile number"
                    inputMode="numeric"
                    placeholder="10 digit number"
                    value={newPhone}
                    disabled={phoneBusy}
                    onChange={(e) => setNewPhone(normalizePhoneInput(e.target.value, newCountryCode))}
                    className={inputClass}
                  />
                </div>
                {phoneError && <AccountFormMessage tone="error" message={phoneError} />}
                <div className="flex flex-wrap items-center gap-3">
                  <AccountButton loading={phoneSending} disabled={!newPhone || phoneBusy} onClick={sendPhoneCode}>
                    Send Code
                  </AccountButton>
                  <AccountButton variant="ghost" disabled={phoneBusy} onClick={closePhonePanel}>
                    Cancel
                  </AccountButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11.5px] text-[#6B6B6B] leading-relaxed text-center">
                  Enter the code sent to{' '}
                  <span className="text-[#121212] font-medium">
                    {newCountryCode} {newPhone}
                  </span>{' '}
                  <button
                    type="button"
                    onClick={() => {
                      resetPhoneFlow();
                      setPhoneStep('number');
                      setPhoneError(null);
                    }}
                    aria-label="Edit new mobile number"
                    disabled={phoneBusy}
                    className="font-semibold text-[#C9972B] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Edit
                  </button>
                </p>

                <div className="flex justify-center gap-2" onPaste={handlePhonePaste}>
                  {phoneCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        phoneInputsRef.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={PHONE_CODE_LENGTH}
                      aria-label={`New mobile code digit ${i + 1}`}
                      value={digit}
                      disabled={phoneBusy}
                      onChange={(e) => setPhoneDigit(i, e.target.value)}
                      onKeyDown={(e) => handlePhoneKeyDown(i, e)}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`w-11 sm:w-12 py-3 text-center text-lg font-mono rounded-lg bg-[#FFFDF8] border text-[#121212] focus:outline-none transition-colors disabled:opacity-40 ${
                        phoneError ? 'border-[#C0392B]/60' : digit ? 'border-[#C9972B]' : 'border-[#E8D5A8]'
                      }`}
                    />
                  ))}
                </div>

                {phoneError && <AccountFormMessage tone="error" message={phoneError} />}
                {phoneSwapping && (
                  <p className="text-[11px] text-[#6B6B6B] text-center" role="status">
                    Updating your number...
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <AccountButton
                    loading={phoneVerifying || phoneSwapping}
                    disabled={!phoneCodeComplete || phoneBusy}
                    onClick={() => void submitPhoneCode(phoneCode.join(''))}
                  >
                    Verify &amp; Update
                  </AccountButton>
                  <AccountButton variant="ghost" disabled={phoneBusy} onClick={sendPhoneCode}>
                    Resend Code
                  </AccountButton>
                  <AccountButton variant="ghost" disabled={phoneBusy} onClick={closePhonePanel}>
                    Cancel
                  </AccountButton>
                </div>
              </>
            )}
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
            <AccountField label="Email" htmlFor="profile-email" hint="For order confirmations and receipts">
              <input
                id="profile-email"
                type="email"
                value={email}
                placeholder="Not added yet"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setDirty(true);
                }}
                className={inputClass}
              />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AccountField label="Date of Birth" htmlFor="profile-dob" hint="Optional — so we can send you a birthday treat">
              <input
                id="profile-dob"
                type="date"
                value={dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={inputClass}
              />
            </AccountField>

            <AccountField label="Gender" htmlFor="profile-gender" hint="Optional — helps us tailor your recommendations">
              <select
                id="profile-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender | '')}
                className={inputClass}
              >
                <option value="">Not specified</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </AccountField>
          </div>

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
