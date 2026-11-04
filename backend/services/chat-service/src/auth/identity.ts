import type { Request, Response } from 'express';
import type { Socket } from 'socket.io';
import { readAccessToken } from '../../../../shared/utils/token.js';
import { chatService } from '../services/chat.service.js';
import type { Conversation } from '../models/chat.model.js';

// ─── Chat Identity ────────────────────────────────────────────────────────────
//
// chat-service has two front doors and they authenticate differently:
//
//   REST    — arrives through the api-gateway, which verifies the JWT and
//             stamps a signed identity assertion. `requireAuth` from
//             shared/http/service-auth.middleware verifies that assertion, so
//             the controllers only ever read `res.locals.userId`.
//
//   Socket  — does NOT pass through the gateway. The browser opens the
//             websocket straight at chat-service (customer-web dials
//             CHAT_SERVICE_URL, and nginx proxies /chat/ to this port), so
//             there is no gateway in the path to mint an assertion. The
//             handshake therefore has to carry the user's own access token,
//             which we verify here with the same shared reader the gateway
//             uses — same secret, same issuer/audience, same `type: access`
//             check.
//
// What this replaces: `socket.handshake.query.userId || 'user-123'`. The
// client simply *asserted* who it was, so anyone who could open a socket could
// read and post in any conversation as any user, and `send_message` even let
// the payload override `senderId` directly.

/** Identity resolved from a verified credential — never from a client claim. */
export interface ChatActor {
  userId: string;
  roles:  string[];
}

// ─── Socket authentication ────────────────────────────────────────────────────

/**
 * Read the bearer token out of a Socket.io handshake.
 *
 * socket.io-client can carry it in three shapes depending on how the client is
 * written, so all three are accepted — but only as a *token*, never as a bare
 * user id. `query.userId` is deliberately not consulted at all any more.
 */
function handshakeToken(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token) return stripBearer(auth.token);

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header) return stripBearer(header);

  const queryToken = socket.handshake.query.token;
  const raw = Array.isArray(queryToken) ? queryToken[0] : queryToken;
  return typeof raw === 'string' && raw ? stripBearer(raw) : undefined;
}

function stripBearer(value: string): string {
  return value.startsWith('Bearer ') ? value.slice(7) : value;
}

/** Where the verified actor is stashed on a connected socket. */
export interface AuthedSocketData {
  actor: ChatActor;
}

/**
 * Socket.io middleware: verify the handshake token or refuse the connection.
 *
 * Registered with `io.use()`, so an unauthenticated client never reaches a
 * single event handler — rather than each handler having to remember to check.
 */
export function authenticateSocket(socket: Socket, next: (err?: Error) => void): void {
  const payload = readAccessToken(handshakeToken(socket));

  if (!payload) {
    // The message reaches the client's `connect_error` handler. Kept vague on
    // purpose: "expired" vs "malformed" vs "wrong signature" is a distinction
    // useful mainly to someone probing the endpoint.
    next(new Error('UNAUTHORIZED: a valid access token is required to open a chat socket'));
    return;
  }

  (socket.data as AuthedSocketData).actor = {
    userId: payload.sub,
    roles:  payload.roles ?? [],
  };
  next();
}

/** The verified actor for a connected socket. Present for any socket that got past authenticateSocket. */
export function socketActor(socket: Socket): ChatActor {
  return (socket.data as AuthedSocketData).actor;
}

// ─── HTTP identity ────────────────────────────────────────────────────────────

/**
 * The verified actor for a REST request.
 *
 * `res.locals.userId` is written by shared `requireAuth`, which reads the
 * gateway's signed assertion. Returns null rather than a fallback id — the
 * previous `|| 'user-123'` default meant an unauthenticated request was served
 * as a real, if fictional, user instead of being refused.
 */
export function httpActor(_req: Request, res: Response): ChatActor | null {
  const userId = res.locals.userId as string | undefined;
  if (!userId) return null;
  return { userId, roles: (res.locals.roles as string[]) ?? [] };
}

// ─── Conversation authorization ───────────────────────────────────────────────

const ADMIN_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'];

/** True when the actor is one of the two parties to the conversation, or staff. */
export function isParticipant(conversation: Conversation, actor: ChatActor): boolean {
  if (conversation.buyerId === actor.userId) return true;
  if (conversation.sellerId === actor.userId) return true;
  return actor.roles.some((role) => ADMIN_ROLES.includes(role));
}

/**
 * Load a conversation the actor is party to.
 *
 * Returns null for both "no such conversation" and "not yours" so the two are
 * indistinguishable to the caller. A 403 on an existing id would confirm the id
 * is real, turning the endpoint into an oracle for enumerating conversations —
 * the same reasoning checkout-service applies to session lookups.
 */
export async function loadParticipantConversation(
  conversationId: string,
  actor: ChatActor,
): Promise<Conversation | null> {
  const conversation = await chatService.findById(conversationId);
  if (!conversation) return null;
  return isParticipant(conversation, actor) ? conversation : null;
}
