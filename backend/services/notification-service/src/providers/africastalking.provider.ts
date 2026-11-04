import env from '../config/env.js';
import logger from '../config/logger.js';
import type { NotificationProvider, SendRequest, SendResult } from './types.js';

// ─── Africa's Talking SMS ───────────────────────────────────────────────────
//
// Primary SMS route for the markets this platform serves. The API is a plain
// form-encoded POST — no SDK needed, which keeps the dependency surface and
// the cold-start cost down.
//
// Docs: https://developers.africastalking.com/docs/sms/sending/bulk

interface ATRecipient {
  statusCode: number;
  number: string;
  status: string;
  messageId: string;
  cost: string;
}

interface ATResponse {
  SMSMessageData?: {
    Message: string;
    Recipients: ATRecipient[];
  };
}

/**
 * Per-recipient status codes. 100/101/102 are accepted-for-delivery; the 4xx
 * range are permanent rejections of that number, so retrying is pointless.
 * Docs: https://developers.africastalking.com/docs/sms/statuscodes
 */
const ACCEPTED_CODES = new Set([100, 101, 102]);
const PERMANENT_CODES = new Set([
  401, // RiskHold
  402, // InvalidSenderId
  403, // InvalidPhoneNumber
  404, // UnsupportedNumberType
  405, // InsufficientBalance
  406, // UserInBlacklist
  407, // CouldNotRoute
]);

export class AfricasTalkingProvider implements NotificationProvider {
  readonly name = 'africastalking';
  readonly channel = 'SMS' as const;

  isConfigured(): boolean {
    return env.africasTalking.enabled && Boolean(env.africasTalking.apiKey && env.africasTalking.username);
  }

  async send(request: SendRequest): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.serviceTimeoutMs);

    const form = new URLSearchParams({
      username: env.africasTalking.username,
      to: request.destination,
      message: request.body,
    });
    // An empty senderId means "use the account default"; sending the key with
    // a blank value is rejected as an invalid sender id.
    if (env.africasTalking.senderId) form.set('from', env.africasTalking.senderId);

    try {
      const response = await fetch(`${env.africasTalking.baseUrl}/version1/messaging`, {
        method: 'POST',
        headers: {
          apiKey: env.africasTalking.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form,
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as ATResponse;

      if (!response.ok) {
        return {
          ok: false,
          error: `africastalking responded ${response.status}`,
          // 4xx means we sent something wrong; only 5xx is worth retrying.
          retryable: response.status >= 500,
        };
      }

      const recipient = payload.SMSMessageData?.Recipients?.[0];
      if (!recipient) {
        // A 200 with no recipients means the whole batch was rejected —
        // typically an invalid number that never reached the gateway.
        return {
          ok: false,
          error: payload.SMSMessageData?.Message ?? 'no recipients accepted',
          retryable: false,
        };
      }

      if (ACCEPTED_CODES.has(recipient.statusCode)) {
        return { ok: true, providerMessageId: recipient.messageId };
      }

      return {
        ok: false,
        error: `${recipient.status} (${recipient.statusCode})`,
        retryable: !PERMANENT_CODES.has(recipient.statusCode),
      };
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      logger.warn('africastalking send failed', { error: (err as Error).message });
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

export const africasTalkingProvider = new AfricasTalkingProvider();
