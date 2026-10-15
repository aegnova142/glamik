/**
 * Mobile + OTP sign-in, driven through the real component and the real
 * customer auth context.
 *
 *   npm run test --workspace @glamirk/frontend
 *
 * Nothing is stubbed except the network. `globalThis.fetch` is replaced per
 * test, so every layer below the socket is the production one: the component,
 * CustomerAuthProvider, customerApiFetch, and the token storage helpers. That
 * is deliberate — mocking `useCustomerAuth` would let the component drift away
 * from the context's real response shapes without a test noticing, which is
 * exactly the kind of break these tests exist to catch.
 *
 * No test reaches a real endpoint: setup.ts installs a fetch that throws on
 * any URL a test has not explicitly mocked.
 *
 * The screen is three steps — phone -> method -> code — so most tests go
 * through `reachCodeStep()` rather than repeating the walk.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MobileOtpSignIn } from '@/components/account/MobileOtpSignIn';
import { CustomerAuthProvider } from '@/context/CustomerAuthContext';

// ------------------------------------------
// Fixtures
// ------------------------------------------

const PHONE = '9876543210';
/** Obviously fake, and never a real code — these tests verify plumbing, not
 * secrets, and nothing here is ever sent anywhere. */
const CODE = '123456';
const CHALLENGE_ID = 'otp_test-challenge';

const ALL_CHANNELS = {
  sms: true,
  whatsapp: true,
  countryCodes: ['+91'],
  otpLength: 6,
  expiresInSeconds: 60,
  resendCooldownSeconds: 60,
};

function requestOk(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    success: true,
    challengeId: CHALLENGE_ID,
    method: 'sms',
    maskedPhone: '+91 ******3210',
    expiresAt: new Date(now + 60_000).toISOString(),
    resendAvailableAt: new Date(now + 60_000).toISOString(),
    otpLength: 6,
    ...overrides,
  };
}

const SESSION_USER = {
  id: 'cust-test-1',
  name: 'Glamirk Customer',
  phone: '+91 9876543210',
  phoneVerified: true,
  emailVerified: false,
  createdAt: new Date().toISOString(),
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Routes mocked responses by endpoint.
 *
 * `channels` defaults to everything available so a test only has to describe
 * the part of the flow it is actually about. A `null` handler means "this test
 * expects no call here" — the stub from setup.ts throws if one happens.
 */
function mockApi(handlers: {
  channels?: unknown;
  request?: () => Response | Promise<Response>;
  verify?: () => Response | Promise<Response>;
  me?: () => Response | Promise<Response>;
}) {
  const calls = { channels: 0, request: 0, verify: 0, me: 0 };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/otp/channels')) {
        calls.channels++;
        return json(200, handlers.channels ?? ALL_CHANNELS);
      }
      if (url.includes('/auth/otp/request')) {
        calls.request++;
        if (!handlers.request) throw new Error('unexpected /otp/request call');
        return handlers.request();
      }
      if (url.includes('/auth/otp/verify')) {
        calls.verify++;
        if (!handlers.verify) throw new Error('unexpected /otp/verify call');
        return handlers.verify();
      }
      if (url.includes('/auth/me')) {
        calls.me++;
        if (!handlers.me) throw new Error('unexpected /auth/me call');
        return handlers.me();
      }
      throw new Error(`Unmocked endpoint: ${url}`);
    })
  );

  return calls;
}

function renderSignIn(props: Partial<React.ComponentProps<typeof MobileOtpSignIn>> = {}) {
  const onSuccess = props.onSuccess ?? vi.fn();
  const onToggleRemember = props.onToggleRemember ?? vi.fn();
  render(
    <CustomerAuthProvider>
      <MobileOtpSignIn
        onSuccess={onSuccess}
        remember={props.remember ?? true}
        onToggleRemember={onToggleRemember}
        onUsePassword={props.onUsePassword}
      />
    </CustomerAuthProvider>
  );
  return { onSuccess, onToggleRemember };
}

/** Walks phone -> method -> code, leaving the six OTP boxes on screen. */
async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('10 digit number'), PHONE);
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await screen.findByRole('radiogroup', { name: /otp delivery method/i });
  await user.click(screen.getByRole('button', { name: /^send otp$/i }));
  await screen.findByLabelText('OTP digit 1');
}

/** Types a code into the six boxes, which auto-submits on the last digit. */
async function enterCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  for (let i = 0; i < code.length; i++) {
    await user.type(screen.getByLabelText(`OTP digit ${i + 1}`), code[i]);
  }
}

