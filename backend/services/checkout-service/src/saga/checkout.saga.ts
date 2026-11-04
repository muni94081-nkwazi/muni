import { call, SERVICES } from '../clients/service.client.js';
import { priceCart, type PricedCart, type PricedLine } from '../services/pricing.service.js';
import { sessionRepository } from '../repositories/session.repository.js';
import type { CheckoutSession } from '../models/checkout.model.js';
import { logger } from '../utils/logger.js';
import { allocateProportionally } from '../../../../shared/utils/discount-allocation.js';

// ─── Checkout Saga ────────────────────────────────────────────────────────────
//
// Orchestrated saga with an explicit compensation stack. Each step pushes its
// undo *before* the next step runs, so a failure at any point unwinds every
// effect already applied, in reverse order.
//
// Replaces an implementation that posted to an inventory route which does not
// exist (`/inventory/reserve` — the real route is `/inventory/:variantId/
// reserve`), swallowed the resulting 404 because a non-2xx response does not
// reject a fetch, then marked the reservation step "completed" and later
// flipped the session to PAYMENT_CONFIRMED without ever calling payment.
//
// Steps:
//   1. PRICE            — server-side, from the catalogue (no compensation)
//   2. RESERVE_INVENTORY— per variant, in deterministic order ↩ release
//   3. PAYMENT          — idempotency-keyed on the session   ↩ refund
//   4. CREATE_ORDER     — idempotency-keyed on the session   ↩ cancel
//   5. DEDUCT           — settle reservations (no compensation: order exists)
//
// Deadlock avoidance: reservations are taken in sorted variantId order. Two
// carts holding {A,B} and {B,A} would otherwise take Postgres row locks in
// opposite orders and deadlock under concurrency.

export class OutOfStockError extends Error {
  readonly status = 409;
  constructor(readonly productName: string, readonly available?: number) {
    super(
      available !== undefined && available > 0
        ? `Only ${available} of "${productName}" left — please reduce the quantity.`
        : `"${productName}" just sold out.`,
    );
    this.name = 'OutOfStockError';
  }
}

export class PaymentFailedError extends Error {
  readonly status = 402;
  constructor(detail: string) {
    super(`Payment could not be completed: ${detail}`);
    this.name = 'PaymentFailedError';
  }
}

export class StepFailedError extends Error {
  readonly status = 502;
  constructor(readonly step: string, detail: string) {
    super(`Checkout failed at ${step}: ${detail}`);
    this.name = 'StepFailedError';
  }
}

/**
 * The coupon stopped being redeemable between cart review and payment.
 *
 * Its own class rather than StepFailedError, which carries 502 — this is not a
 * fault, it is the customer's basket changing underneath them, and 409 is what
 * says so. Same shape as OutOfStockError above, and for the same reason: the
 * message is read by a person, so it says what happened and what to do rather
 * than naming the saga step that noticed.
 */
export class CouponUnavailableError extends Error {
  readonly status = 409;
  constructor(readonly code: string, readonly newTotal: number, detail?: string) {
    super(
      `Coupon "${code}" is no longer available${detail ? ` (${detail})` : ''}. ` +
      'Please review your updated total before paying.',
    );
    this.name = 'CouponUnavailableError';
  }
}

type Compensation = { label: string; run: () => Promise<void> };

/** What order-service reports back about each seller slice of the order. */
interface SubOrderSummary {
  id:                 string;
  sellerId:           string;
  vendorShare?:       number;
  platformCommission?: number;
}

interface ReservedLine extends PricedLine {
  reservationId: string;
}

/**
 * Split the priced cart into what each seller is owed.
 *
 * payment-service opens one escrow hold per entry, so a three-vendor basket
 * produces three holds carrying their own amounts. This replaces a workaround
 * that picked the first seller and attributed the whole basket to them, then
 * logged a warning about having done so.
 *
 * Amounts are goods subtotals — the sum of each seller's line totals. Shipping
 * and tax are deliberately excluded: they are not a vendor's money to be paid
 * out, and holding them against a seller is precisely what the single-hold
 * model got wrong.
 */
