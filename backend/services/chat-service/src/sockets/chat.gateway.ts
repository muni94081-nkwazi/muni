import type { Server, Socket } from 'socket.io';
import { chatService } from '../services/chat.service.js';
import { offerService, OfferLimitError, OfferStateError, OfferNotFoundError } from '../services/offer.service.js';
import type { OfferParty } from '../models/offer.model.js';
import {
  authenticateSocket,
  socketActor,
  isParticipant,
  loadParticipantConversation,
} from '../auth/identity.js';

function roomName(conversationId: string): string {
  return `conv:${conversationId}`;
}

function emitError(socket: Socket, message: string): void {
  socket.emit('error', { message });
}

/** Wires all chat + offer real-time events onto a Socket.io server. */
export function registerChatGateway(io: Server): void {
  // Every connection is authenticated before any handler is reachable. The
  // socket's identity is now the subject of a verified access token; it was
  // previously whatever `handshake.query.userId` claimed, defaulting to the
  // literal 'user-123'.
  io.use(authenticateSocket);

  io.on('connection', (socket: Socket) => {
    const { userId } = socketActor(socket);
    void chatService.setPresence(userId, true);
    io.emit('presence_update', { userId, isOnline: true });

    // ── Room management: one room per buyer-seller-product conversation ──────
    socket.on(
      'join_conversation',
      async (payload: {
        conversationId?: string;
        buyerId?: string;
        buyerName?: string;
        sellerId?: string;
        sellerStoreName?: string;
        productId?: string;
      }) => {
        try {
          // Joining an existing conversation is authorized against its
          // participants; `loadParticipantConversation` returns null for both
          // "no such id" and "not yours" so the two cannot be told apart.
          //
          // Creating one always uses the authenticated user as the buyer:
          // `payload.buyerId` used to be trusted, which let a client open a
          // thread in someone else's name.
          const conversation = payload.conversationId
            ? await loadParticipantConversation(payload.conversationId, socketActor(socket))
            : await chatService.getOrCreateConversation({
                buyerId: userId,
                buyerName: payload.buyerName ?? 'MUNI Customer',
                sellerId: payload.sellerId!,
                sellerStoreName: payload.sellerStoreName ?? 'Seller',
                productId: payload.productId,
              });

          if (!conversation) {
            emitError(socket, 'Conversation not found');
            return;
          }

          // Covers the create branch too: getOrCreateConversation can return an
          // existing thread for the (buyer, seller, product) triple.
          if (!isParticipant(conversation, socketActor(socket))) {
            emitError(socket, 'Conversation not found');
            return;
          }

          const room = roomName(conversation.id);
          await socket.join(room);
          socket.data.conversationId = conversation.id;

          const messages = await chatService.getMessages(conversation.id);
          socket.emit('conversation_ready', { conversation, messages });
        } catch (err) {
          emitError(socket, (err as Error).message);
        }
      },
    );

    // ── Messaging ──────────────────────────────────────────────────────────
    socket.on(
      'send_message',
      async (payload: {
        conversationId: string;
        // `senderId` is intentionally absent from this type now. It used to be
        // accepted and preferred over the connection's own identity
        // (`payload.senderId ?? userId`), which let any client post a message
        // attributed to any user in any conversation.
        senderRole?: 'buyer' | 'seller';
        content: string;
        messageType?: 'text' | 'image' | 'file' | 'product_link' | 'quick_reply';
        attachments?: string[];
        productId?: string;
      }) => {
        try {
          const conversation = await loadParticipantConversation(
            payload.conversationId,
            socketActor(socket),
          );
          if (!conversation) {
            emitError(socket, 'Conversation not found');
            return;
          }

          const message = await chatService.sendMessage({
            conversationId: payload.conversationId,
            // Always the authenticated connection, never the payload.
            senderId: userId,
            // Derived from which side of this conversation the sender is on,
            // rather than taken from the client: a buyer could otherwise post
            // as 'seller' and have the message render as the store's own reply.
            senderRole: conversation.sellerId === userId ? 'seller' : 'buyer',
            messageType: payload.messageType,
            content: payload.content,
            attachments: payload.attachments,
            productId: payload.productId,
          });
          io.to(roomName(payload.conversationId)).emit('new_message', { message });
        } catch (err) {
          emitError(socket, (err as Error).message);
        }
      },
    );

    socket.on('typing', (payload: { conversationId: string; isTyping: boolean }) => {
      // Room membership stands in for a participant lookup here. Joining is
      // now authorized, so being in the room already means the check passed —
      // and typing fires on every keystroke, which is not worth a database
      // round trip. Without it, any connected socket could push a "seller is
      // typing…" indicator into a stranger's conversation.
      if (!socket.rooms.has(roomName(payload.conversationId))) return;

      socket.to(roomName(payload.conversationId)).emit('typing', {
        conversationId: payload.conversationId,
        userId,
        isTyping: payload.isTyping,
      });
    });

    socket.on('mark_read', async (payload: { conversationId: string }) => {
      try {
        // Mutates read receipts, so this one is checked against the record
        // rather than against room membership.
        const conversation = await loadParticipantConversation(
          payload.conversationId,
          socketActor(socket),
        );
        if (!conversation) {
          emitError(socket, 'Conversation not found');
          return;
        }

        await chatService.markAsRead(payload.conversationId, userId);
        io.to(roomName(payload.conversationId)).emit('messages_read', {
          conversationId: payload.conversationId,
          userId,
          readAt: new Date().toISOString(),
        });
      } catch (err) {
        emitError(socket, (err as Error).message);
      }
    });

    // ── Make-an-Offer negotiation flow ────────────────────────────────────
    socket.on(
      'make_offer',
      async (payload: {
        conversationId: string;
        productId: string;
        sellerId: string;
        originalPrice: number;
        offerPrice: number;
        currency?: string;
      }) => {
        try {
          // An offer is a price commitment, so the conversation is verified
          // against the record. `buyerId` was already taken from the
          // connection, but nothing checked the connection belonged in this
          // conversation at all.
          const conversation = await loadParticipantConversation(
            payload.conversationId,
            socketActor(socket),
          );
          if (!conversation) {
            emitError(socket, 'Conversation not found');
            return;
          }

          const offer = await offerService.createOffer({
            conversationId: payload.conversationId,
            productId: payload.productId,
            buyerId: userId,
            // From the conversation, not the payload: a client could otherwise
            // raise an offer naming an unrelated seller.
            sellerId: conversation.sellerId,
            originalPrice: payload.originalPrice,
            offerPrice: payload.offerPrice,
            currency: payload.currency,
          });
          io.to(roomName(payload.conversationId)).emit('offer_created', { offer });
        } catch (err) {
          if (err instanceof OfferLimitError) {
            emitError(socket, err.message);
          } else {
            emitError(socket, (err as Error).message);
          }
        }
      },
    );

    socket.on(
      'respond_offer',
      async (payload: {
        offerId: string;
        conversationId: string;
        action: 'accept' | 'decline' | 'counter';
        actingRole: OfferParty;
        counterPrice?: number;
      }) => {
        try {
          // Accepting or countering an offer moves an agreed price, so the
          // caller must be party to the conversation it belongs to.
          const conversation = await loadParticipantConversation(
            payload.conversationId,
            socketActor(socket),
          );
          if (!conversation) {
            emitError(socket, 'Conversation not found');
            return;
          }

          if (payload.action === 'accept') {
            const offer = await offerService.acceptOffer(payload.offerId, userId);
            io.to(roomName(payload.conversationId)).emit('offer_updated', { offer });
          } else if (payload.action === 'decline') {
            const offer = await offerService.declineOffer(payload.offerId, userId);
            io.to(roomName(payload.conversationId)).emit('offer_updated', { offer });
          } else {
            if (payload.counterPrice == null) {
              emitError(socket, 'counterPrice is required to counter an offer');
              return;
            }
            const offer = await offerService.counterOffer(payload.offerId, {
              actingUserId: userId,
              actingRole: payload.actingRole,
              counterPrice: payload.counterPrice,
            });
            io.to(roomName(payload.conversationId)).emit('offer_countered', { offer });
          }
        } catch (err) {
          if (err instanceof OfferStateError || err instanceof OfferNotFoundError) {
            emitError(socket, err.message);
          } else {
            emitError(socket, (err as Error).message);
          }
        }
      },
    );

    socket.on('disconnect', () => {
      void chatService.setPresence(userId, false);
      io.emit('presence_update', { userId, isOnline: false });
    });
  });
}
