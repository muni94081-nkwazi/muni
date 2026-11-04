import { Schema, model } from 'mongoose';

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'expired';
export type OfferParty = 'buyer' | 'seller';

export const MAX_OFFERS_PER_USER_PER_PRODUCT = 3;
export const OFFER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface Offer {
  id: string;
  conversationId: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  originalPrice: number;
  offerPrice: number;
  currency: string;
  status: OfferStatus;
  round: number;
  parentOfferId?: string;
  proposedBy: OfferParty;
  checkoutToken?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

const offerSchema = new Schema(
  {
    conversationId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    buyerId: { type: String, required: true, index: true },
    sellerId: { type: String, required: true, index: true },
    originalPrice: { type: Number, required: true },
    offerPrice: { type: Number, required: true },
    currency: { type: String, default: 'UGX' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'countered', 'expired'],
      default: 'pending',
      index: true,
    },
    round: { type: Number, default: 1 },
    parentOfferId: { type: String },
    proposedBy: { type: String, enum: ['buyer', 'seller'], required: true },
    checkoutToken: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const OfferModel = model('Offer', offerSchema);
