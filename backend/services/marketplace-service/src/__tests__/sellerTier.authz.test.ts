/**
 * sellerTier.authz.test.ts
 *
 * Who may read a seller's commercial figures.
 *
 * Both seller-tier routes were mounted with no guard, and the gateway serves
 * /marketplace publicly — so an anonymous request returned a named seller's
 * real sales volume, derived revenue, commission-fee reduction and search-boost
 * multiplier. Verified live before this fix: a real store came back with
 * rating 4.9, 140 orders and UGX 35,000,000 to a caller with no credentials.
 *
 * The controllers also fell back to a hardcoded 'seller-001' when no identity
 * arrived, and `evaluateSellerTier` took the sellerId straight from the request
 * body — so the caller chose whose figures to read.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { MemoryStoreRepository } from '../repositories/memory-marketplace.repository.js';
import { MarketplaceService } from '../services/marketplace.service.js';

const repo = new MemoryStoreRepository();
const service = new MarketplaceService(repo);

jest.unstable_mockModule('../services/marketplace.service.js', () => ({
  MarketplaceService,
  marketplaceService: service,
}));

const { getSellerTier, evaluateSellerTier } = await import('../controllers/marketplace.controller.js');

const SELLER = 'seller-user-1';
const OTHER = 'seller-user-2';

function makeRes(locals: Record<string, unknown> = {}) {
  const res = {
    locals,
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

const noop: NextFunction = () => {};

const readTier = (params: Record<string, string>, locals: Record<string, unknown>) => {
  const res = makeRes(locals);
  return (getSellerTier as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
    { params, body: {} } as unknown as Request, res, noop,
  ).then(() => res);
};

const evaluate = (body: Record<string, unknown>, locals: Record<string, unknown>) => {
  const res = makeRes(locals);
  return (evaluateSellerTier as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
    { params: {}, body } as unknown as Request, res, noop,
  ).then(() => res);
};

beforeEach(() => {
  repo.clear?.();
});

describe('seller tier is not public', () => {
  it('401s an anonymous read instead of answering as seller-001', async () => {
    const res = await readTier({ sellerId: SELLER }, {});

    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('seller-001');
    expect(JSON.stringify(res.body)).not.toContain('totalRevenueUGX');
  });

  it('401s an anonymous evaluate', async () => {
    const res = await evaluate({}, {});

    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('seller-001');
  });

  it('leaks no commercial figures to an anonymous caller', async () => {
    const res = await readTier({ sellerId: SELLER }, {});

    const body = JSON.stringify(res.body);
    for (const field of ['totalOrders', 'commissionFeeReductionPercent', 'searchBoostMultiplier']) {
      expect(body).not.toContain(field);
    }
  });
});

describe('a seller sees only their own tier', () => {
  it('lets a seller read their own', async () => {
    const res = await readTier({ sellerId: SELLER }, { userId: SELLER, roles: ['ROLE_SELLER'] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sellerId).toBe(SELLER);
  });

  it('403s a seller reading another seller’s tier', async () => {
    const res = await readTier({ sellerId: OTHER }, { userId: SELLER, roles: ['ROLE_SELLER'] });

    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('totalRevenueUGX');
  });

  it('ignores a sellerId in the evaluate body — the body used to choose', async () => {
    const res = await evaluate({ sellerId: OTHER }, { userId: SELLER, roles: ['ROLE_SELLER'] });

    expect(res.statusCode).toBe(403);
  });

  it('evaluates the caller’s own tier when the body names nobody', async () => {
    const res = await evaluate({}, { userId: SELLER, roles: ['ROLE_SELLER'] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sellerId).toBe(SELLER);
  });
});

describe('an admin may read any seller’s tier', () => {
  it('allows ROLE_ADMIN', async () => {
    const res = await readTier({ sellerId: OTHER }, { userId: 'admin-1', roles: ['ROLE_ADMIN'] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sellerId).toBe(OTHER);
  });

  it('allows ROLE_SUPER_ADMIN', async () => {
    const res = await readTier({ sellerId: OTHER }, { userId: 'root-1', roles: ['ROLE_SUPER_ADMIN'] });

    expect(res.statusCode).toBe(200);
  });
});
