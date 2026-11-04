// ─── notification-service client ──────────────────────────────────────────────
//
// auth-service publishes seller lifecycle events over Kafka, but password reset
// cannot use that path: it is a synchronous, user-initiated action whose whole
// value is that the code arrives within seconds, and a Kafka producer that
// failed to connect at boot silently drops messages (see events/kafka.ts).
//
// notification-service exposes POST /api/v1/notifications/send precisely "for
// services without a Kafka producer". It renders the registered template for
// the event type, so the copy lives in one place rather than being duplicated
// here.
//
// Called container-to-container, not through the gateway — the gateway mounts
// /notifications behind `auth()`, which expects a browser's bearer token.

import { signServiceIdentity, INTERNAL_IDENTITY_HEADER } from '../../../../shared/utils/internal-identity.js';

const BASE_URL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification-service:4007';

// Short: this sits in the request path of "forgot password". A slow notifier
// must not hold the HTTP response open — the caller treats failure as non-fatal.
const TIMEOUT_MS = Number(process.env.NOTIFICATION_TIMEOUT_MS ?? 5000);

export interface SendNotificationInput {
  userId: string;
  /** Template key in notification-service's TEMPLATES registry. */
  type: string;
  /** Values the template interpolates. */
  data?: Record<string, unknown>;
  /**
   * Collapses duplicate sends. Two "forgot password" taps in a row should
   * produce one message, not two competing codes.
   */
  dedupeKey?: string;
}

/**
 * Fire a templated notification. Resolves `true` when notification-service
 * accepted it.
 *
 * Never throws: the caller is a password-reset flow that must behave
 * identically whether or not the address exists, and must not turn a notifier
 * outage into a 500 that tells an attacker something.
 */
export async function sendNotification(input: SendNotificationInput): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // `/notifications/send` is internal-only: it takes `userId` in the body, so
    // unguarded it was "send any message to any user" over SMS, push or email.
    // The assertion carries the `svc` claim that separates a peer service from
    // a logged-in browser — without it this call is refused and the reset code
    // never goes out.
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const assertion = signServiceIdentity('auth-service', [], 'auth-service');
    if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;

    const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/v1/notifications/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 422 means no template is registered for this type — a deploy-time
      // mistake worth naming explicitly rather than logging "not ok".
      console.warn(
        `[auth-service] notification-service rejected ${input.type} (status ${res.status})`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[auth-service] could not reach notification-service for ${input.type}:`,
      (err as Error).message,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
