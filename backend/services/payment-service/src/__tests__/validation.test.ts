import { describe, it, expect } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  validateBody,
  validateParams,
  formatZodError,
} from '../../../../shared/http/validation.middleware.js';
import {
  InitiatePaymentSchema,
  RefundPaymentSchema,
  ReleaseEscrowSchema,
  HoldEscrowSchema,
  CreateEscrowSchema,
  RequestPayoutSchema,
  WebhookProviderParams,
} from '../models/validation.schemas.js';

// ─── Harness ──────────────────────────────────────────────────────────────────
//
// Middleware is exercised directly rather than through an HTTP client: the
// contract under test is "400 with a clean body, or next()", and driving it
// with fake req/res asserts exactly that without standing up a server or
// pulling in a test-only HTTP dependency.

interface Captured {
  status?: number;
  body?: { success: boolean; message: string; errors: Record<string, string[]> };
  nexted: boolean;
  req: Request;
}

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>,
): Captured {
  const captured: Captured = { nexted: false, req: req as Request };

  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: Captured['body']) { captured.body = payload; return this; },
  } as unknown as Response;

  middleware(req as Request, res, () => { captured.nexted = true; });
  return captured;
}

const bodyReq = (body: unknown): Partial<Request> => ({ body } as Partial<Request>);

// ─── The middleware contract ──────────────────────────────────────────────────

describe('validateBody', () => {
  const Schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it('calls next() and leaves a valid body in place', () => {
    const result = run(validateBody(Schema), bodyReq({ name: 'Ada', age: 36 }));

    expect(result.nexted).toBe(true);
    expect(result.status).toBeUndefined();
    expect(result.req.body).toEqual({ name: 'Ada', age: 36 });
  });

  it('answers 400 with a field→messages map on an invalid body', () => {
    const result = run(validateBody(Schema), bodyReq({ name: '', age: -1 }));

    expect(result.nexted).toBe(false);
    expect(result.status).toBe(400);
    expect(result.body?.success).toBe(false);
    expect(Object.keys(result.body?.errors ?? {}).sort()).toEqual(['age', 'name']);
  });

  it('does not leak a stack trace or the submitted input', () => {
    const secret = 'pan-4111111111111111';
    const result = run(validateBody(Schema), bodyReq({ name: secret, age: 'x' }));

    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(/\bat \w+.*:\d+:\d+/);   // no stack frames
    expect(serialized).not.toContain('ZodError');
  });

  it('strips unknown keys so a handler cannot read an unvalidated field', () => {
    const result = run(
      validateBody(Schema),
      bodyReq({ name: 'Ada', age: 36, isAdmin: true }),
    );

    expect(result.nexted).toBe(true);
    expect(result.req.body).not.toHaveProperty('isAdmin');
  });

  it('rejects a null or non-object body rather than throwing', () => {
    for (const body of [null, undefined, 'a string', 42]) {
      const result = run(validateBody(Schema), bodyReq(body));
      expect(result.status).toBe(400);
      expect(result.nexted).toBe(false);
    }
  });

  it('surfaces form-level refinement failures under `_`', () => {
    const Refined = z.object({ a: z.number().optional(), b: z.number().optional() })
      .refine((d) => d.a !== undefined || d.b !== undefined, { message: 'Provide a or b' });

    const result = run(validateBody(Refined), bodyReq({}));
    expect(result.body?.errors._).toEqual(['Provide a or b']);
  });
});

describe('validateParams', () => {
  it('mutates params in place rather than reassigning the getter', () => {
    // req.params/req.query are getter-only on newer Express; assigning throws.
    const params: Record<string, string> = { reference: '  PAY-1  ' };
    const result = run(
      validateParams(z.object({ reference: z.string().trim().min(1) })),
      { params } as Partial<Request>,
    );

    expect(result.nexted).toBe(true);
    expect(params.reference).toBe('PAY-1');
  });
});

