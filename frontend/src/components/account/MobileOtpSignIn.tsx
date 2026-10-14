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
  ArrowRight,
  ChevronDown,
  Globe,
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
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

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

  // Focus the number field (without scrolling the header out of view on
  // short screens), or the first box when resuming a restored challenge.
  useEffect(() => {
    if (step === 'phone') phoneInputRef.current?.focus({ preventScroll: true });
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
    window.setTimeout(() => phoneInputRef.current?.focus({ preventScroll: true }), 250);
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
      className="flex items-start gap-2 p-3 rounded-[var(--auth-radius-control)] bg-[var(--auth-banner-bg)] text-[var(--auth-error)] border border-[var(--auth-banner-border)] text-sm"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
      <span>{error}</span>
    </div>
  );

  const noticeBanner = notice && !error && (
    <div
      role="status"
      className="flex items-start gap-2 p-3 rounded-[var(--auth-radius-control)] bg-[#C9972B]/10 text-[var(--auth-gold-soft)] border border-[#C9972B]/40 text-sm"
    >
      <CheckCircle className="w-4 h-4 shrink-0 mt-px" />
      <span>{notice}</span>
    </div>
  );

  const primaryButtonClass =
    'auth-cta w-full h-14 sm:h-16 flex items-center justify-center gap-3 text-[16px] sm:text-[19px] font-medium uppercase tracking-[0.08em] cursor-pointer';

  const inlinePhoneError = step === 'phone' && error;

  return (
    <div className="space-y-4">
      {(noChannelAvailable || step === 'phone') && (
        <div
          // Space is reserved while channel availability loads, so the form
          // doesn't jump — but nothing is claimed until the server answers.
          className={`flex items-center gap-4 px-4 sm:px-[18px] py-4 rounded-[var(--auth-radius-control)] border border-[var(--auth-banner-border)] bg-[linear-gradient(90deg,rgb(240_90_126/0.09),rgb(240_90_126/0.03))] ${
            channels === null ? 'invisible' : ''
          }`}
        >
          <span className="grid place-items-center w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#A8355C,#5E1630)] text-[#FCE8ED]">
            {noChannelAvailable ? <AlertCircle className="w-5 h-5" /> : <Phone className="w-5 h-5" strokeWidth={2} />}
          </span>
          <p className="text-[14px] sm:text-[17px] leading-[1.5] text-[var(--auth-text)]">
            {noChannelAvailable
              ? onUsePassword
                ? 'OTP sign-in isn’t available right now — please sign in with your email and password instead.'
                : 'Sign-in is temporarily unavailable. Please try again in a little while, or contact us if it persists.'
              : 'OTP sign-in is available right now — please sign in with your mobile number. No password needed.'}
          </p>
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
            noValidate
            className="space-y-5"
          >
            <p className="text-[14px] sm:text-[17px] leading-[1.55] text-[var(--auth-text-secondary)] max-w-[548px] -mt-1">
              Enter your mobile number and we’ll send you a one-time code to sign in automatically.
            </p>

            <div>
              <label
                htmlFor="otp-mobile"
                className="block text-[15px] sm:text-[18px] font-medium uppercase tracking-[0.02em] text-[var(--auth-gold)] mb-2.5"
              >
                Mobile Number
              </label>
              <div className="flex flex-col min-[420px]:flex-row gap-3 sm:gap-4">
                <div className="auth-control relative flex items-center w-full min-[420px]:w-[150px] sm:w-[188px] shrink-0">
                  {countryCode === '+91' ? (
                    <IndiaFlag className="absolute left-3 w-[30px] h-5 pointer-events-none" />
                  ) : (
                    <Globe className="absolute left-3.5 w-5 h-5 text-[var(--auth-gold)] pointer-events-none" strokeWidth={1.5} />
                  )}
                  <select
                    aria-label="Country calling code"
                    value={countryCode}
                    onChange={(e) => {
                      setCountryCode(e.target.value);
                      setPhone((prev) => sanitizePhoneDigits(prev, getCountryRule(e.target.value).maxDigits));
                      setError(null);
                    }}
                    className="appearance-none w-full h-full bg-transparent pl-[52px] pr-10 text-[15px] sm:text-[17px] text-[var(--auth-text)] truncate rounded-[inherit] cursor-pointer focus:outline-none"
                  >
                    {COUNTRY_PHONE_RULES.filter(
                      (c) => !channels?.countryCodes?.length || channels.countryCodes.includes(c.code)
                    ).map((c) => (
                      <option key={c.code} value={c.code} className="bg-[var(--auth-bg-raised)] text-[var(--auth-text)]">
                        {c.code} {c.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 w-5 h-5 text-[var(--auth-text)] pointer-events-none" strokeWidth={1.75} />
                </div>
                <div className="auth-control relative min-[420px]:flex-1 flex items-center">
                  <Phone className="absolute left-4 w-[22px] h-[22px] text-[var(--auth-gold)] pointer-events-none" strokeWidth={1.5} />
                  <input
                    id="otp-mobile"
                    type="tel"
                    inputMode="numeric"
                    ref={phoneInputRef}
                    autoComplete="tel-national"
                    required
                    aria-invalid={inlinePhoneError ? true : undefined}
                    aria-describedby={inlinePhoneError ? 'otp-mobile-error' : undefined}
                    placeholder={
                      activeRule.minDigits === activeRule.maxDigits
                        ? `${activeRule.minDigits} digit mobile number`
                        : 'Mobile number'
                    }
                    value={phone}
                    onChange={(e) => {
                      setPhone(sanitizePhoneDigits(e.target.value, activeRule.maxDigits));
                      setError(null);
                      setDailyLimitReached(false);
                    }}
                    className="w-full h-full bg-transparent pl-[60px] pr-4 text-[16px] sm:text-[17px] tracking-[0.08em] tabular-nums text-[var(--auth-text)] placeholder:text-[#A39E97] rounded-[inherit] focus:outline-none"
                  />
                </div>
              </div>
              {inlinePhoneError && (
                <p id="otp-mobile-error" role="alert" className="mt-2 flex items-start gap-2 text-sm text-[var(--auth-error)]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </p>
              )}
            </div>

            <label className="flex items-center gap-3 w-fit cursor-pointer select-none">
              <input type="checkbox" className="auth-check" checked={remember} onChange={onToggleRemember} />
              <span className="text-[15px] sm:text-[17px] text-[#E4DFD8]">Keep me signed in on this device</span>
            </label>

            {/* Muted until the number is valid; still clickable then, so a
                tap explains what is wrong instead of doing nothing. */}
            <button
              type="submit"
              disabled={noChannelAvailable}
              data-ready={!validatePhone()}
              className={primaryButtonClass}
            >
              <span>Continue</span>
              <ArrowRight className="auth-cta-arrow w-6 h-6" strokeWidth={1.5} />
            </button>

            {onUsePassword && (
              <>
                <div className="flex items-center gap-4 pt-1 text-[14px] sm:text-[15px] text-[var(--auth-text-secondary)]">
                  <span aria-hidden="true" className="flex-1 h-px bg-[var(--auth-divider)]" />
                  <span>OR</span>
                  <span aria-hidden="true" className="flex-1 h-px bg-[var(--auth-divider)]" />
                </div>
                <button
                  type="button"
                  onClick={onUsePassword}
                  className="auth-focus group block mx-auto px-1 rounded text-[15px] sm:text-[17px] text-[#E4DFD8] hover:text-[var(--auth-text)] transition-colors cursor-pointer"
                >
                  Sign in with email{' '}
                  <span className="text-[var(--auth-gold)] group-hover:underline underline-offset-4">and password instead</span>
                </button>
              </>
            )}

            <p className="text-center text-[14px] sm:text-[17px] leading-[1.55] text-[#D9D4CD] max-w-[560px] mx-auto">
              New here? No need to sign up separately — verifying your number creates your account automatically.
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
                className="shrink-0 text-xs text-[#C9972B] hover:underline cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Change
              </button>
            </div>

            <p className="text-xs text-[var(--auth-text-secondary)] tabular-nums tracking-wide">{fullNumberForDisplay}</p>

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
                    <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-[#C9972B]' : 'text-[var(--auth-text-secondary)]'}`} />
                    <span className={`text-xs font-semibold ${selected ? 'text-[#FAF9F6]' : 'text-[var(--auth-text-secondary)]'}`}>
                      {option.emoji} {option.label}
                    </span>
                    {!option.available && (
                      <span className="ml-auto text-xs text-[var(--auth-text-secondary)] uppercase tracking-wider">Unavailable</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Both channels draw on one daily allowance, so it's worth saying
                plainly rather than letting someone discover it by switching. */}
            <p className="text-xs text-[var(--auth-text-secondary)] text-center">
              SMS and WhatsApp share the same daily OTP limit.
            </p>

            <button
              type="button"
              onClick={() => void sendOtp(method)}
              disabled={sending || noChannelAvailable || dailyLimitReached}
              aria-busy={sending}
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
              <p className="text-xs text-[var(--auth-text-secondary)]">
                {sentVia === 'whatsapp'
                  ? 'We sent a verification code to your WhatsApp number'
                  : 'We sent a verification code to'}
              </p>
              <p className="text-sm text-[#E8D5A8] tabular-nums tracking-wide">{maskedPhone}</p>
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
                  className={`w-11 sm:w-12 py-3 text-center text-lg tabular-nums rounded-lg bg-[#0B0B0B] border text-[#FAF9F6] focus:outline-none transition-colors disabled:opacity-40 ${
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
                <p className="text-xs text-[var(--auth-text-secondary)]">
                  OTP expires in{' '}
                  <span className="tabular-nums text-[#E8D5A8] tabular-nums">{formatCountdown(secondsLeft)}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void submitCode(code.join(''))}
              disabled={verifying || succeeded || expired || mustResend || code.join('').length !== OTP_LENGTH}
              aria-busy={verifying}
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
              <p className="text-xs text-[var(--auth-text-secondary)]">Didn’t receive the OTP?</p>
              <button
                type="button"
                onClick={() => void sendOtp(sentVia, { isResend: true })}
                disabled={!canResend || succeeded}
                className="text-xs font-semibold text-[#C9972B] hover:underline cursor-pointer disabled:text-[var(--auth-text-secondary)] disabled:no-underline disabled:cursor-not-allowed"
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
                  className="text-xs text-[var(--auth-text-secondary)] hover:text-[#FAF9F6] cursor-pointer flex items-center gap-1"
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
                  className="text-xs text-[var(--auth-text-secondary)] hover:text-[#FAF9F6] cursor-pointer"
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

/** India's tricolour for the default country. Inline so it renders the same
 * everywhere — Windows has no flag emoji. */
const IndiaFlag: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 30 20" aria-hidden="true">
    <rect width="30" height="20" rx="2" fill="#FFFFFF" />
    <path d="M2 0h26a2 2 0 0 1 2 2v4.67H0V2a2 2 0 0 1 2-2Z" fill="#FF9933" />
    <path d="M0 13.33h30V18a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-4.67Z" fill="#138808" />
    <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth="0.6" />
    <circle cx="15" cy="10" r="0.5" fill="#000080" />
  </svg>
);