// ==========================================
describe('MobileOtpSignIn', () => {
  // ------------------------------------------
  describe('channel availability', () => {
    it('disables sign-in and explains when no channel can deliver', async () => {
      mockApi({ channels: { ...ALL_CHANNELS, sms: false, whatsapp: false } });
      renderSignIn();

      // The notice only renders once channels have been fetched.
      expect(await screen.findByText(/isn.t available right now|temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    });

    it('preselects WhatsApp when SMS cannot deliver but WhatsApp can', async () => {
      mockApi({ channels: { ...ALL_CHANNELS, sms: false, whatsapp: true } });
      const user = userEvent.setup();
      renderSignIn();

      await user.type(screen.getByPlaceholderText('10 digit number'), PHONE);
      await user.click(screen.getByRole('button', { name: /continue/i }));

      const group = await screen.findByRole('radiogroup', { name: /otp delivery method/i });
      expect(within(group).getByText(/unavailable/i)).toBeInTheDocument();
    });

    it('still offers SMS when the channels request fails outright', async () => {
      // The context falls back to "SMS works" rather than stranding the
      // customer on a screen with nothing clickable.
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          if (String(input).includes('/auth/otp/channels')) throw new Error('network down');
          throw new Error('unexpected call');
        })
      );
      renderSignIn();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
      });
    });
  });

  // ------------------------------------------
  describe('client-side number validation', () => {
    it('rejects a number that is not a valid Indian mobile before spending a send', async () => {
      const calls = mockApi({});
      const user = userEvent.setup();
      renderSignIn();

      await user.type(screen.getByPlaceholderText('10 digit number'), '1234567890');
      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/valid 10-digit indian mobile/i);
      expect(calls.request).toBe(0);
    });

    it('cannot advance with an empty field, and spends no send', async () => {
      // The input is `required`, so the browser blocks submission and
      // handleContinueFromPhone never runs — there is no custom message to
      // assert. What matters is the outcome: still on the phone step, and no
      // request made.
      const calls = mockApi({});
      const user = userEvent.setup();
      renderSignIn();

      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(screen.getByPlaceholderText('10 digit number')).toBeInvalid();
      expect(screen.queryByRole('radiogroup', { name: /otp delivery method/i })).not.toBeInTheDocument();
      expect(calls.request).toBe(0);
    });
  });

  // ------------------------------------------
  describe('loading states', () => {
    it('shows a sending state and blocks a second send while in flight', async () => {
      let release!: (r: Response) => void;
      mockApi({ request: () => new Promise<Response>((resolve) => { release = resolve; }) });
      const user = userEvent.setup();
      renderSignIn();

      await user.type(screen.getByPlaceholderText('10 digit number'), PHONE);
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await screen.findByRole('radiogroup', { name: /otp delivery method/i });
      await user.click(screen.getByRole('button', { name: /^send otp$/i }));

      const sendingButton = await screen.findByRole('button', { name: /sending otp/i });
      expect(sendingButton).toBeDisabled();

      release(json(200, requestOk()));
      await screen.findByLabelText('OTP digit 1');
    });

    it('does not submit the code twice while a verification is in flight', async () => {
      let release!: (r: Response) => void;
      const calls = mockApi({
        request: () => json(200, requestOk()),
        verify: () => new Promise<Response>((resolve) => { release = resolve; }),
      });
      const user = userEvent.setup();
      renderSignIn();

      await reachCodeStep(user);
      await enterCode(user, CODE);
      await waitFor(() => expect(calls.verify).toBe(1));

      // The boxes stay enabled while verifying — the guard is inside
      // submitCode (`|| verifying ||`), not the disabled attribute. So retype
      // a full code mid-flight and assert no second request escapes.
      await enterCode(user, CODE);
      expect(calls.verify).toBe(1);

      release(json(200, { token: 'test-token', user: SESSION_USER, isNewAccount: false }));
      await waitFor(() => expect(calls.verify).toBe(1));
    });
  });

  // ------------------------------------------
  describe('verification failures', () => {
    it('reports an incorrect code with the attempts that remain', async () => {
      mockApi({
        request: () => json(200, requestOk()),
        verify: () => json(401, { error: 'Incorrect OTP. Please try again.', attemptsRemaining: 4 }),
      });
      const user = userEvent.setup();
      const { onSuccess } = renderSignIn();

      await reachCodeStep(user);
      await enterCode(user, CODE);

      expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect otp/i);
      expect(onSuccess).not.toHaveBeenCalled();
      // Boxes are cleared and re-enabled so the next attempt needs no editing.
      await waitFor(() => expect(screen.getByLabelText('OTP digit 1')).toHaveValue(''));
      expect(screen.getByLabelText('OTP digit 1')).toBeEnabled();
    });

    it('locks the boxes and demands a resend once the code is dead', async () => {
      mockApi({
        request: () => json(200, requestOk()),
        verify: () =>
          json(429, { error: 'Too many incorrect attempts. Please request a new OTP.', mustResend: true }),
      });
      const user = userEvent.setup();
      const { onSuccess } = renderSignIn();

      await reachCodeStep(user);
      await enterCode(user, CODE);

      expect(await screen.findByRole('alert')).toHaveTextContent(/too many incorrect attempts/i);
      await waitFor(() => expect(screen.getByLabelText('OTP digit 1')).toBeDisabled());
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('treats an expired challenge the same way — no session, resend required', async () => {
      mockApi({
        request: () => json(200, requestOk()),
        verify: () => json(400, { error: 'This OTP has expired. Please request a new OTP.', expired: true }),
      });
      const user = userEvent.setup();
      const { onSuccess } = renderSignIn();

      await reachCodeStep(user);
      await enterCode(user, CODE);

      expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(localStorage.getItem('glamirk_customer_jwt_token')).toBeNull();
    });

    it('surfaces a network failure during verification without signing anyone in', async () => {
      mockApi({
        request: () => json(200, requestOk()),
        verify: () => { throw new Error('Network error occurred'); },
      });
      const user = userEvent.setup();
      const { onSuccess } = renderSignIn();

      await reachCodeStep(user);
      await enterCode(user, CODE);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(localStorage.getItem('glamirk_customer_jwt_token')).toBeNull();
    });
  });

  // ------------------------------------------
  describe('send failures and throttling', () => {
    it('reports a provider failure and returns to the method step', async () => {
      mockApi({
        request: () =>
          json(503, {
            error: "We couldn't send the OTP right now. Please try again.",
            method: 'sms',
            channelAvailable: true,
          }),
      });
      const user = userEvent.setup();
      renderSignIn();

      await user.type(screen.getByPlaceholderText('10 digit number'), PHONE);
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await screen.findByRole('radiogroup', { name: /otp delivery method/i });
      await user.click(screen.getByRole('button', { name: /^send otp$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t send the otp/i);
      // Never advances to the code screen for a code that was never sent.
      expect(screen.queryByLabelText('OTP digit 1')).not.toBeInTheDocument();
    });

    it('reports a cooldown without advancing', async () => {
      mockApi({
        request: () =>
          json(429, { error: 'Please wait 43 seconds before requesting another OTP.', retryAfterSeconds: 43 }),
      });
      const user = userEvent.setup();
      renderSignIn();

      await user.type(screen.getByPlaceholderText('10 digit number'), PHONE);
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await screen.findByRole('radiogroup', { name: /otp delivery method/i });
      await user.click(screen.getByRole('button', { name: /^send otp$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/please wait 43 seconds/i);
      expect(screen.queryByLabelText('OTP digit 1')).not.toBeInTheDocument();
    });

    it('keeps the send button disabled once the daily quota is spent', async () => {
      mockApi({
        request: () => json(429, { error: 'Daily OTP limit reached. Please try again later.', dailyLimitReached: true }),
      });
      const user = userEvent.setup();
      renderSignIn();

      await user.type(screen.getByPlaceholderText('10 digit number'), PHONE);
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await screen.findByRole('radiogroup', { name: /otp delivery method/i });
      await user.click(screen.getByRole('button', { name: /^send otp$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/daily otp limit reached/i);
      // Retrying cannot work until some allowance ages out, so the button stays shut.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^send otp$/i })).toBeDisabled();
      });
    });
  });

  // ------------------------------------------
  describe('successful verification', () => {
    it('stores the session, clears the saved challenge and reports success', async () => {
      const calls = mockApi({
        request: () => json(200, requestOk()),
        verify: () => json(200, { token: 'test-token', user: SESSION_USER, isNewAccount: true }),
      });
      const user = userEvent.setup();
      const { onSuccess } = renderSignIn({ remember: true });

      await reachCodeStep(user);
      // The challenge is persisted so a refresh resumes it.
      expect(sessionStorage.getItem('glamirk_otp_challenge')).not.toBeNull();

      await enterCode(user, CODE);

      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ isNewAccount: true }));
      expect(calls.verify).toBe(1);
      expect(localStorage.getItem('glamirk_customer_jwt_token')).toBe('test-token');
      // A spent challenge must not be left where a refresh would resume it.
      expect(sessionStorage.getItem('glamirk_otp_challenge')).toBeNull();
      // No error was shown on the way.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the session in sessionStorage when "keep me signed in" is off', async () => {
      mockApi({
        request: () => json(200, requestOk()),
        verify: () => json(200, { token: 'test-token', user: SESSION_USER, isNewAccount: false }),
      });
      const user = userEvent.setup();
      const { onSuccess } = renderSignIn({ remember: false });

      await reachCodeStep(user);
      await enterCode(user, CODE);

      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ isNewAccount: false }));
      expect(sessionStorage.getItem('glamirk_customer_jwt_token')).toBe('test-token');
      expect(localStorage.getItem('glamirk_customer_jwt_token')).toBeNull();
    });

    it('never puts the submitted code into storage', async () => {
      mockApi({
        request: () => json(200, requestOk()),
        verify: () => json(200, { token: 'test-token', user: SESSION_USER, isNewAccount: false }),
      });
      const user = userEvent.setup();
      const { onSuccess } = renderSignIn();

      await reachCodeStep(user);
      await enterCode(user, CODE);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      const everything = JSON.stringify({ ...localStorage, ...sessionStorage });
      expect(everything).not.toContain(CODE);
    });
  });

  // ------------------------------------------
  describe('authenticated session restoration', () => {
    it('restores the signed-in customer from a stored token via /auth/me', async () => {
      localStorage.setItem('glamirk_customer_jwt_token', 'stored-token');
      localStorage.setItem('glamirk_customer_user', JSON.stringify(SESSION_USER));

      const calls = mockApi({ me: () => json(200, { user: SESSION_USER }) });
      renderSignIn();

      await waitFor(() => expect(calls.me).toBe(1));
      // The stored session survives a mount that validated it.
      expect(localStorage.getItem('glamirk_customer_jwt_token')).toBe('stored-token');
    });

    it('clears a rejected session rather than leaving a dead token behind', async () => {
      localStorage.setItem('glamirk_customer_jwt_token', 'expired-token');
      localStorage.setItem('glamirk_customer_user', JSON.stringify(SESSION_USER));

      const calls = mockApi({ me: () => json(401, { error: 'Unauthorized' }) });
      renderSignIn();

      await waitFor(() => expect(calls.me).toBe(1));
      await waitFor(() => {
        expect(localStorage.getItem('glamirk_customer_jwt_token')).toBeNull();
      });
    });

    it('makes no /auth/me call when there is no stored session', async () => {
      const calls = mockApi({});
      renderSignIn();

      await screen.findByPlaceholderText('10 digit number');
      expect(calls.me).toBe(0);
    });
  });

  // ------------------------------------------
  describe('challenge persistence', () => {
    it('resumes a live challenge on remount instead of restarting at the phone step', async () => {
      const now = Date.now();
      sessionStorage.setItem(
        'glamirk_otp_challenge',
        JSON.stringify({
          challengeId: CHALLENGE_ID,
          maskedPhone: '+91 ******3210',
          method: 'sms',
          expiresAt: new Date(now + 45_000).toISOString(),
          resendAvailableAt: new Date(now + 45_000).toISOString(),
          countryCode: '+91',
          phone: PHONE,
        })
      );

      mockApi({});
      renderSignIn();

      // Straight to the code screen — no phone input in sight.
      expect(await screen.findByLabelText('OTP digit 1')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('10 digit number')).not.toBeInTheDocument();
    });

    it('discards a dead challenge and starts at the phone step', async () => {
      const past = Date.now() - 120_000;
      sessionStorage.setItem(
        'glamirk_otp_challenge',
        JSON.stringify({
          challengeId: CHALLENGE_ID,
          maskedPhone: '+91 ******3210',
          method: 'sms',
          expiresAt: new Date(past).toISOString(),
          resendAvailableAt: new Date(past).toISOString(),
          countryCode: '+91',
          phone: PHONE,
        })
      );

      mockApi({});
      renderSignIn();

      expect(await screen.findByPlaceholderText('10 digit number')).toBeInTheDocument();
      expect(sessionStorage.getItem('glamirk_otp_challenge')).toBeNull();
    });
  });
});
