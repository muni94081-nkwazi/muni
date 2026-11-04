import env from '../config/env.js';
import logger from '../config/logger.js';
import type { NotificationProvider, ProviderChannel, SendRequest, SendResult } from './types.js';
import { africasTalkingProvider } from './africastalking.provider.js';
import { twilioSmsProvider, twilioWhatsAppProvider } from './twilio.provider.js';
import { fcmProvider } from './fcm.provider.js';
import { smtpProvider } from './smtp.provider.js';

export * from './types.js';
export { fcmProvider };

// ─── Provider registry ──────────────────────────────────────────────────────
//
// Per channel, drivers are listed in preference order. SMS tries Africa's
// Talking first (local routes, local pricing) and falls back to Twilio only
// when AT is unconfigured or reports a retryable failure — a permanent
// rejection like "invalid number" is not worth paying Twilio to repeat.

const REGISTRY: Record<ProviderChannel, NotificationProvider[]> = {
  SMS: [africasTalkingProvider, twilioSmsProvider],
  WHATSAPP: [twilioWhatsAppProvider],
  PUSH: [fcmProvider],
  EMAIL: [smtpProvider],
};

export function configuredProviders(channel: ProviderChannel): NotificationProvider[] {
  return REGISTRY[channel].filter((provider) => provider.isConfigured());
}

export function isChannelAvailable(channel: ProviderChannel): boolean {
  return env.delivery.dryRun || configuredProviders(channel).length > 0;
}

export interface DispatchOutcome extends SendResult {
  provider: string;
}

/**
 * Sends via the first configured driver for the channel, falling through to
 * the next only on a retryable failure.
 *
 * With no driver configured this either logs (dry-run) or reports a
 * non-retryable failure. It never silently claims success — the previous
 * implementation's `console.log('[NOTIFICATION] Sent to …')` was the whole of
 * its delivery mechanism, and it always "succeeded".
 */
export async function sendVia(channel: ProviderChannel, request: SendRequest): Promise<DispatchOutcome> {
  const providers = configuredProviders(channel);

  if (providers.length === 0) {
    if (env.delivery.dryRun) {
      logger.info('[dry-run] notification not sent', {
        channel,
        destination: request.destination,
        title: request.title,
      });
      return { ok: true, provider: 'dry-run', providerMessageId: `dryrun-${Date.now()}` };
    }
    return {
      ok: false,
      provider: 'none',
      error: `no provider configured for ${channel}`,
      retryable: false,
    };
  }

  let last: DispatchOutcome = { ok: false, provider: 'none', error: 'not attempted', retryable: false };

  for (const provider of providers) {
    const result = await provider.send(request);
    last = { ...result, provider: provider.name };

    if (result.ok) return last;
    if (result.retryable === false) return last; // permanent — don't pay the next provider to fail too

    logger.warn('provider failed, trying next in the chain', {
      channel,
      provider: provider.name,
      error: result.error,
    });
  }

  return last;
}

export async function shutdownProviders(): Promise<void> {
  await smtpProvider.close().catch(() => undefined);
}
