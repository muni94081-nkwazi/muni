import crypto from 'crypto';
import {
  Fulfillment,
  FULFILLMENT_TRANSITIONS,
  isFulfillmentStatus,
  type CreateFulfillmentInput,
  type FulfillmentStatus,
} from '../models/fulfillment.model.js';
import { prismaFulfillmentRepository } from '../repositories/prisma-fulfillment.repository.js';
import type { IFulfillmentRepository } from '../types/repositories.js';

// ─── Fulfillment service ──────────────────────────────────────────────────────
//
// State lives in Postgres behind IFulfillmentRepository. It was a module-level
// `Fulfillment[]`, and the array was also how codService and riderService
// "persisted" their changes — they mutated the object this service handed
// them. Those are now explicit writes through the repository; see the note in
// types/repositories.ts.

/** Who is asking. Built by the controller from the verified identity. */
export interface FulfillmentActor {
  id: string;
  roles: string[];
  isStaff: boolean;
}

/** A parcel this actor may not touch, or a move the lifecycle does not allow. */
export class FulfillmentAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FulfillmentAccessError';
  }
}

/**
 * A seller sees their own consignments, the rider carrying a parcel sees that
 * parcel, and staff see everyone's.
 *
 * The rider case is what lets riderService keep driving PICKED_UP → IN_TRANSIT
 * → DELIVERED through the same guarded path as everyone else, instead of
 * needing a way around it. riderService has already refused any rider the
 * package is not assigned to before it gets here; this is the same fact stated
 * where the rest of the ownership rules live.
 */
function mayTouch(f: Fulfillment, actor: FulfillmentActor): boolean {
  return actor.isStaff || f.sellerId === actor.id || (!!f.riderId && f.riderId === actor.id);
}

/** The actor for a rider acting on a package already confirmed as theirs. */
export const riderActor = (riderId: string): FulfillmentActor => ({
  id: riderId,
  roles: ['ROLE_RIDER'],
  isStaff: false,
});

export class FulfillmentService {
  constructor(private readonly repo: IFulfillmentRepository = prismaFulfillmentRepository) {}

  /**
   * Book a delivery job.
   *
   * Idempotent on `subOrderId`, because order-service now books one
   * automatically when a seller accepts a sub-order — and anything automatic
   * gets retried: a failed HTTP call, a restart mid-write, a seller
   * double-clicking Accept. Two jobs for one parcel means two riders can claim
   * it and two cash collections can be recorded against one order.
   *
   * The check below is the fast path; the database has the real guarantee, a
   * unique index on sub_order_id that an application check cannot lose a race
   * to. A concurrent create that gets past this returns the winner rather than
   * failing, so a retry is always safe.
   */
  async createFulfillment(data: CreateFulfillmentInput): Promise<Fulfillment> {
    if (data.subOrderId) {
      const existing = await this.repo.findBySubOrder(data.subOrderId);
      if (existing) return existing;
    }

    const now = new Date().toISOString();

    // Routing, unchanged: an explicit warehouse wins, then a seller, then the
    // third-party fallback.
    let type: Fulfillment['type'];
    let provider: string | undefined;
    if (data.warehouseId) {
      type = 'WAREHOUSE';
      provider = 'Platform Warehouse';
    } else if (data.sellerId) {
      type = 'SELLER_FULFILLED';
    } else {
      type = 'THIRD_PARTY_LOGISTICS';
      provider = 'ShipBob';
    }

    try {
      return await this.repo.create({
      ...data,
      id: crypto.randomUUID(),
      type,
      ...(provider ? { provider } : {}),
      status: 'PENDING',
      paymentMethod: data.paymentMethod ?? 'PREPAID',
      items: data.items ?? [],
      timeline: [{ status: 'PENDING', timestamp: now }],
      createdAt: now,
      updatedAt: now,
      });
    } catch (err) {
      // P2002: the unique index caught a concurrent booking. The other one
      // won, and it is just as good as ours.
      if (data.subOrderId && (err as { code?: string }).code === 'P2002') {
        const winner = await this.repo.findBySubOrder(data.subOrderId);
        if (winner) return winner;
      }
      throw err;
    }
  }

  async getFulfillment(id: string): Promise<Fulfillment | null> {
    return this.repo.findById(id);
  }

  async getOrderFulfillment(orderId: string): Promise<Fulfillment[]> {
    return this.repo.findByOrder(orderId);
  }

  /**
   * The same read, scoped to what this actor is allowed to see.
   *
   * `null` covers both "no such fulfillment" and "not yours", so the caller
   * answers 404 either way and the endpoint cannot be used to discover which
   * ids exist.
   */
  async getOwnedFulfillment(id: string, actor: FulfillmentActor): Promise<Fulfillment | null> {
    const f = await this.repo.findById(id);
    if (!f || !mayTouch(f, actor)) return null;
    return f;
  }

  /** An order's consignments, narrowed to this actor's own. */
  async getOrderFulfillmentFor(orderId: string, actor: FulfillmentActor): Promise<Fulfillment[]> {
    const all = await this.repo.findByOrder(orderId);
    return all.filter((f) => mayTouch(f, actor));
  }

  async updateStatus(id: string, status: FulfillmentStatus, actor: FulfillmentActor): Promise<Fulfillment> {
    const now = new Date().toISOString();

    const current = await this.repo.findById(id);
    // Ownership before anything else, and the same 404 for a miss as for an
    // absent id — a seller must not learn that another seller's parcel exists.
    if (!current || !mayTouch(current, actor)) {
      throw new FulfillmentAccessError('Not found', 404);
    }

    if (!isFulfillmentStatus(status)) {
      throw new FulfillmentAccessError(`"${status}" is not a fulfillment status.`, 422);
    }

    // Re-asserting the current status is a no-op, not an error: a seller
    // dashboard that resends what it is already showing should not fail.
    if (current.status !== status) {
      const allowed = FULFILLMENT_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(status)) {
        throw new FulfillmentAccessError(
          `A parcel that is ${current.status} cannot become ${status}.`,
          409,
        );
      }
    }

    // The status change and its timeline entry go in one write — a package
    // must never read as DELIVERED with no record of when it got there.
    const updated = await this.repo.appendTimeline(
      id,
      { status, timestamp: now },
      { status, updatedAt: now },
    );

    // Same error the array version threw.
    if (!updated) throw new Error('Not found');
    return updated;
  }

  async addTrackingNumber(id: string, trackingNumber: string, actor: FulfillmentActor): Promise<Fulfillment> {
    const current = await this.repo.findById(id);
    if (!current || !mayTouch(current, actor)) {
      throw new FulfillmentAccessError('Not found', 404);
    }

    const updated = await this.repo.update(id, {
      trackingNumber,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new Error('Not found');
    return updated;
  }

  async getSellerFulfillments(sellerId: string): Promise<Fulfillment[]> {
    return this.repo.findBySeller(sellerId);
  }

  async getRiderFulfillments(riderId: string): Promise<Fulfillment[]> {
    return this.repo.findByRider(riderId);
  }

  /** Exposed so codService and riderService can persist their own changes. */
  get repository(): IFulfillmentRepository {
    return this.repo;
  }
}

export const fulfillmentService = new FulfillmentService();
