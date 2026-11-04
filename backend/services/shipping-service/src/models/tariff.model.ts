import { Hub, Region } from './region.js';

export type ServiceLevel = 'standard' | 'express' | 'same_day';

export interface TariffQuoteRequest {
  originHub: Hub;
  destinationRegion: Region;
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  serviceLevel?: ServiceLevel;
  codAmount?: number;
}

export interface TariffLineItem {
  label: string;
  amount: number;
}

export interface TariffQuote {
  originHub: Hub;
  destinationRegion: Region;
  serviceLevel: ServiceLevel;
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  lineItems: TariffLineItem[];
  totalFee: number;
  currency: string;
  estimatedDays: number;
}

export interface LaneRate {
  baseFee: number;
  perKgRate: number;
  etaDays: number;
}
