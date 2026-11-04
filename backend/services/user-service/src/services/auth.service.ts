import type { User } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateOpaqueToken,
  hashOpaqueToken,
} from '../utils/tokens.js';
import env from '../config/env.js';
import { publish, TOPICS } from '../events/publisher.js';

export type PublicUser = Omit<User, 'passwordHash'>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

async function issueTokenPair(user: User): Promise<TokenPair> {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  const hash = hashOpaqueToken(refreshToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // mirrors JWT_REFRESH_EXPIRES_IN default

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt },
  });

  return { accessToken, refreshToken };
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<{ user: PublicUser } & TokenPair> {
  const { firstName, lastName, email, phoneNumber, password } = input;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, ...(phoneNumber ? [{ phoneNumber }] : [])],
    },
  });

  if (existing) {
    if (existing.email === email) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw ApiError.conflict('An account with this phone number already exists');
  }

  const passwordHash = await hashPassword(password);

  // Preferences are created alongside the user so notification-service never
  // has to handle a "user exists but has no preference row" case — it can
  // treat a missing row as a hard error rather than guessing defaults.
  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      phoneNumber,
      passwordHash,
      preferences: { create: {} },
    },
  });

  const tokens = await issueTokenPair(user);

  await publish(TOPICS.USER_REGISTERED, {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    phoneNumber: user.phoneNumber,
  });

  return { user: toPublicUser(user), ...tokens };
}

export async function login(input: { email: string; password: string }): Promise<{ user: PublicUser } & TokenPair> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Same error for "no such user" and "wrong password" — don't help an
  // attacker enumerate which emails have accounts.
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function refresh(input: { refreshToken: string }): Promise<{ user: PublicUser } & TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = hashOpaqueToken(input.refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  // Rotate: revoke the old refresh token and issue a new pair, so a stolen
  // (but already-used) refresh token stops working.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function logout(input: { refreshToken: string }): Promise<void> {
  const tokenHash = hashOpaqueToken(input.refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function forgotPassword(input: { email: string }): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always behave the same way whether or not the account exists, so the
  // response can't be used to enumerate registered emails.
  if (!user) return;

  const { raw, hash } = generateOpaqueToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + env.passwordReset.ttlMinutes);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt },
  });

  // The raw token is only ever handed to notification-service via this
  // event — it is never returned in the HTTP response or logged.
  await publish(TOPICS.USER_PASSWORD_RESET_REQUESTED, {
    userId: user.id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    firstName: user.firstName,
    resetToken: raw,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function resetPassword(input: { token: string; newPassword: string }): Promise<void> {
  const tokenHash = hashOpaqueToken(input.token);
  const resetRecord = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
    throw ApiError.badRequest('This reset link is invalid or has expired');
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetRecord.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    }),
    // Reset the password -> invalidate every existing session for safety.
    prisma.refreshToken.updateMany({
      where: { userId: resetRecord.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await publish(TOPICS.USER_PASSWORD_RESET, { userId: resetRecord.userId });
}
