import { describe, it, expect, beforeEach } from '@jest/globals';
import { DiscountService } from '../services/discount.service.js';
import {
  DuplicateActiveCodeError,
  InMemoryDiscountRepository,
} from '../repositories/discount.repository.js';
import { DiscountType } from '../models/discount.model.js';

// Discounts moved out of two process-local Maps into Postgres behind
// IDiscountRepository. These run against the in-memory repository, which
// reproduces the constraints the migration enforces — the partial unique index
// on (code WHERE active), redemption uniqueness on
// (discountId, userId, orderId), and the ordering of the limit checks — so a
// pass here is not a pass on laxer rules than production runs under.
//
// The concurrency guarantees themselves are verified against real Postgres;
// see the live verification notes. What is asserted here is the contract every
// implementation must honour.

function makeService() {
  return new DiscountService(new InMemoryDiscountRepository());
}

const inOneYear = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

function percentageCode(overrides: Record<string, unknown> = {}) {
  return {
    code: 'SAVE10',
    type: DiscountType.PERCENTAGE,
    value: 10,
    minOrderAmount: 0,
    maxUsageCount: 100,
    perUserLimit: 5,
    applicableCategories: [],
    applicableProducts: [],
    applicableSellers: [],
    startsAt: new Date(),
    expiresAt: inOneYear(),
    active: true,
    ...overrides,
  };
}

const redemption = (overrides: Record<string, unknown> = {}) => ({
  code: 'SAVE10',
  userId: 'user-1',
  orderAmount: 1000,
  items: [],
  ...overrides,
});

let service: DiscountService;
beforeEach(() => { service = makeService(); });

// ─── Creation and code uniqueness ─────────────────────────────────────────────

describe('creation', () => {
  it('creates a discount with a zeroed usage counter', async () => {
    const d = await service.create(percentageCode(), 'admin-1');

    expect(d.id).toBeTruthy();
    expect(d.code).toBe('SAVE10');
    expect(d.usageCount).toBe(0);
    expect(d.createdBy).toBe('admin-1');
  });

  it('refuses a code already held by an ACTIVE discount', async () => {
    await service.create(percentageCode(), 'admin-1');
    await expect(service.create(percentageCode(), 'admin-1')).rejects.toBeInstanceOf(
      DuplicateActiveCodeError,
    );
  });

  it('allows a deactivated code to be issued again', async () => {
    // The rule is "unique among ACTIVE discounts" — a retired code is
    // deliberately reusable, which is why the index is partial rather than a
    // plain unique on `code`.
    const first = await service.create(percentageCode(), 'admin-1');
    await service.deactivate(first.id);

    const second = await service.create(percentageCode(), 'admin-1');
    expect(second.id).not.toBe(first.id);
    expect(second.code).toBe('SAVE10');
  });

  it('permits two inactive discounts to share a code', async () => {
    const a = await service.create(percentageCode(), 'admin-1');
    await service.deactivate(a.id);
    const b = await service.create(percentageCode(), 'admin-1');
    await service.deactivate(b.id);

    const all = await service.getAll();
    expect(all.filter((d) => d.code === 'SAVE10')).toHaveLength(2);
  });

  it('does not seed demo discounts on construction', async () => {
    // WELCOME10/SAVE20/FREESHIP/FLASH50 were created in the constructor. Against
    // a database that is a re-insert on every boot, which the unique index
    // would reject — taking the service down on restart.
    expect(await makeService().getAll()).toHaveLength(0);
  });
});

// ─── Redemption: global limit ─────────────────────────────────────────────────

