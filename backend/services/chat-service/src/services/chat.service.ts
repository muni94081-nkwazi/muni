import {
  ConversationModel,
  MessageModel,
  buildRoomId,
  type Conversation,
  type ChatMessage,
  type MessageType,
  type SenderRole,
} from '../models/chat.model.js';
import { maskSensitiveContent } from '../utils/mask.js';
import { cache } from '../../../../shared/cache/redis.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';

export interface UserPresence {
  userId: string;
  isOnline: boolean;
  lastSeenAt: string;
}

// Presence is ephemeral — kept in-memory + mirrored to Redis, never persisted to Mongo.
const onlineUsers = new Map<string, UserPresence>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toConversationDTO(doc: any): Conversation {
  return {
    id: doc._id.toString(),
    roomId: doc.roomId,
    buyerId: doc.buyerId,
    buyerName: doc.buyerName,
    sellerId: doc.sellerId,
    sellerStoreName: doc.sellerStoreName,
    productId: doc.productId ?? undefined,
    lastMessage: doc.lastMessage ?? undefined,
    lastMessageAt: doc.lastMessageAt ? new Date(doc.lastMessageAt).toISOString() : undefined,
    unreadCountBuyer: doc.unreadCountBuyer,
    unreadCountSeller: doc.unreadCountSeller,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMessageDTO(doc: any): ChatMessage {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    senderRole: doc.senderRole,
    messageType: doc.messageType,
    content: doc.content,
    wasMasked: doc.wasMasked,
    attachments: doc.attachments ?? undefined,
    productId: doc.productId ?? undefined,
    offerId: doc.offerId ?? undefined,
    readBy: (doc.readBy ?? []).map((r: { userId: string; readAt: Date }) => ({
      userId: r.userId,
      readAt: new Date(r.readAt).toISOString(),
    })),
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export class ChatService {
  async getConversations(userId: string): Promise<Conversation[]> {
    const docs = await ConversationModel.find({ $or: [{ buyerId: userId }, { sellerId: userId }] }).sort({
      lastMessageAt: -1,
      updatedAt: -1,
    });
    return docs.map(toConversationDTO);
  }

  /** Finds (or opens) the single conversation room for a buyer-seller-product context. */
  async getOrCreateConversation(input: {
    buyerId: string;
    buyerName: string;
    sellerId: string;
    sellerStoreName: string;
    productId?: string;
  }): Promise<Conversation> {
    const roomId = buildRoomId(input.buyerId, input.sellerId, input.productId);
    let doc = await ConversationModel.findOne({ roomId });

    if (!doc) {
      doc = await ConversationModel.create({
        roomId,
        buyerId: input.buyerId,
        buyerName: input.buyerName,
        sellerId: input.sellerId,
        sellerStoreName: input.sellerStoreName,
        productId: input.productId,
        unreadCountBuyer: 0,
        unreadCountSeller: 0,
      });
      void publish(Topics.CHAT_EVENTS, { type: 'chat.conversation_started', data: toConversationDTO(doc) });
    }

    return toConversationDTO(doc);
  }

  async startConversation(input: {
    buyerId: string;
    buyerName: string;
    sellerId: string;
    sellerStoreName: string;
    productId?: string;
    initialMessage?: string;
  }): Promise<Conversation> {
    const conv = await this.getOrCreateConversation(input);

    if (input.initialMessage) {
      await this.sendMessage({
        conversationId: conv.id,
        senderId: input.buyerId,
        senderRole: 'buyer',
        messageType: 'text',
        content: input.initialMessage,
        productId: input.productId,
      });
      return (await this.findById(conv.id)) ?? conv;
    }

    return conv;
  }

  async findById(conversationId: string): Promise<Conversation | null> {
    try {
      const doc = await ConversationModel.findById(conversationId);
      return doc ? toConversationDTO(doc) : null;
    } catch {
      return null;
    }
  }

  async getMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
    const docs = await MessageModel.find({ conversationId }).sort({ createdAt: -1 }).limit(limit);
    return docs.reverse().map(toMessageDTO);
  }

  async sendMessage(input: {
    conversationId: string;
    senderId: string;
    senderRole: SenderRole;
    messageType?: MessageType;
    content: string;
    attachments?: string[];
    productId?: string;
    offerId?: string;
  }): Promise<ChatMessage> {
    let conv;
    try {
      conv = await ConversationModel.findById(input.conversationId);
    } catch {
      conv = null;
    }
    if (!conv) throw new Error('Conversation not found');

    const { content, wasMasked } = maskSensitiveContent(input.content);
    const now = new Date();

    const doc = await MessageModel.create({
      conversationId: input.conversationId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      messageType: input.messageType ?? 'text',
      content,
      wasMasked,
      attachments: input.attachments,
      productId: input.productId,
      offerId: input.offerId,
      readBy: [{ userId: input.senderId, readAt: now }],
    });

    conv.lastMessage = content;
    conv.lastMessageAt = now;
    if (input.senderRole === 'buyer') {
      conv.unreadCountSeller += 1;
    } else if (input.senderRole === 'seller') {
      conv.unreadCountBuyer += 1;
    }
    await conv.save();

    void publish(Topics.CHAT_EVENTS, { type: 'chat.message_sent', data: toMessageDTO(doc) });

    return toMessageDTO(doc);
  }

  async markAsRead(conversationId: string, userId: string): Promise<void> {
    const conv = await ConversationModel.findById(conversationId).catch(() => null);
    if (!conv) return;

    if (conv.buyerId === userId) {
      conv.unreadCountBuyer = 0;
      await conv.save();
    } else if (conv.sellerId === userId) {
      conv.unreadCountSeller = 0;
      await conv.save();
    }

    await MessageModel.updateMany(
      { conversationId, senderId: { $ne: userId }, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, readAt: new Date() } } },
    );
  }

  async setPresence(userId: string, isOnline: boolean): Promise<void> {
    const presence: UserPresence = {
      userId,
      isOnline,
      lastSeenAt: new Date().toISOString(),
    };
    onlineUsers.set(userId, presence);
    await cache.set(`presence:${userId}`, JSON.stringify(presence), 300);
  }

  async getOnlineParticipants(): Promise<UserPresence[]> {
    return [...onlineUsers.values()].filter((p) => p.isOnline);
  }
}

export const chatService = new ChatService();
