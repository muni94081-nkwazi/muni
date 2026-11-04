import env from '../config/env.js';
import logger from '../config/logger.js';
import type { NotificationProvider, ProviderChannel, SendRequest, SendResult } from './types.js';

// ─── Twilio SMS / WhatsApp ──────────────────────────────────────────────────
//
// Serves two roles: the fallback SMS route when Africa's Talking cannot reach
// a number, and the only WhatsApp route. Plain REST with basic auth — the SDK
// adds nothing this needs.
//
// Docs: https://www.twilio.com/docs/messaging/api/message-resource

interface TwilioMessage {
  sid?: string;
  status?: string;
  error_code?: number | null;
  message?: string;
  code?: number;
}

/**
 * Twilio error codes that will never succeed on retry: the number is invalid,
 * unreachable, or has not opted in. Retrying these costs money and delays the
 * queue behind them.
 * https://www.twilio.com/docs/api/errors
 */
const PERMANENT_ERROR_CODES = new Set([
  21211, // invalid 'To' number
  21214, // 'To' number cannot receive SMS
  21408, // permission to send to this region not enabled
  21610, // recipient has unsubscribed
  21612, // cannot route to this number
  21614, // 'To' number is not mobile
  63003, // WhatsApp: channel could not find the recipient
  63016, // WhatsApp: outside the 24h window without an approved template
]);

class TwilioProvider implements NotificationProvider {
  readonly name = 'twilio';

  constructor(readonly channel: ProviderChannel) {}

  isConfigured(): boolean {
    if (!env.twilio.enabled) return false;
    if (!env.twilio.accountSid || !env.twilio.authToken) return false;
    return this.channel === 'WHATSAPP' ? Boolean(env.twilio.whatsappFrom) : Boolean(env.twilio.fromNumber);
  }

  async send(request: SendRequest): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.serviceTimeoutMs);

    // WhatsApp addresses are the same msisdn behind a "whatsapp:" scheme.
    const isWhatsApp = this.channel === 'WHATSAPP';
    const to = isWhatsApp ? `whatsapp:${request.destination}` : request.destination;
    const from = isWhatsApp ? env.twilio.whatsappFrom : env.twilio.fromNumber;

    const form = new URLSearchParams({ To: to, From: from, Body: request.body });
    const credentials = Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString('base64');

    try {
      const response = await fetch(
        `${env.twilio.baseUrl}/2010-04-01/Accounts/${env.twilio.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: form,
          signal: controller.signal,
        },
      );

      const payload = (await response.json().catch(() => ({}))) as TwilioMessage;

      if (!response.ok) {
        const code = payload.code ?? payload.error_code ?? undefined;
        return {
          ok: false,
          error: `twilio ${response.status}: ${payload.message ?? 'unknown error'}`,
          retryable: response.status >= 500 || !(code && PERMANENT_ERROR_CODES.has(code)),
        };
      }

      // Twilio accepts asynchronously: "queued"/"accepted" means it took
      // ownership, and the final verdict arrives on the status callback.
      return { ok: true, providerMessageId: payload.sid };
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      logger.warn('twilio send failed', { channel: this.channel, error: (err as Error).message });
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

export const twilioSmsProvider = new TwilioProvider('SMS');
export const twilioWhatsAppProvider = new TwilioProvider('WHATSAPP');
