/**
 * The one place that opens Razorpay's hosted payment sheet.
 *
 * Extracted from CheckoutPage so the retry-payment flow in the orders list can
 * reuse it rather than growing a second copy. A duplicated sheet would be the
 * start of a second payment path — the handler that confirms with the server,
 * the dismiss behaviour and the failure branch all have to agree exactly, and
 * two copies drift.
 *
 * Nothing here is trusted: amount and currency are display-only, and the
 * gateway enforces whatever the order was actually created for.
 */

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Loads Razorpay's checkout script once, on demand. Not bundled: it must be
 * served from Razorpay's own domain for PCI reasons, and loading it eagerly
 * would cost every visitor a third-party request they mostly never need. */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/** What the server hands the browser so it can open the sheet. */
export interface GatewayHandoff {
  provider: string;
  gatewayOrderId: string;
  keyId: string | null;
  amountMinor: number;
  currency: string;
  isMock: boolean;
}

export interface GatewayCheckoutOutcome<TOrder> {
  success: boolean;
  order?: TOrder;
  error?: string;
}

/**
 * Opens the sheet and resolves once the customer finishes, fails or dismisses.
 *
 * The browser handshake is the fast path only — the server also receives a
 * webhook for the same payment and confirms independently, so a customer who
 * closes the tab mid-payment still gets their order. That is why a dismissed
 * sheet reports "not completed" rather than "failed": the payment may yet land.
 */
export function openRazorpayCheckout<TOrder>(input: {
  handoff: GatewayHandoff;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  /** Confirms the completed payment with the server, which re-verifies the
   * signature and the amount before believing any of it. */
  onVerify: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => Promise<GatewayCheckoutOutcome<TOrder>>;
  /** Advisory only — releases the stock reservation early instead of waiting
   * for the server's expiry sweep. The server refuses to cancel a payment that
   * actually went through. */
  onDismiss?: () => void;
}): Promise<GatewayCheckoutOutcome<TOrder>> {
  return loadRazorpayScript().then((ready) => {
    if (!ready || !(window as any).Razorpay) {
      return {
        success: false,
        error: 'We could not load the payment window. Please check your connection and try again.',
      };
    }

    return new Promise<GatewayCheckoutOutcome<TOrder>>((resolve) => {
      const razorpay = new (window as any).Razorpay({
        key: input.handoff.keyId,
        order_id: input.handoff.gatewayOrderId,
        // Display-only. The gateway enforces the amount the order was created
        // for, so tampering with these in the browser changes nothing.
        amount: input.handoff.amountMinor,
        currency: input.handoff.currency,
        name: 'Glamirk Beauty',
        description: input.description,
        prefill: input.prefill,
        theme: { color: '#C9972B' },
        handler: async (response: any) => {
          resolve(
            await input.onVerify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
          );
        },
        modal: {
          ondismiss: () => {
            input.onDismiss?.();
            resolve({ success: false, error: 'Payment was cancelled. Your bag has been kept.' });
          },
        },
      });

      razorpay.on('payment.failed', (event: any) => {
        resolve({
          success: false,
          error: event?.error?.description || 'Your payment was declined. Please try another method.',
        });
      });

      razorpay.open();
    });
  });
}
