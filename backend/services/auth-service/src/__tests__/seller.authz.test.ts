/**
 * seller.authz.test.ts
 *
 * Ownership and authorization for the seller flows the Phase 1 migration
 * unblocked — registration, profile, documents and verification.
 *
 * The seller router had NO test of any kind. Its tables (`seller_profiles`,
 * `seller_documents`) did not exist in any migration until 20260909, so nothing
 * that touched them could run; now that they do, these are the assertions that
 * stop the ownership rules regressing quietly.
 *
 * What is pinned down here:
 *
 *   • The acting seller is the authenticated caller. A `userId` or `sellerId`
 *     in the request body is data, never identity — that is what turns a
 *     seller application into someone else's account.
 *   • verificationStatus is set by the server, never accepted from input. A
 *     seller that could send `{"verificationStatus":"verified"}` would approve
 *     their own KYC.
 *   • Only admin roles may move a seller through the verification lifecycle.
 *   • The seller router refuses an unauthenticated caller outright.
 *
 * Run in SIGNED mode like auth.rbac.test.ts, because that is what production
 * runs and because a header-trust test would prove nothing about forgery.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

/** What the service layer was asked to do, and on whose behalf. */
const calls: {
  register: Array<{ userId: string; input: Record<string, unknown> }>;
  profile: string[];
  document: Array<{ userId: string; documentType: string }>;
  verify: Array<{ sellerId: string; adminId: string; action: string }>;
} = { register: [], profile: [], document: [], verify: [] };

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: {},
  connectDB: async () => undefined,
  disconnectDB: async () => undefined,
}));

jest.unstable_mockModule('../services/seller.service.js', () => ({
  registerSeller: async (userId: string, input: Record<string, unknown>) => {
    calls.register.push({ userId, input });
    // Mirrors the real service: status is server-assigned, never taken from input.
    return { id: 'profile-1', userId, verificationStatus: 'pending', storeSlug: 'test-1' };
  },
  getMySellerProfile: async (userId: string) => {
    calls.profile.push(userId);
    return { id: 'profile-1', userId, verificationStatus: 'pending' };
  },
  addSellerDocument: async (userId: string, documentType: string) => {
    calls.document.push({ userId, documentType });
    return { id: 'doc-1', documentType };
  },
  verifySeller: async (sellerId: string, adminId: string, action: string) => {
    calls.verify.push({ sellerId, adminId, action });
    return { id: sellerId, verificationStatus: 'verified' };
  },
  listSellers: async () => [],
  listPendingSellers: async () => [],
  getSellerById: async () => ({ id: 'profile-1' }),
  getIdentityStats: async () => ({ users: 0, customers: 0, sellers: 0 }),
  userOwnsDocument: async () => false,
}));

jest.unstable_mockModule('../services/auth.service.js', () => ({
  listUsers: async () => ({ users: [], total: 0, page: 1, limit: 20 }),
}));

