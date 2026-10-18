/**
 * Changing the verified mobile number, from My Profile.
 *
 * The number is the account's identity, so the backend bumps token_version on
 * success — which kills the token this tab is holding. Everything delicate
 * here follows from that one fact:
 *
 *   ORDER. The replacement token must be stored BEFORE any request that would
 *   use the old one. Get it backwards and the customer is signed out moments
 *   after a change that actually worked. Asserted on call order, not just on
 *   "both were called".
 *
 *   UNCHANGED. Re-verifying the number you already have returns no token.
 *   Storing `undefined` there would sign the customer out for doing nothing.
 *
 *   409 vs 401. One means "pick a different number", the other means "get a
 *   new code". They are different sentences and different next steps.
 *
 * Firebase is mocked at the module boundary: no SDK, no reCAPTCHA, no network,
 * and no real OTP.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---- Firebase client, stubbed ----
const sendFirebaseOtp = vi.fn(async (_e164: string) => ({ confirm: vi.fn() }) as any);
const confirmFirebaseOtp = vi.fn(async (_c: any, _code: string) => 'fake.id.token-NOT-A-CREDENTIAL');
const clearRecaptcha = vi.fn();

vi.mock('../utils/firebaseAuth', () => ({
  sendFirebaseOtp: (e164: string) => sendFirebaseOtp(e164),
  confirmFirebaseOtp: (confirmation: any, code: string) => confirmFirebaseOtp(confirmation, code),
  clearRecaptcha: () => clearRecaptcha(),
  isFirebaseConfigured: () => true,
  describeFirebaseError: (e: any) => String(e?.message || 'Firebase error'),
  RECAPTCHA_CONTAINER_ID: 'recaptcha-container',
}));

// ---- Account + auth contexts, stubbed at the hook boundary ----
const changePhone = vi.fn();
const loadProfile = vi.fn(async () => undefined);
const applyReplacementToken = vi.fn();
const showToast = vi.fn();

let profileData: any = {
  id: 'cust-1',
  name: 'Glamirk Customer',
  email: undefined,
  phone: '9811111111',
  phoneE164: '+919123988001',
  emailVerified: false,
  phoneVerified: true,
  createdAt: new Date().toISOString(),
};

vi.mock('../context/AccountContext', () => ({
  useAccount: () => ({
    profile: { data: profileData, loading: false, error: null, loaded: true },
    loadProfile,
    updateProfile: vi.fn(async () => ({ success: true })),
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    sendEmailVerification: vi.fn(),
    verifyEmail: vi.fn(),
    changePhone,
  }),
}));

vi.mock('../context/CustomerAuthContext', () => ({
  useCustomerAuth: () => ({ applyReplacementToken }),
}));

import { ProfileSection } from '../components/account/sections/ProfileSection';

/** Opens the panel, enters a number, and reaches the six code boxes. */
async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^change$/i }));
  await user.type(screen.getByLabelText(/new mobile number/i), '9876501234');
  await user.click(screen.getByRole('button', { name: /send code/i }));
  await screen.findByLabelText('New mobile code digit 1');
}

/** Types the six digits, which auto-submits on the last one. */
async function enterCode(user: ReturnType<typeof userEvent.setup>, code = '123456') {
  for (let i = 0; i < code.length; i++) {
    await user.type(screen.getByLabelText(`New mobile code digit ${i + 1}`), code[i]);
  }
}

const renderProfile = () => render(<ProfileSection showToast={showToast} />);

beforeEach(() => {
  vi.clearAllMocks();
  changePhone.mockResolvedValue({ success: true, status: 200, token: 'new.jwt', user: { id: 'cust-1' } });
});
afterEach(() => cleanup());

