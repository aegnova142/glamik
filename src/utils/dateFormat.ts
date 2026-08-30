/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** "28 Aug 2026, 6:47 pm" — used for order timelines, notifications, invoices. */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "28 Aug 2026" — used wherever only the date (not the time) is relevant. */
export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}
