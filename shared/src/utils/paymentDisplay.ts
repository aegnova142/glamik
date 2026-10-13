import { PaymentDetails } from '../types';

const METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net Banking',
  wallet: 'Wallet',
  online: 'Online Payment',
};

/**
 * Every member of PaymentStatus, spelled for a customer.
 *
 * Previously only COD_PENDING and PAID were mapped, and the fallback returned
 * the raw value — so a shopper whose card was declined saw the bare token
 * `FAILED`, and a partial refund read `PARTIALLY_REFUNDED`. Six surfaces render
 * through here, including the printed invoice.
 *
 * Deliberately NOT a Record<PaymentStatus, string>: this function also receives
 * the loose `string` from legacy rows, and a total map would make the fallback
 * below unreachable while still not covering those. The test suite asserts the
 * eight known members are all present, which is the guarantee that matters.
 */
const STATUS_LABELS: Record<string, string> = {
  COD_PENDING: 'Pay on Delivery',
  PENDING: 'Awaiting Payment',
  PAID: 'Paid',
  FAILED: 'Payment Failed',
  CANCELLED: 'Payment Cancelled',
  EXPIRED: 'Payment Expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially Refunded',
};

export function getPaymentMethodLabel(method: string): string {
  return METHOD_LABELS[method] || method.toUpperCase();
}

/**
 * Unknown values fall through to the raw string rather than being coerced into
 * 'Paid' or 'Pay on Delivery'. Showing an operator an unfamiliar token is
 * recoverable; telling a customer they have paid when the system does not know
 * that is not.
 */
export function getPaymentStatusLabel(status: PaymentDetails['status'] | string): string {
  return STATUS_LABELS[status] || status;
}
