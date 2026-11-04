import { Request, Response } from 'express';
import { taxService } from '../services/tax.service.js';
import { CalculateTaxRequestSchema, ValidateTaxNumberSchema } from '../models/tax.model.js';

export const calculateTax = (req: Request, res: Response) => {
  const result = CalculateTaxRequestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(422).json({ message: 'Validation failed', issues: result.error.issues });
    return;
  }
  
  const { countryCode, stateCode, items } = result.data;
  const computation = taxService.calculateTax(countryCode, stateCode, items);
  
  res.json(computation);
};

export const getRates = (_req: Request, res: Response) => {
  res.json(taxService.getRates());
};

export const getCountryRates = (req: Request, res: Response) => {
  const { countryCode } = req.params;
  const rates = taxService.getRatesForCountry(countryCode);
  res.json(rates);
};

export const validateTaxNumber = (req: Request, res: Response) => {
  const result = ValidateTaxNumberSchema.safeParse(req.body);
  if (!result.success) {
    res.status(422).json({ message: 'Validation failed', issues: result.error.issues });
    return;
  }
  
  const { countryCode, taxNumber } = result.data;
  res.json(taxService.validateTaxNumber(countryCode, taxNumber));
};
