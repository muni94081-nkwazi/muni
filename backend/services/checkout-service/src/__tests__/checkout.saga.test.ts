import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { CheckoutSession } from '../models/checkout.model.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────
//
// The saga is defined by which upstream calls it makes, in what order, and
// what it unwinds when one fails — so the double records calls rather than
// stubbing the saga's own internals.

interface RecordedCall { url: string; method: string; body: unknown }
let calls: RecordedCall[] = [];

/** url-substring → response. First match wins, so specific patterns go first. */
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

const savedSessions: CheckoutSession[] = [];
const sessionStore = new Map<string, CheckoutSession>();

jest.unstable_mockModule('../repositories/session.repository.js', () => ({
  sessionRepository: {
    save: jest.fn(async (s: CheckoutSession) => {
      savedSessions.push(JSON.parse(JSON.stringify(s)));
      sessionStore.set(s.id, s);
    }),
    find:       jest.fn(async (id: string) => sessionStore.get(id) ?? null),
    findByUser: jest.fn(async (userId: string) =>
      [...sessionStore.values()].filter((s) => s.userId === userId)),
    // Confirm now takes a lock so a webhook retry, the reconciliation sweep and
    // the customer cannot drive the same session at once. Always granted here:
    // contention is exercised in payment.recovery.test.ts.
    acquireLock:          jest.fn(async () => true),
    releaseLock:          jest.fn(async () => undefined),
    findPendingOlderThan: jest.fn(async () => [] as string[]),
    forgetPending:        jest.fn(async () => undefined),
  },
  connectSessionStore: jest.fn(), disconnectSessionStore: jest.fn(), isSessionStoreReady: () => true,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { runCheckoutSaga, OutOfStockError, PaymentFailedError } = await import('../saga/checkout.saga.js');
const { checkoutService, SessionNotFoundError, InvalidAddressError } = await import('../services/checkout.service.js');
const { sessionRepository } = await import('../repositories/session.repository.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  const now = new Date().toISOString();
  return {
    id: 'sess-1', userId: 'user-1', status: 'INITIATED',
    cartSnapshot: [], shippingAddress: { city: 'Kampala' }, billingAddress: {},
    paymentMethod: { type: 'mtn_momo' },
    subtotal: 0, total: 0, shippingCost: 0, taxAmount: 0, couponDiscount: 0,
    steps: [], createdAt: now, expiresAt: now, updatedAt: now,
    ...overrides,
  } as CheckoutSession;
}

/** Two lines, deliberately out of sorted order so lock ordering is observable. */
function happyRoutes() {
  routes = [
    ['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [
        { productId: 'p2', variantId: 'v-zebra', sellerId: 's1', productName: 'Zebra', quantity: 1 },
        { productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 2 },
      ],
      couponDiscount: 0,
    } } }],
    // Product-nested, matching product-service's real route:
    //   GET /api/v1/products/:id/variants/:variantId
    ['/api/v1/products/p1/variants/v-alpha', { ok: true, status: 200, data: { data: { id: 'v-alpha', price: '1000.00', productId: 'p1' } } }],
    ['/api/v1/products/p2/variants/v-zebra', { ok: true, status: 200, data: { data: { id: 'v-zebra', price: '5000.00', productId: 'p2' } } }],
    // These two doubles used to model shapes their services do not send —
    // `cost` at a path shipping-service did not serve, and `taxAmount` where
    // tax-service returns `totalTax` unwrapped — so the suite agreed with the
    // production bug and stayed green while every real order shipped free and
    // untaxed. They now mirror the real contracts.
    ['shipping/quote',   { ok: true, status: 200, data: { data: { cost: 500, perSeller: { 's-1': 500 } } } }],
    ['tax/calculate',    { ok: true, status: 200, data: { totalTax: 350 } }],
    ['/reserve',         { ok: true, status: 201, data: { data: { reservationId: 'res-x' } } }],
    ['/api/v1/payments', { ok: true, status: 201, data: { data: { paymentId: 'pay-1' } } }],
    ['/api/v1/orders',   { ok: true, status: 201, data: { data: { id: 'ord-1' } } }],
    ['/deduct',          { ok: true, status: 200, data: {} }],
  ];
}

const urlsMatching = (fragment: string) => calls.filter((c) => c.url.includes(fragment));

beforeEach(() => {
  calls = [];
  savedSessions.length = 0;
  sessionStore.clear();
  jest.clearAllMocks();
  happyRoutes();
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('runCheckoutSaga — success', () => {
  it('completes and records every step', async () => {
    const result = await runCheckoutSaga(makeSession());

    expect(result.status).toBe('COMPLETED');
    expect(result.orderId).toBe('ord-1');
    expect(result.steps.map((s) => s.step)).toEqual([
      'PRICE_CART', 'RESERVE_INVENTORY', 'PAYMENT', 'CREATE_ORDER', 'DEDUCT_INVENTORY',
    ]);
  });

  it('prices from the catalogue, not from the cart or the request', async () => {
    // 2 × 1000 + 1 × 5000 = 7000, + 500 shipping + 350 tax = 7850
    const result = await runCheckoutSaga(makeSession({ subtotal: 1, total: 1 }));

    expect(result.subtotal).toBe(7000);
    expect(result.shippingCost).toBe(500);
    expect(result.taxAmount).toBe(350);
    expect(result.total).toBe(7850);
  });

  it('charges the server-computed total, never a client-supplied one', async () => {
    await runCheckoutSaga(makeSession({ subtotal: 1, total: 1 }));

    const payment = urlsMatching('/api/v1/payments')[0];
    expect((payment.body as { amount: number }).amount).toBe(7850);
  });

  it('reserves variants in deterministic sorted order (deadlock avoidance)', async () => {
    await runCheckoutSaga(makeSession());

    const reserved = urlsMatching('/reserve').map((c) => c.url);
    expect(reserved[0]).toContain('v-alpha');
    expect(reserved[1]).toContain('v-zebra');
    expect([...reserved].sort()).toEqual(reserved);
  });

  it('sends a session-derived idempotency key to payment and order', async () => {
    const session = makeSession({ id: 'sess-abc' });
    await runCheckoutSaga(session);

    expect(mockCall).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/payments'),
      expect.objectContaining({ idempotencyKey: 'checkout:sess-abc:payment' }),
    );
    expect(mockCall).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/orders'),
      expect.objectContaining({ idempotencyKey: 'checkout:sess-abc:order' }),
    );
  });

  it('hits the real inventory route shape, not the 404 path', async () => {
    await runCheckoutSaga(makeSession());

    // The old code posted to /api/v1/inventory/reserve, which never matches
    // the service's /api/v1/inventory/:variantId/reserve route.
    for (const c of urlsMatching('/reserve')) {
      expect(c.url).toMatch(/\/api\/v1\/inventory\/[^/]+\/reserve$/);
    }
  });

  it('deducts each reservation after the order exists', async () => {
    await runCheckoutSaga(makeSession());

    expect(urlsMatching('/deduct')).toHaveLength(2);
    const orderIdx  = calls.findIndex((c) => c.url.includes('/api/v1/orders'));
    const deductIdx = calls.findIndex((c) => c.url.includes('/deduct'));
    expect(deductIdx).toBeGreaterThan(orderIdx);
  });

  it('persists progress rather than jumping straight to COMPLETED', async () => {
    await runCheckoutSaga(makeSession());

    const statuses = savedSessions.map((s) => s.status);
    expect(statuses).toContain('VALIDATING');
    expect(statuses).toContain('PAYMENT_PENDING');
    expect(statuses).toContain('ORDER_CREATED');
    expect(statuses[statuses.length - 1]).toBe('COMPLETED');
  });
});

