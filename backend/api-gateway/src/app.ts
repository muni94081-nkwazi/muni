import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';

import { isRedisReady }                      from './db/redis.js';
import { loggingMiddleware }                  from './middleware/logging.middleware.js';
import { responseTransformer }                from './middleware/response-transform.middleware.js';
import { optionalAuth, stripClientIdentity }  from './middleware/auth.middleware.js';
import { rateLimiter }                        from './middleware/rate-limit.middleware.js';
import { getAllCircuitMetrics }               from './resilience/circuit-breaker.js';
import { getAllBulkheadMetrics }              from './resilience/bulkhead.js';
import { captureError }                      from '../../shared/observability/sentry.js';
import { registerTargets }                   from './utils/proxy.js';
import { customerRoutes }                    from './routes/customer.routes.js';
import { adminRoutes }                       from './routes/admin.routes.js';
import { riderRoutes } from './routes/rider.routes.js';
import { sellerRoutes }                      from './routes/seller.routes.js';
import { metricsMiddleware, metricsHandler }  from './middleware/metrics.middleware.js';

// Strict CORS trusted-domain allowlist.
//
// Production origins are the baseline; CORS_ORIGINS adds to them, so a new
// environment (staging, a preview domain) does not require a code change.
//
// The localhost dev origins are appended only outside production. They were
// previously unconditional, which shipped four permanently-trusted origins to
// production for no benefit.
const PRODUCTION_ORIGINS = [
  'https://muni.ug',
  'https://www.muni.ug',
  'https://seller.muni.ug',
  'https://admin.muni.ug',
];

const DEV_ORIGINS = [
  'http://localhost:5173', // customer-web
  'http://localhost:5174', // customer-web (alt port)
  'http://localhost:5175', // seller-center
  'http://localhost:5176', // admin-panel
];

const ALLOWED_ORIGINS = [
  ...PRODUCTION_ORIGINS,
  ...(process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS),
  ...(process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];

export function createApp(targets: Record<string, string>): express.Application {
  registerTargets(targets);

  const app = express();

  // Behind nginx/ALB, req.ip is the proxy's address unless we trust the
  // X-Forwarded-For hop. Without this the anonymous rate-limit tier buckets
  // the entire internet into a single key.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  // ─── Enterprise HTTP Security Headers (Helmet) ─────────────────────────────
  // The gateway serves JSON, not documents, so this policy is defence in depth
  // for the one case that matters: a response rendered directly in a browser
  // (an error page, a misconfigured content-type, an OAuth redirect landing
  // here). The policy the SPAs actually run under is set at the nginx edge —
  // see nginx/includes/server-common.conf — and nginx strips this one off
  // proxied /api/ responses so the two cannot be enforced as an intersection.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline'. It was here mirroring the frontend's needs, but
        // nothing this service returns contains a script at all, so allowing
        // inline script bought nothing and weakened the one directive that
        // most matters if a JSON response is ever rendered as HTML.
        scriptSrc:  ["'self'"],
        // Still permitted, and still the frontend's constraint rather than
        // this service's: several pages style elements with inline `style`
        // attributes. Removable once those move onto CSS modules.
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...ALLOWED_ORIGINS],
        objectSrc:  ["'none'"],
        frameAncestors: ["'none'"],
        baseUri:    ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));

  // ─── Strict CORS Configuration ─────────────────────────────────────────────
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS origin '${origin}' not allowed by policy`));
      }
    },
    credentials: true,
    // X-Cart-Session is exposed because cart-service mints one for a guest who
    // arrives without it, and answers on this header. A browser cannot read a
    // response header that is not listed here, so without it the client would
    // be handed a session it could never store — and would get a fresh, empty
    // cart on every request.
    exposedHeaders: [
      'X-Correlation-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Cart-Session',
    ],
  }));

  app.use(express.json({ limit: '2mb' }));

  // ⓪ Delete every client-supplied identity header BEFORE anything reads them.
  //    Ordering is load-bearing: logging, rate limiting and every route guard
  //    below treat x-user-id as gateway-issued. If a client can set it, all
  //    three are bypassed at once. This must stay the first middleware.
  app.use(stripClientIdentity);

  app.use(loggingMiddleware);       // ① correlation IDs + structured logging
  app.use(responseTransformer);     // ② standardise all JSON responses
  app.use(optionalAuth);            // ③ JWT decode → headers (non-blocking)
  app.use(metricsMiddleware);        // ✅ Prometheus metrics collection
  app.use(rateLimiter());           // ④ Redis rate-limit (role-aware)

  // ─── Health & Metrics ─────────────────────────────────────────────────────

  app.get('/metrics', metricsHandler);

  app.get('/health/live', (_req, res) => {
    res.json({ service: 'api-gateway', status: 'up', ts: new Date().toISOString() });
  });

  app.get('/health/ready', (_req, res) => {
    const redisOk  = isRedisReady();
    const circuits = getAllCircuitMetrics();
    const openCount = circuits.filter((c) => c.state === 'OPEN').length;
    res.status(redisOk ? 200 : 503).json({
      service:  'api-gateway',
      ready:    redisOk,
      redis:    redisOk ? 'up' : 'down',
      circuits: { open: openCount, details: circuits },
      ts:       new Date().toISOString(),
    });
  });

  app.get('/health', (_req, res) => res.redirect('/health/live'));

  app.get('/internal/metrics', (_req, res) => {
    res.json({
      circuits:  getAllCircuitMetrics(),
      bulkheads: getAllBulkheadMetrics(),
      redis:     isRedisReady() ? 'up' : 'down',
      ts:        new Date().toISOString(),
    });
  });

  // ─── Service Routes ───────────────────────────────────────────────────────
  app.use('/api/v1',         customerRoutes(targets));  // public + authenticated customer routes
  app.use('/api/v1/seller',  sellerRoutes(targets));    // ROLE_SELLER+ routes
  app.use('/api/v1/admin',   adminRoutes(targets));     // ROLE_ADMIN+ routes
  app.use('/api/v1/rider',   riderRoutes(targets));     // ROLE_RIDER+ delivery routes

  // ─── 404 Handler ──────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      data:    null,
      error:   { code: 'NOT_FOUND', message: 'Route not found' },
      meta:    { timestamp: new Date().toISOString(), service: 'api-gateway' },
    });
  });

  // ─── Global Error Handler (Hides stack traces in Production) ──────────────
  app.use((
    error: Error & { status?: number },
    req:   express.Request,
    res:   express.Response,
    _next: express.NextFunction,
  ) => {
    const status = error.status ?? 502;

    // Anything reaching here is by definition unhandled — a proxy failure, a
    // route that threw, an upstream that never answered. All of it is worth
    // reporting; the gateway has no "expected" errors at this layer, because
    // the ones it expects are answered by handleProxyError upstream of this.
    captureError(error, {
      route:  req.path,
      method: req.method,
      status,
      userId: req.headers['x-user-id'] as string | undefined,
    });

    const message = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message;
    res.status(status).json({
      success: false,
      data:    null,
      error:   { code: 'BAD_GATEWAY', message },
      meta:    { timestamp: new Date().toISOString(), service: 'api-gateway' },
    });
  });

  return app;
}
