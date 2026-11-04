import { describe, it, expect } from '@jest/globals';
import { regionTariffService, TariffCalculationError } from '../services/tariff.service.js';

describe('Region Tariff Engine', () => {
  it('charges by actual weight when it exceeds volumetric weight', () => {
    const quote = regionTariffService.quote({
      originHub: 'KAMPALA_HUB',
      destinationRegion: 'KAMPALA',
      weightKg: 5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10, // volumetric = 1000/5000 = 0.2kg, far below actual
    });

    expect(quote.actualWeightKg).toBe(5);
    expect(quote.volumetricWeightKg).toBe(0.2);
    expect(quote.chargeableWeightKg).toBe(5);
  });

  it('charges by volumetric weight when the package is bulky but light', () => {
    const quote = regionTariffService.quote({
      originHub: 'KAMPALA_HUB',
      destinationRegion: 'KAMPALA',
      weightKg: 1,
      lengthCm: 50,
      widthCm: 50,
      heightCm: 50, // volumetric = 125000/5000 = 25kg
    });

    expect(quote.chargeableWeightKg).toBe(25);
    expect(quote.chargeableWeightKg).toBeGreaterThan(quote.actualWeightKg);
  });

  it('applies higher fees for upcountry lanes than intra-Kampala lanes', () => {
    const intraKampala = regionTariffService.quote({ originHub: 'KAMPALA_HUB', destinationRegion: 'KAMPALA', weightKg: 2 });
    const upcountry = regionTariffService.quote({ originHub: 'KAMPALA_HUB', destinationRegion: 'UPCOUNTRY', weightKg: 2 });

    expect(upcountry.totalFee).toBeGreaterThan(intraKampala.totalFee);
    expect(upcountry.estimatedDays).toBeGreaterThan(intraKampala.estimatedDays);
  });

  it('adds a COD handling fee proportional to the collectable amount', () => {
    const withoutCod = regionTariffService.quote({ originHub: 'JINJA_HUB', destinationRegion: 'JINJA', weightKg: 1 });
    const withCod = regionTariffService.quote({ originHub: 'JINJA_HUB', destinationRegion: 'JINJA', weightKg: 1, codAmount: 200000 });

    expect(withCod.totalFee).toBeGreaterThan(withoutCod.totalFee);
    expect(withCod.lineItems.some((li) => li.label === 'COD handling fee')).toBe(true);
  });

  it('rejects same_day service outside the Kampala metro lane', () => {
    expect(() =>
      regionTariffService.quote({ originHub: 'UPCOUNTRY_HUB', destinationRegion: 'UPCOUNTRY', weightKg: 1, serviceLevel: 'same_day' }),
    ).toThrow(TariffCalculationError);
  });

  it('rejects a non-positive weight', () => {
    expect(() => regionTariffService.quote({ originHub: 'KAMPALA_HUB', destinationRegion: 'KAMPALA', weightKg: 0 })).toThrow(
      TariffCalculationError,
    );
  });
});
