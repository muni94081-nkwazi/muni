import type { Store } from '../models/marketplace.model.js';
import type { IStoreRepository } from '../types/repositories.js';

// ─── In-memory store repository ───────────────────────────────────────────────
//
// For tests, and for running without a database. Starts empty: the three demo
// storefronts the array used to carry were placeholder data, two of them for
// US cities, and belong in a fixture rather than in the service.

export class MemoryStoreRepository implements IStoreRepository {
  private readonly store = new Map<string, Store>();

  clear(): void {
    this.store.clear();
  }

  seed(s: Store): void {
    this.store.set(s.id, structuredClone(s));
  }

  async findAll(): Promise<Store[]> {
    return [...this.store.values()]
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map((s) => structuredClone(s));
  }

  /** Slug, store id, or the owning seller's user id — see the Prisma repo. */
  async findBySlugOrId(slugOrId: string): Promise<Store | undefined> {
    const found = [...this.store.values()].find((s) => s.storeSlug === slugOrId || s.id === slugOrId);
    if (found) return structuredClone(found);

    return this.findByUser(slugOrId);
  }

  async findByUser(userId: string): Promise<Store | undefined> {
    const found = [...this.store.values()]
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .find((s) => s.userId === userId);
    return found ? structuredClone(found) : undefined;
  }

  async create(s: Store): Promise<Store> {
    this.store.set(s.id, structuredClone(s));
    return structuredClone(s);
  }

  async updateByUser(
    userId: string,
    patch: Partial<Store>,
    updatedAt: string,
  ): Promise<Store | undefined> {
    const current = [...this.store.values()].find((s) => s.userId === userId);
    if (!current) return undefined;

    for (const key of Object.keys(patch) as (keyof Store)[]) {
      const value = patch[key];
      if (value !== undefined) Object.assign(current, { [key]: value });
    }
    current.updatedAt = updatedAt;

    return structuredClone(current);
  }
}
