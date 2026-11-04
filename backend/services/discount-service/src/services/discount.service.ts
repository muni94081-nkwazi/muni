import { Discount, DiscountType, createDiscountSchema, updateDiscountSchema, validateDiscountSchema } from '../models/discount.model.js';
import { logger } from '../utils/logger.js';
import { getProducer } from '../../../../shared/kafka/producer.js';
import {
  DuplicateActiveCodeError,
  InMemoryDiscountRepository,
  type IDiscountRepository,
} from '../repositories/discount.repository.js';
import { PrismaDiscountRepository } from '../repositories/prisma-discount.repository.js';
import {
  allocateProportionally,
  round2,
  type SellerDiscountSlice,
} from '../../../../shared/utils/discount-allocation.js';

// ─── Discounts ────────────────────────────────────────────────────────────────
//
// Storage moved out of two process-local Maps (`discounts` and a nested
// `userUsage`) into Postgres behind IDiscountRepository. Every method is async
// as a result; the HTTP response bodies are unchanged.
//
// Two behaviours the repository now owns rather than this class:
//
//   • Usage accounting. `usageCount += 1` here was a read-then-write that two
//     concurrent redemptions could interleave, letting a capped promotion be
//     oversubscribed. It is a conditional UPDATE in the repository now.
//   • Code uniqueness. Scanning the Map for a clash could not work across
//     replicas; a partial unique index enforces it.
//
// The constructor no longer seeds WELCOME10/SAVE20/FREESHIP/FLASH50. Those
// were demo fixtures: against a database they would be re-inserted on every
// boot and rejected by the unique index, taking the service down on restart.

export { DuplicateActiveCodeError };

class DiscountService {
  constructor(private readonly repo: IDiscountRepository = new InMemoryDiscountRepository()) {}

  public async create(data: any, createdBy: string): Promise<Discount> {
    const validated = createDiscountSchema.parse(data);
    return this.repo.create({ ...validated, createdBy });
  }

  public async createBogoPromotion(
    sellerId: string,
    productId: string,
    discountPercentage = 100,
  ): Promise<Discount> {
    const code = `BOGO-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return this.create({
      code,
      type: DiscountType.BOGO,
      value: discountPercentage,
      minOrderAmount: 0,
      maxUsageCount: 1000,
      perUserLimit: 5,
      applicableCategories: [],
      applicableProducts: [productId],
      applicableSellers: [sellerId],
      startsAt: now,
      expiresAt,
      active: true,
    }, sellerId);
  }

  public async createFreeShippingPromotion(
    sellerId: string,
    minOrderAmount = 50000,
  ): Promise<Discount> {
    const code = `FREESHIP-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return this.create({
      code,
      type: DiscountType.FREE_SHIPPING,
      value: 0,
      minOrderAmount,
      maxUsageCount: 5000,
      perUserLimit: 10,
      applicableCategories: [],
      applicableProducts: [],
      applicableSellers: [sellerId],
      startsAt: now,
      expiresAt,
      active: true,
    }, sellerId);
  }

  public async getSellerPromotions(sellerId: string): Promise<Discount[]> {
    return this.repo.findBySeller(sellerId);
  }

  public async getAll(): Promise<Discount[]> {
    return this.repo.findAll();
  }

  public async getActive(): Promise<Discount[]> {
    const now = new Date();
    const all = await this.repo.findAll();
    return all.filter((d) => d.active && d.startsAt <= now && d.expiresAt >= now);
  }

  public async getFlashSales(): Promise<Discount[]> {
    const now = new Date();
    const all = await this.repo.findAll();
    return all.filter(
      (d) =>
        d.type === DiscountType.FLASH_SALE &&
        d.active &&
        d.startsAt <= now &&
        d.expiresAt >= now,
    );
  }

  public async getById(id: string): Promise<Discount | undefined> {
    return (await this.repo.findById(id)) ?? undefined;
  }

  public async update(id: string, data: any): Promise<Discount> {
    const validated = updateDiscountSchema.parse(data);
    const updated = await this.repo.update(id, validated);
    if (!updated) throw new Error('Discount not found');
    return updated;
  }

  public async deactivate(id: string): Promise<Discount> {
    const discount = await this.repo.deactivate(id);
    if (!discount) throw new Error('Discount not found');
    return discount;
  }