describe('redemption — global usage limit', () => {
  it('increments usage on a successful apply', async () => {
    await service.create(percentageCode(), 'admin-1');

    const result = await service.applyCode(redemption(), 'order-1');
    expect(result.valid).toBe(true);
    expect(result.discount!.usageCount).toBe(1);
  });

  it('refuses once the cap is reached', async () => {
    await service.create(percentageCode({ maxUsageCount: 2, perUserLimit: 10 }), 'admin-1');

    await service.applyCode(redemption(), 'order-1');
    await service.applyCode(redemption(), 'order-2');

    await expect(service.applyCode(redemption(), 'order-3')).rejects.toThrow(
      /usage limit reached/i,
    );
  });

  it('never exceeds the cap under concurrent redemption', async () => {
    // The property the conditional UPDATE exists for. Ten simultaneous
    // redemptions against a cap of three must yield exactly three.
    await service.create(percentageCode({ maxUsageCount: 3, perUserLimit: 10 }), 'admin-1');

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        service.applyCode(redemption(), `order-${i}`),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(3);

    const [discount] = await service.getAll();
    expect(discount.usageCount).toBe(3);
    expect(discount.usageCount).toBeLessThanOrEqual(discount.maxUsageCount);
  });
});

// ─── Redemption: per-user limit ───────────────────────────────────────────────

describe('redemption — per-user limit', () => {
  it('refuses once one user has hit their allowance', async () => {
    await service.create(percentageCode({ perUserLimit: 2, maxUsageCount: 100 }), 'admin-1');

    await service.applyCode(redemption({ userId: 'user-1' }), 'order-1');
    await service.applyCode(redemption({ userId: 'user-1' }), 'order-2');

    await expect(
      service.applyCode(redemption({ userId: 'user-1' }), 'order-3'),
    ).rejects.toThrow(/maximum usage limit/i);
  });

  it('counts each user separately', async () => {
    await service.create(percentageCode({ perUserLimit: 1, maxUsageCount: 100 }), 'admin-1');

    await service.applyCode(redemption({ userId: 'user-1' }), 'order-1');
    await expect(
      service.applyCode(redemption({ userId: 'user-2' }), 'order-2'),
    ).resolves.toMatchObject({ valid: true });
  });

  it('never exceeds the per-user allowance under concurrency', async () => {
    await service.create(percentageCode({ perUserLimit: 2, maxUsageCount: 100 }), 'admin-1');

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        service.applyCode(redemption({ userId: 'user-1' }), `order-${i}`),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((await service.getAll())[0].usageCount).toBe(2);
  });
});

// ─── Redemption: idempotency ──────────────────────────────────────────────────

describe('redemption — idempotency', () => {
  it('a repeat with the SAME orderId does not consume a second use', async () => {
    await service.create(percentageCode({ maxUsageCount: 100, perUserLimit: 5 }), 'admin-1');

    const first = await service.applyCode(redemption(), 'order-stable');
    const replay = await service.applyCode(redemption(), 'order-stable');

    expect(replay.valid).toBe(true);
    expect(replay.discountAmount).toBe(first.discountAmount);
    expect((await service.getAll())[0].usageCount).toBe(1);
  });

  it('is idempotent even when the cap is already spent', async () => {
    // A replay must not be refused just because the budget has since run out —
    // the use it is replaying was already counted.
    await service.create(percentageCode({ maxUsageCount: 1, perUserLimit: 5 }), 'admin-1');

    await service.applyCode(redemption(), 'order-stable');
    await expect(service.applyCode(redemption(), 'order-stable')).resolves.toMatchObject({
      valid: true,
    });
  });

  it('a repeat with a DIFFERENT orderId consumes another use', async () => {
    // The distinction E3 preserves: orderId is the idempotency key. A caller
    // that omits it gets `order-<timestamp>` from the controller — a fresh key
    //per attempt — so its retries are NOT free. Tracked as a follow-up for
    // checkout/cart to supply a stable id.
    await service.create(percentageCode({ maxUsageCount: 100, perUserLimit: 5 }), 'admin-1');

    await service.applyCode(redemption(), 'order-a');
    await service.applyCode(redemption(), 'order-b');

    expect((await service.getAll())[0].usageCount).toBe(2);
  });
});

// ─── Per-seller attribution ───────────────────────────────────────────────────
//
// A coupon restricted to one seller must not come off another seller's goods.
// The scalar these tests replace could not express that: it said how much came
// off, never whose.

