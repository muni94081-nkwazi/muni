import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import env from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
}

/** Minimal shape needed to mint a token — accepts a full Prisma User too. */
export interface TokenSubject {
  id: string;
  email: string;
  role: string;
}

export function signAccessToken(user: TokenSubject): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn } as SignOptions,
  );
}

export function signRefreshToken(user: TokenSubject): string {
  return jwt.sign({ sub: user.id }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
}

/**
 * Opaque, high-entropy tokens for password reset / refresh-token storage.
 * We store only a SHA-256 hash of the token in the DB — never the raw
 * value — so a database leak alone can't be used to reset an account or
 * mint a session.
 */
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashOpaqueToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
