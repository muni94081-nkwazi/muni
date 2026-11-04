import { describe, it, expect } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { validateBody, validateParams } from '../../../../shared/http/validation.middleware.js';
import {
  AddItemSchema,
  UpdateItemQuantitySchema,
  ApplyCouponSchema,
  MergeCartSchema,
} from '../models/cart.model.js';
import { z } from 'zod';

// ─── Cart request validation ──────────────────────────────────────────────────
//
// The schemas existed and the controllers called `.parse()` — but inside the
// same try/catch as the service call, so a Redis outage was reported to the
// customer as "your request is invalid", and a ZodError's raw `.message` (a
// JSON dump of every issue plus the submitted input) went back as the
// user-facing string. Validation now runs in route middleware.

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

const validItem = {
  productId: 'p1',
  sellerId: 's1',
  productName: 'Coffee',
  productImage: 'https://cdn.muni.ug/c.jpg',
  price: 20000,
  quantity: 2,
  maxQuantity: 10,
};

describe('POST /cart/items', () => {
  it('accepts a well-formed line', () => {
    expect(run(validateBody(AddItemSchema), bodyReq(validItem)).nexted).toBe(true);
  });

  it('rejects a non-positive or fractional quantity', () => {
    for (const quantity of [0, -1, 1.5]) {
      const result = run(validateBody(AddItemSchema), bodyReq({ ...validItem, quantity }));
      expect(result.status).toBe(400);
      expect(result.body?.errors.quantity).toBeDefined();
    }
  });

  it('rejects a negative price', () => {
    // The cart's stored price is a display snapshot, but a negative one still
    // renders a negative subtotal to the customer before checkout re-prices.
    expect(run(validateBody(AddItemSchema), bodyReq({ ...validItem, price: -1 })).status).toBe(400);
  });

  it('rejects a line missing its product or seller', () => {
    const { productId, ...noProduct } = validItem;
    const { sellerId, ...noSeller } = validItem;
    expect(run(validateBody(AddItemSchema), bodyReq(noProduct)).status).toBe(400);
    expect(run(validateBody(AddItemSchema), bodyReq(noSeller)).status).toBe(400);
  });

  it('reports every invalid field at once, not just the first', () => {
    const result = run(validateBody(AddItemSchema), bodyReq({
      ...validItem, quantity: 0, price: -5,
    }));
    expect(Object.keys(result.body?.errors ?? {}).sort()).toEqual(['price', 'quantity']);
  });

  it('never echoes the submitted body back in the error', () => {
    const result = run(validateBody(AddItemSchema), bodyReq({
      ...validItem, quantity: 0, productName: 'SENTINEL-VALUE',
    }));
    expect(JSON.stringify(result.body)).not.toContain('SENTINEL-VALUE');
  });
});

describe('PATCH /cart/items/:itemId', () => {
  it('accepts quantity 0 — that is how a line is removed', () => {
    expect(run(validateBody(UpdateItemQuantitySchema), bodyReq({ quantity: 0 })).nexted).toBe(true);
  });

  it('rejects a negative or fractional quantity', () => {
    expect(run(validateBody(UpdateItemQuantitySchema), bodyReq({ quantity: -1 })).status).toBe(400);
    expect(run(validateBody(UpdateItemQuantitySchema), bodyReq({ quantity: 2.5 })).status).toBe(400);
  });

  it('rejects a missing quantity', () => {
    expect(run(validateBody(UpdateItemQuantitySchema), bodyReq({})).status).toBe(400);
  });

  it('rejects an empty itemId param', () => {
    const ItemIdParams = z.object({ itemId: z.string().trim().min(1) });
    const params: Record<string, string> = { itemId: '   ' };
    expect(run(validateParams(ItemIdParams), { params } as Partial<Request>).status).toBe(400);
  });
});

describe('coupon and merge bodies', () => {
  it('requires a non-empty coupon code', () => {
    expect(run(validateBody(ApplyCouponSchema), bodyReq({ code: '' })).status).toBe(400);
    expect(run(validateBody(ApplyCouponSchema), bodyReq({ code: 'SAVE10' })).nexted).toBe(true);
  });

  it('requires a sessionId to merge a guest cart', () => {
    expect(run(validateBody(MergeCartSchema), bodyReq({})).status).toBe(400);
    expect(run(validateBody(MergeCartSchema), bodyReq({ sessionId: 'guest-1' })).nexted).toBe(true);
  });
});
