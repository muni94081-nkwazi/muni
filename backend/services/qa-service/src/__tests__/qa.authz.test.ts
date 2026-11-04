import { jest, describe, it, expect } from '@jest/globals';
import request from 'supertest';

// ─── Q&A authorization / IDOR regression tests ────────────────────────────────
//
// Exercises the REAL route table in app.ts so a guard removed from a route
// fails here rather than passing against a private copy of the routes.
//
// What they pin down:
//
//   • Reading questions and answers stays open to guests — that content is on
//     the product page before anyone signs in.
//   • Asking and voting need a verified session, and the actor is the session,
//     never a "userId" in the body or query string.
//   • Answering is ROLE_SELLER only. The handler records the actor as the
//     answering seller and labels the reply with a store name, so a customer
//     answering would be published as a seller.
//   • The old hardcoded 'user-123' / 'seller-001' identities are unreachable.
//
// Signed mode on purpose: with INTERNAL_IDENTITY_SECRET unset the shared
// middleware degrades to trusting x-user-id, and the forgery case would prove
// nothing.
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';
process.env.PORT = '0';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  connectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectDB: jest.fn<() => Promise<void>>().mockResolvedValue(),
  prisma: { $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([{ 1: 1 }]) },
}));

/** Whoever the service layer was told is acting. That is the thing under test. */
const seen: { ask: string[]; answer: string[]; vote: string[]; sellerList: string[] } = {
  ask: [], answer: [], vote: [], sellerList: [],
};

jest.unstable_mockModule('../services/qa.service.js', () => ({
  qaService: {
    askQuestion: jest.fn(async (_productId: string, userId: string) => {
      seen.ask.push(userId);
      return { id: 'q1', userId };
    }),
    getProductQuestions: jest.fn(async () => []),
    getQuestionById: jest.fn(async () => ({ id: 'q1' })),
    answerQuestion: jest.fn(async (_id: string, sellerId: string) => {
      seen.answer.push(sellerId);
      return { id: 'a1', sellerId };
    }),
    voteAnswer: jest.fn(async (_id: string, userId: string) => {
      seen.vote.push(userId);
      return { id: 'a1' };
    }),
    getSellerQuestions: jest.fn(async (sellerId: string) => {
      seen.sellerList.push(sellerId);
      return [];
    }),
    featureQuestion: jest.fn(async () => ({ id: 'q1', featured: true })),
  },
}));

const { signIdentity, INTERNAL_IDENTITY_HEADER } =
  await import('../../../../shared/utils/internal-identity.js');
const { default: app } = await import('../app.js');

function as(userId: string, roles: string[]) {
  const token = signIdentity(userId, roles);
  if (!token) throw new Error('signIdentity returned null — secret not configured');
  return { [INTERNAL_IDENTITY_HEADER]: token };
}

const asCustomer = (id: string) => as(id, ['ROLE_CUSTOMER']);
const asSeller   = (id: string) => as(id, ['ROLE_SELLER']);

describe('qa-service — reading stays public', () => {
  it('lists a product’s questions for a guest', async () => {
    const res = await request(app).get('/api/v1/products/p1/questions');
    expect(res.status).toBe(200);
  });

  it('returns a single question to a guest', async () => {
    const res = await request(app).get('/api/v1/questions/q1');
    expect(res.status).toBe(200);
  });
});

describe('qa-service — writes require a verified identity', () => {
  it('rejects an anonymous question', async () => {
    const res = await request(app)
      .post('/api/v1/products/p1/questions')
      .send({ question: 'Is this genuine?' });

    expect(res.status).toBe(401);
    expect(seen.ask).toHaveLength(0);
  });

  it('rejects an anonymous vote', async () => {
    const res = await request(app).put('/api/v1/answers/a1/helpful').send({});
    expect(res.status).toBe(401);
    expect(seen.vote).toHaveLength(0);
  });

  it('never falls back to the hardcoded user-123 identity', async () => {
    seen.ask.length = 0;

    const res = await request(app)
      .post('/api/v1/products/p1/questions')
      .send({ question: 'Anyone there?', userId: 'user-123' });

    expect(res.status).toBe(401);
    expect(seen.ask).not.toContain('user-123');
  });
});

