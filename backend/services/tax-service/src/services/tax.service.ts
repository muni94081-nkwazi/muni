import { logger } from '../utils/logger.js';

interface TaxRule {
  standard: number;
  reduced?: number;
  zero?: string[]; // categories with 0% tax
  reducedCategories?: string[];
}

const EU_COUNTRIES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

const TAX_RULES: Record<string, TaxRule> = {
  GB: { standard: 0.20, zero: ['children_clothing', 'food', 'books'] },
  US: { standard: 0.06 },
  KE: { standard: 0.16 },
  NG: { standard: 0.075 },
  ZA: { standard: 0.15 },
  GH: { standard: 0.125 },
  // Primary markets. Their absence meant every Ugandan and Zambian order was
  // taxed at the 0% fallback below.
  UG: { standard: 0.18, zero: ['food', 'medical', 'agricultural', 'books'] }, // Uganda VAT Act
  ZM: { standard: 0.16, zero: ['food', 'medical', 'agricultural', 'books'] }, // Zambia VAT Act
  TZ: { standard: 0.18 },
  RW: { standard: 0.18 },
};

for (const country of EU_COUNTRIES) {
  TAX_RULES[country] = { standard: 0.20, reduced: 0.05, reducedCategories: ['food', 'books', 'medical'] };
}

const US_STATES: Record<string, number> = {
  CA: 0.1025,
  NY: 0.08875,
  TX: 0.0825,
  FL: 0.070,
};

export class TaxService {
  getRates() {
    return TAX_RULES;
  }

  getRatesForCountry(countryCode: string) {
    return TAX_RULES[countryCode.toUpperCase()] || { standard: 0 };
  }

  calculateTax(countryCode: string, stateCode: string | undefined, items: any[]) {
    countryCode = countryCode.toUpperCase();
    
    let baseRule = this.getRatesForCountry(countryCode);
    let standardRate = baseRule.standard;

    if (countryCode === 'US' && stateCode) {
      stateCode = stateCode.toUpperCase();
      standardRate = US_STATES[stateCode] || standardRate;
    }

    let subtotal = 0;
    let totalTax = 0;

    const processedItems = items.map(item => {
      let taxRate = standardRate;
      
      if (baseRule.zero?.includes(item.category)) {
        taxRate = 0;
      } else if (baseRule.reduced && baseRule.reducedCategories?.includes(item.category)) {
        taxRate = baseRule.reduced;
      }

      const itemTotal = item.price * item.quantity;
      const taxAmount = itemTotal * taxRate;
      
      subtotal += itemTotal;
      totalTax += taxAmount;
      
      return {
        ...item,
        taxRate,
        taxAmount: Number(taxAmount.toFixed(2))
      };
    });

    return {
      items: processedItems,
      subtotal: Number(subtotal.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      total: Number((subtotal + totalTax).toFixed(2))
    };
  }

  validateTaxNumber(countryCode: string, taxNumber: string) {
    countryCode = countryCode.toUpperCase();
    if (EU_COUNTRIES.includes(countryCode) || countryCode === 'GB') {
      const isValid = taxNumber.startsWith(countryCode) && taxNumber.length > 5;
      return { valid: isValid, countryCode, taxNumber };
    }
    return { valid: true, countryCode, taxNumber };
  }
}

export const taxService = new TaxService();
