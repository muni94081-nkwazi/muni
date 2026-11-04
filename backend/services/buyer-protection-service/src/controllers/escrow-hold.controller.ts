import type { Request, Response } from 'express';
import { escrowHoldService, EscrowHoldNotFoundError, EscrowHoldStateError } from '../services/escrow-hold.service.js';

// ─── Escrow hold controller ───────────────────────────────────────────────────
//
// These endpoints decide when a seller gets paid and whose money is frozen.
// They had no authentication in front of them and resolved the caller from
// `x-user-id`, falling back to the request body and then to a hardcoded
// 'user-123' / 'seller-001'. Identity now comes from `res.locals`, filled in by
// the shared auth middleware from the gateway's signed assertion (see app.ts),
// and the write paths that a peer service drives are gated on the `svc` claim
// that only a service can mint.

/** Roles that legitimately see any party's escrow. */
const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN', 'ROLE_OPS', 'ROLE_FINANCE'];

function isStaff(res: Response): boolean {
  const roles = (res.locals.roles as string[]) ?? [];
  return Boolean(res.locals.callingService) || roles.some((r) => STAFF_ROLES.includes(r));
}

function handleError(err: unknown, res: Response): void {
  if (err instanceof EscrowHoldNotFoundError) {
    res.status(404).json({ success: false, message: err.message });
    return;
  }
  if (err instanceof EscrowHoldStateError) {
    res.status(409).json({ success: false, message: err.message });
    return;
  }
  res.status(502).json({ success: false, message: (err as Error).message });
}

/** Called by checkout-service/order-service once payment for an order clears. */
export async function createHold(req: Request, res: Response): Promise<void> {
  const { orderId, subOrderId, buyerId, sellerId, amount, currency } = req.body;
  if (!orderId || !buyerId || !sellerId || !amount) {
    res.status(400).json({ success: false, message: 'orderId, buyerId, sellerId, and amount are required' });
    return;
  }

  try {
    const hold = await escrowHoldService.createHold({ orderId, subOrderId, buyerId, sellerId, amount: Number(amount), currency });
    res.status(201).json({ success: true, data: hold });
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * The hold on one order, to the two parties on it and to staff.
 *
 * A stranger gets the same 404 as a caller asking about an order that has no
 * hold: a 403 would confirm the order exists and turn this into an oracle for
 * probing other people's purchases — and it answers with the buyer id, the
 * seller id and the amount held.
 */
export async function getHold(req: Request, res: Response): Promise<void> {
  const hold = await escrowHoldService.getHold(req.params.orderId as string, req.query.subOrderId as string | undefined);
  const callerId = res.locals.userId as string;

  if (!hold || !(isStaff(res) || hold.buyerId === callerId || hold.sellerId === callerId)) {
    res.status(404).json({ success: false, message: 'No escrow hold found for this order' });
    return;
  }
  res.json({ success: true, data: hold });
}

/** Called by shipping/fulfillment once delivery is verified (e.g. courier POD or tracking-carrier confirmation). */
export async function markDelivered(req: Request, res: Response): Promise<void> {
  const { orderId, subOrderId, deliveredAt, expectedDeliveryAt } = req.body;
  if (!orderId || !deliveredAt) {
    res.status(400).json({ success: false, message: 'orderId and deliveredAt are required' });
    return;
  }

  try {
    const hold = await escrowHoldService.markDelivered(orderId, subOrderId, deliveredAt, expectedDeliveryAt);
    res.json({ success: true, data: hold });
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * Buyer-facing: "I received my order" — releases payout immediately.
 *
 * `escrowHoldService.confirmReceipt` has always refused a buyer id that is not
 * the one on the hold. What defeated that check was this line taking the buyer
 * id from a header and then from `req.body.buyerId`, so it compared the
 * caller's own claim against itself: naming the real buyer released a
 * stranger's escrow to the seller, before delivery and past any open dispute.
 */
export async function confirmReceipt(req: Request, res: Response): Promise<void> {
  const buyerId = res.locals.userId as string;
  const { subOrderId } = req.body;

  try {
    const hold = await escrowHoldService.confirmReceipt(req.params.orderId as string, subOrderId, buyerId);
    res.json({ success: true, data: hold, message: 'Receipt confirmed — payout released to the seller' });
  } catch (err) {
    handleError(err, res);
  }
}

/** Called by dispute-service when a claim is filed against this order. */
export async function holdForDispute(req: Request, res: Response): Promise<void> {
  const { orderId, subOrderId, disputeId } = req.body;
  if (!orderId || !disputeId) {
    res.status(400).json({ success: false, message: 'orderId and disputeId are required' });
    return;
  }

  try {
    const hold = await escrowHoldService.holdForDispute(orderId, subOrderId, disputeId);
    res.json({ success: true, data: hold });
  } catch (err) {
    handleError(err, res);
  }
}

/** Called by dispute-service once a dispute resolves. */
export async function resolveDisputeHold(req: Request, res: Response): Promise<void> {
  const { orderId, subOrderId, disputeId, outcome } = req.body;
  if (!orderId || !outcome) {
    res.status(400).json({ success: false, message: 'orderId and outcome (SELLER_FAVOR | BUYER_FAVOR) are required' });
    return;
  }

  try {
    const hold =
      outcome === 'BUYER_FAVOR'
        ? await escrowHoldService.refundToBuyer(orderId, subOrderId, disputeId)
        : await escrowHoldService.resolveDisputeSellerFavor(orderId, subOrderId);
    res.json({ success: true, data: hold });
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * A seller's own pending payouts.
 *
 * The seller id is the caller's, not the query string's — `?sellerId=` used to
 * be believed from anyone, and with no identity at all the list fell back to
 * 'seller-001'. Staff may still name a seller, which is what a support agent
 * looking into a payout query needs.
 */
export async function listBySeller(req: Request, res: Response): Promise<void> {
  const requested = req.query.sellerId as string | undefined;
  const sellerId = isStaff(res) && requested ? requested : (res.locals.userId as string);
  const holds = await escrowHoldService.listBySeller(sellerId);
  res.json({ success: true, data: holds });
}

export async function listAll(_req: Request, res: Response): Promise<void> {
  const holds = await escrowHoldService.listAll();
  res.json({ success: true, data: holds });
}
