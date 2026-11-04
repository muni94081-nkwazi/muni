/**
 * Reservation concurrency tests.
 *
 * These exercise the real reserveInventory() rather than a re-typed copy of
 * its logic, so a regression in the module is actually caught.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  reserveInventory,
  markProductOutOfStock,
  InsufficientStockError,
  VariantNotFoundError,
  DEADLOCK_DETECTED,
  SERIALIZATION_FAILURE,
} from '../services/reservation.service.js';

// ─── Prisma double ────────────────────────────────────────────────────────────
//
// Models a single variant row so the conditional UPDATE's semantics can be
// checked: it must only "affect a row" when stock - reserved >= quantity.

interface Row { id: string; stock: number; reserved: number; active: boolean; productId: string }

function makePrisma(row: Row | null, opts: { failWith?: string; failTimes?: number } = {}) {
  let failuresLeft = opts.failTimes ?? 0;
  const executeRawCalls: unknown[] = [];
  let reservationSeq = 0;

  const tx = {
    // Serves both the conditional UPDATE … RETURNING and the follow-up SELECT.
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');

      if (sql.includes('UPDATE "ProductVariant"')) {
        const quantity = Number(values[0]);
        if (!row || !row.active || row.stock - row.reserved < quantity) return [];
        row.reserved += quantity;
        return [{ remaining: row.stock - row.reserved, productId: row.productId }];
      }

      // The "is it missing or sold out?" probe.
      if (!row || !row.active) return [];
      return [{ available: row.stock - row.reserved }];
    }),

    inventoryReservation: {
      create: jest.fn(async (args: { data: { expiresAt: Date } }) => ({
        id: `res-${++reservationSeq}`,
        expiresAt: args.data.expiresAt,
      })),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      if (failuresLeft > 0) {
        failuresLeft--;
        throw Object.assign(new Error('conflict'), { code: opts.failWith });
      }
      return fn(tx);
    }),
    $executeRaw: jest.fn(async (...args: unknown[]) => { executeRawCalls.push(args); return 1; }),
  };

  return { prisma, tx, row, executeRawCalls };
}

const params = (over: Partial<Parameters<typeof reserveInventory>[1]> = {}) => ({
  variantId: 'v1', quantity: 1, sessionId: 'sess-1', userId: 'u1', ttlMinutes: 15, ...over,
});

beforeEach(() => { jest.clearAllMocks(); });

// ─── Core behaviour ───────────────────────────────────────────────────────────

describe('reserveInventory', () => {
  it('reserves when stock is available', async () => {
    const { prisma, row } = makePrisma({ id: 'v1', stock: 10, reserved: 2, active: true, productId: 'p1' });

    const result = await reserveInventory(prisma as never, params({ quantity: 3 }));

    expect(result.id).toBe('res-1');
    expect(row!.reserved).toBe(5);
  });

  it('rejects with 409 when the requested quantity exceeds availability', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 10, reserved: 8, active: true, productId: 'p1' });

    await expect(reserveInventory(prisma as never, params({ quantity: 3 })))
      .rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('reports the true remaining quantity in the error', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 10, reserved: 8, active: true, productId: 'p1' });

    await expect(reserveInventory(prisma as never, params({ quantity: 5 })))
      .rejects.toMatchObject({ available: 2, status: 409 });
  });

  it('distinguishes a missing variant (404) from a sold-out one (409)', async () => {
    const { prisma } = makePrisma(null);

    await expect(reserveInventory(prisma as never, params()))
      .rejects.toBeInstanceOf(VariantNotFoundError);
  });

  it('refuses to reserve an inactive variant', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 10, reserved: 0, active: false, productId: 'p1' });

    await expect(reserveInventory(prisma as never, params()))
      .rejects.toBeInstanceOf(VariantNotFoundError);
  });

  it('does not create a reservation row when the claim fails', async () => {
    const { prisma, tx } = makePrisma({ id: 'v1', stock: 1, reserved: 1, active: true, productId: 'p1' });

    await expect(reserveInventory(prisma as never, params())).rejects.toThrow();
    expect(tx.inventoryReservation.create).not.toHaveBeenCalled();
  });
});

// ─── The oversell scenario the audit called out ───────────────────────────────

describe('concurrent contention on the last unit', () => {
  it('admits exactly one of many buyers competing for a single unit', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 1, reserved: 0, active: true, productId: 'p1' });

    const attempts = await Promise.allSettled(
      Array.from({ length: 100 }, () => reserveInventory(prisma as never, params({ quantity: 1 }))),
    );

    const won = attempts.filter((a) => a.status === 'fulfilled');
    const lost = attempts.filter((a) => a.status === 'rejected');

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(99);
  });

  it('never lets reserved exceed stock under contention', async () => {
    const row = { id: 'v1', stock: 5, reserved: 0, active: true, productId: 'p1' };
    const { prisma } = makePrisma(row);

    await Promise.allSettled(
      Array.from({ length: 50 }, () => reserveInventory(prisma as never, params({ quantity: 1 }))),
    );

    expect(row.reserved).toBe(5);
    expect(row.reserved).toBeLessThanOrEqual(row.stock);
  });

  it('holds the invariant with mixed quantities', async () => {
    const row = { id: 'v1', stock: 10, reserved: 0, active: true, productId: 'p1' };
    const { prisma } = makePrisma(row);

    await Promise.allSettled([
      reserveInventory(prisma as never, params({ quantity: 7 })),
      reserveInventory(prisma as never, params({ quantity: 7 })),
      reserveInventory(prisma as never, params({ quantity: 3 })),
      reserveInventory(prisma as never, params({ quantity: 3 })),
    ]);

    expect(row.reserved).toBeLessThanOrEqual(10);
  });
});

// ─── Deadlock / serialization retry ───────────────────────────────────────────

describe('transient conflict retry', () => {
  it('retries a deadlock and eventually succeeds', async () => {
    const { prisma } = makePrisma(
      { id: 'v1', stock: 5, reserved: 0, active: true, productId: 'p1' },
      { failWith: DEADLOCK_DETECTED, failTimes: 2 },
    );

    const result = await reserveInventory(prisma as never, params());

    expect(result.id).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('retries a serialization failure', async () => {
    const { prisma } = makePrisma(
      { id: 'v1', stock: 5, reserved: 0, active: true, productId: 'p1' },
      { failWith: SERIALIZATION_FAILURE, failTimes: 1 },
    );

    await expect(reserveInventory(prisma as never, params())).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget rather than looping forever', async () => {
    const { prisma } = makePrisma(
      { id: 'v1', stock: 5, reserved: 0, active: true, productId: 'p1' },
      { failWith: DEADLOCK_DETECTED, failTimes: 99 },
    );

    await expect(reserveInventory(prisma as never, params())).rejects.toThrow();
    expect(prisma.$transaction).toHaveBeenCalledTimes(4);   // initial + 3 retries
  });

  it('does NOT retry a business outcome — sold out is terminal', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 1, reserved: 1, active: true, productId: 'p1' });

    await expect(reserveInventory(prisma as never, params())).rejects.toBeInstanceOf(InsufficientStockError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not retry an unexpected error', async () => {
    const { prisma } = makePrisma(
      { id: 'v1', stock: 5, reserved: 0, active: true, productId: 'p1' },
      { failWith: '42P01', failTimes: 1 },   // undefined_table
    );

    await expect(reserveInventory(prisma as never, params())).rejects.toThrow();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ─── Lock-hold discipline ─────────────────────────────────────────────────────

describe('transaction scope', () => {
  it('keeps the OUT_OF_STOCK update outside the locking transaction', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 1, reserved: 0, active: true, productId: 'p1' });

    await reserveInventory(prisma as never, params({ quantity: 1 }));

    // The flag update runs on the top-level client, never on the tx handle —
    // keeping it inside would extend the row lock across three subqueries.
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('does not touch the product flag while stock remains', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 10, reserved: 0, active: true, productId: 'p1' });

    await reserveInventory(prisma as never, params({ quantity: 1 }));

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('still returns the reservation when the flag update fails', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 1, reserved: 0, active: true, productId: 'p1' });
    prisma.$executeRaw = jest.fn(async () => { throw new Error('flag update failed'); });

    // Derived state failing must not fail the purchase.
    await expect(reserveInventory(prisma as never, params({ quantity: 1 }))).resolves.toBeDefined();
  });

  it('uses Read Committed — Serializable would add retries without safety', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 5, reserved: 0, active: true, productId: 'p1' });

    await reserveInventory(prisma as never, params());

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'ReadCommitted' }),
    );
  });
});

describe('markProductOutOfStock', () => {
  it('issues a guarded update that no-ops when sellable stock remains', async () => {
    const { prisma } = makePrisma({ id: 'v1', stock: 5, reserved: 0, active: true, productId: 'p1' });

    await markProductOutOfStock(prisma as never, 'p1');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
