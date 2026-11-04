import { prisma } from '../db/prisma.js';
import type { Region } from '../models/region.js';
import type {
  PackageHold,
  PackageHoldStatus,
  PickupStation,
  WeeklyOperatingHours,
} from '../models/pickup-station.model.js';
import type {
  CreateHoldData,
  CreateStationData,
  IPickupStationRepository,
  StoredPackageHold,
} from './pickup-station.repository.js';
import { DuplicateActiveHoldError } from './pickup-station.repository.js';

// ─── Postgres-backed pickup stations ──────────────────────────────────────────
//
// Two operations are transactional on purpose:
//
//   createStation — allocates the per-region code sequence and inserts the
//                   station together. Split apart, two replicas both read seq
//                   0 and both mint PUDO-KLA-001.
//   createHold /  — write the hold and move the station's currentLoad
//   collectHold     together. A hold that exists without the load being
//                   counted lets a station overfill; the reverse strands
//                   capacity nobody can use.

type StationRow = {
  id: string;
  code: string;
  name: string;
  region: Region;
  address: string;
  lat: number | null;
  lng: number | null;
  contactPhone: string;
  operatingHours: unknown;
  capacity: number;
  currentLoad: number;
  status: 'ACTIVE' | 'INACTIVE' | 'FULL';
  createdAt: Date;
  updatedAt: Date;
};

type HoldRow = {
  id: string;
  stationId: string;
  trackingNumber: string;
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  shelfCode: string | null;
  status: PackageHoldStatus;
  pickupCodeHash: string;
  checkedInAt: Date;
  checkedInBy: string;
  checkedOutAt: Date | null;
  checkedOutBy: string | null;
};

/**
 * Rows carry `Date` and `null`; the API contract is ISO strings and absent
 * keys. Converting at this boundary keeps the shape identical to what the
 * in-memory Maps produced, so no consumer notices the change.
 */