  public async getUsage(id: string) {
    const discount = await this.repo.findById(id);
    if (!discount) throw new Error('Discount not found');

    return {
      discountId: id,
      code: discount.code,
      totalUsageCount: discount.usageCount,
      maxUsageCount: discount.maxUsageCount,
    };
  }

  /**
   * Check a code without consuming it.
   *
   * The limit checks here are advisory — they tell a customer why a code will
   * not work before they commit. The binding decision is made atomically in
   * `applyCode`, because anything checked here can change before the redeem
   * lands.
   */
  public async validateCode(data: any) {
    const validated = validateDiscountSchema.parse(data);
    const now = new Date();

    const discount = await this.repo.findActiveByCode(validated.code);

    if (!discount) {
      return { valid: false, message: 'Invalid or inactive discount code' };
    }

    if (discount.startsAt > now) {
      return { valid: false, message: 'Discount code is not yet active' };
    }

    if (discount.expiresAt < now) {
      await this.publishExpired(discount);
      return { valid: false, message: 'Discount code has expired' };
    }

    if (discount.usageCount >= discount.maxUsageCount) {
      return { valid: false, message: 'Discount code usage limit reached' };
    }

    const userUsage = await this.repo.countUserRedemptions(discount.id, validated.userId);
    if (userUsage >= discount.perUserLimit) {
      return { valid: false, message: 'You have reached the maximum usage limit for this discount code' };
    }

    if (validated.orderAmount < discount.minOrderAmount) {
      return { valid: false, message: `Minimum order amount of $${discount.minOrderAmount} required` };
    }

    const computed = computeDiscountBreakdown(discount, validated);
    if (computed === null) {
      return { valid: false, message: 'Discount code does not apply to any items in the order' };
    }

    return {
      valid: true,
      discount,
      discountAmount: computed.discountAmount,
      // Whose goods the discount came off. Additive: callers that only read
      // `discountAmount` are unaffected. checkout-service uses this to bind
      // the allocation into the order rather than re-deriving the promotion
      // rules — which would put a second copy of them outside this service.
      sellerBreakdown: computed.sellerBreakdown,
      message: 'Discount applied successfully',
    };
  }

  /**
   * Redeem a code against an order.
   *
   * NOTE on the seller breakdown: this returns the total only. `/validate` is
   * where the per-seller split is produced, because that is the moment
   * checkout prices the basket and binds the allocation into the order. A
   * replay here answers from the stored redemption, which records the total
   * and not the split, so re-deriving one against whatever basket the replay
   * happens to carry could contradict what was actually bound.
   *
   * NOTE on idempotency: `orderId` is the key that makes a retry free. The
   * controller still defaults a missing one to `order-<timestamp>`, so a
   * caller that omits it gets a fresh key each time and WILL consume a second
   * use. Callers that care — checkout and cart — must supply a stable id.
   * Tracked as a follow-up.
   */
  public async applyCode(data: any, orderId: string) {
    // A replay is answered before any limit is consulted. `validateCode`
    // rejects a code whose budget is spent — correct for a fresh attempt, but
    // it would also refuse a retry of a redemption that had already been
    // counted, turning a safe repeat into a hard failure.
    const parsed = validateDiscountSchema.parse(data);
    const existing = await this.repo.findActiveByCode(parsed.code);
    if (existing) {
      const prior = await this.repo.findRedemption(existing.id, parsed.userId, orderId);
      if (prior) {
        return {
          valid: true,
          discount: existing,
          discountAmount: prior.discountAmount,
          message: 'Discount applied successfully',
        };
      }
    }

    const validationResult = await this.validateCode(data);
    if (!validationResult.valid || !validationResult.discount) {
      throw new Error(validationResult.message);
    }

    const discountAmount = validationResult.discountAmount ?? 0;

    const outcome = await this.repo.redeem({
      discountId: validationResult.discount.id,
      userId: data.userId,
      orderId,
      discountAmount,
    });

    switch (outcome.status) {
      case 'not_found':
        throw new Error('Discount not found');

      case 'usage_limit_reached':
        // Between validateCode and here, someone else took the last use.
        throw new Error('Discount code usage limit reached');

      case 'per_user_limit_reached':
        throw new Error('You have reached the maximum usage limit for this discount code');

      case 'already_redeemed':
        // A replay of the same order. No second decrement, and the answer
        // matches what the first attempt returned.
        return {
          valid: true,
          discount: outcome.discount,
          discountAmount: outcome.discountAmount,
          message: 'Discount applied successfully',
        };

      case 'redeemed':
        await this.publishApplied(outcome.discount, data.userId, orderId, discountAmount);
        return {
          valid: true,
          discount: outcome.discount,
          discountAmount,
          message: 'Discount applied successfully',
        };
    }
  }

