import crypto from 'node:crypto';
import { InitiateCheckoutSchema, type CheckoutSession } from '../models/checkout.model.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { runCheckoutSaga } from '../saga/checkout.saga.js';
import { call, SERVICES } from '../clients/service.client.js';
import { logger } from '../utils/logger.js';

// ─── Checkout Service ─────────────────────────────────────────────────────────
//
// Every read and mutation takes the acting user. Ownership is enforced here
// rather than in the controller so a future caller cannot skip it by going
// straight to the service — the previous controller looked sessions up by
// `req.params.sessionId` alone, letting any authenticated user read another
// customer's cart, address and phone number, or cancel their order mid-purchase.

const ADMIN_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'];

export interface Actor {
  id:    string;
  roles: string[];
}

export class SessionNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('Checkout session not found'); this.name = 'SessionNotFoundError'; }
}

/**
 * A delivery address the courier could not act on.
 *
 * 400, and raised before the saga starts: the alternative — which is what this
 * service did until now — is to discover it inside order-service at step 4,
 * with stock already held and the card already charged.
 */
export class InvalidAddressError extends Error {
  readonly status = 400;
  constructor(readonly fields: Record<string, string[] | undefined>, message: string) {
    super(message);
    this.name = 'InvalidAddressError';
  }
}

export class InvalidSessionStateError extends Error {
  readonly status = 409;
  constructor(current: string, expected: string) {
    super(`This checkout is ${current.toLowerCase().replace(/_/g, ' ')} and cannot be ${expected}.`);
    this.name = 'InvalidSessionStateError';
  }
}

/**
 * Load a session the actor is allowed to see.
 *
 * Returns 404 rather than 403 on an ownership miss: a 403 confirms the id
 * exists, which turns the endpoint into an oracle for enumerating valid
 * session ids.
 */
/**
 * Drive a session to completion, once.
 *
 * The lock is what makes this safe to call concurrently. Webhooks retry, the
 * sweep runs on a timer, and the customer can press the button — all three can
 * arrive together, and the status guard alone is check-then-act: each reads
 * PAYMENT_PENDING, each runs the saga.
 *
 * Not the only guard, and deliberately described as what it is: order-service
 * already dedupes on `checkoutSessionId` behind a unique index, so a second
 * order was never the failure mode. What two concurrent sagas DO cause is the
 * same work twice — a second stock deduction and a second call to payment.
 *
 * Inside the lock the session is re-read, because the holder that just finished
 * may have completed it while this caller waited.
 */
async function redrive(session: CheckoutSession): Promise<CheckoutSession> {
  if (session.status === 'COMPLETED') return session; // already done — idempotent
  if (session.status !== 'PAYMENT_PENDING' && session.status !== 'INITIATED') {
    throw new InvalidSessionStateError(session.status, 'confirmed');
  }

  const acquired = await sessionRepository.acquireLock(session.id);
  if (!acquired) {
    // Someone else is mid-confirm. Answer with whatever is current rather than
    // erroring: from the caller's point of view the confirm is in progress, and
    // a retry racing the winner is not a fault.
    logger.info('[checkout] confirm already in flight — returning current state', { sessionId: session.id });
    return (await sessionRepository.find(session.id)) ?? session;
  }

  try {
    const fresh = (await sessionRepository.find(session.id)) ?? session;
    if (fresh.status === 'COMPLETED') return fresh;
    return await runCheckoutSaga(fresh);
  } finally {
    await sessionRepository.releaseLock(session.id);
  }
}

async function loadOwned(sessionId: string, actor: Actor): Promise<CheckoutSession> {
  const session = await sessionRepository.find(sessionId);
  if (!session) throw new SessionNotFoundError();

  const isOwner = session.userId === actor.id;
  const isStaff = actor.roles.some((r) => ADMIN_ROLES.includes(r));

  if (!isOwner && !isStaff) throw new SessionNotFoundError();
  return session;
}