function toStation(row: StationRow): PickupStation {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    region: row.region,
    address: row.address,
    ...(row.lat !== null ? { lat: row.lat } : {}),
    ...(row.lng !== null ? { lng: row.lng } : {}),
    contactPhone: row.contactPhone,
    operatingHours: (row.operatingHours ?? {}) as WeeklyOperatingHours,
    capacity: row.capacity,
    currentLoad: row.currentLoad,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStoredHold(row: HoldRow): StoredPackageHold {
  return {
    id: row.id,
    stationId: row.stationId,
    trackingNumber: row.trackingNumber,
    orderId: row.orderId,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    ...(row.shelfCode !== null ? { shelfCode: row.shelfCode } : {}),
    status: row.status,
    pickupCodeHash: row.pickupCodeHash,
    checkedInAt: row.checkedInAt.toISOString(),
    checkedInBy: row.checkedInBy,
    ...(row.checkedOutAt !== null ? { checkedOutAt: row.checkedOutAt.toISOString() } : {}),
    ...(row.checkedOutBy !== null ? { checkedOutBy: row.checkedOutBy } : {}),
  };
}

function toPublicHold(row: HoldRow): PackageHold {
  const { pickupCodeHash: _hash, ...rest } = toStoredHold(row);
  return rest;
}

export class PrismaPickupStationRepository implements IPickupStationRepository {
  async createStation(
    data: CreateStationData,
    buildCode: (seq: number) => string,
  ): Promise<PickupStation> {
    const row = await prisma.$transaction(async (tx) => {
      // upsert + increment is a single atomic statement, so concurrent creates
      // in the same region serialise on this row rather than racing.
      const sequence = await tx.stationCodeSequence.upsert({
        where: { region: data.region },
        create: { region: data.region, seq: 1 },
        update: { seq: { increment: 1 } },
      });

      return tx.pickupStation.create({
        data: {
          code: buildCode(sequence.seq),
          name: data.name,
          region: data.region,
          address: data.address,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          contactPhone: data.contactPhone,
          operatingHours: data.operatingHours as object,
          capacity: data.capacity,
        },
      });
    });

    return toStation(row as StationRow);
  }

  async findStationById(id: string): Promise<PickupStation | null> {
    const row = await prisma.pickupStation.findUnique({ where: { id } });
    return row ? toStation(row as StationRow) : null;
  }

  async listStations(filter?: { region?: Region }): Promise<PickupStation[]> {
    const rows = await prisma.pickupStation.findMany({
      where: filter?.region ? { region: filter.region } : undefined,
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => toStation(r as StationRow));
  }

  async updateStationHours(
    id: string,
    operatingHours: WeeklyOperatingHours,
  ): Promise<PickupStation> {
    const row = await prisma.pickupStation.update({
      where: { id },
      data: { operatingHours: operatingHours as object },
    });
    return toStation(row as StationRow);
  }

  async listHolds(stationId: string, status?: PackageHoldStatus): Promise<PackageHold[]> {
    const rows = await prisma.packageHold.findMany({
      where: { stationId, ...(status ? { status } : {}) },
      orderBy: { checkedInAt: 'asc' },
    });
    return rows.map((r) => toPublicHold(r as HoldRow));
  }

  async createHold(
    data: CreateHoldData,
  ): Promise<{ hold: StoredPackageHold; station: PickupStation }> {
    try {
      return await this.insertHold(data);
    } catch (err) {
      // P2002 here is the partial unique index rejecting a second active hold
      // for the same parcel. Left unhandled, Prisma's error reaches the client
      // as a 500 quoting the absolute path and source lines of this file.
      if ((err as { code?: string }).code === 'P2002') {
        throw new DuplicateActiveHoldError(data.trackingNumber);
      }
      throw err;
    }
  }

  private async insertHold(
    data: CreateHoldData,
  ): Promise<{ hold: StoredPackageHold; station: PickupStation }> {
    return prisma.$transaction(async (tx) => {
      // The partial unique index (station_id, tracking_number) WHERE
      // status = 'AWAITING_PICKUP' rejects a duplicate active hold here.
      const hold = await tx.packageHold.create({
        data: {
          stationId: data.stationId,
          trackingNumber: data.trackingNumber,
          orderId: data.orderId,
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          shelfCode: data.shelfCode ?? null,
          pickupCodeHash: data.pickupCodeHash,
          checkedInBy: data.checkedInBy,
        },
      });

      const station = await tx.pickupStation.update({
        where: { id: data.stationId },
        data: { currentLoad: { increment: 1 } },
      });

      // Read back after the increment so FULL reflects the row's real value
      // rather than a count computed before the write landed.
      const settled =
        station.currentLoad >= station.capacity && station.status === 'ACTIVE'
          ? await tx.pickupStation.update({
              where: { id: station.id },
              data: { status: 'FULL' },
            })
          : station;

      return {
        hold: toStoredHold(hold as HoldRow),
        station: toStation(settled as StationRow),
      };
    });
  }

  async findActiveHold(
    stationId: string,
    trackingNumber: string,
  ): Promise<StoredPackageHold | null> {
    const row = await prisma.packageHold.findFirst({
      where: { stationId, trackingNumber, status: 'AWAITING_PICKUP' },
    });
    return row ? toStoredHold(row as HoldRow) : null;
  }

  async collectHold(
    holdId: string,
    checkedOutBy: string,
  ): Promise<{ hold: PackageHold; station: PickupStation }> {
    return prisma.$transaction(async (tx) => {
      const hold = await tx.packageHold.update({
        where: { id: holdId },
        data: {
          status: 'COLLECTED',
          checkedOutAt: new Date(),
          checkedOutBy,
        },
      });

      const station = await tx.pickupStation.update({
        where: { id: hold.stationId },
        // GREATEST-style floor: decrement must never take the count negative
        // if a load was already reconciled by hand.
        data: { currentLoad: { decrement: 1 } },
      });

      const normalised =
        station.currentLoad < 0
          ? await tx.pickupStation.update({ where: { id: station.id }, data: { currentLoad: 0 } })
          : station;

      const settled =
        normalised.status === 'FULL' && normalised.currentLoad < normalised.capacity
          ? await tx.pickupStation.update({
              where: { id: normalised.id },
              data: { status: 'ACTIVE' },
            })
          : normalised;

      return {
        hold: toPublicHold(hold as HoldRow),
        station: toStation(settled as StationRow),
      };
    });
  }
}
