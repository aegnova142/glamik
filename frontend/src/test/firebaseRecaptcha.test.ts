/**
 * The reCAPTCHA teardown in frontend/src/utils/firebaseAuth.ts.
 *
 * A verifier is single use, so createRecaptcha() clears before it builds. The
 * part that is easy to get wrong — and that broke Resend in production — is
 * that `RecaptchaVerifier.clear()` detaches the verifier but leaves
 * grecaptcha's own markup inside the container element, and grecaptcha refuses
 * to render a second widget into an element that already holds one ("reCAPTCHA
 * has already been rendered in this element"). The first code sent; every
 * resend after it threw, and the throw reached the customer as the generic
 * "we couldn't send the OTP right now".
 *
 * So the invariant that matters is small and checkable: after clearRecaptcha()
 * the container is EMPTY, which is the precondition the next widget needs.
 * That is what is asserted here.
 *
 * Only clearRecaptcha() is exercised, deliberately. Everything else in the
 * module goes through firebaseApp(), which reads VITE_FIREBASE_* from
 * import.meta.env — and Vitest's import.meta.env is per-module and carries no
 * VITE_ values, so those paths cannot be reached from a test without
 * configuring the runner around one assertion. The send and resend calls are
 * covered at the component level in firebaseOtpSignIn.test.tsx instead.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { clearRecaptcha, RECAPTCHA_CONTAINER_ID } from '@/utils/firebaseAuth';

/** Stands in for the markup grecaptcha leaves behind after clear(). */
function renderFakeWidget(container: HTMLElement): void {
  const widget = document.createElement('div');
  widget.className = 'grecaptcha-badge';
  widget.appendChild(document.createElement('iframe'));
  container.appendChild(widget);
}

beforeEach(() => {
  document.body.innerHTML = `<div id="${RECAPTCHA_CONTAINER_ID}"></div>`;
});

describe('firebaseAuth — reCAPTCHA teardown', () => {
  it('empties the container, so the next verifier has somewhere to render', () => {
    const container = document.getElementById(RECAPTCHA_CONTAINER_ID)!;
    renderFakeWidget(container);
    expect(container.childElementCount).toBe(1);

    clearRecaptcha();

    // Left non-empty, the next createRecaptcha() throws and the resend fails.
    expect(container.childElementCount).toBe(0);
  });

  it('is idempotent — clearing twice is not an error', () => {
    const container = document.getElementById(RECAPTCHA_CONTAINER_ID)!;
    renderFakeWidget(container);

    expect(() => {
      clearRecaptcha();
      clearRecaptcha();
    }).not.toThrow();
    expect(container.childElementCount).toBe(0);
  });

  it('tolerates the container having left the DOM', () => {
    document.body.innerHTML = '';
    // Unmounting the sign-in modal takes the container with it; a clear on the
    // way out must not throw into an unmount.
    expect(() => clearRecaptcha()).not.toThrow();
  });
});
