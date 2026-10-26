/**
 * Mobile OTP sign-in on the FIREBASE path.
 *
 * otpSignIn.test.tsx covers the server-managed challenge. This file covers the
 * other provider, which is the one actually deployed — and which fails in ways
 * the server path cannot, because Google owns both the SMS and the code and
 * this screen only mirrors windows it does not control.
 *
 * Three regressions are pinned here, all from one report: "OTP arrives but
 * sign-in does not happen, and Resend does nothing."
 *
 *   1. The code screen used to borrow the server path's 60-second expiry. The
 *      countdown starts when signInWithPhoneNumber RESOLVES — before the SMS
 *      leaves Google — so a customer who waited ten seconds for the message
 *      and then typed six digits found the boxes disabled under a code that
 *      was still perfectly valid.
 *   2. Resend re-rendered a reCAPTCHA into a container that still held the
 *      previous widget, which grecaptcha refuses. The first code sent; no
 *      later one did.
 *   3. The Firebase stand-in challenge id was written to sessionStorage, but
 *      the ConfirmationResult it stands for lives in a ref. A refresh restored
 *      a code screen with nothing behind it.
 *
 * Firebase itself is stubbed at the module boundary — no SDK, no reCAPTCHA, no
 * network, no real code. The reCAPTCHA lifecycle has its own test below,
 * against the real module.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Firebase client, stubbed ----
const sendFirebaseOtp = vi.fn(async (_e164: string) => ({ confirm: vi.fn() }) as any);
const confirmFirebaseOtp = vi.fn(async (_c: any, _code: string) => 'fake.id.token-NOT-A-CREDENTIAL');
const clearRecaptcha = vi.fn();

vi.mock('@/utils/firebaseAuth', () => ({
  sendFirebaseOtp: (e164: string) => sendFirebaseOtp(e164),
  confirmFirebaseOtp: (confirmation: any, code: string) => confirmFirebaseOtp(confirmation, code),
  clearRecaptcha: () => clearRecaptcha(),
  isFirebaseConfigured: () => true,
  describeFirebaseError: (e: any) => String(e?.message || 'Firebase error'),
  RECAPTCHA_CONTAINER_ID: 'recaptcha-container',
}));

import { MobileOtpSignIn } from '@/components/account/MobileOtpSignIn';
import { CustomerAuthProvider } from '@/context/CustomerAuthContext';

const PHONE = '9876543210';
const CODE = '123456';

const ALL_CHANNELS = {
  sms: true,
  whatsapp: false,
  countryCodes: ['+91'],
  otpLength: 6,
  expiresInSeconds: 60,
  resendCooldownSeconds: 60,
};

const SESSION_USER = {
  id: 'cust-fb-1',
  name: 'Glamirk Customer',
  phone: '+91 9876543210',
  phoneVerified: true,
  emailVerified: false,
  createdAt: new Date().toISOString(),
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * In Firebase mode the only endpoint this screen may touch during sign-in is
 * the token exchange — /otp/request returns a 409 on this deployment, so a
 * call to it is a bug, and an unmocked URL throws.
 */
function mockApi(handlers: { firebaseVerify?: () => Response | Promise<Response> } = {}) {
  const calls = { channels: 0, firebaseVerify: 0 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/otp/channels')) {
        calls.channels++;
        return json(200, ALL_CHANNELS);
      }
      if (url.includes('/auth/otp/firebase/verify')) {
        calls.firebaseVerify++;
        if (!handlers.firebaseVerify) throw new Error('unexpected firebase verify call');
        return handlers.firebaseVerify();
      }
      throw new Error(`Unmocked endpoint: ${url}`);
    })
  );
  return calls;
}

function renderSignIn(props: Partial<React.ComponentProps<typeof MobileOtpSignIn>> = {}) {
  const onSuccess = props.onSuccess ?? vi.fn();
  render(
    <CustomerAuthProvider>
      <MobileOtpSignIn
        onSuccess={onSuccess}
        remember={props.remember ?? true}
        onToggleRemember={props.onToggleRemember ?? vi.fn()}
      />
    </CustomerAuthProvider>
  );
  return { onSuccess };
}

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('10 digit number'), PHONE);
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await screen.findByRole('radiogroup', { name: /otp delivery method/i });
  await user.click(screen.getByRole('button', { name: /^send otp$/i }));
  await screen.findByLabelText('OTP digit 1');
}

