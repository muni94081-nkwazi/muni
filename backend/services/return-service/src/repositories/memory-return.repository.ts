import type { ReturnRequest, ReturnStatus } from '../models/return.model.js';
import type { IReturnRepository } from '../types/repositories.js';

// ─── In-memory return repository ──────────────────────────────────────────────
//
// For tests, and for running the service without a database. This is where the
// old module-level `returnsStore` Map ended up — the difference being that it
// is now one implementation behind an explicit choice rather than the only way
// the service could store anything.
//
// Reads return structuredClones. The Prisma repository builds a fresh object
// from a row, so a caller mutating what it received changes nothing; without
// cloning this implementation would let that mutation silently stick and the
// two would disagree about whether the service is correct.

export class MemoryReturnRepository implements IReturnRepository {
  private readonly store = new Map<string, ReturnRequest>();

  /** Test helper: drop everything. */
  clear(): void {
    this.store.clear();
  }

  /** Test helper: insert a fully-formed return without going through create(). */
  seed(request: ReturnRequest): void {
    this.store.set(request.id, structuredClone(request));
  }

  async create(request: ReturnRequest): Promise<ReturnRequest> {
    this.store.set(request.id, structuredClone(request));
    return structuredClone(request);
  }

  async findById(id: string): Promise<ReturnRequest | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByUser(userId: string): Promise<ReturnRequest[]> {
    return this.sorted((r) => r.userId === userId);
  }

  async findBySeller(sellerId: string): Promise<ReturnRequest[]> {
    return this.sorted((r) => r.sellerId === sellerId);
  }

  async findAll(): Promise<ReturnRequest[]> {
    return this.sorted(() => true);
  }

  async updateStatus(
    id: string,
    status: ReturnStatus,
    updatedAt: string,
  ): Promise<ReturnRequest | null> {
    const current = this.store.get(id);
    if (!current) return null;

    current.status = status;
    current.updatedAt = updatedAt;

    return structuredClone(current);
  }

  /** Newest first, matching the Prisma repository's orderBy. */
  private sorted(predicate: (r: ReturnRequest) => boolean): ReturnRequest[] {
    return [...this.store.values()]
      .filter(predicate)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .map((r) => structuredClone(r));
  }
}
