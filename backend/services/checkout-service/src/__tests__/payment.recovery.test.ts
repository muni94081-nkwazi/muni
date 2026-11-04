import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { CheckoutSession } from '../models/checkout.model.js';

/**
 * payment.recovery.test.ts
 *
 * The mobile money lost-order bug, from both ends.
 *
 * When payment-service answers /payments/initiate with providerStatus
 * PENDING_USER_PIN_PROMPT, the saga stops at PAYMENT_PENDING and creates no
 * order (checkout.saga.ts:430-444) — correctly, because the customer has not
 * approved anything yet. The telco confirms minutes later and payment-service
 * publishes `payment.succeeded` (payment-resolution.service.ts:116-138).
 *
 * Nothing was subscribed to it, and the web client had already navigated away.
 * The buyer was charged, the inventory holds lapsed, and no order ever existed.
 *
 * Covered here:
 *   • the consumer turns payment.succeeded into a completed checkout;
 *   • a retried webhook drives the saga once, not twice;
 *   • a payment whose session has expired is reported, not swallowed;
 *   • the sweep confirms a collection whose webhook never arrived, fails one
 *     the provider declined, and leaves an unanswered PIN prompt alone.
 */

// ─── Test doubles ─────────────────────────────────────────────────────────────

interface RecordedCall { url: string; method: string; body: unknown }
let calls: RecordedCall[] = [];
let routes: Array<[string, { ok: boolean; status: number; data: unknown }]> = [];

const mockCall = jest.fn(async (url: string, opts: { method?: string; body?: unknown }) => {
  calls.push({ url, method: opts.method ?? 'GET', body: opts.body });
  const hit = routes.find(([pattern]) => url.includes(pattern));
  if (!hit) return { ok: true, status: 200, data: {} };
  return hit[1];
});

jest.unstable_mockModule('../clients/service.client.js', () => ({
  call: mockCall,
  SERVICES: {
    cart: 'http://cart', product: 'http://product', inventory: 'http://inventory',
    payment: 'http://payment', order: 'http://order', tax: 'http://tax', shipping: 'http://shipping',
  },
  ServiceUnavailableError: class extends Error {},
}));

const sessionStore = new Map<string, CheckoutSession>();
const pendingIndex = new Set<string>();
const locks = new Set<string>();
const forgotten: string[] = [];

jest.unstable_mockModule('../repositories/session.repository.js', () => ({
  sessionRepository: {
    save: jest.fn(async (s: CheckoutSession) => {
      sessionStore.set(s.id, JSON.parse(JSON.stringify(s)));
      if (s.status === 'PAYMENT_PENDING') pendingIndex.add(s.id);
      else pendingIndex.delete(s.id);
    }),
    find: jest.fn(async (id: string) => sessionStore.get(id) ?? null),
    findByUser: jest.fn(async () => []),
    // A real mutual-exclusion double: SET NX semantics, so a second caller is
    // genuinely refused while the first holds it.
    acquireLock: jest.fn(async (id: string) => {
      if (locks.has(id)) return false;
      locks.add(id);
      return true;
    }),
    releaseLock: jest.fn(async (id: string) => { locks.delete(id); }),
    findPendingOlderThan: jest.fn(async () => [...pendingIndex]),
    forgetPending: jest.fn(async (id: string) => {
      pendingIndex.delete(id);
      forgotten.push(id);
    }),
  },
  connectSessionStore: jest.fn(), disconnectSessionStore: jest.fn(), isSessionStoreReady: () => true,
}));

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../utils/logger.js', () => ({ logger }));

/**
 * The saga itself is stubbed.
 *
 * What is under test is who drives it and how often — its internals have their
 * own suite in checkout.saga.test.ts. Completing the session here is what a real
 * run does on a confirmed payment.
 */
const runCheckoutSaga = jest.fn(async (session: CheckoutSession) => {
  const completed: CheckoutSession = {
    ...session,
    status: 'COMPLETED',
    orderId: `order-for-${session.id}`,
  };
  sessionStore.set(session.id, completed);
  pendingIndex.delete(session.id);
  return completed;
});

