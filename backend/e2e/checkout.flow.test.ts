import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { randomUUID } from 'node:crypto';

import {
  http,
  auth,
  expectStatus,
  pollUntil,
  postSignedWebhook,
  webhookSecret,
  GATEWAY_URL,
} from './support/client.js';
import {
  resetTransactionalData,
  setVariantStock,
  clearCart,
  stackIsUp,
} from './support/db.js';
import {
  seedAdmin,
  seedSeller,
  seedProduct,
  registerUser,
  type TestUser,
  type SeededProduct,
} from './support/seed.js';

const UNIT_PRICE = 20_000;
const START_STOCK = 10;
const BUY_QTY = 2;
const EXPECTED_STOCK_AFTER = START_STOCK - BUY_QTY;   // 8
const EXPECTED_SUBTOTAL = UNIT_PRICE * BUY_QTY;       // 40 000

const SHIPPING = {
  address: 'Plot 42, Kampala Road',
  city: 'Kampala',
  district: 'Kampala',
  phone: '+256770000000',
};

let admin: TestUser;
let seller: TestUser;
let buyer: TestUser;
let product: SeededProduct;

// The stack takes minutes to come up; seeding walks the seller-verification and
// product-moderation flows through real HTTP.
jest.setTimeout(180_000);

beforeAll(async () => {
  if (!stackIsUp()) {
    throw new Error(
      '[e2e] the compose stack is not running.\n' +
      '      Start it with:  docker compose --profile services up -d\n' +
      '      and wait for healthchecks before running this suite.',
    );
  }

  const health = await http.get('/health', { baseURL: GATEWAY_URL });
  if (health.status >= 500) {
    throw new Error(`[e2e] gateway at ${GATEWAY_URL} is not healthy: ${health.status}`);
  }

  resetTransactionalData();

  admin = await seedAdmin();
  seller = await seedSeller(admin);
  product = await seedProduct(seller, admin, UNIT_PRICE, START_STOCK);
  buyer = await registerUser('buyer');
});

afterAll(() => {
  // Orders, payments, escrow, reservations and the cart go; the seeded seller
  // and product stay, so a re-run does not repeat the slow verification and
  // moderation steps.
  if (!stackIsUp()) return;
  if (buyer) clearCart(buyer.userId);
  resetTransactionalData();
  if (product) setVariantStock(product.variantId, START_STOCK);
});