// ─── Compensation ─────────────────────────────────────────────────────────────

describe('runCheckoutSaga — compensation', () => {
  it('releases reservations when payment is declined', async () => {
    routes.unshift(['/api/v1/payments', { ok: false, status: 402, data: { message: 'insufficient funds' } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toBeInstanceOf(PaymentFailedError);

    expect(urlsMatching('/release')).toHaveLength(2);
    expect(urlsMatching('/api/v1/orders')).toHaveLength(0);
  });

  it('refunds and releases when order creation fails after payment', async () => {
    routes.unshift(['/api/v1/orders', { ok: false, status: 500, data: { message: 'order-service down' } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow(/CREATE_ORDER/);

    expect(urlsMatching('/refund')).toHaveLength(1);
    expect(urlsMatching('/release')).toHaveLength(2);
  });

  it('compensates in reverse order — refund before release', async () => {
    routes.unshift(['/api/v1/orders', { ok: false, status: 500, data: {} }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow();

    const refundIdx  = calls.findIndex((c) => c.url.includes('/refund'));
    const releaseIdx = calls.findIndex((c) => c.url.includes('/release'));
    expect(refundIdx).toBeLessThan(releaseIdx);
  });

  it('surfaces a 409 from inventory as OutOfStockError and releases what it holds', async () => {
    // First variant reserves, second is sold out.
    routes.unshift(['v-zebra/reserve', { ok: false, status: 409, data: { message: 'Insufficient stock: only 0 units available' } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toBeInstanceOf(OutOfStockError);

    expect(urlsMatching('/release')).toHaveLength(1);   // the v-alpha hold
    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
  });

  it('never charges when inventory cannot be reserved', async () => {
    routes.unshift(['/reserve', { ok: false, status: 409, data: { message: 'Insufficient stock: only 0 units available' } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow();

    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
  });

  it('marks the session FAILED with a reason', async () => {
    routes.unshift(['/api/v1/payments', { ok: false, status: 402, data: { message: 'card declined' } }]);
    const session = makeSession();

    await expect(runCheckoutSaga(session)).rejects.toThrow();

    expect(session.status).toBe('FAILED');
    expect(session.failureReason).toMatch(/card declined/);
  });

  it('still reports the original failure when a compensation also fails', async () => {
    routes.unshift(['/release',         { ok: false, status: 500, data: {} }]);
    routes.unshift(['/api/v1/payments', { ok: false, status: 402, data: { message: 'declined' } }]);

    // The refund/release failure must not replace the real cause.
    await expect(runCheckoutSaga(makeSession())).rejects.toBeInstanceOf(PaymentFailedError);
  });

  it('rejects an empty cart before touching inventory', async () => {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: { items: [] } } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow(/cart is empty/i);
    expect(urlsMatching('/reserve')).toHaveLength(0);
  });
});

// ─── Pricing integrity ────────────────────────────────────────────────────────

describe('pricing integrity', () => {
  it('ignores the discount amount the cart claims', async () => {
    // The exploit this replaced: cart-service derived `couponDiscount` from
    // client-supplied item prices, so inflating an item's price and applying
    // any string produced an estimate larger than the real subtotal. Checkout
    // trusted it, the clamp floored the goods cost at zero, and the customer
    // paid shipping and tax only.
    //
    // The cart's amount is now never read. With no code on the cart there is
    // no discount at all — not "clamped to the subtotal".
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 1 }],
      couponDiscount: 999_999,
    } } }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
    expect(result.total).toBe(1000 + 500 + 350);   // subtotal + shipping + tax
  });

  it('takes the discount from discount-service, not from the cart', async () => {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 1 }],
      couponCode: 'SAVE10',
      couponDiscount: 999_999,        // the lie
    } } }]);
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: {
      valid: true, discountAmount: 100,
      sellerBreakdown: [{ sellerId: 's1', eligibleAmount: 1000, discountAmount: 100 }],
    } }]);
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: { valid: true } }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(100);       // the truth
    expect(result.total).toBe(1000 - 100 + 500 + 350);
  });

  it('prices the coupon against the RE-PRICED lines', async () => {
    // What discount-service is asked about must be the catalogue basket, not
    // whatever the cart stored.
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 2 }],
      couponCode: 'SAVE10',
    } } }]);
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: {
      valid: true, discountAmount: 200,
      sellerBreakdown: [{ sellerId: 's1', eligibleAmount: 2000, discountAmount: 200 }],
    } }]);
    // Redemption has to succeed for the saga to run to completion: a refused
    // one now aborts the checkout rather than continuing without the coupon.
    // This case is about what discount-service is ASKED at pricing time.
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: { valid: true } }]);

    await runCheckoutSaga(makeSession());

    const body = urlsMatching('discounts/validate')[0].body as {
      orderAmount: number;
      items: Array<{ price: number; quantity: number; sellerId: string }>;
    };
    expect(body.orderAmount).toBe(2000);           // 2 × the catalogue price
    expect(body.items[0].price).toBe(1000);
    expect(body.items[0].sellerId).toBe('s1');
  });

  it('refuses a discount larger than the cart instead of giving the goods away', async () => {
    // This previously clamped to the subtotal — which made the goods free and
    // charged shipping and tax only, the exact shape of the original exploit.
    // A discount bigger than the basket is a broken answer, not a generous
    // one, so the coupon is dropped and the customer pays the real price.
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 1 }],
      couponCode: 'HUGE',
    } } }]);
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: {
      valid: true, discountAmount: 999_999,
      sellerBreakdown: [{ sellerId: 's1', eligibleAmount: 999_999, discountAmount: 999_999 }],
    } }]);
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: { valid: true } }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
    expect(result.total).toBe(1000 + 500 + 350);   // full price, nothing free
    expect(result.status).toBe('COMPLETED');
  });

  it('drops the coupon when the code is rejected', async () => {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 1 }],
      couponCode: 'EXPIRED',
    } } }]);
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: {
      valid: false, message: 'Discount code has expired',
    } }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
    expect(result.status).toBe('COMPLETED');       // an invalid code is not a failure
  });

  it('completes without the discount when discount-service is down', async () => {
    // Degrades like shipping and tax: a discount-service blip must not stop
    // every coupon customer from buying.
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 1 }],
      couponCode: 'SAVE10',
    } } }]);
    routes.unshift(['discounts/validate', { ok: false, status: 503, data: {} }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
    expect(result.status).toBe('COMPLETED');
  });

  it('defaults shipping and tax to 0 when those services are down', async () => {
    routes.unshift(['shipping/quote', { ok: false, status: 503, data: {} }]);
    routes.unshift(['tax/calculate',  { ok: false, status: 503, data: {} }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.shippingCost).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(7000);
  });

  it('prices each line through the product-nested variant route', async () => {
    // The flat /products/variants/:id shape this used to build does not exist
    // on product-service, so every checkout 404'd at the pricing step.
    await runCheckoutSaga(makeSession());

    const lookups = urlsMatching('/variants/').map((c) => c.url);
    expect(lookups).toContain('http://product/api/v1/products/p1/variants/v-alpha');
    expect(lookups).toContain('http://product/api/v1/products/p2/variants/v-zebra');
  });

  it('refuses a cart line whose variant no longer exists', async () => {
    routes.unshift(['/api/v1/products/p1/variants/v-alpha', { ok: false, status: 404, data: {} }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow(/no longer available/);
  });

  it('throws ItemUnavailableError — not a generic failure — on a 404', async () => {
    routes.unshift(['/api/v1/products/p1/variants/v-alpha', { ok: false, status: 404, data: {} }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toMatchObject({
      name:   'ItemUnavailableError',
      status: 409,
    });
    // A line that cannot be priced must never reach inventory or payment.
    expect(urlsMatching('/reserve')).toHaveLength(0);
    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
  });
});

// ─── Coupon redemption ────────────────────────────────────────────────────────

describe('coupon redemption', () => {
  /** A single-line cart carrying a code, with the coupon calls both succeeding. */
  function couponRoutes(discountAmount = 100) {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 1 }],
      couponCode: 'SAVE10',
    } } }]);
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: {
      valid: true, discountAmount,
      sellerBreakdown: [{ sellerId: 's1', eligibleAmount: 1000, discountAmount }],
    } }]);
    routes.unshift(['discounts/apply',    { ok: true, status: 200, data: { valid: true } }]);
  }

  it('consumes the redemption exactly once', async () => {
    couponRoutes();

    const result = await runCheckoutSaga(makeSession());

    expect(urlsMatching('discounts/apply')).toHaveLength(1);
    expect(result.steps.map((s) => s.step)).toContain('APPLY_DISCOUNT');
  });

  it('consumes it after stock is held and before the card is charged', async () => {
    // Earlier would burn the coupon on a checkout that cannot be fulfilled;
    // later would charge a total the redemption had not yet backed.
    couponRoutes();

    await runCheckoutSaga(makeSession());

    const reserveIdx = calls.findIndex((c) => c.url.includes('/reserve'));
    const applyIdx   = calls.findIndex((c) => c.url.includes('discounts/apply'));
    const payIdx     = calls.findIndex((c) => c.url.includes('/api/v1/payments'));
    expect(applyIdx).toBeGreaterThan(reserveIdx);
    expect(applyIdx).toBeLessThan(payIdx);
  });

  it('keys the redemption on the session so a re-driven saga cannot double-spend', async () => {
    couponRoutes();
    await runCheckoutSaga(makeSession({ id: 'sess-redrive' }));
    await runCheckoutSaga(makeSession({ id: 'sess-redrive' }));

    const orderIds = urlsMatching('discounts/apply')
      .map((c) => (c.body as { orderId: string }).orderId);
    expect(orderIds).toEqual(['sess-redrive', 'sess-redrive']);
  });

  it('reverses the redemption when payment is declined', async () => {
    couponRoutes();
    routes.unshift(['/api/v1/payments', { ok: false, status: 402, data: { message: 'declined' } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toBeInstanceOf(PaymentFailedError);

    const reverse = urlsMatching('discounts/reverse');
    expect(reverse).toHaveLength(1);
    expect(reverse[0].body).toMatchObject({ code: 'SAVE10', orderId: 'sess-1' });
  });

  it('reverses the coupon before releasing the stock it was priced against', async () => {
    couponRoutes();
    routes.unshift(['/api/v1/orders', { ok: false, status: 500, data: {} }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow();

    const reverseIdx = calls.findIndex((c) => c.url.includes('discounts/reverse'));
    const releaseIdx = calls.findIndex((c) => c.url.includes('/release'));
    expect(reverseIdx).toBeLessThan(releaseIdx);
  });

  it('does not reverse a coupon on a checkout that completed', async () => {
    couponRoutes();

    const result = await runCheckoutSaga(makeSession());

    expect(result.status).toBe('COMPLETED');
    expect(urlsMatching('discounts/reverse')).toHaveLength(0);
  });

  it('never redeems a code the pricing step rejected', async () => {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [{ productId: 'p1', variantId: 'v-alpha', sellerId: 's1', productName: 'Alpha', quantity: 1 }],
      couponCode: 'EXPIRED',
    } } }]);
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: { valid: false, message: 'expired' } }]);

    await runCheckoutSaga(makeSession());

    expect(urlsMatching('discounts/apply')).toHaveLength(0);
  });

  // ── A coupon that lapses between review and payment ────────────────────────
  //
  // The saga used to add the discount back onto the total, clear the code and
  // charge the higher amount — no prompt, nothing on screen. The customer had
  // reviewed and agreed to a total with the discount in it and was billed more
  // than that. These pin the abort.

  it('refuses to charge more than the customer agreed to', async () => {
    // The code validated at pricing but was spent before the redemption.
    couponRoutes();
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: {
      valid: false, message: 'Usage limit reached',
    } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toMatchObject({ status: 409 });

    // The only thing that matters: no payment was attempted at any price.
    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
  });

  it('names the coupon and what to do, for a message a customer reads', async () => {
    couponRoutes();
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: {
      valid: false, message: 'Usage limit reached',
    } }]);

    await expect(runCheckoutSaga(makeSession()))
      .rejects.toThrow(/no longer available.*review your updated total/is);
  });

  it('releases the inventory it was holding when it aborts', async () => {
    couponRoutes();
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: { valid: false } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow();

    // Step 2 took holds; the compensation stack has to give them back, or the
    // customer's abandoned checkout keeps stock off the shelf until expiry.
    expect(urlsMatching('/release').length).toBeGreaterThan(0);
  });

  it('does not reverse a redemption that never happened', async () => {
    couponRoutes();
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: { valid: false } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow();

    // The reverse compensation is registered only in the success branch.
    expect(urlsMatching('discounts/reverse')).toHaveLength(0);
  });

  it('leaves the session FAILED, not COMPLETED', async () => {
    couponRoutes();
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: { valid: false } }]);

    await runCheckoutSaga(makeSession()).catch(() => undefined);

    const last = savedSessions[savedSessions.length - 1];
    expect(last.status).toBe('FAILED');
  });

  it('does not try to reverse a redemption that was refused', async () => {
    couponRoutes();
    routes.unshift(['discounts/apply',   { ok: true, status: 200, data: { valid: false } }]);
    routes.unshift(['/api/v1/payments',  { ok: false, status: 402, data: { message: 'declined' } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toThrow();

    expect(urlsMatching('discounts/reverse')).toHaveLength(0);
  });

  it('refunds the charge when persisting the confirmed session fails', async () => {
    // The compensation-registration window. `sessionRepository.save` throws
    // when Redis is unavailable, and the refund compensation used to be pushed
    // AFTER that save — so this throw landed in the catch with the money
    // already taken and nothing on the stack to reverse it. Inventory came
    // back, the coupon came back, the charge stayed.
    couponRoutes();

    const save = sessionRepository.save as unknown as {
      mockImplementation: (fn: (s: CheckoutSession) => Promise<void>) => void;
      getMockImplementation: () => (s: CheckoutSession) => Promise<void>;
    };
    const original = save.getMockImplementation();

    save.mockImplementation(async (s: CheckoutSession) => {
      // Only the save that immediately follows the confirmed charge. The
      // catch block's own save (status FAILED) must still succeed, or the
      // test would be asserting against a saga that never finished unwinding.
      if (s.status === 'PAYMENT_CONFIRMED') throw new Error('redis unavailable');
      return original(s);
    });

    try {
      await expect(runCheckoutSaga(makeSession())).rejects.toThrow(/redis unavailable/i);

      // The money is the point of this test.
      expect(urlsMatching('/refund').length).toBeGreaterThan(0);
      // And the rest of the stack still unwound behind it.
      expect(urlsMatching('/release').length).toBeGreaterThan(0);
      expect(urlsMatching('discounts/reverse').length).toBeGreaterThan(0);
    } finally {
      save.mockImplementation(original);
    }
  });

  it('does not call the discount service at all for a cart with no code', async () => {
    await runCheckoutSaga(makeSession());

    expect(urlsMatching('discounts/')).toHaveLength(0);
  });
});

// ─── Per-seller discount attribution ──────────────────────────────────────────
//
// The allocation is computed by discount-service, which owns the promotion
// rules, and validated here against the basket checkout actually priced.
// Checkout is the only party that knows both, so it is the one that decides
// whether the split is usable before binding it into the order.

describe('per-seller discount attribution', () => {
  /** Seller-a holds 2 × 1000; seller-b holds 1 × 5000. */
  function twoSellerCart(couponCode?: string) {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [
        { productId: 'p2', variantId: 'v-zebra', sellerId: 'seller-b', productName: 'Zebra', quantity: 1 },
        { productId: 'p1', variantId: 'v-alpha', sellerId: 'seller-a', productName: 'Alpha', quantity: 2 },
      ],
      ...(couponCode ? { couponCode } : {}),
    } } }]);
  }

  function validateReturns(discountAmount: number, sellerBreakdown: unknown) {
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: {
      valid: true, discountAmount, sellerBreakdown,
    } }]);
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: { valid: true } }]);
  }

  const paymentBody = () => urlsMatching('/api/v1/payments')[0].body as Record<string, any>;
  const orderBody   = () => urlsMatching('/api/v1/orders')[0].body as Record<string, any>;

  it('bills a seller-restricted coupon to that seller alone', async () => {
    twoSellerCart('VENDORA10');
    validateReturns(200, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-b', eligibleAmount: 0,    discountAmount: 0 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(200);
    expect(result.vendorDiscounts).toEqual({ 'seller-a': 200, 'seller-b': 0 });
  });

  it('holds each seller net of their own discount, not the basket average', async () => {
    // seller-b funded none of it, so their escrow hold is untouched. Splitting
    // the 200 across the basket would have taken ~143 off seller-b.
    twoSellerCart('VENDORA10');
    validateReturns(200, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-b', eligibleAmount: 0,    discountAmount: 0 },
    ]);

    await runCheckoutSaga(makeSession());

    expect(paymentBody().vendorBreakdown).toEqual([
      { sellerId: 'seller-a', amountUGX: 1800 },   // 2000 − 200
      { sellerId: 'seller-b', amountUGX: 5000 },   // untouched
    ]);
  });

  it('passes the binding allocation to order-service', async () => {
    twoSellerCart('SPLIT');
    validateReturns(700, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-b', eligibleAmount: 5000, discountAmount: 500 },
    ]);

    await runCheckoutSaga(makeSession());

    expect(orderBody().vendorDiscounts).toEqual({ 'seller-a': 200, 'seller-b': 500 });
    expect(orderBody().discountAmount).toBe(700);
  });

  it('sends a breakdown that sums to the discount being charged', async () => {
    twoSellerCart('SPLIT');
    validateReturns(700, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-b', eligibleAmount: 5000, discountAmount: 500 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    const sum = Object.values(orderBody().vendorDiscounts as Record<string, number>)
      .reduce((t, v) => t + v, 0);
    expect(sum).toBe(result.couponDiscount);
  });

  it('escrow still adds up to the goods the buyer paid for', async () => {
    twoSellerCart('SPLIT');
    validateReturns(700, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-b', eligibleAmount: 5000, discountAmount: 500 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    const held = (paymentBody().vendorBreakdown as Array<{ amountUGX: number }>)
      .reduce((t, v) => t + v.amountUGX, 0);
    expect(held).toBe(result.subtotal - result.couponDiscount);
  });

  it('drops the coupon when the slices do not sum to the total', async () => {
    // discount-service owns the rules, but it is not trusted to be
    // arithmetically consistent with a basket only checkout has priced.
    twoSellerCart('BROKEN');
    validateReturns(700, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 100 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
    expect(result.vendorDiscounts).toEqual({});
    expect(result.status).toBe('COMPLETED');
  });

  it('drops the coupon when a slice names a seller not in the basket', async () => {
    twoSellerCart('GHOST');
    validateReturns(700, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-ghost', eligibleAmount: 5000, discountAmount: 500 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
  });

  it('drops the coupon when a slice exceeds that seller goods', async () => {
    twoSellerCart('TOOBIG');
    validateReturns(3000, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 3000 },
      { sellerId: 'seller-b', eligibleAmount: 0,    discountAmount: 0 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
  });

  it('drops the coupon when discount-service sends no breakdown at all', async () => {
    twoSellerCart('NOBREAKDOWN');
    routes.unshift(['discounts/validate', { ok: true, status: 200, data: {
      valid: true, discountAmount: 200,
    } }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
  });

  it('sends the category so a category-restricted coupon can match', async () => {
    // The variant route carries categoryId now. Without it the item list sent
    // to discount-service had no category at all, so such a coupon matched
    // nothing and quietly evaluated to zero.
    twoSellerCart('CATEGORY');
    routes.unshift(['/api/v1/products/p1/variants/v-alpha', { ok: true, status: 200, data: {
      data: { id: 'v-alpha', price: '1000.00', productId: 'p1', categoryId: 'cat-coffee' },
    } }]);
    validateReturns(200, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-b', eligibleAmount: 0,    discountAmount: 0 },
    ]);

    await runCheckoutSaga(makeSession());

    const sent = urlsMatching('discounts/validate')[0].body as {
      items: Array<{ productId: string; categoryId?: string }>;
    };
    expect(sent.items.find((i) => i.productId === 'p1')?.categoryId).toBe('cat-coffee');
  });

  it('leaves a FREE_SHIPPING coupon off every vendor hold', async () => {
    twoSellerCart('FREESHIP');
    validateReturns(0, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 0 },
      { sellerId: 'seller-b', eligibleAmount: 5000, discountAmount: 0 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.couponDiscount).toBe(0);
    expect(paymentBody().vendorBreakdown).toEqual([
      { sellerId: 'seller-a', amountUGX: 2000 },
      { sellerId: 'seller-b', amountUGX: 5000 },
    ]);
  });

  it('creates nothing at all when the redemption is refused', async () => {
    // This used to assert that the coupon and its per-seller allocation were
    // dropped together and the order went through undiscounted — a seller must
    // not be held net of a discount nobody redeemed. True as far as it went,
    // but it was describing the silent price increase: the customer was billed
    // the undiscounted total they had never agreed to.
    //
    // The allocation still cannot outlive the coupon; it just gets there by not
    // charging at all.
    twoSellerCart('VENDORA10');
    validateReturns(200, [
      { sellerId: 'seller-a', eligibleAmount: 2000, discountAmount: 200 },
      { sellerId: 'seller-b', eligibleAmount: 0,    discountAmount: 0 },
    ]);
    routes.unshift(['discounts/apply', { ok: true, status: 200, data: {
      valid: false, message: 'Usage limit reached',
    } }]);

    await expect(runCheckoutSaga(makeSession())).rejects.toMatchObject({ status: 409 });

    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
    expect(urlsMatching('/api/v1/orders')).toHaveLength(0);
  });

  it('leaves a single-seller basket with no coupon exactly as it was', async () => {
    await runCheckoutSaga(makeSession());

    expect(paymentBody().vendorBreakdown).toEqual([{ sellerId: 's1', amountUGX: 7000 }]);
    expect(orderBody().vendorDiscounts).toEqual({});
  });
});

// ─── Shipping the order records ───────────────────────────────────────────────
//
// order-service charges shipping per sub-order and defaults to 5,000 a seller
// when told nothing. Checkout told it nothing, so a two-seller order recorded
// 10,000 of shipping against a checkout that quoted 500 — the order total
// disagreed with the amount actually charged.

describe('shipping passed to order-service', () => {
  const orderBody = () => urlsMatching('/api/v1/orders')[0].body as Record<string, any>;

  it('sends the shipping this checkout actually quoted', async () => {
    await runCheckoutSaga(makeSession());

    const fees = orderBody().vendorShippingFees as Record<string, number>;
    const sum = Object.values(fees).reduce((t, v) => t + v, 0);
    expect(sum).toBe(500);              // the quote from shipping-service
  });

  it('splits it across sellers so the parts still sum to the quote', async () => {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [
        { productId: 'p2', variantId: 'v-zebra', sellerId: 'seller-b', productName: 'Zebra', quantity: 1 },
        { productId: 'p1', variantId: 'v-alpha', sellerId: 'seller-a', productName: 'Alpha', quantity: 2 },
      ],
    } } }]);

    const result = await runCheckoutSaga(makeSession());

    const fees = orderBody().vendorShippingFees as Record<string, number>;
    expect(Object.keys(fees).sort()).toEqual(['seller-a', 'seller-b']);
    expect(Object.values(fees).reduce((t, v) => t + v, 0)).toBe(result.shippingCost);
  });

  it('never leaves order-service to apply its 5,000-a-seller default', async () => {
    // The default is what produced 10,000 of shipping on a 500 quote.
    await runCheckoutSaga(makeSession());

    expect(orderBody().vendorShippingFees).toBeDefined();
    for (const fee of Object.values(orderBody().vendorShippingFees as Record<string, number>)) {
      expect(fee).not.toBe(5000);
    }
  });

  it('sends zeroes rather than nothing when shipping was not quoted', async () => {
    // shipping-service down degrades the quote to 0. That must travel as an
    // explicit 0, or the default silently reintroduces 5,000 a seller.
    routes.unshift(['shipping/quote', { ok: false, status: 503, data: {} }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.shippingCost).toBe(0);
    const fees = orderBody().vendorShippingFees as Record<string, number>;
    expect(Object.values(fees).reduce((t, v) => t + v, 0)).toBe(0);
  });
});

