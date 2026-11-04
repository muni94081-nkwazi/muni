import type { Request, Response, NextFunction } from 'express';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// ── Shared Prometheus registry for the API Gateway ───────────────────────────
// Exposes: http_requests_total, http_request_duration_seconds, gateway_*
// Endpoint: GET /metrics (scraped by Prometheus every 15s)

const register = new Registry();

// Default Node.js metrics: event loop lag, GC, memory, CPU, handles
collectDefaultMetrics({ register, prefix: 'node_' });

// ── HTTP Traffic Metrics ──────────────────────────────────────────────────────

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total incoming HTTP requests to the API Gateway',
  labelNames: ['method', 'path', 'status', 'service'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency distribution at the API Gateway',
  labelNames: ['method', 'path', 'status', 'service'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestSizeBytes = new Histogram({
  name: 'http_request_size_bytes',
  help: 'HTTP request body size',
  labelNames: ['method', 'service'],
  buckets: [100, 1_000, 10_000, 100_000, 1_000_000],
  registers: [register],
});

const httpResponseSizeBytes = new Histogram({
  name: 'http_response_size_bytes',
  help: 'HTTP response body size',
  labelNames: ['method', 'service'],
  buckets: [100, 1_000, 10_000, 100_000, 1_000_000],
  registers: [register],
});

const activeRequests = new Gauge({
  name: 'gateway_active_requests',
  help: 'Number of requests currently being proxied',
  registers: [register],
});

// ── Rate Limiting Metrics ─────────────────────────────────────────────────────

export const rateLimitHits = new Counter({
  name: 'gateway_rate_limit_hits_total',
  help: 'Requests rejected by the rate limiter',
  labelNames: ['tier', 'client_id'],
  registers: [register],
});

// ── Circuit Breaker Metrics ───────────────────────────────────────────────────

export const circuitBreakerOpen = new Gauge({
  name: 'gateway_circuit_breaker_open',
  help: '1 if the circuit breaker for a service is OPEN, 0 if CLOSED',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerTrips = new Counter({
  name: 'gateway_circuit_breaker_trips_total',
  help: 'Total times a circuit breaker opened',
  labelNames: ['service'],
  registers: [register],
});

// ── Auth Metrics ──────────────────────────────────────────────────────────────

export const jwtValidations = new Counter({
  name: 'gateway_jwt_validations_total',
  help: 'JWT token validation outcomes',
  labelNames: ['result'],  // success | expired | invalid | missing
  registers: [register],
});

// ── Proxy Metrics ─────────────────────────────────────────────────────────────

export const proxyErrors = new Counter({
  name: 'gateway_proxy_errors_total',
  help: 'Errors while proxying to upstream services',
  labelNames: ['service', 'error_type'],
  registers: [register],
});

export const proxyDuration = new Histogram({
  name: 'gateway_proxy_duration_seconds',
  help: 'Time spent waiting for upstream service response',
  labelNames: ['service'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── Middleware ────────────────────────────────────────────────────────────────

// Normalise dynamic path segments to avoid high-cardinality labels:
//   /api/v1/products/abc-123  → /api/v1/products/:id
//   /api/v1/orders/456/items  → /api/v1/orders/:id/items
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/[a-zA-Z0-9]{20,}/g, '/:id')
    .replace(/\/\d+/g, '/:id');
}

// Detect which upstream service from the request path
function detectService(path: string): string {
  if (path.startsWith('/api/v1/auth'))        return 'auth-service';
  if (path.startsWith('/api/v1/products'))    return 'product-service';
  if (path.startsWith('/api/v1/orders'))      return 'order-service';
  if (path.startsWith('/api/v1/payments'))    return 'payment-service';
  if (path.startsWith('/api/v1/cart'))        return 'cart-service';
  if (path.startsWith('/api/v1/checkout'))    return 'checkout-service';
  if (path.startsWith('/api/v1/search'))      return 'search-service';
  if (path.startsWith('/api/v1/shipping'))    return 'shipping-service';
  if (path.startsWith('/api/v1/sellers'))     return 'marketplace-service';
  if (path.startsWith('/api/v1/users'))       return 'auth-service';
  if (path.startsWith('/api/v1/reviews'))     return 'review-service';
  if (path.startsWith('/api/v1/inventory'))   return 'inventory-service';
  if (path.startsWith('/api/v1/currencies'))  return 'currency-service';
  if (path.startsWith('/api/v1/tax'))         return 'tax-service';
  if (path.startsWith('/api/v1/discounts'))   return 'discount-service';
  if (path.startsWith('/api/v1/wishlists'))   return 'wishlist-service';
  if (path.startsWith('/api/v1/media'))       return 'media-service';
  if (path.startsWith('/api/v1/fraud'))       return 'fraud-service';
  if (path.startsWith('/api/v1/returns'))     return 'return-service';
  if (path.startsWith('/api/v1/disputes'))    return 'dispute-service';
  if (path.startsWith('/api/v1/fulfillment')) return 'fulfillment-service';
  if (path.startsWith('/api/v1/analytics'))   return 'analytics-service';
  return 'unknown';
}

const SKIP_PATHS = new Set(['/health', '/health/live', '/health/ready', '/metrics']);

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_PATHS.has(req.path)) return next();

  const startMs  = Date.now();
  const service  = detectService(req.path);
  const normPath = normalizePath(req.path);

  activeRequests.inc();

  // Track request body size
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  if (contentLength > 0) {
    httpRequestSizeBytes.labels(req.method, service).observe(contentLength);
  }

  res.on('finish', () => {
    const durationSec    = (Date.now() - startMs) / 1000;
    const status         = String(res.statusCode);
    const responseLength = parseInt(res.getHeader('content-length') as string ?? '0', 10);

    httpRequestsTotal.labels(req.method, normPath, status, service).inc();
    httpRequestDuration.labels(req.method, normPath, status, service).observe(durationSec);
    if (responseLength > 0) {
      httpResponseSizeBytes.labels(req.method, service).observe(responseLength);
    }
    activeRequests.dec();
  });

  next();
}

// ── /metrics endpoint handler ──────────────────────────────────────────────────

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
}

export { register };
