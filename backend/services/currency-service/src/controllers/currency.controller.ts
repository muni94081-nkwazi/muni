import { Request, Response } from 'express';
import { currencyService } from '../services/currency.service.js';
import { ConvertBulkSchema } from '../models/currency.model.js';

// Every handler is async now: rates come from a shared Redis snapshot rather
// than a per-process Map, so reading them is I/O.

export const listCurrencies = async (_req: Request, res: Response) => {
  res.json(await currencyService.getAllCurrencies());
};

export const listRates = async (_req: Request, res: Response) => {
  res.json(await currencyService.getAllRates());
};

export const getCurrency = async (req: Request, res: Response) => {
  const { code } = req.params;
  const currency = await currencyService.getCurrency(code);
  if (!currency) {
    res.status(404).json({ message: 'Currency not found' });
    return;
  }
  res.json(currency);
};

export const convert = async (req: Request, res: Response) => {
  const { from, to, amount } = req.query;

  if (!from || !to || !amount) {
    res.status(400).json({ message: 'Missing from, to, or amount query parameters' });
    return;
  }

  try {
    const convertedAmount = await currencyService.convert(String(from), String(to), Number(amount));
    res.json({
      from,
      to,
      amount: Number(amount),
      result: convertedAmount,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const convertBulk = async (req: Request, res: Response) => {
  const result = ConvertBulkSchema.safeParse(req.body);
  if (!result.success) {
    res.status(422).json({ message: 'Validation failed', issues: result.error.issues });
    return;
  }

  try {
    const converted = await Promise.all(
      result.data.map(async (reqItem) => ({
        ...reqItem,
        result: await currencyService.convert(reqItem.from, reqItem.to, reqItem.amount),
      })),
    );
    res.json(converted);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
