import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import {
  OfferModel,
  MAX_OFFERS_PER_USER_PER_PRODUCT,
  OFFER_EXPIRY_MS,
  type Offer,
  type OfferParty,
} from '../models/offer.model.js';
import { chatService } from './chat.service.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';

// ─── Offer checkout token secret ──────────────────────────────────────────────
//
// This secret signs the token that unlocks a negotiated price at checkout, so
// forging one lets a buyer name their own price on any product. It used to
// fall back to the literal 'muni-dev-offer-checkout-secret-change-me', which
// is committed to this repository: one unset variable in one environment
// silently made discounted checkout forgeable by anyone who has read the
// source, and nothing surfaced the mistake.
//
// Same policy as backend/shared/utils/token.ts, deliberately reimplemented
// here rather than imported — that module resolves JWT_ACCESS_SECRET and
// JWT_REFRESH_SECRET at import time and would throw on boot in chat-service,
// which is not issued those variables.
//
//   • production   → a missing or short secret is fatal at startup.
//   • development  → a random per-process secret, with a loud warning. Tokens
//                    stop working across restarts, which is annoying on
//                    purpose: it pushes you to set the variable.

const MIN_SECRET_LENGTH = 32;

function resolveCheckoutSecret(): string {
  const value = process.env.OFFER_CHECKOUT_SECRET;
  if (value && value.length >= MIN_SECRET_LENGTH) return value;

  const problem = !value
    ? 'OFFER_CHECKOUT_SECRET is not set'
    : `OFFER_CHECKOUT_SECRET is only ${value.length} characters (minimum ${MIN_SECRET_LENGTH})`;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[security] ${problem}. Refusing to start: a forged offer checkout token ` +
      `lets a buyer set their own price. Set OFFER_CHECKOUT_SECRET to a random ` +
      `value of at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }

  console.warn(
    `[security] ${problem}. Using a random per-process secret — accepted-offer ` +
    `checkout tokens will not survive a restart. Set OFFER_CHECKOUT_SECRET in your .env.`,
  );
  return randomBytes(48).toString('hex');
}

const CHECKOUT_TOKEN_SECRET = resolveCheckoutSecret();
const CHECKOUT_TOKEN_TTL = '30m';

