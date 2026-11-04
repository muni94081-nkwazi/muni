import { v4 as uuidv4 } from 'uuid';
import { redis } from '../utils/redis.js';
import { Cart, CartItem } from '../models/cart.model.js';
import { quoteCoupon } from '../clients/discount.client.js';
import { availableStockFor } from '../clients/catalog.client.js';
import dotenv from 'dotenv';

dotenv.config();

const CART_TTL = parseInt(process.env.CART_TTL_SECONDS || '86400', 10);

/**
 * A quantity above what the line permits.
 *
 * The service used to silently clamp with `Math.min(quantity, maxQuantity)` —
 * and only on the branch that merged into a line already in the cart. A FIRST
 * add was not bounded at all: asking for 5,012 of a 12-stock variant stored
 * 5,012, verified live. So the behaviour was neither "clamp" nor "reject", it
 * depended on whether the shopper happened to have that item already.
 *
 * Refusing is the honest option of the two. Clamping quietly changes what the
 * customer asked for, and it was never a stock control in any case: the bound
 * comes from `maxQuantity` in the request body, which the browser supplies.
 * Authoritative stock is enforced where it can be trusted — at reservation
 * during checkout.
 */
/**
 * The most of one variant a basket may hold, given what the catalogue has.
 *
 * `maxQuantity` on the request is the browser's own number, so on its own it
 * bounds nothing — a client sending 99999 got 99999, verified live against a
 * 3-stock variant. The catalogue's figure wins where it can be obtained; where
 * it cannot, the client's is all there is, and Add to Cart is not failed over a
 * peer service being slow.
 *
 * Still not a stock control: stock moves between the add and the checkout, and
 * two shoppers can hold the same last unit at once. The binding check is the
 * reservation inside the checkout saga.
 */
async function permittedQuantity(
  productId: string,
  variantId: string | undefined,
  clientMax: number,
): Promise<number> {
  if (!variantId) return clientMax;
  const available = await availableStockFor(productId, variantId);
  return available === null ? clientMax : available;
}

export class CartQuantityError extends Error {
  readonly status = 422;
  constructor(readonly requested: number, readonly maxQuantity: number) {
    super(`Only ${maxQuantity} of this item can be added — you asked for ${requested}.`);
    this.name = 'CartQuantityError';
  }
}

