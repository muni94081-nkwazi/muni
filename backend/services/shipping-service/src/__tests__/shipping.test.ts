import { describe, it, expect } from '@jest/globals';
import { shippingCalculationService } from '../services/shipping.service.js';

describe('Shipping Calculation Service', () => {
  it('calculates shipping rates per vendor based on destination, weight, and service level', async () => {
    const result = await shippingCalculationService.calculateRates({
      destination: {
        address: 'Kampala Road',
        city: 'Kampala',
        country: 'Uganda',
      },
      itemsByVendor: [
        {
          vendorId: 'vendor-A',
          items: [{ productId: 'p1', weightKg: 1.0, quantity: 2 }], // 2kg
        },
        {
          vendorId: 'vendor-B',
          items: [{ productId: 'p2', weightKg: 0.5, quantity: 1 }], // 0.5kg
        },
      ],
      preferredServiceLevel: 'standard',
    });

    expect(result.vendorRates).toHaveLength(2);
    expect(result.totalShippingFee).toBeGreaterThan(0);

    const vendorARate = result.vendorRates.find((r) => r.vendorId === 'vendor-A')!;
    const vendorBRate = result.vendorRates.find((r) => r.vendorId === 'vendor-B')!;

    expect(vendorARate).toBeDefined();
    expect(vendorARate.totalWeightKg).toBe(2);
    expect(vendorBRate).toBeDefined();
    expect(vendorBRate.totalWeightKg).toBe(0.5);

    // Vendor A with heavier package should have higher shipping fee than Vendor B
    expect(vendorARate.shippingFee).toBeGreaterThan(vendorBRate.shippingFee);
  });

  it('applies upcountry regional multipliers for cities outside Kampala', async () => {
    const kampalaResult = await shippingCalculationService.calculateRates({
      destination: { address: 'City Center', city: 'Kampala' },
      itemsByVendor: [{ vendorId: 'v1', items: [{ productId: 'p1', weightKg: 1.0, quantity: 1 }] }],
    });

    const upcountryResult = await shippingCalculationService.calculateRates({
      destination: { address: 'Main St', city: 'Gulu' },
      itemsByVendor: [{ vendorId: 'v1', items: [{ productId: 'p1', weightKg: 1.0, quantity: 1 }] }],
    });

    expect(upcountryResult.totalShippingFee).toBeGreaterThan(kampalaResult.totalShippingFee);
  });
});
