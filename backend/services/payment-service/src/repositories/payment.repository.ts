import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type {
  CardTransactionMetadata,
  MobileMoneyProviderName,
  PaymentMethod,
  PaymentStatus,
  PaymentTransaction,
  ProviderStatus,
} from '../models/payment.model.js';

// ─── Payment transaction repository ───────────────────────────────────────────
//
// Replaces `getPaymentIntents()`, a module-level Map in order.consumer.ts.
//
// The domain type carries ISO-8601 strings and plain numbers because that is
// what the drivers, Kafka envelopes and HTTP responses expect; the database
// carries DateTime and Decimal. All the conversion lives here so no call site
// has to think about it.

type Row = Prisma.PaymentTransactionGetPayload<Record<string, never>>;

const toNumber = (d: Prisma.Decimal | null | undefined): number | null =>
  d === null || d === undefined ? null : d.toNumber();

function toDomain(row: Row): PaymentTransaction {
  return {
    paymentId: row.paymentId,
    reference: row.reference,
    orderId: row.orderId,
    amount: row.amount.toNumber(),
    currency: row.currency,
    method: row.method as PaymentMethod,
    status: row.status as PaymentStatus,
    phoneNumber: row.phoneNumber,
    checkoutUrl: row.checkoutUrl,
    idempotencyKey: row.idempotencyKey,
    rawPayload: (row.rawPayload as Record<string, unknown> | null) ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),

    provider: (row.provider as MobileMoneyProviderName | null) ?? null,
    providerReferenceId: row.providerReferenceId,
    providerTransactionId: row.providerTransactionId,
    providerStatus: (row.providerStatus as ProviderStatus | null) ?? null,
    failureReason: row.failureReason,
    amountUGX: toNumber(row.amountUGX),
    exchangeRate: toNumber(row.exchangeRate),
    pollAttempts: row.pollAttempts,

    card: (row.card as CardTransactionMetadata | null) ?? null,
    threeDSecureRedirectUrl: row.threeDSecureRedirectUrl,
  };
}

/** Fields a caller is allowed to change after the transaction exists. */
export type PaymentUpdate = Partial<
  Pick<
    PaymentTransaction,
    | 'status'
    | 'paidAt'
    | 'checkoutUrl'
    | 'rawPayload'
    | 'provider'
    | 'providerReferenceId'
    | 'providerTransactionId'
    | 'providerStatus'
    | 'failureReason'
    | 'amountUGX'
    | 'exchangeRate'
    | 'pollAttempts'
    | 'card'
    | 'threeDSecureRedirectUrl'
  >
>;

