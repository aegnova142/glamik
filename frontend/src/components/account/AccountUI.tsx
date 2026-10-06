/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

// ==========================================
// Shared building blocks for the account area.
//
// Every section renders the same four states — loading, error, empty and
// content — so they're defined once here rather than re-styled per screen.
// Colours are the storefront's existing tokens (near-black #0B0B0B/#121212,
// bone #FAF9F6, gold #C9972B/#E8D5A8) so the account reads as part of the
// same atelier, not a bolted-on dashboard.
// ==========================================

export const GOLD = '#C9972B';

export const AccountSectionHeader: React.FC<{
  kicker?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ kicker, title, description, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#E8D5A8]">
    <div className="space-y-1.5 min-w-0">
      {kicker && (
        <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B] block">{kicker}</span>
      )}
      <h1 className="font-serif text-2xl sm:text-3xl text-[#121212] leading-tight">{title}</h1>
      {description && <p className="text-xs sm:text-[13px] text-[#524C4C] leading-relaxed max-w-xl">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const AccountCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white border border-[#E8D5A8] rounded-xl ${className}`}>{children}</div>
);

export const AccountLoading: React.FC<{ label?: string; rows?: number }> = ({ label = 'Loading…', rows = 3 }) => (
  <div className="space-y-4" role="status" aria-live="polite">
    <div className="flex items-center gap-2.5 text-xs text-[#524C4C]">
      <Loader2 className="w-4 h-4 animate-spin text-[#C9972B]" />
      <span className="uppercase tracking-wider font-semibold">{label}</span>
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bg-white border border-[#E8D5A8] rounded-xl p-5 space-y-3 animate-pulse">
        <div className="h-3 w-1/3 bg-[#F1EBDD] rounded" />
        <div className="h-3 w-2/3 bg-[#F6F2E8] rounded" />
        <div className="h-3 w-1/2 bg-[#F6F2E8] rounded" />
      </div>
    ))}
  </div>
);

export const AccountError: React.FC<{ message?: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="bg-white border border-[#F05A7E]/30 rounded-xl p-8 text-center space-y-4">
    <AlertCircle className="w-9 h-9 text-[#F05A7E] mx-auto stroke-[1.4]" />
    <div className="space-y-1">
      <h3 className="font-serif text-lg text-[#121212]">Something went wrong</h3>
      <p className="text-xs text-[#524C4C] max-w-sm mx-auto leading-relaxed">
        {message || 'Something went wrong. Please try again.'}
      </p>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B0B0B] text-white text-[11px] font-semibold tracking-[0.16em] uppercase rounded-full hover:bg-[#171717] transition-colors cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Try again
      </button>
    )}
  </div>
);

export const AccountEmpty: React.FC<{
  icon: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}> = ({ icon: Icon, title, description, actionLabel, onAction, secondaryLabel, onSecondary }) => (
  <div className="bg-white border border-[#E8D5A8] rounded-xl p-10 sm:p-14 text-center space-y-5">
    <div className="w-14 h-14 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-center mx-auto">
      <Icon className="w-6 h-6 text-[#C9972B] stroke-[1.4]" />
    </div>
    <div className="space-y-1.5">
      <h3 className="font-serif text-xl text-[#121212]">{title}</h3>
      {description && <p className="text-xs text-[#524C4C] max-w-sm mx-auto leading-relaxed">{description}</p>}
    </div>
    {(actionLabel || secondaryLabel) && (
      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="px-6 py-3 bg-[#0B0B0B] text-white text-[11px] font-semibold tracking-[0.16em] uppercase rounded-full hover:bg-[#171717] transition-colors cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
        {secondaryLabel && onSecondary && (
          <button
            onClick={onSecondary}
            className="px-6 py-3 border border-[#0B0B0B] text-[#121212] text-[11px] font-semibold tracking-[0.16em] uppercase rounded-full hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    )}
  </div>
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[#0B0B0B] text-white border border-[#0B0B0B] hover:bg-[#171717]',
  secondary: 'bg-white text-[#121212] border border-[#0B0B0B] hover:bg-[#0B0B0B] hover:text-white',
  ghost: 'bg-white text-[#524C4C] border border-[#E8D5A8] hover:text-[#121212] hover:border-[#C9972B]',
  danger: 'bg-white text-[#C0392B] border border-[#C0392B]/40 hover:bg-[#C0392B] hover:text-white',
};

export const AccountButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  title?: string;
}> = ({ children, onClick, type = 'button', variant = 'primary', disabled, loading, fullWidth, className = '', title }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled || loading}
    title={title}
    className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-semibold tracking-[0.14em] uppercase rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
      BUTTON_STYLES[variant]
    } ${fullWidth ? 'w-full' : ''} ${className}`}
  >
    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    {children}
  </button>
);

/** Inline success/error strip used under forms. */
export const AccountFormMessage: React.FC<{ tone: 'success' | 'error'; message?: string | null }> = ({ tone, message }) => {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`text-xs px-3.5 py-2.5 rounded-lg border ${
        tone === 'success'
          ? 'bg-[#F3F8F3] border-[#2E7D32]/30 text-[#2E7D32]'
          : 'bg-[#FDF3F2] border-[#C0392B]/30 text-[#C0392B]'
      }`}
    >
      {message}
    </motion.div>
  );
};

export const AccountField: React.FC<{
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, hint, required, children, className = '' }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label htmlFor={htmlFor} className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#524C4C] block">
      {label} {required && <span className="text-[#C0392B]">*</span>}
    </label>
    {children}
    {hint && <p className="text-[10.5px] text-[#524C4C]">{hint}</p>}
  </div>
);

export const inputClass =
  'w-full px-3.5 py-2.5 bg-white border border-[#E8D5A8] rounded-lg text-[13px] text-[#121212] placeholder:text-[#B9B2A2] focus:outline-none focus:border-[#C9972B] focus:ring-1 focus:ring-[#C9972B]/30 transition-colors disabled:bg-[#FAF9F6] disabled:text-[#524C4C]';

export const AccountToggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? 'bg-[#C9972B]' : 'bg-[#DCD5C6]'
    }`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

/** Status pill shared by orders, returns and support tickets. */
export const StatusBadge: React.FC<{ status: string; tone?: 'neutral' | 'positive' | 'negative' | 'progress' }> = ({
  status,
  tone = 'neutral',
}) => {
  const tones: Record<string, string> = {
    neutral: 'bg-[#FAF9F6] text-[#524C4C] border-[#E8D5A8]',
    positive: 'bg-[#F3F8F3] text-[#2E7D32] border-[#2E7D32]/25',
    negative: 'bg-[#FDF3F2] text-[#C0392B] border-[#C0392B]/25',
    progress: 'bg-[#0B0B0B] text-[#E3B84B] border-[#0B0B0B]',
  };
  return (
    <span
      className={`inline-block px-2.5 py-1 border rounded-full text-[9.5px] font-bold tracking-[0.14em] uppercase whitespace-nowrap ${tones[tone]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export function formatMoney(value: number): string {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

export function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