// ─── Tax passed to order-service ──────────────────────────────────────────────
//
// order-service had no tax concept: master and sub-orders both hardcoded 0. A
// checkout that collected tax recorded an order total short by exactly it.

describe('tax passed to order-service', () => {
  const orderBody = () => urlsMatching('/api/v1/orders')[0].body as Record<string, any>;

  it('sends the tax this checkout actually charged', async () => {
    const result = await runCheckoutSaga(makeSession());

    const taxes = orderBody().vendorTaxes as Record<string, number>;
    expect(Object.values(taxes).reduce((t, v) => t + v, 0)).toBe(result.taxAmount);
    expect(result.taxAmount).toBe(350);
  });

  it('splits it across sellers so the parts still sum to the charge', async () => {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [
        { productId: 'p2', variantId: 'v-zebra', sellerId: 'seller-b', productName: 'Zebra', quantity: 1 },
        { productId: 'p1', variantId: 'v-alpha', sellerId: 'seller-a', productName: 'Alpha', quantity: 2 },
      ],
    } } }]);

    const result = await runCheckoutSaga(makeSession());

    const taxes = orderBody().vendorTaxes as Record<string, number>;
    expect(Object.keys(taxes).sort()).toEqual(['seller-a', 'seller-b']);
    expect(Object.values(taxes).reduce((t, v) => t + v, 0)).toBe(result.taxAmount);
  });

  it('makes the order payload account for every part of the charged total', async () => {
    // subtotal − discount + shipping + tax is what the customer pays, and now
    // every one of those reaches order-service.
    const result = await runCheckoutSaga(makeSession());

    const body   = orderBody();
    const ship   = Object.values(body.vendorShippingFees as Record<string, number>).reduce((t, v) => t + v, 0);
    const tax    = Object.values(body.vendorTaxes as Record<string, number>).reduce((t, v) => t + v, 0);
    const disc   = Object.values(body.vendorDiscounts as Record<string, number>).reduce((t, v) => t + v, 0);

    expect(result.subtotal - disc + ship + tax).toBe(result.total);
  });

  it('sends zeroes when tax-service could not be reached', async () => {
    routes.unshift(['tax/calculate', { ok: false, status: 503, data: {} }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.taxAmount).toBe(0);
    const taxes = orderBody().vendorTaxes as Record<string, number>;
    expect(Object.values(taxes).reduce((t, v) => t + v, 0)).toBe(0);
  });
});

