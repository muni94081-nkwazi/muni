import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4011),

  databaseUrl: required('DATABASE_URL'),

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'kafka:29092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'review-service',
    groupId: process.env.KAFKA_GROUP_ID ?? 'review-service-order-group',
  },

  orderServiceUrl: process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003',
  serviceTimeoutMs: Number(process.env.SERVICE_TIMEOUT_MS ?? 5_000),

  review: {
    // A review must describe a purchase. Turning this off is a deliberate
    // choice for seeding/demo environments only — it is what separates this
    // service from an anonymous comment box, and it is why the star rating on
    // a product page means anything.
    requireVerifiedPurchase: process.env.REVIEW_REQUIRE_VERIFIED_PURCHASE !== 'false',

    // Require the goods to have actually arrived, not merely been ordered.
    // Reviewing an undelivered order is the cheapest way to farm fake ratings.
    requireDelivery: process.env.REVIEW_REQUIRE_DELIVERY !== 'false',

    /// Buyers may correct a review within this window; after it, edits would
    /// let a review bought with a refund be rewritten long after the fact.
    editWindowHours: Number(process.env.REVIEW_EDIT_WINDOW_HOURS ?? 48),

    /// PUBLISHED means reviews appear immediately and are moderated after the
    /// fact; PENDING holds every review for an admin. Defaults to post-moderation
    /// because pre-moderation with no staffed queue silently hides all reviews.
    defaultStatus: (process.env.REVIEW_DEFAULT_STATUS ?? 'PUBLISHED') as 'PUBLISHED' | 'PENDING',

    /// Reports needed before a published review is auto-pulled for review.
    autoHideReportThreshold: Number(process.env.REVIEW_AUTO_HIDE_REPORTS ?? 5),

    maxMediaPerReview: Number(process.env.REVIEW_MAX_MEDIA ?? 8),
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export default env;