describe('qa-service — caller-supplied identity is rejected (IDOR)', () => {
  it('attributes a question to the session, not the body userId', async () => {
    seen.ask.length = 0;

    const res = await request(app)
      .post('/api/v1/products/p1/questions')
      .set(asCustomer('attacker'))
      .send({ question: 'Hello', userId: 'victim' });

    expect(res.status).toBe(201);
    expect(seen.ask).toEqual(['attacker']);
    expect(seen.ask).not.toContain('victim');
  });

  it('attributes a vote to the session, not the body userId', async () => {
    seen.vote.length = 0;

    const res = await request(app)
      .put('/api/v1/answers/a1/helpful')
      .set(asCustomer('attacker'))
      .send({ userId: 'victim' });

    expect(res.status).toBe(200);
    expect(seen.vote).toEqual(['attacker']);
  });

  it('ignores a query-string sellerId on the seller question list', async () => {
    seen.sellerList.length = 0;

    const res = await request(app)
      .get('/api/v1/seller/questions?sellerId=victim-seller')
      .set(asSeller('real-seller'));

    expect(res.status).toBe(200);
    expect(seen.sellerList).toEqual(['real-seller']);
    expect(seen.sellerList).not.toContain('victim-seller');
  });
});

describe('qa-service — answering is restricted to sellers', () => {
  it('refuses an anonymous answer', async () => {
    seen.answer.length = 0;
    const res = await request(app)
      .post('/api/v1/questions/q1/answers')
      .send({ answer: 'Yes it is.' });

    expect(res.status).toBe(401);
    expect(seen.answer).toHaveLength(0);
  });

  it('refuses a signed-in customer, who would be published as a seller', async () => {
    seen.answer.length = 0;

    const res = await request(app)
      .post('/api/v1/questions/q1/answers')
      .set(asCustomer('shopper'))
      .send({ answer: 'Yes it is.', sellerId: 'seller-001' });

    expect(res.status).toBe(403);
    expect(seen.answer).toHaveLength(0);
  });

  it('allows a seller, recording the session as the author', async () => {
    seen.answer.length = 0;

    const res = await request(app)
      .post('/api/v1/questions/q1/answers')
      .set(asSeller('seller-real'))
      .send({ answer: 'Yes it is.', sellerId: 'seller-001' });

    expect(res.status).toBe(201);
    expect(seen.answer).toEqual(['seller-real']);
    expect(seen.answer).not.toContain('seller-001');
  });

  it('refuses a customer the seller question list', async () => {
    seen.sellerList.length = 0;

    const res = await request(app)
      .get('/api/v1/seller/questions')
      .set(asCustomer('shopper'));

    expect(res.status).toBe(403);
    expect(seen.sellerList).toHaveLength(0);
  });
});

describe('qa-service — admin moderation is role-gated', () => {
  it('refuses a customer', async () => {
    const res = await request(app)
      .post('/api/v1/admin/questions/q1/feature')
      .set(asCustomer('shopper'))
      .send({});

    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    const res = await request(app).post('/api/v1/admin/questions/q1/feature').send({});
    expect(res.status).toBe(401);
  });

  it('allows an admin', async () => {
    const res = await request(app)
      .post('/api/v1/admin/questions/q1/feature')
      .set(as('root', ['ROLE_ADMIN']))
      .send({});

    expect(res.status).toBe(200);
  });
});

describe('qa-service — forged headers do not authenticate', () => {
  it('rejects a raw x-user-id header with no signed assertion', async () => {
    seen.ask.length = 0;

    const res = await request(app)
      .post('/api/v1/products/p1/questions')
      .set('x-user-id', 'victim')
      .send({ question: 'Hi' });

    expect(res.status).toBe(401);
    expect(seen.ask).toHaveLength(0);
  });

  it('rejects a raw x-user-roles header claiming ROLE_SELLER', async () => {
    seen.answer.length = 0;

    const res = await request(app)
      .post('/api/v1/questions/q1/answers')
      .set('x-user-id', 'attacker')
      .set('x-user-roles', 'ROLE_SELLER')
      .send({ answer: 'Fake' });

    expect(res.status).toBe(401);
    expect(seen.answer).toHaveLength(0);
  });
});