describe('seller attribution', () => {
  const line = (sellerId: string, price: number, overrides: Record<string, unknown> = {}) => ({
    productId: `prod-${sellerId}`,
    sellerId,
    price,
    quantity: 1,
    ...overrides,
  });

  /** Validate a code against a basket and hand back the breakdown. */
  async function quote(items: Array<Record<string, unknown>>, code = 'SAVE10'): Promise<any> {
    const orderAmount = items.reduce(
      (sum, i) => sum + (i.price as number) * (i.quantity as number), 0,
    );
    return service.validateCode({ code, userId: 'user-1', orderAmount, items });
  }

  const sliceFor = (res: any, sellerId: string) =>
    res.sellerBreakdown.find((s: any) => s.sellerId === sellerId);

  it('gives seller B nothing when the coupon is restricted to seller A', async () => {
    await service.create(percentageCode({ applicableSellers: ['seller-a'] }), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(200);   // 10% of 2000
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(0);
    expect(sliceFor(res, 'seller-b').eligibleAmount).toBe(0);
    expect(res.discountAmount).toBe(200);
  });

  it('names a seller with nothing eligible rather than omitting them', async () => {
    // An absent seller and a seller allocated zero are different statements.
    // Downstream has to be able to tell "funded none of it" from "unknown".
    await service.create(percentageCode({ applicableSellers: ['seller-a'] }), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(res.sellerBreakdown.map((s: any) => s.sellerId)).toEqual(['seller-a', 'seller-b']);
  });

  it('splits a percentage across both sellers by their own value', async () => {
    await service.create(percentageCode(), 'admin-1');   // 10%, unrestricted

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(200);
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(500);
    expect(res.discountAmount).toBe(700);
  });

  it('splits a fixed amount proportionally to eligible subtotals', async () => {
    // 700 off a 2000/5000 basket is 200/500, not 350/350.
    await service.create(percentageCode({
      type: DiscountType.FIXED_AMOUNT, value: 700,
    }), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(200);
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(500);
    expect(res.discountAmount).toBe(700);
  });

  it('confines a fixed amount to the one eligible seller', async () => {
    await service.create(percentageCode({
      type: DiscountType.FIXED_AMOUNT, value: 700, applicableSellers: ['seller-b'],
    }), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(0);
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(700);
  });

  it('never gives a seller more than their own eligible goods', async () => {
    // A 9,000 fixed discount against 2,000 of eligible goods is capped by the
    // existing min(value, applicable) rule; the slice must respect it too.
    await service.create(percentageCode({
      type: DiscountType.FIXED_AMOUNT, value: 9000, applicableSellers: ['seller-a'],
    }), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(2000);
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(0);
    expect(res.discountAmount).toBe(2000);
  });

  it('attributes a product-restricted coupon to that product owner only', async () => {
    await service.create(percentageCode({ applicableProducts: ['prod-seller-a'] }), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(200);
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(0);
  });

  it('attributes a category-restricted coupon to whoever sells in that category', async () => {
    await service.create(percentageCode({ applicableCategories: ['cat-coffee'] }), 'admin-1');

    const res = await quote([
      line('seller-a', 2000, { categoryId: 'cat-coffee' }),
      line('seller-b', 5000, { categoryId: 'cat-tea' }),
    ]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(200);
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(0);
  });

  it('splits a category coupon across every seller in that category', async () => {
    await service.create(percentageCode({ applicableCategories: ['cat-coffee'] }), 'admin-1');

    const res = await quote([
      line('seller-a', 2000, { categoryId: 'cat-coffee' }),
      line('seller-b', 5000, { categoryId: 'cat-coffee' }),
    ]);

    expect(sliceFor(res, 'seller-a').discountAmount).toBe(200);
    expect(sliceFor(res, 'seller-b').discountAmount).toBe(500);
  });

  it('sums the slices to the total exactly, cents and all', async () => {
    // A third of a 10.00 discount across three equal sellers is 3.333... each.
    // The parts must still add to 10.00 rather than 9.99.
    await service.create(percentageCode({
      type: DiscountType.FIXED_AMOUNT, value: 10,
    }), 'admin-1');

    const res = await quote([
      line('seller-a', 100), line('seller-b', 100), line('seller-c', 100),
    ]);

    const sum = res.sellerBreakdown.reduce((t: number, s: any) => t + s.discountAmount, 0);
    expect(sum).toBe(res.discountAmount);
    expect(sum).toBe(10);
    // Deterministic: the spare cent goes to the lowest seller id.
    expect(res.sellerBreakdown.map((s: any) => s.discountAmount)).toEqual([3.34, 3.33, 3.33]);
  });

  it('is deterministic — the same basket splits the same way every time', async () => {
    await service.create(percentageCode({ type: DiscountType.FIXED_AMOUNT, value: 10 }), 'admin-1');

    const a = await quote([line('seller-c', 100), line('seller-a', 100), line('seller-b', 100)]);
    const b = await quote([line('seller-a', 100), line('seller-b', 100), line('seller-c', 100)]);

    expect(a.sellerBreakdown).toEqual(b.sellerBreakdown);
  });

  it('gives FREE_SHIPPING a zero slice for every seller', async () => {
    // The saving is on shipping, which is nobody's goods revenue. A vendor
    // payout must not move because the buyer got free delivery.
    await service.create(percentageCode({
      type: DiscountType.FREE_SHIPPING, value: 0,
    }), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-b', 5000)]);

    expect(res.valid).toBe(true);
    expect(res.discountAmount).toBe(0);
    expect(res.sellerBreakdown.every((s: any) => s.discountAmount === 0)).toBe(true);
  });

  it('still refuses a code that matches nothing in the basket', async () => {
    await service.create(percentageCode({ applicableSellers: ['seller-nobody'] }), 'admin-1');

    const res = await quote([line('seller-a', 2000)]);

    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/does not apply/i);
  });

  it('keeps a single-seller basket on one slice worth the whole discount', async () => {
    await service.create(percentageCode(), 'admin-1');

    const res = await quote([line('seller-a', 2000), line('seller-a', 5000)]);

    expect(res.sellerBreakdown).toEqual([
      { sellerId: 'seller-a', eligibleAmount: 7000, discountAmount: 700 },
    ]);
  });

  it('attributes lines with no seller to the house rather than dropping them', async () => {
    await service.create(percentageCode(), 'admin-1');

    const res: any = await service.validateCode({
      code: 'SAVE10', userId: 'user-1', orderAmount: 1000,
      items: [{ productId: 'p1', price: 1000, quantity: 1 }],
    });

    expect(res.sellerBreakdown).toEqual([
      { sellerId: 'muni-store', eligibleAmount: 1000, discountAmount: 100 },
    ]);
  });
});

// ─── Reversal ─────────────────────────────────────────────────────────────────

describe('reversal', () => {
  it('gives the use back so the code can be redeemed again', async () => {
    await service.create(percentageCode({ maxUsageCount: 1, perUserLimit: 5 }), 'admin-1');
    await service.applyCode(redemption(), 'order-a');

    // Budget spent — the next customer is refused.
    await expect(service.applyCode(redemption({ userId: 'user-2' }), 'order-b'))
      .rejects.toThrow(/usage limit reached/i);

    await expect(service.reverseCode('SAVE10', 'user-1', 'order-a'))
      .resolves.toMatchObject({ reversed: true });

    expect((await service.getAll())[0].usageCount).toBe(0);
    await expect(service.applyCode(redemption({ userId: 'user-2' }), 'order-b'))
      .resolves.toMatchObject({ valid: true });
  });

  it("frees that user's own per-user allowance too", async () => {
    await service.create(percentageCode({ maxUsageCount: 100, perUserLimit: 1 }), 'admin-1');
    await service.applyCode(redemption(), 'order-a');

    await expect(service.applyCode(redemption(), 'order-b'))
      .rejects.toThrow(/limit/i);

    await service.reverseCode('SAVE10', 'user-1', 'order-a');

    await expect(service.applyCode(redemption(), 'order-b'))
      .resolves.toMatchObject({ valid: true });
  });

  it('is idempotent — a repeated reversal does not refund a second use', async () => {
    // A saga can be re-driven, and a compensation can run twice.
    await service.create(percentageCode({ maxUsageCount: 100, perUserLimit: 5 }), 'admin-1');
    await service.applyCode(redemption(), 'order-a');
    await service.applyCode(redemption(), 'order-b');

    await service.reverseCode('SAVE10', 'user-1', 'order-a');
    const second = await service.reverseCode('SAVE10', 'user-1', 'order-a');

    expect(second.reversed).toBe(false);
    expect((await service.getAll())[0].usageCount).toBe(1);   // order-b still counted
  });

  it('reverses only the order named, leaving the others counted', async () => {
    await service.create(percentageCode({ maxUsageCount: 100, perUserLimit: 5 }), 'admin-1');
    await service.applyCode(redemption(), 'order-a');
    await service.applyCode(redemption({ userId: 'user-2' }), 'order-b');

    await service.reverseCode('SAVE10', 'user-1', 'order-a');

    expect((await service.getAll())[0].usageCount).toBe(1);
    // user-1 can redeem again; user-2's redemption is untouched.
    await expect(service.applyCode(redemption(), 'order-c'))
      .resolves.toMatchObject({ valid: true });
  });

  it('never drives the counter below zero', async () => {
    // Defence against a double reversal racing, or a counter already at 0.
    await service.create(percentageCode(), 'admin-1');
    await service.applyCode(redemption(), 'order-a');

    await service.reverseCode('SAVE10', 'user-1', 'order-a');
    await service.reverseCode('SAVE10', 'user-1', 'order-a');
    await service.reverseCode('SAVE10', 'user-1', 'order-never-existed');

    expect((await service.getAll())[0].usageCount).toBe(0);
  });

  it('reports a no-op rather than throwing when nothing was redeemed', async () => {
    await service.create(percentageCode(), 'admin-1');

    await expect(service.reverseCode('SAVE10', 'user-1', 'order-none'))
      .resolves.toMatchObject({ reversed: false });
  });

  it('does not throw for a code that does not exist', async () => {
    // A compensation that throws would replace the real failure with its own.
    await expect(service.reverseCode('NOSUCHCODE', 'user-1', 'order-a'))
      .resolves.toMatchObject({ reversed: false });
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('validateCode', () => {
  it('rejects an unknown or inactive code', async () => {
    await expect(service.validateCode(redemption({ code: 'NOPE' }))).resolves.toMatchObject({
      valid: false,
      message: 'Invalid or inactive discount code',
    });

    const d = await service.create(percentageCode(), 'admin-1');
    await service.deactivate(d.id);
    await expect(service.validateCode(redemption())).resolves.toMatchObject({ valid: false });
  });

  it('rejects a code that has not started', async () => {
    await service.create(
      percentageCode({ startsAt: new Date(Date.now() + 86_400_000) }),
      'admin-1',
    );
    await expect(service.validateCode(redemption())).resolves.toMatchObject({
      message: 'Discount code is not yet active',
    });
  });

  it('enforces the minimum order amount', async () => {
    await service.create(percentageCode({ minOrderAmount: 5000 }), 'admin-1');
    await expect(
      service.validateCode(redemption({ orderAmount: 100 })),
    ).resolves.toMatchObject({ valid: false });
  });

  it('computes each discount type as before', async () => {
    const cases: Array<[DiscountType, number, number]> = [
      [DiscountType.PERCENTAGE, 10, 100],     // 10% of 1000
      [DiscountType.FIXED_AMOUNT, 250, 250],  // capped at the order
      [DiscountType.FREE_SHIPPING, 0, 0],
      [DiscountType.BOGO, 100, 500],          // half the applicable amount
      [DiscountType.FLASH_SALE, 25, 250],
    ];

    for (const [type, value, expected] of cases) {
      const s = makeService();
      await s.create(percentageCode({ type, value, code: `C-${type}` }), 'admin-1');
      const result = await s.validateCode(redemption({ code: `C-${type}` }));
      expect(result.discountAmount).toBe(expected);
    }
  });

  it('refuses when nothing in the basket matches the restriction', async () => {
    await service.create(
      percentageCode({ applicableProducts: ['prod-only-this'] }),
      'admin-1',
    );

    await expect(
      service.validateCode(
        redemption({ items: [{ productId: 'other', price: 100, quantity: 1 }] }),
      ),
    ).resolves.toMatchObject({ valid: false });
  });
});

// ─── Queries ──────────────────────────────────────────────────────────────────

describe('queries', () => {
  it('getActive excludes inactive, unstarted and expired discounts', async () => {
    const live = await service.create(percentageCode({ code: 'LIVE' }), 'admin-1');
    const dead = await service.create(percentageCode({ code: 'DEAD' }), 'admin-1');
    await service.deactivate(dead.id);
    await service.create(
      percentageCode({ code: 'FUTURE', startsAt: new Date(Date.now() + 86_400_000) }),
      'admin-1',
    );

    const active = await service.getActive();
    expect(active.map((d) => d.id)).toEqual([live.id]);
  });

  it('getFlashSales returns only live FLASH_SALE codes', async () => {
    await service.create(percentageCode({ code: 'NORMAL' }), 'admin-1');
    const flash = await service.create(
      percentageCode({ code: 'FLASH', type: DiscountType.FLASH_SALE, value: 30 }),
      'admin-1',
    );

    const sales = await service.getFlashSales();
    expect(sales.map((d) => d.id)).toEqual([flash.id]);
  });

  it('getSellerPromotions matches both creator and applicable seller', async () => {
    const mine = await service.create(percentageCode({ code: 'MINE' }), 'seller-1');
    const targeted = await service.create(
      percentageCode({ code: 'TARGETED', applicableSellers: ['seller-1'] }),
      'admin-1',
    );
    await service.create(percentageCode({ code: 'OTHER' }), 'seller-2');

    const promos = await service.getSellerPromotions('seller-1');
    expect(promos.map((d) => d.id).sort()).toEqual([mine.id, targeted.id].sort());
  });

  it('getUsage reports the counter against the cap', async () => {
    const d = await service.create(percentageCode({ maxUsageCount: 50 }), 'admin-1');
    await service.applyCode(redemption(), 'order-1');

    expect(await service.getUsage(d.id)).toEqual({
      discountId: d.id,
      code: 'SAVE10',
      totalUsageCount: 1,
      maxUsageCount: 50,
    });
  });

  it('throws for an unknown id on usage and update', async () => {
    await expect(service.getUsage('nope')).rejects.toThrow('Discount not found');
    await expect(service.update('nope', { value: 5 })).rejects.toThrow('Discount not found');
    await expect(service.deactivate('nope')).rejects.toThrow('Discount not found');
  });
});

// ─── Expiry notification ──────────────────────────────────────────────────────

describe('expiry', () => {
  it('claims the expiry notification exactly once', async () => {
    // The event used to be published on every validation of an expired code.
    const repo = new InMemoryDiscountRepository();
    const d = await repo.create({
      ...percentageCode(),
      createdBy: 'admin-1',
    } as never);

    expect(await repo.claimExpiryNotification(d.id)).toBe(true);
    expect(await repo.claimExpiryNotification(d.id)).toBe(false);
    expect(await repo.claimExpiryNotification(d.id)).toBe(false);
  });

  it('reports an expired code as invalid', async () => {
    const repo = new InMemoryDiscountRepository();
    const svc = new DiscountService(repo);

    // Created through the repository directly: createDiscountSchema refuses a
    // past expiry, which is correct for the API but blocks this fixture.
    await repo.create({
      ...percentageCode(),
      expiresAt: new Date(Date.now() - 1000),
      createdBy: 'admin-1',
    } as never);

    await expect(svc.validateCode(redemption())).resolves.toMatchObject({
      valid: false,
      message: 'Discount code has expired',
    });
  });
});
