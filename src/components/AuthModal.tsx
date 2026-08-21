/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  ShieldCheck,
  X,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  CheckCircle,
  Sparkles,
  KeyRound,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useCMS } from '../context/CMSContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerLoginSuccess?: (user: { name: string; email: string; phone: string }) => void;
  onAdminLoginSuccess?: () => void;
  initialTab?: 'customer' | 'admin';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onCustomerLoginSuccess,
  onAdminLoginSuccess,
  initialTab = 'customer',
}) => {
  const { adminLogin } = useCMS();
  const [activeTab, setActiveTab] = useState<'customer' | 'admin'>(initialTab);

  // Customer Login State
  const [customerAuthMode, setCustomerAuthMode] = useState<'phone' | 'email'>('phone');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [customerSuccess, setCustomerSuccess] = useState(false);

  // Admin Login State
  const [adminEmail, setAdminEmail] = useState('tryweb@gmail.com');
  const [adminPassword, setAdminPassword] = useState('12345');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone || customerPhone.length < 8) return;
    setOtpSent(true);
    setEnteredOtp('1234'); // Pre-fill mock OTP for smooth testing
  };

  const handleVerifyCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomerSuccess(true);
    setTimeout(() => {
      onCustomerLoginSuccess?.({
        name: 'Aanya Sen',
        email: customerEmail || 'aanya.sen@glamirk.me',
        phone: customerPhone || '+91 98201 44521',
      });
      onClose();
    }, 800);
  };

  const handleQuickCustomerDemo = () => {
    setCustomerSuccess(true);
    setTimeout(() => {
      onCustomerLoginSuccess?.({
        name: 'Aanya Sen',
        email: 'aanya.sen@glamirk.me',
        phone: '+91 98201 44521',
      });
      onClose();
    }, 500);
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);

    const res = await adminLogin(adminEmail, adminPassword);
    setAdminLoading(false);

    if (res.success) {
      onAdminLoginSuccess?.();
      onClose();
    } else {
      setAdminError(res.error || 'Invalid administrator credentials');
    }
  };

  const handleFillAdminDemo = () => {
    setAdminEmail('tryweb@gmail.com');
    setAdminPassword('12345');
    setAdminError(null);
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
              {activeTab === 'customer' ? 'Customer Sign In' : 'Admin CMS Portal'}
            </h2>
            <p className="text-xs text-[#6B6B6B] mt-1">
              {activeTab === 'customer'
                ? 'Access your beauty profile, saved shades, and Privé points'
                : 'Manage product catalog, campaigns, pages, and store settings'}
            </p>

            {/* Tab Switcher */}
            <div className="mt-4 flex items-center p-1 bg-[#171717] rounded-xl border border-[#E8D5A8]/20">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('customer');
                  setAdminError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'customer'
                    ? 'bg-[#C9972B] text-[#0B0B0B] shadow-sm font-bold'
                    : 'text-[#6B6B6B] hover:text-[#FAF9F6]'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Customer Login</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('admin');
                  setAdminError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-[#F05A7E] text-[#FFFFFF] shadow-sm font-bold'
                    : 'text-[#6B6B6B] hover:text-[#FAF9F6]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin CMS</span>
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* TAB 1: CUSTOMER LOGIN */}
            {activeTab === 'customer' && (
              <div className="space-y-4">
                {/* Method selector */}
                <div className="flex justify-center gap-4 text-xs pb-2 border-b border-[#E8D5A8]/10">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerAuthMode('phone');
                      setOtpSent(false);
                    }}
                    className={`font-semibold pb-1 border-b-2 transition-all cursor-pointer ${
                      customerAuthMode === 'phone'
                        ? 'border-[#C9972B] text-[#C9972B]'
                        : 'border-transparent text-[#6B6B6B]'
                    }`}
                  >
                    Mobile OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerAuthMode('email');
                      setOtpSent(false);
                    }}
                    className={`font-semibold pb-1 border-b-2 transition-all cursor-pointer ${
                      customerAuthMode === 'email'
                        ? 'border-[#C9972B] text-[#C9972B]'
                        : 'border-transparent text-[#6B6B6B]'
                    }`}
                  >
                    Email &amp; Password
                  </button>
                </div>

                {customerAuthMode === 'phone' ? (
                  !otpSent ? (
                    <form onSubmit={handleSendOtp} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Mobile Number
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="tel"
                            required
                            placeholder="+91 98201 44521"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                      >
                        Send OTP Code
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyCustomer} className="space-y-3">
                      <div className="p-2.5 rounded bg-[#0B0B0B] text-center border border-[#E8D5A8]/20">
                        <span className="text-[11px] text-[#6B6B6B]">
                          Enter the 4-digit OTP code sent to{' '}
                          <strong className="text-[#FAF9F6]">{customerPhone}</strong>
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                          Enter OTP Code
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          placeholder="1234"
                          value={enteredOtp}
                          onChange={(e) => setEnteredOtp(e.target.value)}
                          className="w-full text-center tracking-widest text-lg font-mono py-2 bg-[#0B0B0B] border border-[#C9972B] rounded-lg text-[#FAF9F6] focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                      >
                        {customerSuccess ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Logged In!</span>
                          </>
                        ) : (
                          <span>Verify &amp; Enter My Glam</span>
                        )}
                      </button>
                    </form>
                  )
                ) : (
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
                          placeholder="aanya.sen@glamirk.me"
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

                    <button
                      type="submit"
                      className="w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                    >
                      {customerSuccess ? 'Welcome Back!' : 'Sign In to Account'}
                    </button>
                  </form>
                )}

                {/* Instant 1-Click Demo Login */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleQuickCustomerDemo}
                    className="w-full py-2.5 px-3 bg-[#0B0B0B] hover:bg-[#C9972B]/20 border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#E8D5A8] flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
                    <span>Instant 1-Click Demo Login (Aanya Sen)</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: ADMIN CMS LOGIN */}
            {activeTab === 'admin' && (
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                {/* Admin credentials reminder box */}
                <div className="p-3 rounded-lg bg-[#0B0B0B] border border-[#C9972B]/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-[#C9972B] font-bold">
                      Pre-Configured Admin Access
                    </span>
                    <button
                      type="button"
                      onClick={handleFillAdminDemo}
                      className="text-[10px] text-[#F05A7E] hover:underline font-semibold cursor-pointer"
                    >
                      ⚡ Auto-Fill Credentials
                    </button>
                  </div>
                  <p className="text-[11px] text-[#FAF9F6]">
                    Email: <span className="font-mono text-[#E3B84B]">tryweb@gmail.com</span> | Password:{' '}
                    <span className="font-mono text-[#E3B84B]">12345</span>
                  </p>
                </div>

                {adminError && (
                  <div className="p-2.5 rounded bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30 text-xs">
                    {adminError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Administrator Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Security Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
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

                <button
                  type="submit"
                  disabled={adminLoading}
                  className="w-full py-3 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{adminLoading ? 'Authenticating...' : 'Sign In to Admin CMS'}</span>
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
