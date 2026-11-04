import { beforeEach, describe, it, expect } from '@jest/globals';
import {
  scoreTransaction,
  listCases,
  listAllCases,
  getCase,
  getStats,
  updateCase,
  setFraudRepository,
} from '../services/fraud.service.js';
import { MemoryFraudRepository } from '../repositories/memory-fraud.repository.js';

// Assessments are stored through a repository now; point the module at the
// in-memory one so these run without a database.
let repo: MemoryFraudRepository;

beforeEach(() => {
  repo = new MemoryFraudRepository();
  setFraudRepository(repo);
});

// This suite replaces one written against a `rules-engine.js` module that was
// never built — it imported a non-existent path, so it had never run.
// These test the scoring rules that actually ship in fraud.service.ts.

/** A transaction with no risk signals; each test turns on only what it exercises. */
function clean(overrides: Record<string, unknown> = {}) {
  return {
    orderId: `order-${Math.random().toString(36).slice(2)}`,
    // Old enough not to trip NEW_ACCOUNT.
    accountCreatedAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    // Deliberately not a round number: a whole-currency amount scores 5.
    amount: 120.5,
    billingAddress: '12 Kampala Road',
    shippingAddress: '12 Kampala Road',
    recentOrdersCount: 0,
    recentFailedPayments: 0,
    cardsUsedCount: 1,
    amountLast24h: 0,
    ...overrides,
  };
}

describe('scoreTransaction — individual rules', () => {
  it('allows a clean transaction with no rules triggered', async () => {
    const result = await scoreTransaction(clean());
    expect(result.score).toBe(0);
    expect(result.decision).toBe('ALLOW');
    expect(result.triggeredRules).toEqual([]);
  });

  it('flags an account less than a week old', async () => {
    const result = await scoreTransaction(
      clean({ accountCreatedAt: new Date(Date.now() - 86_400_000).toISOString() }),
    );
    expect(result.triggeredRules).toContain('NEW_ACCOUNT');
    expect(result.score).toBe(30);
  });

  it('flags a high-value order above 500', async () => {
    const result = await scoreTransaction(clean({ amount: 600.5 }));
    expect(result.triggeredRules).toContain('HIGH_VALUE_ORDER');
  });

  it('flags a billing/shipping address mismatch', async () => {
    const result = await scoreTransaction(clean({ shippingAddress: '9 Jinja Road' }));
    expect(result.triggeredRules).toContain('ADDRESS_MISMATCH');
    expect(result.score).toBe(10);
  });

  it('flags rapid ordering', async () => {
    const result = await scoreTransaction(clean({ recentOrdersCount: 4 }));
    expect(result.triggeredRules).toContain('RAPID_ORDERS');
  });

  it('flags repeated failed payments', async () => {
    const result = await scoreTransaction(clean({ recentFailedPayments: 3 }));
    expect(result.triggeredRules).toContain('FAILED_PAYMENTS');
  });

  it('flags card cycling', async () => {
    const result = await scoreTransaction(clean({ cardsUsedCount: 4 }));
    expect(result.triggeredRules).toContain('MULTIPLE_CARDS');
  });

  it('flags 24-hour spend velocity', async () => {
    const result = await scoreTransaction(clean({ amountLast24h: 1500 }));
    expect(result.triggeredRules).toContain('VELOCITY_CHECK');
  });

  it('flags a suspiciously round amount', async () => {
    // Card testing tends to use whole amounts.
    const result = await scoreTransaction(clean({ amount: 100 }));
    expect(result.triggeredRules).toContain('ROUND_AMOUNT');
  });
});

describe('scoreTransaction — decision thresholds', () => {
  it('allows at or below a score of 30', async () => {
    // NEW_ACCOUNT alone is exactly 30.
    const result = await scoreTransaction(
      clean({ accountCreatedAt: new Date().toISOString() }),
    );
    expect(result.score).toBe(30);
    expect(result.decision).toBe('ALLOW');
  });

  it('sends a transaction for review between 31 and 60', async () => {
    // NEW_ACCOUNT (30) + ADDRESS_MISMATCH (10) = 40.
    const result = await scoreTransaction(
      clean({
        accountCreatedAt: new Date().toISOString(),
        shippingAddress: '9 Jinja Road',
      }),
    );
    expect(result.score).toBe(40);
    expect(result.decision).toBe('REVIEW');
  });

  it('blocks above 60', async () => {
    // NEW_ACCOUNT (30) + FAILED_PAYMENTS (40) = 70.
    const result = await scoreTransaction(
      clean({
        accountCreatedAt: new Date().toISOString(),
        recentFailedPayments: 3,
      }),
    );
    expect(result.score).toBeGreaterThan(60);
    expect(result.decision).toBe('BLOCK');
  });
});

