import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';
import type { ChatMessage, Conversation, Offer, OfferParty } from '@/types/chat.types';

export const chatApi = {
  async getConversations(): Promise<Conversation[]> {
    const { data } = await apiClient.get<ApiEnvelope<Conversation[]>>('/chat/conversations');
    return data.data;
  },

  async getMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
    const { data } = await apiClient.get<ApiEnvelope<ChatMessage[]>>(
      `/chat/conversations/${conversationId}/messages`,
      { params: { limit } },
    );
    return data.data;
  },

  async startConversation(payload: {
    sellerId: string;
    sellerStoreName: string;
    productId?: string;
    initialMessage?: string;
  }): Promise<Conversation> {
    const { data } = await apiClient.post<ApiEnvelope<Conversation>>('/chat/conversations', payload);
    return data.data;
  },

  async sendMessage(
    conversationId: string,
    payload: { content: string; senderRole: 'buyer' | 'seller'; productId?: string },
  ): Promise<ChatMessage> {
    const { data } = await apiClient.post<ApiEnvelope<ChatMessage>>(
      `/chat/conversations/${conversationId}/messages`,
      payload,
    );
    return data.data;
  },

  async markAsRead(conversationId: string): Promise<void> {
    await apiClient.put(`/chat/conversations/${conversationId}/read`);
  },
};

export const offerApi = {
  async createOffer(payload: {
    conversationId: string;
    productId: string;
    sellerId: string;
    originalPrice: number;
    offerPrice: number;
    currency?: string;
  }): Promise<Offer> {
    const { data } = await apiClient.post<ApiEnvelope<Offer>>('/chat/offers', payload);
    return data.data;
  },

  async getOffer(offerId: string): Promise<Offer> {
    const { data } = await apiClient.get<ApiEnvelope<Offer>>(`/chat/offers/${offerId}`);
    return data.data;
  },

  async getConversationOffers(conversationId: string): Promise<Offer[]> {
    const { data } = await apiClient.get<ApiEnvelope<Offer[]>>(`/chat/conversations/${conversationId}/offers`);
    return data.data;
  },

  async getMyProductOffers(productId: string): Promise<Offer[]> {
    const { data } = await apiClient.get<ApiEnvelope<Offer[]>>(`/chat/products/${productId}/offers/mine`);
    return data.data;
  },

  async acceptOffer(offerId: string): Promise<Offer> {
    const { data } = await apiClient.post<ApiEnvelope<Offer>>(`/chat/offers/${offerId}/accept`);
    return data.data;
  },

  async declineOffer(offerId: string): Promise<Offer> {
    const { data } = await apiClient.post<ApiEnvelope<Offer>>(`/chat/offers/${offerId}/decline`);
    return data.data;
  },

  async counterOffer(offerId: string, counterPrice: number, actingRole: OfferParty): Promise<Offer> {
    const { data } = await apiClient.post<ApiEnvelope<Offer>>(`/chat/offers/${offerId}/counter`, {
      counterPrice,
      actingRole,
    });
    return data.data;
  },
};
