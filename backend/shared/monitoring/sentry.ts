import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';

export interface SentryConfig {
  dsn:         string;
  service:     string;
  environment: string;
  release?:    string;
  tracesSampleRate?: number;
  enabled?:    boolean;
}

export function initSentry(config: SentryConfig): void {
  if (!config.enabled || !config.dsn) {
    console.info(`[sentry] Disabled for ${config.service}`);
    return;
  }

  Sentry.init({
    dsn:              config.dsn,
    environment:      config.environment,
    release:          config.release ?? `${config.service}@1.0.0`,
    tracesSampleRate: config.tracesSampleRate ?? 0.1,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    beforeSend(event) {
      // Strip PII fields from request data
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }
      return event;
    },
  });

  console.info(`[sentry] Initialized for ${config.service} (env: ${config.environment})`);
}

/** Express error handler — MUST be last middleware */
export function sentryErrorHandler() {
  return Sentry.expressErrorHandler({
    shouldHandleError(error) {
      // Only capture 500+ errors. `status` is typed `string | number` —
      // Express errors carry either — so it is coerced rather than compared
      // directly, which is what the comparison used to do.
      return !error.status || Number(error.status) >= 500;
    },
  });
}

/** Capture an exception manually (e.g. in Kafka consumers) */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/** Capture a custom message (e.g. business logic warnings) */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'warning'): void {
  Sentry.captureMessage(message, level);
}

/** Set user context for error attribution */
export function setSentryUser(userId: string, email?: string): void {
  Sentry.setUser({ id: userId, email });
}

// `sentryRequestHandler` used to live here and called `Sentry.requestHandler()`,
// which @sentry/node removed in v8 — this repo is on v10. Request isolation and
// the per-request scope it used to create are set up automatically by
// `Sentry.init()` with the Express integration, so no middleware is needed.
//
// Removed rather than stubbed: nothing in the repository called it, and leaving
// a no-op named "request handler" would suggest an install step that does not
// exist.

/** Read SENTRY_DSN + NODE_ENV + SERVICE_NAME from env */
export function initSentryFromEnv(serviceName: string): void {
  initSentry({
    dsn:              process.env.SENTRY_DSN ?? '',
    service:          serviceName,
    environment:      process.env.NODE_ENV ?? 'development',
    release:          process.env.SERVICE_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    enabled:          !!process.env.SENTRY_DSN,
  });
}
