import type { ReturnRequest, ReturnStatus } from '../models/return.model.js';

// ─── Repository contract ──────────────────────────────────────────────────────
//
// The service layer depends on this, never on Prisma directly, so the same
// logic runs against Postgres in production and an in-memory Map in tests.

export interface IReturnRepository {
  create(request: ReturnRequest): Promise<ReturnRequest>;

  findById(id: string): Promise<ReturnRequest | null>;

  findByUser(userId: string): Promise<ReturnRequest[]>;

  findBySeller(sellerId: string): Promise<ReturnRequest[]>;

  findAll(): Promise<ReturnRequest[]>;

  /**
   * Move a return to a new status. Returns null when the id is unknown, which
   * the service turns into the same 'Not found' error the Map version threw.
   */
  updateStatus(id: string, status: ReturnStatus, updatedAt: string): Promise<ReturnRequest | null>;
}
