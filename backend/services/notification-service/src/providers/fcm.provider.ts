import crypto from 'node:crypto';
import env from '../config/env.js';
import logger from '../config/logger.js';
import type { NotificationProvider, SendRequest, SendResult } from './types.js';

// ─── Firebase Cloud Messaging (HTTP v1) ─────────────────────────────────────
//
// The legacy FCM server-key endpoint is retired, so v1 is the only option and
// it requires an OAuth2 bearer token minted from the service account. That is
// a signed JWT exchanged for an access token — about sixty lines here, versus
// pulling in firebase-admin and its transitive tree for one HTTP call.
//
// Docs: https://firebase.google.com/docs/cloud-messaging/send-message

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const JWT_LIFETIME_SECONDS = 3600;
/** Refresh a little early so an in-flight send never races the expiry. */
const TOKEN_REFRESH_SKEW_SECONDS = 60;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * FCM's per-token errors. UNREGISTERED and INVALID_ARGUMENT mean this device
 * token is dead — retrying cannot fix it, and the token should be disabled so
 * it stops being selected on every future send.
 */
const DEAD_TOKEN_STATUSES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND']);

export class FcmProvider implements NotificationProvider {
  readonly name = 'fcm';
  readonly channel = 'PUSH' as const;

  private cachedToken: CachedToken | null = null;
  private inFlightToken: Promise<string> | null = null;

  isConfigured(): boolean {
    return (
      env.fcm.enabled &&
      Boolean(env.fcm.projectId && env.fcm.clientEmail && env.fcm.privateKey)
    );
  }

  /** True when FCM reported the destination token as permanently invalid. */
  lastTokenWasDead = false;

  private signAssertion(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(
      JSON.stringify({
        iss: env.fcm.clientEmail,
        scope: SCOPE,
        aud: TOKEN_ENDPOINT,
        iat: now,
        exp: now + JWT_LIFETIME_SECONDS,
      }),
    );

    const signingInput = `${header}.${claims}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), env.fcm.privateKey);
    return `${signingInput}.${base64Url(signature)}`;
  }

  private async fetchAccessToken(): Promise<string> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.signAssertion(),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
      error?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new Error(
        `FCM token exchange failed (${response.status}): ${payload.error_description ?? payload.error ?? 'unknown'}`,
      );
    }

    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + ((payload.expires_in ?? JWT_LIFETIME_SECONDS) - TOKEN_REFRESH_SKEW_SECONDS) * 1000,
    };

    return payload.access_token;
  }

  /** Cached, and de-duplicated: a burst of sends triggers one token exchange. */
  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.accessToken;
    }
    this.inFlightToken ??= this.fetchAccessToken().finally(() => {
      this.inFlightToken = null;
    });
    return this.inFlightToken;
  }

  async send(request: SendRequest): Promise<SendResult> {
    this.lastTokenWasDead = false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.serviceTimeoutMs);

    try {
      const token = await this.accessToken();

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${env.fcm.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: request.destination,
              notification: { title: request.title, body: request.body },
              // FCM data values must be strings; the dispatcher stringifies
              // before handing the payload over.
              data: request.data ?? {},
              android: { priority: 'high' },
              apns: { headers: { 'apns-priority': '10' } },
            },
          }),
          signal: controller.signal,
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        name?: string;
        error?: { status?: string; message?: string };
      };

      if (response.ok) {
        return { ok: true, providerMessageId: payload.name };
      }

      const status = payload.error?.status ?? '';
      if (DEAD_TOKEN_STATUSES.has(status)) {
        this.lastTokenWasDead = true;
        return { ok: false, error: `fcm ${status}`, retryable: false };
      }

      // 401 usually means a stale cached token; drop it so the next attempt
      // re-mints rather than replaying the same rejected credential.
      if (response.status === 401) this.cachedToken = null;

      return {
        ok: false,
        error: `fcm ${response.status}: ${payload.error?.message ?? (status || 'unknown error')}`,
        retryable: response.status >= 500 || response.status === 401 || response.status === 429,
      };
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      logger.warn('fcm send failed', { error: (err as Error).message });
      return {
        ok: false,
        error: aborted ? `timed out after ${env.serviceTimeoutMs}ms` : (err as Error).message,
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const fcmProvider = new FcmProvider();
