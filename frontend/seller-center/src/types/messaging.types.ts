export interface Message {
  id: string;
  conversationId: string;
  senderType: 'buyer' | 'seller';
  text: string;
  sentAt: string;
  isRead: boolean;
}

export interface Conversation {
  id: string;
  buyerName: string;
  orderId?: string;
  subject: string;
  lastMessageAt: string;
  unreadCount: number;
  messages: Message[];
}

export interface CannedResponse {
  id: string;
  title: string;
  template: string;
}

export interface QaAnswer {
  id: string;
  answerText: string;
  answeredAt: string;
}

export interface QaThread {
  id: string;
  productId: string;
  productName: string;
  question: string;
  askedByName: string;
  askedAt: string;
  answer?: QaAnswer;
}
