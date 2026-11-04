import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

// A real signed token so we exercise the genuine verification path rather than
// a mock that would hide a regression in readAccessToken itself.
process.env.JWT_ACCESS_SECRET  = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

const { createAccessToken } = await import('../../../shared/utils/token.js');
const { verifyIdentity, INTERNAL_IDENTITY_HEADER } =
  await import('../../../shared/utils/internal-identity.js');
const { stripClientIdentity, optionalAuth, requireAuth, requireRole } =
  await import('../middleware/auth.middleware.js');

function makeReq(headers: Record<string, string> = {}) {
  const req = {
    headers: { ...headers },
    header(name: string) { return this.headers[name.toLowerCase()]; },
  };
  return req as unknown as Request & { headers: Record<string, string> };
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status: jest.fn(function (this: typeof res, code: number) { this.statusCode = code; return this; }),
    json:   jest.fn(function (this: typeof res, body: unknown) { this.body = body; return this; }),
  };
  return res;
}

const asRes = (r: ReturnType<typeof makeRes>) => r as unknown as Response;

let next: NextFunction;
beforeEach(() => { next = jest.fn() as unknown as NextFunction; });

// ─── The vulnerability this middleware exists to close ────────────────────────

describe('stripClientIdentity', () => {
  it('deletes client-supplied identity headers', () => {
    const req = makeReq({
      'x-user-id':    'attacker-controlled',
      'x-user-roles': 'ROLE_SUPER_ADMIN',
      'x-user-email': 'admin@muni.ug',
      'x-internal-call': 'true',
      [INTERNAL_IDENTITY_HEADER]: 'forged.jwt.here',
    });

    stripClientIdentity(req, asRes(makeRes()), next);

    expect(req.headers['x-user-id']).toBeUndefined();
    expect(req.headers['x-user-roles']).toBeUndefined();
    expect(req.headers['x-user-email']).toBeUndefined();
    expect(req.headers['x-internal-call']).toBeUndefined();
    expect(req.headers[INTERNAL_IDENTITY_HEADER]).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('leaves unrelated headers untouched', () => {
    const req = makeReq({ 'content-type': 'application/json', authorization: 'Bearer x' });

    stripClientIdentity(req, asRes(makeRes()), next);

    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers.authorization).toBe('Bearer x');
  });
});

describe('privilege escalation via spoofed headers', () => {
  it('does NOT authenticate a request carrying only forged headers', () => {
    const req = makeReq({ 'x-user-id': 'victim-id', 'x-user-roles': 'ROLE_SUPER_ADMIN' });
    const res = makeRes();

    // Full chain, in the order app.ts mounts it.
    stripClientIdentity(req, asRes(res), next);
    optionalAuth(req, asRes(res), next);
    requireAuth(req, asRes(res), next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('does NOT grant admin access from a forged x-user-roles header', () => {
    const req = makeReq({ 'x-user-id': 'nobody', 'x-user-roles': 'ROLE_SUPER_ADMIN' });
    const res = makeRes();
    // Separate spy for the guard: the two middlewares before it call next()
    // unconditionally by design, so a shared spy would prove nothing.
    const guardNext = jest.fn() as unknown as NextFunction;

    stripClientIdentity(req, asRes(res), next);
    optionalAuth(req, asRes(res), next);
    requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN')(req, asRes(res), guardNext);

    expect(res.statusCode).toBe(401);
    expect(guardNext).not.toHaveBeenCalled();
  });

  it('does NOT let a real customer token escalate via a forged roles header', () => {
    const token = createAccessToken('customer-1', ['ROLE_CUSTOMER']);
    const req = makeReq({
      authorization:  `Bearer ${token}`,
      'x-user-roles': 'ROLE_SUPER_ADMIN',   // forged alongside a valid token
    });
    const res = makeRes();

    stripClientIdentity(req, asRes(res), next);
    optionalAuth(req, asRes(res), next);
    requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN')(req, asRes(res), next);

    // Roles come from the token, not the header the caller sent.
    expect(req.headers['x-user-roles']).toBe('ROLE_CUSTOMER');
    expect(res.statusCode).toBe(403);
  });

  it('does NOT let a forged x-user-id rebind a valid token to another user', () => {
    const token = createAccessToken('customer-1', ['ROLE_CUSTOMER']);
    const req = makeReq({ authorization: `Bearer ${token}`, 'x-user-id': 'victim-2' });

    stripClientIdentity(req, asRes(makeRes()), next);
    optionalAuth(req, asRes(makeRes()), next);

    expect(req.headers['x-user-id']).toBe('customer-1');
  });
});

// ─── The legitimate path still works ──────────────────────────────────────────

describe('legitimate authentication', () => {
  it('stamps identity from a valid access token', () => {
    const token = createAccessToken('user-7', ['ROLE_CUSTOMER']);
    const req = makeReq({ authorization: `Bearer ${token}` });

    stripClientIdentity(req, asRes(makeRes()), next);
    optionalAuth(req, asRes(makeRes()), next);

    expect(req.headers['x-user-id']).toBe('user-7');
    expect(req.headers['x-user-roles']).toBe('ROLE_CUSTOMER');
  });

  it('mints a verifiable internal identity assertion', () => {
    const token = createAccessToken('user-7', ['ROLE_SELLER']);
    const req = makeReq({ authorization: `Bearer ${token}` });

    stripClientIdentity(req, asRes(makeRes()), next);
    optionalAuth(req, asRes(makeRes()), next);

    const assertion = verifyIdentity(req.headers[INTERNAL_IDENTITY_HEADER]);
    expect(assertion).toEqual({ sub: 'user-7', roles: ['ROLE_SELLER'] });
  });

  it('rejects an assertion signed with a different secret', () => {
    const token = createAccessToken('user-7', ['ROLE_SELLER']);
    const req = makeReq({ authorization: `Bearer ${token}` });
    stripClientIdentity(req, asRes(makeRes()), next);
    optionalAuth(req, asRes(makeRes()), next);
    const assertion = req.headers[INTERNAL_IDENTITY_HEADER];

    const original = process.env.INTERNAL_IDENTITY_SECRET;
    process.env.INTERNAL_IDENTITY_SECRET = 'a-completely-different-secret-32-chars!!';
    expect(verifyIdentity(assertion)).toBeNull();
    process.env.INTERNAL_IDENTITY_SECRET = original;
  });

  it('admits an admin holding a genuine admin token', () => {
    const token = createAccessToken('admin-1', ['ROLE_ADMIN']);
    const req = makeReq({ authorization: `Bearer ${token}` });
    const res = makeRes();

    stripClientIdentity(req, asRes(res), next);
    optionalAuth(req, asRes(res), next);
    requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN')(req, asRes(res), next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('rejects an expired or tampered token', () => {
    const req = makeReq({ authorization: 'Bearer not.a.real.token' });
    const res = makeRes();

    stripClientIdentity(req, asRes(res), next);
    optionalAuth(req, asRes(res), next);
    requireAuth(req, asRes(res), next);

    expect(res.statusCode).toBe(401);
  });
});
