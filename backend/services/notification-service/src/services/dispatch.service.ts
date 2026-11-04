import type { Category, Channel, Notification } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { getTemplate } from '../templates/index.js';
import { getContactProfile, type ContactPreferences } from '../clients/user.client.js';
import { sendVia, isChannelAvailable, fcmProvider, type ProviderChannel } from '../providers/index.js';
import * as deviceTokens from './device-token.service.js';
import { toE164 } from '../utils/phone.js';

// ─── Dispatch ───────────────────────────────────────────────────────────────
//
// The path from "a domain event happened" to "the buyer's phone buzzed".
//
//   event → template → recipient contact + preferences → channels → providers
//
// Three rules the previous implementation had no way to express:
//
//   * A marketing message is only sent on channels the recipient opted into.
//     Transactional messages ignore marketing opt-outs — an order that failed
//     to charge must reach the buyer whatever their promo settings say.
//   * Quiet hours defer non-urgent sends rather than dropping them.
//   * Every attempt is recorded with the provider's verdict, so a delivery
//     that failed is visible and retryable instead of invisible.

export interface DispatchInput {
  userId: string;
  eventType: string;
  data?: Record<string, unknown>;
  /** Collapses redelivered events into one notification. */
  dedupeKey?: string;
  /** Overrides the template — used by the direct REST send endpoint. */
  override?: { title: string; body: string; category?: Category; channels?: Channel[] };
}

const PROVIDER_CHANNELS: ProviderChannel[] = ['SMS', 'WHATSAPP', 'PUSH', 'EMAIL'];

function isProviderChannel(channel: Channel): channel is Channel & ProviderChannel {
  return (PROVIDER_CHANNELS as string[]).includes(channel);
}

/** Whether the recipient's preferences permit this category on this channel. */
function isPermitted(channel: Channel, category: Category, prefs: ContactPreferences): boolean {
  const marketing = category === 'MARKETING';

  switch (channel) {
    case 'IN_APP':
      // The in-app inbox is the record of what we told someone. It is always
      // written; muting it would leave the user unable to find a message they
      // were shown a push for.
      return true;
    case 'SMS':
      return marketing ? prefs.marketingSms : prefs.transactionalSms;
    case 'EMAIL':
      return marketing ? prefs.marketingEmail : prefs.transactionalEmail;
    case 'PUSH':
      return marketing ? prefs.marketingPush : prefs.transactionalPush;
    case 'WHATSAPP':
      // WhatsApp business messaging requires prior consent, so opt-in gates it
      // for both categories, not just marketing.
      return prefs.whatsappOptIn;
    default:
      return false;
  }
}

/**
 * True when local time falls inside the recipient's quiet window. Only
 * marketing is held — a delivery arriving at 06:00 is exactly when the buyer
 * wants to hear about it.
 */
function isQuietHours(prefs: ContactPreferences, now = new Date()): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = prefs;
  if (start === null || end === null) return false;

  let localHour: number;
  try {
    localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hour12: false,
        timeZone: prefs.timezone,
      }).format(now),
    );
  } catch {
    // An unknown IANA zone must not stop the send.
    return false;
  }

  // Windows that wrap midnight (22 → 6) are the normal case.
  return start <= end ? localHour >= start && localHour < end : localHour >= start || localHour < end;
}

function backoffFor(attempts: number): Date {
  const seconds = env.delivery.retryBaseSeconds * Math.pow(2, Math.max(0, attempts - 1));
  return new Date(Date.now() + seconds * 1000);
}

