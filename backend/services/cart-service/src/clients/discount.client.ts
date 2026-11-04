import { logger } from '../utils/logger.js';
import type { CartItem } from '../models/cart.model.js';

// ─── Discount Client ──────────────────────────────────────────────────────────
//
// The cart used to compute its own coupon figure — `subtotal * 0.1`, applied to
// any string the customer typed, with a comment admitting it was a stub. It
// meant every code "worked", every code was worth 10%, and the number shown in
// the basket had no relationship to what checkout would actually charge.
//
// discount-service now answers that question. What comes back here is still
// only an ESTIMATE: it is priced against the item prices the client supplied
// when the item was added to the cart, which are not authoritative. Checkout
// re-prices every line from the catalogue and asks discount-service again
// before charging, and that second answer is the one that counts.

const DISCOUNT_SERVICE_URL = process.env.DISCOUNT_SERVICE_URL ?? 'http://localhost:4015';

// Short, because this sits in an interactive path: a customer adding an item
// to their basket should not wait on a slow coupon check. Losing the estimate
// is cheap; a hanging Add to Cart is not.
const TIMEOUT_MS = Number(process.env.DISCOUNT_TIMEOUT_MS ?? 2_000);

/**
 * Three outcomes, because the caller must treat them differently.
 *
 * `rejected` is discount-service's verdict on the code itself — expired,
 * exhausted, not applicable — and the cart drops the code on the strength of
 * it. `unavailable` says nothing about the code, only about the network, so
 * the cart keeps it and shows no discount; checkout will ask again.
 */
export type CouponQuote =
  | { outcome: 'applied';     amount: number }
  | { outcome: 'rejected';    reason: string }
  | { outcome: 'unavailable'; reason: string };

interface ValidateResponse {
  valid?:          boolean;
  discountAmount?: number;
  message?:        string;
}

/** What `code` is estimated to be worth against this basket. Never throws. */
export async function quoteCoupon(
  code:     string,
  userId:   string,
  items:    CartItem[],
  subtotal: number,
): Promise<CouponQuote> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${DISCOUNT_SERVICE_URL}/api/v1/discounts/validate`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': userId },
      signal:  controller.signal,
      body: JSON.stringify({
        code,
        userId,
        orderAmount: subtotal,
        // Sent so applicability by product or seller is decided against what
        // is really in the basket, not against the total alone.
        items: items.map((line) => ({
          productId: line.productId,
          sellerId:  line.sellerId,
          price:     line.price,
          quantity:  line.quantity,
        })),
      }),
    });

    // A rejection comes back as 400 with `{valid:false, message}` from the
    // controller's catch, or as 200 with the same shape from validateCode —
    // both are a verdict on the code, so status alone cannot decide.
    const text = await response.text();
    let body: ValidateResponse;
    try { body = text ? (JSON.parse(text) as ValidateResponse) : {}; }
    catch { body = {}; }

    if (typeof body.valid !== 'boolean') {
      // No verdict in the body — an HTML error page, a proxy, an empty 502.
      return { outcome: 'unavailable', reason: `unexpected response (status ${response.status})` };
    }

    if (!body.valid) {
      return { outcome: 'rejected', reason: body.message ?? 'This code cannot be used.' };
    }

    const amount = Number(body.discountAmount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      logger.warn('discount-service returned an unusable amount', { detail: { code, amount } });
      return { outcome: 'unavailable', reason: 'unusable discount amount' };
    }

    return { outcome: 'applied', amount };
  } catch (err) {
    const reason = (err as Error).name === 'AbortError'
      ? `timed out after ${TIMEOUT_MS}ms`
      : (err as Error).message;

    logger.error('coupon estimate failed — showing the cart without it', {
      detail: { code, reason },
    });
    return { outcome: 'unavailable', reason };
  } finally {
    clearTimeout(timer);
  }
}
