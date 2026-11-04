import { Region } from './region.js';

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface OperatingHoursWindow {
  open: string; // "HH:MM", 24h, East Africa Time (UTC+3, no DST)
  close: string;
}

// A day omitted from the map means the station is closed that day.
export type WeeklyOperatingHours = Partial<Record<DayOfWeek, OperatingHoursWindow>>;

export type PickupStationStatus = 'ACTIVE' | 'INACTIVE' | 'FULL';

export interface PickupStation {
  id: string;
  code: string; // e.g. PUDO-KLA-001
  name: string;
  region: Region;
  address: string;
  lat?: number;
  lng?: number;
  contactPhone: string;
  operatingHours: WeeklyOperatingHours;
  capacity: number;
  currentLoad: number;
  status: PickupStationStatus;
  createdAt: string;
  updatedAt: string;
}

export type PackageHoldStatus = 'AWAITING_PICKUP' | 'COLLECTED';

/**
 * A parcel held at a station, as every read returns it.
 *
 * Note what is absent: `pickupCode`. Only a bcrypt hash of it is stored, so
 * after check-in there is nothing to return — the plaintext exists solely in
 * the check-in response (`IssuedPackageHold` in pickup-station.service.ts).
 * It is the one credential standing between a parcel and whoever walks up to
 * the counter, and it used to be listed in plaintext by GET /inventory.
 */
export interface PackageHold {
  id: string;
  stationId: string;
  trackingNumber: string;
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  shelfCode?: string;
  status: PackageHoldStatus;
  checkedInAt: string;
  checkedInBy: string;
  checkedOutAt?: string;
  checkedOutBy?: string;
}
