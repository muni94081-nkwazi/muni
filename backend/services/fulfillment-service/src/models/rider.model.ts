import { z } from 'zod';

export type RiderDeliveryStatus = 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED_COD' | 'DELIVERED' | 'RETURNED';

export type RiderStatus = 'AVAILABLE' | 'ON_DELIVERY' | 'OFFLINE';
export type VehicleType = 'BODA' | 'VAN' | 'BICYCLE' | 'FOOT';

export interface Rider {
  id: string;
  name?: string;
  phone?: string;
  vehicleType: VehicleType;
  status: RiderStatus;
  activeFulfillmentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DigitalSignature {
  id: string;
  fulfillmentId: string;
  riderId: string;
  signatureData: string; // base64-encoded signature image or SVG path data
  recipientName: string;
  capturedAt: string;
  location?: { lat: number; lng: number };
}

// ─── Request shapes ───────────────────────────────────────────────────────────
//
// The types above describe what is STORED. Nothing described what may be SENT,
// so `registerRider` handed `req.body` to Prisma and an unrecognised
// vehicleType came back as a 500 quoting the generated client's argument
// checker. Verified live: `vehicleType: 'MOTORCYCLE'` — a plausible value that
// simply is not one of the four this platform runs — produced an internal error
// rather than "that is not a vehicle we deliver on".

export const VehicleTypeSchema = z.enum(['BODA', 'VAN', 'BICYCLE', 'FOOT']);

export const RegisterRiderSchema = z.object({
  name:        z.string().trim().min(1).max(120).optional(),
  phone:       z.string().trim().min(1).max(32).optional(),
  vehicleType: VehicleTypeSchema,
}).strict();

export type RegisterRiderInput = z.infer<typeof RegisterRiderSchema>;
