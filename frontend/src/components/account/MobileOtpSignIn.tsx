/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  MessageSquare,
  Smartphone,
  ArrowLeft,
  CheckCircle,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  useCustomerAuth,
  OtpDeliveryMethod,
  OtpChannelAvailability,
} from '../../context/CustomerAuthContext';
import {
  COUNTRY_PHONE_RULES,
  DEFAULT_COUNTRY_CODE,
  sanitizePhoneDigits,
  getCountryRule,
} from '@glamirk/shared/utils/formValidation';

/**
 * Mobile + OTP sign-in.
 *
 * Three steps: the number, where to send the code, then the code itself.
 * Delivery choice is its own step because it is a decision, and burying a
 * radio pair under a phone field is how people end up not noticing they had
 * one.
 *
 * The countdown here is presentation only. Every rule that decides whether a
 * code is accepted — the 60-second expiry, single use, the attempt cap,
 * resend throttling, the daily request quota — is enforced by the server
 * against the stored row, so a paused tab, a clock skew or a tampered timer
 * changes nothing.
 *
 * Two consequences of that worth stating, because they drive the code below:
 *
 *   * `expiresAt` and `resendAvailableAt` arrive as ABSOLUTE instants and the
 *     countdowns are derived from them on every tick, rather than a counter
 *     started at 60 and decremented. A slow request cannot leave the display
 *     ahead of the server.
 *   * The challenge is mirrored into sessionStorage, so refreshing or
 *     reopening the tab mid-flow resumes the same challenge at the correct
 *     remaining time instead of restarting at 60 seconds or dumping the
 *     customer back at the phone field.
 */

/** Digits in the code — matches OTP_LENGTH on the server. */
const OTP_LENGTH = 6;

/** Session-scoped on purpose: a sign-in attempt should not outlive the tab. */
const CHALLENGE_STORAGE_KEY = 'glamirk_otp_challenge';

type Step = 'phone' | 'method' | 'code';

interface PersistedChallenge {
  challengeId: string;
  maskedPhone: string;
  method: OtpDeliveryMethod;
  expiresAt: string;
  resendAvailableAt: string;
  countryCode: string;
  phone: string;
}

function readPersisted(): PersistedChallenge | null {
  try {
    const raw = sessionStorage.getItem(CHALLENGE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedChallenge) : null;
  } catch {
    return null;
  }
}

function writePersisted(value: PersistedChallenge | null): void {
  try {
    if (value) sessionStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
  } catch {
    /* Private mode / quota — the flow still works, it just won't survive a refresh. */
  }
}