function toUpdateData(patch: PaymentUpdate): Prisma.PaymentTransactionUpdateInput {
  const data: Prisma.PaymentTransactionUpdateInput = {};

  if (patch.status !== undefined) data.status = patch.status;
  if (patch.paidAt !== undefined) data.paidAt = patch.paidAt ? new Date(patch.paidAt) : null;
  if (patch.checkoutUrl !== undefined) data.checkoutUrl = patch.checkoutUrl;
  if (patch.rawPayload !== undefined) {
    data.rawPayload = (patch.rawPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  }
  if (patch.provider !== undefined) data.provider = patch.provider;
  if (patch.providerReferenceId !== undefined) data.providerReferenceId = patch.providerReferenceId;
  if (patch.providerTransactionId !== undefined) data.providerTransactionId = patch.providerTransactionId;
  if (patch.providerStatus !== undefined) data.providerStatus = patch.providerStatus;
  if (patch.failureReason !== undefined) data.failureReason = patch.failureReason;
  if (patch.amountUGX !== undefined) data.amountUGX = patch.amountUGX;
  if (patch.exchangeRate !== undefined) data.exchangeRate = patch.exchangeRate;
  if (patch.pollAttempts !== undefined) data.pollAttempts = patch.pollAttempts;
  if (patch.card !== undefined) {
    data.card = (patch.card ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
  }
  if (patch.threeDSecureRedirectUrl !== undefined) {
    data.threeDSecureRedirectUrl = patch.threeDSecureRedirectUrl;
  }

  return data;
}

export class PaymentRepository {
  async create(tx: PaymentTransaction): Promise<PaymentTransaction> {
    const row = await prisma.paymentTransaction.create({
      data: {
        paymentId: tx.paymentId,
        reference: tx.reference,
        orderId: tx.orderId,
        amount: tx.amount,
        currency: tx.currency,
        method: tx.method,
        status: tx.status,
        phoneNumber: tx.phoneNumber ?? null,
        checkoutUrl: tx.checkoutUrl ?? null,
        idempotencyKey: tx.idempotencyKey ?? null,
        rawPayload: (tx.rawPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        paidAt: tx.paidAt ? new Date(tx.paidAt) : null,
        provider: tx.provider ?? null,
        providerReferenceId: tx.providerReferenceId ?? null,
        providerTransactionId: tx.providerTransactionId ?? null,
        providerStatus: tx.providerStatus ?? null,
        failureReason: tx.failureReason ?? null,
        amountUGX: tx.amountUGX ?? null,
        exchangeRate: tx.exchangeRate ?? null,
        pollAttempts: tx.pollAttempts ?? 0,
        card: (tx.card ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        threeDSecureRedirectUrl: tx.threeDSecureRedirectUrl ?? null,
      },
    });
    return toDomain(row);
  }

  async findByReference(reference: string): Promise<PaymentTransaction | null> {
    const row = await prisma.paymentTransaction.findUnique({ where: { reference } });
    return row ? toDomain(row) : null;
  }

  /**
   * Look up a prior attempt for a caller-supplied idempotency key. initiate
   * calls this before touching a provider so a retried request returns the
   * original transaction rather than charging the customer a second time.
   */
  async findByIdempotencyKey(idempotencyKey: string): Promise<PaymentTransaction | null> {
    const row = await prisma.paymentTransaction.findUnique({ where: { idempotencyKey } });
    return row ? toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<PaymentTransaction[]> {
    const rows = await prisma.paymentTransaction.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async update(reference: string, patch: PaymentUpdate): Promise<PaymentTransaction | null> {
    const row = await prisma.paymentTransaction
      .update({ where: { reference }, data: toUpdateData(patch) })
      .catch((err: unknown) => {
        // P2025 = record not found. A webhook for an unknown reference is a
        // normal occurrence (test pings, retries after a purge), not an error.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
        throw err;
      });
    return row ? toDomain(row) : null;
  }

  /**
   * Mark a payment settled, but only from a non-terminal state.
   *
   * Providers retry webhooks, and two deliveries can race. The status guard in
   * the WHERE clause makes the transition atomic: the second writer updates
   * zero rows and gets null back, so the caller knows not to run the payment
   * split again.
   */
  async markCompleted(reference: string, paidAt: string): Promise<PaymentTransaction | null> {
    const updated = await prisma.paymentTransaction.updateMany({
      where: { reference, status: { in: ['pending', 'processing'] } },
      data: { status: 'completed', paidAt: new Date(paidAt) },
    });
    if (updated.count === 0) return null;
    return this.findByReference(reference);
  }

  /**
   * The failure counterpart to `markCompleted`, and it did not exist.
   *
   * `markPaymentFailed` wrote `status: 'failed'` through the unconditional
   * `update` below, so a payment that had ALREADY settled could be flipped to
   * failed afterwards. Three real paths reach it: the polling worker exhausting
   * its attempts, the provider answering FAILED on a poll that raced a
   * successful webhook, and a late duplicate failure callback. In each case the
   * vendor had already been credited and the order already confirmed, leaving
   * the payment row saying "failed" against money that had moved.
   *
   * Conditional on the same two states `markCompleted` accepts, so whichever
   * outcome lands first wins and the other becomes a no-op.
   */
  async markFailed(reference: string, reason: string): Promise<PaymentTransaction | null> {
    const updated = await prisma.paymentTransaction.updateMany({
      where: { reference, status: { in: ['pending', 'processing'] } },
      data: { status: 'failed', providerStatus: 'FAILED', failureReason: reason },
    });
    if (updated.count === 0) return null;
    return this.findByReference(reference);
  }

  async incrementPollAttempts(reference: string): Promise<number> {
    const row = await prisma.paymentTransaction.update({
      where: { reference },
      data: { pollAttempts: { increment: 1 } },
      select: { pollAttempts: true },
    });
    return row.pollAttempts;
  }

  /** Collections still awaiting a provider outcome — the polling worker's queue. */
  async findAwaitingProviderOutcome(limit = 100): Promise<PaymentTransaction[]> {
    const rows = await prisma.paymentTransaction.findMany({
      where: { status: { in: ['pending', 'processing'] }, providerReferenceId: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }
}

export const paymentRepository = new PaymentRepository();

// ─── Webhook idempotency ──────────────────────────────────────────────────────

export class WebhookIdempotencyRepository {
  /**
   * Claim an event id for processing.
   *
   * Returns true if this call won the claim, false if the event was already
   * recorded. The unique-constraint collision is the mechanism, so two
   * concurrent deliveries of the same event cannot both proceed — which a
   * read-then-write check against the old in-memory Set could not guarantee.
   */
  async claim(eventId: string, provider?: string): Promise<boolean> {
    // Handlers build event ids as '<provider>:<id>:<status>'; fall back to that
    // prefix when the caller doesn't name the provider explicitly.
    const label = provider ?? (eventId.includes(':') ? eventId.split(':')[0]! : 'unknown');
    try {
      await prisma.processedWebhook.create({ data: { eventId, provider: label } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  /** Release a claim so a failed delivery can be retried by the provider. */
  async release(eventId: string): Promise<void> {
    await prisma.processedWebhook.deleteMany({ where: { eventId } });
  }
}

export const webhookIdempotencyRepository = new WebhookIdempotencyRepository();
