import { type User as PrismaUser, type RefreshToken, type PasswordReset } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';

// ─── Domain Types (what the service layer works with) ─────────────────────────

export type UserRecord = PrismaUser;

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  passwordHash: string;
  roles?: string[];
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profilePictureUrl?: string;
  lastLoginAt?: Date;
  active?: boolean;
  emailVerified?: boolean;
}

// ─── Repository Interface ─────────────────────────────────────────────────────
// The service layer depends on this interface — NOT on Prisma directly.
// Swap implementations freely (e.g. test mocks) without touching business logic.

export interface IUserRepository {
  // ── Users ──
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  update(id: string, input: UpdateUserInput): Promise<UserRecord>;

  // ── Refresh Tokens ──
  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
  }): Promise<RefreshToken>;
  findRefreshToken(tokenHash: string): Promise<RefreshToken | null>;
  findRefreshTokensByFamily(family: string): Promise<RefreshToken[]>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
  deleteExpiredRefreshTokens(userId: string): Promise<void>;

  // ── Password Resets ──
  createPasswordReset(data: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
  }): Promise<PasswordReset>;
  findLatestPasswordReset(userId: string): Promise<PasswordReset | null>;
  markPasswordResetUsed(id: string): Promise<void>;
}

// ─── Prisma Implementation ────────────────────────────────────────────────────

export class PrismaUserRepository implements IUserRepository {
  // ── Users ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    // Uses the DB unique index on `email` — O(log n), not O(n)
    return prisma.user.findUnique({ where: { email } });
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    return prisma.user.create({
      data: {
        firstName:    input.firstName,
        lastName:     input.lastName,
        email:        input.email,
        phoneNumber:  input.phoneNumber ?? null,
        passwordHash: input.passwordHash,
        roles:        input.roles ?? ['ROLE_CUSTOMER'],
      },
    });
  }

  async update(id: string, input: UpdateUserInput): Promise<UserRecord> {
    return prisma.user.update({ where: { id }, data: input });
  }

  // ── Refresh Tokens ─────────────────────────────────────────────────────────

  async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    return prisma.refreshToken.create({ data });
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async findRefreshTokensByFamily(family: string): Promise<RefreshToken[]> {
    return prisma.refreshToken.findMany({ where: { family } });
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id },
      data:  { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
  }

  async deleteExpiredRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }

  // ── Password Resets ────────────────────────────────────────────────────────

  async createPasswordReset(data: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
  }): Promise<PasswordReset> {
    return prisma.passwordReset.create({ data });
  }

  async findLatestPasswordReset(userId: string): Promise<PasswordReset | null> {
    return prisma.passwordReset.findFirst({
      where:   { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await prisma.passwordReset.update({
      where: { id },
      data:  { usedAt: new Date() },
    });
  }
}

// ─── Default Export ───────────────────────────────────────────────────────────
// The service layer imports this singleton. In tests, inject a mock instead.

export const userRepository: IUserRepository = new PrismaUserRepository();
