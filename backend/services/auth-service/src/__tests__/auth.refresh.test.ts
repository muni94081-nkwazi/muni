/**
 * auth.refresh.test.ts
 *
 * Refresh-token rotation, and what happens when a token is used twice.
 *
 * A refresh token lives 30 days and buys a fresh access token on demand, which
 * makes it the most valuable thing a client holds. Rotation alone does not
 * protect it: if an attacker copies a token and the real user then rotates it,
 * the attacker's copy is dead — but if the ATTACKER rotates first, the real
 * user's next refresh presents a token that no longer matches, and a naive
 * implementation just fails that one request and lets the attacker continue.
 *
 * The defence is to treat any reuse within a family as evidence of theft and
 * revoke the whole family, logging both parties out. That is the behaviour
 * asserted here, and it had no test at all — the single most security-relevant
 * uncovered path in the service.
 *
 * This file carries its own token mocks rather than reusing auth.service.test's:
 * that one returns a CONSTANT 'mock-refresh-token' and a `readRefreshToken`
 * that always answers null, which is fine for the flows it covers and useless
 * for rotation, where every token must be distinct and decodable.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import bcrypt from 'bcryptjs';
import type { RefreshToken } from '../generated/prisma/index.js';
import type { IUserRepository, UserRecord } from '../repositories/user.repository.js';

// ─── Token mocks that actually round-trip ─────────────────────────────────────
// `tok:<userId>:<family>:<serial>` — unique per issue, and parseable back into
// the claims the service reads. bcrypt below is REAL, so hashing and comparison
// are the production code paths.

let serial = 0;

jest.unstable_mockModule('../../../../shared/utils/token.js', () => ({
  createAccessToken: (userId: string) => `access:${userId}`,
  createRefreshToken: (userId: string, family: string) => `tok:${userId}:${family}:${++serial}`,
  createMfaChallengeToken: (userId: string, purpose: string) => `mock:${purpose}:${userId}`,
  readMfaChallengeToken: () => null,
  readAccessToken: () => null,
  readRefreshToken: (token?: string) => {
    if (!token?.startsWith('tok:')) return null;
    const [, sub, family] = token.split(':');
    return { sub, family, type: 'refresh' as const };
  },
  ACCESS_TOKEN_TTL_SECONDS: 900,
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: {},
  connectDB: async () => undefined,
  disconnectDB: async () => undefined,
}));

jest.unstable_mockModule('../repositories/twofactor.repository.js', () => ({
  twoFactorRepository: { find: async () => null },
}));

jest.unstable_mockModule('../clients/notification.client.js', () => ({
  sendNotification: async () => true,
}));

const authService = await import('../services/auth.service.js');

// ─── Minimal repository ───────────────────────────────────────────────────────

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    firstName: 'Alice',
    lastName: 'Nakato',
    email: 'alice@muni.ug',
    phoneNumber: null,
    profilePictureUrl: null,
    passwordHash: '$2a$10$placeholder',
    roles: ['ROLE_CUSTOMER'],
    active: true,
    emailVerified: false,
    phoneVerified: false,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as UserRecord;
}

class Repo implements Partial<IUserRepository> {
  users = new Map<string, UserRecord>();
  tokens: RefreshToken[] = [];
  private seq = 0;

  async findById(id: string) { return this.users.get(id) ?? null; }
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async createRefreshToken(data: { userId: string; tokenHash: string; family: string; expiresAt: Date }) {
    const t = {
      id: `rt-${++this.seq}`,
      revokedAt: null,
      createdAt: new Date(),
      ...data,
    } as RefreshToken;
    this.tokens.push(t);
    return t;
  }
  async findRefreshTokensByFamily(family: string) {
    return this.tokens.filter((t) => t.family === family);
  }
  async revokeRefreshToken(id: string) {
    const t = this.tokens.find((x) => x.id === id);
    if (t) t.revokedAt = new Date();
  }
  async revokeAllUserTokens(userId: string) {
    for (const t of this.tokens) if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
  }
  async deleteExpiredRefreshTokens() { /* no-op */ }
  async update(id: string, input: Record<string, unknown>) {
    const u = this.users.get(id)!;
    Object.assign(u, input);
    return u;
  }

  /** Every live (unrevoked, unexpired) token in a family. */
  live(family: string) {
    return this.tokens.filter((t) => t.family === family && !t.revokedAt);
  }
}

let repo: Repo;
const asRepo = () => repo as unknown as IUserRepository;

beforeEach(() => {
  serial = 0;
  repo = new Repo();
  repo.users.set('user-1', makeUser());
});

/** Issue a first session the way login() would, and hand back its token. */
async function issueSession(): Promise<string> {
  const res = await authService.buildAuthResponse(repo.users.get('user-1')!, asRepo());
  return res.refreshToken;
}

