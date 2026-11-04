import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

// ─── Finding a payment by its order ───────────────────────────────────────────
//
// A payment's `reference` is the only key that identifies it to a provider
// webhook (`findByReference(externalId)`), and until this route existed there
// was no way to obtain one: the checkout session returns `paymentIntentId` —
// the `paymentId` column, a different value — and order-service writes
// `paymentReference: null` when it creates the order. Reconciling a payment
// meant querying the database by hand.

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const prismaDouble = await import('./helpers/prisma-double.js');

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: prismaDouble.prisma,
  connectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));

// gateway.service reads provider credentials at import; these two are enough
// for the module graph to load.
process.env.FLUTTERWAVE_SECRET_HASH = 'test-flw-secret-hash-not-a-real-credential';
process.env.PESAPAL_CONSUMER_SECRET = 'test-pesapal-consumer-secret-not-real';

const { findPaymentsByOrder } = await import('../controllers/payment.controller.js');
const { paymentRepository } = await import('../repositories/payment.repository.js');

// ─── Harness ──────────────────────────────────────────────────────────────────

interface Captured {
  status: number;
  body: { success: boolean; message?: string; data?: Array<Record<string, unknown>> };
}

function run(query: Record<string, unknown>): Promise<Captured> {
  const captured: Captured = { status: 200, body: { success: false } };

  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: Captured['body']) { captured.body = payload; return this; },
  } as unknown as Response;

  return findPaymentsByOrder({ query } as unknown as Request, res).then(() => captured);
}

async function seedPayment(overrides: Record<string, unknown> = {}) {
  return paymentRepository.create({
    paymentId: `pay_${Math.random().toString(36).slice(2, 10)}`,
    reference: `PAY-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    orderId:   'sess-1',
    amount:    40_000,
    amountUGX: 40_000,
    currency:  'UGX',
    method:    'cod',
    status:    'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Parameters<typeof paymentRepository.create>[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaDouble.resetDatabase();
});

describe('GET /api/v1/payments?orderId=', () => {
  it('returns the payment with its reference', async () => {
    const seeded = await seedPayment();

    const res = await run({ orderId: 'sess-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    // The whole point of the route: the reference is now obtainable.
    expect(res.body.data![0].reference).toBe(seeded.reference);
  });

  it('exposes the reference and the paymentId as distinct values', async () => {
    // Conflating them is the bug this fixes — the checkout session returns
    // paymentIntentId (the paymentId), and confirming a payment with it fails
    // because the webhook resolves by reference.
    const seeded = await seedPayment();

    const [payment] = (await run({ orderId: 'sess-1' })).body.data!;

    expect(payment.reference).toBe(seeded.reference);
    expect(payment.paymentId).toBe(seeded.paymentId);
    expect(payment.reference).not.toBe(payment.paymentId);
  });

  it('404s when no payment exists for that order', async () => {
    const res = await run({ orderId: 'sess-unknown' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('400s when orderId is missing or blank', async () => {
    for (const query of [{}, { orderId: '' }, { orderId: '   ' }]) {
      const res = await run(query);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/orderId/);
    }
  });

  it('returns retries newest first, so the live payment leads', async () => {
    // A retried checkout leaves an abandoned first attempt against the same
    // order; the caller wants the one that is actually in flight.
    //
    // Seeded through the table rather than paymentRepository.create, which
    // does not pass createdAt — the column is `@default(now())`, so two rows
    // inserted in the same millisecond would be indistinguishable and this
    // would assert insertion order rather than the ordering the query asks
    // for.
    await prismaDouble.paymentTransaction.create({
      data: {
        paymentId: 'pay_first', reference: 'PAY-FIRST', orderId: 'sess-1',
        amount: 40_000, currency: 'UGX', method: 'cod', status: 'pending',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prismaDouble.paymentTransaction.create({
      data: {
        paymentId: 'pay_second', reference: 'PAY-SECOND', orderId: 'sess-1',
        amount: 40_000, currency: 'UGX', method: 'cod', status: 'pending',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });

    const { body } = await run({ orderId: 'sess-1' });

    expect(body.data).toHaveLength(2);
    expect(body.data![0].reference).toBe('PAY-SECOND');
  });

  it('does not leak another order’s payment', async () => {
    await seedPayment({ orderId: 'sess-1', reference: 'PAY-MINE' });
    await seedPayment({ orderId: 'sess-2', reference: 'PAY-THEIRS' });

    const { body } = await run({ orderId: 'sess-1' });

    expect(body.data).toHaveLength(1);
    expect(body.data![0].reference).toBe('PAY-MINE');
  });

  it('accepts the checkout session id, which is what the saga stores', async () => {
    // checkout-service charges with `orderId: session.id`, so a saga-created
    // payment is keyed on the session id rather than the order id. Worth
    // pinning: a caller passing the order id gets a 404, not a wrong payment.
    await seedPayment({ orderId: 'checkout-session-abc' });

    expect((await run({ orderId: 'checkout-session-abc' })).status).toBe(200);
    expect((await run({ orderId: 'the-order-id' })).status).toBe(404);
  });
});
