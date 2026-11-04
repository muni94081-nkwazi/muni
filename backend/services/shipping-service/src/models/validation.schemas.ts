import { z } from 'zod';
import { REGIONS } from './region.js';

// ─── Request schemas ──────────────────────────────────────────────────────────
//
// shipping-service accepted whatever it was sent. `POST /shipments` in
// particular destructured `{ orderId, from, to, weight, type }` and stored the
// result without checking any of them, so a shipment could be booked with no
// orderId, a negative weight, or a `type` the carrier does not offer — and the
// tracking record that came back looked perfectly normal.

export const ServiceLevelSchema = z.enum(['express', 'standard', 'economy', 'pickup']);

export const DestinationSchema = z.object({
  city:     z.string().trim().min(1, 'Destination city is required'),
  district: z.string().trim().optional(),
  region:   z.enum(REGIONS).optional(),
  address:  z.string().trim().max(500).optional(),
  lat:      z.number().min(-90).max(90).optional(),
  lng:      z.number().min(-180).max(180).optional(),
});

export const CalculateRatesSchema = z.object({
  destination: DestinationSchema,
  itemsByVendor: z.array(z.object({
    vendorId: z.string().trim().min(1),
    items: z.array(z.object({
      productId: z.string().trim().min(1),
      quantity:  z.number().int().min(1),
      weightKg:  z.number().nonnegative().optional(),
    })).min(1, 'Each vendor needs at least one item'),
  })).min(1, 'itemsByVendor array is required'),
  preferredServiceLevel: ServiceLevelSchema.optional(),
});

export const CreateShipmentSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
  from:    z.string().trim().min(1, 'from is required').max(200),
  to:      z.string().trim().min(1, 'to is required').max(200),
  // Bounded on both sides: 0 is not a parcel, and anything past 1000kg is a
  // freight booking this service does not handle.
  weight:  z.number().positive('weight must be greater than 0').max(1000),
  type:    ServiceLevelSchema.default('standard'),
});

export const UpdateShipmentSchema = z.object({
  status: z.enum([
    'order_placed', 'picked_up', 'in_transit',
    'out_for_delivery', 'delivered', 'failed', 'returned',
  ]).optional(),
  location:    z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
}).refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: 'Provide at least one field to update' },
);

// ─── Pickup stations ──────────────────────────────────────────────────────────

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

const DayHoursSchema = z.object({
  open:   TimeOfDay,
  close:  TimeOfDay,
  closed: z.boolean().optional(),
}).refine(
  (data) => data.closed === true || data.open < data.close,
  { message: 'A station cannot close before it opens' },
);

export const WeeklyOperatingHoursSchema = z.record(
  z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  DayHoursSchema,
);

export const CreateStationSchema = z.object({
  name:         z.string().trim().min(1, 'name is required').max(200),
  region:       z.enum(REGIONS),
  address:      z.string().trim().min(1, 'address is required').max(500),
  contactPhone: z.string().trim().min(1, 'contactPhone is required').max(32),
  capacity:     z.number().int().positive('capacity must be greater than 0'),
  lat:          z.number().min(-90).max(90).optional(),
  lng:          z.number().min(-180).max(180).optional(),
  operatingHours: WeeklyOperatingHoursSchema.optional(),
});

export const UpdateOperatingHoursSchema = z.object({
  operatingHours: WeeklyOperatingHoursSchema,
});

export const CheckInPackageSchema = z.object({
  trackingNumber: z.string().trim().min(1, 'trackingNumber is required'),
  orderId:        z.string().trim().min(1).optional(),
  recipientName:  z.string().trim().max(200).optional(),
  recipientPhone: z.string().trim().max(32).optional(),
  shelfCode:      z.string().trim().max(50).optional(),
});

export const CheckOutPackageSchema = z.object({
  trackingNumber: z.string().trim().min(1, 'trackingNumber is required'),
  // The code the recipient reads off their phone — the only thing standing
  // between a package and whoever walks up to the counter.
  pickupCode:     z.string().trim().min(1, 'pickupCode is required'),
});

export const StationIdParams = z.object({
  id: z.string().trim().min(1, 'id is required'),
});