export class OfferLimitError extends Error {
  status = 429;
}
export class OfferStateError extends Error {
  status = 409;
}
export class OfferNotFoundError extends Error {
  status = 404;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toOfferDTO(doc: any): Offer {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    productId: doc.productId,
    buyerId: doc.buyerId,
    sellerId: doc.sellerId,
    originalPrice: doc.originalPrice,
    offerPrice: doc.offerPrice,
    currency: doc.currency,
    status: doc.status,
    round: doc.round,
    parentOfferId: doc.parentOfferId ?? undefined,
    proposedBy: doc.proposedBy,
    checkoutToken: doc.checkoutToken ?? undefined,
    expiresAt: new Date(doc.expiresAt).toISOString(),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

export interface CheckoutTokenPayload {
  offerId: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  currency: string;
}

export function verifyCheckoutToken(token: string): CheckoutTokenPayload {
  return jwt.verify(token, CHECKOUT_TOKEN_SECRET) as CheckoutTokenPayload;
}

export class OfferService {
  /** Buyer opens a fresh negotiation thread on a product. Capped at 3 per buyer per product. */
  async createOffer(input: {
    conversationId: string;
    productId: string;
    buyerId: string;
    sellerId: string;
    originalPrice: number;
    offerPrice: number;
    currency?: string;
  }): Promise<Offer> {
    if (!(input.offerPrice > 0)) {
      throw new Error('Offer price must be greater than 0');
    }
    if (input.offerPrice >= input.originalPrice) {
      throw new Error('Offer must be below the listed price');
    }

    // Only root offers (fresh negotiation threads) count against the cap —
    // accepting/declining/countering an existing thread isn't a new "offer".
    const rootOfferCount = await OfferModel.countDocuments({
      buyerId: input.buyerId,
      productId: input.productId,
      parentOfferId: { $exists: false },
    });
    if (rootOfferCount >= MAX_OFFERS_PER_USER_PER_PRODUCT) {
      throw new OfferLimitError(
        `You've reached the maximum of ${MAX_OFFERS_PER_USER_PER_PRODUCT} offers for this product`,
      );
    }

    const doc = await OfferModel.create({
      conversationId: input.conversationId,
      productId: input.productId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      originalPrice: input.originalPrice,
      offerPrice: input.offerPrice,
      currency: input.currency ?? 'UGX',
      status: 'pending',
      round: 1,
      proposedBy: 'buyer',
      expiresAt: new Date(Date.now() + OFFER_EXPIRY_MS),
    });

    await chatService.sendMessage({
      conversationId: input.conversationId,
      senderId: input.buyerId,
      senderRole: 'buyer',
      messageType: 'offer',
      content: `Made an offer of ${doc.currency} ${doc.offerPrice.toLocaleString()}`,
      offerId: doc._id.toString(),
      productId: input.productId,
    });

    const dto = toOfferDTO(doc);
    void publish(Topics.OFFER_EVENTS, { type: 'offer.created', data: dto });
    return dto;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getLiveOfferOrThrow(offerId: string): Promise<any> {
    const doc = await OfferModel.findById(offerId).catch(() => null);
    if (!doc) throw new OfferNotFoundError('Offer not found');

    if (doc.status === 'pending' && doc.expiresAt.getTime() < Date.now()) {
      doc.status = 'expired';
      await doc.save();
      void publish(Topics.OFFER_EVENTS, { type: 'offer.expired', data: toOfferDTO(doc) });
    }

    return doc;
  }

  async acceptOffer(offerId: string, actingUserId: string): Promise<Offer> {
    const doc = await this.getLiveOfferOrThrow(offerId);
    if (doc.sellerId !== actingUserId) throw new OfferStateError('Only the seller can accept this offer');
    if (doc.status !== 'pending') throw new OfferStateError(`Offer is ${doc.status}, cannot accept`);

    const payload: CheckoutTokenPayload = {
      offerId: doc._id.toString(),
      productId: doc.productId,
      buyerId: doc.buyerId,
      sellerId: doc.sellerId,
      price: doc.offerPrice,
      currency: doc.currency,
    };
    const checkoutToken = jwt.sign(payload, CHECKOUT_TOKEN_SECRET, { expiresIn: CHECKOUT_TOKEN_TTL });

    doc.status = 'accepted';
    doc.checkoutToken = checkoutToken;
    await doc.save();

    await chatService.sendMessage({
      conversationId: doc.conversationId,
      senderId: actingUserId,
      senderRole: 'seller',
      messageType: 'system',
      content: `Offer accepted! Discounted checkout unlocked at ${doc.currency} ${doc.offerPrice.toLocaleString()}.`,
      offerId: doc._id.toString(),
      productId: doc.productId,
    });

    const dto = toOfferDTO(doc);
    void publish(Topics.OFFER_EVENTS, { type: 'offer.accepted', data: dto });
    return dto;
  }

  async declineOffer(offerId: string, actingUserId: string): Promise<Offer> {
    const doc = await this.getLiveOfferOrThrow(offerId);
    if (doc.sellerId !== actingUserId) throw new OfferStateError('Only the seller can decline this offer');
    if (doc.status !== 'pending') throw new OfferStateError(`Offer is ${doc.status}, cannot decline`);

    doc.status = 'declined';
    await doc.save();

    await chatService.sendMessage({
      conversationId: doc.conversationId,
      senderId: actingUserId,
      senderRole: 'seller',
      messageType: 'system',
      content: `Offer of ${doc.currency} ${doc.offerPrice.toLocaleString()} was declined.`,
      offerId: doc._id.toString(),
      productId: doc.productId,
    });

    const dto = toOfferDTO(doc);
    void publish(Topics.OFFER_EVENTS, { type: 'offer.declined', data: dto });
    return dto;
  }

  async counterOffer(
    offerId: string,
    input: { actingUserId: string; actingRole: OfferParty; counterPrice: number },
  ): Promise<Offer> {
    if (!(input.counterPrice > 0)) {
      throw new Error('Counter price must be greater than 0');
    }

    const parent = await this.getLiveOfferOrThrow(offerId);
    if (parent.status !== 'pending') throw new OfferStateError(`Offer is ${parent.status}, cannot counter`);

    const expectedUserId = input.actingRole === 'buyer' ? parent.buyerId : parent.sellerId;
    if (expectedUserId !== input.actingUserId) {
      throw new OfferStateError('Not a participant in this negotiation');
    }

    parent.status = 'countered';
    await parent.save();

    const doc = await OfferModel.create({
      conversationId: parent.conversationId,
      productId: parent.productId,
      buyerId: parent.buyerId,
      sellerId: parent.sellerId,
      originalPrice: parent.originalPrice,
      offerPrice: input.counterPrice,
      currency: parent.currency,
      status: 'pending',
      round: parent.round + 1,
      parentOfferId: parent._id.toString(),
      proposedBy: input.actingRole,
      expiresAt: new Date(Date.now() + OFFER_EXPIRY_MS),
    });

    await chatService.sendMessage({
      conversationId: parent.conversationId,
      senderId: input.actingUserId,
      senderRole: input.actingRole,
      messageType: 'offer',
      content: `Countered with ${parent.currency} ${input.counterPrice.toLocaleString()}`,
      offerId: doc._id.toString(),
      productId: parent.productId,
    });

    const dto = toOfferDTO(doc);
    void publish(Topics.OFFER_EVENTS, { type: 'offer.countered', data: dto });
    return dto;
  }

  async getOffer(offerId: string): Promise<Offer> {
    const doc = await this.getLiveOfferOrThrow(offerId);
    return toOfferDTO(doc);
  }

  async getOffersForConversation(conversationId: string): Promise<Offer[]> {
    const docs = await OfferModel.find({ conversationId }).sort({ createdAt: 1 });
    return docs.map(toOfferDTO);
  }

  async getOffersForBuyerProduct(buyerId: string, productId: string): Promise<Offer[]> {
    const docs = await OfferModel.find({ buyerId, productId }).sort({ createdAt: 1 });
    return docs.map(toOfferDTO);
  }
}

export const offerService = new OfferService();