describe('case management', () => {
  it('opens a case only for transactions sent to review', async () => {
    const reviewed = await scoreTransaction(
      clean({
        orderId: 'order-review-me',
        accountCreatedAt: new Date().toISOString(),
        shippingAddress: '9 Jinja Road',
      }),
    );
    expect(reviewed.decision).toBe('REVIEW');

    const cases = await listCases();
    expect(cases.some((c: { orderId: string }) => c.orderId === 'order-review-me')).toBe(true);

    // A blocked transaction is decided, not queued for a human.
    await scoreTransaction(
      clean({
        orderId: 'order-blocked',
        accountCreatedAt: new Date().toISOString(),
        recentFailedPayments: 3,
      }),
    );
    const after = await listCases();
    expect(after.some((c: { orderId: string }) => c.orderId === 'order-blocked')).toBe(false);
  });

  it('records an analyst decision on an open case', async () => {
    await scoreTransaction(
      clean({
        orderId: 'order-to-decide',
        accountCreatedAt: new Date().toISOString(),
        shippingAddress: '9 Jinja Road',
      }),
    );

    const updated = await updateCase('order-to-decide', 'ALLOW');
    expect(updated.decision).toBe('ALLOW');
  });

  it('rejects a decision on a case that does not exist', async () => {
    await expect(updateCase('no-such-order', 'ALLOW')).rejects.toThrow('Not found');
  });

  it('counts every decision in the running stats', async () => {
    const before = { ...(await getStats()) };
    await scoreTransaction(clean({ orderId: 'order-stats-1' }));
    const after = await getStats();
    expect(after.allowed).toBe(before.allowed + 1);
  });
});

describe('persistence', () => {
  function clean2(overrides: Record<string, unknown> = {}) {
    return {
      orderId: 'order-fixed',
      accountCreatedAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      amount: 120.5,
      billingAddress: '12 Kampala Road',
      shippingAddress: '12 Kampala Road',
      recentOrdersCount: 0,
      recentFailedPayments: 0,
      cardsUsedCount: 1,
      amountLast24h: 0,
      ...overrides,
    };
  }

  it('stores every verdict, not only the ones needing review', async () => {
    // The old code kept REVIEW cases and counted the rest as three integers,
    // so a BLOCK could never be explained afterwards.
    await scoreTransaction(clean2({ orderId: 'allowed-1' }));
    await scoreTransaction(clean2({ orderId: 'blocked-1', recentFailedPayments: 3, cardsUsedCount: 4, amountLast24h: 2000 }));

    expect((await getCase('allowed-1'))!.decision).toBe('ALLOW');
    expect((await getCase('blocked-1'))!.decision).toBe('BLOCK');
    expect(await listAllCases()).toHaveLength(2);
  });

  it('puts only REVIEW cases in the queue', async () => {
    await scoreTransaction(clean2({ orderId: 'allowed-1' }));
    await scoreTransaction(clean2({ orderId: 'review-1', shippingAddress: '9 Jinja Road', recentOrdersCount: 4 }));

    const queue = await listCases();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.orderId).toBe('review-1');
  });

  it('records which rules fired so a decision can be explained', async () => {
    await scoreTransaction(clean2({ orderId: 'order-x', shippingAddress: '9 Jinja Road' }));

    const stored = await getCase('order-x');
    expect(stored!.triggeredRules).toContain('ADDRESS_MISMATCH');
  });

  it('re-scoring an order replaces its verdict rather than adding a second', async () => {
    await scoreTransaction(clean2({ orderId: 'order-y' }));
    await scoreTransaction(clean2({ orderId: 'order-y', recentOrdersCount: 4, shippingAddress: '9 Jinja Road' }));

    expect(await listAllCases()).toHaveLength(1);
    expect((await getCase('order-y'))!.decision).toBe('REVIEW');
  });

  it('stats follow the current decisions, including after a human overrules', async () => {
    await scoreTransaction(clean2({ orderId: 'review-1', shippingAddress: '9 Jinja Road', recentOrdersCount: 4 }));
    expect(await getStats()).toEqual({ allowed: 0, reviewed: 1, blocked: 0 });

    await updateCase('review-1', 'ALLOW', 'ops-1');

    // The old counters were incremented at scoring time and never adjusted, so
    // a reviewed-and-allowed order stayed counted as REVIEW forever.
    expect(await getStats()).toEqual({ allowed: 1, reviewed: 0, blocked: 0 });
  });

  it('records who overruled the engine and when', async () => {
    await scoreTransaction(clean2({ orderId: 'review-1', shippingAddress: '9 Jinja Road', recentOrdersCount: 4 }));

    const updated = await updateCase('review-1', 'BLOCK', 'ops-1');
    expect(updated.reviewedBy).toBe('ops-1');
    expect(updated.reviewedAt).toBeDefined();
  });

  it('throws Not found for an unknown order, as before', async () => {
    await expect(updateCase('nope', 'ALLOW')).rejects.toThrow('Not found');
  });
});
