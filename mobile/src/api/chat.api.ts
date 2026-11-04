import { apiClient, type ApiEnvelope } from './client';

// chat-service envelopes every response (`{ success, data }`), so these unwrap
// `.data`. The gateway mounts it at /api/v1/chat behind auth() — conversations
// are private to their two parties, and the service resolves the caller from
// the gateway's verified assertion, never from anything the client sends.

export type MessageType = 'text' | 'image' | 'file' | 'product_link' | 'quick_reply' | 'offer' | 'system';
export type SenderRole = 'buyer' | 'seller' | 'system';

/**
 * One buyer-seller thread. The service keys a room on
 * (buyerId, sellerId, productId) so a shopper asking about two products of the
 * same store gets two threads, not one mixed one.
 */
export interface Conversation {
  id: string;
  roomId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerStoreName: string;
  productId?: string;
  lastMessage?: string;
  /** ISO string; absent until the first message lands. */
  lastMessageAt?: string;
  unreadCountBuyer: number;
  unreadCountSeller: number;
  createdAt: string;
  updatedAt: string;
}

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
  /** The service redacts contact details to keep deals on-platform. */
  wasMasked: boolean;
  attachments?: string[];
  productId?: string;
  offerId?: string;
  readBy: ReadReceipt[];
  createdAt: string;
}

export const chatApi = {
  listConversations: async (): Promise<Conversation[]> => {
    const { data } = await apiClient.get<ApiEnvelope<Conversation[]>>('/api/v1/chat/conversations');
    return data.data;
  },

  listMessages: async (conversationId: string, limit = 50): Promise<ChatMessage[]> => {
    const { data } = await apiClient.get<ApiEnvelope<ChatMessage[]>>(
      `/api/v1/chat/conversations/${conversationId}/messages`,
      { params: { limit } },
    );
    return data.data;
  },

  /**
   * `senderId` and `senderRole` are deliberately not sent: the service derives
   * both from the authenticated caller and which side of the thread they are
   * on, so a buyer cannot post a message that renders as the store's reply.
   */
  sendMessage: async (conversationId: string, content: string): Promise<ChatMessage> => {
    const { data } = await apiClient.post<ApiEnvelope<ChatMessage>>(
      `/api/v1/chat/conversations/${conversationId}/messages`,
      { content, messageType: 'text' satisfies MessageType },
    );
    return data.data;
  },

  markAsRead: async (conversationId: string): Promise<void> => {
    await apiClient.put(`/api/v1/chat/conversations/${conversationId}/read`);
  },

  /**
   * Opens (or returns) the thread between this shopper and a seller.
   *
   * `buyerId` is deliberately not sent: the service takes it from the verified
   * caller, having previously let `req.body.buyerId` win — which allowed
   * opening a conversation in someone else's name. `sellerId` and
   * `sellerStoreName` are the service's only required fields, and both come
   * from the product record, so nothing here is invented client-side.
   *
   * A room is keyed on (buyerId, sellerId, productId), so asking about two
   * products from one store gives two threads rather than one mixed one.
   */
  startConversation: async (input: {
    sellerId: string;
    sellerStoreName: string;
    productId?: string;
    initialMessage?: string;
    buyerName?: string;
  }): Promise<Conversation> => {
    const { data } = await apiClient.post<ApiEnvelope<Conversation>>(
      '/api/v1/chat/conversations',
      input,
    );
    return data.data;
  },
};

/** The unread count that applies to this user, whichever side they are on. */
export function unreadFor(conversation: Conversation, userId: string | undefined): number {
  if (!userId) return 0;
  return conversation.sellerId === userId
    ? conversation.unreadCountSeller
    : conversation.unreadCountBuyer;
}
