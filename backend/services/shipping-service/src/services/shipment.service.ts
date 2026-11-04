import {
  InMemoryShipmentRepository,
  type AppendEventData,
  type IShipmentRepository,
  type Shipment,
  type ShipmentEvent,
} from '../repositories/shipment.repository.js';
import { PrismaShipmentRepository } from '../repositories/prisma-shipment.repository.js';

// ─── Shipments ────────────────────────────────────────────────────────────────
//
// Lifted out of app.ts, where booking, updating and reading a shipment were
// written inline against a module-level Map. The route handlers now do nothing
// but translate HTTP; the response bodies are unchanged.

export class ShipmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * The three events every booking starts with.
 *
 * Preserved from the original inline implementation, including its quirk: the
 * second and third are stamped one and two hours in the FUTURE. That is
 * fiction — a parcel is not picked up an hour before anyone touches it — but
 * it is the timeline the tracking UI has always rendered, so changing it is a
 * contract change rather than a persistence one. Logged as a follow-up.
 */
function seedEvents(from: string): ShipmentEvent[] {
  const now = Date.now();
  return [
    {
      status: 'order_placed',
      description: 'Shipment booked',
      location: from || 'Origin',
      timestamp: new Date(now).toISOString(),
    },
    {
      status: 'picked_up',
      description: 'Package collected from seller',
      location: from || 'Origin',
      timestamp: new Date(now + 1000 * 60 * 60).toISOString(),
    },
    {
      status: 'in_transit',
      description: 'In transit to destination',
      location: 'Sorting Center',
      timestamp: new Date(now + 1000 * 60 * 120).toISOString(),
    },
  ];
}

export class ShipmentService {
  constructor(private readonly repo: IShipmentRepository = new InMemoryShipmentRepository()) {}

  async createShipment(data: {
    orderId: string;
    from: string;
    to: string;
    weight: number;
    type: string;
    subOrderId?: string;
    carrier?: string;
  }): Promise<Shipment> {
    return this.repo.create(data, seedEvents(data.from));
  }

  /** Accepts either the shipmentId or the trackingNumber. */
  async getShipment(id: string): Promise<Shipment> {
    const shipment = await this.repo.findByAnyId(id);
    if (!shipment) throw new ShipmentError('Shipment not found', 404);
    return shipment;
  }

  async updateShipment(
    shipmentId: string,
    update: { status?: string; location?: string; description?: string },
  ): Promise<Shipment> {
    const shipment = await this.getShipment(shipmentId);

    // A body with no status is a no-op rather than an error — the validation
    // layer already rejects a wholly empty update.
    if (!update.status) return shipment;

    const event: AppendEventData = {
      status: update.status as ShipmentEvent['status'],
      description: update.description ?? `Status updated to ${update.status}`,
      location: update.location ?? 'Unknown',
    };

    return this.repo.appendEvent(shipment.shipmentId, event);
  }

  /** GET /track/:trackingNumber — the public tracking view. */
  async getTracking(trackingNumber: string): Promise<{
    trackingNumber: string;
    status: string;
    events: ShipmentEvent[];
  }> {
    const shipment = await this.repo.findByAnyId(trackingNumber);
    if (!shipment) throw new ShipmentError('Tracking number not found', 404);

    return {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      events: shipment.events,
    };
  }

  async getLabel(shipmentId: string): Promise<{
    shipmentId: string;
    labelUrl: string | null;
    trackingNumber: string;
    createdAt: string;
  }> {
    const shipment = await this.getShipment(shipmentId);
    return {
      shipmentId: shipment.shipmentId,
      labelUrl: shipment.labelUrl ?? null,
      trackingNumber: shipment.trackingNumber,
      createdAt: shipment.createdAt,
    };
  }
}

/** See the matching note in pickup-station.service.ts. */
function defaultRepository(): IShipmentRepository {
  if (!process.env.DATABASE_URL) {
    console.warn(
      '[shipping-service] DATABASE_URL is not set — shipments are running in ' +
      'memory and will be lost on restart. Set it for any real environment.',
    );
    return new InMemoryShipmentRepository();
  }
  return new PrismaShipmentRepository();
}

export const shipmentService = new ShipmentService(defaultRepository());