/** FCM data values must all be strings. */
function stringifyData(data: Record<string, unknown> | undefined): Record<string, string> {
  if (!data) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

export async function dispatch(input: DispatchInput): Promise<Notification | null> {
  const template = input.override ? null : getTemplate(input.eventType);

  if (!template && !input.override) {
    logger.debug('no template for event; nothing to send', { eventType: input.eventType });
    return null;
  }

  const category = input.override?.category ?? template?.category ?? 'TRANSACTIONAL';
  const data = input.data ?? {};

  // Redelivered events must not notify twice. The unique index on dedupeKey
  // makes this safe under concurrent consumers, not just sequential ones.
  if (input.dedupeKey) {
    const existing = await prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) {
      logger.debug('duplicate event suppressed', { dedupeKey: input.dedupeKey });
      return existing;
    }
  }

  const contact = await getContactProfile(input.userId);

  const rendered = input.override
    ? { title: input.override.title, body: input.override.body, smsBody: undefined }
    : template!.render(data, { firstName: contact?.firstName });

  const notification = await prisma.notification
    .create({
      data: {
        userId: input.userId,
        type: input.eventType,
        category,
        title: rendered.title,
        body: rendered.body,
        data: data as never,
        dedupeKey: input.dedupeKey ?? null,
      },
    })
    .catch(async (err: { code?: string }) => {
      // Lost a race on the dedupe key — the other writer already created it.
      if (err.code === 'P2002' && input.dedupeKey) {
        return prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
      }
      throw err;
    });

  if (!notification) return null;

  const requestedChannels = input.override?.channels ?? template?.channels ?? ['IN_APP'];

  // Without a contact profile the recipient's phone, email and consent are all
  // unknown, so only the in-app row can be written. Failing closed here is
  // deliberate: guessing a channel would mean messaging someone who may have
  // opted out.
  if (!contact) {
    logger.warn('no contact profile; delivered in-app only', { userId: input.userId });
    await recordSuppressed(notification.id, requestedChannels.filter((c) => c !== 'IN_APP'), 'contact profile unavailable');
    return notification;
  }

  if (!contact.isActive) {
    await recordSuppressed(notification.id, requestedChannels.filter((c) => c !== 'IN_APP'), 'account inactive');
    return notification;
  }

  const holdForQuietHours = category === 'MARKETING' && isQuietHours(contact.preferences);

  for (const channel of requestedChannels) {
    if (channel === 'IN_APP') continue; // the Notification row itself is the in-app delivery

    if (!isPermitted(channel, category, contact.preferences)) {
      await suppress(notification.id, channel, 'recipient opted out');
      continue;
    }

    if (!isChannelAvailable(channel as ProviderChannel)) {
      await suppress(notification.id, channel, `no provider configured for ${channel}`);
      continue;
    }

    if (holdForQuietHours) {
      // Queued with a future attempt time; the retry worker picks it up once
      // the window closes rather than waking the recipient now.
      await prisma.delivery.create({
        data: {
          notificationId: notification.id,
          channel,
          status: 'QUEUED',
          nextAttemptAt: nextMorning(contact.preferences),
        },
      });
      continue;
    }

    await attemptChannel(notification.id, channel, {
      title: rendered.title,
      body: channel === 'SMS' || channel === 'WHATSAPP' ? (rendered.smsBody ?? rendered.body) : rendered.body,
      contact,
      data: stringifyData(data),
    });
  }

  return notification;
}

function nextMorning(prefs: ContactPreferences): Date {
  // Approximate: schedule for the end of the quiet window today, or tomorrow
  // if that has already passed. Exactness isn't needed — the retry worker
  // re-checks quiet hours before it sends.
  const end = prefs.quietHoursEnd ?? 8;
  const now = new Date();
  const target = new Date(now);
  target.setHours(end, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

async function recordSuppressed(notificationId: string, channels: Channel[], reason: string): Promise<void> {
  await Promise.all(channels.map((channel) => suppress(notificationId, channel, reason)));
}

async function suppress(notificationId: string, channel: Channel, reason: string): Promise<void> {
  await prisma.delivery.create({
    data: { notificationId, channel, status: 'SUPPRESSED', lastError: reason },
  });
}

interface AttemptContext {
  title: string;
  body: string;
  contact: { userId: string; email: string; phoneNumber: string | null };
  data: Record<string, string>;
}

/** Resolves the destination(s) for a channel and attempts delivery to each. */
async function attemptChannel(notificationId: string, channel: Channel, ctx: AttemptContext): Promise<void> {
  if (channel === 'PUSH') {
    const tokens = await deviceTokens.activeTokensFor(ctx.contact.userId);
    if (tokens.length === 0) {
      await suppress(notificationId, channel, 'no registered device');
      return;
    }
    // One delivery row per device: a user with a dead tablet token and a live
    // phone should still count as reached.
    for (const device of tokens) {
      await attemptOne(notificationId, channel, device.token, ctx, device.token);
    }
    return;
  }

  if (channel === 'EMAIL') {
    await attemptOne(notificationId, channel, ctx.contact.email, ctx);
    return;
  }

  // SMS and WhatsApp both address an msisdn.
  const msisdn = toE164(ctx.contact.phoneNumber, env.defaultCountry);
  if (!msisdn) {
    await suppress(notificationId, channel, 'no usable phone number on file');
    return;
  }
  await attemptOne(notificationId, channel, msisdn, ctx);
}

async function attemptOne(
  notificationId: string,
  channel: Channel,
  destination: string,
  ctx: AttemptContext,
  deviceToken?: string,
): Promise<void> {
  const delivery = await prisma.delivery.create({
    data: { notificationId, channel, destination: truncate(destination), status: 'QUEUED' },
  });

  const result = await sendVia(channel as ProviderChannel, {
    destination,
    title: ctx.title,
    body: ctx.body,
    data: ctx.data,
  });

  // FCM tells us when a token is dead; stop selecting it rather than failing
  // on it for every future notification.
  if (deviceToken && channel === 'PUSH' && fcmProvider.lastTokenWasDead) {
    await deviceTokens.disable(deviceToken);
  }

  if (result.ok) {
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SENT',
        provider: result.provider,
        providerMessageId: result.providerMessageId ?? null,
        attempts: 1,
        sentAt: new Date(),
        nextAttemptAt: null,
      },
    });
    return;
  }

  const retryable = result.retryable !== false;
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      status: retryable ? 'QUEUED' : 'FAILED',
      provider: result.provider,
      attempts: 1,
      lastError: result.error?.slice(0, 500) ?? 'unknown error',
      nextAttemptAt: retryable ? backoffFor(1) : null,
    },
  });

  logger.warn('delivery attempt failed', {
    notificationId,
    channel,
    provider: result.provider,
    error: result.error,
    willRetry: retryable,
  });
}

