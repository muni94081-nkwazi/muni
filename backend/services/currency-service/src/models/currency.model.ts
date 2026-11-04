import { z } from 'zod';

export const ConvertBulkSchema = z.array(
  z.object({
    from: z.string().length(3),
    to: z.string().length(3),
    amount: z.number().positive(),
  })
);

export type CurrencyInfo = {
  code: string;
  name: string;
  symbol: string;
  rate: number; // Against base currency
};
