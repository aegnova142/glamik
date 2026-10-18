/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  X,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { MobileOtpSignIn } from './MobileOtpSignIn';
import {
  COUNTRY_PHONE_RULES,
  DEFAULT_COUNTRY_CODE,
  sanitizePhoneDigits,
  getCountryRule,
  validatePhoneNumber,
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
  const { customerLogin, customerRegister, requestPasswordReset, resetPassword } = useCustomerAuth();

  // Customer Login State — real accounts, backed by Postgres via /api/customer/auth
  // 'otp' — mobile number + one-time code — is where everyone lands. The
  // other three are reached from the tabs and the "use a password instead"
  // link, and disappear entirely when LEGACY_EMAIL_AUTH_ENABLED is false.
  const [customerFormMode, setCustomerFormMode] = useState<'otp' | 'login' | 'register' | 'forgot'>('otp');
  const [customerName, setCustomerName] = useState('');
  const [customerCountryCode, setCustomerCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [customerConfirmPassword, setCustomerConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPasswordChecklist, setShowPasswordChecklist] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
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

  const activePhoneRule = getCountryRule(customerCountryCode);
  const passwordRequirements = getPasswordRequirements(customerPassword);

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
      // Callers still ask for 'login'; that now means the OTP form, which is
      // what signing in is. Nothing outside this component had to change.
      setCustomerFormMode(initialMode === 'login' ? 'otp' : initialMode);
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

    if (customerFormMode === 'register') {
      const phoneCheck = validatePhoneNumber(customerCountryCode, customerPhone);
      if (!phoneCheck.valid) {
        setCustomerError(phoneCheck.error || 'Invalid mobile number.');
        return;
      }
      if (!isPasswordValid(customerPassword)) {
        setShowPasswordChecklist(true);
        setCustomerError('Your password doesn’t meet all requirements yet — check the list below.');
        return;
      }
      if (customerPassword !== customerConfirmPassword) {
        setCustomerError('Passwords do not match.');
        return;
      }
      if (!agreedToTerms) {
        setCustomerError('Please agree to the Terms & Privacy Policy to continue.');
        return;
      }
    }

    setCustomerEmail(cleanEmail);
    setCustomerLoading(true);

    const fullPhone = customerPhone ? `${customerCountryCode} ${customerPhone}` : undefined;
    const res =
      customerFormMode === 'login'
        ? await customerLogin(cleanEmail, customerPassword, rememberMe)
        : await customerRegister(customerName, cleanEmail, customerPassword, fullPhone);

    setCustomerLoading(false);

    if (!res.success) {
      setCustomerError(res.error || 'Something went wrong. Please try again.');
      return;
    }

    setCustomerSuccess(true);
    setTimeout(() => {
      onCustomerLoginSuccess?.({
        name: customerName || cleanEmail,
        email: cleanEmail,
        phone: fullPhone || '',
      });
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
          className="relative w-full max-w-md bg-[#171717] border border-[#E8D5A8]/30 rounded-2xl shadow-2xl overflow-hidden my-8"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#0B0B0B] transition-colors cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Top Brand Banner */}
          <div className="p-6 text-center bg-[#0B0B0B] border-b border-[#E8D5A8]/20">
            <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#C9972B]">
              GLAMIRK ATELIER AUTHENTICATION
            </span>
            <h2 className="font-serif text-2xl text-[#FAF9F6] mt-1 tracking-wider">
              {customerFormMode === 'forgot'
                ? 'Reset Your Password'
                : customerFormMode === 'register'
                  ? 'Create Your Account'
                  : 'Sign In or Sign Up'}
            </h2>
            {/* The subtitle names the method in play, so the toggle below has
                something to visibly change. */}
            <p className="text-xs text-[#6B6B6B] mt-1">
              {customerFormMode === 'forgot'
                ? 'We’ll help you get back into your account'
                : customerFormMode === 'otp'
                  ? 'Enter your mobile number — we’ll send a one-time code'
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
                  {customerFormMode === 'register' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          placeholder="Enter your full name"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                        />
                      </div>
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

                  {customerFormMode === 'register' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                        Mobile Number <span className="normal-case text-[#6B6B6B]">(optional)</span>
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={customerCountryCode}
                          onChange={(e) => {
                            setCustomerCountryCode(e.target.value);
                            setCustomerPhone((prev) => sanitizePhoneDigits(prev, getCountryRule(e.target.value).maxDigits));
                          }}
                          className="shrink-0 px-2 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                        >
                          {COUNTRY_PHONE_RULES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} {c.label}
                            </option>
                          ))}
                        </select>
                        <div className="relative flex-1">
                          <Phone className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="tel"
                            inputMode="numeric"
                            placeholder={activePhoneRule.minDigits === activePhoneRule.maxDigits ? `${activePhoneRule.minDigits} digit number` : 'Mobile number'}
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(sanitizePhoneDigits(e.target.value, activePhoneRule.maxDigits))}
                            className="w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-[#6B6B6B] mt-1">
                        {activePhoneRule.minDigits === activePhoneRule.maxDigits
                          ? `${activePhoneRule.label}: exactly ${activePhoneRule.minDigits} digits, numbers only.`
                          : `${activePhoneRule.label}: ${activePhoneRule.minDigits}-${activePhoneRule.maxDigits} digits, numbers only.`}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={customerFormMode === 'register' ? 8 : undefined}
                        placeholder="••••••••"
                        value={customerPassword}
                        onChange={(e) => setCustomerPassword(e.target.value)}
                        onFocus={() => customerFormMode === 'register' && setShowPasswordChecklist(true)}
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

                    {customerFormMode === 'register' && showPasswordChecklist && (
                      <ul className="mt-2 space-y-1 p-2.5 rounded-lg bg-[#0B0B0B]/60 border border-[#E8D5A8]/15">
                        {passwordRequirements.map((req) => (
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

                  {customerFormMode === 'register' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          placeholder="••••••••"
                          value={customerConfirmPassword}
                          onChange={(e) => setCustomerConfirmPassword(e.target.value)}
                          className={`w-full pl-9 pr-9 py-2.5 bg-[#0B0B0B] border rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B] ${
                            customerConfirmPassword && customerConfirmPassword !== customerPassword
                              ? 'border-[#F05A7E]/60'
                              : 'border-[#E8D5A8]/30'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#FAF9F6]"
                        >
                          {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {customerConfirmPassword && customerConfirmPassword !== customerPassword && (
                        <p className="text-[10.5px] text-[#F05A7E] mt-1">Passwords do not match.</p>
                      )}
                    </div>
                  )}

                  {customerFormMode === 'register' && (
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <button
                        type="button"
                        onClick={() => setAgreedToTerms(!agreedToTerms)}
                        className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                          agreedToTerms ? 'bg-[#C9972B] border-[#C9972B]' : 'border-[#E8D5A8]/40 bg-[#0B0B0B]'
                        }`}
                      >
                        {agreedToTerms && <Check className="w-3 h-3 text-[#0B0B0B]" />}
                      </button>
                      <span className="text-[11px] text-[#6B6B6B] leading-snug">
                        I agree to the <span className="text-[#E8D5A8] font-medium">Terms &amp; Privacy Policy</span>
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={customerLoading}
                    className="w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {customerSuccess ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>{customerFormMode === 'login' ? 'Welcome Back!' : 'Account Created!'}</span>
                      </>
                    ) : customerLoading ? (
                      <span>{customerFormMode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
                    ) : (
                      <span>{customerFormMode === 'login' ? 'Sign In to Account' : 'Create My Account'}</span>
                    )}
                  </button>
                </form>
                  </>
                )}

                {/* Both switches live together under the email form: one moves
                    between signing in and registering (same method), the other
                    returns to the mobile number (different method). Keeping the
                    method toggle in the same place on both screens is what
                    makes it read as one control rather than two. */}
                {LEGACY_EMAIL_AUTH_ENABLED && customerFormMode !== 'otp' && (
                  <div className="space-y-2.5 pt-1">
                    <p className="text-center text-[11px] text-[#6B6B6B]">
                      {customerFormMode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerFormMode(customerFormMode === 'register' ? 'login' : 'register');
                          setCustomerError(null);
                        }}
                        className="font-semibold text-[#C9972B] hover:underline cursor-pointer"
                      >
                        {customerFormMode === 'register' ? 'Sign In' : 'Create Account'}
                      </button>
                    </p>

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
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