describe('refresh — rotation', () => {
  it('exchanges a valid token for a NEW one', async () => {
    const first = await issueSession();
    const result = await authService.refresh(first, asRepo());

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    // A refresh that returned the same token would leave a stolen copy valid
    // for the full 30 days — rotation is the whole point.
    expect(result.refreshToken).not.toBe(first);
  });

  it('revokes the presented token once it has been exchanged', async () => {
    const first = await issueSession();
    const { family } = { family: repo.tokens[0].family };

    await authService.refresh(first, asRepo());

    const original = repo.tokens.find((t) => t.id === 'rt-1');
    expect(original?.revokedAt).not.toBeNull();
    // And the replacement is live, in the same family.
    expect(repo.live(family)).toHaveLength(1);
  });

  it('keeps the new token in the SAME family, so reuse stays detectable', async () => {
    const first = await issueSession();
    const originalFamily = repo.tokens[0].family;

    await authService.refresh(first, asRepo());

    // A fresh family per rotation would break reuse detection entirely: the
    // stolen token's family would contain only itself.
    const families = new Set(repo.tokens.map((t) => t.family));
    expect(families.size).toBe(1);
    expect([...families][0]).toBe(originalFamily);
  });

  it('rejects a token that does not decode', async () => {
    await expect(authService.refresh('not-a-token', asRepo())).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a missing token rather than treating it as anonymous', async () => {
    await expect(authService.refresh(undefined, asRepo())).rejects.toMatchObject({ status: 401 });
  });
});

describe('refresh — reuse detection', () => {
  it('revokes the ENTIRE family when a spent token is presented again', async () => {
    // The theft scenario. An attacker copies the token and redeems it first;
    // the real user then presents the same one.
    const stolen = await issueSession();
    const family = repo.tokens[0].family;

    // Attacker rotates. Their new token is now the only live one.
    const attacker = await authService.refresh(stolen, asRepo());
    expect(repo.live(family)).toHaveLength(1);

    // Real user presents the copy they still hold.
    await expect(authService.refresh(stolen, asRepo())).rejects.toMatchObject({ status: 401 });

    // Both are now dead. Logging BOTH out is correct: the service cannot tell
    // which party was the thief, and leaving the attacker's session alive while
    // failing the victim's request is the worst of both outcomes.
    expect(repo.live(family)).toHaveLength(0);

    // Concretely: the attacker's freshly-rotated token no longer works either.
    await expect(authService.refresh(attacker.refreshToken, asRepo()))
      .rejects.toMatchObject({ status: 401 });
  });

  it('reports reuse distinctly, so it can be alerted on', async () => {
    const stolen = await issueSession();
    await authService.refresh(stolen, asRepo());

    await expect(authService.refresh(stolen, asRepo()))
      .rejects.toThrow(/reuse detected/i);
  });

  it('does not revoke a DIFFERENT family', async () => {
    // Two devices, two families. A theft on one must not sign the other out —
    // that would turn one compromised device into a platform-wide logout.
    const deviceA = await issueSession();
    const deviceB = await issueSession();
    const familyA = repo.tokens[0].family;
    const familyB = repo.tokens[1].family;
    expect(familyA).not.toBe(familyB);

    await authService.refresh(deviceA, asRepo());
    await expect(authService.refresh(deviceA, asRepo())).rejects.toMatchObject({ status: 401 });

    expect(repo.live(familyA)).toHaveLength(0);
    expect(repo.live(familyB)).toHaveLength(1);
    // Device B still refreshes normally.
    await expect(authService.refresh(deviceB, asRepo())).resolves.toBeDefined();
  });

  it('rejects an expired token without nuking the family', async () => {
    // An expired token is ordinary lifecycle, not evidence of theft. Treating
    // it as reuse would sign users out every time they returned after 30 days.
    const token = await issueSession();
    repo.tokens[0].expiresAt = new Date(Date.now() - 1000);

    await expect(authService.refresh(token, asRepo())).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a revoked token', async () => {
    const token = await issueSession();
    repo.tokens[0].revokedAt = new Date();

    await expect(authService.refresh(token, asRepo())).rejects.toMatchObject({ status: 401 });
  });
});

describe('refresh — account state', () => {
  it('refuses to refresh a deactivated account', async () => {
    // The access token is short-lived, so refusing here is what actually ends a
    // banned user's access rather than merely shortening it.
    const token = await issueSession();
    repo.users.get('user-1')!.active = false;

    await expect(authService.refresh(token, asRepo())).rejects.toMatchObject({ status: 401 });
  });

  it('refuses to refresh for a user that no longer exists', async () => {
    const token = await issueSession();
    repo.users.delete('user-1');

    await expect(authService.refresh(token, asRepo())).rejects.toMatchObject({ status: 401 });
  });
});

describe('refresh — token storage', () => {
  it('stores a HASH, never the token itself', async () => {
    // A database dump must not yield usable refresh tokens.
    const token = await issueSession();
    const stored = repo.tokens[0];

    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash.startsWith('$2')).toBe(true);
    // And it is the hash OF that token, not of something else.
    await expect(bcrypt.compare(token, stored.tokenHash)).resolves.toBe(true);
  });
});
