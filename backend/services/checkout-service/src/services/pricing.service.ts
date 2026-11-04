import { call, SERVICES } from '../clients/service.client.js';
import { logger } from '../utils/logger.js';

// ─── Server-Side Cart Pricing ─────────────────────────────────────────────────
//
// Every monetary figure in a checkout is computed here, from data the server
// owns. Nothing is read from the request body.
//
// The previous implementation took `subtotal` straight off the request
// (`data.subtotal || 100`) and added hardcoded shipping and tax, so
// `{"subtotal": 1}` bought any cart for 16. Even the cart's own stored `price`
// is untrusted here: it is a snapshot from when the item was added and may be
// stale, or may have been written by a compromised cart entry. Prices are
// re-read from product-service at checkout time.

export class EmptyCartError extends Error {
  readonly status = 400;
  constructor() { super('Your cart is empty.'); this.name = 'EmptyCartError'; }
}

export class PricingUnavailableError extends Error {
  readonly status = 503;
  constructor(detail: string) {
    super(`Unable to price this cart right now: ${detail}`);
    this.name = 'PricingUnavailableError';
  }
}

export class ItemUnavailableError extends Error {
  readonly status = 409;
  constructor(readonly productName: string) {
    super(`"${productName}" is no longer available and was removed from your cart.`);
    this.name = 'ItemUnavailableError';
  }
}

export interface PricedLine {
  productId:   string;
  variantId:   string;
  sellerId:    string;
  productName: string;
  quantity:    number;
  /** Authoritative unit price, re-read from product-service. */
  unitPrice:   number;
  lineTotal:   number;
  /** From the catalogue, so category-restricted coupons can be decided. */
  categoryId?: string | null;
  /**
   * The category's slug, which is what tax-service matches zero-rating on.
   * It keys its rules by name ('food', 'medical', 'agricultural', 'books'),
   * so sending the cuid in `categoryId` would rate every zero-rated good at
   * the standard 18%.
   */
  categorySlug?: string | null;
  /**
   * Parcel dimensions, straight from the variant. Nullable in the catalogue,
   * so shipping-service applies its own stated fallback for what is missing
   * rather than this service inventing one.
   */
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?:  number | null;
  heightCm?: number | null;
}

export interface PricedCart {
  items:          PricedLine[];
  currency:       string;
  subtotal:       number;
  shippingCost:   number;
  /**
   * sellerId → delivery fee, as shipping-service quoted it, summing to
   * `shippingCost`. Empty when no quote was obtained, in which case the
   * consumer falls back to its own split.
   */
  vendorShipping: Record<string, number>;
  taxAmount:      number;
  /** The code that actually applied, if any — absent when it was worth 0. */
  couponCode?:    string;
  couponDiscount: number;
  /**
   * Whose goods the discount came off, sellerId to amount. Sums exactly to
   * `couponDiscount`; a seller with no eligible items is absent or 0.
   */
  vendorDiscounts: Record<string, number>;
  total:          number;
}

/** The cart itself, as cart-service models it. */
interface Cart {
  items?: Array<{
    productId:   string;
    variantId?:  string;
    sellerId:    string;
    productName: string;
    quantity:    number;
  }>;
  /** Read for the code only. The amount it carries is a display estimate
   *  computed from client-supplied prices and is never trusted here. */
  couponCode?: string;
  couponDiscount?: number;
}

/**
 * What `GET /api/v1/cart` actually puts on the wire.
 *
 * cart-service answers `{ success, data: cart }` — every one of its handlers
 * does `res.json({ success: true, data: cart })`. This type used to describe
 * the cart itself, so `cartRes.data.items` read the envelope's `items`, which
 * does not exist, and every checkout resolved to an empty basket and threw
 * EmptyCartError. Checkout could not complete for any customer.
 *
 * The unit tests did not catch it because their `call` double returns the shape
 * this type claimed rather than the shape the service sends.
 */
interface CartResponse {
  success?: boolean;
  data?:    Cart;
}

interface DiscountValidateResponse {
  sellerBreakdown?: Array<{ sellerId?: string; eligibleAmount?: number; discountAmount?: number }>;
  valid?: boolean;
  discountAmount?: number;
  message?: string;
}