function createEmptyCart(userId: string): Cart {
  return {
    userId,
    items: [],
    couponDiscount: 0,
    subtotal: 0,
    itemCount: 0,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CART_TTL * 1000).toISOString(),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Re-derive the cart's totals, including what its coupon is worth.
 *
 * Asynchronous because the coupon figure now comes from discount-service. It
 * used to be a flat 10% of the subtotal for any code at all, so a customer
 * saw a discount that no service had agreed to and that checkout would not
 * honour.
 *
 * A code that discount-service REJECTS is removed from the cart: leaving it in
 * place would show a coupon worth nothing with no explanation. A code it could
 * not be asked about is kept, because the network is not a verdict on the code
 * — the estimate is simply 0 until the service answers again, and checkout
 * asks once more before charging.
 */
async function recalculateCart(cart: Cart): Promise<Cart> {
  cart.subtotal = round2(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  cart.itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);

  if (!cart.couponCode || cart.items.length === 0) {
    // An empty basket is not worth a round trip, and a coupon on one should
    // survive until the customer has something to spend it on.
    cart.couponDiscount = 0;
    if (!cart.couponCode) delete cart.couponMessage;
  } else {
    const quote = await quoteCoupon(cart.couponCode, cart.userId, cart.items, cart.subtotal);

    if (quote.outcome === 'applied') {
      // Clamped so a coupon can never make the basket worth less than nothing.
      cart.couponDiscount = round2(Math.min(quote.amount, cart.subtotal));
      delete cart.couponMessage;
    } else if (quote.outcome === 'rejected') {
      delete cart.couponCode;
      cart.couponDiscount = 0;
      cart.couponMessage = quote.reason;
    } else {
      cart.couponDiscount = 0;
      cart.couponMessage = 'We could not check this code just now — it will be applied at checkout if it is still valid.';
    }
  }

  cart.updatedAt = new Date().toISOString();
  cart.expiresAt = new Date(Date.now() + CART_TTL * 1000).toISOString();
  return cart;
}

export class CartService {
  private getCartKey(userId: string): string {
    return `cart:${userId}`;
  }

  async getCart(userId: string): Promise<Cart> {
    const key = this.getCartKey(userId);
    const cartStr = await redis.get(key);
    if (!cartStr) {
      return createEmptyCart(userId);
    }
    return JSON.parse(cartStr) as Cart;
  }

  async saveCart(cart: Cart): Promise<void> {
    const key = this.getCartKey(cart.userId);
    await redis.set(key, JSON.stringify(cart), 'EX', CART_TTL);
  }

  async addItem(userId: string, itemData: Omit<CartItem, 'id' | 'addedAt'>): Promise<Cart> {
    const cart = await this.getCart(userId);
    const existingItem = cart.items.find(
      (i) => i.productId === itemData.productId && i.variantId === itemData.variantId
    );

    // The quantity the line would end up holding, whether this is a first add
    // or a top-up of one already in the cart.
    const requested = (existingItem?.quantity ?? 0) + itemData.quantity;
    const permitted = await permittedQuantity(itemData.productId, itemData.variantId, itemData.maxQuantity);
    if (requested > permitted) {
      throw new CartQuantityError(requested, permitted);
    }

    if (existingItem) {
      existingItem.quantity = requested;
      // update price in case it changed
      existingItem.price = itemData.price;
    } else {
      cart.items.push({
        ...itemData,
        id: uuidv4(),
        addedAt: new Date().toISOString(),
      });
    }

    await recalculateCart(cart);
    await this.saveCart(cart);
    return cart;
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number): Promise<Cart> {
    const cart = await this.getCart(userId);
    if (quantity === 0) {
      cart.items = cart.items.filter((i) => i.id !== itemId);
    } else {
      const item = cart.items.find((i) => i.id === itemId);
      if (item) {
        const permitted = await permittedQuantity(item.productId, item.variantId, item.maxQuantity);
        if (quantity > permitted) {
          throw new CartQuantityError(quantity, permitted);
        }
        item.quantity = quantity;
      }
    }
    await recalculateCart(cart);
    await this.saveCart(cart);
    return cart;
  }

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const cart = await this.getCart(userId);
    cart.items = cart.items.filter((i) => i.id !== itemId);
    await recalculateCart(cart);
    await this.saveCart(cart);
    return cart;
  }

  async clearCart(userId: string): Promise<void> {
    const key = this.getCartKey(userId);
    await redis.del(key);
  }

  async applyCoupon(userId: string, code: string): Promise<Cart> {
    const cart = await this.getCart(userId);
    // Trimmed so a stray space cannot store a code that no longer matches the
    // one discount-service is asked about.
    cart.couponCode = code.trim();
    await recalculateCart(cart);
    await this.saveCart(cart);
    return cart;
  }

  async removeCoupon(userId: string): Promise<Cart> {
    const cart = await this.getCart(userId);
    delete cart.couponCode;
    cart.couponDiscount = 0;
    await recalculateCart(cart);
    await this.saveCart(cart);
    return cart;
  }

  async mergeCart(userId: string, guestItems: CartItem[]): Promise<Cart> {
    const cart = await this.getCart(userId);
    
    for (const gItem of guestItems) {
      const existingItem = cart.items.find(
        (i) => i.productId === gItem.productId && i.variantId === gItem.variantId
      );

      if (existingItem) {
        existingItem.quantity = Math.min(existingItem.quantity + gItem.quantity, existingItem.maxQuantity);
      } else {
        cart.items.push({
          ...gItem,
          id: uuidv4(),
          addedAt: new Date().toISOString(),
        });
      }
    }

    await recalculateCart(cart);
    await this.saveCart(cart);
    return cart;
  }

  async getCartSummary(userId: string): Promise<any> {
    const cart = await this.getCart(userId);
    const sellersMap = new Map<string, { sellerId: string; items: CartItem[]; subtotal: number }>();

    for (const item of cart.items) {
      if (!sellersMap.has(item.sellerId)) {
        sellersMap.set(item.sellerId, { sellerId: item.sellerId, items: [], subtotal: 0 });
      }
      const sellerGroup = sellersMap.get(item.sellerId)!;
      sellerGroup.items.push(item);
      sellerGroup.subtotal += item.price * item.quantity;
    }

    return {
      sellers: Array.from(sellersMap.values()),
      total: cart.subtotal - cart.couponDiscount,
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      couponDiscount: cart.couponDiscount
    };
  }
}

export const cartService = new CartService();
