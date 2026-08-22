/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { Lock, Mail, Key, ShieldCheck, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { normalizeEmail } from '../../utils/formValidation';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { adminLogin } = useCMS();
  const [email, setEmail] = useState('tryweb@gmail.com');
  const [password, setPassword] = useState('12345');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const cleanEmail = normalizeEmail(email);
      setEmail(cleanEmail);
      const res = await adminLogin(cleanEmail, password);
      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || 'Invalid administrator credentials');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemo = () => {
    setEmail('tryweb@gmail.com');
    setPassword('12345');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0B0B]/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md"
      >
        {/* Ambient gold glow behind the card */}
        <div className="absolute -inset-4 rounded-[28px] bg-[#C9972B]/10 blur-2xl pointer-events-none" />

        <div className="relative bg-[#171717] border border-[#C9972B]/25 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.55)] overflow-hidden">
          {/* Gold top accent bar */}
          <div className="h-1 bg-gradient-to-r from-[#C9972B] via-[#E3B84B] to-[#C9972B]" />

          {/* Header */}
          <div className="relative px-8 pt-8 pb-6 bg-gradient-to-b from-[#0B0B0B] to-[#171717] border-b border-[#E8D5A8]/15 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-[#C9972B]/20 to-[#C9972B]/5 border border-[#C9972B]/40 text-[#E3B84B] mb-3 shadow-[0_0_20px_rgba(201,151,43,0.15)]">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-2xl font-light tracking-wide text-[#FAF9F6]">
              GLAMIRK <span className="font-sans text-xs tracking-widest text-[#C9972B] uppercase">Admin Portal</span>
            </h2>
            <p className="text-xs text-[#6B6B6B] mt-1">
              Central content management & real-time store administration
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#F05A7E]/10 border border-[#F05A7E]/30 text-[#F05A7E] text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Demo Fill Helper */}
          <div className="p-3 rounded-lg bg-[#0B0B0B]/60 border border-[#E8D5A8]/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[#E8D5A8]">
              <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
              <span>Demo Admin Credentials</span>
            </div>
            <button
              type="button"
              onClick={fillDemo}
              className="text-[11px] font-semibold text-[#F05A7E] hover:underline cursor-pointer"
            >
              Auto-Fill
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#E8D5A8] mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tryweb@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[#FAF9F6] text-sm focus:outline-none focus:border-[#C9972B] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#E8D5A8] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[#FAF9F6] text-sm focus:outline-none focus:border-[#C9972B] transition-colors"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs tracking-widest uppercase rounded-lg transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span>Verifying Security...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Access CMS Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[#6B6B6B] hover:text-[#FAF9F6] transition-colors cursor-pointer"
            >
              Return to Public Storefront
            </button>
          </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
