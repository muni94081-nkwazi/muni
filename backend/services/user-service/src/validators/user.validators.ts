import { z } from 'zod';
import { ugandanPhoneRegex } from './auth.validators.js';

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    phoneNumber: z
      .string()
      .trim()
      .regex(ugandanPhoneRegex, 'Enter a valid Ugandan phone number')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

const hour = z.number().int().min(0).max(23);

export const updatePreferencesSchema = z
  .object({
    transactionalSms: z.boolean().optional(),
    transactionalEmail: z.boolean().optional(),
    transactionalPush: z.boolean().optional(),
    marketingSms: z.boolean().optional(),
    marketingEmail: z.boolean().optional(),
    marketingPush: z.boolean().optional(),
    whatsappOptIn: z.boolean().optional(),
    timezone: z.string().trim().min(1).optional(),
    quietHoursStart: hour.nullable().optional(),
    quietHoursEnd: hour.nullable().optional(),
    locale: z.string().trim().min(2).max(10).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  })
  // Both ends or neither — a half-configured window would silently mute or
  // fail to mute, and the caller would have no way to tell which.
  .refine(
    (data) =>
      !('quietHoursStart' in data || 'quietHoursEnd' in data) ||
      (data.quietHoursStart ?? null) === null === ((data.quietHoursEnd ?? null) === null),
    { message: 'Set both quietHoursStart and quietHoursEnd, or neither' },
  );
