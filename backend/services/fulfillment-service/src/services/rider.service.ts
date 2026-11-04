import { randomUUID } from 'node:crypto';
import { riderActor, fulfillmentService, FulfillmentService } from './fulfillment.service.js';
import { projectStatusToOrder } from '../clients/order.client.js';
import { Fulfillment } from '../models/fulfillment.model.js';
import { DigitalSignature, Rider, RiderDeliveryStatus, VehicleType } from '../models/rider.model.js';
import { prismaRiderRepository } from '../repositories/prisma-fulfillment.repository.js';
import type { IRiderRepository } from '../types/repositories.js';

export class RiderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const CLAIMABLE_STATUSES = new Set(['PENDING', 'ASSIGNED', 'PICKING', 'PACKED', 'HANDED_TO_CARRIER']);
const TERMINAL_STATUSES = new Set(['DELIVERED', 'DELIVERED_COD', 'RETURNED']);
const VALID_RIDER_STATUSES = new Set<RiderDeliveryStatus>(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED_COD', 'DELIVERED', 'RETURNED']);

// ─── Rider service ────────────────────────────────────────────────────────────
//
// Riders and signatures live in Postgres. registerRider() and getRider() are
// now async: they were synchronous only because a Map lookup is, and a rider
// record that vanished on restart took the rider's active-delivery list with
// it — leaving packages assigned to nobody.

export class RiderService {
  constructor(
    private readonly repo: IRiderRepository = prismaRiderRepository,
    private readonly fulfillments: FulfillmentService = fulfillmentService,
  ) {}

  async registerRider(
    riderId: string,
    data: { name?: string; phone?: string; vehicleType?: VehicleType },
  ): Promise<Rider> {
    await this.repo.ensure(riderId);

    const patch: Parameters<IRiderRepository['update']>[1] = { updatedAt: new Date().toISOString() };
    // Only overwrite what was supplied, matching the original's `if (data.x)`.
    if (data.name) patch.name = data.name;
    if (data.phone) patch.phone = data.phone;
    if (data.vehicleType) patch.vehicleType = data.vehicleType;

    const updated = await this.repo.update(riderId, patch);
    if (!updated) throw new RiderError('Rider not found', 404);
    return updated;
  }

  async getRider(riderId: string): Promise<Rider> {
    return this.repo.ensure(riderId);
  }

  async claimPackage(riderId: string, fulfillmentId: string): Promise<Fulfillment> {
    const fulfillment = await this.fulfillments.getFulfillment(fulfillmentId);
    if (!fulfillment) throw new RiderError('Fulfillment not found', 404);
    if (fulfillment.riderId && fulfillment.riderId !== riderId) {
      throw new RiderError('Package already claimed by another rider', 409);
    }
    if (!CLAIMABLE_STATUSES.has(fulfillment.status)) {
      throw new RiderError(`Package cannot be claimed while in status ${fulfillment.status}`);
    }

    const now = new Date().toISOString();

    const updated = await this.fulfillments.repository.appendTimeline(
      fulfillmentId,
      { status: fulfillment.status, timestamp: now, note: `Claimed by rider ${riderId}` },
      { riderId, updatedAt: now },
    );
    if (!updated) throw new RiderError('Fulfillment not found', 404);

    const rider = await this.repo.ensure(riderId);
    const active = rider.activeFulfillmentIds.includes(fulfillmentId)
      ? rider.activeFulfillmentIds
      : [...rider.activeFulfillmentIds, fulfillmentId];

    await this.repo.update(riderId, {
      activeFulfillmentIds: active,
      status: 'ON_DELIVERY',
      updatedAt: now,
    });

    return updated;
  }

  async updateDeliveryStatus(
    riderId: string,
    fulfillmentId: string,
    status: RiderDeliveryStatus,
    meta?: { returnReason?: string },
  ): Promise<Fulfillment> {
    if (!VALID_RIDER_STATUSES.has(status)) throw new RiderError(`Invalid rider delivery status: ${status}`);

    const fulfillment = await this.fulfillments.getFulfillment(fulfillmentId);
    if (!fulfillment) throw new RiderError('Fulfillment not found', 404);
    if (fulfillment.riderId !== riderId) throw new RiderError('This package is not assigned to you', 403);

    if (status === 'DELIVERED_COD') {
      if (fulfillment.paymentMethod !== 'COD') {
        throw new RiderError('Fulfillment is not a cash-on-delivery order; use DELIVERED instead');
      }
      if (!fulfillment.codAmountCollected || fulfillment.codAmountCollected <= 0) {
        throw new RiderError('Cash collection must be verified via /cod/collect before marking DELIVERED_COD');
      }
    }
    if (status === 'RETURNED' && !meta?.returnReason) {
      throw new RiderError('returnReason is required when marking a package RETURNED');
    }

    // Through the same guarded path as every other caller. The rider's claim on
    // this package was verified above; `riderActor` states it in the terms the
    // ownership check understands, and the transition table still applies —
    // a rider cannot jump a package to DELIVERED either.
    let updated = await this.fulfillments.updateStatus(fulfillmentId, status, riderActor(riderId));

    // The original reached into `timeline[timeline.length - 1].note` on the
    // shared object right after updateStatus(). Same two-step, made explicit.
    if (status === 'RETURNED' && meta?.returnReason) {
      updated = (await this.fulfillments.repository.setLastTimelineNote(
        fulfillmentId,
        meta.returnReason,
      )) ?? updated;
    }

    // order-service owns the lifecycle the customer and seller actually read,
    // so the outcome has to reach it. Non-fatal: the rider's action is already
    // recorded and any cash is already collected — see the note in
    // clients/order.client.ts.
    await projectStatusToOrder(updated);

    if (TERMINAL_STATUSES.has(status)) {
      const rider = await this.repo.ensure(riderId);
      const active = rider.activeFulfillmentIds.filter((id) => id !== fulfillmentId);
      await this.repo.update(riderId, {
        activeFulfillmentIds: active,
        status: active.length > 0 ? 'ON_DELIVERY' : 'AVAILABLE',
        updatedAt: new Date().toISOString(),
      });
    }

    return updated;
  }

  async logSignature(
    riderId: string,
    fulfillmentId: string,
    signatureData: string,
    recipientName: string,
    location?: { lat: number; lng: number },
  ): Promise<DigitalSignature> {
    const fulfillment = await this.fulfillments.getFulfillment(fulfillmentId);
    if (!fulfillment) throw new RiderError('Fulfillment not found', 404);
    if (fulfillment.riderId !== riderId) throw new RiderError('This package is not assigned to you', 403);
    if (!signatureData || !recipientName) throw new RiderError('signatureData and recipientName are required');

    const signature = await this.repo.createSignature({
      id: randomUUID(),
      fulfillmentId,
      riderId,
      signatureData,
      recipientName,
      capturedAt: new Date().toISOString(),
      location,
    });

    // The fulfillment's own `signatures` list is derived from this row now
    // rather than being a second copy that could drift, so only the timeline
    // entry and the touch of updatedAt remain to write.
    await this.fulfillments.repository.appendTimeline(
      fulfillmentId,
      {
        status: fulfillment.status,
        timestamp: signature.capturedAt,
        note: `Signature captured from ${recipientName}`,
      },
      { updatedAt: signature.capturedAt },
    );

    return signature;
  }

  async getActiveDeliveries(riderId: string): Promise<Fulfillment[]> {
    const fulfillments = await this.fulfillments.getRiderFulfillments(riderId);
    return fulfillments.filter((f) => !TERMINAL_STATUSES.has(f.status));
  }
}

export const riderService = new RiderService();
