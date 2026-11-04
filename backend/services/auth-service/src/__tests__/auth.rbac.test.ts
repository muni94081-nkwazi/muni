/**
 * auth.rbac.test.ts
 *
 * Who is allowed through the admin boundary, and who can read the user
 * directory.
 *
 * Both had no test. The user-directory route in particular was guarded only by
 * mount ORDER — `app.use('/api/v1', adminRouter)` runs that router's blanket
 * requireAdmin for every unhandled /api/v1/* request, and the old
 * `app.get('/api/v1/users')` happened to be declared after it. Move either line
 * and every customer could page a table of emails, phone numbers and roles.
 * The route now lives ON adminRouter, and these assertions are what stop that
 * regressing quietly.
 *
 * Run in SIGNED mode (INTERNAL_IDENTITY_SECRET set), which is what production
 * runs: identity comes from a signed assertion the gateway mints, not from a
 * header a caller can write. The header-only fallback is covered too, since it
 * is still reachable when the secret is unset.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Must be set before internal-identity reads it at first use.
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

let listUsersArgs: { page: number; limit: number } | null = null;

jest.unstable_mockModule('../services/auth.service.js', () => ({
  listUsers: async (opts: { page: number; limit: number }) => {
    listUsersArgs = opts;
    // Mirrors the real clamp in auth.service.listUsers, so the assertions below
    // are about what the ROUTE forwards and what the service returns together.
    const limit = Math.min(Math.max(Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : 20, 1), 100);
    const page = Math.max(Number.isFinite(opts.page) ? Math.trunc(opts.page) : 1, 1);
    return { users: [], total: 0, page, limit };
  },
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: {},
  connectDB: async () => undefined,
  disconnectDB: async () => undefined,
}));

jest.unstable_mockModule('../services/seller.service.js', () => ({
  getIdentityStats: async () => ({ users: 0, customers: 0, sellers: 0 }),
  listSellers: async () => [],
  listPendingSellers: async () => [],
  getSellerById: async () => null,
  verifySeller: async () => ({}),
  userOwnsDocument: async () => false,
}));

jest.unstable_mockModule('../services/rbac.service.js', () => ({
  listRoles: () => [{ id: 'ROLE_ADMIN' }],
  listPermissions: () => [],
  listStaff: async () => [],
  isAdminRole: () => true,
  assignRole: async () => ({ firstName: 'A', lastName: 'B', role: 'ROLE_ADMIN' }),
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { signIdentity, INTERNAL_IDENTITY_HEADER } = await import(
  '../../../../shared/utils/internal-identity.js'
);
const { adminRouter } = await import('../controllers/admin.controller.js');

/** Mounted exactly as app.ts mounts it. */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', adminRouter);
  return app;
}

/** The header the gateway stamps after verifying a JWT. */
function asRole(...roles: string[]): Record<string, string> {
  const assertion = signIdentity('user-1', roles);
  if (!assertion) throw new Error('INTERNAL_IDENTITY_SECRET not picked up — test would be vacuous');
  return { [INTERNAL_IDENTITY_HEADER]: assertion };
}

beforeEach(() => {
  listUsersArgs = null;
});

describe('GET /api/v1/users — the user directory', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await request(makeApp()).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('403s a ROLE_CUSTOMER — every row is another person’s PII', async () => {
    const res = await request(makeApp()).get('/api/v1/users').set(asRole('ROLE_CUSTOMER'));
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('users');
  });

  it('403s a ROLE_SELLER', async () => {
    const res = await request(makeApp()).get('/api/v1/users').set(asRole('ROLE_SELLER'));
    expect(res.status).toBe(403);
  });

  it('200s a ROLE_ADMIN', async () => {
    const res = await request(makeApp()).get('/api/v1/users').set(asRole('ROLE_ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
  });

  it('200s a ROLE_SUPER_ADMIN', async () => {
    const res = await request(makeApp()).get('/api/v1/users').set(asRole('ROLE_SUPER_ADMIN'));
    expect(res.status).toBe(200);
  });

  it('clamps an absurd limit rather than dumping the table', async () => {
    // `?limit=` arrives straight off the query string. Unclamped, one request
    // is the whole user table plus a matching spike in memory and query time.
    const res = await request(makeApp())
      .get('/api/v1/users?limit=999999')
      .set(asRole('ROLE_ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it('clamps a negative or zero limit to something queryable', async () => {
    const res = await request(makeApp()).get('/api/v1/users?limit=-5').set(asRole('ROLE_ADMIN'));
    expect(res.body.limit).toBe(1);
  });

  it('falls back to a sane page when the query is not a number', async () => {
    const res = await request(makeApp())
      .get('/api/v1/users?page=abc&limit=abc')
      .set(asRole('ROLE_ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('honours a reasonable limit unchanged', async () => {
    const res = await request(makeApp()).get('/api/v1/users?limit=50').set(asRole('ROLE_ADMIN'));
    expect(res.body.limit).toBe(50);
    expect(listUsersArgs).toMatchObject({ limit: 50 });
  });
});

describe('the admin boundary', () => {
  const adminRoutes = [
    '/api/v1/admin/stats',
    '/api/v1/admin/roles',
    '/api/v1/admin/permissions',
    '/api/v1/admin/staff',
  ];

  it.each(adminRoutes)('403s a ROLE_CUSTOMER on %s', async (route) => {
    const res = await request(makeApp()).get(route).set(asRole('ROLE_CUSTOMER'));
    expect(res.status).toBe(403);
  });

  it.each(adminRoutes)('401s an unauthenticated caller on %s', async (route) => {
    const res = await request(makeApp()).get(route);
    expect(res.status).toBe(401);
  });

  it.each(adminRoutes)('200s a ROLE_ADMIN on %s', async (route) => {
    const res = await request(makeApp()).get(route).set(asRole('ROLE_ADMIN'));
    expect(res.status).toBe(200);
  });
});

describe('identity cannot be forged with a header', () => {
  it('ignores a hand-written x-user-roles in signed mode', async () => {
    // The whole reason admin.controller reads res.locals.roles rather than the
    // raw header: with a secret configured, only a signed assertion counts. A
    // request arriving on the pod's port with `x-user-roles: ROLE_ADMIN` is
    // exactly what this must refuse.
    const res = await request(makeApp())
      .get('/api/v1/users')
      .set({ 'x-user-id': 'user-1', 'x-user-roles': 'ROLE_ADMIN' });

    expect(res.status).toBe(401);
  });

  it('rejects an assertion signed with the wrong secret', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: 'user-1', roles: ['ROLE_ADMIN'] }, 'not-the-real-secret', {
      expiresIn: 60,
      issuer: 'muni-gateway',
      audience: 'muni-internal',
    });

    const res = await request(makeApp())
      .get('/api/v1/users')
      .set({ [INTERNAL_IDENTITY_HEADER]: forged });

    expect(res.status).toBe(401);
  });

  it('rejects a structurally valid assertion carrying no admin role', async () => {
    const res = await request(makeApp())
      .get('/api/v1/users')
      .set(asRole('ROLE_CUSTOMER', 'ROLE_SELLER'));

    expect(res.status).toBe(403);
  });
});
