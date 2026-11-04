import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CHAT_SERVICE_URL, CHAT_SOCKET_PATH, ACCESS_TOKEN_KEY } from '@/utils/constants';
import { safeGetItem } from '@/utils/helpers';
import type { ChatMessage, Conversation, Offer, OfferParty } from '@/types/chat.types';

export interface JoinConversationParams {
  conversationId?: string;
  buyerId?: string;
  buyerName?: string;
  sellerId?: string;
  sellerStoreName?: string;
  productId?: string;
}

interface UseChatSocketOptions {
  userId: string;
  join: JoinConversationParams;
  /** Skip connecting until the caller has what it needs (e.g. drawer is open). */
  enabled?: boolean;
}

export function useChatSocket({ userId, join, enabled = true }: UseChatSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinKey = `${join.conversationId ?? ''}|${join.sellerId ?? ''}|${join.productId ?? ''}`;

  useEffect(() => {
    if (!enabled) return undefined;

    // The handshake carries the access token, not a `userId`.
    //
    // chat-service used to take `query.userId` at face value, so the browser
    // was simply asserting who it was. It now verifies this token (same secret,
    // issuer and audience as the gateway) and derives the identity from it —
    // an absent or expired token is refused at connect time and surfaces on
    // the `connect_error` handler below.
    const token = safeGetItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('Please sign in to start a conversation.');
      return undefined;
    }

    const socket = io(CHAT_SERVICE_URL, {
      path: CHAT_SOCKET_PATH,
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect_error', (err: Error) => {
      setIsConnected(false);
      setError(
        err.message?.startsWith('UNAUTHORIZED')
          ? 'Your session has expired. Please sign in again to continue chatting.'
          : 'Could not connect to chat. Please try again.',
      );
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      socket.emit('join_conversation', join);
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('conversation_ready', (payload: { conversation: Conversation; messages: ChatMessage[] }) => {
      setConversation(payload.conversation);
      setMessages(payload.messages);
    });

    socket.on('new_message', ({ message }: { message: ChatMessage }) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('typing', (payload: { userId: string; isTyping: boolean }) => {
      if (payload.userId !== userId) setIsPeerTyping(payload.isTyping);
    });

    socket.on('offer_created', ({ offer }: { offer: Offer }) => {
      setOffers((prev) => [...prev, offer]);
    });

    socket.on('offer_updated', ({ offer }: { offer: Offer }) => {
      setOffers((prev) => prev.map((o) => (o.id === offer.id ? offer : o)));
    });

    socket.on('offer_countered', ({ offer }: { offer: Offer }) => {
      setOffers((prev) => [...prev, offer]);
    });

    socket.on('error', (payload: { message: string }) => setError(payload.message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, joinKey]);

  const sendMessage = useCallback(
    (content: string, senderRole: 'buyer' | 'seller') => {
      if (!conversation || !content.trim()) return;
      socketRef.current?.emit('send_message', { conversationId: conversation.id, senderRole, content });
    },
    [conversation],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversation) return;
      socketRef.current?.emit('typing', { conversationId: conversation.id, isTyping });
    },
    [conversation],
  );

  const markRead = useCallback(() => {
    if (!conversation) return;
    socketRef.current?.emit('mark_read', { conversationId: conversation.id });
  }, [conversation]);

  const makeOffer = useCallback(
    (input: { productId: string; sellerId: string; originalPrice: number; offerPrice: number; currency?: string }) => {
      if (!conversation) return;
      socketRef.current?.emit('make_offer', { conversationId: conversation.id, ...input });
    },
    [conversation],
  );

  const respondToOffer = useCallback(
    (input: { offerId: string; action: 'accept' | 'decline' | 'counter'; actingRole: OfferParty; counterPrice?: number }) => {
      if (!conversation) return;
      socketRef.current?.emit('respond_offer', { conversationId: conversation.id, ...input });
    },
    [conversation],
  );

  return {
    conversation,
    messages,
    offers,
    isConnected,
    isPeerTyping,
    error,
    sendMessage,
    setTyping,
    markRead,
    makeOffer,
    respondToOffer,
  };
}
