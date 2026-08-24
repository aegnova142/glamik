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
import { isGoogleSignInConfigured, requestGoogleAccessToken } from '../../utils/googleAuth';
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
} from '../../utils/formValidation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerLoginSuccess?: (user: { name: string; email: string; phone: string }) => void;
  // Deep-link support: when set (e.g. from a ?resetToken=... emailed link),
  // the modal opens straight into the "set new password" step with this
  // token pre-filled instead of the normal sign-in form.
  initialResetToken?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onCustomerLoginSuccess,
  initialResetToken,
}) => {
  const { customerLogin, customerLoginWithGoogle, customerRegister, requestPasswordReset, resetPassword } = useCustomerAuth();

  // Customer Login State — real accounts, backed by Postgres via /api/customer/auth
  const [customerFormMode, setCustomerFormMode] = useState<'login' | 'register' | 'forgot'>('login');
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
  const [googleComingSoon, setGoogleComingSoon] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
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

  const handleGoogleSignIn = async () => {
    if (!isGoogleSignInConfigured()) {
      setGoogleComingSoon(true);
      return;
    }
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      const accessToken = await requestGoogleAccessToken();
      const res = await customerLoginWithGoogle(accessToken, rememberMe);
      if (!res.success) {
        setGoogleError(res.error || 'Google sign-in failed.');
        return;
      }
      setCustomerSuccess(true);
      setTimeout(() => {
        onCustomerLoginSuccess?.({ name: '', email: '', phone: '' });
        onClose();
      }, 500);
    } catch (err: any) {
      setGoogleError(err?.message || 'Google sign-in was cancelled.');
    } finally {
      setGoogleLoading(false);
    }
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
              {customerFormMode === 'forgot' ? 'Reset Your Password' : 'Customer Sign In'}
            </h2>
            <p className="text-xs text-[#6B6B6B] mt-1">
              {customerFormMode === 'forgot'
                ? 'We’ll help you get back into your account'
                : 'Access your beauty profile, saved shades, and Privé points'}
            </p>
          </div>

          <div className="p-6">
            {customerFormMode === 'forgot' ? (
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
                {/* Login / Register mode selector */}
                <div className="flex justify-center gap-4 text-xs pb-2 border-b border-[#E8D5A8]/10">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerFormMode('login');
                      setCustomerError(null);
                    }}
                    className={`font-semibold pb-1 border-b-2 transition-all cursor-pointer ${
                      customerFormMode === 'login'
                        ? 'border-[#C9972B] text-[#C9972B]'
                        : 'border-transparent text-[#6B6B6B]'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerFormMode('register');
                      setCustomerError(null);
                    }}
                    className={`font-semibold pb-1 border-b-2 transition-all cursor-pointer ${
                      customerFormMode === 'register'
                        ? 'border-[#C9972B] text-[#C9972B]'
                        : 'border-transparent text-[#6B6B6B]'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

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

                {/* OR divider */}
                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#E8D5A8]/15" />
                  <span className="text-[10px] uppercase tracking-wider text-[#6B6B6B]">Or</span>
                  <span className="flex-1 h-px bg-[#E8D5A8]/15" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full py-2.5 px-3 bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#C9972B">
                    <path d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" />
                    <path d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1A12 12 0 0 0 12 24z" />
                    <path d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.26a12 12 0 0 0 0 10.74z" />
                    <path d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.63l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
                  </svg>
                  <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
                </button>
                {googleComingSoon && (
                  <p className="text-[10.5px] text-center text-[#6B6B6B]">Google sign-in is coming soon — please use email for now.</p>
                )}
                {googleError && (
                  <p className="text-[10.5px] text-center text-[#F05A7E]">{googleError}</p>
                )}

                <p className="text-center text-[11px] text-[#6B6B6B]">
                  {customerFormMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerFormMode(customerFormMode === 'login' ? 'register' : 'login');
                      setCustomerError(null);
                    }}
                    className="font-semibold text-[#C9972B] hover:underline cursor-pointer"
                  >
                    {customerFormMode === 'login' ? 'Create Account' : 'Login'}
                  </button>
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
