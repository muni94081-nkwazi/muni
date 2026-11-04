import { v4 as uuidv4 } from 'uuid';
import { Discount, DiscountType } from '../models/discount.model.js';

// ─── Discount persistence ─────────────────────────────────────────────────────
//
// Replaces two process-local Maps: `discounts` and the nested
// `userUsage: Map<userId, Map<discountId, count>>`.
//
// The interesting method is `redeem`. Everything else is ordinary CRUD; that
// one carries the guarantee that a limited promotion cannot be
// oversubscribed, and both implementations are held to it.

/** A code is already in use by another ACTIVE discount. */
export class DuplicateActiveCodeError extends Error {
  constructor(readonly code: string) {
    super(`Discount code ${code} already exists and is active`);
    this.name = 'DuplicateActiveCodeError';
  }
}

export interface CreateDiscountData {
  code: string;
  type: DiscountType;
  value: number;
  minOrderAmount: number;
  maxUsageCount: number;
  perUserLimit: number;
  applicableCategories: string[];
  applicableProducts: string[];
  applicableSellers: string[];
  startsAt: Date;
  expiresAt: Date;
  active: boolean;
  createdBy: string;
}

export type UpdateDiscountData = Partial<Omit<CreateDiscountData, 'createdBy'>>;

/**
 * Why a redemption was refused, or that it succeeded.
 *
 * A discriminated result rather than a thrown error: "the last one just went"
 * is a normal retail outcome the caller reports to the customer, not an
 * exception. `already_redeemed` carries the prior row so a replay returns what
 * the first attempt returned.
 */
export type RedeemOutcome =
  | { status: 'redeemed'; discount: Discount }
  | { status: 'already_redeemed'; discount: Discount; discountAmount: number }
  | { status: 'usage_limit_reached' }
  | { status: 'per_user_limit_reached' }
  | { status: 'not_found' };

export interface IDiscountRepository {
  create(data: CreateDiscountData): Promise<Discount>;
  update(id: string, data: UpdateDiscountData): Promise<Discount | null>;
  deactivate(id: string): Promise<Discount | null>;

  findById(id: string): Promise<Discount | null>;
  /** The active discount carrying this code, if any. */
  findActiveByCode(code: string): Promise<Discount | null>;
  findAll(): Promise<Discount[]>;
  findBySeller(sellerId: string): Promise<Discount[]>;

  /** How many times this user has already redeemed this discount. */
  countUserRedemptions(discountId: string, userId: string): Promise<number>;

  /**
   * An existing redemption for this exact (discount, user, order), if any.
   *
   * Lets a replay be answered before any limit is consulted — the use it
   * repeats was already counted, so a since-exhausted budget must not refuse
   * it.
   */
  findRedemption(
    discountId: string,
    userId: string,
    orderId: string,
  ): Promise<{ discountAmount: number } | null>;

  /**
   * Consume one use, atomically.
   *
   * Implementations MUST guarantee, under concurrency, that:
   *   • usageCount can never exceed maxUsageCount,
   *   • a user can never exceed perUserLimit,
   *   • the same (discountId, userId, orderId) increments usage at most once.
   *
   * A read-then-write check does not satisfy this and is not acceptable.
   */
  redeem(input: {
    discountId: string;
    userId: string;
    orderId: string;
    discountAmount: number;
  }): Promise<RedeemOutcome>;

  /**
   * Undo a redemption: remove the row and give the use back.
   *
   * Idempotent — reversing something already reversed (or never redeemed) is
   * a success, because the caller is a saga compensation that may run more
   * than once. Returns whether a use was actually returned, so the caller can
   * tell "undone" from "there was nothing to undo".
   */
  reverseRedemption(
    discountId: string,
    userId: string,
    orderId: string,
  ): Promise<{ reversed: boolean }>;

  /**
   * Claim the right to publish `discount.expired` for this discount.
   *
   * Returns true exactly once across all callers and replicas; the event used
   * to be published on every validation of an expired code.
   */
  claimExpiryNotification(discountId: string): Promise<boolean>;
}

// ─── In-memory implementation ─────────────────────────────────────────────────

interface StoredRedemption {
  discountId: string;
  userId: string;
  orderId: string;
  discountAmount: number;
}

/**
 * Test double and the no-DATABASE_URL dev fallback. Not durable.
 *
 * Deliberately reproduces the constraints the migration enforces — the partial
 * unique code index, the redemption uniqueness, and the ordering of the limit
 * checks inside `redeem` — so a unit test that passes here is not passing on
 * laxer rules than production runs under.
 *
 * JavaScript is single-threaded and these methods never await between the
 * check and the write, so this implementation is atomic by construction.
 */
export class InMemoryDiscountRepository implements IDiscountRepository {
  private discounts = new Map<string, Discount>();
  private redemptions: StoredRedemption[] = [];

