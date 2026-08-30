/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PageRoute } from '../types';

/** Converts an in-app route into a real, shareable URL path (+ query string
 * where a param is more natural than a path segment). This is the single
 * source of truth for the URL scheme — pathToRoute below is its exact
 * inverse, so keep them in sync when PageRoute changes. */
export function routeToPath(route: PageRoute): string {
  switch (route.page) {
    case 'home':
      return '/';
    case 'about':
      return '/about';
    case 'shop': {
      const params = new URLSearchParams();
      if (route.category) params.set('category', route.category);
      if (route.subCategory) params.set('subCategory', route.subCategory);
      const qs = params.toString();
      return `/shop${qs ? `?${qs}` : ''}`;
    }
    case 'product':
      return `/product/${encodeURIComponent(route.productId)}`;
    case 'shop-the-look':
      return route.lookId ? `/shop-the-look?lookId=${encodeURIComponent(route.lookId)}` : '/shop-the-look';
    case 'wishlist':
      return '/wishlist';
    case 'find-my-shade':
      return route.fromProductId ? `/find-my-shade?fromProductId=${encodeURIComponent(route.fromProductId)}` : '/find-my-shade';
    case 'try-on': {
      const params = new URLSearchParams();
      if (route.productId) params.set('productId', route.productId);
      if (route.shadeId) params.set('shadeId', route.shadeId);
      const qs = params.toString();
      return `/try-on${qs ? `?${qs}` : ''}`;
    }
    case 'my-glam':
      return route.initialTab ? `/my-glam?tab=${encodeURIComponent(route.initialTab)}` : '/my-glam';
    case 'cart':
      return '/cart';
    case 'checkout':
      return route.step ? `/checkout?step=${route.step}` : '/checkout';
    case 'order-confirmation':
      return `/order-confirmation/${encodeURIComponent(route.orderId)}`;
    case 'order-tracking':
      return route.orderId ? `/order-tracking/${encodeURIComponent(route.orderId)}` : '/order-tracking';
    case 'order-detail':
      return `/order-detail/${encodeURIComponent(route.orderId)}`;
    case 'support':
      return '/support';
    case 'journal':
      return route.category ? `/journal?category=${encodeURIComponent(route.category)}` : '/journal';
    case 'article':
      return `/article/${encodeURIComponent(route.articleId)}`;
    case 'beauty-guides':
      return route.guideId ? `/beauty-guides/${encodeURIComponent(route.guideId)}` : '/beauty-guides';
    case 'social-commerce':
      return route.postId ? `/social-commerce/${encodeURIComponent(route.postId)}` : '/social-commerce';
    case 'campaign':
      return `/campaign/${encodeURIComponent(route.campaignId)}`;
    case 'new-launch':
      return '/new-launch';
    case 'legal':
      return route.policy ? `/legal/${route.policy}` : '/legal';
    case 'dynamic-page':
      return `/${route.slug}`;
    case 'admin': {
      const params = new URLSearchParams();
      if (route.subTab) params.set('tab', route.subTab);
      if (route.editId) params.set('edit', route.editId);
      if (route.previewMode) params.set('preview', '1');
      const qs = params.toString();
      return `/admin${qs ? `?${qs}` : ''}`;
    }
    case '404':
      return '/404';
    default:
      return '/';
  }
}

const LEGAL_POLICIES = ['privacy', 'terms', 'shipping', 'returns', 'cookies'] as const;
const MY_GLAM_TABS = ['PROFILE', 'ORDERS', 'SHADES', 'WISHLIST', 'ADDRESSES', 'PRIVÉ', 'REVIEWS', 'RETURNS', 'SUPPORT'] as const;
const CHECKOUT_STEPS = ['details', 'delivery', 'payment', 'review'] as const;

/** Parses a real URL (pathname + search) back into a PageRoute — the exact
 * inverse of routeToPath. Used both for the initial page load (so a direct
 * link to e.g. /shop or /product/:id lands on the right screen instead of
 * always falling back to home) and for browser back/forward (popstate). */
export function pathToRoute(pathname: string, search: string): PageRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const segments = path.split('/').filter(Boolean);
  const [first, second] = segments;

  if (path === '/') return { page: 'home' };

  switch (first) {
    case 'about':
      return { page: 'about' };
    case 'shop':
      return { page: 'shop', category: params.get('category'), subCategory: params.get('subCategory') };
    case 'product':
      if (second) return { page: 'product', productId: second };
      break;
    case 'shop-the-look':
      return { page: 'shop-the-look', lookId: params.get('lookId') || undefined };
    case 'wishlist':
      return { page: 'wishlist' };
    case 'find-my-shade':
      return { page: 'find-my-shade', fromProductId: params.get('fromProductId') || undefined };
    case 'try-on':
      return {
        page: 'try-on',
        productId: params.get('productId') || undefined,
        shadeId: params.get('shadeId') || undefined,
      };
    case 'my-glam': {
      const tab = params.get('tab');
      const initialTab = (MY_GLAM_TABS as readonly string[]).includes(tab || '') ? (tab as (typeof MY_GLAM_TABS)[number]) : undefined;
      return { page: 'my-glam', initialTab };
    }
    case 'cart':
      return { page: 'cart' };
    case 'checkout': {
      const step = params.get('step');
      return { page: 'checkout', step: (CHECKOUT_STEPS as readonly string[]).includes(step || '') ? (step as (typeof CHECKOUT_STEPS)[number]) : undefined };
    }
    case 'order-confirmation':
      if (second) return { page: 'order-confirmation', orderId: second };
      break;
    case 'order-tracking':
      return { page: 'order-tracking', orderId: second || undefined };
    case 'order-detail':
      if (second) return { page: 'order-detail', orderId: second };
      break;
    case 'support':
      return { page: 'support' };
    case 'journal':
      return { page: 'journal', category: params.get('category') || undefined };
    case 'article':
      if (second) return { page: 'article', articleId: second };
      break;
    case 'beauty-guides':
      return { page: 'beauty-guides', guideId: second || undefined };
    case 'social-commerce':
      return { page: 'social-commerce', postId: second || undefined };
    case 'campaign':
      if (second) return { page: 'campaign', campaignId: second };
      break;
    case 'new-launch':
      return { page: 'new-launch' };
    case 'legal': {
      const policy = (LEGAL_POLICIES as readonly string[]).includes(second || '') ? (second as (typeof LEGAL_POLICIES)[number]) : undefined;
      return { page: 'legal', policy };
    }
    case 'admin':
      return {
        page: 'admin',
        subTab: params.get('tab') || undefined,
        editId: params.get('edit') || undefined,
        previewMode: params.get('preview') === '1',
      };
    case '404':
      return { page: '404' };
    default:
      break;
  }

  // A single unrecognized segment (e.g. /our-story) is treated as an
  // admin-authored CMS page by slug — that's the only way dynamic-page
  // routes are ever reachable, since nothing in the UI links to them
  // directly. Anything deeper than one segment falls through to 404.
  if (segments.length === 1) {
    return { page: 'dynamic-page', slug: segments[0] };
  }
  return { page: '404' };
}
