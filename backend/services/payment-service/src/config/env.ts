// ─── Centralised, validated environment configuration ─────────────────────────
//
// Every external integration point (MTN, Airtel, Redis, currency-service,
// Kafka) reads its config from here rather than touching `process.env`
// directly. This keeps defaults, types, and "is this safe to run without
// real credentials in dev" decisions in one place.
//
// In production, missing provider credentials fail fast at boot (you cannot
// silently process real money with an empty subscription key). In
// development/test, missing credentials only log a warning so the rest of
// the service (mock methods, other drivers, tests) keeps working.

const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const isProduction = NODE_ENV === 'production';

function required(name: string, value: string | undefined): string {
  if (!value) {
    const msg = `[config] Missing required environment variable: ${name}`;
    if (isProduction) throw new Error(msg);
    console.warn(`${msg} (non-fatal outside production)`);
    return '';
  }
  return value;
}

export const env = {
  nodeEnv: NODE_ENV,
  port: Number(process.env.PORT ?? 4005),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'payment-service',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  pendingPaymentWorker: {
    pollIntervalMs: Number(process.env.PENDING_PAYMENT_POLL_INTERVAL_MS ?? 5000),
    retryBackoffMs: Number(process.env.PENDING_PAYMENT_RETRY_BACKOFF_MS ?? 5000),
    maxPollAttempts: Number(process.env.PENDING_PAYMENT_MAX_ATTEMPTS ?? 24), // ~2 minutes at the default interval
    batchSize: Number(process.env.PENDING_PAYMENT_BATCH_SIZE ?? 50),
    lockTtlMs: Number(process.env.PENDING_PAYMENT_LOCK_TTL_MS ?? 10_000),
  },

  currency: {
    serviceUrl: process.env.CURRENCY_SERVICE_URL ?? 'http://localhost:4013',
    timeoutMs: Number(process.env.CURRENCY_CONVERT_TIMEOUT_MS ?? 5000),
    settlementCurrency: process.env.DEFAULT_SETTLEMENT_CURRENCY ?? 'UGX',
  },

  mtn: {
    baseUrl: process.env.MTN_MOMO_BASE_URL ?? 'https://sandbox.momodeveloper.mtn.com',
    targetEnvironment: process.env.MTN_MOMO_TARGET_ENVIRONMENT ?? 'sandbox',
    currency: process.env.MTN_MOMO_CURRENCY ?? 'UGX',
    collection: {
      subscriptionKey: required('MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY', process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY),
      apiUser: required('MTN_MOMO_COLLECTION_API_USER', process.env.MTN_MOMO_COLLECTION_API_USER),
      apiKey: required('MTN_MOMO_COLLECTION_API_KEY', process.env.MTN_MOMO_COLLECTION_API_KEY),
    },
    disbursement: {
      subscriptionKey: required('MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY', process.env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY),
      apiUser: required('MTN_MOMO_DISBURSEMENT_API_USER', process.env.MTN_MOMO_DISBURSEMENT_API_USER),
      apiKey: required('MTN_MOMO_DISBURSEMENT_API_KEY', process.env.MTN_MOMO_DISBURSEMENT_API_KEY),
    },
    webhookHmacSecret: process.env.MTN_MOMO_WEBHOOK_HMAC_SECRET ?? '',
  },

  airtel: {
    baseUrl: process.env.AIRTEL_MONEY_BASE_URL ?? 'https://openapiuat.airtel.africa',
    country: process.env.AIRTEL_MONEY_COUNTRY ?? 'UG',
    currency: process.env.AIRTEL_MONEY_CURRENCY ?? 'UGX',
    clientId: required('AIRTEL_MONEY_CLIENT_ID', process.env.AIRTEL_MONEY_CLIENT_ID),
    clientSecret: required('AIRTEL_MONEY_CLIENT_SECRET', process.env.AIRTEL_MONEY_CLIENT_SECRET),
    publicKey: process.env.AIRTEL_MONEY_PUBLIC_KEY ?? '',
    publicKeyPath: process.env.AIRTEL_MONEY_PUBLIC_KEY_PATH ?? '',
    disbursementPin: process.env.AIRTEL_MONEY_DISBURSEMENT_PIN ?? '',
    webhookHmacSecret: process.env.AIRTEL_MONEY_WEBHOOK_HMAC_SECRET ?? '',
  },

  // ─── Legacy aggregators (Flutterwave, Pesapal) ────────────────────────────
  //
  // These two default to '' for the same reason every other webhook secret
  // above does: an empty secret must make verification fail closed, never
  // succeed. They previously defaulted to the literals
  // 'muni_flw_secret_hash_uganda' and 'muni_pesapal_secret', which are
  // committed to this repository — so anyone able to read the source could
  // forge a settlement webhook and have it accepted as genuine.
  //
  // Not routed through required(): unlike MTN/Airtel/Visa these are optional
  // integrations, and a deployment that does not use them should not have to
  // invent a credential just to boot. gateway.service.ts refuses to verify at
  // all when the corresponding secret is absent.
  legacy: {
    flutterwaveSecretHash: process.env.FLUTTERWAVE_SECRET_HASH ?? '',
    pesapalConsumerSecret: process.env.PESAPAL_CONSUMER_SECRET ?? '',
  },

  // ─── Direct Visa/Mastercard card processing (tokenized + 3DS2) ────────────
  //
  // `baseUrl` points at the PCI-DSS Level 1 card acquirer/gateway that
  // actually holds card data (e.g. a hosted-tokenization + 3DS2 processor).
  // This service only ever sees the `cardToken` that gateway hands back to
  // the client-side SDK — never a raw PAN/CVC — which is what keeps this
  // backend out of full PCI card-data scope (SAQ A-EP).
  visaCard: {
    // No default. The previous one, 'https://sandbox.cardgateway.muni.ug/v2',
    // is not a host that exists — a deployment that set the three credentials
    // below and forgot this one would have sent real card authorisations at a
    // domain that does not resolve. An empty string is caught by
    // `isCardConfigured()` and the method refuses, which is the honest failure.
    baseUrl: process.env.VISA_CARD_GATEWAY_BASE_URL ?? '',
    merchantId: required('VISA_CARD_MERCHANT_ID', process.env.VISA_CARD_MERCHANT_ID),
    apiKey: required('VISA_CARD_API_KEY', process.env.VISA_CARD_API_KEY),
    apiSecret: required('VISA_CARD_API_SECRET', process.env.VISA_CARD_API_SECRET),
    /** Shared secret for HMAC-SHA256 webhook signatures, when the gateway uses that scheme. */
    webhookHmacSecret: process.env.VISA_CARD_WEBHOOK_HMAC_SECRET ?? '',
    /** PEM-encoded RSA public key for RSA-SHA256 webhook signatures, when the gateway signs that way. */
    webhookRsaPublicKey: process.env.VISA_CARD_WEBHOOK_RSA_PUBLIC_KEY ?? '',
    /** Base URL of this service, used to build the 3DS ACS `returnUrl` callback. */
    threeDsReturnBaseUrl: process.env.VISA_CARD_3DS_RETURN_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4005}`,
    /** customer-web origin the browser is redirected back to once 3DS resolves. */
    checkoutFrontendUrl: process.env.CUSTOMER_WEB_BASE_URL ?? 'http://localhost:5173',
  },
} as const;

// ─── Which providers can actually take money ──────────────────────────────────
//
// `required()` above is fatal in production and a warning elsewhere, so outside
// production a service boots happily with empty provider credentials. What it
// must not then do is attempt a collection anyway: an empty subscription key
// produces a 401 from MTN, an empty base URL produces a DNS failure, and both
// surface to the customer as an opaque error on a checkout that was never
// going to work.
//
// These say plainly whether a provider is usable, so gateway.service can refuse
// the method up front — the same treatment Flutterwave and Pesapal already get
// for having no integration at all. The difference is only the reason: those
// two have no driver, these three have a real driver and no credentials.

export function isMtnConfigured(): boolean {
  const c = env.mtn.collection;
  return Boolean(c.subscriptionKey && c.apiUser && c.apiKey);
}

export function isAirtelConfigured(): boolean {
  return Boolean(env.airtel.clientId && env.airtel.clientSecret);
}

export function isCardConfigured(): boolean {
  const c = env.visaCard;
  return Boolean(c.baseUrl && c.merchantId && c.apiKey && c.apiSecret);
}

/** Disbursement is a separate credential set from collection on MTN. */
export function isMtnDisbursementConfigured(): boolean {
  const d = env.mtn.disbursement;
  return Boolean(d.subscriptionKey && d.apiUser && d.apiKey);
}

/** Every provider and whether it can be used, for the readiness endpoint. */
export function providerReadiness(): Record<string, { driver: boolean; configured: boolean }> {
  return {
    cod:        { driver: true,  configured: true },
    mtn_momo:   { driver: true,  configured: isMtnConfigured() },
    airtel:     { driver: true,  configured: isAirtelConfigured() },
    visa_card:  { driver: true,  configured: isCardConfigured() },
    // No driver exists for either; see gateway.service.ts.
    flutterwave: { driver: false, configured: false },
    pesapal:     { driver: false, configured: false },
  };
}
