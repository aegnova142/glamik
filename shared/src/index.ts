/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Barrel for consumers that want everything. The backend deliberately imports
// the narrower `@glamirk/shared/types` subpath instead, so it never pulls
// React (or anything else browser-only) into the server bundle.
export * from './types';
export * from './utils/cmsClient';
export * from './utils/dateFormat';
export * from './utils/formValidation';
export * from './utils/paymentDisplay';
export * from './utils/productVariant';
export * from './utils/socket';
export * from './ai/recommendationEngine';
