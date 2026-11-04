import { z } from 'zod';

// Deliberately broader than the account-phone rule: a delivery contact may be
// a neighbour, an office reception, or a number in a country we ship to but
// don't yet register accounts from. E.164-ish, 7-15 digits after an optional +.
const contactPhoneRegex = /^\+?\d{7,15}$/;

const addressBase = {
  type: z.enum(['HOME', 'WORK', 'PICKUP_STATION']).optional(),
  contactName: z.string().trim().min(1, 'Contact name is required').max(120),
  contactPhone: z
    .string()
    .trim()
    .regex(contactPhoneRegex, 'Enter a valid phone number for the recipient'),
  // ISO 3166-1 alpha-2. Defaulted rather than required so existing UG-only
  // callers keep working unchanged.
  country: z.string().trim().length(2).toUpperCase().default('UG'),
  region: z.string().trim().min(1, 'Region is required').max(120),
  district: z.string().trim().min(1, 'District is required').max(120),
  ward: z.string().trim().max(120).optional(),
  addressLine: z.string().trim().min(1, 'Street address is required').max(300),
  landmark: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(20).optional(),
  pickupStationId: z.string().trim().max(64).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
};

export const createAddressSchema = z
  .object(addressBase)
  .refine((data) => data.type !== 'PICKUP_STATION' || Boolean(data.pickupStationId), {
    message: 'pickupStationId is required when type is PICKUP_STATION',
    path: ['pickupStationId'],
  });

export const updateAddressSchema = z
  .object(addressBase)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });
