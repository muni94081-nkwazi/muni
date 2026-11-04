import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import type {
  AppendEventData,
  CreateShipmentData,
  DeliveryProof,
  IShipmentRepository,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
} from './shipment.repository.js';

// ─── Postgres-backed shipments ────────────────────────────────────────────────
//
// The response shape is byte-identical to what the in-memory Map produced:
// `weight` comes back as a number (Prisma hands back a Decimal), timestamps as
// ISO strings, and `events` as an inline array rather than a relation the
// caller has to join.

type EventRow = {
  status: ShipmentStatus;
  description: string;
  location: string;
  lat: number | null;
  lng: number | null;
  carrier: string | null;
  occurredAt: Date;
};

type ShipmentRow = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  orderId: string;
  subOrderId: string | null;
  fromLocation: string;
  toLocation: string;
  weightKg: { toNumber(): number } | number;
  serviceLevel: string;
  status: ShipmentStatus;
  carrier: string | null;
  labelUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  events?: EventRow[];
};

function numeric(value: ShipmentRow['weightKg']): number {
  return typeof value === 'number' ? value : value.toNumber();
}

function toEvent(row: EventRow): ShipmentEvent {
  return {
    status: row.status,
    description: row.description,
    location: row.location,
    timestamp: row.occurredAt.toISOString(),
    ...(row.lat !== null ? { lat: row.lat } : {}),
    ...(row.lng !== null ? { lng: row.lng } : {}),
    ...(row.carrier !== null ? { carrier: row.carrier } : {}),
  };
}

function toShipment(row: ShipmentRow): Shipment {
  return {
    shipmentId: row.shipmentId,
    trackingNumber: row.trackingNumber,
    orderId: row.orderId,
    ...(row.subOrderId !== null ? { subOrderId: row.subOrderId } : {}),
    from: row.fromLocation,
    to: row.toLocation,
    weight: numeric(row.weightKg),
    type: row.serviceLevel,
    status: row.status,
    ...(row.carrier !== null ? { carrier: row.carrier } : {}),
    labelUrl: row.labelUrl,
    events: (row.events ?? []).map(toEvent),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const WITH_EVENTS = {
  events: { orderBy: { occurredAt: 'asc' } },
} as const;

export class PrismaShipmentRepository implements IShipmentRepository {
  async create(data: CreateShipmentData, seedEvents: ShipmentEvent[]): Promise<Shipment> {
    const row = await prisma.shipment.create({
      data: {
        shipmentId: `shp_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
        trackingNumber: `TRK-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        orderId: data.orderId,
        subOrderId: data.subOrderId ?? null,
        fromLocation: data.from,
        toLocation: data.to,
        weightKg: data.weight,
        serviceLevel: data.type,
        carrier: data.carrier ?? null,
        // Written with the shipment so a booking is never momentarily
        // event-less to a concurrent reader.
        events: {
          create: seedEvents.map((e) => ({
            status: e.status,
            description: e.description,
            location: e.location,
            occurredAt: new Date(e.timestamp),
            lat: e.lat ?? null,
            lng: e.lng ?? null,
            carrier: e.carrier ?? null,
          })),
        },
      },
      include: WITH_EVENTS,
    });

    return toShipment(row as unknown as ShipmentRow);
  }

  async findByAnyId(id: string): Promise<Shipment | null> {
    // Both columns are unique, so this resolves the two lookups the old Map
    // supported by writing each shipment under two keys.
    const row = await prisma.shipment.findFirst({
      where: { OR: [{ shipmentId: id }, { trackingNumber: id }] },
      include: WITH_EVENTS,
    });
    return row ? toShipment(row as unknown as ShipmentRow) : null;
  }

  async appendEvent(shipmentId: string, event: AppendEventData): Promise<Shipment> {
    const row = await prisma.shipment.update({
      where: { shipmentId },
      data: {
        status: event.status,
        events: {
          create: {
            status: event.status,
            description: event.description,
            location: event.location,
            lat: event.lat ?? null,
            lng: event.lng ?? null,
            carrier: event.carrier ?? null,
          },
        },
      },
      include: WITH_EVENTS,
    });

    return toShipment(row as unknown as ShipmentRow);
  }

  async saveProof(
    shipmentId: string,
    proof: Omit<DeliveryProof, 'id' | 'capturedAt'>,
  ): Promise<DeliveryProof> {
    const shipment = await prisma.shipment.findUnique({ where: { shipmentId } });
    if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

    // Upsert, not create: the unique constraint means a second delivery
    // attempt replaces the earlier proof rather than failing the handover.
    const row = await prisma.deliveryProof.upsert({
      where: { shipmentId: shipment.id },
      create: {
        shipmentId: shipment.id,
        orderId: proof.orderId,
        imageUrl: proof.imageUrl ?? null,
        signatureUrl: proof.signatureUrl ?? null,
        recipientName: proof.recipientName,
      },
      update: {
        imageUrl: proof.imageUrl ?? null,
        signatureUrl: proof.signatureUrl ?? null,
        recipientName: proof.recipientName,
        capturedAt: new Date(),
      },
    });

    return {
      id: row.id,
      orderId: row.orderId,
      ...(row.imageUrl !== null ? { imageUrl: row.imageUrl } : {}),
      ...(row.signatureUrl !== null ? { signatureUrl: row.signatureUrl } : {}),
      recipientName: row.recipientName,
      capturedAt: row.capturedAt.toISOString(),
    };
  }

  async findProof(shipmentId: string): Promise<DeliveryProof | null> {
    const shipment = await prisma.shipment.findUnique({
      where: { shipmentId },
      include: { proof: true },
    });
    if (!shipment?.proof) return null;

    const p = shipment.proof;
    return {
      id: p.id,
      orderId: p.orderId,
      ...(p.imageUrl !== null ? { imageUrl: p.imageUrl } : {}),
      ...(p.signatureUrl !== null ? { signatureUrl: p.signatureUrl } : {}),
      recipientName: p.recipientName,
      capturedAt: p.capturedAt.toISOString(),
    };
  }
}