  private assertCodeFree(code: string, exceptId?: string): void {
    for (const d of this.discounts.values()) {
      if (d.id !== exceptId && d.code === code && d.active) {
        throw new DuplicateActiveCodeError(code);
      }
    }
  }

  async create(data: CreateDiscountData): Promise<Discount> {
    if (data.active) this.assertCodeFree(data.code);

    const discount: Discount = {
      id: uuidv4(),
      ...data,
      usageCount: 0,
      createdAt: new Date(),
    };

    this.discounts.set(discount.id, discount);
    return { ...discount };
  }

  async update(id: string, data: UpdateDiscountData): Promise<Discount | null> {
    const existing = this.discounts.get(id);
    if (!existing) return null;

    const nextCode = data.code ?? existing.code;
    const nextActive = data.active ?? existing.active;
    if (nextActive && nextCode !== existing.code) this.assertCodeFree(nextCode, id);

    const updated = { ...existing, ...data };
    this.discounts.set(id, updated);
    return { ...updated };
  }

  async deactivate(id: string): Promise<Discount | null> {
    const existing = this.discounts.get(id);
    if (!existing) return null;

    existing.active = false;
    this.discounts.set(id, existing);
    return { ...existing };
  }

  async findById(id: string): Promise<Discount | null> {
    const d = this.discounts.get(id);
    return d ? { ...d } : null;
  }

  async findActiveByCode(code: string): Promise<Discount | null> {
    const d = [...this.discounts.values()].find((x) => x.code === code && x.active);
    return d ? { ...d } : null;
  }

  async findAll(): Promise<Discount[]> {
    return [...this.discounts.values()].map((d) => ({ ...d }));
  }

  async findBySeller(sellerId: string): Promise<Discount[]> {
    return [...this.discounts.values()]
      .filter((d) => d.createdBy === sellerId || d.applicableSellers.includes(sellerId))
      .map((d) => ({ ...d }));
  }

  async countUserRedemptions(discountId: string, userId: string): Promise<number> {
    return this.redemptions.filter((r) => r.discountId === discountId && r.userId === userId).length;
  }

  async findRedemption(
    discountId: string,
    userId: string,
    orderId: string,
  ): Promise<{ discountAmount: number } | null> {
    const r = this.redemptions.find(
      (x) => x.discountId === discountId && x.userId === userId && x.orderId === orderId,
    );
    return r ? { discountAmount: r.discountAmount } : null;
  }

  async redeem(input: {
    discountId: string;
    userId: string;
    orderId: string;
    discountAmount: number;
  }): Promise<RedeemOutcome> {
    const discount = this.discounts.get(input.discountId);
    if (!discount) return { status: 'not_found' };

    // Replay first — a repeat of the same order must not consume a second use.
    const prior = this.redemptions.find(
      (r) =>
        r.discountId === input.discountId &&
        r.userId === input.userId &&
        r.orderId === input.orderId,
    );
    if (prior) {
      return {
        status: 'already_redeemed',
        discount: { ...discount },
        discountAmount: prior.discountAmount,
      };
    }

    if (discount.usageCount >= discount.maxUsageCount) {
      return { status: 'usage_limit_reached' };
    }

    // Counted inline rather than via `await this.countUserRedemptions(...)`.
    // That await yielded the event loop between the limit check and the
    // increment, so ten concurrent redemptions against a cap of three all
    // passed the check before any of them wrote — the very interleaving this
    // repository exists to make impossible. Everything from the checks to the
    // writes below must stay synchronous.
    const userCount = this.redemptions.filter(
      (r) => r.discountId === input.discountId && r.userId === input.userId,
    ).length;
    if (userCount >= discount.perUserLimit) {
      return { status: 'per_user_limit_reached' };
    }

    discount.usageCount += 1;
    this.discounts.set(discount.id, discount);
    this.redemptions.push({ ...input });

    return { status: 'redeemed', discount: { ...discount } };
  }

  async reverseRedemption(
    discountId: string,
    userId: string,
    orderId: string,
  ): Promise<{ reversed: boolean }> {
    const idx = this.redemptions.findIndex(
      (r) => r.discountId === discountId && r.userId === userId && r.orderId === orderId,
    );
    if (idx === -1) return { reversed: false };

    this.redemptions.splice(idx, 1);

    const discount = this.discounts.get(discountId);
    if (discount) {
      // Floored at 0: a counter reconciled by hand must not go negative.
      discount.usageCount = Math.max(0, discount.usageCount - 1);
      this.discounts.set(discountId, discount);
    }

    return { reversed: true };
  }

  async claimExpiryNotification(discountId: string): Promise<boolean> {
    const discount = this.discounts.get(discountId);
    if (!discount || discount.expiredNotifiedAt) return false;

    discount.expiredNotifiedAt = new Date();
    this.discounts.set(discountId, discount);
    return true;
  }
}
