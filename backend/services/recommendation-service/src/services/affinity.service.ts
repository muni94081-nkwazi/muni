import { cache } from '../../../../shared/cache/redis.js';
import type { ClickstreamEvent, ClickstreamEventType, UserAffinityProfile } from '../models/recommendation.model.js';

// ─── Real-Time User Affinity Profiles ──────────────────────────────────────────
//
// Builds a per-user "what do they care about right now" profile from clickstream
// signals (product_view, category_browse, add_to_cart, wishlist), consumed off
// Redis Streams. Scores use exponential recency decay so a burst of interest
// yesterday fades in favor of what the user is doing today, and event types are
// weighted by purchase intent (add_to_cart > wishlist > product_view > category_browse).

const EVENT_WEIGHTS: Record<ClickstreamEventType, number> = {
  add_to_cart:     4,
  wishlist:        2.5,
  product_view:    1,
  category_browse: 0.5,
};

const HALF_LIFE_HOURS = 6;      // score halves every 6h of inactivity
const PROFILE_TTL_SEC = 7 * 24 * 60 * 60; // keep profiles warm in Redis for a week

interface AffinityState {
  categoryScores: Record<string, number>;
  productScores: Record<string, number>;
  updatedAt: number;
}

function emptyState(now: number): AffinityState {
  return { categoryScores: {}, productScores: {}, updatedAt: now };
}

function decay(state: AffinityState, now: number): void {
  const elapsedHours = (now - state.updatedAt) / (1000 * 60 * 60);
  if (elapsedHours <= 0) return;

  const factor = Math.pow(0.5, elapsedHours / HALF_LIFE_HOURS);
  for (const key of Object.keys(state.categoryScores)) {
    state.categoryScores[key] *= factor;
  }
  for (const key of Object.keys(state.productScores)) {
    state.productScores[key] *= factor;
  }
}

const profileKey = (userId: string) => `affinity:user:${userId}`;

class UserAffinityService {
  // In-process cache; Redis is the cross-instance/restart-durable backing store.
  private profiles = new Map<string, AffinityState>();

  private async loadState(userId: string): Promise<AffinityState> {
    let state = this.profiles.get(userId);
    if (state) return state;

    state = (await cache.get<AffinityState>(profileKey(userId))) ?? emptyState(Date.now());
    this.profiles.set(userId, state);
    return state;
  }

  async recordEvent(event: ClickstreamEvent): Promise<void> {
    const now = event.timestamp || Date.now();
    const state = await this.loadState(event.userId);
    decay(state, now);

    const weight = EVENT_WEIGHTS[event.eventType] ?? 1;
    if (event.category) {
      state.categoryScores[event.category] = (state.categoryScores[event.category] ?? 0) + weight;
    }
    if (event.productId) {
      state.productScores[event.productId] = (state.productScores[event.productId] ?? 0) + weight;
    }
    state.updatedAt = now;

    void cache.set(profileKey(event.userId), state, PROFILE_TTL_SEC);
    void cache.del(`recommendations:home-feed:${event.userId}`);
    void cache.del(`recommendations:user:${event.userId}:personalized`);
  }

  async getProfile(userId: string): Promise<UserAffinityProfile> {
    const state = await this.loadState(userId);
    decay(state, Date.now());

    return {
      userId,
      categoryAffinity: state.categoryScores,
      productAffinity: state.productScores,
      updatedAt: new Date(state.updatedAt).toISOString(),
    };
  }

  hasSignal(profile: UserAffinityProfile): boolean {
    return Object.keys(profile.categoryAffinity).length > 0 || Object.keys(profile.productAffinity).length > 0;
  }

  topCategories(profile: UserAffinityProfile, n = 3): string[] {
    return Object.entries(profile.categoryAffinity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([category]) => category);
  }
}

export const userAffinityService = new UserAffinityService();
