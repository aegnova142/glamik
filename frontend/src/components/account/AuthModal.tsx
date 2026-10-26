/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  X,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { MobileOtpSignIn } from './MobileOtpSignIn';
import { Leaf, Petal, OrnamentDefs } from '../marketing/BotanicalOrnaments';
import {
  normalizeEmail,
  isValidEmail,
  getPasswordRequirements,
  isPasswordValid,
} from '@glamirk/shared/utils/formValidation';

/**
 * Email + password sign-in, registration and forgot-password.
 *
 * ON. Mobile + OTP is the primary and default way in, but this stays
 * reachable from a link under the OTP form because of who needs it: an
 * account with no mobile number on it — an old email-only registration — has
 * nothing to send a code to. Removing this form would
 * lock those customers out of accounts that are already theirs, along with
 * their orders, addresses and rewards.
 *
 * Turning it off hides the tabs, the password form, registration and
 * forgot-password in one move. The backend endpoints (/auth/login,
 * /auth/register, /auth/forgot-password, /auth/reset-password) are untouched
 * either way — this is a UI switch, not a capability switch.
 */
const LEGACY_EMAIL_AUTH_ENABLED = true;

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerLoginSuccess?: (user: { name: string; email: string; phone: string }) => void;
  // Deep-link support: when set (e.g. from a ?resetToken=... emailed link),
  // the modal opens straight into the "set new password" step with this
  // token pre-filled instead of the normal sign-in form.
  initialResetToken?: string;
  /** Which tab to open on — "Create Account" in the nav should land on
   * registration rather than making the visitor switch tabs themselves. */
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onCustomerLoginSuccess,
  initialResetToken,
  initialMode,
}) => {
  const { customerLogin, requestPasswordReset, resetPassword } = useCustomerAuth();

  // Customer Login State — real accounts, backed by Postgres via /api/customer/auth
  // 'otp' — mobile number + one-time code — is where everyone lands. The
  // other three are reached from the tabs and the "use a password instead"
  // link, and disappear entirely when LEGACY_EMAIL_AUTH_ENABLED is false.
  const [customerFormMode, setCustomerFormMode] = useState<'otp' | 'login' | 'forgot'>('otp');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotStep, setForgotStep] = useState<'request' | 'reset' | 'done'>('request');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordChecklist, setShowNewPasswordChecklist] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const newPasswordRequirements = getPasswordRequirements(newPassword);
  const [customerSuccess, setCustomerSuccess] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);


  useEffect(() => {
    if (isOpen && initialResetToken) {
      setCustomerFormMode('forgot');
      setForgotStep('reset');
      setResetToken(initialResetToken);
      setForgotError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialResetToken]);

  // A reset link always wins over the requested tab — someone arriving to set
  // a new password shouldn't be dropped onto the registration form.
  useEffect(() => {
    if (isOpen && initialMode && !initialResetToken) {
      // BOTH entry points land on the mobile number. Verifying a number signs
      // an existing customer in and creates the account if the number is new,
      // so "Sign Up" has nothing extra to ask for — opening a name/password
      // form there would demand four fields to do what one does.
      //
      // There is NO email-registration path in this UI. The email screen signs
      // in only, for accounts that predate OTP; customerRegister and the
      // backend's /auth/register are left in place but nothing here calls
      // them. A new customer registers by verifying a mobile number.
      setCustomerFormMode('otp');
      setCustomerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMode]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Dialog plumbing: lock page scroll, close on Escape, keep Tab inside the
  // dialog, and hand focus back to whatever opened it.
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    // autoFocus on the phone field usually wins; this covers the other forms.
    const raf = requestAnimationFrame(() => {
      if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      // The usual trigger lives inside the account dropdown, which is gone by
      // now; fall back to the button that owns that dropdown.
      const returnTo = trigger?.isConnected
        ? trigger
        : document.querySelector<HTMLElement>('[aria-label="Open account menu"]');
      returnTo?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomerError(null);

    const cleanEmail = normalizeEmail(customerEmail);
    if (!isValidEmail(cleanEmail)) {
      setCustomerError('Please enter a valid email address.');
      return;
    }

    setCustomerEmail(cleanEmail);
    setCustomerLoading(true);

    // Sign-in only. Creating an account is the mobile + OTP flow's job:
    // verifying a number signs the customer in, or creates them if the number
    // is new. This form exists for accounts that predate that.
    const res = await customerLogin(cleanEmail, customerPassword, rememberMe);

    setCustomerLoading(false);

    if (!res.success) {
      setCustomerError(res.error || 'Something went wrong. Please try again.');
      return;
    }

    setCustomerSuccess(true);
    setTimeout(() => {
      // Every consumer reads the signed-in customer from CustomerAuthContext;
      // this callback shape is kept for the existing greeting only.
      onCustomerLoginSuccess?.({ name: cleanEmail, email: cleanEmail, phone: '' });
      onClose();
    }, 600);
  };

  const openForgotPassword = () => {
    setCustomerFormMode('forgot');
    setForgotStep('request');
    setForgotError(null);
    setResetToken('');
    setNewPassword('');
    setNewPasswordConfirm('');
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    const cleanEmail = normalizeEmail(customerEmail);
    if (!isValidEmail(cleanEmail)) {
      setForgotError('Please enter a valid email address.');
      return;
    }

    setCustomerEmail(cleanEmail);
    setForgotLoading(true);
    const res = await requestPasswordReset(cleanEmail);
    setForgotLoading(false);

    if (!res.success) {
      setForgotError(res.error || 'Could not process your request.');
      return;
    }

    setResetToken(res.resetToken || '');
    setForgotStep('reset');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!isPasswordValid(newPassword)) {
      setShowNewPasswordChecklist(true);
      setForgotError('Your new password doesn’t meet all requirements yet — check the list below.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setForgotError('Passwords do not match.');
      return;
    }

    setForgotLoading(true);
    const res = await resetPassword(resetToken, newPassword);
    setForgotLoading(false);

    if (!res.success) {
      setForgotError(res.error || 'Could not reset your password.');
      return;
    }

    setForgotStep('done');
  };

  return (
    <MotionConfig reducedMotion="user">
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0B0B]/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[var(--auth-z)] flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain bg-[var(--auth-overlay)] backdrop-blur-[6px] px-3 py-4 sm:p-6"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          aria-describedby="auth-modal-desc"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          // Capped at the viewport and scrolled INSIDE, by the form column
          // only. Letting the overlay scroll instead is what put the heading
          // and the terms out of reach: a centred child taller than its
          // scroll container has its top overflow clipped unreachably, so the
          // form opened already cut off at both ends.
          className="relative w-full max-w-md sm:max-w-3xl max-h-[var(--auth-modal-max-h)] bg-[#171717] border border-[#E8D5A8]/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col sm:flex-row sm:items-stretch"
          transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          className="relative w-full max-w-[var(--auth-modal-w)] my-auto bg-[radial-gradient(120%_60%_at_50%_0%,#161412_0%,var(--auth-bg)_55%)] border-[1.5px] border-[var(--auth-border)] rounded-[var(--auth-radius-modal)] shadow-[var(--auth-shadow)] overflow-hidden font-sans text-[var(--auth-text)] focus:outline-none"
        >
          <BotanicalCorners />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            // The icon carries no text, so without this the control is
            // announced as an unlabelled button.
            aria-label="Close"
            // Opaque, because the form now scrolls UNDER this button — left
            // transparent it sat on top of the number field and the two read
            // as one smudge. The two backgrounds are the panel it actually
            // overlaps at each breakpoint: the dark header when stacked, the
            // form column once they sit side by side.
            className="absolute top-4 right-4 p-2 rounded-full bg-[#0B0B0B] sm:bg-[#171717] text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#0B0B0B] transition-colors cursor-pointer z-10"
            aria-label="Close sign in"
            className="auth-focus absolute top-4 right-4 sm:top-6 sm:right-6 z-20 p-2 rounded-full text-[var(--auth-text)] hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" strokeWidth={1.75} />
          </button>

          {/* Left panel: why signing in is worth it. Static — it carries no
              state and no controls, so on a phone it collapses to a compact
              header instead of pushing the form below the fold. */}
          <div className="shrink-0 sm:w-[44%] bg-[#0B0B0B] border-b sm:border-b-0 sm:border-r border-[#E8D5A8]/20 p-6 sm:p-8 sm:flex sm:flex-col sm:justify-center">
            <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#C9972B]">
              GLAMIRK ATELIER
          {/* Header */}
          <div className="relative z-10 px-9 sm:px-20 pt-9 sm:pt-[34px] pb-6 sm:pb-[22px] text-center border-b border-[var(--auth-divider)]">
            <span className="block text-xs sm:text-[13px] font-medium uppercase tracking-[0.28em] sm:tracking-[0.32em] text-[var(--auth-gold)]">
              GLAMIRK ATELIER AUTHENTICATION
            </span>
            <h2
              id="auth-modal-title"
              className="font-serif !font-semibold text-[27px] min-[380px]:text-[34px] sm:text-[46px] leading-[1.1] text-[var(--auth-text)] mt-2"
            >
              {customerFormMode === 'forgot' ? 'Reset Your Password' : 'Customer Sign In'}
            </h2>
            <p id="auth-modal-desc" className="text-[15px] sm:text-[17px] text-[#D9D4CD] mt-2 leading-snug">
              {customerFormMode === 'forgot'
                ? 'We’ll help you get back into your account'
                : 'Access your orders, saved shades and rewards'}
            </p>
          </div>

          {/* Right panel: the form itself, and the only part that scrolls —
              min-h-0 so it may shrink below its content inside the flex
              column rather than stretching the modal past the viewport. */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
          <div className="px-6 pt-6 sm:pt-8">
            <h3 className="font-serif text-lg text-[#FAF9F6]">
              {customerFormMode === 'forgot' ? 'Reset your password' : 'Log in for the best experience'}
            </h3>
            <p className="text-xs text-[#6B6B6B] mt-1">
              {customerFormMode === 'forgot'
                ? 'Enter the email address on your account'
                : customerFormMode === 'otp'
                  ? 'Enter your phone number to continue'
                  : 'Continue with your email ID'}
                : 'Access your beauty profile, saved shades, and Privé points'}
            </p>
          </div>

          <div className="relative z-10 px-5 sm:px-[34px] pt-2 sm:pt-3 pb-8 sm:pb-9">
            {LEGACY_EMAIL_AUTH_ENABLED && customerFormMode === 'forgot' ? (
              <div className="space-y-4">
                {forgotStep === 'request' && (
                  <form onSubmit={handleRequestReset} className="space-y-4">
                    <p className="text-xs text-[var(--auth-text-secondary)] leading-relaxed">
                      Enter the email address on your account and we’ll get you a reset link.
                    </p>

                    {forgotError && (
                      <div role="alert" className="p-3 rounded-[var(--auth-radius-control)] bg-[var(--auth-banner-bg)] text-[var(--auth-error)] border border-[var(--auth-banner-border)] text-sm">
                        {forgotError}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-semibold text-[var(--auth-gold)] uppercase tracking-wider mb-1.5">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[var(--auth-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                        autoComplete="email"
                          required
                          placeholder="you@example.com"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          className="w-full pl-9 pr-3 py-3 bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] rounded-[var(--auth-radius-control)] text-sm text-[var(--auth-text)] placeholder:text-[var(--auth-text-muted)] focus:outline-none focus:border-[var(--auth-gold-soft)] focus:ring-2 focus:ring-[#C9972B]/25"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="auth-cta w-full py-4 font-medium text-[15px] uppercase tracking-[0.16em] cursor-pointer disabled:opacity-50"
                    >
                      {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomerFormMode('login');
                        setForgotError(null);
                      }}
                      className="w-full text-center text-xs text-[var(--auth-text-secondary)] hover:text-[#FAF9F6] cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                  </form>
                )}

                {forgotStep === 'reset' && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="p-2.5 rounded-lg bg-[#0B0B0B]/60 border border-[#E8D5A8]/15 text-xs text-[var(--auth-text-secondary)] leading-relaxed">
                      Email delivery isn’t configured in this environment, so instead of emailing your reset
                      link we’ve unlocked the next step right here — just set your new password below.
                    </div>

                    {forgotError && (
                      <div role="alert" className="p-3 rounded-[var(--auth-radius-control)] bg-[var(--auth-banner-bg)] text-[var(--auth-error)] border border-[var(--auth-banner-border)] text-sm">
                        {forgotError}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-semibold text-[var(--auth-gold)] uppercase tracking-wider mb-1.5">
                        New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[var(--auth-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          minLength={8}
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onFocus={() => setShowNewPasswordChecklist(true)}
                          className="w-full pl-9 pr-9 py-3 bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] rounded-[var(--auth-radius-control)] text-sm text-[var(--auth-text)] placeholder:text-[var(--auth-text-muted)] focus:outline-none focus:border-[var(--auth-gold-soft)] focus:ring-2 focus:ring-[#C9972B]/25"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          aria-label="Show or hide password"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--auth-text-secondary)] hover:text-[#FAF9F6]"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {showNewPasswordChecklist && (
                        <ul className="mt-2 space-y-1 p-2.5 rounded-lg bg-[#0B0B0B]/60 border border-[#E8D5A8]/15">
                          {newPasswordRequirements.map((req) => (
                            <li
                              key={req.id}
                              className={`flex items-center gap-1.5 text-xs transition-colors ${
                                req.met ? 'text-[#C9972B]' : 'text-[var(--auth-text-secondary)]'
                              }`}
                            >
                              <CheckCircle className={`w-3 h-3 shrink-0 ${req.met ? 'opacity-100' : 'opacity-30'}`} />
                              <span>{req.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[var(--auth-gold)] uppercase tracking-wider mb-1.5">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[var(--auth-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          placeholder="••••••••"
                          value={newPasswordConfirm}
                          onChange={(e) => setNewPasswordConfirm(e.target.value)}
                          className={`w-full pl-9 pr-3 py-3 bg-[var(--auth-input-bg)] border rounded-[var(--auth-radius-control)] text-sm text-[var(--auth-text)] placeholder:text-[var(--auth-text-muted)] focus:outline-none focus:border-[var(--auth-gold-soft)] focus:ring-2 focus:ring-[#C9972B]/25 ${
                            newPasswordConfirm && newPasswordConfirm !== newPassword ? 'border-[#F05A7E]/60' : 'border-[var(--auth-input-border)]'
                          }`}
                        />
                      </div>
                      {newPasswordConfirm && newPasswordConfirm !== newPassword && (
                        <p className="text-xs text-[#F05A7E] mt-1">Passwords do not match.</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="auth-cta w-full py-4 font-medium text-[15px] uppercase tracking-[0.16em] cursor-pointer disabled:opacity-50"
                    >
                      {forgotLoading ? 'Resetting...' : 'Reset Password'}
                    </button>
                  </form>
                )}

                {forgotStep === 'done' && (
                  <div className="text-center space-y-4 py-4">
                    <CheckCircle className="w-10 h-10 text-[#C9972B] mx-auto" />
                    <div>
                      <h3 className="font-serif text-lg text-[#FAF9F6]">Password Reset!</h3>
                      <p className="text-xs text-[var(--auth-text-secondary)] mt-1">
                        Your password has been updated and you’re signed in.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onCustomerLoginSuccess?.({ name: '', email: customerEmail, phone: '' });
                        onClose();
                      }}
                      className="auth-cta w-full py-4 font-medium text-[15px] uppercase tracking-[0.16em] cursor-pointer"
                    >
                      Continue
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {!LEGACY_EMAIL_AUTH_ENABLED || customerFormMode === 'otp' ? (
                  <MobileOtpSignIn
                    remember={rememberMe}
                    onToggleRemember={() => setRememberMe(!rememberMe)}
                    // Omitted entirely when email sign-in is off, which is
                    // what removes the "Use Email ID" link.
                    onUseEmail={
                      LEGACY_EMAIL_AUTH_ENABLED
                        ? () => {
                            setCustomerFormMode('login');
                            setCustomerError(null);
                          }
                        : undefined
                    }
                    onSuccess={() => {
                      setCustomerSuccess(true);
                      // The existing callback shape carries name/email/phone
                      // for the legacy greeting; an OTP sign-in has none of
                      // them to hand, and every consumer reads the signed-in
                      // customer from CustomerAuthContext anyway.
                      onCustomerLoginSuccess?.({ name: '', email: '', phone: '' });
                      onClose();
                    }}
                  />
                ) : (
                  <>
                {customerError && (
                  <div role="alert" className="p-3 rounded-[var(--auth-radius-control)] bg-[var(--auth-banner-bg)] text-[var(--auth-error)] border border-[var(--auth-banner-border)] text-sm">
                    {customerError}
                  </div>
                )}

                <form onSubmit={handleVerifyCustomer} className="space-y-3">

                  <div>
                    <label className="block text-sm font-semibold text-[var(--auth-gold)] uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[var(--auth-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-3 bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] rounded-[var(--auth-radius-control)] text-sm text-[var(--auth-text)] placeholder:text-[var(--auth-text-muted)] focus:outline-none focus:border-[var(--auth-gold-soft)] focus:ring-2 focus:ring-[#C9972B]/25"
                      />
                    </div>
                  </div>


                  <div>
                    <label className="block text-sm font-semibold text-[var(--auth-gold)] uppercase tracking-wider mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[var(--auth-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        placeholder="••••••••"
                        value={customerPassword}
                        onChange={(e) => setCustomerPassword(e.target.value)}
                        className="w-full pl-9 pr-9 py-3 bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] rounded-[var(--auth-radius-control)] text-sm text-[var(--auth-text)] placeholder:text-[var(--auth-text-muted)] focus:outline-none focus:border-[var(--auth-gold-soft)] focus:ring-2 focus:ring-[#C9972B]/25"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label="Show or hide password"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--auth-text-secondary)] hover:text-[#FAF9F6]"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                  </div>

                  {customerFormMode === 'login' && (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="auth-check"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        <span className="text-sm text-[#E4DFD8]">Keep me signed in on this device</span>
                      </label>
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        className="auth-focus rounded text-sm font-semibold text-[var(--auth-gold)] hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}



                  <button
                    type="submit"
                    disabled={customerLoading}
                    className="auth-cta w-full py-4 font-medium text-[15px] uppercase tracking-[0.16em] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {customerSuccess ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Welcome Back!</span>
                      </>
                    ) : customerLoading ? (
                      <span>Signing in...</span>
                    ) : (
                      <span>Sign In to Account</span>
                    )}
                  </button>
                </form>
                  </>
                )}

                {/* Only the method toggle. There is no "Create Account" link
                    here on purpose: signing up is the mobile number, where
                    verifying a new one creates the account. Offering a second
                    way to register would ask for four fields to do what one
                    already does, and split customers across two account types
                    that this app deliberately does not merge. */}
                {LEGACY_EMAIL_AUTH_ENABLED && customerFormMode !== 'otp' && (
                  <div className="space-y-2.5 pt-1">
                    <div className="pt-3 border-t border-[var(--auth-divider)]">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerFormMode('otp');
                          setCustomerError(null);
                        }}
                        className="auth-focus w-full rounded text-center text-sm font-semibold text-[var(--auth-gold)] hover:text-[#E3B84B] transition-colors cursor-pointer"
                      >
                        Use Phone Number
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </MotionConfig>
  );
};

/** Gold-leaf and pink-petal ornaments for the two upper corners. Purely decorative. */
const BotanicalCorners: React.FC = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
    <svg
      className="absolute left-0 top-0 w-[80px] sm:w-[124px] h-auto drop-shadow-[0_0_6px_rgba(227,184,75,0.35)]"
      viewBox="0 0 120 160"
      fill="none"
    >
      <OrnamentDefs id="orn-tl" />
      <Leaf id="orn-tl" transform="translate(-6 -4) rotate(12) scale(1.05)" />
      <Leaf id="orn-tl" transform="translate(-8 0) rotate(38) scale(1.1)" />
      <Leaf id="orn-tl" transform="translate(-4 4) rotate(62) scale(0.95)" />
      <Leaf id="orn-tl" transform="translate(-2 2) rotate(86) scale(0.8)" />
      <Petal id="orn-tl" transform="translate(60 66) rotate(-42) scale(0.95)" />
      <Petal id="orn-tl" transform="translate(28 84) rotate(62) scale(1.05)" />
      <g fill="#E8D5A8">
        <circle cx="70" cy="22" r="1.1" />
        <circle cx="52" cy="40" r="0.8" />
        <circle cx="84" cy="44" r="0.7" />
        <circle cx="20" cy="70" r="0.9" />
      </g>
    </svg>
    <svg
      className="absolute right-0 top-[64px] sm:top-[86px] w-[46px] sm:w-[66px] h-auto drop-shadow-[0_0_6px_rgba(227,184,75,0.3)]"
      viewBox="0 0 66 124"
      fill="none"
    >
      <OrnamentDefs id="orn-tr" />
      <Leaf id="orn-tr" transform="translate(70 118) rotate(-118) scale(1.05)" />
      <Petal id="orn-tr" transform="translate(6 104) rotate(-52) scale(1.25)" />
      <g fill="#E8D5A8">
        <circle cx="40" cy="20" r="0.9" />
        <circle cx="22" cy="62" r="0.7" />
      </g>
    </svg>
  </div>
);
