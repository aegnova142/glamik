/**
 * The authentication modal.
 *
 * Renders the real component in jsdom — not a browser, so nothing here proves
 * how it LOOKS. What it does prove is the structure and behaviour that the
 * look depends on: which panels exist, which screen each entry point lands on,
 * what the toggles preserve, and that the registration form is genuinely
 * unreachable rather than merely hidden behind a style.
 *
 * Layout is asserted through the classes that produce it (the two-panel
 * breakpoint, the stacking behaviour) because that is the honest limit of
 * jsdom: it computes no layout. Treat these as "the right rules are applied",
 * not "it renders correctly".
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@glamirk/shared/context/CMSContext', () => ({
  useCMS: () => ({ globalSettings: {}, shopMegaMenu: null }),
}));

import { AuthModal } from '../components/account/AuthModal';
import { CustomerAuthProvider } from '../context/CustomerAuthContext';

const ALL_CHANNELS = {
  sms: true,
  whatsapp: false,
  countryCodes: ['+91'],
  otpLength: 6,
  expiresInSeconds: 60,
  resendCooldownSeconds: 60,
};

function renderModal(props: Partial<React.ComponentProps<typeof AuthModal>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <CustomerAuthProvider>
      <AuthModal isOpen onClose={onClose} initialMode={props.initialMode} {...props} />
    </CustomerAuthProvider>
  );
  return { onClose };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/otp/channels')) {
        return new Response(JSON.stringify(ALL_CHANNELS), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 401 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The phone screen is identified by its input, not by copy that may change. */
const phoneField = () => screen.queryByPlaceholderText('10 digit number');

describe('auth modal — what opens', () => {
  it('lands on the phone screen by default', async () => {
    renderModal();
    expect(await screen.findByPlaceholderText('10 digit number')).toBeInTheDocument();
  });

  it('lands on the phone screen when opened as "login"', async () => {
    renderModal({ initialMode: 'login' });
    expect(await screen.findByPlaceholderText('10 digit number')).toBeInTheDocument();
  });

  it('ALSO lands on the phone screen when opened as "register"', async () => {
    // Sign Up in the header passes 'register'. Verifying a new number creates
    // the account, so there is no separate form to open.
    renderModal({ initialMode: 'register' });
    expect(await screen.findByPlaceholderText('10 digit number')).toBeInTheDocument();
  });
});

describe('auth modal — no registration surface', () => {
  it('shows no Create Account control on the phone screen', async () => {
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/create my account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/don.t have an account/i)).not.toBeInTheDocument();
  });

  it('shows no Create Account control on the email screen either', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    await user.click(screen.getByRole('button', { name: /use email id/i }));
    await screen.findByPlaceholderText('you@example.com');

    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/don.t have an account/i)).not.toBeInTheDocument();
    // No Sign In / Create Account tab pair either.
    expect(screen.queryByText(/already have an account/i)).not.toBeInTheDocument();
  });
});

describe('auth modal — method toggle', () => {
  it('Use Email ID switches to the email screen', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    await user.click(screen.getByRole('button', { name: /use email id/i }));

    expect(await screen.findByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(phoneField()).not.toBeInTheDocument();
  });

  it('Use Phone Number switches back', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    await user.click(screen.getByRole('button', { name: /use email id/i }));
    await screen.findByPlaceholderText('you@example.com');
    await user.click(screen.getByRole('button', { name: /use phone number/i }));

    expect(await screen.findByPlaceholderText('10 digit number')).toBeInTheDocument();
  });

  /**
   * Switching method unmounts the phone screen, so without a persisted draft
   * the number went with it and the toggle behaved like a reset button. Both
   * a complete and a partial number are covered: the partial case is the one
   * that actually bites, since someone mid-type is most likely to glance at
   * the other method.
   */
  it('keeps a COMPLETE phone number across a method round trip', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(await screen.findByPlaceholderText('10 digit number'), '9876543210');

    await user.click(screen.getByRole('button', { name: /use email id/i }));
    await screen.findByPlaceholderText('you@example.com');
    await user.click(screen.getByRole('button', { name: /use phone number/i }));

    expect(await screen.findByPlaceholderText('10 digit number')).toHaveValue('9876543210');
  });

  it('keeps a PARTIAL phone number across a method round trip', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(await screen.findByPlaceholderText('10 digit number'), '98765');

    await user.click(screen.getByRole('button', { name: /use email id/i }));
    await screen.findByPlaceholderText('you@example.com');
    await user.click(screen.getByRole('button', { name: /use phone number/i }));

    expect(await screen.findByPlaceholderText('10 digit number')).toHaveValue('98765');
  });

  it('keeps the country code too', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const chosen = select.value;

    await user.click(screen.getByRole('button', { name: /use email id/i }));
    await screen.findByPlaceholderText('you@example.com');
    await user.click(screen.getByRole('button', { name: /use phone number/i }));

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(chosen);
  });

  it('a cleared field comes back cleared, rather than refilling itself', async () => {
    const user = userEvent.setup();
    renderModal();

    const field = await screen.findByPlaceholderText('10 digit number');
    await user.type(field, '98765');
    await user.clear(field);

    await user.click(screen.getByRole('button', { name: /use email id/i }));
    await screen.findByPlaceholderText('you@example.com');
    await user.click(screen.getByRole('button', { name: /use phone number/i }));

    expect(await screen.findByPlaceholderText('10 digit number')).toHaveValue('');
  });

  it('a draft never resurrects an expired OTP challenge', async () => {
    // A draft carries no challengeId, so the only thing it can restore is the
    // number. A dead challenge alongside it must still be discarded.
    const past = Date.now() - 60_000;
    sessionStorage.setItem('glamirk_otp_draft', JSON.stringify({ countryCode: '+91', phone: '9876543210' }));
    sessionStorage.setItem(
      'glamirk_otp_challenge',
      JSON.stringify({
        challengeId: 'chal-dead',
        maskedPhone: '+91 ******3210',
        method: 'sms',
        expiresAt: new Date(past).toISOString(),
        resendAvailableAt: new Date(past).toISOString(),
      })
    );

    renderModal();

    // The number is back, but the customer is at the phone step — not holding
    // six boxes for a code that is no longer valid.
    expect(await screen.findByPlaceholderText('10 digit number')).toHaveValue('9876543210');
    expect(screen.queryByLabelText('OTP digit 1')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('glamirk_otp_challenge')).toBeNull();
  });

  it('resumes an in-flight OTP challenge, and hides the method toggle there', async () => {
    // A live challenge, as MobileOtpSignIn persists it.
    const now = Date.now();
    sessionStorage.setItem(
      'glamirk_otp_challenge',
      JSON.stringify({
        challengeId: 'chal-test-1',
        maskedPhone: '+91 ******3210',
        method: 'sms',
        expiresAt: new Date(now + 60_000).toISOString(),
        resendAvailableAt: new Date(now + 60_000).toISOString(),
      })
    );

    renderModal();

    // Resumed straight into the code step rather than the phone field, so a
    // code already sent is not stranded by reopening the modal.
    expect(await screen.findByLabelText('OTP digit 1')).toBeInTheDocument();
    expect(phoneField()).not.toBeInTheDocument();

    // No method switch is offered while a code is outstanding. Deliberate:
    // leaving mid-verification would abandon a code that was really sent.
    expect(screen.queryByRole('button', { name: /use email id/i })).not.toBeInTheDocument();
  });
});