describe('change number — reaching the code step', () => {
  it('does not show the panel until Change is clicked', () => {
    renderProfile();
    expect(screen.queryByLabelText(/new mobile number/i)).not.toBeInTheDocument();
  });

  it('mounts the reCAPTCHA container only while the panel is open', async () => {
    const user = userEvent.setup();
    const { container } = renderProfile();
    expect(container.querySelector('#recaptcha-container')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^change$/i }));
    expect(container.querySelector('#recaptcha-container')).not.toBeNull();
  });

  it('refuses an invalid number without calling Firebase', async () => {
    const user = userEvent.setup();
    renderProfile();
    await user.click(screen.getByRole('button', { name: /^change$/i }));
    await user.type(screen.getByLabelText(/new mobile number/i), '12345');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    expect(sendFirebaseOtp).not.toHaveBeenCalled();
    expect(await screen.findByText(/exactly 10 digits/i)).toBeInTheDocument();
  });

  it('sends the code in E.164 and shows six boxes', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);

    expect(sendFirebaseOtp).toHaveBeenCalledWith('+919876501234');
    expect(screen.getByLabelText('New mobile code digit 6')).toBeInTheDocument();
  });
});

describe('change number — success path and ordering', () => {
  it('replaces the session token BEFORE reloading the profile', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    applyReplacementToken.mockImplementation(() => order.push('token'));
    loadProfile.mockImplementation(async () => {
      order.push('loadProfile');
    });

    renderProfile();
    await reachCodeStep(user);
    // ProfileSection loads the profile on mount too; only the calls made by
    // the change itself are being ordered here.
    order.length = 0;
    await enterCode(user);

    await waitFor(() => expect(applyReplacementToken).toHaveBeenCalled());
    await waitFor(() => expect(loadProfile).toHaveBeenCalled());
    // The whole point: a reload with the dead token would 401 the customer out
    // of a change that succeeded.
    expect(order).toEqual(['token', 'loadProfile']);
  });

  it('passes the replacement token and user through', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    await waitFor(() => expect(applyReplacementToken).toHaveBeenCalledWith('new.jwt', { id: 'cust-1' }));
  });

  it('closes the panel and confirms', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Mobile number updated'));
    await waitFor(() => expect(screen.queryByLabelText('New mobile code digit 1')).not.toBeInTheDocument());
  });

  it('clears the reCAPTCHA verifier after the attempt', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    // A verifier is single use; leaving a spent one behind is what makes the
    // SECOND attempt fail with an opaque error.
    await waitFor(() => expect(clearRecaptcha).toHaveBeenCalled());
  });
});

describe('change number — unchanged response', () => {
  it('never stores a token when the server reports unchanged', async () => {
    changePhone.mockResolvedValue({ success: true, status: 200, unchanged: true, user: { id: 'cust-1' } });
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('That is already your number.'));
    // There is no replacement token in this response. Storing `undefined`
    // would sign the customer out for changing nothing.
    expect(applyReplacementToken).not.toHaveBeenCalled();
  });
});