describe('formatZodError', () => {
  it('omits fields that have no issues', () => {
    const parsed = z.object({ a: z.string(), b: z.string() }).safeParse({ a: 'ok', b: 1 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(Object.keys(formatZodError(parsed.error))).toEqual(['b']);
    }
  });
});

// ─── payment-service schemas ──────────────────────────────────────────────────

describe('InitiatePaymentSchema', () => {
  const valid = {
    orderId: 'ord-1',
    amount: 50_000,
    method: 'mtn_momo',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
  };

  it('accepts a well-formed single-vendor charge', () => {
    const result = run(validateBody(InitiatePaymentSchema), bodyReq(valid));
    expect(result.nexted).toBe(true);
    expect(result.req.body.currency).toBe('UGX'); // defaulted
  });

  it('accepts a multi-vendor charge with a breakdown and no sellerId', () => {
    const result = run(validateBody(InitiatePaymentSchema), bodyReq({
      orderId: 'ord-1', amount: 8_500, method: 'mtn_momo', buyerId: 'buyer-1',
      vendorBreakdown: [
        { sellerId: 'a', amountUGX: 3_500 },
        { sellerId: 'b', amountUGX: 5_000 },
      ],
    }));

    expect(result.nexted).toBe(true);
  });

  it('refuses a charge that names no vendor at all', () => {
    // Escrow has to know who the money is held for; there is no safe default.
    const { sellerId, ...noSeller } = valid;
    const result = run(validateBody(InitiatePaymentSchema), bodyReq(noSeller));

    expect(result.status).toBe(400);
    expect(result.body?.errors.sellerId).toBeDefined();
  });

  it('refuses an empty breakdown', () => {
    const { sellerId, ...rest } = valid;
    const result = run(validateBody(InitiatePaymentSchema), bodyReq({ ...rest, vendorBreakdown: [] }));
    expect(result.status).toBe(400);
  });

  it('requires amount to be a positive number, not a numeric string', () => {
    for (const amount of ['50000', 0, -1, Number.NaN]) {
      const result = run(validateBody(InitiatePaymentSchema), bodyReq({ ...valid, amount }));
      expect(result.status).toBe(400);
      expect(result.body?.errors.amount).toBeDefined();
    }
  });

  it('requires orderId, buyerId and a known method', () => {
    expect(run(validateBody(InitiatePaymentSchema), bodyReq({ ...valid, orderId: '' })).status).toBe(400);
    expect(run(validateBody(InitiatePaymentSchema), bodyReq({ ...valid, buyerId: '' })).status).toBe(400);
    expect(run(validateBody(InitiatePaymentSchema), bodyReq({ ...valid, method: 'barter' })).status).toBe(400);
  });

  it('refuses a breakdown line with a negative amount', () => {
    const { sellerId, ...rest } = valid;
    const result = run(validateBody(InitiatePaymentSchema), bodyReq({
      ...rest,
      vendorBreakdown: [{ sellerId: 'a', amountUGX: -100 }],
    }));
    expect(result.status).toBe(400);
  });
});

describe('escrow and payout schemas', () => {
  it('CreateEscrowSchema requires at least one vendor hold', () => {
    expect(run(validateBody(CreateEscrowSchema), bodyReq({
      orderId: 'o1', buyerId: 'b1', holds: [],
    })).status).toBe(400);

    expect(run(validateBody(CreateEscrowSchema), bodyReq({
      orderId: 'o1', buyerId: 'b1', holds: [{ vendorId: 'v1', amountUGX: 100 }],
    })).nexted).toBe(true);
  });

  it('ReleaseEscrowSchema requires an orderId', () => {
    expect(run(validateBody(ReleaseEscrowSchema), bodyReq({})).status).toBe(400);
    expect(run(validateBody(ReleaseEscrowSchema), bodyReq({ orderId: 'o1' })).nexted).toBe(true);
  });

  it('HoldEscrowSchema requires a disputeId and keeps vendorId optional', () => {
    expect(run(validateBody(HoldEscrowSchema), bodyReq({ orderId: 'o1' })).status).toBe(400);
    expect(run(validateBody(HoldEscrowSchema), bodyReq({ orderId: 'o1', disputeId: 'D1' })).nexted).toBe(true);
    expect(run(validateBody(HoldEscrowSchema), bodyReq({
      orderId: 'o1', disputeId: 'D1', vendorId: 'v1',
    })).nexted).toBe(true);
  });

  it('RequestPayoutSchema requires a positive amount and a destination', () => {
    const valid = { amount: 10_000, method: 'mtn_momo', destinationAccount: '+256770000000' };
    expect(run(validateBody(RequestPayoutSchema), bodyReq(valid)).nexted).toBe(true);
    expect(run(validateBody(RequestPayoutSchema), bodyReq({ ...valid, amount: -1 })).status).toBe(400);
    expect(run(validateBody(RequestPayoutSchema), bodyReq({ ...valid, destinationAccount: '' })).status).toBe(400);
    expect(run(validateBody(RequestPayoutSchema), bodyReq({ ...valid, method: 'cash' })).status).toBe(400);
  });

  it('RefundPaymentSchema allows an omitted amount (full refund)', () => {
    expect(run(validateBody(RefundPaymentSchema), bodyReq({})).nexted).toBe(true);
    expect(run(validateBody(RefundPaymentSchema), bodyReq({ amount: 500 })).nexted).toBe(true);
    expect(run(validateBody(RefundPaymentSchema), bodyReq({ amount: -500 })).status).toBe(400);
  });
});

describe('WebhookProviderParams', () => {
  it('accepts only providers this service holds a secret for', () => {
    const params: Record<string, string> = { provider: 'mtn' };
    expect(run(validateParams(WebhookProviderParams), { params } as Partial<Request>).nexted).toBe(true);

    const bogus: Record<string, string> = { provider: 'evil-co' };
    expect(run(validateParams(WebhookProviderParams), { params: bogus } as Partial<Request>).status).toBe(400);
  });
});