jest.unstable_mockModule('../saga/checkout.saga.js', () => ({
  runCheckoutSaga,
  OutOfStockError: class extends Error {},
  PaymentFailedError: class extends Error {},
  StepFailedError: class extends Error {},
}));

const { checkoutService } = await import('../services/checkout.service.js');
const { handlePaymentMessage } = await import('../consumers/payment.consumer.js');
const { runReconciliationSweep } = await import('../workers/payment-reconciliation.worker.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function pendingSession(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  const now = new Date().toISOString();
  const session: CheckoutSession = {
    id: 'sess-1',
    userId: 'cust-1',
    status: 'PAYMENT_PENDING',
    cartSnapshot: [],
    shippingAddress: { fullName: 'A', phone: '+256700000000', address: 'Plot 1', city: 'Kampala', country: 'UG' },
    paymentMethod: { type: 'mtn_momo', phone: '+256700000000' },
    paymentReference: 'PAY-REF-1',
    subtotal: 50_000, total: 50_000, shippingCost: 0, taxAmount: 0, couponDiscount: 0,
    vendorDiscounts: {}, vendorShipping: {},
    reservations: [{ variantId: 'v-1', reservationId: 'res-1' }],
    steps: [], createdAt: now, updatedAt: now,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    ...overrides,
  } as CheckoutSession;

  sessionStore.set(session.id, session);
  if (session.status === 'PAYMENT_PENDING') pendingIndex.add(session.id);
  return session;
}

/** The envelope payment-service really publishes. */
function succeededEvent(sessionId: string) {
  return JSON.stringify({
    eventId: 'evt-1',
    eventType: 'payment.succeeded',
    service: 'payment-service',
    occurredAt: new Date().toISOString(),
    // The checkout session id: the saga initiates payment with orderId: session.id.
    data: { paymentId: 'pay-1', orderId: sessionId, reference: 'PAY-REF-1', amount: 50_000 },
  });
}

beforeEach(() => {
  calls = [];
  routes = [];
  sessionStore.clear();
  pendingIndex.clear();
  locks.clear();
  forgotten.length = 0;
  runCheckoutSaga.mockClear();
  logger.error.mockClear();
  logger.warn.mockClear();
});

// ─── The consumer ─────────────────────────────────────────────────────────────

