import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Region } from '../models/region.js';
import {
  DayOfWeek,
  PackageHold,
  PickupStation,
  WeeklyOperatingHours,
} from '../models/pickup-station.model.js';
import {
  DuplicateActiveHoldError,
  InMemoryPickupStationRepository,
  type IPickupStationRepository,
} from '../repositories/pickup-station.repository.js';
import { PrismaPickupStationRepository } from '../repositories/prisma-pickup-station.repository.js';

export class PickupStationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const DAY_ORDER: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const EAT_OFFSET_MINUTES = 3 * 60; // Uganda is fixed UTC+3, no DST

const REGION_CODE: Record<Region, string> = {
  KAMPALA: 'KLA',
  ENTEBBE: 'EBB',
  JINJA: 'JJA',
  UPCOUNTRY: 'UPC',
};

/**
 * Cost for the pickup-code hash.
 *
 * Lower than a password's: the code is six digits, single-use, tied to one
 * parcel at one station, and verified at a counter — not a credential worth a
 * 250ms hash on every collection. It still means a leaked database does not
 * hand over every parcel in the network in plaintext.
 */
const PICKUP_CODE_ROUNDS = 8;

const DEFAULT_OPERATING_HOURS: WeeklyOperatingHours = {
  MON: { open: '08:00', close: '19:00' },
  TUE: { open: '08:00', close: '19:00' },
  WED: { open: '08:00', close: '19:00' },
  THU: { open: '08:00', close: '19:00' },
  FRI: { open: '08:00', close: '19:00' },
  SAT: { open: '09:00', close: '17:00' },
};