// ─── Settlement linkage ───────────────────────────────────────────────────────
//
// The escrow hold and vendor ledger are written when the payment clears, which
// is before order-service has created anything — so they are keyed on the
// checkout session. Delivery later quotes order-service's real sub-order id.
// Without this step the two never meet and the seller is never paid.

describe('linking settlement to the created order', () => {
  const linkCalls = () => urlsMatching('/sub-orders');
  const linkBody  = () => linkCalls()[0].body as Record<string, any>;

  /** order-service answers with the sub-orders it created. */
  function orderReturnsSubOrders(subOrders: unknown) {
    routes.unshift(['/api/v1/orders', { ok: true, status: 201, data: {
      data: { id: 'ord-1', subOrders },
    } }]);
  }

  it('hands payment-service the real sub-order ids', async () => {
    orderReturnsSubOrders([
      { id: 'suborder-a', sellerId: 's1', vendorShare: 5250, platformCommission: 750 },
    ]);

    const result = await runCheckoutSaga(makeSession());

    expect(linkCalls()).toHaveLength(1);
    expect(linkBody().orderId).toBe('ord-1');
    expect(linkBody().subOrders).toEqual([
      { sellerId: 's1', subOrderId: 'suborder-a', vendorShare: 5250, platformCommission: 750 },
    ]);
    expect(result.status).toBe('COMPLETED');
  });

  it('addresses the link to the payment the money is held under', async () => {
    routes.unshift(['/api/v1/payments', { ok: true, status: 201, data: {
      data: { paymentId: 'pay-1', reference: 'PAY-REF-9' },
    } }]);
    orderReturnsSubOrders([{ id: 'suborder-a', sellerId: 's1', vendorShare: 5250 }]);

    await runCheckoutSaga(makeSession());

    expect(linkCalls()[0].url).toContain('/payments/PAY-REF-9/sub-orders');
  });

  it('passes order-service payout figures rather than recomputing them', async () => {
    // Two services costing one seller's payout is how they drift. The order's
    // numbers are the ones that travel.
    orderReturnsSubOrders([
      { id: 'suborder-a', sellerId: 'seller-a', vendorShare: 1575, platformCommission: 225 },
      { id: 'suborder-b', sellerId: 'seller-b', vendorShare: 4375, platformCommission: 625 },
    ]);

    await runCheckoutSaga(makeSession());

    expect(linkBody().subOrders).toEqual([
      { sellerId: 'seller-a', subOrderId: 'suborder-a', vendorShare: 1575, platformCommission: 225 },
      { sellerId: 'seller-b', subOrderId: 'suborder-b', vendorShare: 4375, platformCommission: 625 },
    ]);
  });

  it('links after the order exists — there are no ids before that', async () => {
    orderReturnsSubOrders([{ id: 'suborder-a', sellerId: 's1' }]);

    await runCheckoutSaga(makeSession());

    const orderIdx = calls.findIndex((c) => c.url.includes('/api/v1/orders'));
    const linkIdx  = calls.findIndex((c) => c.url.includes('/sub-orders'));
    expect(linkIdx).toBeGreaterThan(orderIdx);
  });

  it('records the step so a failure to link is visible', async () => {
    orderReturnsSubOrders([{ id: 'suborder-a', sellerId: 's1' }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.steps.map((s) => s.step)).toContain('LINK_SETTLEMENT');
  });

  it('completes the checkout even when linking fails', async () => {
    // The customer has paid and the order exists. Failing the checkout here
    // would be worse than a settlement record that needs re-linking — but it
    // must not pass silently either.
    orderReturnsSubOrders([{ id: 'suborder-a', sellerId: 's1' }]);
    routes.unshift(['/sub-orders', { ok: false, status: 503, data: { message: 'payment-service down' } }]);

    const result = await runCheckoutSaga(makeSession());

    expect(result.status).toBe('COMPLETED');
    expect(result.orderId).toBe('ord-1');
    const step = result.steps.find((s) => s.step === 'LINK_SETTLEMENT');
    expect(step?.status).toBe('failed');
  });

  it('does not link when order-service reports no sub-orders', async () => {
    orderReturnsSubOrders(undefined);

    await runCheckoutSaga(makeSession());

    expect(linkCalls()).toHaveLength(0);
  });
});

// ─── PAYMENT contract ─────────────────────────────────────────────────────────

describe('the payment-service request', () => {
  const paymentBody = () =>
    urlsMatching('/api/v1/payments')[0].body as Record<string, unknown>;

  it('sends a per-vendor breakdown so escrow opens one hold per seller', async () => {
    // payment-service 400s without either a sellerId or a breakdown, and the
    // saga surfaces that as a declined payment — so this is also what keeps
    // every checkout from failing at the PAYMENT step.
    await runCheckoutSaga(makeSession());

    expect(paymentBody().buyerId).toBe('user-1');
    // Both cart lines belong to s1, so they collapse into a single vendor
    // entry carrying their combined goods subtotal (2 × 1000 + 1 × 5000).
    expect(paymentBody().vendorBreakdown).toEqual([
      { sellerId: 's1', amountUGX: 7000 },
    ]);
  });

  it('splits the breakdown by seller on a multi-vendor cart', async () => {
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [
        { productId: 'p2', variantId: 'v-zebra', sellerId: 'seller-b', productName: 'Zebra', quantity: 1 },
        { productId: 'p1', variantId: 'v-alpha', sellerId: 'seller-a', productName: 'Alpha', quantity: 2 },
      ],
      couponDiscount: 0,
    } } }]);

    await runCheckoutSaga(makeSession());

    // Each seller is owed their own line totals — no single seller carries the
    // whole basket. Sorted, so concurrent upserts lock rows in one order.
    expect(paymentBody().vendorBreakdown).toEqual([
      { sellerId: 'seller-a', amountUGX: 2000 },
      { sellerId: 'seller-b', amountUGX: 5000 },
    ]);
  });

  it('no longer names a single seller for the whole basket', async () => {
    // The removed `escrowSellerFor` workaround picked the first seller and
    // attributed everything to them.
    await runCheckoutSaga(makeSession());
    expect(paymentBody().sellerId).toBeUndefined();
  });

  it('sends a phone number so mobile money has somewhere to prompt', async () => {
    const session = makeSession({
      paymentMethod: { type: 'mtn_momo', phone: '+256770000001' },
      shippingAddress: { city: 'Kampala', phone: '+256780000002' },
    });
    await runCheckoutSaga(session);

    expect(paymentBody().phoneNumber).toBe('+256770000001');
  });

  it('falls back to the delivery phone when no payment number was given', async () => {
    const session = makeSession({
      paymentMethod: { type: 'mtn_momo' },
      shippingAddress: { city: 'Kampala', phone: '+256780000002' },
    });
    await runCheckoutSaga(session);

    expect(paymentBody().phoneNumber).toBe('+256780000002');
  });
});