describe('change number — failures', () => {
  it('409 explains the number is taken and allows another try', async () => {
    changePhone.mockResolvedValue({ success: false, status: 409, error: 'taken' });
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    expect(await screen.findByText(/already in use on another account/i)).toBeInTheDocument();
    expect(screen.queryByText(/unavailable right now/i)).not.toBeInTheDocument();
    // Back on the number step so a different number can be entered.
    expect(screen.getByLabelText(/new mobile number/i)).toBeInTheDocument();
    expect(applyReplacementToken).not.toHaveBeenCalled();
  });

  it('401 asks for a fresh code', async () => {
    changePhone.mockResolvedValue({ success: false, status: 401, error: 'bad token' });
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    expect(await screen.findByText(/expired or could not be verified/i)).toBeInTheDocument();
    expect(applyReplacementToken).not.toHaveBeenCalled();
  });

  // The server answers 503 when Firebase is not the selected provider. It used
  // to answer 409, which lands in the branch above — so a deployment with the
  // provider switched off told customers their number was taken. These two
  // assertions are the pair: the right message, and not the wrong one.
  it('503 says it is temporary, not that the number is taken', async () => {
    changePhone.mockResolvedValue({
      success: false,
      status: 503,
      error: 'Firebase sign-in is not enabled on this deployment.',
    });
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    expect(await screen.findByText(/unavailable right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/already in use on another account/i)).not.toBeInTheDocument();
  });

  it('any other failure still says something safe', async () => {
    changePhone.mockResolvedValue({ success: false, status: 500, error: 'Could not change your mobile number.' });
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    expect(await screen.findByText(/could not change your mobile number/i)).toBeInTheDocument();
    expect(applyReplacementToken).not.toHaveBeenCalled();
  });

  it('a Firebase send failure is reported and clears the verifier', async () => {
    sendFirebaseOtp.mockRejectedValueOnce(new Error('auth/too-many-requests'));
    const user = userEvent.setup();
    renderProfile();
    await user.click(screen.getByRole('button', { name: /^change$/i }));
    await user.type(screen.getByLabelText(/new mobile number/i), '9876501234');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    expect(await screen.findByText(/too-many-requests/i)).toBeInTheDocument();
    await waitFor(() => expect(clearRecaptcha).toHaveBeenCalled());
    expect(changePhone).not.toHaveBeenCalled();
  });

  it('a wrong code never reaches the backend', async () => {
    confirmFirebaseOtp.mockRejectedValueOnce(new Error('auth/invalid-verification-code'));
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    expect(await screen.findByText(/invalid-verification-code/i)).toBeInTheDocument();
    expect(changePhone).not.toHaveBeenCalled();
  });
});

describe('change number — code box behaviour', () => {
  it('spreads a PARTIAL paste across the boxes without submitting', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);

    screen.getByLabelText('New mobile code digit 1').focus();
    await user.paste('12345');

    for (let i = 0; i < 5; i++) {
      expect(screen.getByLabelText(`New mobile code digit ${i + 1}`)).toHaveValue(String(i + 1));
    }
    expect(screen.getByLabelText('New mobile code digit 6')).toHaveValue('');
    expect(confirmFirebaseOtp).not.toHaveBeenCalled();
  });

  it('a full six-digit paste submits that code', async () => {
    // A complete paste auto-submits, which closes the panel on success, so the
    // boxes are gone by the time an assertion could read them. What matters is
    // the code that actually went to Firebase.
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);

    screen.getByLabelText('New mobile code digit 1').focus();
    await user.paste('654321');

    await waitFor(() => expect(confirmFirebaseOtp).toHaveBeenCalledWith(expect.anything(), '654321'));
  });

  it('backspace on an empty box steps back', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText('New mobile code digit 1'), '1');
    screen.getByLabelText('New mobile code digit 2').focus();
    await user.keyboard('{Backspace}');

    expect(screen.getByLabelText('New mobile code digit 1')).toHaveFocus();
  });

  it('Edit returns to the number step and drops the challenge', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);

    await user.click(screen.getByRole('button', { name: /edit new mobile number/i }));

    expect(screen.getByLabelText(/new mobile number/i)).toBeInTheDocument();
    expect(clearRecaptcha).toHaveBeenCalled();
  });

  it('Resend asks Firebase for a new code', async () => {
    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    expect(sendFirebaseOtp).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /resend code/i }));
    await waitFor(() => expect(sendFirebaseOtp).toHaveBeenCalledTimes(2));
  });

  it('does not submit twice while a change is in flight', async () => {
    let release: (v: any) => void = () => undefined;
    changePhone.mockImplementation(() => new Promise((r) => (release = r)));

    const user = userEvent.setup();
    renderProfile();
    await reachCodeStep(user);
    await enterCode(user);

    await waitFor(() => expect(changePhone).toHaveBeenCalledTimes(1));
    // The explicit button is disabled while the first call is outstanding.
    await user.click(screen.getByRole('button', { name: /verify & update/i }).closest('button')!);
    expect(changePhone).toHaveBeenCalledTimes(1);

    release({ success: true, status: 200, token: 'new.jwt', user: { id: 'cust-1' } });
  });
});