interface VariantResponse {
  data?: {
    id: string; price: number | string; productId: string;
    categoryId?: string | null; categorySlug?: string | null;
    weightKg?: number | null; length?: number | null; width?: number | null; height?: number | null;
  };
}

/** The seller a line is attributed to when the catalogue names none. */
const UNATTRIBUTED_SELLER = 'muni-store';

/** Money is rounded to 2dp at every boundary so cents cannot drift. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Build the authoritative price for a user's cart.
 *
 * @param actorId      the authenticated user — the cart is looked up by identity,
 *                     never by an id the caller supplies.
 * @param paymentType  how the order will be paid. Only 'cod' changes the
 *                     price, by adding the courier's cash-handling fee.
 */
export async function priceCart(
  actorId: string,
  shippingAddress?: unknown,
  paymentType?: string,
): Promise<PricedCart> {
  // ── 1. Read the cart by identity ────────────────────────────────────────
  const cartRes = await call<CartResponse>(`${SERVICES.cart}/api/v1/cart`, {
    service: 'cart-service',
    actorId,
  });

  if (!cartRes.ok) throw new PricingUnavailableError(`cart-service returned ${cartRes.status}`);

  // Unwrap the envelope once, here, rather than at each read below.
  const cart = cartRes.data?.data ?? {};

  const rawItems = cart.items ?? [];
  if (rawItems.length === 0) throw new EmptyCartError();

  // ── 2. Re-price every line from the catalogue ───────────────────────────
  const items: PricedLine[] = [];

  for (const line of rawItems) {
    if (!line.variantId) {
      throw new ItemUnavailableError(line.productName ?? line.productId);
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new ItemUnavailableError(line.productName ?? line.productId);
    }

    // Nested under the product, matching product-service's own route shape.
    // Both ids come from the cart the server just read by identity, never from
    // the request body — and product-service cross-checks that the variant
    // really belongs to the product, so a mismatched pair 404s rather than
    // pricing the wrong SKU.
    const variantRes = await call<VariantResponse>(
      `${SERVICES.product}/api/v1/products/${encodeURIComponent(line.productId)}`
        + `/variants/${encodeURIComponent(line.variantId)}`,
      { service: 'product-service', actorId },
    );

    if (!variantRes.ok || !variantRes.data.data) {
      throw new ItemUnavailableError(line.productName ?? line.productId);
    }

    // Prisma serialises Decimal as a string; Number() handles both shapes.
    const unitPrice = Number(variantRes.data.data.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new PricingUnavailableError(`variant ${line.variantId} has no usable price`);
    }

    items.push({
      productId:   line.productId,
      variantId:   line.variantId,
      sellerId:    line.sellerId,
      productName: line.productName,
      quantity:    line.quantity,
      unitPrice:   round2(unitPrice),
      lineTotal:   round2(unitPrice * line.quantity),
      categoryId:  variantRes.data.data.categoryId ?? null,
      categorySlug: variantRes.data.data.categorySlug ?? null,
      weightKg:     variantRes.data.data.weightKg ?? null,
      // product-service names these in centimetres without saying so in the
      // field name; shipping-service's contract does.
      lengthCm:     variantRes.data.data.length ?? null,
      widthCm:      variantRes.data.data.width  ?? null,
      heightCm:     variantRes.data.data.height ?? null,
    });
  }

  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));

  // ── 3. Shipping and tax from their owning services ──────────────────────
  // Both are non-fatal: a checkout should not hard-fail because the tax
  // service is redeploying. They fall back to zero and are logged, which is
  // visible in reconciliation rather than silently wrong in the customer's
  // favour by a hardcoded constant.
  // COD is collected on delivery, so its handling fee belongs in the quote —
  // but only when that is actually how this order is being paid.
  const shipping = await quoteShipping(
    items,
    shippingAddress,
    actorId,
    paymentType === 'cod' ? subtotal : undefined,
  );
  const shippingCost = shipping.cost;
  const taxAmount    = await quoteTax(items, shippingAddress, actorId);

  // ── 4. Price the coupon against the re-priced basket ────────────────────
  //
  // The amount is computed by discount-service from the lines above — NOT read
  // from the cart. The cart's `couponDiscount` was a display estimate derived
  // from client-supplied item prices, and trusting it here was exploitable:
  // inflate an item's `price` in the cart, apply any string as a coupon, and
  // the resulting estimate exceeded the real subtotal. The `Math.min` clamp
  // below then floored the goods cost at zero — a customer paid shipping and
  // tax only.
  //
  // `cart.couponDiscount` is deliberately not read anywhere in this
  // function.
  const couponCode = cart.couponCode?.trim();
  const quote = couponCode
    ? await quoteDiscount(couponCode, actorId, items, subtotal)
    : { amount: 0, vendorDiscounts: {} as Record<string, number> };

  // `readBreakdown` has already refused anything whose slices do not sum to
  // the total or that discounts a seller past their own goods, so a valid
  // quote cannot exceed the subtotal. This clamp is the last line of defence
  // for that invariant — and if it ever bites, the allocation no longer
  // matches what is being charged, so the coupon is dropped rather than
  // charged with a split nobody can reconcile.
  const overLarge = quote.amount > subtotal;
  if (overLarge) {
    logger.warn('[pricing] discount exceeds the basket — coupon dropped', {
      code: couponCode, amount: quote.amount, subtotal,
    });
  }

  const discount        = overLarge ? 0 : quote.amount;
  const vendorDiscounts = overLarge ? {} : quote.vendorDiscounts;
  const total           = round2(Math.max(0, subtotal - discount + shippingCost + taxAmount));

  return {
    items,
    currency: 'UGX',
    subtotal,
    shippingCost,
    vendorShipping: shipping.perSeller,
    taxAmount,
    couponCode: discount > 0 ? couponCode : undefined,
    couponDiscount: discount,
    vendorDiscounts: discount > 0 ? vendorDiscounts : {},
    total,
  };
}

