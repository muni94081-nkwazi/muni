import type { Store } from '../models/marketplace.model.js';

// ─── Repository contract ──────────────────────────────────────────────────────

export interface IStoreRepository {
  findAll(): Promise<Store[]>;

  /** By slug or by id — getStoreBySlug accepts either. */
  findBySlugOrId(slugOrId: string): Promise<Store | undefined>;

  findByUser(userId: string): Promise<Store | undefined>;

  create(store: Store): Promise<Store>;

  /** Returns undefined when the user has no store, which becomes a throw. */
  updateByUser(userId: string, patch: Partial<Store>, updatedAt: string): Promise<Store | undefined>;
}