function nowInEAT(): Date {
  const utcMs = Date.now();
  return new Date(utcMs + EAT_OFFSET_MINUTES * 60 * 1000);
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/**
 * A hold as returned at check-in: the API shape plus the one-time plaintext
 * code. Only `checkInPackage` produces this; every other read omits the code,
 * because after issue only its hash exists.
 */
export interface IssuedPackageHold extends PackageHold {
  pickupCode: string;
}

export class PickupStationService {
  // Defaults to the in-memory repository so constructing the service with no
  // arguments — which the unit tests do — needs no database.
  constructor(private readonly repo: IPickupStationRepository = new InMemoryPickupStationRepository()) {}

  async createStation(data: {
    name: string;
    region: Region;
    address: string;
    contactPhone: string;
    capacity: number;
    lat?: number;
    lng?: number;
    operatingHours?: WeeklyOperatingHours;
  }): Promise<PickupStation> {
    if (!data.name || !data.region || !data.address || !data.contactPhone) {
      throw new PickupStationError('name, region, address, and contactPhone are required');
    }
    if (!(data.capacity > 0)) {
      throw new PickupStationError('capacity must be greater than 0');
    }

    // The sequence is allocated inside the repository, in the same transaction
    // as the insert — two replicas creating a Kampala station concurrently get
    // 001 and 002 rather than both getting 001.
    return this.repo.createStation(
      { ...data, operatingHours: data.operatingHours ?? DEFAULT_OPERATING_HOURS },
      (seq) => `PUDO-${REGION_CODE[data.region]}-${String(seq).padStart(3, '0')}`,
    );
  }

  async listStations(filter?: { region?: Region }): Promise<PickupStation[]> {
    return this.repo.listStations(filter);
  }

  async getStation(id: string): Promise<PickupStation> {
    const station = await this.repo.findStationById(id);
    if (!station) throw new PickupStationError('Pickup station not found', 404);
    return station;
  }

  async updateOperatingHours(id: string, operatingHours: WeeklyOperatingHours): Promise<PickupStation> {
    await this.getStation(id); // 404s before writing
    return this.repo.updateStationHours(id, operatingHours);
  }

  /** Pure — no storage involved, so it stays synchronous. */
  isOpenNow(station: PickupStation, at: Date = nowInEAT()): boolean {
    const day = DAY_ORDER[at.getUTCDay()];
    const window = station.operatingHours[day];
    if (!window) return false;
    const minutesNow = at.getUTCHours() * 60 + at.getUTCMinutes();
    return minutesNow >= parseHHMM(window.open) && minutesNow < parseHHMM(window.close);
  }

  async getInventory(stationId: string, status?: PackageHold['status']): Promise<PackageHold[]> {
    await this.getStation(stationId); // 404s for an unknown station
    return this.repo.listHolds(stationId, status);
  }

  async checkInPackage(
    stationId: string,
    data: {
      trackingNumber: string;
      orderId: string;
      recipientName: string;
      recipientPhone: string;
      shelfCode?: string;
      checkedInBy: string;
    },
  ): Promise<IssuedPackageHold> {
    const station = await this.getStation(stationId);

    if (station.status === 'INACTIVE') throw new PickupStationError('Station is inactive');
    if (station.currentLoad >= station.capacity) {
      throw new PickupStationError('Station is at full capacity', 409);
    }
    if (!data.trackingNumber || !data.orderId || !data.recipientName || !data.recipientPhone) {
      throw new PickupStationError(
        'trackingNumber, orderId, recipientName, and recipientPhone are required',
      );
    }

    // Generated here, hashed before it reaches storage, and returned exactly
    // once — in this response. Nothing can read it back afterwards.
    const pickupCode = String(randomInt(100000, 999999));
    const pickupCodeHash = await bcrypt.hash(pickupCode, PICKUP_CODE_ROUNDS);

    let hold;
    try {
      ({ hold } = await this.repo.createHold({
        stationId,
        trackingNumber: data.trackingNumber,
        orderId: data.orderId,
        recipientName: data.recipientName,
        recipientPhone: data.recipientPhone,
        shelfCode: data.shelfCode,
        pickupCodeHash,
        checkedInBy: data.checkedInBy,
      }));
    } catch (err) {
      // Scanning the same parcel twice is a counter mistake, not a fault:
      // 409, with the message the storage layer wrote. Anything else is ours.
      if (err instanceof DuplicateActiveHoldError) {
        throw new PickupStationError(err.message, 409);
      }
      throw err;
    }

    const { pickupCodeHash: _hash, ...publicHold } = hold;
    return { ...publicHold, pickupCode };
  }

  async checkOutPackage(
    stationId: string,
    trackingNumber: string,
    pickupCode: string,
    checkedOutBy: string,
  ): Promise<PackageHold> {
    await this.getStation(stationId);

    const hold = await this.repo.findActiveHold(stationId, trackingNumber);
    if (!hold) {
      throw new PickupStationError(
        'No package awaiting pickup for this tracking number at this station',
        404,
      );
    }

    // bcrypt.compare is constant-time for a given hash, so a wrong code cannot
    // be narrowed down by timing the response.
    const matches = await bcrypt.compare(pickupCode, hold.pickupCodeHash);
    if (!matches) throw new PickupStationError('Invalid pickup code', 403);

    const { hold: collected } = await this.repo.collectHold(hold.id, checkedOutBy);
    return collected;
  }
}

/**
 * The instance the controllers use.
 *
 * Postgres-backed whenever DATABASE_URL is set — which it is in compose and in
 * every deployed environment. Without it the service falls back to the
 * in-memory repository so `npm run dev` and the unit suite still work on a
 * machine with no database; that fallback is explicitly NOT durable, and the
 * log line says so rather than letting it look like everything is fine.
 */
function defaultRepository(): IPickupStationRepository {
  if (!process.env.DATABASE_URL) {
    console.warn(
      '[shipping-service] DATABASE_URL is not set — pickup stations are running ' +
      'in memory and will be lost on restart. Set it for any real environment.',
    );
    return new InMemoryPickupStationRepository();
  }
  return new PrismaPickupStationRepository();
}

export const pickupStationService = new PickupStationService(defaultRepository());