/**
 * What this coupon is worth against the basket the server just priced.
 *
 * Degrades to 0 rather than failing the checkout, matching how shipping and
 * tax already behave: a discount-service blip should not stop every coupon
 * customer from buying. The customer loses the discount for this attempt, and
 * the reason is logged — never silently charged a discounted total that no
 * service agreed to.
 *
 * An invalid, expired or exhausted code also returns 0. That is not an error
 * either: the code simply does not apply.
 */
async function quoteDiscount(
  code: string,
  actorId: string,
  items: PricedLine[],
  subtotal: number,
): Promise<{ amount: number; vendorDiscounts: Record<string, number> }> {
  const nothing = { amount: 0, vendorDiscounts: {} as Record<string, number> };
  try {
    const res = await call<DiscountValidateResponse>(
      `${SERVICES.discount}/api/v1/discounts/validate`,
      {
        service: 'discount-service',
        method:  'POST',
        actorId,
        body: {
          code,
          userId:      actorId,
          orderAmount: subtotal,
          // The authoritative lines, so applicability by product, category or
          // seller is decided against what is really being bought.
          items: items.map((line) => ({
            productId:  line.productId,
            sellerId:   line.sellerId,
            categoryId: line.categoryId ?? undefined,
            price:      line.unitPrice,
            quantity:   line.quantity,
          })),
        },
      },
    );

    if (!res.ok || !res.data.valid) {
      logger.info('[pricing] coupon not applied', {
        code,
        status: res.status,
        reason: res.data?.message ?? `status ${res.status}`,
      });
      return nothing;
    }

    const amount = Number(res.data.discountAmount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      logger.warn('[pricing] discount-service returned an unusable amount', { code, amount });
      return nothing;
    }

    const vendorDiscounts = readBreakdown(code, round2(amount), items, res.data.sellerBreakdown);
    if (!vendorDiscounts) return nothing;

    return { amount: round2(amount), vendorDiscounts };
  } catch (err) {
    // ServiceUnavailableError from the client — degrade, do not fail.
    logger.error('[pricing] discount-service unreachable — pricing without the coupon', {
      code,
      error: (err as Error).message,
    });
    return nothing;
  }
}

