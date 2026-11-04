export type SenderRole = 'buyer' | 'seller' | 'system';
export type MessageType = 'text' | 'image' | 'file' | 'product_link' | 'quick_reply' | 'offer' | 'system';

export interface ReadReceipt {
  userId: string;
  readAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: SenderRole;
  messageType: MessageType;
  content: string;
  wasMasked: boolean;
  attachments?: string[];
  productId?: string;
  offerId?: string;
  readBy: ReadReceipt[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  roomId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerStoreName: string;
  productId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCountBuyer: number;
  unreadCountSeller: number;
  createdAt: string;
  updatedAt: string;
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'expired';
export type OfferParty = 'buyer' | 'seller';

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

export const MAX_OFFERS_PER_PRODUCT = 3;