  /**
   * Give back a use that a failed checkout had consumed.
   *
   * Called by the saga's compensation stack when payment is declined or the
   * order cannot be created after the discount was applied. Idempotent: a
   * re-driven compensation, or one for a redemption that never happened,
   * succeeds without changing anything.
   *
   * Note what this restores and what it does not: the COUNT comes back, but
   * not the customer's place in the queue. Someone else may have taken the
   * freed slot in between — the same trade an expired inventory reservation
   * already makes.
   */
  public async reverseCode(code: string, userId: string, orderId: string) {
    const discount = await this.repo.findActiveByCode(code);
    if (!discount) {
      // Nothing to reverse against — treat as done rather than erroring, so a
      // compensation cannot itself fail and mask the original cause.
      return { reversed: false, message: 'No active discount for that code' };
    }

    const { reversed } = await this.repo.reverseRedemption(discount.id, userId, orderId);

    if (reversed) {
      await this.publishReversed(discount, userId, orderId);
    }

    return {
      reversed,
      message: reversed ? 'Discount redemption reversed' : 'No redemption to reverse',
    };
  }

  private async publishReversed(
    discount: Discount,
    userId: string,
    orderId: string,
  ): Promise<void> {
    try {
      const producer = getProducer();
      if (producer) {
        await producer.send({
          topic: 'discount-events',
          messages: [{
            value: JSON.stringify({
              type: 'discount.reversed',
              payload: { discountId: discount.id, code: discount.code, userId, orderId },
            }),
          }],
        });
      }
    } catch (err) {
      logger.error('Failed to publish discount.reversed event', err);
    }
  }

  private async publishApplied(
    discount: Discount,
    userId: string,
    orderId: string,
    discountAmount: number,
  ): Promise<void> {
    try {
      const producer = getProducer();
      if (producer) {
        await producer.send({
          topic: 'discount-events',
          messages: [{
            value: JSON.stringify({
              type: 'discount.applied',
              payload: {
                discountId: discount.id,
                code: discount.code,
                userId,
                orderId,
                discountAmount,
              },
            }),
          }],
        });
      }
    } catch (err) {
      logger.error('Failed to publish discount.applied event', err);
    }
  }

  /**
   * Announce an expired code — once.
   *
   * This fired on every validation of an expired code, so a coupon still being
   * pasted into carts after its end date produced an unbounded stream of
   * identical events. The claim is a conditional update, so exactly one caller
   * across all replicas publishes.
   */
  private async publishExpired(discount: Discount): Promise<void> {
    const isFirst = await this.repo.claimExpiryNotification(discount.id);
    if (!isFirst) return;

    try {
      const producer = getProducer();
      if (producer) {
        await producer.send({
          topic: 'discount-events',
          messages: [{
            value: JSON.stringify({
              type: 'discount.expired',
              payload: { discountId: discount.id, code: discount.code },
            }),
          }],
        });
      }
    } catch (err) {
      logger.error('Failed to publish discount.expired event', err);
    }
  }
}

/**
 * What this discount is worth against the given order.
 *
 * Returns null when the code applies to nothing in the basket — the caller
 * turns that into "does not apply to any items". Extracted from validateCode
 * unchanged; the arithmetic and the type-by-type rules are exactly as before.
 */
type ValidatedItem = {
  productId: string;
  categoryId?: string;
  sellerId?: string;
  price: number;
  quantity: number;
};

/** The seller a line is attributed to when the caller names none. */
const UNATTRIBUTED_SELLER = 'muni-store';

/**
 * Which of this basket's value the coupon is allowed to touch, per seller.
 *
 * The predicate is unchanged — a line is eligible if its product, category or
 * seller is named, and everything is eligible when the discount names no
 * restriction at all. What is new is that the answer is kept per seller
 * instead of being summed away: a coupon restricted to seller A must be
 * traceable to seller A's goods and nobody else's, all the way to settlement.
 *
 * Every seller in the basket appears, including those with nothing eligible —
 * they carry 0, which is the explicit statement that they funded none of it.
 */
