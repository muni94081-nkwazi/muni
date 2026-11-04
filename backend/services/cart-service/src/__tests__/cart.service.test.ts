import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Replaces a suite that imported '../cart.service.js' and mocked '../redis.js'
// — neither path exists (the service lives under src/services/, redis under
// src/utils/), so it had never run. These test the CartService that ships.
//
// Redis is mocked with a plain in-memory map: the behaviour under test is the
// cart arithmetic and item merging, not the client.

const store = new Map<string, string>();

const mockRedis = {
  get: jest.fn<(key: string) => Promise<string | null>>(async (key) => store.get(key) ?? null),
  set: jest.fn<(...args: any[]) => Promise<string>>(async (key: string, value: string) => {
    store.set(key, value);
    return 'OK';
  }),
  del: jest.fn<(key: string) => Promise<number>>(async (key) => (store.delete(key) ? 1 : 0)),
};

jest.unstable_mockModule('../utils/redis.js', () => ({ redis: mockRedis }));

// discount-service is mocked at the client boundary — what is under test is
// how the cart reacts to each verdict, not the HTTP call itself.
const quote = jest.fn<(...args: any[]) => Promise<any>>(
  async () => ({ outcome: "unavailable", reason: "not stubbed" }),
);
jest.unstable_mockModule("../clients/discount.client.js", () => ({ quoteCoupon: quote }));

// product-service, likewise at the client boundary. `null` is the "could not
// ask" answer, which is what every existing test in this file gets — those
// cases are about cart arithmetic and must keep behaving as they did.
const stockFor = jest.fn<(...args: any[]) => Promise<number | null>>(async () => null);
jest.unstable_mockModule('../clients/catalog.client.js', () => ({ availableStockFor: stockFor }));

type CartModule = typeof import('../services/cart.service.js');
let CartService: CartModule['CartService'];
let cart: InstanceType<CartModule['CartService']>;

