/**
 * auth.service.test.ts
 *
 * Unit tests for auth.service using an in-memory mock repository.
 * No real database or JWT secrets required.
 *
 * ESM Note: With --experimental-vm-modules, jest globals must be imported
 * explicitly from @jest/globals and module mocking uses jest.unstable_mockModule
 * called before dynamic imports of the modules under test.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { IUserRepository, UserRecord } from '../repositories/user.repository.js';
import type { RefreshToken, PasswordReset } from '../generated/prisma/index.js';

// ─── Module Mocks ─────────────────────────────────────────────────────────────
// Must happen before the dynamic import of auth.service

jest.unstable_mockModule('../../../../shared/utils/token.js', () => ({
  createAccessToken:  (_userId: string, _roles: string[]) => 'mock-access-token',
  createRefreshToken: (_userId: string, _family: string) => 'mock-refresh-token',
  createMfaChallengeToken: (userId: string, purpose: string) => `mock-challenge:${purpose}:${userId}`,
  readMfaChallengeToken:   (_token?: string) => null,
  readRefreshToken:   (_token?: string) => null,
  readAccessToken:    (_token?: string) => null,
  generateId:         () => 'mock-uuid',
  generateRef:        (prefix: string) => `${prefix}-mock`,
  // The real module derives this from JWT_ACCESS_EXPIRES_IN; 15 minutes is its
  // default, and buildAuthResponse reports it as `expiresIn`.
  ACCESS_TOKEN_TTL_SECONDS: 900,
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma:       {},
  connectDB:    () => Promise.resolve(),
  disconnectDB: () => Promise.resolve(),
}));

// 2FA enrolment state, controlled per-test. login() consults this to decide
// whether to hand out tokens or a challenge.
const twoFactorState = new Map<string, { userId: string; secret: string; enabled: boolean }>();

jest.unstable_mockModule('../repositories/twofactor.repository.js', () => ({
  twoFactorRepository: {
    find:         async (userId: string) => twoFactorState.get(userId) ?? null,
    upsertSecret: async (userId: string, secret: string) => {
      const rec = { userId, secret, enabled: false };
      twoFactorState.set(userId, rec);
      return rec;
    },
    markEnabled:  async (userId: string) => {
      const rec = twoFactorState.get(userId)!;
      rec.enabled = true;
      return rec;
    },
  },
}));

// Dynamic import AFTER mocks — required for ESM Jest
const authService = await import('../services/auth.service.js');

// ─── In-Memory Mock Repository ────────────────────────────────────────────────

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id:                'user-id-1',
    firstName:         'Alice',
    lastName:          'Nakato',
    email:             'alice@muni.ug',
    phoneNumber:       null,
    profilePictureUrl: null,
    passwordHash:      '$2a$10$placeholder',
    roles:             ['ROLE_CUSTOMER'],
    active:            true,
    emailVerified:     false,
    phoneVerified:     false,
    lastLoginAt:       null,
    createdAt:         new Date('2026-01-01T00:00:00Z'),
    updatedAt:         new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id:        'rt-id-1',
    userId:    'user-id-1',
    tokenHash: 'hashed-token',
    family:    'family-1',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makePasswordReset(overrides: Partial<PasswordReset> = {}): PasswordReset {
  return {
    id:        'pr-id-1',
    userId:    'user-id-1',
    otpHash:   '$2a$10$placeholder',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    usedAt:    null,
    createdAt: new Date(),
    ...overrides,
  };
}

class MockUserRepository implements IUserRepository {
  users   = new Map<string, UserRecord>();
  tokens  = new Map<string, RefreshToken>();
  resets  = new Map<string, PasswordReset>();

  async findById(id: string)       { return this.users.get(id) ?? null; }
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async create(input: Parameters<IUserRepository['create']>[0]) {
    const user = makeUser({ ...input, id: `user-${this.users.size + 1}` });
    this.users.set(user.id, user);
    return user;
  }
  async update(id: string, input: Parameters<IUserRepository['update']>[1]) {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    // Only assign defined values — mirrors Prisma behaviour (undefined = skip field)
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) (user as Record<string, unknown>)[k] = v;
    }
    return user;
  }
  async createRefreshToken(data: Parameters<IUserRepository['createRefreshToken']>[0]) {
    const t = makeRefreshToken(data);
    this.tokens.set(t.id, t);
    return t;
  }
  async findRefreshToken(tokenHash: string) {
    return [...this.tokens.values()].find((t) => t.tokenHash === tokenHash) ?? null;
  }
  async findRefreshTokensByFamily(family: string) {
    return [...this.tokens.values()].filter((t) => t.family === family);
  }
  async revokeRefreshToken(id: string) {
    const t = this.tokens.get(id);
    if (t) t.revokedAt = new Date();
  }
  async revokeAllUserTokens(userId: string) {
    for (const t of this.tokens.values()) {
      if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
    }
  }
  async deleteExpiredRefreshTokens(_userId: string) { /* no-op */ }
  async createPasswordReset(data: Parameters<IUserRepository['createPasswordReset']>[0]) {
    const r = makePasswordReset(data);
    this.resets.set(r.id, r);
    return r;
  }
  async findLatestPasswordReset(userId: string) {
    return (
      [...this.resets.values()]
        .filter((r) => r.userId === userId && !r.usedAt)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }
  async markPasswordResetUsed(id: string) {
    const r = this.resets.get(id);
    if (r) r.usedAt = new Date();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('auth.service', () => {
  let repo: MockUserRepository;

  beforeEach(() => {
    repo = new MockUserRepository();
    twoFactorState.clear();
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    const validInput = {
      firstName: 'Alice',
      lastName:  'Nakato',
      email:     'alice@muni.ug',
      password:  'SecurePass1!',
    };

    it('creates a user and returns tokens + public user', async () => {
      const result = await authService.register(validInput, repo);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.tokenType).toBe('Bearer');
      // The access token's real lifetime, not the 3600 this used to assert:
      // expiresIn is now derived from JWT_ACCESS_EXPIRES_IN (default 15m) so a
      // client scheduling a refresh on it is not 45 minutes late.
      expect(result.expiresIn).toBe(900);
      expect(result.user.email).toBe(validInput.email);
      expect(result.user.roles).toEqual(['ROLE_CUSTOMER']);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects duplicate email with 409', async () => {
      await authService.register(validInput, repo);
      await expect(authService.register(validInput, repo)).rejects.toMatchObject({ status: 409 });
    });

    it('stores the user in the repository after registration', async () => {
      await authService.register(validInput, repo);
      const stored = await repo.findByEmail(validInput.email);
      expect(stored).not.toBeNull();
      expect(stored?.firstName).toBe(validInput.firstName);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login()', () => {
    beforeEach(async () => {
      await authService.register(
        { firstName: 'Bob', lastName: 'Okello', email: 'bob@muni.ug', password: 'Pass1234!' },
        repo,
      );
    });

    it('returns tokens for valid credentials', async () => {
      const result = await authService.login({ email: 'bob@muni.ug', password: 'Pass1234!' }, repo);
      expect(result.status).toBe('AUTHENTICATED');
      if (result.status !== 'AUTHENTICATED') throw new Error('unreachable');
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.email).toBe('bob@muni.ug');
    });

    it('rejects wrong password with 401', async () => {
      await expect(
        authService.login({ email: 'bob@muni.ug', password: 'WrongPass!' }, repo),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('rejects unknown email with 401', async () => {
      await expect(
        authService.login({ email: 'ghost@muni.ug', password: 'Pass1234!' }, repo),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('rejects deactivated accounts with 403', async () => {
      const user = await repo.findByEmail('bob@muni.ug');
      if (user) user.active = false;
      await expect(
        authService.login({ email: 'bob@muni.ug', password: 'Pass1234!' }, repo),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ── MFA enforcement ────────────────────────────────────────────────────────

  describe('login() MFA enforcement', () => {
    async function seedUser(email: string, roles: string[]) {
      const { user } = await authService.register(
        { firstName: 'Test', lastName: 'User', email, password: 'Pass1234!' },
        repo,
      );
      const record = await repo.findById(user.id);
      if (record) record.roles = roles;
      return user.id;
    }

    it('withholds tokens and issues a challenge when 2FA is enabled', async () => {
      const id = await seedUser('mfa@muni.ug', ['ROLE_CUSTOMER']);
      twoFactorState.set(id, { userId: id, secret: 'S', enabled: true });

      const result = await authService.login({ email: 'mfa@muni.ug', password: 'Pass1234!' }, repo);

      expect(result.status).toBe('MFA_REQUIRED');
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('forces enrolment for an admin with no second factor', async () => {
      await seedUser('admin@muni.ug', ['ROLE_ADMIN']);

      const result = await authService.login({ email: 'admin@muni.ug', password: 'Pass1234!' }, repo);

      expect(result.status).toBe('MFA_ENROLLMENT_REQUIRED');
      expect(result).not.toHaveProperty('accessToken');
    });

    it('forces enrolment for a seller with no second factor', async () => {
      await seedUser('seller@muni.ug', ['ROLE_SELLER']);

      const result = await authService.login({ email: 'seller@muni.ug', password: 'Pass1234!' }, repo);

      expect(result.status).toBe('MFA_ENROLLMENT_REQUIRED');
    });

    it('does not force enrolment on a plain customer', async () => {
      await seedUser('shopper@muni.ug', ['ROLE_CUSTOMER']);

      const result = await authService.login({ email: 'shopper@muni.ug', password: 'Pass1234!' }, repo);

      expect(result.status).toBe('AUTHENTICATED');
    });

    it('issues a challenge — not tokens — to an admin who has enrolled', async () => {
      const id = await seedUser('admin2@muni.ug', ['ROLE_SUPER_ADMIN']);
      twoFactorState.set(id, { userId: id, secret: 'S', enabled: true });

      const result = await authService.login({ email: 'admin2@muni.ug', password: 'Pass1234!' }, repo);

      expect(result.status).toBe('MFA_REQUIRED');
    });

    it('still rejects a wrong password before reaching the MFA branch', async () => {
      const id = await seedUser('mfa2@muni.ug', ['ROLE_ADMIN']);
      twoFactorState.set(id, { userId: id, secret: 'S', enabled: true });

      await expect(
        authService.login({ email: 'mfa2@muni.ug', password: 'WrongPass!' }, repo),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── currentUser ───────────────────────────────────────────────────────────

  describe('currentUser()', () => {
    it('returns public user data without passwordHash', async () => {
      const registered = await authService.register(
        { firstName: 'Carol', lastName: 'Achen', email: 'carol@muni.ug', password: 'P@ss1234' },
        repo,
      );
      const user = await authService.currentUser(registered.user.id, repo);
      expect(user.email).toBe('carol@muni.ug');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('throws 404 for unknown id', async () => {
      await expect(authService.currentUser('non-existent', repo)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── updateUser ────────────────────────────────────────────────────────────

  describe('updateUser()', () => {
    it('updates firstName and returns correct fullName', async () => {
      const { user } = await authService.register(
        { firstName: 'Dan', lastName: 'Ode', email: 'dan@muni.ug', password: 'P@ss1234' },
        repo,
      );
      const updated = await authService.updateUser(user.id, { firstName: 'Daniel' }, repo);
      expect(updated.firstName).toBe('Daniel');
      expect(updated.lastName).toBe('Ode');
      expect(updated.fullName).toBe('Daniel Ode');
    });
  });

  // ── forgotPassword ────────────────────────────────────────────────────────

  describe('forgotPassword()', () => {
    it('silently succeeds for unknown email (no info leak)', async () => {
      await expect(authService.forgotPassword('ghost@muni.ug', repo)).resolves.toBeUndefined();
      expect(repo.resets.size).toBe(0);
    });

    it('creates a password reset record for a known user', async () => {
      await authService.register(
        { firstName: 'Eve', lastName: 'Amara', email: 'eve@muni.ug', password: 'P@ss5678' },
        repo,
      );
      await authService.forgotPassword('eve@muni.ug', repo);
      expect(repo.resets.size).toBe(1);
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('handles missing token gracefully without throwing', async () => {
      await expect(authService.logout(undefined, repo)).resolves.toBeUndefined();
    });
  });
});