/**
 * Check discount-service's per-seller split before binding it into the order.
 *
 * This is what makes the allocation binding rather than advisory. Checkout
 * owns the basket, so it is the only party that can say whether a slice names
 * a seller who is actually in it and whether the parts add up to the total
 * being charged. discount-service owns the promotion rules and is trusted for
 * them; it is not trusted to be arithmetically consistent with a basket only
 * checkout has.
 *
 * Returns null when the breakdown cannot be trusted, which drops the coupon
 * entirely. That is deliberately strict: charging a discount nobody can
 * attribute is how the platform ends up quietly funding a seller's promotion.
 */
function readBreakdown(
  code: string,
  amount: number,
  items: PricedLine[],
  slices: DiscountValidateResponse['sellerBreakdown'],
): Record<string, number> | null {
  const refuse = (reason: string, detail: Record<string, unknown> = {}) => {
    logger.warn('[pricing] unusable seller breakdown — coupon dropped', { code, reason, ...detail });
    return null;
  };

  // A zero-value coupon (FREE_SHIPPING) has nothing to attribute.
  if (amount === 0) return {};
  if (!Array.isArray(slices) || slices.length === 0) return refuse('missing');

  const goodsBySeller = new Map<string, number>();
  for (const line of items) {
    const sellerId = line.sellerId || UNATTRIBUTED_SELLER;
    goodsBySeller.set(sellerId, round2((goodsBySeller.get(sellerId) ?? 0) + line.lineTotal));
  }

  const vendorDiscounts: Record<string, number> = {};
  let sum = 0;

  for (const slice of slices) {
    const sellerId = String(slice?.sellerId ?? '');
    const value    = Number(slice?.discountAmount ?? 0);

    if (!sellerId) return refuse('a slice names no seller');
    if (!Number.isFinite(value) || value < 0) return refuse('a slice is not a usable amount', { sellerId });

    const goods = goodsBySeller.get(sellerId);
    // A seller not in this basket must never be allocated anything against it.
    if (goods === undefined) return refuse('slice names a seller not in the basket', { sellerId });

    // The eligible portion is discount-service's claim about how much of this
    // seller's goods the coupon may touch. It cannot exceed what the seller
    // actually has in the basket checkout priced.
    const eligible = Number(slice?.eligibleAmount ?? goods);
    if (!Number.isFinite(eligible) || eligible < 0 || round2(eligible) > goods) {
      return refuse('slice claims more eligible value than the seller has', { sellerId, eligible, goods });
    }
    // And the discount cannot exceed the eligible portion of it.
    if (round2(value) > round2(eligible)) {
      return refuse('slice exceeds that seller eligible goods', { sellerId, value, eligible });
    }

    vendorDiscounts[sellerId] = round2(value);
    sum = round2(sum + value);
  }

  if (sum !== amount) return refuse('slices do not sum to the discount', { sum, amount });

  return vendorDiscounts;
}

export interface ShippingQuote {
  cost: number;
  /**
   * sellerId → fee, from shipping-service, summing to `cost`. Empty when no
   * quote could be obtained.
   *
   * This is the authoritative split. It replaces spreading one total across
   * sellers by line value, which charged the seller of an expensive light item
   * more to ship than the seller of a cheap heavy one.
   */
  perSeller: Record<string, number>;
}

/**
 * What the basket costs to deliver.
 *
 * The whole `items` array used to be posted verbatim — priced lines, seller
 * ids, line totals — to a path shipping-service does not serve. It 404'd on
 * every checkout, the 404 was swallowed as "unavailable", and delivery was free
 * for every order MUNI has taken through checkout.
 *
 * Now it sends what a courier quote actually turns on — where it is going, and
 * what is in the box — and nothing about money beyond the COD amount to be
 * collected.
 */