// ─── CREATE_ORDER contract ────────────────────────────────────────────────────
//
// order-service re-prices every line against the catalogue and ignores any
// monetary field in the body. These lock in the half of that contract this
// service owns: send what order-service cannot derive, and nothing else.

describe('the order-service request', () => {
  interface OrderBody {
    items: Array<{ productId: string; variantId: string; quantity: number; reservationId: string }>;
    shipping: { address: string; city: string; phone: string };
    [key: string]: unknown;
  }

  const orderBody = () => urlsMatching('/api/v1/orders')[0].body as OrderBody;

  it('sends variant, quantity and the reservation it is already holding', async () => {
    await runCheckoutSaga(makeSession());

    const items = orderBody().items;
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.variantId).toBeTruthy();
      expect(item.quantity).toBeGreaterThan(0);
      // Without this, order-service would take a second hold on stock the
      // saga has already reserved — double-reserving every line.
      expect(item.reservationId).toBe('res-x');
    }
  });

  it('sends no prices or totals — order-service is the one that computes them', async () => {
    await runCheckoutSaga(makeSession());

    const body = orderBody();
    for (const field of ['subtotal', 'totalAmount', 'total', 'taxAmount', 'shippingFee']) {
      expect(body[field]).toBeUndefined();
    }
    for (const item of body.items) {
      expect(item).not.toHaveProperty('unitPrice');
      expect(item).not.toHaveProperty('lineTotal');
    }
  });

  it('sends shipping in the shape order-service requires', async () => {
    // order-service 400s on a body without address/city/phone, so the session's
    // address has to be reshaped rather than passed through as shippingAddress.
    const session = makeSession({
      shippingAddress: { address: 'Plot 42', city: 'Kampala', phone: '+256770000000' },
    });
    await runCheckoutSaga(session);

    expect(orderBody().shipping).toMatchObject({
      address: 'Plot 42',
      city:    'Kampala',
      phone:   '+256770000000',
    });
  });
});

