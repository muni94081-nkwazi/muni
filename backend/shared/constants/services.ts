export const SERVICES = {
  AUTH: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  PRODUCT: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002',
  ORDER: process.env.ORDER_SERVICE_URL || 'http://localhost:4003',
  CART: process.env.CART_SERVICE_URL || 'http://localhost:4004',
  PAYMENT: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4005',
  SHIPPING: process.env.SHIPPING_SERVICE_URL || 'http://localhost:4006',
  NOTIFICATION: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4007',
  RECOMMENDATION: process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:4008',
  ANALYTICS: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4009',
} as const;

export type ServiceName = keyof typeof SERVICES;