jest.unstable_mockModule('../services/rbac.service.js', () => ({
  listRoles: () => [], listPermissions: () => [], listStaff: async () => [],
  isAdminRole: () => true, assignRole: async () => ({}),
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { signIdentity, INTERNAL_IDENTITY_HEADER } = await import(
  '../../../../shared/utils/internal-identity.js'
);
const { sellerRouter } = await import('../controllers/seller.controller.js');
const { adminRouter }  = await import('../controllers/admin.controller.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', sellerRouter);
  app.use('/api/v1', adminRouter);
  return app;
}

const app = makeApp();

/**
 * An authenticated caller on the seller router.
 *
 * This used to be the plain `{ 'x-user-id': userId }` header, and it worked
 * because the seller router carried its own `requireUser` that accepted any
 * non-empty x-user-id — in signed mode, where this file runs, that is a header
 * anyone can type. It now signs the assertion the gateway would, the same way
 * `asRole` already did for the admin router. The forged-header case is pinned
 * below rather than being the way every test authenticates.
 */
const asUser = (userId: string) => asRole(userId, 'ROLE_CUSTOMER');

/** The signed assertion the admin router requires. */
function asRole(userId: string, ...roles: string[]): Record<string, string> {
  const assertion = signIdentity(userId, roles);
  if (!assertion) throw new Error('INTERNAL_IDENTITY_SECRET not picked up — test would be vacuous');
  return { [INTERNAL_IDENTITY_HEADER]: assertion };
}

const VALID_APPLICATION = {
  businessName: 'Test Crafts Ltd',
  businessType: 'company',
  businessAddress: { street: '1 Test Road', city: 'Kampala', country: 'UG' },
  bankAccount: { accountNumber: '1234567890', bankName: 'Test Bank', accountName: 'Test Crafts Ltd' },
  storeName: 'Test Crafts',
};

beforeEach(() => {
  calls.register = []; calls.profile = []; calls.document = []; calls.verify = [];
});

describe('seller router — authentication is required', () => {
  it('401s an unauthenticated seller application', async () => {
    const res = await request(app).post('/api/v1/sellers/register').send(VALID_APPLICATION);
    expect(res.status).toBe(401);
    expect(calls.register).toHaveLength(0);
  });

  it('401s an unauthenticated profile read', async () => {
    const res = await request(app).get('/api/v1/sellers/me');
    expect(res.status).toBe(401);
    expect(calls.profile).toHaveLength(0);
  });

  it('401s a hand-written x-user-id, because nothing signed it', async () => {
    // The seller router's own requireUser accepted any non-empty x-user-id, so
    // this header alone submitted an application as that account — and, on the
    // documents route, attached a national ID or bank statement to it.
    const res = await request(app)
      .post('/api/v1/sellers/register')
      .set({ 'x-user-id': 'seller-A' })
      .send(VALID_APPLICATION);

    expect(res.status).toBe(401);
    expect(calls.register).toHaveLength(0);
  });

  it('will not let a forged header override a signed identity', async () => {
    const res = await request(app)
      .get('/api/v1/sellers/me')
      .set(asUser('seller-A'))
      .set('x-user-id', 'seller-B');

    expect(res.status).toBe(200);
    // The profile read is the signed caller's, not the one named in the header.
    expect(calls.profile).toEqual(['seller-A']);
  });
});

describe('seller application — the applicant is the session, not the payload', () => {
  it('registers the authenticated caller', async () => {
    const res = await request(app)
      .post('/api/v1/sellers/register')
      .set(asUser('seller-A'))
      .send(VALID_APPLICATION);

    expect(res.status).toBe(201);
    expect(calls.register[0]?.userId).toBe('seller-A');
  });

  it('ignores a userId in the body naming another account', async () => {
    const res = await request(app)
      .post('/api/v1/sellers/register')
      .set(asUser('seller-A'))
      .send({ ...VALID_APPLICATION, userId: 'victim-B' });

    expect(res.status).toBe(201);
    expect(calls.register[0]?.userId).toBe('seller-A');
    expect(calls.register[0]?.userId).not.toBe('victim-B');
  });

  it('strips verificationStatus so a seller cannot approve their own KYC', async () => {
    const res = await request(app)
      .post('/api/v1/sellers/register')
      .set(asUser('seller-A'))
      .send({ ...VALID_APPLICATION, verificationStatus: 'verified', verifiedBy: 'self' });

    expect(res.status).toBe(201);
    expect(calls.register[0]?.input).not.toHaveProperty('verificationStatus');
    expect(calls.register[0]?.input).not.toHaveProperty('verifiedBy');
    expect(res.body.seller.verificationStatus).toBe('pending');
  });

  it('strips a roles array, so an application cannot grant privileges', async () => {
    await request(app)
      .post('/api/v1/sellers/register')
      .set(asUser('seller-A'))
      .send({ ...VALID_APPLICATION, roles: ['ROLE_ADMIN'] });

    expect(calls.register[0]?.input).not.toHaveProperty('roles');
  });

  it('rejects an application that fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/sellers/register')
      .set(asUser('seller-A'))
      .send({ businessName: 'X' }); // no address, no bank account

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls.register).toHaveLength(0);
  });
});

describe('seller profile — scoped to the caller', () => {
  it('reads only the authenticated seller’s own profile', async () => {
    const res = await request(app).get('/api/v1/sellers/me').set(asUser('seller-A'));
    expect(res.status).toBe(200);
    expect(calls.profile).toEqual(['seller-A']);
  });

  it('cannot be redirected at another seller with a query parameter', async () => {
    await request(app).get('/api/v1/sellers/me?userId=victim-B').set(asUser('seller-A'));
    expect(calls.profile).toEqual(['seller-A']);
    expect(calls.profile).not.toContain('victim-B');
  });
});

describe('seller verification — admin only', () => {
  it('401s an unauthenticated verification attempt', async () => {
    const res = await request(app)
      .put('/api/v1/admin/sellers/profile-1/verify')
      .send({ action: 'approve' });

    expect(res.status).toBe(401);
    expect(calls.verify).toHaveLength(0);
  });

  it('403s a seller trying to approve themselves', async () => {
    const res = await request(app)
      .put('/api/v1/admin/sellers/profile-1/verify')
      .set(asRole('seller-A', 'ROLE_SELLER'))
      .send({ action: 'approve' });

    expect(res.status).toBe(403);
    expect(calls.verify).toHaveLength(0);
  });

  it('403s a customer', async () => {
    const res = await request(app)
      .put('/api/v1/admin/sellers/profile-1/verify')
      .set(asRole('customer-1', 'ROLE_CUSTOMER'))
      .send({ action: 'approve' });

    expect(res.status).toBe(403);
    expect(calls.verify).toHaveLength(0);
  });

  it('allows an admin, recording the admin as the verifier', async () => {
    const res = await request(app)
      .put('/api/v1/admin/sellers/profile-1/verify')
      .set(asRole('admin-1', 'ROLE_ADMIN'))
      .send({ action: 'approve', reason: 'Documents in order' });

    expect(res.status).toBe(200);
    expect(calls.verify[0]).toMatchObject({ sellerId: 'profile-1', adminId: 'admin-1', action: 'approve' });
  });

  it('rejects an action outside the defined lifecycle', async () => {
    const res = await request(app)
      .put('/api/v1/admin/sellers/profile-1/verify')
      .set(asRole('admin-1', 'ROLE_ADMIN'))
      .send({ action: 'make_verified' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls.verify).toHaveLength(0);
  });

  it('ignores a hand-written x-user-roles claiming admin', async () => {
    const res = await request(app)
      .put('/api/v1/admin/sellers/profile-1/verify')
      .set({ 'x-user-id': 'seller-A', 'x-user-roles': 'ROLE_ADMIN' })
      .send({ action: 'approve' });

    expect(res.status).toBe(401);
    expect(calls.verify).toHaveLength(0);
  });
});
