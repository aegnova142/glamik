/**
 * Glamirk Beauty Private Limited — Analytics Foundation
 * Event tracking for luxury discovery, content-to-commerce paths & conversion.
 */

export type AnalyticsEventName =
  | 'page_view'
  | 'product_view'
  | 'search'
  | 'filter_applied'
  | 'shade_finder_start'
  | 'shade_finder_complete'
  | 'try_on_start'
  | 'try_on_complete'
  | 'content_view'
  | 'article_view'
  | 'guide_view'
  | 'look_view'
  | 'product_clicked_from_article'
  | 'social_post_clicked'
  | 'quiz_start'
  | 'quiz_complete'
  | 'add_to_cart'
  | 'add_to_wishlist'
  | 'checkout_start'
  | 'purchase_complete'
  | 'newsletter_subscribed';

export interface AnalyticsPayload {
  eventName: AnalyticsEventName;
  timestamp: string;
  properties?: Record<string, any>;
}

// In-memory or silent analytics buffer
const analyticsQueue: AnalyticsPayload[] = [];

export function trackEvent(eventName: AnalyticsEventName, properties: Record<string, any> = {}): void {
  const payload: AnalyticsPayload = {
    eventName,
    timestamp: new Date().toISOString(),
    properties,
  };

  analyticsQueue.push(payload);

  if (process.env.NODE_ENV !== 'production') {
    // Elegant internal log for verification without cluttering console excessively
    // console.debug(`[Glamirk Analytics]: ${eventName}`, properties);
  }
}

export function getAnalyticsQueue(): AnalyticsPayload[] {
  return [...analyticsQueue];
}