interface MobileOtpSignInProps {
  /** Fired once the customer is signed in and the session is stored. */
  onSuccess: (info: { isNewAccount: boolean }) => void;
  /** Escape hatch to the email + password form. Omitted when that form is
   * switched off (see LEGACY_EMAIL_AUTH_ENABLED in AuthModal), in which case
   * no link is rendered and OTP is the only way in. */
  onUsePassword?: () => void;
  remember: boolean;
  onToggleRemember: () => void;
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export const MobileOtpSignIn: React.FC<MobileOtpSignInProps> = ({
  onSuccess,
  onUsePassword,
  remember,
  onToggleRemember,
}) => {
  const { fetchOtpChannels, requestOtp, verifyOtp } = useCustomerAuth();

  // Restored synchronously so a refresh never flashes the phone step first.
  const restored = useMemo(() => {
    const saved = readPersisted();
    if (!saved) return null;
    const live = new Date(saved.expiresAt).getTime() > Date.now() || new Date(saved.resendAvailableAt).getTime() > Date.now();
    if (!live) {
      // Challenge is dead and resend is already free — nothing to resume, but
      // the number is still worth keeping so they don't retype it.
      writePersisted(null);
      return { ...saved, dead: true as const };
    }
    return { ...saved, dead: false as const };
  }, []);

  const [step, setStep] = useState<Step>(restored && !restored.dead ? 'code' : 'phone');
  const [countryCode, setCountryCode] = useState(restored?.countryCode || DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState(restored?.phone || '');
  // SMS is the default and stays selected unless the customer changes it.
  const [method, setMethod] = useState<OtpDeliveryMethod>(restored?.method || 'sms');
  const [channels, setChannels] = useState<OtpChannelAvailability | null>(null);

  const [challengeId, setChallengeId] = useState<string | null>(
    restored && !restored.dead ? restored.challengeId : null
  );
  const [maskedPhone, setMaskedPhone] = useState(restored?.maskedPhone || '');
  const [sentVia, setSentVia] = useState<OtpDeliveryMethod>(restored?.method || 'sms');
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(
    restored && !restored.dead ? new Date(restored.expiresAt).getTime() : null
  );
  const [resendAtMs, setResendAtMs] = useState<number | null>(
    restored && !restored.dead ? new Date(restored.resendAvailableAt).getTime() : null
  );
  const [now, setNow] = useState(() => Date.now());

  const [code, setCode] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  /** Set when the code is dead (expired / burnt through its attempts): the
   * only useful action left is requesting a new one. */
  const [mustResend, setMustResend] = useState(false);
  /** Set when the number has spent its daily allowance — no send will succeed
   * until some of it ages out, so the buttons stay disabled. */
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  const activeRule = getCountryRule(countryCode);

  // Which channels the server can actually deliver on. Fetched once so the
  // picker never offers an option that would fail after the customer chose it.
  useEffect(() => {
    let cancelled = false;
    fetchOtpChannels().then((available) => {
      if (cancelled) return;
      setChannels(available);
      // If SMS isn't configured but WhatsApp is, preselect the one that works
      // rather than defaulting to a channel that cannot send.
      if (!available.sms && available.whatsapp) setMethod('whatsapp');
    });
    return () => {
      cancelled = true;
    };
  }, [fetchOtpChannels]);

  // One ticker drives both countdowns, and only while something is counting.
  useEffect(() => {
    if (step !== 'code') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  const secondsLeft = expiresAtMs ? Math.max(0, Math.ceil((expiresAtMs - now) / 1000)) : 0;
  const resendInSeconds = resendAtMs ? Math.max(0, Math.ceil((resendAtMs - now) / 1000)) : 0;
  const expired = step === 'code' && expiresAtMs !== null && secondsLeft === 0;
  const canResend = step === 'code' && resendInSeconds === 0 && !sending && !dailyLimitReached;

  const smsAvailable = channels ? channels.sms : true;
  const whatsappAvailable = channels ? channels.whatsapp : false;
  const noChannelAvailable = channels !== null && !channels.sms && !channels.whatsapp;

  const fullNumberForDisplay = useMemo(() => `${countryCode} ${phone}`, [countryCode, phone]);

  // Focus the first box when resuming a restored challenge.
  useEffect(() => {
    if (step === 'code') window.setTimeout(() => inputsRef.current[0]?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------
  // Step 1 — the number
  // ------------------------------------------

  const validatePhone = (): string | null => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return 'Please enter your mobile number.';
    if (countryCode === '+91') {
      // Matches what the server will accept, so an obviously wrong number is
      // caught before it costs the customer one of their daily requests.
      if (!/^[6-9]\d{9}$/.test(digits)) return 'Please enter a valid 10-digit Indian mobile number.';
    } else if (digits.length < activeRule.minDigits || digits.length > activeRule.maxDigits) {
      return `${activeRule.label} mobile number must be ${activeRule.minDigits}-${activeRule.maxDigits} digits.`;
    }
    return null;
  };

  const handleContinueFromPhone = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = validatePhone();
    if (problem) {
      setError(problem);
      return;
    }
    setStep('method');
  };

  // ------------------------------------------
  // Step 2 / resend — sending the code
  // ------------------------------------------

  const sendOtp = useCallback(
    async (chosen: OtpDeliveryMethod, { isResend = false }: { isResend?: boolean } = {}) => {
      setSending(true);
      setError(null);
      setNotice(null);

      const result = await requestOtp({ phone, countryCode, method: chosen });
      setSending(false);

      if (!result.success) {
        setError(result.error || "We couldn't send the OTP right now. Please try again.");
        if (result.dailyLimitReached) {
          setDailyLimitReached(true);
          return;
        }
        // A channel with no provider configured will never succeed on retry,
        // so point at the one that can instead of inviting another attempt.
        if (result.channelAvailable === false && chosen === 'whatsapp' && smsAvailable) {
          setNotice('WhatsApp OTP is unavailable right now — choose SMS to continue.');
          setStep('method');
          setMethod('sms');
        } else if (!isResend) {
          setStep('method');
        }
        // On a failed resend we stay on the code screen: the previous code may
        // still be live, and the retry-after countdown is already running.
        return;
      }

      const nextExpiresAt = result.expiresAt || new Date(Date.now() + 60_000).toISOString();
      const nextResendAt = result.resendAvailableAt || new Date(Date.now() + 60_000).toISOString();

      setChallengeId(result.challengeId || null);
      setSentVia(chosen);
      setMaskedPhone(result.maskedPhone || fullNumberForDisplay);
      setExpiresAtMs(new Date(nextExpiresAt).getTime());
      setResendAtMs(new Date(nextResendAt).getTime());
      setNow(Date.now());
      setCode(Array(OTP_LENGTH).fill(''));
      setMustResend(false);
      setStep('code');
      if (isResend) setNotice('A new OTP has been sent.');

      if (result.challengeId) {
        writePersisted({
          challengeId: result.challengeId,
          maskedPhone: result.maskedPhone || fullNumberForDisplay,
          method: chosen,
          expiresAt: nextExpiresAt,
          resendAvailableAt: nextResendAt,
          countryCode,
          phone,
        });
      }

      window.setTimeout(() => inputsRef.current[0]?.focus(), 50);
    },
    [countryCode, phone, requestOtp, fullNumberForDisplay, smsAvailable]
  );

  // ------------------------------------------
  // Step 3 — the code
  // ------------------------------------------

  const submitCode = useCallback(
    async (value: string) => {
      if (value.length !== OTP_LENGTH || verifying || !challengeId) return;
      setVerifying(true);
      setError(null);
      setNotice(null);

      const result = await verifyOtp({ challengeId, code: value, remember });
      setVerifying(false);

      if (!result.success) {
        setError(result.error || 'Incorrect OTP. Please try again.');
        if (result.mustResend) {
          setMustResend(true);
        } else {
          // Clear and refocus so the next attempt doesn't need manual editing.
          setCode(Array(OTP_LENGTH).fill(''));
          window.setTimeout(() => inputsRef.current[0]?.focus(), 50);
        }
        return;
      }

      // The challenge is spent — don't leave it where a refresh would resume it.
      writePersisted(null);
      setSucceeded(true);
      window.setTimeout(() => onSuccess({ isNewAccount: !!result.isNewAccount }), 700);
    },
    [challengeId, remember, verifyOtp, verifying, onSuccess]
  );

  const setDigit = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      const next = [...code];
      next[index] = '';
      setCode(next);
      return;
    }

    const next = [...code];
    // Handles both a single keystroke and a pasted/autofilled full code:
    // everything from this box onward is filled from what arrived.
    for (let i = 0; i < digits.length && index + i < OTP_LENGTH; i++) {
      next[index + i] = digits[i];
    }
    setCode(next);

    const landedAt = Math.min(index + digits.length, OTP_LENGTH - 1);
    inputsRef.current[landedAt]?.focus();

    // Empty boxes contribute nothing to the join, so a full-length string
    // means every box is filled. Verify without making them hunt for the
    // button — the usual reason a code sits unsubmitted.
    const joined = next.join('');
    if (joined.length === OTP_LENGTH) {
      void submitCode(joined);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      e.preventDefault();
      const next = [...code];
      next[index - 1] = '';
      setCode(next);
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    setDigit(index, pasted);
  };

  const resetToPhone = () => {
    writePersisted(null);
    setStep('phone');
    setError(null);
    setNotice(null);
    setMustResend(false);
    setChallengeId(null);
    setCode(Array(OTP_LENGTH).fill(''));
    setExpiresAtMs(null);
    setResendAtMs(null);
  };

  // ------------------------------------------
  // Shared bits of chrome
  // ------------------------------------------

  const errorBanner = error && (
    <div
      role="alert"
      className="flex items-start gap-2 p-2.5 rounded bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30 text-xs"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>{error}</span>
    </div>
  );

  const noticeBanner = notice && !error && (
    <div
      role="status"
      className="flex items-start gap-2 p-2.5 rounded bg-[#C9972B]/15 text-[#E8D5A8] border border-[#C9972B]/30 text-xs"
    >
      <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>{notice}</span>
    </div>
  );

  const primaryButtonClass =
    'w-full py-3 bg-[#C9972B] hover:bg-[#E3B84B] text-[#0B0B0B] font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

  return (
    <div className="space-y-4">
      {noChannelAvailable && (
        <div className="p-2.5 rounded-lg bg-[#0B0B0B]/60 border border-[#E8D5A8]/15 text-[10.5px] text-[#6B6B6B] leading-relaxed">
          {onUsePassword
            ? 'OTP sign-in isn’t available right now — please sign in with your email and password instead.'
            : 'Sign-in is temporarily unavailable. Please try again in a little while, or contact us if it persists.'}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ---------------- Step 1: mobile number ---------------- */}
        {step === 'phone' && (
          <motion.form
            key="phone"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            onSubmit={handleContinueFromPhone}
            className="space-y-4"
          >
            <p className="text-xs text-[#6B6B6B] leading-relaxed">
              Enter your mobile number and we’ll send you a one-time code. No password needed.
            </p>

            {errorBanner}

            <div>
              <label
                htmlFor="otp-mobile"
                className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1"
              >
                Mobile Number
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="Country code"
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    setPhone((prev) => sanitizePhoneDigits(prev, getCountryRule(e.target.value).maxDigits));
                    setError(null);
                  }}
                  className="shrink-0 px-2 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                >
                  {COUNTRY_PHONE_RULES.filter(
                    (c) => !channels?.countryCodes?.length || channels.countryCodes.includes(c.code)
                  ).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.label}
                    </option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <Phone className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="otp-mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    autoFocus
                    required
                    placeholder={`${activeRule.minDigits} digit number`}
                    value={phone}
                    onChange={(e) => {
                      setPhone(sanitizePhoneDigits(e.target.value, activeRule.maxDigits));
                      setError(null);
                      setDailyLimitReached(false);
                    }}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-sm tracking-wider font-mono text-[#FAF9F6] focus:outline-none focus:border-[#C9972B]"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={onToggleRemember}
                aria-pressed={remember}
                className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                  remember ? 'bg-[#C9972B] border-[#C9972B]' : 'border-[#E8D5A8]/40 bg-[#0B0B0B]'
                }`}
              >
                {remember && <Check className="w-3 h-3 text-[#0B0B0B]" />}
              </button>
              <span className="text-[11px] text-[#6B6B6B]">Keep me signed in</span>
            </label>

            <button type="submit" disabled={noChannelAvailable} className={primaryButtonClass}>
              Continue
            </button>

            {onUsePassword && (
              <button
                type="button"
                onClick={onUsePassword}
                className="w-full text-center text-[11px] text-[#6B6B6B] hover:text-[#FAF9F6] cursor-pointer"
              >
                Sign in with email and password instead
              </button>
            )}

            <p className="text-center text-[10.5px] text-[#6B6B6B] leading-relaxed">
              New here? No need to sign up separately — verifying your number creates your account.
            </p>
          </motion.form>
        )}

        {/* ---------------- Step 2: where to send it ---------------- */}
        {step === 'method' && (
          <motion.div
            key="method"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#FAF9F6] font-semibold">Where should we send your OTP?</p>
              <button
                type="button"
                onClick={resetToPhone}
                className="shrink-0 text-[11px] text-[#C9972B] hover:underline cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Change
              </button>
            </div>

            <p className="text-[11px] text-[#6B6B6B] font-mono tracking-wide">{fullNumberForDisplay}</p>

            {errorBanner}
            {noticeBanner}

            <div role="radiogroup" aria-label="OTP delivery method" className="space-y-2">
              {([
                { value: 'sms' as const, label: 'SMS', icon: Smartphone, emoji: '📱', available: smsAvailable },
                {
                  value: 'whatsapp' as const,
                  label: 'WhatsApp',
                  icon: MessageSquare,
                  emoji: '💬',
                  available: whatsappAvailable,
                },
              ]).map((option) => {
                const selected = method === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!option.available}
                    onClick={() => {
                      setMethod(option.value);
                      setError(null);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected
                        ? 'border-[#C9972B] bg-[#C9972B]/10 ring-1 ring-[#C9972B]/40'
                        : 'border-[#E8D5A8]/25 bg-[#0B0B0B] hover:border-[#E8D5A8]/50'
                    }`}
                  >
                    {/* Radio dot — filled when selected, so the state reads at
                        a glance without relying on the border tint alone. */}
                    <span
                      className={`w-4 h-4 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                        selected ? 'border-[#C9972B]' : 'border-[#E8D5A8]/40'
                      }`}
                    >
                      {selected && <span className="w-2 h-2 rounded-full bg-[#C9972B]" />}
                    </span>
                    <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-[#C9972B]' : 'text-[#6B6B6B]'}`} />
                    <span className={`text-xs font-semibold ${selected ? 'text-[#FAF9F6]' : 'text-[#6B6B6B]'}`}>
                      {option.emoji} {option.label}
                    </span>
                    {!option.available && (
                      <span className="ml-auto text-[10px] text-[#6B6B6B] uppercase tracking-wider">Unavailable</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Both channels draw on one daily allowance, so it's worth saying
                plainly rather than letting someone discover it by switching. */}
            <p className="text-[10px] text-[#6B6B6B] text-center">
              SMS and WhatsApp share the same daily OTP limit.
            </p>

            <button
              type="button"
              onClick={() => void sendOtp(method)}
              disabled={sending || noChannelAvailable || dailyLimitReached}
              className={primaryButtonClass}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending OTP…</span>
                </>
              ) : (
                <span>Send OTP</span>
              )}
            </button>
          </motion.div>
        )}

        {/* ---------------- Step 3: enter the code ---------------- */}
        {step === 'code' && (
          <motion.div
            key="code"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <div className="text-center space-y-1">
              <h3 className="font-serif text-lg text-[#FAF9F6]">Enter the OTP</h3>
              <p className="text-xs text-[#6B6B6B]">
                {sentVia === 'whatsapp'
                  ? 'We sent a verification code to your WhatsApp number'
                  : 'We sent a verification code to'}
              </p>
              <p className="text-sm text-[#E8D5A8] font-mono tracking-wide">{maskedPhone}</p>
            </div>

            {errorBanner}
            {noticeBanner}

            {/* The six boxes. autoComplete="one-time-code" on the first lets
                iOS/Android offer the code straight from the notification; the
                paste handler spreads it across the rest. */}
            <div className="flex justify-center gap-2" onPaste={(e) => handlePaste(0, e)}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={OTP_LENGTH}
                  aria-label={`OTP digit ${i + 1}`}
                  value={digit}
                  disabled={succeeded || expired || mustResend}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`w-11 sm:w-12 py-3 text-center text-lg font-mono rounded-lg bg-[#0B0B0B] border text-[#FAF9F6] focus:outline-none transition-colors disabled:opacity-40 ${
                    error
                      ? 'border-[#F05A7E]/60 focus:border-[#F05A7E]'
                      : digit
                        ? 'border-[#C9972B] focus:border-[#C9972B]'
                        : 'border-[#E8D5A8]/30 focus:border-[#C9972B]'
                  }`}
                />
              ))}
            </div>

            {/* Countdown. aria-live is polite and only the expiry message is
                announced — a per-second reading would be unusable. */}
            <div className="text-center">
              {expired || mustResend ? (
                <p className="text-xs text-[#F05A7E]" role="status">
                  OTP expired. Please request a new OTP.
                </p>
              ) : (
                <p className="text-xs text-[#6B6B6B]">
                  OTP expires in{' '}
                  <span className="font-mono text-[#E8D5A8] tabular-nums">{formatCountdown(secondsLeft)}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void submitCode(code.join(''))}
              disabled={verifying || succeeded || expired || mustResend || code.join('').length !== OTP_LENGTH}
              className={primaryButtonClass}
            >
              {succeeded ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Login successful</span>
                </>
              ) : verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying…</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify &amp; Sign In</span>
                </>
              )}
            </button>

            <div className="text-center space-y-1">
              <p className="text-[11px] text-[#6B6B6B]">Didn’t receive the OTP?</p>
              <button
                type="button"
                onClick={() => void sendOtp(sentVia, { isResend: true })}
                disabled={!canResend || succeeded}
                className="text-[11px] font-semibold text-[#C9972B] hover:underline cursor-pointer disabled:text-[#6B6B6B] disabled:no-underline disabled:cursor-not-allowed"
              >
                {sending
                  ? 'Sending…'
                  : dailyLimitReached
                    ? 'Daily OTP limit reached'
                    : resendInSeconds > 0
                      ? `Resend OTP in ${formatCountdown(resendInSeconds)}`
                      : 'Resend OTP'}
              </button>
            </div>

            {!succeeded && (
              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={resetToPhone}
                  className="text-[11px] text-[#6B6B6B] hover:text-[#FAF9F6] cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Change number
                </button>
                <span className="w-px h-3 bg-[#E8D5A8]/20" />
                <button
                  type="button"
                  onClick={() => {
                    setStep('method');
                    setError(null);
                    setNotice(null);
                  }}
                  className="text-[11px] text-[#6B6B6B] hover:text-[#FAF9F6] cursor-pointer"
                >
                  Try another method
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
