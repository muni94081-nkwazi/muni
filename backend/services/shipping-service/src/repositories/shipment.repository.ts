import { randomUUID } from 'node:crypto';

// ─── Shipment persistence ─────────────────────────────────────────────────────
//
// Replaces the bare `const shipments = new Map()` that lived in app.ts. That
// Map was written twice per shipment — once under `trackingNumber`, once under
// `shipmentId` — so both lookups reached the same object. Here it is one
// record with two unique keys, which also stops the two ids drifting apart.

export type ShipmentStatus =
  | 'order_placed'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returned';

/**
 * A point in a shipment's history.
 *
 * `location` stays free text and `timestamp` an ISO string, because that is
 * exactly what GET /track/:trackingNumber already returns. `lat`/`lng`/
 * `carrier` are the optional additions absorbed from the deleted
 * tracking.service's richer TrackingEvent.
 */
export interface ShipmentEvent {
  status: ShipmentStatus;
  description: string;
  location: string;
  timestamp: string;
  lat?: number;
  lng?: number;
  carrier?: string;
}

export interface DeliveryProof {
  id: string;
  orderId: string;
  imageUrl?: string;
  signatureUrl?: string;
  recipientName: string;
  capturedAt: string;
}

/** The API shape, unchanged from what the Map produced. */
export interface Shipment {
  shipmentId: string;
  trackingNumber: string;
  orderId: string;
  subOrderId?: string;
  from: string;
  to: string;
  weight: number;
  type: string;
  status: ShipmentStatus;
  carrier?: string;
  labelUrl?: string | null;
  events: ShipmentEvent[];
  createdAt: string;
  updatedAt?: string;
}

export interface CreateShipmentData {
  orderId: string;
  subOrderId?: string;
  from: string;
  to: string;
  weight: number;
  type: string;
  carrier?: string;
}

export interface AppendEventData {
  status: ShipmentStatus;
  description: string;
  location: string;
  lat?: number;
  lng?: number;
  carrier?: string;
}

export interface IShipmentRepository {
  create(data: CreateShipmentData, seedEvents: ShipmentEvent[]): Promise<Shipment>;
  /** Resolves by EITHER id — the two lookups the Map's double-write supported. */
  findByAnyId(id: string): Promise<Shipment | null>;
  appendEvent(shipmentId: string, event: AppendEventData): Promise<Shipment>;
  saveProof(shipmentId: string, proof: Omit<DeliveryProof, 'id' | 'capturedAt'>): Promise<DeliveryProof>;
  findProof(shipmentId: string): Promise<DeliveryProof | null>;
}

// ─── In-memory implementation ─────────────────────────────────────────────────

/** Test double and the no-DATABASE_URL dev fallback. Not durable. */
export class InMemoryShipmentRepository implements IShipmentRepository {
  private shipments = new Map<string, Shipment>();
  private proofs = new Map<string, DeliveryProof>();

  async create(data: CreateShipmentData, seedEvents: ShipmentEvent[]): Promise<Shipment> {
    const now = new Date().toISOString();
    const shipment: Shipment = {
      shipmentId: `shp_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      trackingNumber: `TRK-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      orderId: data.orderId,
      subOrderId: data.subOrderId,
      from: data.from,
      to: data.to,
      weight: data.weight,
      type: data.type,
      status: 'in_transit',
      carrier: data.carrier,
      labelUrl: null,
      events: seedEvents,
      createdAt: now,
      updatedAt: now,
    };

    this.shipments.set(shipment.shipmentId, shipment);
    return { ...shipment, events: [...shipment.events] };
  }

  async findByAnyId(id: string): Promise<Shipment | null> {
    const found =
      this.shipments.get(id) ??
      [...this.shipments.values()].find((s) => s.trackingNumber === id);
    return found ? { ...found, events: [...found.events] } : null;
  }

  async appendEvent(shipmentId: string, event: AppendEventData): Promise<Shipment> {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

    shipment.events.push({ ...event, timestamp: new Date().toISOString() });
    shipment.status = event.status;
    shipment.updatedAt = new Date().toISOString();

    return { ...shipment, events: [...shipment.events] };
  }

  async saveProof(
    shipmentId: string,
    proof: Omit<DeliveryProof, 'id' | 'capturedAt'>,
  ): Promise<DeliveryProof> {
    const record: DeliveryProof = {
      ...proof,
      id: randomUUID(),
      capturedAt: new Date().toISOString(),
    };
    this.proofs.set(shipmentId, record);
    return { ...record };
  }

  async findProof(shipmentId: string): Promise<DeliveryProof | null> {
    const proof = this.proofs.get(shipmentId);
    return proof ? { ...proof } : null;
  }
}
