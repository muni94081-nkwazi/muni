import { prisma } from '../db/prisma.js';
import { Discount, DiscountType } from '../models/discount.model.js';
import {
  DuplicateActiveCodeError,
  type CreateDiscountData,
  type IDiscountRepository,
  type RedeemOutcome,
  type UpdateDiscountData,
} from './discount.repository.js';

// ─── Postgres-backed discounts ────────────────────────────────────────────────
//
// The response shape is unchanged from what the Maps produced: `value` and
// `minOrderAmount` come back as numbers (Prisma hands back Decimal), dates as
// Date objects, and the applicable* lists as plain arrays.

type DecimalLike = { toNumber(): number } | number;

function numeric(value: DecimalLike): number {
  return typeof value === 'number' ? value : value.toNumber();
}

type DiscountRow = {
  id: string;
  code: string;
  type: DiscountType;
  value: DecimalLike;
  minOrderAmount: DecimalLike;
  maxUsageCount: number;
  usageCount: number;
  perUserLimit: number;
  applicableCategories: string[];
  applicableProducts: string[];
  applicableSellers: string[];
  startsAt: Date;
  expiresAt: Date;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  expiredNotifiedAt: Date | null;
};

function toDomain(row: DiscountRow): Discount {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: numeric(row.value),
    minOrderAmount: numeric(row.minOrderAmount),
    maxUsageCount: row.maxUsageCount,
    usageCount: row.usageCount,
    perUserLimit: row.perUserLimit,
    applicableCategories: row.applicableCategories,
    applicableProducts: row.applicableProducts,
    applicableSellers: row.applicableSellers,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    active: row.active,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiredNotifiedAt: row.expiredNotifiedAt,
  };
}

