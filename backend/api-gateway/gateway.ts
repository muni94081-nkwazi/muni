// MUST be first: starts OpenTelemetry before any instrumented library loads.
import './telemetry.js';
import 'dotenv/config';
import { createApp } from './src/app.js';
import { connectRedis, disconnectRedis } from './src/db/redis.js';
import { isPlaceholderSecret, placeholderSecretMessage } from '../shared/security/placeholder-secrets.js';
import { captureError, flushSentry, initSentry } from '../shared/observability/sentry.js';

// Before the app is built, so a failure during wiring is reported rather than
// lost. No-op unless SENTRY_DSN is set.
initSentry('api-gateway');

const PORT = Number(process.env.PORT ?? 8080);

// Fallbacks below mirror each service's own `process.env.PORT ?? <default>` —
// keep them in sync when a service's default port changes.
const targets: Record<string, string> = {
  // ── Existing services ────────────────────────────────────────────────────
  auth:           process.env.AUTH_SERVICE_URL            ?? 'http://localhost:4001',
  product:        process.env.PRODUCT_SERVICE_URL         ?? 'http://localhost:4002',
  order:          process.env.ORDER_SERVICE_URL           ?? 'http://localhost:4003',
  payment:        process.env.PAYMENT_SERVICE_URL         ?? 'http://localhost:4005',
  shipping:       process.env.SHIPPING_SERVICE_URL        ?? 'http://localhost:4006',
  notification:   process.env.NOTIFICATION_SERVICE_URL   ?? 'http://localhost:4007',
  analytics:      process.env.ANALYTICS_SERVICE_URL       ?? 'http://localhost:4009',
  newsletter:     process.env.NEWSLETTER_SERVICE_URL      ?? 'http://localhost:4034',
  recommendation: process.env.RECOMMENDATION_SERVICE_URL ?? 'http://localhost:4008',
  search:         process.env.SEARCH_SERVICE_URL          ?? 'http://localhost:4010',
  inventory:      process.env.INVENTORY_SERVICE_URL       ?? 'http://localhost:4004',
  review:         process.env.REVIEW_SERVICE_URL          ?? 'http://localhost:4011',
  currency:         process.env.CURRENCY_SERVICE_URL         ?? 'http://localhost:4013',
  tax:              process.env.TAX_SERVICE_URL              ?? 'http://localhost:4014',
  discount:         process.env.DISCOUNT_SERVICE_URL         ?? 'http://localhost:4015',
  wishlist:         process.env.WISHLIST_SERVICE_URL         ?? 'http://localhost:4016',
  cart:             process.env.CART_SERVICE_URL             ?? 'http://localhost:4017',
  media:            process.env.MEDIA_SERVICE_URL            ?? 'http://localhost:4018',
  fraud:            process.env.FRAUD_SERVICE_URL            ?? 'http://localhost:4019',
  returns:          process.env.RETURN_SERVICE_URL           ?? 'http://localhost:4020',
  dispute:          process.env.DISPUTE_SERVICE_URL          ?? 'http://localhost:4021',
  marketplace:      process.env.MARKETPLACE_SERVICE_URL     ?? 'http://localhost:4022',
  fulfillment:      process.env.FULFILLMENT_SERVICE_URL      ?? 'http://localhost:4023',
  checkout:         process.env.CHECKOUT_SERVICE_URL         ?? 'http://localhost:4024',
  buyerProtection:  process.env.BUYER_PROTECTION_SERVICE_URL   ?? 'http://localhost:4026',
  sellerEducation:  process.env.SELLER_EDUCATION_SERVICE_URL   ?? 'http://localhost:4028',
  wholesale:        process.env.WHOLESALE_SERVICE_URL          ?? 'http://localhost:4003',
  tracking:         process.env.TRACKING_SERVICE_URL           ?? 'http://localhost:4006',
  'buyer-protection': process.env.BUYER_PROTECTION_SERVICE_URL ?? 'http://localhost:4026',
  chat:             process.env.CHAT_SERVICE_URL             ?? 'http://localhost:4025',
  loyalty:          process.env.LOYALTY_SERVICE_URL          ?? 'http://localhost:4030',
  qa:               process.env.QA_SERVICE_URL               ?? 'http://localhost:4029',
  pricing:          process.env.PRICING_SERVICE_URL          ?? 'http://localhost:4033',
  advertising:      process.env.ADVERTISING_SERVICE_URL      ?? 'http://localhost:4027',
  'seller-education': process.env.SELLER_EDUCATION_SERVICE_URL ?? 'http://localhost:4028',
  user:             process.env.USER_SERVICE_URL             ?? 'http://localhost:3001',
  containers:       process.env.CONTAINER_SERVICE_URL        ?? 'http://localhost:4031',
  support:          process.env.SUPPORT_SERVICE_URL          ?? 'http://localhost:4032',
};

function requireInternalIdentitySecret(): void {
  const secret = process.env.INTERNAL_IDENTITY_SECRET;

  // A shipped placeholder is long enough to pass the length check below but is
  // public, so it is rejected first — and only in production, because the whole
  // point of the compose fallback is that a fresh clone boots without setup.
  if (process.env.NODE_ENV === 'production' && isPlaceholderSecret(secret)) {
    throw new Error(
      '[gateway] ' + placeholderSecretMessage('INTERNAL_IDENTITY_SECRET') + '\n' +
      '          Then set it identically on the gateway and every service that verifies it.',
    );
  }

  if (!secret || secret.length < 32) {
    throw new Error(
      '[gateway] INTERNAL_IDENTITY_SECRET is required and must be at least 32 characters.\n' +
      '          It signs the short-lived assertions that let order-, payment- and\n' +
      '          inventory-service verify who a caller is. Without it those services\n' +
      '          fall back to trusting plain x-user-id headers.\n' +
      '          Generate one with:  openssl rand -hex 32\n' +
      '          Then set it identically on the gateway and every service that verifies it.',
    );
  }
}

async function start() {
  // Before anything binds a port: a misconfigured secret must stop the deploy,
  // not surface later as an authorization gap.
  requireInternalIdentitySecret();

  // Connect to Redis before accepting traffic (rate-limiter degrades gracefully if unavailable)
  try {
    await connectRedis();
  } catch (err) {
    console.warn('[gateway] Redis unavailable — rate-limiter will use in-memory fallback:', err);
  }

  const app = createApp(targets);

  const server = app.listen(PORT, () => {
    console.log(`[gateway] 🚀 Listening on port ${PORT}`);
    console.log(`[gateway] Proxying to: ${JSON.stringify(targets, null, 2)}`);
  });

  // ─── Graceful Shutdown ────────────────────────────────────────────────────
  async function shutdown(signal: string) {
    console.log(`[gateway] ${signal} received — shutting down`);
    server.close(async () => {
      // Flushed before exit: Sentry buffers events, and process.exit drops
      // whatever is still in that buffer.
      await flushSentry();
      await disconnectRedis();
      process.exit(0);
    });
    // Force exit after 10 s if graceful shutdown stalls
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // The gateway sits in front of everything, so a crash here is a full outage.
  // Both handlers report before letting the process do what it would anyway.
  process.on('unhandledRejection', (reason) => {
    console.error('[gateway] Unhandled promise rejection:', reason);
    captureError(reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[gateway] Uncaught exception:', error);
    captureError(error);
    void flushSentry(1000).finally(() => process.exit(1));
  });
}

start().catch((err) => {
  console.error('[gateway] Fatal startup error:', err);
  process.exit(1);
});
