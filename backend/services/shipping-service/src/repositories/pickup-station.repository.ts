import { randomUUID } from 'node:crypto';
import type { Region } from '../models/region.js';
import type {
  PackageHold,
  PackageHoldStatus,
  PickupStation,
  WeeklyOperatingHours,
} from '../models/pickup-station.model.js';

// ─── Pickup station persistence ───────────────────────────────────────────────
//
// The service used to own three Maps directly. Splitting the storage out
// behind an interface is what lets the unit tests keep running with no
// database while production talks to Postgres — the same arrangement
// order-service uses for IOrderRepository.
//
// Everything is async, including the in-memory implementation. A sync
// in-memory double would let a test pass against timing that the Prisma
// implementation cannot reproduce.

/**
 * A parcel already has an uncollected hold at this station.
 *
 * A normal counter outcome — an agent scanning the same parcel twice — not a
 * server fault. Raised by both implementations so the service can answer 409
 * either way; without it the Prisma path surfaced the raw P2002 as a 500
 * carrying the absolute source path of the repository file.
 */
export class DuplicateActiveHoldError extends Error {
  constructor(readonly trackingNumber: string) {
    super(`A hold for ${trackingNumber} is already awaiting pickup at this station`);
    this.name = 'DuplicateActiveHoldError';
  }
}

/** What a caller supplies to create a station; ids and codes are allocated here. */
export interface CreateStationData {
  name: string;
  region: Region;
  address: string;
  contactPhone: string;
  capacity: number;
  lat?: number;
  lng?: number;
  operatingHours: WeeklyOperatingHours;
}

export interface CreateHoldData {
  stationId: string;
  trackingNumber: string;
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  shelfCode?: string;
  /** Already hashed by the service — the plaintext never reaches storage. */
  pickupCodeHash: string;
  checkedInBy: string;
}

/**
 * A hold as stored, including the hash.
 *
 * `PackageHold` (the API shape) deliberately has no hash field: the plaintext
 * code is returned once at check-in and the hash is never exposed. This type
 * is the storage view, used only inside the service.
 */
export interface StoredPackageHold extends PackageHold {
  pickupCodeHash: string;
}

export interface IPickupStationRepository {
  /**
   * Allocate the next per-region sequence number and create the station in one
   * atomic step, so two replicas cannot both mint PUDO-KLA-001.
   */
  createStation(data: CreateStationData, buildCode: (seq: number) => string): Promise<PickupStation>;

  findStationById(id: string): Promise<PickupStation | null>;
  listStations(filter?: { region?: Region }): Promise<PickupStation[]>;
  updateStationHours(id: string, operatingHours: WeeklyOperatingHours): Promise<PickupStation>;

  listHolds(stationId: string, status?: PackageHoldStatus): Promise<PackageHold[]>;

  /**
   * Create the hold and increment the station's load together — a hold that
   * exists without the load being counted lets a station overfill.
   */
  createHold(data: CreateHoldData): Promise<{ hold: StoredPackageHold; station: PickupStation }>;

  /** The one hold awaiting collection for this parcel at this station. */
  findActiveHold(stationId: string, trackingNumber: string): Promise<StoredPackageHold | null>;

  /** Mark collected and decrement the station's load together. */
  collectHold(
    holdId: string,
    checkedOutBy: string,
  ): Promise<{ hold: PackageHold; station: PickupStation }>;
}

// ─── In-memory implementation ─────────────────────────────────────────────────

/**
 * Used by the unit suite and nothing else.
 *
 * It reproduces the invariants the database enforces — the per-region
 * sequence, the single active hold per parcel, load counting — so a test that
 * passes here is not passing on laxer rules than production runs under.
 */
export class InMemoryPickupStationRepository implements IPickupStationRepository {
  private stations = new Map<string, PickupStation>();
  private holds = new Map<string, StoredPackageHold>();
  private seqByRegion = new Map<Region, number>();