/** Prisma's unique-violation code. */
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export class PrismaDiscountRepository implements IDiscountRepository {
  async create(data: CreateDiscountData): Promise<Discount> {
    try {
      const row = await prisma.discount.create({ data });
      return toDomain(row as unknown as DiscountRow);
    } catch (err) {
      // The partial unique index (code WHERE active = true). Surfaced as a
      // domain error so the raw Prisma message — which quotes this file's
      // absolute path and source lines — never reaches a client.
      if (isUniqueViolation(err)) throw new DuplicateActiveCodeError(data.code);
      throw err;
    }
  }

  async update(id: string, data: UpdateDiscountData): Promise<Discount | null> {
    const existing = await prisma.discount.findUnique({ where: { id } });
    if (!existing) return null;

    try {
      const row = await prisma.discount.update({ where: { id }, data });
      return toDomain(row as unknown as DiscountRow);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DuplicateActiveCodeError(data.code ?? existing.code);
      }
      throw err;
    }
  }

  async deactivate(id: string): Promise<Discount | null> {
    const existing = await prisma.discount.findUnique({ where: { id } });
    if (!existing) return null;

    const row = await prisma.discount.update({ where: { id }, data: { active: false } });
    return toDomain(row as unknown as DiscountRow);
  }

  async findById(id: string): Promise<Discount | null> {
    const row = await prisma.discount.findUnique({ where: { id } });
    return row ? toDomain(row as unknown as DiscountRow) : null;
  }

  async findActiveByCode(code: string): Promise<Discount | null> {
    // At most one row can match: the partial unique index guarantees it.
    const row = await prisma.discount.findFirst({ where: { code, active: true } });
    return row ? toDomain(row as unknown as DiscountRow) : null;
  }

  async findAll(): Promise<Discount[]> {
    const rows = await prisma.discount.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((r) => toDomain(r as unknown as DiscountRow));
  }

  async findBySeller(sellerId: string): Promise<Discount[]> {
    const rows = await prisma.discount.findMany({
      where: {
        OR: [{ createdBy: sellerId }, { applicableSellers: { has: sellerId } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => toDomain(r as unknown as DiscountRow));
  }

  async countUserRedemptions(discountId: string, userId: string): Promise<number> {
    return prisma.discountRedemption.count({ where: { discountId, userId } });
  }

  async findRedemption(
    discountId: string,
    userId: string,
    orderId: string,
  ): Promise<{ discountAmount: number } | null> {
    const row = await prisma.discountRedemption.findUnique({
      where: { one_redemption_per_order: { discountId, userId, orderId } },
    });
    return row ? { discountAmount: numeric(row.discountAmount as DecimalLike) } : null;
  }

  /**
   * Consume one use of a discount, atomically.
   *
   * The ordering here is the whole guarantee, so it is worth being explicit:
   *
   *  1. A conditional UPDATE increments `usage_count` only WHERE
   *     `usage_count < max_usage_count`. Postgres evaluates that predicate
   *     under the row lock the UPDATE itself takes, so there is no window
   *     between the check and the write — which is exactly the window the old
   *     `discount.usageCount += 1` left open, letting a 500-use promotion
   *     redeem 501 times. Zero rows updated means the budget is spent.
   *
   *  2. That same row lock serialises every concurrent redemption of this
   *     discount for the rest of the transaction. Only because of that is the
   *     per-user COUNT in step 4 trustworthy: a competing redemption for the
   *     same user cannot commit in between.
   *
   *  3. Insert the redemption. A unique violation on
   *     (discountId, userId, orderId) means this exact order was already
   *     redeemed — the transaction is rolled back, undoing step 1, and the
   *     prior row is returned. That is what makes a replay free rather than a
   *     second decrement.
   *
   *  4. Count this user's redemptions. Over the limit rolls everything back.
   *
   * Steps 3 and 4 both abort by throwing, which is what discards the increment.
   */
  async redeem(input: {
    discountId: string;
    userId: string;
    orderId: string;
    discountAmount: number;
  }): Promise<RedeemOutcome> {
    const { discountId, userId, orderId, discountAmount } = input;

    const exists = await prisma.discount.findUnique({ where: { id: discountId } });
    if (!exists) return { status: 'not_found' };

    // Answer a replay without opening a transaction at all.
    const prior = await prisma.discountRedemption.findUnique({
      where: { one_redemption_per_order: { discountId, userId, orderId } },
    });
    if (prior) {
      const discount = await this.findById(discountId);
      return {
        status: 'already_redeemed',
        discount: discount!,
        discountAmount: numeric(prior.discountAmount as DecimalLike),
      };
    }

    type Abort = { abort: RedeemOutcome };
    try {
      const result = await prisma.$transaction(async (tx) => {
        // ── 1. Conditional increment: the budget guard AND the lock ────────
        const claimed = await tx.$executeRaw<number>`
          UPDATE "discounts"
             SET "usage_count" = "usage_count" + 1,
                 "updated_at"  = NOW()
           WHERE "id" = ${discountId}
             AND "usage_count" < "max_usage_count"
        `;
        if (claimed === 0) {
          throw { abort: { status: 'usage_limit_reached' } as RedeemOutcome } satisfies Abort;
        }

        // ── 3. Record it. Unique violation ⇒ replay, rolled back below. ────
        await tx.discountRedemption.create({
          data: { discountId, userId, orderId, discountAmount },
        });

        // ── 4. Per-user limit, safe under the lock taken in step 1 ─────────
        const discount = await tx.discount.findUniqueOrThrow({ where: { id: discountId } });
        const userCount = await tx.discountRedemption.count({ where: { discountId, userId } });
        if (userCount > discount.perUserLimit) {
          throw { abort: { status: 'per_user_limit_reached' } as RedeemOutcome } satisfies Abort;
        }

        return toDomain(discount as unknown as DiscountRow);
      });

      return { status: 'redeemed', discount: result };
    } catch (err) {
      if (err && typeof err === 'object' && 'abort' in err) {
        return (err as Abort).abort;
      }

      // Lost the replay race: a concurrent request for the same order inserted
      // first. Its increment stands; ours rolled back. Report the same answer
      // it will get.
      if (isUniqueViolation(err)) {
        const [discount, existing] = await Promise.all([
          this.findById(discountId),
          prisma.discountRedemption.findUnique({
            where: { one_redemption_per_order: { discountId, userId, orderId } },
          }),
        ]);
        if (discount && existing) {
          return {
            status: 'already_redeemed',
            discount,
            discountAmount: numeric(existing.discountAmount as DecimalLike),
          };
        }
      }

      throw err;
    }
  }

  /**
   * Undo a redemption — remove the row and give the use back, together.
   *
   * `deleteMany` rather than `delete` so a second reversal is a no-op instead
   * of a P2025: this runs from a saga compensation, which may be re-driven.
   * The decrement is conditional on that delete having found something, so a
   * repeat cannot walk the counter down past what was actually redeemed.
   */
  async reverseRedemption(
    discountId: string,
    userId: string,
    orderId: string,
  ): Promise<{ reversed: boolean }> {
    return prisma.$transaction(async (tx) => {
      const removed = await tx.discountRedemption.deleteMany({
        where: { discountId, userId, orderId },
      });

      if (removed.count === 0) return { reversed: false };

      // Guarded so a counter already reconciled by hand cannot go negative.
      await tx.$executeRaw`
        UPDATE "discounts"
           SET "usage_count" = GREATEST(0, "usage_count" - 1),
               "updated_at"  = NOW()
         WHERE "id" = ${discountId}
      `;

      return { reversed: true };
    });
  }

  async claimExpiryNotification(discountId: string): Promise<boolean> {
    // Conditional on the column still being null, so exactly one caller —
    // across every replica — wins the right to publish.
    const claimed = await prisma.discount.updateMany({
      where: { id: discountId, expiredNotifiedAt: null },
      data: { expiredNotifiedAt: new Date() },
    });
    return claimed.count === 1;
  }
}
