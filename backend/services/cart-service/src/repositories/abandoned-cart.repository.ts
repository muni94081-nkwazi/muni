import { redis } from '../utils/redis.js';
import type { AbandonedCart, RecoveryAttempt } from '../models/cart.model.js';

// ─── Redis-Backed Abandoned Cart Store ─────────────────────────────────────────
//
// Replaces the volatile in-process Maps that used to hold this data. Layout:
//   abandoned:cart:{id}            -> JSON AbandonedCart, TTL-bound
//   abandoned:carts:index          -> Set<id>                     (existence index)
//   abandoned:carts:by-activity    -> ZSet<id, score=lastActivityAt ms>  (scan index)
//   abandoned:cart:{id}:recovery   -> List<JSON RecoveryAttempt>, TTL-bound
//
// The sorted-set index lets the hourly scanner job find inactive carts with a
// single ZRANGEBYSCORE instead of loading every cart in the store.

const ABANDONED_CART_TTL = 60 * 60 * 24 * 30; // 30 days — long enough for recovery campaigns

const cartKey = (id: string) => `abandoned:cart:${id}`;
const recoveryKey = (id: string) => `abandoned:cart:${id}:recovery`;
const INDEX_KEY = 'abandoned:carts:index';
const ACTIVITY_ZSET_KEY = 'abandoned:carts:by-activity';

export interface IAbandonedCartRepository {
  getAll(): Promise<AbandonedCart[]>;
  getById(id: string): Promise<AbandonedCart | null>;
  save(cart: AbandonedCart): Promise<void>;
  findInactiveSince(cutoffMs: number): Promise<AbandonedCart[]>;
  addRecoveryAttempt(attempt: RecoveryAttempt): Promise<void>;
  getRecoveryAttempts(cartId: string): Promise<RecoveryAttempt[]>;
}

export class RedisAbandonedCartRepository implements IAbandonedCartRepository {
  async getAll(): Promise<AbandonedCart[]> {
    const ids = await redis.smembers(INDEX_KEY);
    if (ids.length === 0) return [];
    return this.hydrate(ids);
  }

  async getById(id: string): Promise<AbandonedCart | null> {
    const raw = await redis.get(cartKey(id));
    return raw ? (JSON.parse(raw) as AbandonedCart) : null;
  }

  async save(cart: AbandonedCart): Promise<void> {
    const pipeline = redis.pipeline();
    pipeline.set(cartKey(cart.id), JSON.stringify(cart), 'EX', ABANDONED_CART_TTL);
    pipeline.sadd(INDEX_KEY, cart.id);
    pipeline.zadd(ACTIVITY_ZSET_KEY, new Date(cart.lastActivityAt).getTime(), cart.id);
    await pipeline.exec();
  }

  async findInactiveSince(cutoffMs: number): Promise<AbandonedCart[]> {
    // Carts whose lastActivityAt score is <= cutoff, i.e. inactive for at least that long
    const ids = await redis.zrangebyscore(ACTIVITY_ZSET_KEY, 0, cutoffMs);
    if (ids.length === 0) return [];
    return this.hydrate(ids);
  }

  async addRecoveryAttempt(attempt: RecoveryAttempt): Promise<void> {
    await redis
      .pipeline()
      .rpush(recoveryKey(attempt.cartId), JSON.stringify(attempt))
      .expire(recoveryKey(attempt.cartId), ABANDONED_CART_TTL)
      .exec();
  }

  async getRecoveryAttempts(cartId: string): Promise<RecoveryAttempt[]> {
    const raw = await redis.lrange(recoveryKey(cartId), 0, -1);
    return raw.map((entry: string) => JSON.parse(entry) as RecoveryAttempt);
  }

  private async hydrate(ids: string[]): Promise<AbandonedCart[]> {
    const raws = await redis.mget(...ids);
    const carts: AbandonedCart[] = [];
    const staleIds: string[] = [];

    raws.forEach((raw: string | null, i: number) => {
      if (raw) {
        carts.push(JSON.parse(raw) as AbandonedCart);
      } else {
        staleIds.push(ids[i]); // key expired via TTL — prune from the indexes lazily
      }
    });

    if (staleIds.length > 0) {
      await redis.pipeline().srem(INDEX_KEY, ...staleIds).zrem(ACTIVITY_ZSET_KEY, ...staleIds).exec();
    }

    return carts;
  }
}

export const abandonedCartRepository: IAbandonedCartRepository = new RedisAbandonedCartRepository();