describe('payment.succeeded completes the checkout that was left pending', () => {
  it('creates the order the saga stopped short of', async () => {
    pendingSession();

    await handlePaymentMessage('payment-events', succeededEvent('sess-1'));

    expect(runCheckoutSaga).toHaveBeenCalledTimes(1);
    expect(sessionStore.get('sess-1')!.status).toBe('COMPLETED');
    expect(sessionStore.get('sess-1')!.orderId).toBe('order-for-sess-1');
  });

  it('looks the session up by data.orderId, which is the session id', async () => {
    pendingSession({ id: 'sess-xyz' });

    await handlePaymentMessage('payment-events', succeededEvent('sess-xyz'));

    expect(runCheckoutSaga.mock.calls[0][0].id).toBe('sess-xyz');
  });

  it('ignores events that are not payment.succeeded', async () => {
    pendingSession();

    await handlePaymentMessage('payment-events', JSON.stringify({
      eventType: 'payment.failed', data: { orderId: 'sess-1' },
    }));

    expect(runCheckoutSaga).not.toHaveBeenCalled();
    expect(sessionStore.get('sess-1')!.status).toBe('PAYMENT_PENDING');
  });

  it('does not throw on malformed JSON — one bad message must not stall the topic', async () => {
    await expect(handlePaymentMessage('payment-events', 'not json')).resolves.toBeUndefined();
  });

  it('reports a payment whose session has expired rather than swallowing it', async () => {
    // Nothing seeded: the session TTL'd out before the telco confirmed. This is
    // the unrecoverable case, and the whole point is that it is loud.
    await handlePaymentMessage('payment-events', succeededEvent('sess-gone'));

    expect(runCheckoutSaga).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain('sess-gone');
    expect(logged).toContain('PAY-REF-1');
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('a retried webhook must not drive the same session twice', () => {
  it('runs the saga once for two sequential deliveries', async () => {
    pendingSession();

    await handlePaymentMessage('payment-events', succeededEvent('sess-1'));
    await handlePaymentMessage('payment-events', succeededEvent('sess-1'));

    // The second sees COMPLETED and returns it untouched.
    expect(runCheckoutSaga).toHaveBeenCalledTimes(1);
  });

  it('runs the saga once for two deliveries that arrive together', async () => {
    pendingSession();

    await Promise.all([
      handlePaymentMessage('payment-events', succeededEvent('sess-1')),
      handlePaymentMessage('payment-events', succeededEvent('sess-1')),
    ]);

    // Without the lock both read PAYMENT_PENDING and both run — the check-then-act
    // race that duplicate stock deduction and a second payment call come from.
    expect(runCheckoutSaga).toHaveBeenCalledTimes(1);
  });

  it('releases the lock so a later confirm is still possible', async () => {
    pendingSession();
    await handlePaymentMessage('payment-events', succeededEvent('sess-1'));
    expect(locks.size).toBe(0);
  });

  it('returns the current session to a caller that lost the race, not an error', async () => {
    const session = pendingSession();
    locks.add(session.id); // someone else is mid-confirm

    const result = await checkoutService.confirmPaymentFromSystem('sess-1', 'test');

    expect(result!.id).toBe('sess-1');
    expect(runCheckoutSaga).not.toHaveBeenCalled();
  });
});

// ─── The reconciliation sweep ─────────────────────────────────────────────────

describe('the sweep is the backstop for a webhook that never arrives', () => {
  it('confirms a session whose payment has in fact succeeded', async () => {
    pendingSession();
    routes = [['/status', { ok: true, status: 200, data: { data: { status: 'completed', providerStatus: 'SUCCESSFUL' } } }]];

    const result = await runReconciliationSweep();

    expect(result.confirmed).toBe(1);
    expect(sessionStore.get('sess-1')!.status).toBe('COMPLETED');
  });

  it('queries payment-service by the reference the session recorded', async () => {
    pendingSession();
    routes = [['/status', { ok: true, status: 200, data: { data: { status: 'pending' } } }]];

    await runReconciliationSweep();

    expect(calls[0].url).toContain('PAY-REF-1');
    expect(calls[0].method).toBe('GET');
  });

  it('fails a session the provider declined, and releases its holds', async () => {
    pendingSession();
    routes = [['/status', { ok: true, status: 200, data: { data: { status: 'failed', providerStatus: 'FAILED' } } }]];

    const result = await runReconciliationSweep();

    expect(result.failed).toBe(1);
    expect(sessionStore.get('sess-1')!.status).toBe('FAILED');
    // The stock this checkout was holding goes back on the shelf — the saga's
    // own compensation stack is long gone by this point.
    expect(calls.some((c) => c.url.includes('/inventory/v-1/release'))).toBe(true);
  });

  it('leaves an unanswered PIN prompt alone', async () => {
    pendingSession();
    routes = [['/status', { ok: true, status: 200, data: { data: { status: 'pending', providerStatus: 'PENDING_USER_PIN_PROMPT' } } }]];

    const result = await runReconciliationSweep();

    expect(result.confirmed).toBe(0);
    expect(result.failed).toBe(0);
    expect(sessionStore.get('sess-1')!.status).toBe('PAYMENT_PENDING');
  });

  it('leaves the session pending when payment-service cannot be reached', async () => {
    pendingSession();
    routes = [['/status', { ok: false, status: 503, data: {} }]];

    const result = await runReconciliationSweep();

    // A timeout is not a decline. Failing the checkout here would cancel an
    // order whose payment may have gone through.
    expect(result.failed).toBe(0);
    expect(sessionStore.get('sess-1')!.status).toBe('PAYMENT_PENDING');
  });

  it('reports and drops a pending id whose session has expired', async () => {
    pendingIndex.add('sess-expired'); // indexed, but no session behind it

    const result = await runReconciliationSweep();

    expect(result.orphaned).toBe(1);
    expect(forgotten).toContain('sess-expired');
    expect(JSON.stringify(logger.error.mock.calls)).toContain('sess-expired');
  });
});
