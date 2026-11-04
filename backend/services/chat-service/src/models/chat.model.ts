import { Schema, model } from 'mongoose';

export type MessageType = 'text' | 'image' | 'file' | 'product_link' | 'quick_reply' | 'offer' | 'system';
export type SenderRole = 'buyer' | 'seller' | 'system';

/** Deterministic room id for a buyer-seller-product context — one thread per triple. */
export function buildRoomId(buyerId: string, sellerId: string, productId?: string): string {
  return `room:${buyerId}:${sellerId}:${productId ?? 'general'}`;
}

// ─── Conversation ──────────────────────────────────────────────────────────────

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

const conversationSchema = new Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    buyerId: { type: String, required: true, index: true },
    buyerName: { type: String, required: true },
    sellerId: { type: String, required: true, index: true },
    sellerStoreName: { type: String, required: true },
    productId: { type: String },
    lastMessage: { type: String },
    lastMessageAt: { type: Date },
    unreadCountBuyer: { type: Number, default: 0 },
    unreadCountSeller: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ConversationModel = model('Conversation', conversationSchema);

// ─── Message (with read receipts) ───────────────────────────────────────────────

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

const messageSchema = new Schema(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderRole: { type: String, enum: ['buyer', 'seller', 'system'], required: true },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'product_link', 'quick_reply', 'offer', 'system'],
      default: 'text',
    },
    content: { type: String, required: true },
    wasMasked: { type: Boolean, default: false },
    attachments: { type: [String], default: undefined },
    productId: { type: String },
    offerId: { type: String },
    readBy: {
      type: [{ userId: String, readAt: Date }],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const MessageModel = model('ChatMessage', messageSchema);
