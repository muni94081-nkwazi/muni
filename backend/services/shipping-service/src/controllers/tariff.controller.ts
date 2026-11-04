import type { Request, Response } from 'express';
import { regionTariffService, TariffCalculationError } from '../services/tariff.service.js';
import { quoteCart } from '../services/cart-quote.service.js';

export function getCoverage(_req: Request, res: Response): void {
  res.json({ data: regionTariffService.listCoverage() });
}

export function quoteTariff(req: Request, res: Response): void {
  const { originHub, destinationRegion, weightKg, lengthCm, widthCm, heightCm, serviceLevel, codAmount } = req.body;

  if (!originHub || !destinationRegion || weightKg === undefined) {
    res.status(400).json({ message: 'originHub, destinationRegion, and weightKg are required' });
    return;
  }

  try {
    const quote = regionTariffService.quote({
      originHub,
      destinationRegion,
      weightKg: Number(weightKg),
      lengthCm: lengthCm !== undefined ? Number(lengthCm) : undefined,
      widthCm: widthCm !== undefined ? Number(widthCm) : undefined,
      heightCm: heightCm !== undefined ? Number(heightCm) : undefined,
      serviceLevel,
      codAmount: codAmount !== undefined ? Number(codAmount) : undefined,
    });
    res.json({ data: quote });
  } catch (err) {
    const status = err instanceof TariffCalculationError ? err.status : 500;
    res.status(status).json({ message: (err as Error).message });
  }
}

/**
 * POST /api/v1/shipping/quote — what a basket costs to deliver.
 *
 * The path checkout-service has always called. It did not exist, so every
 * checkout took the 404, logged "shipping quote unavailable", and charged the
 * customer nothing for delivery.
 *
 * Unauthenticated, like its sibling `/tariff/quote`: this reads no stored data
 * and writes none — it is rate-card arithmetic over a body the caller already
 * holds.
 */
export function quoteCartShipping(req: Request, res: Response): void {
  try {
    const quote = quoteCart({
      shippingAddress: req.body?.shippingAddress ?? {},
      items:           req.body?.items,
      serviceLevel:    req.body?.serviceLevel,
      codAmount:       req.body?.codAmount,
    });
    res.json({ data: quote });
  } catch (err) {
    const status = err instanceof TariffCalculationError ? err.status : 500;
    res.status(status).json({ message: (err as Error).message });
  }
}