function eligibleBySeller(
  discount: Discount,
  items: ValidatedItem[],
): Map<string, number> {
  const restricted =
    discount.applicableCategories.length > 0 ||
    discount.applicableProducts.length > 0 ||
    discount.applicableSellers.length > 0;

  const eligible = new Map<string, number>();

  for (const item of items) {
    const sellerId = item.sellerId || UNATTRIBUTED_SELLER;
    if (!eligible.has(sellerId)) eligible.set(sellerId, 0);

    const applicable =
      !restricted ||
      discount.applicableProducts.includes(item.productId) ||
      (!!item.categoryId && discount.applicableCategories.includes(item.categoryId)) ||
      (!!item.sellerId && discount.applicableSellers.includes(item.sellerId));

    if (applicable) {
      eligible.set(sellerId, round2((eligible.get(sellerId) ?? 0) + item.price * item.quantity));
    }
  }

  return eligible;
}

/**
 * What a coupon is worth against a basket, and whose goods it came off.
 *
 * Returns null when the code applies to nothing — the caller turns that into
 * "does not apply to any items in the order".
 */
function computeDiscountBreakdown(
  discount: Discount,
  validated: { orderAmount: number; items: ValidatedItem[] },
): { discountAmount: number; sellerBreakdown: SellerDiscountSlice[] } | null {
  const eligible = eligibleBySeller(discount, validated.items);

  // With no line detail there is nothing to attribute, so fall back to the
  // order amount as a single unattributed bucket. Callers that want a real
  // breakdown must send items — checkout always does.
  if (validated.items.length === 0) {
    eligible.set(UNATTRIBUTED_SELLER, validated.orderAmount);
  }

  const applicableOrderAmount = round2(
    [...eligible.values()].reduce((sum, v) => sum + v, 0),
  );

  if (applicableOrderAmount === 0 && discount.type !== DiscountType.FREE_SHIPPING) {
    return null;
  }

  let discountAmount: number;
  switch (discount.type) {
    case DiscountType.PERCENTAGE:
      discountAmount = applicableOrderAmount * (discount.value / 100);
      break;
    case DiscountType.FIXED_AMOUNT:
      discountAmount = Math.min(discount.value, applicableOrderAmount);
      break;
    case DiscountType.FREE_SHIPPING:
      // Worth nothing against goods — the saving is on shipping, which no
      // vendor is owed. Every seller's slice is 0, so vendor revenue is
      // untouched.
      discountAmount = 0;
      break;
    case DiscountType.FLASH_SALE:
      discountAmount = applicableOrderAmount * (discount.value / 100);
      break;
    case DiscountType.BOGO:
      // Deferred semantics: this bills BOGO as a flat half off the eligible
      // value rather than the cheaper of each pair. The breakdown attributes
      // whatever this returns; it does not change what it returns.
      discountAmount = applicableOrderAmount * 0.5;
      break;
    default:
      discountAmount = 0;
  }

  discountAmount = round2(discountAmount);

  const allocated = allocateProportionally(discountAmount, eligible);

  const sellerBreakdown: SellerDiscountSlice[] = [...eligible.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((sellerId) => ({
      sellerId,
      eligibleAmount: round2(eligible.get(sellerId) ?? 0),
      discountAmount: allocated.get(sellerId) ?? 0,
    }));

  // The parts are the total. Rounding is absorbed by the allocator's
  // largest-remainder pass, so this is an assertion about the code, not a
  // tolerance for drift.
  return {
    discountAmount: round2(
      sellerBreakdown.reduce((sum, s) => sum + s.discountAmount, 0),
    ),
    sellerBreakdown,
  };
}

export { DiscountService };

/**
 * The instance the controllers use.
 *
 * Postgres-backed whenever DATABASE_URL is set — which it is in compose and in
 * every deployed environment. Without it the service falls back to the
 * in-memory repository so `npm run dev` and the unit suite still work on a
 * machine with no database; that fallback is explicitly NOT durable, and the
 * log line says so rather than letting it look like everything is fine.
 */
function defaultRepository(): IDiscountRepository {
  if (!process.env.DATABASE_URL) {
    logger.warn(
      '[discount-service] DATABASE_URL is not set — discounts are running in ' +
      'memory and will be lost on restart. Set it for any real environment.',
    );
    return new InMemoryDiscountRepository();
  }
  return new PrismaDiscountRepository();
}

export const discountService = new DiscountService(defaultRepository());
