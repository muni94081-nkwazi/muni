import { type TwoFactorSecret } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';

// ─── Repository Interface ─────────────────────────────────────────────────────
// The controller depends on this interface — NOT on Prisma directly.

export interface ITwoFactorRepository {
  find(userId: string): Promise<TwoFactorSecret | null>;
  upsertSecret(userId: string, secret: string): Promise<TwoFactorSecret>;
  markEnabled(userId: string): Promise<TwoFactorSecret>;
}

// ─── Prisma Implementation ────────────────────────────────────────────────────

export class PrismaTwoFactorRepository implements ITwoFactorRepository {
  async find(userId: string): Promise<TwoFactorSecret | null> {
    return prisma.twoFactorSecret.findUnique({ where: { userId } });
  }

  async upsertSecret(userId: string, secret: string): Promise<TwoFactorSecret> {
    // Re-generating a secret resets `enabled` — the user must re-verify with the new one
    return prisma.twoFactorSecret.upsert({
      where:  { userId },
      create: { userId, secret, enabled: false },
      update: { secret, enabled: false },
    });
  }

  async markEnabled(userId: string): Promise<TwoFactorSecret> {
    return prisma.twoFactorSecret.update({
      where: { userId },
      data:  { enabled: true },
    });
  }
}

// ─── Default Export ───────────────────────────────────────────────────────────

export const twoFactorRepository: ITwoFactorRepository = new PrismaTwoFactorRepository();
