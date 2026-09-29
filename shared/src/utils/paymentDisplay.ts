import { PaymentDetails } from '../types';

const METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net Banking',
  wallet: 'Wallet',
  online: 'Online Payment',
};

const STATUS_LABELS: Record<string, string> = {
  COD_PENDING: 'Pay on Delivery',
  PAID: 'Paid',
};

export function getPaymentMethodLabel(method: string): string {
  return METHOD_LABELS[method] || method.toUpperCase();
}

export function getPaymentStatusLabel(status: PaymentDetails['status'] | string): string {
  return STATUS_LABELS[status] || status;
}