function vendorBreakdownFor(
  items: PricedLine[],
  vendorDiscounts: Record<string, number> = {},
): Array<{ sellerId: string; amountUGX: number }> {
  const byVendor = new Map<string, number>();

  for (const line of items) {
    const sellerId = line.sellerId || 'muni-store';
    byVendor.set(sellerId, round2((byVendor.get(sellerId) ?? 0) + line.lineTotal));
  }

  return [...byVendor.entries()]
    .map(([sellerId, goods]) => ({
      sellerId,
      // Net of that seller's own discount. Holding a seller's gross while the
      // buyer paid the discounted total put more into escrow than was
      // collected for goods — and taking the discount off everyone equally
      // would have made seller B fund seller A's promotion.
      amountUGX: round2(Math.max(0, goods - (vendorDiscounts[sellerId] ?? 0))),
    }))
    .sort((a, b) => a.sellerId.localeCompare(b.sellerId));
}

/**
 * Split a basket-level charge across the sellers in the basket.
 *
 * order-service charges shipping per sub-order and falls back to a hardcoded
 * 5,000 per seller when the caller names no fee. Checkout was sending none, so
 * a two-seller order recorded 10,000 of shipping against a checkout that
 * quoted 500 and a payment that collected it — the order's own total
 * disagreed with what the customer was actually charged.
 *
 * Used for shipping and for tax. Both are quoted against the basket as a
 * whole, so which seller "owns" which part is a convention, not a fact. What
 * is not a convention is the total: the parts sum to exactly the amount quoted
 * and charged, using the same largest-remainder split as the discount
 * allocation.
 */
function splitAcrossSellers(items: PricedLine[], amount: number): Record<string, number> {
  const goods = new Map<string, number>();
  for (const line of items) {
    const sellerId = line.sellerId || 'muni-store';
    goods.set(sellerId, round2((goods.get(sellerId) ?? 0) + line.lineTotal));
  }
  return Object.fromEntries(allocateProportionally(amount, goods));
}

/** Money is rounded to 2dp at every boundary so cents cannot drift. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Reshape the session's address into the `shipping` object order-service
 * requires (it rejects a body without address/city/phone). The session stores
 * whatever the client posted at initiate time, so each field is coerced and
 * defaulted rather than assumed present.
 */