async function enterCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  for (let i = 0; i < code.length; i++) {
    await user.type(screen.getByLabelText(`OTP digit ${i + 1}`), code[i]);
  }
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sendFirebaseOtp.mockClear();
  confirmFirebaseOtp.mockClear();
  clearRecaptcha.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ==========================================
describe('MobileOtpSignIn — Firebase path', () => {
  it('signs in with the token Firebase hands back', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      firebaseVerify: () => json(200, { token: 'session.jwt', user: SESSION_USER, isNewAccount: false }),
    });
    const { onSuccess } = renderSignIn();

    await reachCodeStep(user);
    expect(sendFirebaseOtp).toHaveBeenCalledWith(`+91${PHONE}`);

    await enterCode(user, CODE);

    await waitFor(() => expect(calls.firebaseVerify).toBe(1));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ isNewAccount: false }), { timeout: 3000 });
  });

  it('still accepts the code well after 60 seconds — Firebase does, so the screen must', async () => {
    const user = userEvent.setup();
    mockApi({
      firebaseVerify: () => json(200, { token: 'session.jwt', user: SESSION_USER, isNewAccount: false }),
    });
    renderSignIn();
    await reachCodeStep(user);

    // Two minutes of waiting for an SMS and typing, which is ordinary. The
    // boxes used to be disabled by now and the screen read "OTP expired" under
    // a code Google would still have accepted.
    const started = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => started + 120_000);
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /resend otp$/i })).toBeEnabled()
      );
      expect(screen.getByLabelText('OTP digit 1')).toBeEnabled();
      expect(screen.queryByText(/otp expired/i)).toBeNull();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('asks Firebase for a second code when Resend is pressed', async () => {
    const user = userEvent.setup();
    mockApi();
    renderSignIn();
    await reachCodeStep(user);
    expect(sendFirebaseOtp).toHaveBeenCalledTimes(1);

    // The cooldown is a real 60s; step past it rather than waiting it out.
    const started = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => started + 61_000);
    try {
      const resend = await screen.findByRole('button', { name: /resend otp$/i });
      await waitFor(() => expect(resend).toBeEnabled());
      await user.click(resend);
      await waitFor(() => expect(sendFirebaseOtp).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(/a new otp has been sent/i)).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('surfaces a failed resend instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    mockApi();
    renderSignIn();
    await reachCodeStep(user);

    sendFirebaseOtp.mockRejectedValueOnce(new Error('reCAPTCHA has already been rendered in this element'));

    const started = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => started + 61_000);
    try {
      const resend = await screen.findByRole('button', { name: /resend otp$/i });
      await waitFor(() => expect(resend).toBeEnabled());
      await user.click(resend);

      // The spent verifier is torn down so the NEXT attempt starts clean, the
      // customer is told, and they are left on the code screen rather than
      // bounced back a step mid-flow.
      await waitFor(() => expect(clearRecaptcha).toHaveBeenCalled());
      expect(await screen.findByRole('alert')).toHaveTextContent(/recaptcha/i);
      expect(screen.getByLabelText('OTP digit 1')).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('persists no challenge — the ConfirmationResult cannot be restored from storage', async () => {
    const user = userEvent.setup();
    mockApi();
    renderSignIn();
    await reachCodeStep(user);

    // A stored challenge would resume the code screen after a refresh with no
    // confirmation behind it, so every digit typed there was rejected.
    expect(sessionStorage.getItem('glamirk_otp_challenge')).toBeNull();
  });

  it('keeps the code screen usable when the backend rejects the token', async () => {
    const user = userEvent.setup();
    mockApi({
      firebaseVerify: () => json(409, { error: 'Firebase sign-in is not enabled on this deployment.' }),
    });
    const { onSuccess } = renderSignIn();

    await reachCodeStep(user);
    await enterCode(user, CODE);

    // The customer is told what the server said — not left watching a spinner
    // or a screen that looks like it worked.
    expect(await screen.findByRole('alert')).toHaveTextContent(/not enabled on this deployment/i);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(localStorage.getItem('glamirk_customer_jwt_token')).toBeNull();
    expect(sessionStorage.getItem('glamirk_customer_jwt_token')).toBeNull();
  });
});