// ─── Ownership (C6) ───────────────────────────────────────────────────────────

// ─── Async mobile money: paid-before-fulfilled ────────────────────────────────
//
// A 2xx from /payments/initiate means "the request was accepted", not "the
// customer paid". MTN/Airtel return 201 with PENDING_USER_PIN_PROMPT the moment
// the PIN prompt reaches the handset. The saga used to read only `res.ok` and
// march on — creating the order and deducting real stock for a collection that
// had not happened, with no path that ever reversed it.
describe('mobile money awaiting the customer PIN', () => {
  /** MTN/Airtel: accepted, prompt pushed, customer has not approved yet. */
  function pendingPinPayment() {
    routes = routes.map((route) =>
      route[0] === '/api/v1/payments'
        ? ['/api/v1/payments', { ok: true, status: 201, data: {
            data: { paymentId: 'pay-1', reference: 'PAY-ABC', status: 'pending', providerStatus: 'PENDING_USER_PIN_PROMPT' },
          } }] as [string, { ok: boolean; status: number; data: unknown }]
        : route,
    );
  }

  it('stops at PAYMENT_PENDING instead of claiming the payment confirmed', async () => {
    pendingPinPayment();
    const session = await runCheckoutSaga(makeSession());

    expect(session.status).toBe('PAYMENT_PENDING');
    expect(session.status).not.toBe('PAYMENT_CONFIRMED');
  });

  it('creates no order and deducts no stock for an unpaid collection', async () => {
    pendingPinPayment();
    await runCheckoutSaga(makeSession());

    // The two that actually matter: an order here is a fulfillable order
    // nobody has paid for, and a deduct is stock taken off the shelf for it.
    expect(urlsMatching('/api/v1/orders')).toHaveLength(0);
    expect(urlsMatching('/deduct')).toHaveLength(0);
  });

  it('holds the inventory rather than compensating it away', async () => {
    pendingPinPayment();
    await runCheckoutSaga(makeSession());

    // Nothing failed — the customer is still deciding — so the compensation
    // stack must not run. Releasing here would drop the goods the customer is
    // in the middle of paying for.
    expect(urlsMatching('/release')).toHaveLength(0);
    expect(urlsMatching('/refund')).toHaveLength(0);
  });

  it('records the payment reference so the re-drive can resolve it', async () => {
    pendingPinPayment();
    const session = await runCheckoutSaga(makeSession());

    expect(session.paymentReference).toBe('PAY-ABC');
    expect(session.reservations?.length).toBeGreaterThan(0);
  });

  it('completes the order on re-drive once the collection succeeds', async () => {
    pendingPinPayment();
    const session = await runCheckoutSaga(makeSession());
    expect(session.status).toBe('PAYMENT_PENDING');

    // The webhook (or the pending-payment poller) has since resolved it, so the
    // idempotent replay of /payments/initiate now reports the settled payment.
    routes = routes.map((route) =>
      route[0] === '/api/v1/payments'
        ? ['/api/v1/payments', { ok: true, status: 200, data: {
            data: { paymentId: 'pay-1', reference: 'PAY-ABC', status: 'completed', providerStatus: 'SUCCESSFUL' },
          } }] as [string, { ok: boolean; status: number; data: unknown }]
        : route,
    );

    const completed = await runCheckoutSaga(session);

    expect(completed.status).toBe('COMPLETED');
    expect(urlsMatching('/api/v1/orders')).toHaveLength(1);
  });

  it('reuses the existing holds on re-drive instead of reserving twice', async () => {
    pendingPinPayment();
    const session = await runCheckoutSaga(makeSession());
    const reservesAfterFirstRun = urlsMatching('/reserve').length;
    expect(reservesAfterFirstRun).toBe(2); // one per line

    routes = routes.map((route) =>
      route[0] === '/api/v1/payments'
        ? ['/api/v1/payments', { ok: true, status: 200, data: {
            data: { paymentId: 'pay-1', reference: 'PAY-ABC', status: 'completed', providerStatus: 'SUCCESSFUL' },
          } }] as [string, { ok: boolean; status: number; data: unknown }]
        : route,
    );

    await runCheckoutSaga(session);

    // inventory-service does not deduplicate by sessionId — it inserts a new
    // hold per call — so a re-drive that reserved again would double-count the
    // goods as sold and leak the original hold until its TTL lapsed.
    expect(urlsMatching('/reserve')).toHaveLength(reservesAfterFirstRun);
  });

  it('fails and compensates when the provider declines', async () => {
    routes = routes.map((route) =>
      route[0] === '/api/v1/payments'
        ? ['/api/v1/payments', { ok: true, status: 201, data: {
            data: { paymentId: 'pay-1', reference: 'PAY-ABC', status: 'failed', providerStatus: 'FAILED' },
          } }] as [string, { ok: boolean; status: number; data: unknown }]
        : route,
    );

    // A declined collection is a real failure, unlike a pending one: it must
    // unwind rather than sit waiting for a confirmation that will never come.
    await expect(runCheckoutSaga(makeSession())).rejects.toThrow(PaymentFailedError);
    expect(urlsMatching('/release')).toHaveLength(2);
    expect(urlsMatching('/api/v1/orders')).toHaveLength(0);
  });
});

