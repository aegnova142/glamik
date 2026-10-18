/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { MobileOtpSignIn } from './MobileOtpSignIn';
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
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0B0B]/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md sm:max-w-3xl bg-[#171717] border border-[#E8D5A8]/30 rounded-2xl shadow-2xl overflow-hidden my-8 sm:flex sm:items-stretch"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            // The icon carries no text, so without this the control is
            // announced as an unlabelled button.
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-full text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#0B0B0B] transition-colors cursor-pointer z-10"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>

          {/* Left panel: why signing in is worth it. Static — it carries no
              state and no controls, so on a phone it collapses to a compact
              header instead of pushing the form below the fold. */}
          <div className="sm:w-[44%] sm:shrink-0 bg-[#0B0B0B] border-b sm:border-b-0 sm:border-r border-[#E8D5A8]/20 p-6 sm:p-8 sm:flex sm:flex-col sm:justify-center">
            <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#C9972B]">
              GLAMIRK ATELIER
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#FAF9F6] mt-1.5 tracking-wider">
              {customerFormMode === 'forgot' ? 'Reset Password' : 'Login'}
            </h2>
            <p className="hidden sm:block text-[12.5px] text-[#9C9689] mt-3 leading-relaxed">
              {customerFormMode === 'forgot'
                ? 'We’ll help you get back into your account.'
                : 'Login to access your orders, saved shades, Privé rewards and recommendations made for you.'}
            </p>
            <p className="sm:hidden text-xs text-[#6B6B6B] mt-1">
              {customerFormMode === 'forgot'
                ? 'We’ll help you get back into your account'
                : 'Access your orders, saved shades and rewards'}
            </p>
          </div>

          {/* Right panel: the form itself. */}
          <div className="flex-1 min-w-0">
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
            </p>
          </div>

          <div className="p-6">
            {LEGACY_EMAIL_AUTH_ENABLED && customerFormMode === 'forgot' ? (
              <div className="space-y-4">
                {forgotStep === 'request' && (
                  <form onSubmit={handleRequestReset} className="space-y-4">
                    <p className="text-xs text-[#6B6B6B] leading-relaxed">
                      Enter the email address on your account and we’ll get you a reset link.
                    </p>

                    {forgotError && (
                      <div className="p-2.5 rounded bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30 text-xs">
                        {forgotError}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          placeholder="you@example.com"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
                    >
                      {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomerFormMode('login');
                        setForgotError(null);
                      }}
                      className="w-full text-center text-[11px] text-[#6B6B6B] hover:text-[#FAF9F6] cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                  </form>
                )}

                {forgotStep === 'reset' && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="p-2.5 rounded-lg bg-[#0B0B0B]/60 border border-[#E8D5A8]/15 text-[10.5px] text-[#6B6B6B] leading-relaxed">
                      Email delivery isn’t configured in this environment, so instead of emailing your reset
                      link we’ve unlocked the next step right here — just set your new password below.
                    </div>

                    {forgotError && (
                      <div className="p-2.5 rounded bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30 text-xs">
                        {forgotError}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onFocus={() => setShowNewPasswordChecklist(true)}
                          className="w-full pl-9 pr-9 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#FAF9F6]"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {showNewPasswordChecklist && (
                        <ul className="mt-2 space-y-1 p-2.5 rounded-lg bg-[#0B0B0B]/60 border border-[#E8D5A8]/15">
                          {newPasswordRequirements.map((req) => (
                            <li
                              key={req.id}
                              className={`flex items-center gap-1.5 text-[10.5px] transition-colors ${
                                req.met ? 'text-[#C9972B]' : 'text-[#6B6B6B]'
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
                      <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          placeholder="••••••••"
                          value={newPasswordConfirm}
                          onChange={(e) => setNewPasswordConfirm(e.target.value)}
                          className={`w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B] ${
                            newPasswordConfirm && newPasswordConfirm !== newPassword ? 'border-[#F05A7E]/60' : 'border-[#E8D5A8]/30'
                          }`}
                        />
                      </div>
                      {newPasswordConfirm && newPasswordConfirm !== newPassword && (
                        <p className="text-[10.5px] text-[#F05A7E] mt-1">Passwords do not match.</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
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
                      <p className="text-xs text-[#6B6B6B] mt-1">
                        Your password has been updated and you’re signed in.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onCustomerLoginSuccess?.({ name: '', email: customerEmail, phone: '' });
                        onClose();
                      }}
                      className="w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                    >
                      Continue
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
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
                  <div className="p-2.5 rounded bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30 text-xs">
                    {customerError}
                  </div>
                )}

                <form onSubmit={handleVerifyCustomer} className="space-y-3">

                  <div>
                    <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                      />
                    </div>
                  </div>


                  <div>
                    <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={customerPassword}
                        onChange={(e) => setCustomerPassword(e.target.value)}
                        className="w-full pl-9 pr-9 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#FAF9F6]"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                  </div>

                  {customerFormMode === 'login' && (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          type="button"
                          onClick={() => setRememberMe(!rememberMe)}
                          className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                            rememberMe ? 'bg-[#C9972B] border-[#C9972B]' : 'border-[#E8D5A8]/40 bg-[#0B0B0B]'
                          }`}
                        >
                          {rememberMe && <Check className="w-3 h-3 text-[#0B0B0B]" />}
                        </button>
                        <span className="text-[11px] text-[#6B6B6B]">Remember me</span>
                      </label>
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        className="text-[11px] font-semibold text-[#C9972B] hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}



                  <button
                    type="submit"
                    disabled={customerLoading}
                    className="w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {/* This form only ever signs in, so there is no second
                        wording to choose between. */}
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
                    <div className="pt-2 border-t border-[#E8D5A8]/10">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerFormMode('otp');
                          setCustomerError(null);
                        }}
                        className="w-full text-center text-[11.5px] font-semibold text-[#C9972B] hover:text-[#E3B84B] transition-colors cursor-pointer"
                      >
                        Use Phone Number
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
