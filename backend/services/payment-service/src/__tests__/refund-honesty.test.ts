import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

// ─── A refund that did not happen is not a refund ─────────────────────────────
//
// Only Visa/Mastercard has a real refund API wired up. Every other method —
// MTN MoMo, Airtel Money, Flutterwave, Pesapal, and cash on delivery — fell
// through to a block that:
//
//   • marked the payment `refunded`,
//   • reversed the seller's settlement,
//   • answered 200 with `refundId: ref_<Math.random()>`.
//
// No provider was called and no money moved. The customer's record said
// refunded, the seller had been debited, and the id in the response referred to
// nothing — there is no refund anywhere to reconcile it against. For COD there
// was never a payment API to refund through at all: the money was cash handed
// to a rider, and it comes back the same way.
//
// These pin the honest behaviour: the settlement reversal stands, because MUNI
// is out of pocket either way, but nothing claims the customer has been paid.

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('kafkajs', () => ({
  Kafka: class { producer() { return { connect: async () => undefined, send: async () => undefined }; } },
}));

const prismaDouble = await import('./helpers/prisma-double.js');
jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: prismaDouble.prisma }));

// gateway.service reads provider credentials at import; these are enough for
// the module graph to load and are not real credentials.
process.env.FLUTTERWAVE_SECRET_HASH = 'test-flw-secret-hash-not-a-real-credential';
process.env.PESAPAL_CONSUMER_SECRET = 'test-pesapal-consumer-secret-not-real';

const { refundPayment } = await import('../controllers/payment.controller.js');
const { paymentRepository } = await import('../repositories/payment.repository.js');

interface Captured {
  status: number;
  body: { success?: boolean; message?: string; data?: Record<string, unknown> };
}

function run(reference: string, body: Record<string, unknown> = {}): Promise<Captured> {
  const captured: Captured = { status: 200, body: {} };
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: Captured['body']) { captured.body = payload; return this; },
  } as unknown as Response;

  return refundPayment({ params: { reference }, body } as unknown as Request, res).then(() => captured);
}

async function completedPayment(method: string, reference: string) {
  return paymentRepository.create({
    paymentId: `pay_${reference}`,
    reference,
    orderId:   `ord-${reference}`,
    amount:    50000,
    currency:  'UGX',
    method,
    status:    'completed',
    amountUGX: 50000,
    exchangeRate: 1,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaDouble.resetDatabase();
});

describe('a method with no refund API says so', () => {
  it.each(['mtn_momo', 'airtel', 'cod', 'flutterwave', 'pesapal'])(
    'answers 202 for %s rather than claiming the money went back',
    async (method) => {
      await completedPayment(method, `PAY-${method.toUpperCase()}`);
      const res = await run(`PAY-${method.toUpperCase()}`);

      expect(res.status).toBe(202);
      expect(res.body.data?.status).toBe('refund_pending_manual');
    },
  );

  it('fabricates no refund id', async () => {
    // `ref_<Math.random()>` used to go back to the caller as though a provider
    // had issued it.
    await completedPayment('mtn_momo', 'PAY-NOID');
    const res = await run('PAY-NOID');

    expect(res.body.data?.refundId).toBeNull();
  });

  it('leaves the payment as it was, because nothing has been returned', async () => {
    await completedPayment('mtn_momo', 'PAY-STATE');
    await run('PAY-STATE');

    const after = await paymentRepository.findByReference('PAY-STATE');
    expect(after!.status).toBe('completed');
    expect(after!.status).not.toBe('refunded');
  });

  it('says which method has no automated refund', async () => {
    await completedPayment('cod', 'PAY-COD');
    const res = await run('PAY-COD');

    expect(String(res.body.data?.message)).toMatch(/cod/i);
    expect(String(res.body.data?.message)).toMatch(/out of band|manual/i);
  });

  it('still caps the amount at what was collected', async () => {
    await completedPayment('mtn_momo', 'PAY-CAP');
    const res = await run('PAY-CAP', { amount: 9_999_999 });

    expect(res.body.data?.amount).toBe(50000);
  });

  it('refuses a payment that does not exist', async () => {
    const res = await run('PAY-NOT-A-PAYMENT');
    expect(res.status).toBe(404);
  });
});