export class CheckoutService {
  /**
   * Start a checkout. Note what is NOT read from `data`: any monetary field.
   * Totals come from pricing.service, which reads the cart by identity and
   * re-prices it against the catalogue.
   */
  async initiateCheckout(
    actor: Actor,
    data: { shippingAddress?: unknown; billingAddress?: unknown; paymentMethod?: { type: string; token?: string } },
  ): Promise<CheckoutSession> {
    // Before anything is saved and before the saga takes a single hold. An
    // address is the one part of this body the server cannot derive for
    // itself, so it is the one part worth rejecting up front.
    const parsed = InitiateCheckoutSchema.safeParse(data);
    if (!parsed.success) {
      const flat  = parsed.error.flatten();
      const first = Object.values(flat.fieldErrors).flat()[0]
        ?? parsed.error.issues[0]?.message
        ?? 'Delivery address is required';
      throw new InvalidAddressError(flat.fieldErrors, first);
    }

    const now = new Date();

    const session: CheckoutSession = {
      id:              crypto.randomUUID(),
      userId:          actor.id,
      status:          'INITIATED',
      cartSnapshot:    [],
      shippingAddress: parsed.data.shippingAddress,
      billingAddress:  parsed.data.billingAddress,
      paymentMethod:   parsed.data.paymentMethod ?? { type: 'cod' },
      // Zeroed, not client-supplied. runCheckoutSaga fills these in from the
      // catalogue before any money moves.
      subtotal:        0,
      total:           0,
      shippingCost:    0,
      taxAmount:       0,
      couponDiscount:  0,
      vendorDiscounts: {},
      vendorShipping:  {},
      // Filled in by the saga as it takes holds, and reused rather than
      // re-taken if the session is later re-driven by confirmPayment.
      reservations:    [],
      steps:           [{ step: 'INITIATE', status: 'completed', completedAt: now.toISOString() }],
      createdAt:       now.toISOString(),
      expiresAt:       new Date(now.getTime() + 15 * 60_000).toISOString(),
      updatedAt:       now.toISOString(),
    };

    await sessionRepository.save(session);
    return runCheckoutSaga(session);
  }

  async getSession(sessionId: string, actor: Actor): Promise<CheckoutSession> {
    return loadOwned(sessionId, actor);
  }

  /**
   * Re-drive a session that stopped at PAYMENT_PENDING (e.g. an async mobile
   * money collection that has since been confirmed by webhook).
   */
  async confirmPayment(sessionId: string, actor: Actor): Promise<CheckoutSession> {
    const session = await loadOwned(sessionId, actor);
    return redrive(session);
  }

  /**
   * Confirm without an acting user.
   *
   * For the `payment.succeeded` consumer and the reconciliation sweep, whose
   * trigger is a verified internal event rather than a request. There is no
   * caller to check ownership against, so there is no ownership check — the
   * HTTP path above keeps `loadOwned` and is untouched.
   *
   * Null means the session is gone: its TTL elapsed before the telco resolved
   * the collection. That is the lost order this whole mechanism exists to
   * catch, and the caller is expected to make noise about it.
   */
  async confirmPaymentFromSystem(sessionId: string, trigger: string): Promise<CheckoutSession | null> {
    const session = await sessionRepository.find(sessionId);
    if (!session) return null;

    logger.info('[checkout] system-driven confirm', { sessionId, trigger, status: session.status });
    return redrive(session);
  }

  /**
   * Give up on a pending session whose payment the provider has declined.
   *
   * Releases the inventory this checkout was holding. The saga's own
   * compensation stack cannot do it: that stack lives inside one `runCheckoutSaga`
   * call and was unwound (or, for a PENDING_USER_PIN_PROMPT return, deliberately
   * not built) long before this runs. The reservation ids were persisted on the
   * session for exactly this reason (see the note at saga step 2).
   */
  async failPendingSession(sessionId: string, reason: string): Promise<CheckoutSession | null> {
    const session = await sessionRepository.find(sessionId);
    if (!session) return null;
    if (session.status !== 'PAYMENT_PENDING') return session;

    for (const hold of session.reservations ?? []) {
      const res = await call(
        `${SERVICES.inventory}/api/v1/inventory/${encodeURIComponent(hold.variantId)}/release`,
        {
          service: 'inventory-service',
          method:  'POST',
          actorId: session.userId,
          body:    { reservationId: hold.reservationId },
        },
      );
      // A hold that has already lapsed answers 404/409; that is the desired end
      // state either way, so it is logged rather than retried.
      if (!res.ok) {
        logger.warn('[checkout] could not release hold while failing session', {
          sessionId, variantId: hold.variantId, status: res.status,
        });
      }
    }

    session.status        = 'FAILED';
    session.failureReason = reason;
    session.updatedAt     = new Date().toISOString();
    session.steps.push({ step: 'PAYMENT', status: 'failed', completedAt: session.updatedAt });

    await sessionRepository.save(session);
    logger.info('[checkout] pending session failed after provider decline', { sessionId, reason });
    return session;
  }

  async cancelCheckout(sessionId: string, actor: Actor): Promise<CheckoutSession> {
    const session = await loadOwned(sessionId, actor);

    if (session.status === 'COMPLETED') {
      throw new InvalidSessionStateError(session.status, 'cancelled');
    }

    session.status        = 'FAILED';
    session.failureReason = 'Cancelled by user';
    session.updatedAt     = new Date().toISOString();
    session.steps.push({ step: 'CANCEL', status: 'completed', completedAt: session.updatedAt });

    await sessionRepository.save(session);
    return session;
  }

  /** Scoped to the actor by construction — no id is accepted from the caller. */
  async getHistory(actor: Actor): Promise<CheckoutSession[]> {
    return sessionRepository.findByUser(actor.id);
  }
}

export const checkoutService = new CheckoutService();
