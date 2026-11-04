import { logger } from '../utils/logger.js';

// ─── Catalogue Client ─────────────────────────────────────────────────────────
//
// How many of something a shopper may put in their basket used to be decided by
// `maxQuantity` — a number the browser sends in the request body. Sending
// `{ quantity: 5012, maxQuantity: 99999 }` stored 5,012 of a 12-stock variant,
// verified live. The bound was real, it was just the customer's own.
//
// product-service knows the real figure. Asking it here means the basket
// reflects what can actually be bought, instead of deferring every such
// disappointment to the checkout page.
//
// This does NOT make the cart a stock control, and is not treated as one. Stock
// moves between the add and the checkout, and two shoppers can hold the same
// last unit in their baskets at once. Authoritative stock is still taken at
// reservation, inside the checkout saga, under a row lock. This is the early,
// honest "no" — not the binding one.

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:4002';

// Short, for the same reason the coupon check is: this sits in Add to Cart, and
// a shopper should never wait on the catalogue to put something in their basket.
const TIMEOUT_MS = Number(process.env.CATALOG_TIMEOUT_MS ?? 2_000);

interface VariantResponse {
  data?: {
    stock?:          number;
    reserved?:       number;
    availableStock?: number;
  };
}

/**
 * How many of this variant are actually sellable right now.
 *
 * `null` means the question could not be answered — the catalogue is slow, or
 * down. The caller must treat that as "no opinion" and let the add through:
 * failing Add to Cart because a peer service is redeploying would be a worse
 * bug than the one this exists to fix.
 */
export async function availableStockFor(productId: string, variantId: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `${PRODUCT_SERVICE_URL}/api/v1/products/${encodeURIComponent(productId)}`
        + `/variants/${encodeURIComponent(variantId)}`,
      { signal: controller.signal },
    );

    // A 404 is a real answer — this variant is not on sale — but it is the
    // checkout's job to refuse the purchase, not this one's. The cart says
    // nothing about it and lets reservation deal with it.
    if (!response.ok) return null;

    const body = (await response.json()) as VariantResponse;
    const variant = body.data;
    if (!variant) return null;

    const available = variant.availableStock ?? (Number(variant.stock) - Number(variant.reserved));
    return Number.isFinite(available) ? Math.max(0, Number(available)) : null;
  } catch (err) {
    logger.warn('[cart] catalogue stock unavailable — not bounding this add', {
      productId, variantId, error: (err as Error).message,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
