import { z } from 'zod';

export const CalculateTaxRequestSchema = z.object({
  countryCode: z.string().length(2),
  stateCode: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    category: z.string(),
    price: z.number().min(0),
    quantity: z.number().min(1)
  }))
});

export const ValidateTaxNumberSchema = z.object({
  countryCode: z.string().length(2),
  taxNumber: z.string()
});
