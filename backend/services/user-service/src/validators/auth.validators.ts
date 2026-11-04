import { z } from 'zod';

// Matches Uganda mobile numbers in either local (07XXXXXXXX) or
// international (+2567XXXXXXXX) format — mirrors the frontend's
// isValidUgandanPhone so both layers agree on what's valid.
export const ugandanPhoneRegex = /^(?:\+256|0)7\d{8}$/;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phoneNumber: z
    .string()
    .trim()
    .regex(ugandanPhoneRegex, 'Enter a valid Ugandan phone number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
