import prisma from '../config/prisma.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import type {
  SubscribeInput,
  SubscriptionView,
  ListSubscribersQuery,
  AdminSubscriberPage,
  SubscriptionStatusName,
} from '../models/newsletter.model.js';

export interface ConsentContext {
  ip?: string;
  userAgent?: string;
  /** Set when the caller was authenticated (x-user-id, stamped by the gateway). */
  userId?: string;
}

/**
 * Subscribe an address, or resurrect one that had unsubscribed.
 *
 * Idempotent by design: `email` is unique, so submitting the same address twice
 * updates one row rather than creating a second. The three cases a caller can
 * land in are reported distinctly, because the UI wording differs for each:
 *
 *   • brand new              → created: true
 *   • already subscribed     → alreadySubscribed: true, nothing written
 *   • previously unsubscribed→ reactivated, consent re-recorded
 *
 * A SUPPRESSED address (hard bounce or spam complaint) is never reactivated
 * here. Re-adding an address that complained is how a sending domain gets
 * blocklisted, so it returns its status unchanged and the caller sees the same
 * neutral success message as everyone else — see the route handler for why.
 */
export async function subscribe(
  input: SubscribeInput,
  context: ConsentContext,
): Promise<SubscriptionView> {
  const existing = await prisma.newsletterSubscription.findUnique({
    where: { email: input.email },
  });

  const nextStatus = env.singleOptIn ? 'CONFIRMED' : 'PENDING';
  const now = new Date();

  if (!existing) {
    await prisma.newsletterSubscription.create({
      data: {
        email: input.email,
        status: nextStatus,
        source: input.source,
        market: input.market,
        locale: input.locale,
        userId: context.userId ?? null,
        consentAt: now,
        consentIp: context.ip ?? null,
        consentUserAgent: context.userAgent?.slice(0, 512) ?? null,
        consentVersion: input.consentVersion,
        confirmedAt: nextStatus === 'CONFIRMED' ? now : null,
      },
    });

    return { status: nextStatus, created: true, alreadySubscribed: false };
  }

  if (existing.status === 'SUPPRESSED') {
    logger.warn('subscribe attempt on suppressed address', { subscriptionId: existing.id });
    return { status: 'SUPPRESSED', created: false, alreadySubscribed: false };
  }

  if (existing.status === 'CONFIRMED' || existing.status === 'PENDING') {
    // Nothing to change. Re-writing consentAt here would overwrite the original
    // evidence of when they agreed, which is the one thing the record exists for.
    return { status: existing.status, created: false, alreadySubscribed: true };
  }

  // status === 'UNSUBSCRIBED' — a deliberate re-subscribe. This IS fresh
  // consent, so the consent columns are updated.
  await prisma.newsletterSubscription.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      source: input.source,
      market: input.market,
      locale: input.locale,
      userId: context.userId ?? existing.userId,
      consentAt: now,
      consentIp: context.ip ?? null,
      consentUserAgent: context.userAgent?.slice(0, 512) ?? null,
      consentVersion: input.consentVersion,
      confirmedAt: nextStatus === 'CONFIRMED' ? now : null,
      unsubscribedAt: null,
    },
  });

  return { status: nextStatus, created: false, alreadySubscribed: false };
}

/** Completes double opt-in. Returns false when the token matches nothing. */
export async function confirm(token: string): Promise<boolean> {
  const row = await prisma.newsletterSubscription.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!row) return false;
  if (row.status === 'SUPPRESSED') return false;

  await prisma.newsletterSubscription.update({
    where: { id: row.id },
    data: { status: 'CONFIRMED', confirmedAt: row.confirmedAt ?? new Date(), unsubscribedAt: null },
  });
  return true;
}

/**
 * One-click unsubscribe.
 *
 * Returns true for an unknown token as well as a known one. Unsubscribe links
 * are followed by mail clients and scanners, and answering "no such token"
 * would turn this into an oracle for probing which addresses are on the list.
 * The row is soft-marked rather than deleted so the address stays suppressed
 * against a later bulk import.
 */
export async function unsubscribe(token: string): Promise<boolean> {
  const row = await prisma.newsletterSubscription.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!row) return true;

  if (row.status !== 'UNSUBSCRIBED') {
    await prisma.newsletterSubscription.update({
      where: { id: row.id },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    });
  }
  return true;
}

// ─── Admin listing ──────────────────────────────────────────────────────────

/**
 * Page through subscribers for the admin table.
 *
 * The status counts are computed with a groupBy rather than three counts, and
 * are deliberately NOT filtered by `status` — the tabs need to show how many
 * rows sit behind each one while a filter is active. They do respect `market`
 * and `q`, so the numbers agree with what filtering would actually return.
 */
export async function listSubscribers(
  query: ListSubscribersQuery,
): Promise<AdminSubscriberPage> {
  const { status, market, q, page, limit } = query;

  // Shared by the page query and the counts, minus `status` for the latter.
  const scope = {
    ...(market ? { market } : {}),
    ...(q ? { email: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const where = { ...scope, ...(status ? { status } : {}) };

  const [rows, total, grouped] = await Promise.all([
    prisma.newsletterSubscription.findMany({
      where,
      // Explicit select, not the whole row: `unsubscribeToken` is a credential
      // and must not leave the service just because it lives on the same model.
      select: {
        id: true,
        email: true,
        status: true,
        source: true,
        market: true,
        locale: true,
        userId: true,
        consentAt: true,
        confirmedAt: true,
        unsubscribedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.newsletterSubscription.count({ where }),
    prisma.newsletterSubscription.groupBy({
      by: ['status'],
      where: scope,
      _count: { _all: true },
    }),
  ]);

  const countsByStatus: Record<SubscriptionStatusName, number> = {
    PENDING: 0,
    CONFIRMED: 0,
    UNSUBSCRIBED: 0,
  };
  for (const g of grouped) {
    countsByStatus[g.status as SubscriptionStatusName] = g._count._all;
  }

  return {
    subscribers: rows.map((r) => ({
      id: r.id,
      email: r.email,
      status: r.status as SubscriptionStatusName,
      source: r.source,
      market: r.market,
      locale: r.locale,
      userId: r.userId,
      consentAt: r.consentAt?.toISOString() ?? null,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      unsubscribedAt: r.unsubscribedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    countsByStatus,
  };
}
