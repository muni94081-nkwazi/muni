export interface ShippingDestination {
  address: string;
  city: string;
  district?: string;
  country?: string;
}

export interface ShippingPackageItem {
  productId: string;
  variantId?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  quantity: number;
}

export interface VendorShippingCalculationRequest {
  destination: ShippingDestination;
  itemsByVendor: Array<{
    vendorId: string;
    originCity?: string;
    items: ShippingPackageItem[];
  }>;
  preferredServiceLevel?: 'standard' | 'express' | 'same_day';
}

export interface VendorShippingRate {
  vendorId: string;
  provider: string;
  serviceLevel: 'standard' | 'express' | 'same_day';
  shippingFee: number;
  currency: string;
  totalWeightKg: number;
  estimatedDays: number;
  estimatedDeliveryDate: string;
}

export interface ShippingCalculationResult {
  vendorRates: VendorShippingRate[];
  totalShippingFee: number;
  currency: string;
}

// ── Region Multipliers & Fallback Rates (East Africa / Uganda Localized) ─────

function getRegionMultiplier(city: string): { multiplier: number; baseDays: number } {
  const normalizedCity = city.toLowerCase().trim();
  if (normalizedCity.includes('kampala') || normalizedCity.includes('wakiso')) {
    return { multiplier: 1.0, baseDays: 1 };
  } else if (normalizedCity.includes('entebbe') || normalizedCity.includes('mukono')) {
    return { multiplier: 1.2, baseDays: 1 };
  } else if (['jinja', 'mbale', 'mbarara', 'gulu', 'lira', 'kasese', 'fort portal', 'masaka'].some((c) => normalizedCity.includes(c))) {
    return { multiplier: 1.8, baseDays: 2 };
  } else if (['nairobi', 'kigali', 'dar es salaam', 'mombasa', 'juba'].some((c) => normalizedCity.includes(c))) {
    return { multiplier: 3.5, baseDays: 4 };
  } else {
    return { multiplier: 2.2, baseDays: 3 }; // General Upcountry
  }
}

export class ShippingCalculationService {
  async calculateRates(input: VendorShippingCalculationRequest): Promise<ShippingCalculationResult> {
    const destinationCity = input.destination.city || 'Kampala';
    const { multiplier, baseDays } = getRegionMultiplier(destinationCity);
    const preferredLevel = input.preferredServiceLevel || 'standard';

    const vendorRates: VendorShippingRate[] = [];
    let totalShippingFee = 0;

    for (const vendorGroup of input.itemsByVendor) {
      const vendorId = vendorGroup.vendorId || 'muni-store';
      
      // Calculate total weight (default 0.5kg per item if unprovided)
      const totalWeightKg = vendorGroup.items.reduce((sum, item) => {
        const itemWeight = item.weightKg ?? 0.5;
        return sum + itemWeight * item.quantity;
      }, 0);

      // Base rate calculation logic modeled after Shippo/EasyPost rate tiers
      const baseFee = 3500; // Base fee per package (UGX)
      const weightFee = Math.ceil(totalWeightKg) * 1500; // 1,500 UGX per kg
      
      let levelMultiplier = 1.0;
      let days = baseDays;

      if (preferredLevel === 'express') {
        levelMultiplier = 1.6;
        days = Math.max(1, baseDays - 1);
      } else if (preferredLevel === 'same_day' && (destinationCity.toLowerCase().includes('kampala') || destinationCity.toLowerCase().includes('wakiso'))) {
        levelMultiplier = 2.2;
        days = 0;
      }

      const vendorShippingFee = Math.round((baseFee + weightFee) * multiplier * levelMultiplier);
      totalShippingFee += vendorShippingFee;

      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + days);

      vendorRates.push({
        vendorId,
        provider: 'MUNI Logistics (EasyPost Partner)',
        serviceLevel: preferredLevel,
        shippingFee: vendorShippingFee,
        currency: 'UGX',
        totalWeightKg: Math.round(totalWeightKg * 100) / 100,
        estimatedDays: days,
        estimatedDeliveryDate: deliveryDate.toISOString().split('T')[0],
      });
    }

    return {
      vendorRates,
      totalShippingFee,
      currency: 'UGX',
    };
  }
}

export const shippingCalculationService = new ShippingCalculationService();
