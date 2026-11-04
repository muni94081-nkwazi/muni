import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * notifications.authz.test.ts
 *
 * Whose notifications a caller may read, and who may make this service send.
 *
 * Identity here was:
 *
 *   const actorId = (req) => req.headers['x-user-id'] as string | undefined;
 *   requireActor  = (req, res, next) => actorId(req) ? next() : 401
 *
 * — a header anyone can type, checked only for being non-empty. Every route
 * reads or mutates ONE person's data: their inbox, their unread count, their
 * device push tokens. A hand-written header read a stranger's notifications or
 * unregistered their handset.
 *
 * Three routes had no guard at all:
 *
 *   POST /notifications/send                     — `userId` is a body field, so
 *     this was "send any message to any user" over SMS, WhatsApp, push or email,
 *     from MUNI's own sender identity. It sits on the customer router behind
 *     auth(), so any logged-in shopper could reach it.
 *   POST /notifications/cache/invalidate/:userId — evict any user's contact cache.
 *   POST /admin/notifications/retry              — fire a platform-wide re-send.
 */

jest.unstable_mockModule('../config/prisma.js', () => ({
  default: { $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([1]) },
}));

// Typed with the real arity so the assertions below can read what the route
// passed — `jest.fn(async () => …)` infers a zero-arg signature and makes
// `mock.calls[0][0]` a type error.
const list = jest.fn<(args: { userId: string }) => Promise<unknown>>(
  async () => ({ data: [], meta: { total: 0 } }),
);
const counts = jest.fn(async () => ({ unread: 0, total: 0 }));
const markAllRead = jest.fn(async () => 0);
const markRead = jest.fn(async () => null);
const remove = jest.fn(async () => false);
const deliveries = jest.fn(async () => null);

jest.unstable_mockModule('../services/notification.service.js', () => ({
  list, counts, markAllRead, markRead, remove, deliveries,
}));

const registerDevice = jest.fn<(userId: string, token: string, platform: string) => Promise<unknown>>(
  async () => ({ id: 'dev-1' }),
);
jest.unstable_mockModule('../services/device-token.service.js', () => ({
  register: registerDevice,
  unregister: jest.fn(async () => true),
}));

const dispatch = jest.fn(async () => ({ id: 'notif-1' }));
const processRetries = jest.fn(async () => 0);
jest.unstable_mockModule('../services/dispatch.service.js', () => ({ dispatch, processRetries }));

const invalidateContact = jest.fn();
jest.unstable_mockModule('../clients/user.client.js', () => ({ invalidateContact }));