// ─── Payment methods that are pending by design ───────────────────────────────
//
// Guards the fix above from over-reaching. Cash on delivery is pending until
// the courier collects, and the card/Flutterwave/Pesapal redirect flows are
// pending until the customer returns from the hosted page. Gating on
// `status === 'pending'` rather than the provider status would have stalled
// every one of those orders at PAYMENT_PENDING and created none of them.
describe('payment methods that report pending by design', () => {
  it('still creates the order for cash on delivery', async () => {
    routes = routes.map((route) =>
      route[0] === '/api/v1/payments'
        ? ['/api/v1/payments', { ok: true, status: 201, data: {
            // COD: pending, and deliberately carries no providerStatus.
            data: { paymentId: 'pay-cod', reference: 'PAY-COD', status: 'pending' },
          } }] as [string, { ok: boolean; status: number; data: unknown }]
        : route,
    );

    const session = await runCheckoutSaga(makeSession({ paymentMethod: { type: 'cod' } }));

    expect(session.status).toBe('COMPLETED');
    expect(urlsMatching('/api/v1/orders')).toHaveLength(1);
  });
});

// ─── The delivery address, checked before any money moves ─────────────────────
//
// The address used to be `z.any()`: accepted here, stored, and only rejected by
// order-service at saga step 4 — with stock already held and the customer
// already charged. The saga compensated, so nothing was lost, but the money had
// moved and the client got a 502 instead of being told which field was missing.
//
// These assert on the two things that make that a real difference: the status
// the customer sees, and the fact that nothing upstream was called at all.

describe('an unusable delivery address is refused at the door', () => {
  const buyer = { id: 'user-1', roles: ['ROLE_CUSTOMER'] };

  const good = { address: 'Plot 14, Kira Road', city: 'Kampala', phone: '+256700000000' };

  it('accepts the shape the clients actually send', async () => {
    routes = [
      ['/api/v1/cart', { ok: true, status: 200, data: { data: { items: [] } } }],
    ];
    // An empty cart is a different, later failure — reaching it proves the
    // address itself was accepted.
    await expect(checkoutService.initiateCheckout(buyer, { shippingAddress: good }))
      .rejects.not.toBeInstanceOf(InvalidAddressError);
  });

  it.each([
    ['no street',  { city: 'Kampala', phone: '+256700000000' }],
    ['no city',    { address: 'Plot 14', phone: '+256700000000' }],
    ['no phone',   { address: 'Plot 14', city: 'Kampala' }],
    ['blank city', { address: 'Plot 14', city: '   ', phone: '+256700000000' }],
    ['nothing at all', {}],
  ])('refuses an address with %s', async (_label, shippingAddress) => {
    await expect(checkoutService.initiateCheckout(buyer, { shippingAddress }))
      .rejects.toBeInstanceOf(InvalidAddressError);
  });

  it('refuses a foreign address shape rather than discovering it after payment', async () => {
    // The field names of a different address model. Previously accepted whole.
    const wrongShape = { fullName: 'A Buyer', addressLine1: 'Plot 14', city: 'Kampala', country: 'UG' };

    await expect(checkoutService.initiateCheckout(buyer, { shippingAddress: wrongShape }))
      .rejects.toBeInstanceOf(InvalidAddressError);
  });

  it('answers 400, not 502', async () => {
    const err = await checkoutService.initiateCheckout(buyer, { shippingAddress: {} }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/address|city|phone/i);
  });

  it('takes no hold and charges nothing when the address is unusable', async () => {
    await checkoutService.initiateCheckout(buyer, { shippingAddress: {} }).catch(() => undefined);

    expect(urlsMatching('/reserve')).toHaveLength(0);
    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
    expect(urlsMatching('/api/v1/orders')).toHaveLength(0);
  });
});

// ─── The two quotes that were never actually obtained ─────────────────────────
//
// Both calls were wrong at BOTH ends, and both failures were swallowed by the
// same "non-fatal, default to 0" catch:
//
//   shipping — posted to /api/v1/shipping/quote, a path shipping-service did
//              not serve. 404 on every checkout.
//   tax      — posted { amount, shippingAddress } where tax-service validates
//              { countryCode, items[] }. 422 on every checkout, and the reply
//              was read as `taxAmount` where the service returns `totalTax`.
//
// So every order placed through checkout was delivered free and charged no VAT.
// These assert on the request each service actually receives, because that is
// the half a response double cannot catch.

