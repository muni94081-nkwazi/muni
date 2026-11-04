import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a shared registry
export const registry = new Registry();

// Collect Node.js default metrics (event loop, GC, memory, etc.)
collectDefaultMetrics({ register: registry });

// -- HTTP Metrics (used by all Express services) ----------------------------

export const httpRequestsTotal = new Counter({
  name:       'http_requests_total',
  help:       'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status', 'service'],
  registers:  [registry],
});

export const httpRequestDuration = new Histogram({
  name:       'http_request_duration_seconds',
  help:       'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status', 'service'],
  buckets:    [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers:  [registry],
});

export const activeConnections = new Gauge({
  name:      'http_active_connections',
  help:      'Number of active HTTP connections',
  labelNames: ['service'],
  registers: [registry],
});

// -- Business Metrics -------------------------------------------------------

export const ordersCreatedTotal = new Counter({
  name:      'orders_created_total',
  help:      'Total orders created',
  labelNames: ['currency', 'seller_id'],
  registers: [registry],
});

export const ordersCreatedFailures = new Counter({
  name:      'orders_created_failures_total',
  help:      'Failed order creation attempts',
  labelNames: ['reason'],
  registers: [registry],
});

export const paymentAttempts = new Counter({
  name:      'payment_attempts_total',
  help:      'Total payment attempts',
  labelNames: ['provider', 'currency'],
  registers: [registry],
});

export const paymentSuccesses = new Counter({
  name:      'payment_successes_total',
  help:      'Successful payments',
  labelNames: ['provider', 'currency'],
  registers: [registry],
});

export const paymentFailures = new Counter({
  name:      'payment_failures_total',
  help:      'Failed payments',
  labelNames: ['provider', 'reason'],
  registers: [registry],
});

export const paymentRevenue = new Counter({
  name:      'payment_revenue_total',
  help:      'Total revenue collected (in base currency units)',
  labelNames: ['currency'],
  registers: [registry],
});

export const fraudBlocks = new Counter({
  name:      'fraud_blocks_total',
  help:      'Requests blocked by fraud detection',
  labelNames: ['rule', 'score_bucket'],
  registers: [registry],
});

export const cartActiveSessions = new Gauge({
  name:      'cart_active_sessions',
  help:      'Number of active cart sessions in Redis',
  registers: [registry],
});

export const cartCheckoutsStarted = new Counter({
  name:      'cart_checkouts_started_total',
  help:      'Cart checkouts initiated',
  registers: [registry],
});

export const cartCheckoutsAbandoned = new Counter({
  name:      'cart_checkouts_abandoned_total',
  help:      'Cart checkouts abandoned (not completed)',
  registers: [registry],
});

export const checkoutSagaStarted = new Counter({
  name:      'checkout_saga_started_total',
  help:      'Checkout sagas initiated',
  registers: [registry],
});

export const checkoutSagaFailures = new Counter({
  name:      'checkout_saga_failures_total',
  help:      'Checkout sagas that failed and were compensated',
  labelNames: ['failed_step'],
  registers: [registry],
});

export const sellerRegistrations = new Counter({
  name:      'seller_registrations_total',
  help:      'Seller registration attempts',
  registers: [registry],
});

export const productViews = new Counter({
  name:      'product_views_total',
  help:      'Product page views',
  labelNames: ['category', 'seller_id'],
  registers: [registry],
});

// -- Kafka Metrics ----------------------------------------------------------

export const kafkaMessagesPublished = new Counter({
  name:      'kafka_messages_published_total',
  help:      'Kafka messages published',
  labelNames: ['topic', 'service'],
  registers: [registry],
});

export const kafkaMessagesConsumed = new Counter({
  name:      'kafka_messages_consumed_total',
  help:      'Kafka messages consumed',
  labelNames: ['topic', 'consumer_group', 'service'],
  registers: [registry],
});

export const kafkaMessagesFailed = new Counter({
  name:      'kafka_messages_failed_total',
  help:      'Kafka messages that failed processing and went to DLQ',
  labelNames: ['topic', 'consumer_group'],
  registers: [registry],
});

// -- Express Metrics Middleware ----------------------------------------------

import type { Request, Response, NextFunction } from 'express';

export function metricsMiddleware(serviceName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    // Skip /metrics endpoint itself
    if (req.path === '/metrics') return next();

    activeConnections.labels(serviceName).inc();

    res.on('finish', () => {
      const durationSec = (Date.now() - start) / 1000;
      const path        = req.route?.path ?? req.path ?? 'unknown';

      httpRequestsTotal.labels(req.method, path, String(res.statusCode), serviceName).inc();
      httpRequestDuration.labels(req.method, path, String(res.statusCode), serviceName).observe(durationSec);
      activeConnections.labels(serviceName).dec();
    });

    next();
  };
}

// -- /metrics endpoint handler ----------------------------------------------

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