async function quoteShipping(
  items: PricedLine[],
  shippingAddress: unknown,
  actorId: string,
  codAmount?: number,
): Promise<ShippingQuote> {
  const none: ShippingQuote = { cost: 0, perSeller: {} };

  try {
    const res = await call<{ data?: { cost?: number; perSeller?: Record<string, number> } }>(
      `${SERVICES.shipping}/api/v1/shipping/quote`,
      {
        service: 'shipping-service',
        method:  'POST',
        actorId,
        body: {
          shippingAddress,
          items: items.map((line) => ({
            sellerId: line.sellerId,
            quantity: line.quantity,
            weightKg: line.weightKg,
            lengthCm: line.lengthCm,
            widthCm:  line.widthCm,
            heightCm: line.heightCm,
          })),
          ...(codAmount !== undefined && codAmount > 0 ? { codAmount } : {}),
        },
      },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);

    const cost = Number(res.data.data?.cost ?? 0);
    if (!Number.isFinite(cost) || cost < 0) return none;

    // The split is only usable if it describes THIS basket: it must sum to the
    // total being charged, and it must name only sellers actually being bought
    // from. A figure keyed on a seller who is not on the order would be handed
    // to order-service as that seller's delivery fee. Failing either check,
    // the caller falls back to its own split rather than passing on a figure
    // that cannot be reconciled.
    const perSeller = res.data.data?.perSeller ?? {};
    const basketSellers = new Set(items.map((line) => line.sellerId));
    const sum = round2(Object.values(perSeller).reduce((a, b) => a + Number(b), 0));
    const describesBasket =
      Object.keys(perSeller).length > 0
      && Object.keys(perSeller).every((sellerId) => basketSellers.has(sellerId))
      && sum === round2(cost);

    return {
      cost:      round2(cost),
      perSeller: describesBasket ? perSeller : {},
    };
  } catch (err) {
    logger.warn('[pricing] shipping quote unavailable — defaulting to 0', {
      error: (err as Error).message,
    });
    return none;
  }
}

/**
 * The market this platform sells into, used when the address names no country.
 *
 * tax-service keys its rules by ISO-3166 alpha-2 and falls back to a 0% rule
 * for anything it does not recognise, so an absent country silently meant an
 * untaxed order.
 */
const DEFAULT_COUNTRY = (process.env.DEFAULT_TAX_COUNTRY ?? 'UG').toUpperCase();

function countryOf(shippingAddress: unknown): string {
  const raw = (shippingAddress as { country?: unknown } | null)?.country;
  return typeof raw === 'string' && /^[A-Za-z]{2}$/.test(raw.trim())
    ? raw.trim().toUpperCase()
    : DEFAULT_COUNTRY;
}

/**
 * VAT on the goods, from tax-service.
 *
 * Both halves of this call were wrong and each was independently sufficient to
 * make every MUNI order tax-free:
 *
 *   1. The body was `{ amount, shippingAddress }`. tax-service validates
 *      `{ countryCode, stateCode?, items[] }` and answered 422 every time.
 *   2. The response was read as `taxAmount`. tax-service returns `totalTax`,
 *      unwrapped — so even a 200 would have parsed as 0.
 *
 * The 422 was caught and logged at warn level, then 0 was returned as though
 * tax were merely unavailable, so nothing above this ever saw a failure. UG
 * VAT is 18% and every order recorded none of it.
 *
 * Per-line rather than on the subtotal, because the Ugandan VAT Act zero-rates
 * food, medical supplies, agricultural goods and books, and tax-service applies
 * that per item by category slug.
 */
async function quoteTax(
  items: PricedLine[],
  shippingAddress: unknown,
  actorId: string,
): Promise<number> {
  if (items.length === 0) return 0;

  try {
    const res = await call<{ totalTax?: number; data?: { totalTax?: number } }>(
      `${SERVICES.tax}/api/v1/tax/calculate`,
      {
        service: 'tax-service',
        method:  'POST',
        actorId,
        body: {
          countryCode: countryOf(shippingAddress),
          items: items.map((line) => ({
            productId: line.productId,
            // The slug is what the zero-rating lists are written in. An
            // uncategorised product falls through to the standard rate, which
            // is the correct default under the VAT Act.
            category:  line.categorySlug ?? '',
            price:     line.unitPrice,
            quantity:  line.quantity,
          })),
        },
      },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);

    const tax = Number(res.data.totalTax ?? res.data.data?.totalTax ?? 0);
    return Number.isFinite(tax) && tax >= 0 ? round2(tax) : 0;
  } catch (err) {
    logger.warn('[pricing] tax quote unavailable — defaulting to 0', {
      error: (err as Error).message,
    });
    return 0;
  }
}
