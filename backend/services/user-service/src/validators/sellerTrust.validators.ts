import { z } from 'zod';
import { TRUST_EVENT_TYPES } from '../services/sellerTrust.service.js';

// Derived from the service's counter registry so a new event type is accepted
// the moment it's implemented — the two lists previously drifted apart.
export const trustEventSchema = z.object({
  eventType: z.string().refine((value) => TRUST_EVENT_TYPES.includes(value), {
    message: 'Unknown trust event type',
  }),
  orderId: z.string().optional(),
  disputeId: z.string().optional(),
  responseTimeHours: z.number().nonnegative().optional(),
  occurredAt: z.string().optional(),
});

export const setVerifiedMerchantSchema = z.object({
  isVerified: z.boolean(),
});

export const updateStandingSchema = z.object({
  standing: z.enum(['GOOD', 'AT_RISK', 'SUSPENDED']).optional(),
  reason: z.string().trim().max(500).optional(),
});
