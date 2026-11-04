import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Socket } from 'socket.io';

// ─── Chat identity & authorization ────────────────────────────────────────────
//
// Covers the hole that made every conversation on the platform readable and
// writable by anyone: chat-service resolved the caller from a client-supplied
// value (`handshake.query.userId` on the socket, `x-user-id`/body on REST) and
// fell back to the literal 'user-123'. These tests assert the two properties
// that replaced it — identity comes from a *verified* token, and conversation
// access is limited to its participants.

// The token module reads JWT_ACCESS_SECRET at import time, so it must be set
// before the dynamic import below.
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../../../../shared/cache/redis.js', () => ({
  cache: { set: jest.fn<() => Promise<void>>().mockResolvedValue(), get: jest.fn() },
  connectCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isCacheReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { authenticateSocket, socketActor, isParticipant, loadParticipantConversation, httpActor } =
  await import('../auth/identity.js');
const { createAccessToken, createRefreshToken } = await import('../../../../shared/utils/token.js');
const { chatService } = await import('../services/chat.service.js');
const { ConversationModel, MessageModel } = await import('../models/chat.model.js');

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await ConversationModel.deleteMany({});
  await MessageModel.deleteMany({});
});

/** Minimal Socket.io handshake stand-in — only the fields identity.ts reads. */
function fakeSocket(handshake: {
  auth?: Record<string, unknown>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}): Socket {
  return {
    handshake: {
      auth: handshake.auth ?? {},
      headers: handshake.headers ?? {},
      query: handshake.query ?? {},
    },
    data: {},
  } as unknown as Socket;
}

function connect(socket: Socket): Error | undefined {
  let captured: Error | undefined;
  authenticateSocket(socket, (err?: Error) => { captured = err; });
  return captured;
}

describe('socket authentication', () => {
  it('accepts a valid access token and derives the identity from it', () => {
    const socket = fakeSocket({ auth: { token: createAccessToken('user-real', ['ROLE_USER']) } });

    expect(connect(socket)).toBeUndefined();
    expect(socketActor(socket)).toEqual({ userId: 'user-real', roles: ['ROLE_USER'] });
  });

  it('accepts the token via the Authorization header', () => {
    const socket = fakeSocket({
      headers: { authorization: `Bearer ${createAccessToken('user-real', [])}` },
    });

    expect(connect(socket)).toBeUndefined();
    expect(socketActor(socket).userId).toBe('user-real');
  });

  it('refuses a connection with no credential at all', () => {
    expect(connect(fakeSocket({}))?.message).toMatch(/UNAUTHORIZED/);
  });

  // The regression this whole change exists for.
  it('ignores a claimed userId in the handshake query', () => {
    const socket = fakeSocket({ query: { userId: 'victim-user' } });

    // Previously this connected as 'victim-user'. Now an asserted id is not a
    // credential, so there is nothing to authenticate with.
    expect(connect(socket)?.message).toMatch(/UNAUTHORIZED/);
  });

  it('does not let a claimed userId override a verified token', () => {
    const socket = fakeSocket({
      auth: { token: createAccessToken('user-real', []), userId: 'victim-user' },
      query: { userId: 'victim-user' },
    });

    expect(connect(socket)).toBeUndefined();
    expect(socketActor(socket).userId).toBe('user-real');
  });

  it('refuses a forged token signed with the wrong secret', () => {
    // A token that is structurally perfect but signed by someone who does not
    // hold JWT_ACCESS_SECRET.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
      '.eyJzdWIiOiJ2aWN0aW0iLCJyb2xlcyI6WyJST0xFX0FETUlOIl0sInR5cGUiOiJhY2Nlc3MifQ' +
      '.not_a_valid_signature';

    expect(connect(fakeSocket({ auth: { token: forged } }))?.message).toMatch(/UNAUTHORIZED/);
  });

  it('refuses a refresh token presented as an access token', () => {
    // Same secret family, wrong `type` claim — readAccessToken checks it.
    const socket = fakeSocket({ auth: { token: createRefreshToken('user-real', 'fam-1') } });

    expect(connect(socket)?.message).toMatch(/UNAUTHORIZED/);
  });
});

describe('conversation authorization', () => {
  const buyer  = { userId: 'buyer-1',  roles: [] as string[] };
  const seller = { userId: 'seller-1', roles: [] as string[] };
  const stranger = { userId: 'stranger-1', roles: [] as string[] };
  const admin  = { userId: 'admin-1',  roles: ['ROLE_ADMIN'] };

  async function seedConversation() {
    return chatService.startConversation({
      buyerId: buyer.userId,
      buyerName: 'Buyer',
      sellerId: seller.userId,
      sellerStoreName: 'Store',
      productId: 'prod-1',
      initialMessage: 'hello',
    });
  }

  it('admits both parties to the conversation', async () => {
    const conversation = await seedConversation();

    expect(isParticipant(conversation, buyer)).toBe(true);
    expect(isParticipant(conversation, seller)).toBe(true);
  });

  it('excludes an unrelated user', async () => {
    const conversation = await seedConversation();
    expect(isParticipant(conversation, stranger)).toBe(false);
  });

  it('admits staff for moderation', async () => {
    const conversation = await seedConversation();
    expect(isParticipant(conversation, admin)).toBe(true);
  });

  it('loads the conversation for a participant', async () => {
    const conversation = await seedConversation();
    const loaded = await loadParticipantConversation(conversation.id, buyer);
    expect(loaded?.id).toBe(conversation.id);
  });

  it('hides a real conversation from a non-participant', async () => {
    const conversation = await seedConversation();
    // Null rather than a 403, so an existing id is indistinguishable from a
    // missing one and the endpoint cannot be used to enumerate conversations.
    expect(await loadParticipantConversation(conversation.id, stranger)).toBeNull();
  });

  it('returns null for a conversation that does not exist', async () => {
    expect(await loadParticipantConversation(new mongoose.Types.ObjectId().toString(), buyer))
      .toBeNull();
  });
});

describe('http identity', () => {
  it('reads the actor that requireAuth resolved', () => {
    const res = { locals: { userId: 'user-real', roles: ['ROLE_USER'] } };
    expect(httpActor({} as never, res as never)).toEqual({
      userId: 'user-real',
      roles: ['ROLE_USER'],
    });
  });

  it('returns null when nothing authenticated the request', () => {
    // The old code fell back to 'user-123' here, so an unauthenticated request
    // was served as a real user instead of being refused.
    expect(httpActor({} as never, { locals: {} } as never)).toBeNull();
  });
});
