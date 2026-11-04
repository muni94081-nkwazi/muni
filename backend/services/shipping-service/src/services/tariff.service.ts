import { Hub, HUBS, Region, REGIONS } from '../models/region.js';
import { LaneRate, ServiceLevel, TariffLineItem, TariffQuote, TariffQuoteRequest } from '../models/tariff.model.js';

// Volumetric divisor of 5000 is the IATA-style air-cargo standard also used by
// most East African couriers (DHL, Fargo) for parcel dimensional weight.
const VOLUMETRIC_DIVISOR = 5000;
const COD_HANDLING_RATE = 0.015; // 1.5% of cash-on-delivery amount
const COD_HANDLING_MIN_FEE = 1000; // UGX

// Hub → destination-region lane rates (UGX). Same-region lanes are cheapest;
// upcountry legs carry the largest base fee and per-kg surcharge.
const LANE_RATES: Record<Hub, Record<Region, LaneRate>> = {
  KAMPALA_HUB: {
    KAMPALA: { baseFee: 2000, perKgRate: 800, etaDays: 1 },
    ENTEBBE: { baseFee: 3000, perKgRate: 1000, etaDays: 1 },
    JINJA: { baseFee: 4500, perKgRate: 1300, etaDays: 2 },
    UPCOUNTRY: { baseFee: 6000, perKgRate: 1800, etaDays: 3 },
  },
  ENTEBBE_HUB: {
    KAMPALA: { baseFee: 3000, perKgRate: 1000, etaDays: 1 },
    ENTEBBE: { baseFee: 1800, perKgRate: 700, etaDays: 1 },
    JINJA: { baseFee: 5000, perKgRate: 1400, etaDays: 2 },
    UPCOUNTRY: { baseFee: 6500, perKgRate: 1900, etaDays: 3 },
  },
  JINJA_HUB: {
    KAMPALA: { baseFee: 4500, perKgRate: 1300, etaDays: 2 },
    ENTEBBE: { baseFee: 5000, perKgRate: 1400, etaDays: 2 },
    JINJA: { baseFee: 1800, perKgRate: 700, etaDays: 1 },
    UPCOUNTRY: { baseFee: 5500, perKgRate: 1600, etaDays: 2 },
  },
  UPCOUNTRY_HUB: {
    KAMPALA: { baseFee: 6000, perKgRate: 1800, etaDays: 3 },
    ENTEBBE: { baseFee: 6500, perKgRate: 1900, etaDays: 3 },
    JINJA: { baseFee: 5500, perKgRate: 1600, etaDays: 2 },
    UPCOUNTRY: { baseFee: 4000, perKgRate: 1200, etaDays: 3 },
  },
};

const SERVICE_LEVEL_MULTIPLIER: Record<ServiceLevel, number> = {
  standard: 1.0,
  express: 1.6,
  same_day: 2.2,
};

export class TariffCalculationError extends Error {
  status = 400;
}

export class RegionTariffService {
  getLaneRate(originHub: Hub, destinationRegion: Region): LaneRate {
    return LANE_RATES[originHub][destinationRegion];
  }

  listCoverage(): { hubs: readonly Hub[]; regions: readonly Region[] } {
    return { hubs: HUBS, regions: REGIONS };
  }

  quote(input: TariffQuoteRequest): TariffQuote {
    if (!(input.weightKg > 0)) {
      throw new TariffCalculationError('weightKg must be greater than 0');
    }
    if (!LANE_RATES[input.originHub]) {
      throw new TariffCalculationError(`Unknown origin hub: ${input.originHub}`);
    }
    if (!LANE_RATES[input.originHub][input.destinationRegion]) {
      throw new TariffCalculationError(`Unknown destination region: ${input.destinationRegion}`);
    }

    const serviceLevel = input.serviceLevel ?? 'standard';
    if (serviceLevel === 'same_day' && input.originHub !== 'KAMPALA_HUB' && input.destinationRegion !== 'KAMPALA') {
      throw new TariffCalculationError('same_day service is only available within the Kampala metro lane');
    }

    const { l, w, h } = {
      l: input.lengthCm ?? 0,
      w: input.widthCm ?? 0,
      h: input.heightCm ?? 0,
    };
    const volumetricWeightKg = (l * w * h) / VOLUMETRIC_DIVISOR;
    const chargeableWeightKg = Math.max(input.weightKg, volumetricWeightKg);

    const lane = this.getLaneRate(input.originHub, input.destinationRegion);
    const multiplier = SERVICE_LEVEL_MULTIPLIER[serviceLevel];

    const lineItems: TariffLineItem[] = [];
    const baseFee = Math.round(lane.baseFee * multiplier);
    lineItems.push({ label: `Base fee (${input.originHub} → ${input.destinationRegion}, ${serviceLevel})`, amount: baseFee });

    const weightFee = Math.round(Math.ceil(chargeableWeightKg) * lane.perKgRate * multiplier);
    lineItems.push({ label: `Weight fee (${Math.ceil(chargeableWeightKg)}kg chargeable @ ${lane.perKgRate} UGX/kg)`, amount: weightFee });

    let totalFee = baseFee + weightFee;

    if (input.codAmount && input.codAmount > 0) {
      const codFee = Math.max(COD_HANDLING_MIN_FEE, Math.round(input.codAmount * COD_HANDLING_RATE));
      lineItems.push({ label: 'COD handling fee', amount: codFee });
      totalFee += codFee;
    }

    const estimatedDays = serviceLevel === 'same_day' ? 0 : serviceLevel === 'express' ? Math.max(1, lane.etaDays - 1) : lane.etaDays;

    return {
      originHub: input.originHub,
      destinationRegion: input.destinationRegion,
      serviceLevel,
      actualWeightKg: input.weightKg,
      volumetricWeightKg: Math.round(volumetricWeightKg * 100) / 100,
      chargeableWeightKg: Math.round(chargeableWeightKg * 100) / 100,
      lineItems,
      totalFee,
      currency: 'UGX',
      estimatedDays,
    };
  }
}

export const regionTariffService = new RegionTariffService();