/** Item payload as addItem expects it — no id/addedAt, those are generated. */
function item(overrides: Record<string, unknown> = {}) {
  return {
    productId: 'prod-1',
    variantId: 'var-1',
    name: 'Ugandan Honey 500g',
    price: 15_000,
    quantity: 1,
    maxQuantity: 10,
    image: null,
    sellerId: 'seller-1',
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(async () => {
  jest.clearAllMocks();
  store.clear();
  ({ CartService } = await import('../services/cart.service.js'));
  cart = new CartService();
});

describe('getCart', () => {
  it('returns an empty cart for a user who has none, rather than null', () => {
    // The controller relies on always getting a cart shape back.
    return cart.getCart('user-1').then((result) => {
      expect(result.userId).toBe('user-1');
      expect(result.items).toEqual([]);
      expect(result.subtotal).toBe(0);
      expect(result.itemCount).toBe(0);
    });
  });

  it('round-trips a saved cart', async () => {
    await cart.addItem('user-1', item());
    const reloaded = await cart.getCart('user-1');
    expect(reloaded.items).toHaveLength(1);
  });
});

describe('addItem', () => {
  it('adds a new line and recalculates the totals', async () => {
    const result = await cart.addItem('user-1', item({ quantity: 2 }));

    expect(result.items).toHaveLength(1);
    expect(result.itemCount).toBe(2);
    expect(result.subtotal).toBe(30_000);
    expect(result.items[0].id).toBeTruthy();
  });

  it('merges quantity into an existing line for the same product and variant', async () => {
    await cart.addItem('user-1', item({ quantity: 2 }));
    const result = await cart.addItem('user-1', item({ quantity: 3 }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(5);
  });

  it('keeps a different variant of the same product as a separate line', async () => {
    await cart.addItem('user-1', item({ variantId: 'var-1' }));
    const result = await cart.addItem('user-1', item({ variantId: 'var-2' }));

    expect(result.items).toHaveLength(2);
  });

  /**
   * The service used to clamp with Math.min — and only here, on the merge
   * branch. A first add was unbounded: 5,012 of a 12-stock variant stored
   * 5,012, verified live. Refusing is now the contract on both paths, so the
   * shopper is told rather than quietly given a different basket.
   */
  it('refuses a merge that would exceed the ceiling, and leaves the line alone', async () => {
    await cart.addItem('user-1', item({ quantity: 8, maxQuantity: 10 }));

    await expect(
      cart.addItem('user-1', item({ quantity: 8, maxQuantity: 10 })),
    ).rejects.toMatchObject({ status: 422 });

    const after = await cart.getCart('user-1');
    expect(after.items[0].quantity).toBe(8);
  });

  it('refuses a FIRST add above the ceiling — the path that was unbounded', async () => {
    await expect(
      cart.addItem('user-1', item({ quantity: 5012, maxQuantity: 12 })),
    ).rejects.toMatchObject({ status: 422 });

    const after = await cart.getCart('user-1');
    expect(after.items).toHaveLength(0);
  });

  it('allows a merge that lands exactly on the ceiling', async () => {
    await cart.addItem('user-1', item({ quantity: 6, maxQuantity: 10 }));
    const result = await cart.addItem('user-1', item({ quantity: 4, maxQuantity: 10 }));

    expect(result.items[0].quantity).toBe(10);
  });

  it('says how many are available in the refusal', async () => {
    await expect(
      cart.addItem('user-1', item({ quantity: 99, maxQuantity: 3 })),
    ).rejects.toThrow(/Only 3 of this item/);
  });

  it('refreshes the stored price when a line is re-added', async () => {
    await cart.addItem('user-1', item({ price: 15_000 }));
    const result = await cart.addItem('user-1', item({ price: 17_500 }));

    expect(result.items[0].price).toBe(17_500);
  });
});

// ─── How many the basket will actually hold ───────────────────────────────────
//
// The bound came from `maxQuantity` in the request body — the browser's own
// number. Live against a 3-stock variant, a request carrying
// `maxQuantity: 99` put 99 in the basket. product-service is now asked what
// is really there.

describe('quantity is bounded by the catalogue, not by the browser', () => {
  beforeEach(() => { stockFor.mockReset().mockResolvedValue(null); });

  it('refuses more than the catalogue actually has', async () => {
    stockFor.mockResolvedValue(3);

    await expect(cart.addItem('user-1', item({ quantity: 99, maxQuantity: 99 })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('names the real figure, not the one the client sent', async () => {
    stockFor.mockResolvedValue(3);

    const err = await cart.addItem('user-1', item({ quantity: 99, maxQuantity: 99 })).catch((e) => e);
    expect(err.maxQuantity).toBe(3);
    expect(err.message).toContain('3');
  });

  it('allows exactly what is in stock', async () => {
    stockFor.mockResolvedValue(3);

    const result = await cart.addItem('user-1', item({ quantity: 3, maxQuantity: 99 }));
    expect(result.items[0].quantity).toBe(3);
  });

  it('counts what is already in the basket towards the bound', async () => {
    stockFor.mockResolvedValue(3);

    await cart.addItem('user-1', item({ quantity: 2, maxQuantity: 99 }));
    await expect(cart.addItem('user-1', item({ quantity: 2, maxQuantity: 99 })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('ignores a generous maxQuantity the client supplied', async () => {
    stockFor.mockResolvedValue(1);

    await expect(cart.addItem('user-1', item({ quantity: 50, maxQuantity: 99999 })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('bounds a quantity change the same way', async () => {
    stockFor.mockResolvedValue(10);
    const added = await cart.addItem('user-1', item({ quantity: 1, maxQuantity: 99 }));

    stockFor.mockResolvedValue(2);
    await expect(cart.updateItemQuantity('user-1', added.items[0].id, 5))
      .rejects.toMatchObject({ status: 422 });
  });

  it('lets the add through when the catalogue cannot be reached', async () => {
    // A slow peer must not break Add to Cart. The binding check is the
    // reservation at checkout, which is not optional.
    stockFor.mockResolvedValue(null);

    const result = await cart.addItem('user-1', item({ quantity: 4, maxQuantity: 10 }));
    expect(result.items[0].quantity).toBe(4);
  });

  it('still honours the client bound when the catalogue cannot be reached', async () => {
    stockFor.mockResolvedValue(null);

    await expect(cart.addItem('user-1', item({ quantity: 11, maxQuantity: 10 })))
      .rejects.toMatchObject({ status: 422 });
  });
});

describe('updateItemQuantity', () => {
  it('removes the line when quantity is set to zero', async () => {
    const added = await cart.addItem('user-1', item());
    const result = await cart.updateItemQuantity('user-1', added.items[0].id, 0);

    expect(result.items).toHaveLength(0);
    expect(result.subtotal).toBe(0);
  });

  it('refuses an increase above the ceiling instead of clamping it', async () => {
    const added = await cart.addItem('user-1', item({ maxQuantity: 5 }));

    await expect(
      cart.updateItemQuantity('user-1', added.items[0].id, 99),
    ).rejects.toMatchObject({ status: 422 });

    const after = await cart.getCart('user-1');
    expect(after.items[0].quantity).toBe(1);
  });

  it('allows an increase up to the ceiling', async () => {
    const added = await cart.addItem('user-1', item({ maxQuantity: 5 }));
    const result = await cart.updateItemQuantity('user-1', added.items[0].id, 5);

    expect(result.items[0].quantity).toBe(5);
  });

  it('ignores an unknown item id without corrupting the cart', async () => {
    await cart.addItem('user-1', item());
    const result = await cart.updateItemQuantity('user-1', 'no-such-item', 5);

    expect(result.items).toHaveLength(1);
  });
});

describe('removeItem and clearCart', () => {
  it('removes a single line and recalculates', async () => {
    const added = await cart.addItem('user-1', item({ quantity: 2 }));
    const result = await cart.removeItem('user-1', added.items[0].id);

    expect(result.items).toHaveLength(0);
    expect(result.itemCount).toBe(0);
  });

  it('clears the whole cart from storage', async () => {
    await cart.addItem('user-1', item());
    await cart.clearCart('user-1');

    expect(mockRedis.del).toHaveBeenCalledWith('cart:user-1');
    const after = await cart.getCart('user-1');
    expect(after.items).toEqual([]);
  });
});

describe('coupons', () => {
  it('shows what discount-service says the code is worth', async () => {
    // Not a flat 10% of whatever is in the basket. The old stub applied
    // `subtotal * 0.1` to any string the customer typed, so every code
    // "worked", every code was worth the same, and checkout honoured none of
    // it.
    quote.mockResolvedValue({ outcome: 'applied', amount: 2_500 });

    await cart.addItem('user-1', item({ quantity: 2 }));      // 30,000
    const result = await cart.applyCoupon('user-1', 'SAVE10');

    expect(result.couponCode).toBe('SAVE10');
    expect(result.couponDiscount).toBe(2_500);
  });

  it('asks about the basket that is actually there', async () => {
    quote.mockResolvedValue({ outcome: 'applied', amount: 1_000 });

    await cart.addItem('user-1', item({ quantity: 2 }));
    await cart.applyCoupon('user-1', 'SAVE10');

    const [code, userId, items, subtotal] = quote.mock.calls.at(-1)!;
    expect(code).toBe('SAVE10');
    expect(userId).toBe('user-1');
    expect(subtotal).toBe(30_000);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: 'prod-1', sellerId: 'seller-1', quantity: 2 });
  });

  it('re-asks when the cart changes rather than rescaling the old answer', async () => {
    quote.mockResolvedValue({ outcome: 'applied', amount: 3_000 });
    await cart.addItem('user-1', item({ quantity: 2 }));
    await cart.applyCoupon('user-1', 'SAVE10');

    quote.mockResolvedValue({ outcome: 'applied', amount: 6_000 });
    const result = await cart.addItem('user-1', item({ quantity: 2 }));   // now 4 × 15,000

    expect(result.couponDiscount).toBe(6_000);
    expect(quote.mock.calls.at(-1)![3]).toBe(60_000);
  });

  it('never lets a coupon exceed the basket', async () => {
    quote.mockResolvedValue({ outcome: 'applied', amount: 999_999 });

    await cart.addItem('user-1', item({ quantity: 1 }));       // 15,000
    const result = await cart.applyCoupon('user-1', 'HUGE');

    expect(result.couponDiscount).toBe(15_000);
  });

  it('drops a code discount-service rejects, and says why', async () => {
    quote.mockResolvedValue({ outcome: 'rejected', reason: 'Discount code has expired' });

    await cart.addItem('user-1', item());
    const result = await cart.applyCoupon('user-1', 'EXPIRED');

    expect(result.couponCode).toBeUndefined();
    expect(result.couponDiscount).toBe(0);
    expect(result.couponMessage).toBe('Discount code has expired');
  });

  it('keeps the code but shows no discount when the service cannot be reached', async () => {
    // The network is not a verdict on the code. Dropping it here would make a
    // blip cost the customer a coupon they are entitled to; checkout asks
    // again before charging.
    quote.mockResolvedValue({ outcome: 'unavailable', reason: 'timed out after 2000ms' });

    await cart.addItem('user-1', item());
    const result = await cart.applyCoupon('user-1', 'SAVE10');

    expect(result.couponCode).toBe('SAVE10');
    expect(result.couponDiscount).toBe(0);
    expect(result.couponMessage).toMatch(/could not check/i);
  });

  it('clears the message once a code applies again', async () => {
    quote.mockResolvedValue({ outcome: 'unavailable', reason: 'down' });
    await cart.addItem('user-1', item());
    await cart.applyCoupon('user-1', 'SAVE10');

    quote.mockResolvedValue({ outcome: 'applied', amount: 500 });
    const result = await cart.addItem('user-1', item({ productId: 'prod-2' }));

    expect(result.couponMessage).toBeUndefined();
    expect(result.couponDiscount).toBe(500);
  });

  it('clears the discount when the coupon is removed', async () => {
    quote.mockResolvedValue({ outcome: 'applied', amount: 3_000 });
    await cart.addItem('user-1', item({ quantity: 2 }));
    await cart.applyCoupon('user-1', 'SAVE10');

    const result = await cart.removeCoupon('user-1');

    expect(result.couponCode).toBeUndefined();
    expect(result.couponDiscount).toBe(0);
  });

  it('does not call discount-service for a cart with no coupon', async () => {
    await cart.addItem('user-1', item());

    expect(quote).not.toHaveBeenCalled();
  });

  it('does not spend a round trip on an empty basket, and keeps the code', async () => {
    quote.mockResolvedValue({ outcome: 'applied', amount: 3_000 });
    await cart.addItem('user-1', item());
    const applied = await cart.applyCoupon('user-1', 'SAVE10');
    quote.mockClear();

    const result = await cart.updateItemQuantity('user-1', applied.items[0].id, 0);

    expect(result.items).toEqual([]);
    expect(result.couponCode).toBe('SAVE10');
    expect(result.couponDiscount).toBe(0);
    expect(quote).not.toHaveBeenCalled();
  });

  it('trims a code so a stray space cannot be stored', async () => {
    quote.mockResolvedValue({ outcome: 'applied', amount: 100 });
    await cart.addItem('user-1', item());

    const result = await cart.applyCoupon('user-1', '  SAVE10  ');

    expect(result.couponCode).toBe('SAVE10');
    expect(quote.mock.calls.at(-1)![0]).toBe('SAVE10');
  });
});

describe('mergeCart', () => {
  it('folds guest items into the signed-in cart', async () => {
    await cart.addItem('user-1', item({ productId: 'prod-1', quantity: 1 }));

    const result = await cart.mergeCart('user-1', [
      item({ id: 'guest-1', productId: 'prod-2', variantId: 'var-9', quantity: 2, addedAt: new Date().toISOString() }),
    ]);

    expect(result.items).toHaveLength(2);
  });

  it('combines quantities when the guest held the same line', async () => {
    // This is the sign-in path: whatever the guest had must not silently
    // replace or duplicate what the account already held.
    await cart.addItem('user-1', item({ quantity: 1 }));

    const result = await cart.mergeCart('user-1', [
      item({ id: 'guest-1', quantity: 2, addedAt: new Date().toISOString() }),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(3);
  });
});