describe('a customer completes a purchase', () => {
  it('runs the whole money path end to end', async () => {
    // ── 1. The seeded product is visible in the catalogue ───────────────────
    const catalogue = await http.get(`/products/${product.productId}`);
    expectStatus(catalogue, 200, 'product is publicly visible');
    expect(catalogue.data.data.id).toBe(product.productId);

    // ── 2. Stock starts where we put it ─────────────────────────────────────
    // Read through the seller-namespaced route. This 404'd until
    // inventory-service registered /api/v1/seller/inventory/* as an alias
    // (src/routes/paths.ts): the gateway forwards req.originalUrl verbatim, so
    // a seller's request arrives under /seller and nothing matched. Exercising
    // the aliased path here is what keeps that fix honest.
    const stockBefore = await http.get(
      `/seller/inventory/${product.variantId}`,
      auth(seller.token),
    );
    expectStatus(stockBefore, 200, 'read starting stock');
    expect(stockBefore.data.data.stock).toBe(START_STOCK);

    // ── 3. Buyer fills a cart ───────────────────────────────────────────────
    const addToCart = await http.post(
      '/cart/items',
      {
        productId: product.productId,
        variantId: product.variantId,
        sellerId: product.sellerId,
        productName: 'E2E Test Widget',
        productImage: 'https://cdn.muni.test/widget.png',
        // Deliberately wrong. checkout re-prices from the catalogue, so this
        // number must not survive into the order — see the total assertion.
        price: 1,
        quantity: BUY_QTY,
        maxQuantity: START_STOCK,
      },
      auth(buyer.token),
    );
    expectStatus(addToCart, [200, 201], 'add to cart');

    // ── 4. Checkout ─────────────────────────────────────────────────────────
    // The route requires an Idempotency-Key; without one it is rejected, which
    // is what stops a double-tap becoming two payments.
    const checkout = await http.post(
      '/checkout/initiate',
      {
        shippingAddress: SHIPPING,
        paymentMethod: { type: 'cod', phone: SHIPPING.phone },
      },
      {
        headers: {
          Authorization: `Bearer ${buyer.token}`,
          'Idempotency-Key': randomUUID(),
        },
      },
    );
    expectStatus(checkout, [200, 201], 'checkout initiate');

    const session = checkout.data.data;
    expect(session.status).toBe('COMPLETED');

    const orderId: string = session.orderId;
    expect(orderId).toBeTruthy();

    // ── 5. The total was computed server-side ───────────────────────────────
    // The cart said the widget cost 1. The catalogue says 20 000.
    expect(session.subtotal).toBe(EXPECTED_SUBTOTAL);
    expect(session.subtotal).not.toBe(BUY_QTY); // the lie the client told

    // ── 6. The order exists and belongs to the buyer ────────────────────────
    const order = await http.get(`/orders/${orderId}`, auth(buyer.token));
    expectStatus(order, 200, 'buyer reads their order');

    const orderBody = order.data.data;
    expect(orderBody.userId).toBe(buyer.userId);
    expect(orderBody.subtotal).toBe(EXPECTED_SUBTOTAL);
    expect(orderBody.items).toHaveLength(1);
    expect(orderBody.items[0].unitPrice).toBe(UNIT_PRICE);
    expect(orderBody.items[0].quantity).toBe(BUY_QTY);
    // The seller on the order comes from the catalogue, not from the cart.
    expect(orderBody.items[0].sellerId).toBe(product.sellerId);

    // ── 7. Inventory was deducted, not merely reserved ──────────────────────
    // The saga deducts as its final step, so this is true as soon as checkout
    // returns. If it is not, the reservation is still open and will expire.
    const stockAfter = await http.get(
      `/seller/inventory/${product.variantId}`,
      auth(seller.token),
    );
    expectStatus(stockAfter, 200, 'read stock after checkout');

    const inventory = stockAfter.data.data;
    expect(inventory.stock).toBe(EXPECTED_STOCK_AFTER);
    // Nothing should still be held: a non-zero `reserved` here means the
    // deduct step did not settle the hold it took.
    expect(inventory.reserved).toBe(0);

    // ── 8. Escrow holds the buyer's money for the right seller ──────────────
    const escrow = await http.get(`/payments/escrow/${orderId}`, auth(buyer.token));
    expectStatus(escrow, 200, 'read escrow holds');

    const holds = escrow.data.data;
    expect(Array.isArray(holds)).toBe(true);
    expect(holds).toHaveLength(1); // one seller in this basket
    expect(holds[0].vendorId).toBe(product.sellerId);
    expect(holds[0].status).toBe('in_escrow');
    // The hold carries the goods subtotal — not shipping or tax, which are not
    // the vendor's money.
    expect(holds[0].amountUGX).toBe(EXPECTED_SUBTOTAL);

    // The reference — the only key a provider webhook resolves a payment by —
    // now comes from an API rather than a hand-written query. It used to exist
    // solely in payment_transactions: the checkout session exposes
    // `paymentIntentId` (the `paymentId` column, a different value) and
    // order-service writes `paymentReference: null`.
    //
    // Keyed on the CHECKOUT SESSION id, not the order id: the saga charges with
    // `orderId: session.id`, so that is what the payment is stored against.
    const payments = await http.get('/payments', {
      ...auth(buyer.token),
      params: { orderId: session.id },
    });
    expectStatus(payments, 200, 'find the payment for this checkout');

    const paymentRef: string = payments.data.data[0].reference;
    expect(paymentRef).toBeTruthy();
    expect(paymentRef).not.toBe(session.paymentIntentId);

    // Signed, because the MTN handler now fails closed. An unsigned POST here
    // used to be accepted — which is exactly the hole this signature closes:
    // the reference is the only thing the callback is keyed on, so an
    // unauthenticated caller who guessed one could settle a stranger's payment.
    const webhook = await postSignedWebhook(
      '/payments/webhooks/mtn',
      { externalId: paymentRef, referenceId: randomUUID(), status: 'SUCCESSFUL' },
      webhookSecret('MTN_MOMO_WEBHOOK_HMAC_SECRET'),
    );
    expectStatus(webhook, 200, 'payment confirmation webhook');

    const balance = await pollUntil(
      "the seller's balance to reflect the settled payment",
      async () => {
        const res = await http.get('/seller/balance', auth(seller.token));
        const data = res.data.data;
        const credited = Number(data?.availableBalance ?? 0) + Number(data?.pendingBalance ?? 0);
        return { done: credited > 0, value: data, state: { status: res.status, body: res.data } };
      },
      { timeoutMs: 30_000 },
    );

    const expectedVendorShare = EXPECTED_SUBTOTAL * 0.875;
    const credited = Number(balance.availableBalance ?? 0) + Number(balance.pendingBalance ?? 0);
    expect(credited).toBeCloseTo(expectedVendorShare, 0);

    const adminOrders = await http.get('/admin/orders', auth(admin.token));
    expectStatus(adminOrders, 200, 'admin lists orders');

    const listed = (adminOrders.data.data as Array<{ id: string }>)
      .find((o) => o.id === orderId);
    expect(listed).toBeDefined();
  });
});

