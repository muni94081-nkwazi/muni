import type { Request, Response } from 'express';
import { offerService, OfferLimitError, OfferStateError, OfferNotFoundError } from '../services/offer.service.js';
import { httpActor, loadParticipantConversation, type ChatActor } from '../auth/identity.js';

// ─── Offer ("Make an Offer") REST Controllers ─────────────────────────────────
//
// Identity was previously
//   req.headers['x-user-id'] || req.body.userId || 'user-123'
// — entirely client-supplied. offerService does check that the acting user is
// the right party (only the seller may accept/decline; counter validates the
// claimed role against the offer), but those checks were being handed an id
// the caller chose, so anyone could pass a seller's id and accept offers as
// them. Sourcing identity from the verified assertion is what makes those
// existing checks mean anything.

function param(req: Request, name: string): string {
  return req.params[name] as string;
}

function unauthenticated(res: Response): void {
  res.status(401).json({ success: false, message: 'Authentication required' });
}

function handleError(err: unknown, res: Response): void {
  if (err instanceof OfferLimitError || err instanceof OfferStateError || err instanceof OfferNotFoundError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }
  res.status(400).json({ success: false, message: (err as Error).message });
}

/** Offers are visible only to the two parties (and staff). */
function isOfferParty(offer: { buyerId: string; sellerId: string }, actor: ChatActor): boolean {
  if (offer.buyerId === actor.userId || offer.sellerId === actor.userId) return true;
  return actor.roles.some((role) => role === 'ROLE_ADMIN' || role === 'ROLE_SUPER_ADMIN');
}

export async function createOffer(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const { conversationId, productId, originalPrice, offerPrice, currency } = req.body;

  if (!conversationId || !productId || originalPrice == null || offerPrice == null) {
    res.status(400).json({
      success: false,
      message: 'conversationId, productId, originalPrice and offerPrice are required',
    });
    return;
  }

  try {
    // The conversation is the authority on who the seller is. `req.body.sellerId`
    // is no longer read: a client could otherwise raise an offer against a
    // conversation it is not part of, naming an unrelated seller.
    const conversation = await loadParticipantConversation(conversationId, actor);
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const data = await offerService.createOffer({
      conversationId,
      productId,
      buyerId: actor.userId,
      sellerId: conversation.sellerId,
      originalPrice: Number(originalPrice),
      offerPrice: Number(offerPrice),
      currency,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOffer(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  try {
    const data = await offerService.getOffer(param(req, 'id'));
    // offerService.getOffer has no authorization of its own — any offer id
    // returned its full contents (both parties' ids and the negotiated price)
    // to anyone who asked.
    if (!isOfferParty(data, actor)) {
      res.status(404).json({ success: false, message: 'Offer not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getConversationOffers(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const conversationId = param(req, 'conversationId');

  try {
    const conversation = await loadParticipantConversation(conversationId, actor);
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const data = await offerService.getOffersForConversation(conversationId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getMyProductOffers(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const productId = param(req, 'productId');
  try {
    // Already scoped to the buyer — now scoped to the *verified* buyer.
    const data = await offerService.getOffersForBuyerProduct(actor.userId, productId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}

export async function acceptOffer(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  try {
    // offerService enforces "only the seller can accept" against this id.
    const data = await offerService.acceptOffer(param(req, 'id'), actor.userId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}

export async function declineOffer(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  try {
    const data = await offerService.declineOffer(param(req, 'id'), actor.userId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}

export async function counterOffer(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const { counterPrice, actingRole } = req.body;
  if (counterPrice == null || !actingRole) {
    res.status(400).json({ success: false, message: 'counterPrice and actingRole are required' });
    return;
  }

  try {
    // offerService cross-checks actingRole against the offer's own buyer/seller
    // ids, so a caller cannot counter as the other party.
    const data = await offerService.counterOffer(param(req, 'id'), {
      actingUserId: actor.userId,
      actingRole,
      counterPrice: Number(counterPrice),
    });
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}