describe('the shipping quote asks a question shipping-service can answer', () => {
  const shippingBody = () => urlsMatching('shipping/quote')[0].body as Record<string, any>;

  it('sends the destination and the parcel, not the priced lines', async () => {
    await runCheckoutSaga(makeSession());

    const body = shippingBody();
    expect(body.shippingAddress).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    // A courier quote turns on where and what, never on price.
    for (const line of body.items) {
      expect(line).not.toHaveProperty('unitPrice');
      expect(line).not.toHaveProperty('lineTotal');
      expect(line.quantity).toBeGreaterThan(0);
    }
  });

  it('carries the catalogue weight and dimensions through to the quote', async () => {
    routes.unshift(['/api/v1/products/p1/variants/v-alpha', { ok: true, status: 200, data: { data: {
      id: 'v-alpha', price: '1000.00', productId: 'p1',
      weightKg: 2.5, length: 30, width: 20, height: 10,
    } } }]);

    await runCheckoutSaga(makeSession());

    const line = shippingBody().items.find((i: any) => i.weightKg === 2.5);
    expect(line).toBeDefined();
    expect(line.lengthCm).toBe(30);
    expect(line.widthCm).toBe(20);
    expect(line.heightCm).toBe(10);
  });

  it('charges the quoted delivery fee rather than nothing', async () => {
    const result = await runCheckoutSaga(makeSession());
    expect(result.shippingCost).toBe(500);
  });

  it('prefers the split shipping-service quoted over a value-weighted one', async () => {
    routes.unshift(['shipping/quote', { ok: true, status: 200, data: { data: {
      // Deliberately NOT proportional to line value: seller-b's single 5,000
      // item is the light one, seller-a's two 1,000 items are the heavy ones.
      cost: 9000, perSeller: { 'seller-a': 7000, 'seller-b': 2000 },
    } } }]);
    routes.unshift(['/api/v1/cart', { ok: true, status: 200, data: { data: {
      items: [
        { productId: 'p2', variantId: 'v-zebra', sellerId: 'seller-b', productName: 'Zebra', quantity: 1 },
        { productId: 'p1', variantId: 'v-alpha', sellerId: 'seller-a', productName: 'Alpha', quantity: 2 },
      ],
    } } }]);

    await runCheckoutSaga(makeSession());

    const fees = urlsMatching('/api/v1/orders')[0].body as Record<string, any>;
    expect(fees.vendorShippingFees).toEqual({ 'seller-a': 7000, 'seller-b': 2000 });
  });

  it('ignores a split naming a seller who is not on the order', async () => {
    routes.unshift(['shipping/quote', { ok: true, status: 200, data: { data: {
      cost: 500, perSeller: { 'someone-else': 500 },
    } } }]);

    await runCheckoutSaga(makeSession());

    const fees = (urlsMatching('/api/v1/orders')[0].body as Record<string, any>).vendorShippingFees;
    expect(Object.keys(fees)).not.toContain('someone-else');
    expect(Object.values(fees as Record<string, number>).reduce((t, v) => t + v, 0)).toBe(500);
  });
});

describe('the tax quote asks a question tax-service can answer', () => {
  const taxBody = () => urlsMatching('tax/calculate')[0].body as Record<string, any>;

  it('sends countryCode and per-line items, which is what the schema requires', async () => {
    await runCheckoutSaga(makeSession());

    const body = taxBody();
    expect(body.countryCode).toMatch(/^[A-Z]{2}$/);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]).toEqual(expect.objectContaining({
      productId: expect.any(String),
      category:  expect.any(String),
      price:     expect.any(Number),
      quantity:  expect.any(Number),
    }));
    // The shape that earned a 422 on every single checkout.
    expect(body).not.toHaveProperty('amount');
  });

  it('sends the category SLUG, which is what zero-rating is written in', async () => {
    routes.unshift(['/api/v1/products/p1/variants/v-alpha', { ok: true, status: 200, data: { data: {
      id: 'v-alpha', price: '1000.00', productId: 'p1',
      categoryId: 'cmt5wjc520000xs750ensh7yo', categorySlug: 'food',
    } } }]);

    await runCheckoutSaga(makeSession());

    const line = taxBody().items.find((i: any) => i.productId === 'p1');
    // A cuid here matches no rule, so VAT-exempt goods would be charged 18%.
    expect(line.category).toBe('food');
  });

  it('takes the country from the delivery address when it names one', async () => {
    const session = makeSession();
    session.shippingAddress = { ...(session.shippingAddress as object), country: 'tz' };

    await runCheckoutSaga(session);

    expect(taxBody().countryCode).toBe('TZ');
  });

  it('reads totalTax, the field tax-service actually returns', async () => {
    const result = await runCheckoutSaga(makeSession());
    expect(result.taxAmount).toBe(350);
  });

  it('records no tax when the service is genuinely unreachable', async () => {
    routes.unshift(['tax/calculate', { ok: false, status: 503, data: {} }]);

    const result = await runCheckoutSaga(makeSession());
    expect(result.taxAmount).toBe(0);
    // Non-fatal by design: a tax outage must not block a purchase.
    expect(result.status).toBe('COMPLETED');
  });
});

describe('session ownership', () => {
  const owner    = { id: 'user-1', roles: ['ROLE_CUSTOMER'] };
  const attacker = { id: 'user-2', roles: ['ROLE_CUSTOMER'] };
  const admin    = { id: 'admin-1', roles: ['ROLE_ADMIN'] };

  beforeEach(async () => {
    await sessionRepository.save(makeSession({ id: 'sess-owned', userId: 'user-1', status: 'PAYMENT_PENDING' }));
  });

  it('lets the owner read their session', async () => {
    const s = await checkoutService.getSession('sess-owned', owner);
    expect(s.id).toBe('sess-owned');
  });

  it('hides another user\'s session behind a 404, not a 403', async () => {
    // A 403 would confirm the id exists and turn this into an enumeration oracle.
    await expect(checkoutService.getSession('sess-owned', attacker))
      .rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('blocks another user from confirming a checkout', async () => {
    await expect(checkoutService.confirmPayment('sess-owned', attacker))
      .rejects.toBeInstanceOf(SessionNotFoundError);
    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
  });

  it('blocks another user from cancelling a checkout', async () => {
    await expect(checkoutService.cancelCheckout('sess-owned', attacker))
      .rejects.toBeInstanceOf(SessionNotFoundError);

    const untouched = await sessionRepository.find('sess-owned');
    expect(untouched?.status).toBe('PAYMENT_PENDING');
  });

  it('allows admin access for support workflows', async () => {
    const s = await checkoutService.getSession('sess-owned', admin);
    expect(s.userId).toBe('user-1');
  });

  it('scopes history to the actor, ignoring any caller-supplied id', async () => {
    await sessionRepository.save(makeSession({ id: 'sess-other', userId: 'user-2' }));

    const history = await checkoutService.getHistory(owner);
    expect(history.every((s) => s.userId === 'user-1')).toBe(true);
    expect(history.map((s) => s.id)).not.toContain('sess-other');
  });

  it('returns a completed session unchanged on repeat confirm', async () => {
    await sessionRepository.save(makeSession({ id: 'sess-done', userId: 'user-1', status: 'COMPLETED', orderId: 'ord-9' }));

    const result = await checkoutService.confirmPayment('sess-done', owner);

    expect(result.orderId).toBe('ord-9');
    expect(urlsMatching('/api/v1/payments')).toHaveLength(0);
  });
});
