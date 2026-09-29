/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// React components rendered by BOTH the storefront and the admin.
//
// The admin renders the real Footer and LiveOfferCountdown so its editors
// preview exactly what shoppers see, rather than an approximation that can
// drift. Exported through a barrel because this folder mixes .ts and .tsx,
// and a wildcard subpath export can only name one extension.
export { Footer, FOOTER_COLUMN_ICON_MAP } from './Footer';
export { LiveOfferCountdown } from './LiveOfferCountdown';
export {
  HPOSITION_OPTIONS,
  resolveHeroLayout,
  heroRowOrderClass,
  heroTextAlignClasses,
} from './heroSlideLayout';
export type { ResolvedHeroLayout } from './heroSlideLayout';
