import type { Request, Response } from 'express';
import { chatService } from '../services/chat.service.js';
import { httpActor, loadParticipantConversation } from '../auth/identity.js';

// ─── Chat REST Controllers ────────────────────────────────────────────────────
//
// Identity comes from `httpActor`, which reads the verified assertion the
// gateway stamped (via shared requireAuth in app.ts). Every handler here used
// to resolve the caller as:
//
//   req.headers['x-user-id'] || req.query.userId || 'user-123'
//
// — a client-supplied value with a fictional fallback, so an unauthenticated
// request was served as a real user rather than refused. Reads additionally
// had no ownership check at all: any conversation id returned its messages to
// anyone who asked.

/**
 * 401 helper. Should be unreachable while `requireAuth` guards these routes;
 * kept so the controllers are still safe if one is ever mounted without it.
 */
function unauthenticated(res: Response): void {
  res.status(401).json({ success: false, message: 'Authentication required' });
}

/** Both "no such conversation" and "not a participant" answer identically — see loadParticipantConversation. */
function notFound(res: Response): void {
  res.status(404).json({ success: false, message: 'Conversation not found' });
}

export async function getConversations(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  try {
    // Scoped to the authenticated user. `?userId=` is no longer consulted:
    // it previously let anyone list another user's conversations.
    const data = await chatService.getConversations(actor.userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const id = req.params.id as string;
  const limit = parseInt((req.query.limit as string) ?? '50', 10);

  try {
    const conversation = await loadParticipantConversation(id, actor);
    if (!conversation) return notFound(res);

    const data = await chatService.getMessages(id, limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function startConversation(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const { buyerName, sellerId, sellerStoreName, productId, initialMessage } = req.body;
  if (!sellerId || !sellerStoreName) {
    res.status(400).json({ success: false, message: 'sellerId and sellerStoreName are required' });
    return;
  }

  try {
    const data = await chatService.startConversation({
      // Always the caller. `req.body.buyerId` used to win over the header,
      // so a client could open a conversation in another user's name.
      buyerId: actor.userId,
      buyerName: buyerName || 'MUNI Customer',
      sellerId,
      sellerStoreName,
      productId,
      initialMessage,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

// 'offer' and 'system' messages are only ever created internally by the offer
// negotiation flow — clients can't post them directly through this endpoint.
const CLIENT_MESSAGE_TYPES = new Set(['text', 'image', 'file', 'product_link', 'quick_reply']);

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const id = req.params.id as string;
  const { messageType, content, attachments, productId } = req.body;

  if (!content) {
    res.status(400).json({ success: false, message: 'content is required' });
    return;
  }

  if (messageType && !CLIENT_MESSAGE_TYPES.has(messageType)) {
    res.status(400).json({ success: false, message: `Invalid messageType: ${messageType}` });
    return;
  }

  try {
    const conversation = await loadParticipantConversation(id, actor);
    if (!conversation) return notFound(res);

    const data = await chatService.sendMessage({
      conversationId: id,
      // From the verified caller, never `req.body.senderId`.
      senderId: actor.userId,
      // Derived from which side of the conversation the sender is on, so a
      // buyer cannot post a message that renders as the store's own reply.
      senderRole: conversation.sellerId === actor.userId ? 'seller' : 'buyer',
      messageType,
      content,
      attachments,
      productId,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  const id = req.params.id as string;

  try {
    const conversation = await loadParticipantConversation(id, actor);
    if (!conversation) return notFound(res);

    await chatService.markAsRead(id, actor.userId);
    res.json({ success: true, message: 'Messages marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getOnlineParticipants(req: Request, res: Response): Promise<void> {
  const actor = httpActor(req, res);
  if (!actor) return unauthenticated(res);

  try {
    const data = await chatService.getOnlineParticipants();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
