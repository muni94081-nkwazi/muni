export type ServiceHealthStatus = 'healthy' | 'degraded' | 'down';

export const PLATFORM_SERVICES = [
  'advertising-service', 'analytics-service', 'auth-service', 'buyer-protection-service',
  'cart-service', 'chat-service', 'checkout-service', 'container-service', 'currency-service',
  'discount-service', 'dispute-service', 'fraud-service', 'fulfillment-service', 'inventory-service',
  'loyalty-service', 'marketplace-service', 'media-service', 'notification-service', 'order-service',
  'payment-service', 'pricing-service', 'product-service', 'qa-service', 'recommendation-service',
  'return-service', 'review-service', 'search-service', 'seller-education-service', 'shipping-service',
  'tax-service', 'user-service', 'wishlist-service',
] as const;

export type PlatformServiceName = typeof PLATFORM_SERVICES[number];

export interface ServiceHealthRecord {
  name: string;
  status: ServiceHealthStatus;
  latencyMs: number;
  /**
   * Historical uptime isn't tracked anywhere in the backend today (health
   * checks are point-in-time only) -- optional rather than fabricated.
   */
  uptimePercent?: number;
  lastCheckedAt: string;
}