describe('auth modal — chrome and layout rules', () => {
  it('renders both panels, with the brand panel naming Login', async () => {
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    expect(screen.getByText('GLAMIRK ATELIER')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^login$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /log in for the best experience/i })).toBeInTheDocument();
  });

  it('applies the side-by-side rule at the sm breakpoint and stacks below it', async () => {
    const { container } = render(
      <CustomerAuthProvider>
        <AuthModal isOpen onClose={vi.fn()} />
      </CustomerAuthProvider>
    );
    await screen.findByPlaceholderText('10 digit number');

    // jsdom computes no layout, so this asserts the RULES are present, not
    // that the browser honours them.
    const panel = container.querySelector('.sm\\:flex-row');
    expect(panel).not.toBeNull();
    expect(panel?.className).toMatch(/max-w-md/); // narrow, stacked, on a phone
    expect(panel?.className).toMatch(/sm:max-w-3xl/); // wide, two-up, from sm
    expect(panel?.className).toMatch(/flex-col/); // stacked below sm
  });

  it('caps the modal at the viewport and scrolls the form, not the overlay', async () => {
    const { container } = render(
      <CustomerAuthProvider>
        <AuthModal isOpen onClose={vi.fn()} />
      </CustomerAuthProvider>
    );
    await screen.findByPlaceholderText('10 digit number');

    // A panel taller than the viewport centred in a scrolling overlay has its
    // top overflow clipped out of reach — the heading and the terms were both
    // unreachable. The height cap plus an internal scroller is what prevents
    // that, so both halves are pinned here.
    const panel = container.querySelector('.sm\\:flex-row');
    expect(panel?.className).toMatch(/max-h-\[var\(--auth-modal-max-h\)\]/);

    const scroller = container.querySelector('.overflow-y-auto');
    expect(scroller).not.toBeNull();
    // It must be allowed to shrink inside the flex column, or it stretches the
    // modal past the cap instead of scrolling.
    expect(scroller?.className).toMatch(/min-h-0/);
    // The overlay itself must NOT be the scroller.
    expect(container.querySelector('.fixed.inset-0')?.className).not.toMatch(/overflow-y-auto/);
  });

  it('states the terms before a code is requested', async () => {
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    expect(screen.getByText(/18 or older/i)).toBeInTheDocument();
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });
    await screen.findByPlaceholderText('10 digit number');

    // Found by accessible name, which is the whole point of labelling it.
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('auth modal — keyboard', () => {
  it('reaches the phone field and the method toggle by tabbing', async () => {
    const user = userEvent.setup();
    renderModal();
    const field = await screen.findByPlaceholderText('10 digit number');

    field.focus();
    expect(field).toHaveFocus();

    // Tab forward until the toggle is reached; it must be reachable without a
    // pointer, since it is the only way to the other method.
    const toggle = screen.getByRole('button', { name: /use email id/i });
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      await user.tab();
      if (document.activeElement === toggle) found = true;
    }
    expect(found).toBe(true);
  });

  it('activates the method toggle with the keyboard', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByPlaceholderText('10 digit number');

    screen.getByRole('button', { name: /use email id/i }).focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument());
  });
});
