import { describe, it, expect } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { validateBody } from '../../../../shared/http/validation.middleware.js';
import {
  createDiscountSchema,
  updateDiscountSchema,
  applyDiscountSchema,
  validateDiscountSchema,
  DiscountType,
} from '../models/discount.model.js';

// ─── Discount request validation ──────────────────────────────────────────────
//
// These schemas existed but nothing called them — every handler read `req.body`
// raw. That allowed a PERCENTAGE code with `value: 500` (a 500% discount, i.e. a
// negative order total) and an `expiresAt` already in the past (a code that
// looks live in the admin list and fails at the till).

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

const inOneMonth = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const lastMonth  = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

const validPercentage = {
  code: 'SAVE10',
  type: DiscountType.PERCENTAGE,
  value: 10,
  expiresAt: inOneMonth(),
};

describe('createDiscountSchema — percentage bounds', () => {
  it('accepts 0 and 100 at the boundaries', () => {
    expect(run(validateBody(createDiscountSchema), bodyReq({ ...validPercentage, value: 0 })).nexted).toBe(true);
    expect(run(validateBody(createDiscountSchema), bodyReq({ ...validPercentage, value: 100 })).nexted).toBe(true);
  });

  it('rejects a percentage above 100', () => {
    // 500% off is a negative order total.
    const result = run(validateBody(createDiscountSchema), bodyReq({ ...validPercentage, value: 500 }));
    expect(result.status).toBe(400);
    expect(result.body?.errors.value).toBeDefined();
  });

  it('rejects a negative value', () => {
    expect(run(validateBody(createDiscountSchema), bodyReq({ ...validPercentage, value: -1 })).status).toBe(400);
  });

  it('still allows a large FIXED_AMOUNT — the 100 cap is percentage-only', () => {
    const result = run(validateBody(createDiscountSchema), bodyReq({
      ...validPercentage, type: DiscountType.FIXED_AMOUNT, value: 50_000,
    }));
    expect(result.nexted).toBe(true);
  });
});

describe('createDiscountSchema — expiry', () => {
  it('accepts a future expiry', () => {
    expect(run(validateBody(createDiscountSchema), bodyReq(validPercentage)).nexted).toBe(true);
  });

  it('rejects an expiry in the past', () => {
    const result = run(validateBody(createDiscountSchema), bodyReq({
      ...validPercentage, expiresAt: lastMonth(),
    }));
    expect(result.status).toBe(400);
    expect(result.body?.errors.expiresAt).toBeDefined();
  });

  it('rejects an expiry before the start date', () => {
    const result = run(validateBody(createDiscountSchema), bodyReq({
      ...validPercentage,
      startsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: inOneMonth(),
    }));
    expect(result.status).toBe(400);
  });

  it('rejects a missing or unparseable expiry', () => {
    const { expiresAt, ...noExpiry } = validPercentage;
    expect(run(validateBody(createDiscountSchema), bodyReq(noExpiry)).status).toBe(400);
    expect(run(validateBody(createDiscountSchema), bodyReq({
      ...validPercentage, expiresAt: 'next tuesday',
    })).status).toBe(400);
  });
});

describe('createDiscountSchema — code and type', () => {
  it('upper-cases and trims the code', () => {
    const result = run(validateBody(createDiscountSchema), bodyReq({
      ...validPercentage, code: '  save10  ',
    }));
    expect(result.nexted).toBe(true);
    expect(result.req.body.code).toBe('SAVE10');
  });

  it('rejects a code shorter than three characters', () => {
    expect(run(validateBody(createDiscountSchema), bodyReq({ ...validPercentage, code: 'AB' })).status).toBe(400);
  });

  it('rejects an unknown discount type', () => {
    expect(run(validateBody(createDiscountSchema), bodyReq({
      ...validPercentage, type: 'BUY_THE_SHOP',
    })).status).toBe(400);
  });

  it('applies documented defaults', () => {
    const result = run(validateBody(createDiscountSchema), bodyReq(validPercentage));
    expect(result.req.body.minOrderAmount).toBe(0);
    expect(result.req.body.perUserLimit).toBe(1);
    expect(result.req.body.active).toBe(true);
  });
});

describe('updateDiscountSchema', () => {
  it('accepts a partial update', () => {
    expect(run(validateBody(updateDiscountSchema), bodyReq({ active: false })).nexted).toBe(true);
  });

  it('still refuses a percentage over 100', () => {
    expect(run(validateBody(updateDiscountSchema), bodyReq({
      type: DiscountType.PERCENTAGE, value: 250,
    })).status).toBe(400);
  });

  it('still refuses moving expiry into the past', () => {
    expect(run(validateBody(updateDiscountSchema), bodyReq({ expiresAt: lastMonth() })).status).toBe(400);
  });
});

describe('redemption bodies', () => {
  const redemption = { code: 'SAVE10', userId: 'u1', orderAmount: 50_000 };

  it('accepts a well-formed redemption', () => {
    expect(run(validateBody(applyDiscountSchema), bodyReq(redemption)).nexted).toBe(true);
  });

  it('requires a code, a user and a non-negative order amount', () => {
    expect(run(validateBody(applyDiscountSchema), bodyReq({ ...redemption, code: '' })).status).toBe(400);
    expect(run(validateBody(applyDiscountSchema), bodyReq({ ...redemption, userId: '' })).status).toBe(400);
    expect(run(validateBody(applyDiscountSchema), bodyReq({ ...redemption, orderAmount: -1 })).status).toBe(400);
  });

  it('rejects a redemption line with a fractional quantity', () => {
    expect(run(validateBody(applyDiscountSchema), bodyReq({
      ...redemption,
      items: [{ productId: 'p1', price: 100, quantity: 1.5 }],
    })).status).toBe(400);
  });

  it('validateDiscountSchema upper-cases the code it checks', () => {
    const result = run(validateBody(validateDiscountSchema), bodyReq({ ...redemption, code: 'save10' }));
    expect(result.nexted).toBe(true);
    expect(result.req.body.code).toBe('SAVE10');
  });
});