  async createStation(
    data: CreateStationData,
    buildCode: (seq: number) => string,
  ): Promise<PickupStation> {
    const seq = (this.seqByRegion.get(data.region) ?? 0) + 1;
    this.seqByRegion.set(data.region, seq);

    const now = new Date().toISOString();
    const station: PickupStation = {
      id: randomUUID(),
      code: buildCode(seq),
      name: data.name,
      region: data.region,
      address: data.address,
      contactPhone: data.contactPhone,
      lat: data.lat,
      lng: data.lng,
      operatingHours: data.operatingHours,
      capacity: data.capacity,
      currentLoad: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    this.stations.set(station.id, station);
    return { ...station };
  }

  async findStationById(id: string): Promise<PickupStation | null> {
    const station = this.stations.get(id);
    return station ? { ...station } : null;
  }

  async listStations(filter?: { region?: Region }): Promise<PickupStation[]> {
    const all = [...this.stations.values()].map((s) => ({ ...s }));
    return filter?.region ? all.filter((s) => s.region === filter.region) : all;
  }

  async updateStationHours(id: string, operatingHours: WeeklyOperatingHours): Promise<PickupStation> {
    const station = this.stations.get(id);
    if (!station) throw new Error(`Pickup station ${id} not found`);

    station.operatingHours = operatingHours;
    station.updatedAt = new Date().toISOString();
    return { ...station };
  }

  async listHolds(stationId: string, status?: PackageHoldStatus): Promise<PackageHold[]> {
    return [...this.holds.values()]
      .filter((h) => h.stationId === stationId && (!status || h.status === status))
      .map(stripHash);
  }

  async createHold(
    data: CreateHoldData,
  ): Promise<{ hold: StoredPackageHold; station: PickupStation }> {
    const station = this.stations.get(data.stationId);
    if (!station) throw new Error(`Pickup station ${data.stationId} not found`);

    // Mirrors the partial unique index in the migration.
    const clash = [...this.holds.values()].some(
      (h) =>
        h.stationId === data.stationId &&
        h.trackingNumber === data.trackingNumber &&
        h.status === 'AWAITING_PICKUP',
    );
    if (clash) throw new DuplicateActiveHoldError(data.trackingNumber);

    const hold: StoredPackageHold = {
      id: randomUUID(),
      stationId: data.stationId,
      trackingNumber: data.trackingNumber,
      orderId: data.orderId,
      recipientName: data.recipientName,
      recipientPhone: data.recipientPhone,
      shelfCode: data.shelfCode,
      status: 'AWAITING_PICKUP',
      pickupCodeHash: data.pickupCodeHash,
      checkedInAt: new Date().toISOString(),
      checkedInBy: data.checkedInBy,
    };

    this.holds.set(hold.id, hold);

    station.currentLoad += 1;
    if (station.currentLoad >= station.capacity) station.status = 'FULL';
    station.updatedAt = new Date().toISOString();

    return { hold: { ...hold }, station: { ...station } };
  }

  async findActiveHold(
    stationId: string,
    trackingNumber: string,
  ): Promise<StoredPackageHold | null> {
    const hold = [...this.holds.values()].find(
      (h) =>
        h.stationId === stationId &&
        h.trackingNumber === trackingNumber &&
        h.status === 'AWAITING_PICKUP',
    );
    return hold ? { ...hold } : null;
  }

  async collectHold(
    holdId: string,
    checkedOutBy: string,
  ): Promise<{ hold: PackageHold; station: PickupStation }> {
    const hold = this.holds.get(holdId);
    if (!hold) throw new Error(`Package hold ${holdId} not found`);

    const station = this.stations.get(hold.stationId);
    if (!station) throw new Error(`Pickup station ${hold.stationId} not found`);

    hold.status = 'COLLECTED';
    hold.checkedOutAt = new Date().toISOString();
    hold.checkedOutBy = checkedOutBy;

    station.currentLoad = Math.max(0, station.currentLoad - 1);
    if (station.status === 'FULL' && station.currentLoad < station.capacity) {
      station.status = 'ACTIVE';
    }
    station.updatedAt = new Date().toISOString();

    return { hold: stripHash(hold), station: { ...station } };
  }
}

/** The API shape never carries the hash. */
function stripHash(hold: StoredPackageHold): PackageHold {
  const { pickupCodeHash: _hash, ...rest } = hold;
  return { ...rest };
}
