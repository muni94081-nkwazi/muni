/**
 * MUNI E-Commerce Platform — Real-Time WebSocket Manager
 * Manages WebSocket connections to chat-service for real-time buyer-seller messaging & notifications.
 */
import { logger } from './logger';

export type WsMessageType = 'message_sent' | 'user_typing' | 'presence_update' | 'error';

export interface WsMessagePayload {
  type: WsMessageType;
  conversationId?: string;
  userId?: string;
  data?: unknown;
  message?: string;
}

export class MuniWebSocketClient {
  private ws: WebSocket | null = null;
  private userId: string;
  private url: string;
  private listeners: Map<WsMessageType, Array<(data: WsMessagePayload) => void>> = new Map();

  constructor(userId = 'user-123', url = 'ws://localhost:4025/ws/chat') {
    this.userId = userId;
    this.url = `${url}?userId=${userId}`;
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      logger.debug(`[MuniWebSocketClient] Connected for user ${this.userId}`);
    };

    this.ws.onmessage = (event) => {
      try {
        const payload: WsMessagePayload = JSON.parse(event.data);
        const handlers = this.listeners.get(payload.type) || [];
        for (const handler of handlers) {
          handler(payload);
        }
      } catch (err) {
        logger.error('[MuniWebSocketClient] Error parsing incoming WS message:', err);
      }
    };

    this.ws.onclose = () => {
      logger.debug('[MuniWebSocketClient] Connection closed. Reconnecting in 3s...');
      setTimeout(() => this.connect(), 3000);
    };
  }

  sendMessage(conversationId: string, content: string, senderRole: 'buyer' | 'seller'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'send_message',
        data: {
          conversationId,
          senderId: this.userId,
          senderRole,
          content,
        },
      })
    );
  }

  on(type: WsMessageType, callback: (data: WsMessagePayload) => void): () => void {
    const list = this.listeners.get(type) || [];
    list.push(callback);
    this.listeners.set(type, list);

    return () => {
      const filtered = (this.listeners.get(type) || []).filter((cb) => cb !== callback);
      this.listeners.set(type, filtered);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