jest.unstable_mockModule('../providers/index.js', () => ({
  configuredProviders: () => [],
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { apiRoutes } = await import('../routes/index.js');
const { signIdentity, signServiceIdentity } = await import('../../../../shared/utils/internal-identity.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', apiRoutes); // exactly as app.ts mounts it
  return app;
}
const app = makeApp();

const USER_A = 'user-a';
const USER_B = 'user-b';
const ADMIN = 'admin-1';
const SIGNING_SECRET = 'test-internal-identity-secret-32-chars-plus';

const asUser = (id: string, roles: string[] = ['ROLE_CUSTOMER']) => ({
  'x-user-id': id,
  'x-user-roles': roles.join(','),
});

beforeEach(() => {
  delete process.env.INTERNAL_IDENTITY_SECRET;
  jest.clearAllMocks();
});

// ─── The inbox ────────────────────────────────────────────────────────────────

describe('a notification inbox belongs to one person', () => {
  it.each([
    ['the inbox', 'get', '/api/v1/notifications'],
    ['the unread count', 'get', '/api/v1/notifications/count'],
  ])('401s %s with no identity', async (_label, method, path) => {
    const res = await (request(app) as never as Record<string, (p: string) => Promise<{ status: number }>>)[method](path);
    expect(res.status).toBe(401);
  });

  it('reads the caller’s own inbox, taken from the session', async () => {
    const res = await request(app).get('/api/v1/notifications').set(asUser(USER_A));

    expect(res.status).toBe(200);
    expect(list.mock.calls[0][0]).toMatchObject({ userId: USER_A });
  });

  it('registers a push token against the session, not a claimed user', async () => {
    await request(app)
      .post('/api/v1/notifications/devices')
      .set(asUser(USER_A))
      .send({ token: 'a-device-token-long-enough', platform: 'android' });

    expect(registerDevice.mock.calls[0][0]).toBe(USER_A);
  });

  it('401s marking everything read with no identity', async () => {
    const res = await request(app).patch('/api/v1/notifications/read-all');
    expect(res.status).toBe(401);
    expect(markAllRead).not.toHaveBeenCalled();
  });
});

// ─── Sending ──────────────────────────────────────────────────────────────────

describe('sending is an internal act', () => {
  const SEND = { userId: USER_B, type: 'password.reset', title: 'Hi', body: 'Code: 123456' };

  it('401s with no identity at all', async () => {
    const res = await request(app).post('/api/v1/notifications/send').send(SEND);

    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses a signed-in customer sending to another user', async () => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
    try {
      const res = await request(app)
        .post('/api/v1/notifications/send')
        .set('x-internal-identity', signIdentity(USER_A, ['ROLE_CUSTOMER']) as string)
        .send(SEND);

      // A valid session is not enough: the gateway signs one for every browser.
      // Otherwise any shopper could send SMS from MUNI to any other user.
      expect(res.status).toBe(403);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      delete process.env.INTERNAL_IDENTITY_SECRET;
    }
  });

  it('accepts a signed peer service — auth-service sends the reset code this way', async () => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
    try {
      const res = await request(app)
        .post('/api/v1/notifications/send')
        .set('x-internal-identity', signServiceIdentity('auth-service', [], 'auth-service') as string)
        .send(SEND);

      expect(res.status).toBe(201);
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.INTERNAL_IDENTITY_SECRET;
    }
  });
});

// ─── Internal and admin maintenance ───────────────────────────────────────────

describe('cache invalidation and the retry sweep', () => {
  it('refuses a cache eviction from a signed-in customer', async () => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
    try {
      const res = await request(app)
        .post(`/api/v1/notifications/cache/invalidate/${USER_B}`)
        .set('x-internal-identity', signIdentity(USER_A, ['ROLE_CUSTOMER']) as string)
        .send({});

      expect(res.status).toBe(403);
      expect(invalidateContact).not.toHaveBeenCalled();
    } finally {
      delete process.env.INTERNAL_IDENTITY_SECRET;
    }
  });

  it('accepts a cache eviction from a signed peer service', async () => {
    process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET;
    try {
      const res = await request(app)
        .post(`/api/v1/notifications/cache/invalidate/${USER_B}`)
        .set('x-internal-identity', signServiceIdentity('user-service', [], 'user-service') as string)
        .send({});

      expect(res.status).toBe(204);
      expect(invalidateContact).toHaveBeenCalledWith(USER_B);
    } finally {
      delete process.env.INTERNAL_IDENTITY_SECRET;
    }
  });

  it('401s the retry sweep with no identity', async () => {
    const res = await request(app).post('/api/v1/admin/notifications/retry').send({});
    expect(res.status).toBe(401);
    expect(processRetries).not.toHaveBeenCalled();
  });

  it('403s a customer firing the retry sweep', async () => {
    const res = await request(app)
      .post('/api/v1/admin/notifications/retry')
      .set(asUser(USER_A))
      .send({});

    expect(res.status).toBe(403);
    expect(processRetries).not.toHaveBeenCalled();
  });

  it('lets an admin fire the retry sweep', async () => {
    const res = await request(app)
      .post('/api/v1/admin/notifications/retry')
      .set(asUser(ADMIN, ['ROLE_ADMIN']))
      .send({});

    expect(res.status).toBe(200);
    expect(processRetries).toHaveBeenCalledTimes(1);
  });
});

// ─── Signed identity mode ─────────────────────────────────────────────────────

describe('with INTERNAL_IDENTITY_SECRET set, a raw header buys nothing', () => {
  beforeEach(() => { process.env.INTERNAL_IDENTITY_SECRET = SIGNING_SECRET; });
  afterEach(() => { delete process.env.INTERNAL_IDENTITY_SECRET; });

  it('401s a forged x-user-id on the inbox', async () => {
    const res = await request(app).get('/api/v1/notifications').set(asUser(USER_A));

    expect(res.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('will not let a forged header override a signed identity', async () => {
    await request(app)
      .get('/api/v1/notifications')
      .set('x-internal-identity', signIdentity(USER_B, ['ROLE_CUSTOMER']) as string)
      .set('x-user-id', USER_A);

    // The inbox read is B's — the one that was signed.
    expect(list.mock.calls[0][0]).toMatchObject({ userId: USER_B });
  });
});