function truncate(value: string): string {
  // Device tokens are ~160 chars and there is no reason to store them twice.
  return value.length > 64 ? `${value.slice(0, 61)}...` : value;
}

// ─── Retry worker ───────────────────────────────────────────────────────────
//
// Sweeps deliveries whose backoff has elapsed. Runs in-process on an interval:
// this volume does not justify a separate queue service, and the DB row is
// already the durable record a queue would duplicate.

export async function processRetries(): Promise<number> {
  const due = await prisma.delivery.findMany({
    where: {
      status: 'QUEUED',
      nextAttemptAt: { lte: new Date() },
      attempts: { lt: env.delivery.maxAttempts },
    },
    take: env.delivery.retryBatchSize,
    include: { notification: true },
  });

  let processed = 0;

  for (const delivery of due) {
    const contact = await getContactProfile(delivery.notification.userId);
    if (!contact) continue;

    // Marketing held for quiet hours re-checks the window rather than assuming
    // the scheduled time is still outside it (the user may have changed zones).
    if (delivery.notification.category === 'MARKETING' && isQuietHours(contact.preferences)) {
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { nextAttemptAt: nextMorning(contact.preferences) },
      });
      continue;
    }

    const destination =
      delivery.channel === 'EMAIL'
        ? contact.email
        : delivery.channel === 'PUSH'
          ? (await deviceTokens.activeTokensFor(contact.userId))[0]?.token
          : toE164(contact.phoneNumber, env.defaultCountry);

    if (!destination) {
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', lastError: 'no destination available on retry', nextAttemptAt: null },
      });
      continue;
    }

    const result = await sendVia(delivery.channel as ProviderChannel, {
      destination,
      title: delivery.notification.title,
      body: delivery.notification.body,
      data: stringifyData(delivery.notification.data as Record<string, unknown> | undefined),
    });

    const attempts = delivery.attempts + 1;
    const exhausted = attempts >= env.delivery.maxAttempts;
    const retryable = result.retryable !== false;

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: result.ok
        ? {
            status: 'SENT',
            provider: result.provider,
            providerMessageId: result.providerMessageId ?? null,
            attempts,
            sentAt: new Date(),
            nextAttemptAt: null,
          }
        : {
            status: retryable && !exhausted ? 'QUEUED' : 'FAILED',
            provider: result.provider,
            attempts,
            lastError: result.error?.slice(0, 500) ?? 'unknown error',
            nextAttemptAt: retryable && !exhausted ? backoffFor(attempts) : null,
          },
    });

    processed += 1;
  }

  if (processed > 0) logger.info('retry sweep completed', { processed });
  return processed;
}

let retryTimer: NodeJS.Timeout | null = null;

export function startRetryWorker(): void {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    processRetries().catch((err) => logger.error('retry sweep failed', { error: (err as Error).message }));
  }, env.delivery.retryIntervalMs);
  // Must not hold the process open during shutdown.
  retryTimer.unref();
  logger.info('retry worker started', { intervalMs: env.delivery.retryIntervalMs });
}

export function stopRetryWorker(): void {
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = null;
}