// ─── The boundaries the flow depends on ───────────────────────────────────────

describe('auth boundaries', () => {
  it('refuses checkout without a token', async () => {
    const res = await http.post(
      '/checkout/initiate',
      { shippingAddress: SHIPPING, paymentMethod: { type: 'cod' } },
      { headers: { 'Idempotency-Key': randomUUID() } },
    );
    expect(res.status).toBe(401);
  });

  it('refuses another buyer’s order', async () => {
    const stranger = await registerUser('stranger');
    const res = await http.get(`/orders/${randomUUID()}`, auth(stranger.token));
    // 404 rather than 403: a 403 would confirm the id exists.
    expect([403, 404]).toContain(res.status);
  });

  it('refuses a variant added to someone else’s product', async () => {
    
    const res = await http.post(
      `/products/${product.productId}/variants`,
      { attributes: { size: 'stolen' }, price: 1, stock: 99, lowStockThreshold: 1 },
      auth(buyer.token),
    );
    expect(res.status).toBe(403);
  });

  it('refuses admin routes to a normal customer', async () => {
    const res = await http.get('/admin/orders', auth(buyer.token));
    expect([401, 403]).toContain(res.status);
  });

  it('refuses direct order creation from a browser session', async () => {
    const res = await http.post(
      '/orders',
      { items: [{ variantId: product.variantId, quantity: 1 }], shipping: SHIPPING },
      auth(buyer.token),
    );
    expect([401, 403]).toContain(res.status);
  });
});

describe('distributed tracing', () => {
  it('records a checkout trace spanning the money path', async () => {
    const jaeger = process.env.JAEGER_URL ?? 'http://localhost:16686';

    const res = await http.get('/api/traces', {
      baseURL: jaeger,
      params: { service: 'checkout-service', lookback: '1h', limit: 20 },
    });
    expectStatus(res, 200, 'query Jaeger');

    const traces: Array<{ processes: Record<string, { serviceName: string }> }> = res.data.data;
    expect(traces.length).toBeGreaterThan(0);

    const servicesPerTrace = traces.map(
      (t) => new Set(Object.values(t.processes ?? {}).map((p) => p.serviceName)),
    );
    const widest = servicesPerTrace.reduce(
      (best, s) => (s.size > best.size ? s : best),
      new Set<string>(),
    );

    expect(widest.size).toBeGreaterThanOrEqual(5);
    expect(widest.has('checkout-service')).toBe(true);
  });
});