function shippingFor(session: CheckoutSession): {
  address: string; city: string; district?: string; phone: string; notes?: string;
} {
  const address = (session.shippingAddress ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  return {
    address:  str(address.address) || str(address.street),
    city:     str(address.city),
    district: str(address.district) || undefined,
    phone:    str(address.phone),
    notes:    str(address.notes) || undefined,
  };
}

function markStep(
  session: CheckoutSession,
  step: string,
  status: 'pending' | 'completed' | 'failed',
  error?: string,
): void {
  session.steps.push({
    step,
    status,
    completedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  });
  session.updatedAt = new Date().toISOString();
}

/**
 * Run the full purchase. Mutates and persists `session` as it goes so a
 * concurrent GET reflects real progress rather than a status that was set
 * optimistically up front.
 */
export async function runCheckoutSaga(session: CheckoutSession): Promise<CheckoutSession> {
  const compensations: Compensation[] = [];

  try {
    // ── 1. Price the cart server-side ────────────────────────────────────
    const priced: PricedCart = await priceCart(
      session.userId,
      session.shippingAddress,
      session.paymentMethod?.type,
    );

    session.cartSnapshot   = priced.items;
    session.subtotal       = priced.subtotal;
    session.shippingCost   = priced.shippingCost;
    session.vendorShipping = priced.vendorShipping;
    session.taxAmount      = priced.taxAmount;
    // Only the code that actually applied — pricing returns it undefined when
    // the coupon was rejected or worth nothing, so the session never records a
    // code the customer did not receive.
    session.couponCode      = priced.couponCode;
    session.couponDiscount  = priced.couponDiscount;
    session.vendorDiscounts = priced.vendorDiscounts;
    session.total          = priced.total;
    session.status         = 'VALIDATING';
    markStep(session, 'PRICE_CART', 'completed');
    await sessionRepository.save(session);

    // ── 2. Reserve inventory, one call per variant ───────────────────────
    // Sorted so every concurrent checkout takes row locks in the same order.
    const ordered = [...priced.items].sort((a, b) => a.variantId.localeCompare(b.variantId));
    const reserved: ReservedLine[] = [];

    // Holds this session already owns, from an earlier run of this saga.
    //
    // confirmPayment re-drives the whole function, and inventory-service does
    // NOT deduplicate by sessionId — it records the id as a label and inserts a
    // new reservation on every call. So a re-drive without this took a second
    // hold on the same stock for the same customer, double-counting the goods
    // as sold until the orphaned hold's TTL expired.
    //
    // Reused holds are deliberately NOT pushed onto the compensation stack: the
    // run that created them owns their release, and releasing a hold twice on a
    // later failure would give back stock this session never took.
    const heldAlready = new Map((session.reservations ?? []).map((r) => [r.variantId, r.reservationId]));

    for (const line of ordered) {
      const existingHold = heldAlready.get(line.variantId);
      if (existingHold) {
        reserved.push({ ...line, reservationId: existingHold });
        continue;
      }

      const res = await call<{ data?: { reservationId: string }; message?: string }>(
        `${SERVICES.inventory}/api/v1/inventory/${encodeURIComponent(line.variantId)}/reserve`,
        {
          service: 'inventory-service',
          method:  'POST',
          actorId: session.userId,
          body:    { quantity: line.quantity, sessionId: session.id, userId: session.userId },
        },
      );

      if (res.status === 409) {
        // Insufficient stock — a normal outcome, not a system failure.
        const available = Number(/only (\d+)/i.exec(res.data.message ?? '')?.[1]);
        throw new OutOfStockError(line.productName, Number.isFinite(available) ? available : undefined);
      }
      if (!res.ok || !res.data.data?.reservationId) {
        throw new StepFailedError('RESERVE_INVENTORY', res.data.message ?? `status ${res.status}`);
      }

      const reservationId = res.data.data.reservationId;
      reserved.push({ ...line, reservationId });

      compensations.push({
        label: `release ${line.variantId}`,
        run: async () => {
          await call(
            `${SERVICES.inventory}/api/v1/inventory/${encodeURIComponent(line.variantId)}/release`,
            { service: 'inventory-service', method: 'POST', actorId: session.userId, body: { reservationId } },
          );
        },
      });
    }

    markStep(session, 'RESERVE_INVENTORY', 'completed');
    session.status = 'PAYMENT_PENDING';
    // Recorded before the charge so a re-drive can find these holds even if the
    // process dies mid-payment.
    session.reservations = reserved.map((line) => ({
      variantId:     line.variantId,
      reservationId: line.reservationId,
    }));
    await sessionRepository.save(session);

    // ── 2b. Consume the coupon ───────────────────────────────────────────
    //
    // After stock is held and before the card is charged. The amount is
    // already final (priced in step 1), so this is the point where the use is
    // actually spent — and it must happen before payment: charging a
    // discounted total whose discount turns out to be unavailable is not
    // recoverable without a refund.
    //
    // The session id is the idempotency key. A re-driven saga — confirmPayment
    // re-runs this whole function — hits the same
    // (discountId, userId, orderId) row and consumes nothing extra.
    if (priced.couponCode && priced.couponDiscount > 0) {
      const applyRes = await call<{ valid?: boolean; message?: string }>(
        `${SERVICES.discount}/api/v1/discounts/apply`,
        {
          service: 'discount-service',
          method:  'POST',
          actorId: session.userId,
          body: {
            code:        priced.couponCode,
            userId:      session.userId,
            orderId:     session.id,
            orderAmount: priced.subtotal,
            items: priced.items.map((line) => ({
              productId: line.productId,
              sellerId:  line.sellerId,
              price:     line.unitPrice,
              quantity:  line.quantity,
            })),
          },
        },
      );

      if (!applyRes.ok || !applyRes.data.valid) {
        // Someone took the last use between pricing and here, or the code
        // lapsed.
        //
        // This used to re-price without the coupon and carry on — it added the
        // discount back onto the total, cleared the code, and charged the
        // higher amount. The customer had reviewed and agreed to a total with
        // the discount in it; they were then billed more than that, with no
        // prompt and nothing on screen to notice. A silent price increase at
        // the moment of payment is not a recoverable-from state, it is the one
        // thing a checkout must never do.
        //
        // So the saga aborts. The compensation stack unwinds the inventory
        // holds taken in step 2, no payment has been attempted yet (step 3 is
        // below), and the coupon itself was never consumed — the reversal
        // compensation is only registered in the `else` branch. The customer
        // gets a 409 naming the new total and re-reviews it.
        const newTotal = round2(session.total + session.couponDiscount);

        logger.warn('[saga] coupon could not be redeemed — aborting rather than charging more', {
          sessionId:    session.id,
          code:         priced.couponCode,
          reason:       applyRes.data.message ?? `status ${applyRes.status}`,
          agreedTotal:  session.total,
          wouldHavePaid: newTotal,
        });

        markStep(session, 'APPLY_DISCOUNT', 'failed', applyRes.data.message);
        throw new CouponUnavailableError(
          priced.couponCode,
          newTotal,
          applyRes.data.message,
        );
      } else {
        compensations.push({
          label: `reverse discount ${priced.couponCode}`,
          run: async () => {
            await call(`${SERVICES.discount}/api/v1/discounts/reverse`, {
              service: 'discount-service',
              method:  'POST',
              actorId: session.userId,
              body: {
                code:    priced.couponCode,
                userId:  session.userId,
                orderId: session.id,
              },
            });
          },
        });

        markStep(session, 'APPLY_DISCOUNT', 'completed');
      }

      await sessionRepository.save(session);
    }

    // ── 3. Charge ────────────────────────────────────────────────────────
    // The key is derived from the session id, so a retried confirm — whether
    // from the user, the gateway or a flaky network — reaches the same
    // payment rather than creating a second one.
    // `/api/v1/payments/initiate` — payment-service exposes no bare
    // `/api/v1/payments` POST, so the previous URL 404'd and every checkout
    // failed here with "gateway returned 404" dressed up as a declined card.
    const paymentRes = await call<{
      data?: { paymentId?: string; reference?: string; status?: string; providerStatus?: string };
      message?: string;
    }>(
      `${SERVICES.payment}/api/v1/payments/initiate`,
      {
        service: 'payment-service',
        method:  'POST',
        actorId: session.userId,
        idempotencyKey: `checkout:${session.id}:payment`,
        body: {
          orderId:  session.id,
          amount:   session.total,
          currency: priced.currency,
          method:   session.paymentMethod?.type,
          cardToken: session.paymentMethod?.token,
          buyerId:  session.userId,
          // One escrow hold per seller in the basket, each carrying that
          // seller's own goods subtotal.
          vendorBreakdown: vendorBreakdownFor(priced.items, session.vendorDiscounts),
          // Mobile money needs a number to send the PIN prompt to. The payment
          // number the customer chose wins; the delivery phone is the fallback.
          phoneNumber: session.paymentMethod?.phone ?? shippingFor(session).phone,
        },
      },
    );

    if (!paymentRes.ok) {
      throw new PaymentFailedError(paymentRes.data.message ?? `gateway returned ${paymentRes.status}`);
    }

    const paymentId = paymentRes.data.data?.paymentId;

    // The refund route resolves its `:reference` param via
    // `findByReference` — passing the paymentId there found nothing, so the
    // refund compensation logged a failure and the customer stayed charged.
    // Fall back to paymentId only because a provider that omits `reference`
    // leaves nothing better to try.
    const paymentRef = paymentRes.data.data?.reference ?? paymentId;

    session.paymentIntentId  = paymentId;
    session.paymentReference = paymentRef;

    const providerStatus = paymentRes.data.data?.providerStatus;
    const paymentStatus  = paymentRes.data.data?.status;

    // ── 3a. Did the money actually move? ─────────────────────────────────
    //
    // A 2xx from /payments/initiate means "the request was accepted", NOT
    // "the customer paid". For MTN and Airtel the driver returns 201 with
    // providerStatus PENDING_USER_PIN_PROMPT the moment the PIN prompt is
    // pushed to the handset — before the customer has approved anything.
    //
    // This used to fall straight through to `status = 'PAYMENT_CONFIRMED'`,
    // so the saga created the order and deducted real stock against a
    // collection that had not happened. If the customer then declined, the
    // order and the stock movement were never reversed: nothing consumes
    // payment.failed (only analytics- and notification-service reference it),
    // and order-service's own compensation path cannot even find a saga order
    // because the payment is keyed on the checkout session id, not the order
    // id. The result was fulfillable orders nobody had paid for.
    //
    // So the saga now stops here and waits. The session stays PAYMENT_PENDING
    // with its inventory holds intact, and `confirmPayment` re-drives it once
    // the webhook or the pending-payment poller has resolved the collection —
    // which is exactly the re-entry point checkout.service already documents.
    if (paymentStatus === 'failed' || providerStatus === 'FAILED') {
      throw new PaymentFailedError(paymentRes.data.message ?? 'the provider declined the payment');
    }

    // Deliberately keyed on providerStatus, not on `status === 'pending'`.
    // Cash-on-delivery is pending by definition until the courier collects,
    // and the card/Flutterwave/Pesapal redirect flows are pending until the
    // customer returns from the hosted page — gating on `pending` would stall
    // every one of those orders. PENDING_USER_PIN_PROMPT is set only by the
    // mobile-money collections that genuinely have not been paid yet, and is
    // the same discriminator payment-service's own webhook handlers use to
    // decide whether a payment is still unresolved.
    if (providerStatus === 'PENDING_USER_PIN_PROMPT') {
      session.status = 'PAYMENT_PENDING';
      markStep(session, 'PAYMENT', 'pending');
      await sessionRepository.save(session);

      logger.info('[saga] awaiting mobile money confirmation — no order created yet', {
        sessionId: session.id,
        paymentRef,
      });

      // Returned, not thrown: nothing has gone wrong, so the compensation
      // stack must NOT run. Releasing the holds or refunding here would undo a
      // purchase the customer is still in the middle of approving.
      return session;
    }

    // A confirmed payment with nothing to address a refund to.
    //
    // `paymentRef` is `reference ?? paymentId`, so this is only reached when
    // the provider returned 2xx carrying neither. The refund compensation
    // below was wrapped in `if (paymentRef)`, which meant that case silently
    // produced a charge with no compensation registered: any later failure
    // unwound the inventory and left the money taken.
    //
    // Continuing is strictly worse than stopping — without an identifier this
    // payment cannot be refunded here, linked to its sub-orders in 4b, or
    // reconciled afterwards. Aborting at least stops an order being built on
    // top of it, and says so loudly.
    if (!paymentRef) {
      logger.error('[saga] payment accepted with no reference or id — cannot refund or reconcile', {
        sessionId: session.id,
        amount:    session.total,
        providerStatus,
      });
      throw new StepFailedError('PAYMENT', 'the provider returned no payment reference');
    }

    session.status = 'PAYMENT_CONFIRMED';
    markStep(session, 'PAYMENT', 'completed');

    // Registered BEFORE the session is persisted, not after.
    //
    // `sessionRepository.save` throws when Redis is unavailable. With the push
    // below it, that throw landed in the catch block with the charge already
    // settled and no refund on the compensation stack: the inventory was
    // released and the coupon reversed, and the customer's money stayed taken.
    //
    // Registering a compensation is pure in-memory bookkeeping — nothing can
    // fail between these two lines — so it costs nothing to do it first and it
    // closes the window entirely. Same rule as the order-cancel push below: the
    // compensation goes on the stack in the same breath as the effect it undoes.
    compensations.push({
      label: `refund ${paymentRef}`,
      run: async () => {
        await call(`${SERVICES.payment}/api/v1/payments/${encodeURIComponent(paymentRef)}/refund`, {
          service: 'payment-service',
          method:  'POST',
          actorId: session.userId,
          idempotencyKey: `checkout:${session.id}:refund`,
          body: { reason: 'checkout_failed' },
        });
      },
    });

    await sessionRepository.save(session);

    // ── 4. Create the order ──────────────────────────────────────────────
    const orderRes = await call<{
      data?: { id?: string; subOrders?: SubOrderSummary[] };
      id?: string;
      message?: string;
    }>(
      `${SERVICES.order}/api/v1/orders`,
      {
        service: 'order-service',
        method:  'POST',
        actorId: session.userId,
        idempotencyKey: `checkout:${session.id}:order`,
        // order-service re-prices every line against the catalogue and ignores
        // any monetary field sent here, so only the three things it cannot
        // derive are passed: which variant, how many, and the reservation this
        // saga is already holding for it. Sending our own totals would be
        // noise at best and a second, disagreeing source of truth at worst.
        body: {
          userId:    session.userId,
          sessionId: session.id,
          items: reserved.map((line) => ({
            productId:     line.productId,
            variantId:     line.variantId,
            quantity:      line.quantity,
            reservationId: line.reservationId,
          })),
          shipping:       shippingFor(session),
          // The shipping this checkout actually quoted and charged. Without
          // it order-service applies its own 5,000-per-seller default and the
          // recorded order total stops matching the payment.
          //
          // Preferring shipping-service's own per-seller figures: it quoted one
          // parcel per seller, so it knows what each consignment costs.
          // Splitting the total by line value instead — the fallback, used only
          // when no quote came back — bills the seller of an expensive light
          // item more to ship than the seller of a cheap heavy one.
          vendorShippingFees: Object.keys(session.vendorShipping ?? {}).length > 0
            ? session.vendorShipping
            : splitAcrossSellers(priced.items, session.shippingCost),
          // Likewise the tax. order-service recorded none at all, so the order
          // total was short by exactly what the customer was taxed.
          vendorTaxes: splitAcrossSellers(priced.items, session.taxAmount),
          discountAmount: session.couponDiscount,
          // The binding per-seller split. order-service records it rather than
          // spreading the total across sub-orders itself — a proportional
          // spread would charge seller B for seller A promotion.
          vendorDiscounts: session.vendorDiscounts,
          couponCode:     session.couponCode,
          paymentMethod:  session.paymentMethod?.type,
          paymentId,
        },
      },
    );

    if (!orderRes.ok) {
      throw new StepFailedError('CREATE_ORDER', orderRes.data.message ?? `status ${orderRes.status}`);
    }

    const orderId = orderRes.data.data?.id ?? orderRes.data.id;
    if (!orderId) throw new StepFailedError('CREATE_ORDER', 'order-service returned no order id');

    session.orderId = orderId;
    session.status  = 'ORDER_CREATED';
    markStep(session, 'CREATE_ORDER', 'completed');

    // Registered HERE, immediately after the order exists — not after step 4b
    // below, which is where it used to sit.
    //
    // `call()` throws ServiceUnavailableError on a timeout or connection
    // failure, and `sessionRepository.save` throws when Redis is down. Either
    // one, anywhere in 4b, landed in the catch block with the order already
    // created and this compensation not yet on the stack: the customer's
    // payment was refunded and their inventory released, but the order stayed
    // behind — paid for by nobody, and fulfillable.
    //
    // A compensation must be registered in the same breath as the effect it
    // undoes. Nothing may sit between them.
    compensations.push({
      label: `cancel order ${orderId}`,
      run: async () => {
        await call(`${SERVICES.order}/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
          service: 'order-service',
          method:  'POST',
          actorId: session.userId,
          body: { reason: 'checkout_failed' },
        });
      },
    });

    await sessionRepository.save(session);

    // ── 4b. Tell payment-service which sub-orders its money belongs to ───
    //
    // Escrow and the vendor ledger were written when the payment cleared —
    // before this order existed — so the ledger row is keyed on a synthetic id
    // derived from the checkout session. Delivery later arrives carrying
    // order-service's real sub-order id, which matched nothing, so the
    // seller's money sat in `pendingBalance` and was never released.
    //
    // This also hands over order-service's own `vendorShare` and
    // `platformCommission`, replacing the figures payment-service derived from
    // its own copy of the commission rate. One seller, one payout number.
    //
    // Deliberately NOT fatal and NOT compensated: the customer has paid and
    // the order exists, so failing the checkout here would be worse than a
    // settlement record that needs re-linking. It is idempotent, so a retry is
    // free, and a failure is recorded on the session rather than swallowed.
    const subOrders = orderRes.data.data?.subOrders ?? [];
    if (subOrders.length > 0 && paymentRef) {
      const linkRes = await call<{ message?: string }>(
        `${SERVICES.payment}/api/v1/payments/${encodeURIComponent(paymentRef)}/sub-orders`,
        {
          service: 'payment-service',
          method:  'POST',
          actorId: session.userId,
          body: {
            orderId,
            subOrders: subOrders.map((so) => ({
              sellerId:           so.sellerId,
              subOrderId:         so.id,
              vendorShare:        so.vendorShare,
              platformCommission: so.platformCommission,
            })),
          },
        },
      );

      if (!linkRes.ok) {
        logger.error('[saga] settlement not linked — vendor funds cannot be released until it is', {
          sessionId: session.id, orderId, paymentRef,
          reason: linkRes.data.message ?? `status ${linkRes.status}`,
        });
        markStep(session, 'LINK_SETTLEMENT', 'failed', linkRes.data.message);
      } else {
        markStep(session, 'LINK_SETTLEMENT', 'completed');
      }
      await sessionRepository.save(session);
    }

    // ── 5. Settle the reservations into real stock movement ──────────────
    // Past this point the order exists and is paid. A deduct failure is
    // logged for reconciliation rather than unwound — cancelling a paid,
    // confirmed order because one stock decrement lagged would be worse than
    // a brief inventory discrepancy the expiry worker and audit will catch.
    for (const line of reserved) {
      try {
        const res = await call(
          `${SERVICES.inventory}/api/v1/inventory/${encodeURIComponent(line.variantId)}/deduct`,
          {
            service: 'inventory-service',
            method:  'POST',
            actorId: session.userId,
            body:    { quantity: line.quantity, reservationId: line.reservationId },
          },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
      } catch (err) {
        logger.error('[saga] deduct failed after order creation — needs reconciliation', {
          sessionId: session.id,
          orderId,
          variantId: line.variantId,
          reservationId: line.reservationId,
          error: (err as Error).message,
        });
      }
    }

    markStep(session, 'DEDUCT_INVENTORY', 'completed');
    session.status    = 'COMPLETED';
    session.updatedAt = new Date().toISOString();
    await sessionRepository.save(session);

    return session;

  } catch (err) {
    const error = err as Error & { status?: number };

    markStep(session, 'COMPENSATE', 'pending');
    logger.warn('[saga] checkout failed — compensating', {
      sessionId: session.id,
      reason: error.message,
      steps: compensations.length,
    });

    // Unwind in reverse. A compensation that itself fails must not mask the
    // original cause, so each is caught and logged individually.
    for (const compensation of [...compensations].reverse()) {
      try {
        await compensation.run();
      } catch (compErr) {
        logger.error('[saga] compensation failed — needs manual reconciliation', {
          sessionId: session.id,
          compensation: compensation.label,
          error: (compErr as Error).message,
        });
      }
    }

    session.status        = 'FAILED';
    session.failureReason = error.message;
    markStep(session, 'COMPENSATE', 'completed');
    await sessionRepository.save(session);

    throw error;
  }
}
