import { describe, it, expect } from '@jest/globals';
import { quoteCart } from '../services/cart-quote.service.js';
import { TariffCalculationError } from '../services/tariff.service.js';

// ─── Quoting a basket ─────────────────────────────────────────────────────────
//
// checkout-service has always called POST /api/v1/shipping/quote. This service
// exposed no such route, so the call 404'd, checkout swallowed it as "shipping
// quote unavailable", and charged 0. Every order taken through checkout shipped
// free while the rate card sat unused.
//
// These cover what the bridge has to get right: which region an address lands
// in, one parcel per seller, and a weight for goods the catalogue never weighed.

const KAMPALA = { city: 'Kampala' };
const line = (over: Partial<Parameters<typeof quoteCart>[0]['items'][number]> = {}) => ({
  sellerId: 'seller-a', quantity: 1, weightKg: 1, ...over,
});

describe('a basket is priced against the same rate card as a parcel', () => {
  it('returns a fee, a currency and an ETA', () => {
    const quote = quoteCart({ shippingAddress: KAMPALA, items: [line()] });

    expect(quote.cost).toBeGreaterThan(0);
    expect(quote.currency).toBe('UGX');
    expect(quote.estimatedDays).toBeGreaterThanOrEqual(0);
  });

  it('resolves the destination region from the city', () => {
    expect(quoteCart({ shippingAddress: { city: 'Kampala' }, items: [line()] }).destinationRegion).toBe('KAMPALA');
    expect(quoteCart({ shippingAddress: { city: 'Entebbe' }, items: [line()] }).destinationRegion).toBe('ENTEBBE');
    expect(quoteCart({ shippingAddress: { city: 'Jinja' },   items: [line()] }).destinationRegion).toBe('JINJA');
  });

  it('falls back to the district when the address names no city', () => {
    const quote = quoteCart({ shippingAddress: { district: 'Jinja' }, items: [line()] });
    expect(quote.destinationRegion).toBe('JINJA');
  });

  it('places an unrecognised town upcountry rather than guessing a cheaper lane', () => {
    const quote = quoteCart({ shippingAddress: { city: 'Kotido' }, items: [line()] });
    expect(quote.destinationRegion).toBe('UPCOUNTRY');
  });

  it('costs more to send the same parcel upcountry than across Kampala', () => {
    const near = quoteCart({ shippingAddress: { city: 'Kampala' }, items: [line()] });
    const far  = quoteCart({ shippingAddress: { city: 'Kotido' },  items: [line()] });
    expect(far.cost).toBeGreaterThan(near.cost);
  });

  it('charges more for a heavier basket', () => {
    const light = quoteCart({ shippingAddress: KAMPALA, items: [line({ weightKg: 1 })] });
    const heavy = quoteCart({ shippingAddress: KAMPALA, items: [line({ weightKg: 20 })] });
    expect(heavy.cost).toBeGreaterThan(light.cost);
  });

  it('counts quantity towards the weight', () => {
    const one  = quoteCart({ shippingAddress: KAMPALA, items: [line({ quantity: 1, weightKg: 3 })] });
    const five = quoteCart({ shippingAddress: KAMPALA, items: [line({ quantity: 5, weightKg: 3 })] });
    expect(five.parcels[0].weightKg).toBe(15);
    expect(five.cost).toBeGreaterThan(one.cost);
  });
});

describe('one parcel per seller', () => {
  const twoSellers = [
    line({ sellerId: 'seller-a', weightKg: 2 }),
    line({ sellerId: 'seller-b', weightKg: 2 }),
  ];

  it('quotes each seller separately, because they dispatch separately', () => {
    const quote = quoteCart({ shippingAddress: KAMPALA, items: twoSellers });
    expect(quote.parcels).toHaveLength(2);
    expect(Object.keys(quote.perSeller).sort()).toEqual(['seller-a', 'seller-b']);
  });

  it('carries a base fee per seller rather than one for the basket', () => {
    // A single 4kg parcel is cheaper than two 2kg parcels: one base fee, not two.
    const together = quoteCart({
      shippingAddress: KAMPALA,
      items: [line({ sellerId: 'seller-a', weightKg: 4 })],
    });
    const apart = quoteCart({ shippingAddress: KAMPALA, items: twoSellers });
    expect(apart.cost).toBeGreaterThan(together.cost);
  });

  it('splits to exactly what is charged, with no rounding drift', () => {
    const quote = quoteCart({ shippingAddress: KAMPALA, items: twoSellers });
    const sum = Object.values(quote.perSeller).reduce((t, v) => t + v, 0);
    expect(sum).toBe(quote.cost);
  });

  it('reports the slowest parcel as the basket ETA', () => {
    const quote = quoteCart({ shippingAddress: KAMPALA, items: twoSellers });
    expect(quote.estimatedDays).toBe(Math.max(...quote.parcels.map((p) => p.estimatedDays)));
  });

  it('charges the cash-handling fee once for the order, not once per seller', () => {
    const withCod    = quoteCart({ shippingAddress: KAMPALA, items: twoSellers, codAmount: 100000 });
    const withoutCod = quoteCart({ shippingAddress: KAMPALA, items: twoSellers });
    // 1.5% of 100,000 = 1,500, applied to exactly one parcel.
    expect(withCod.cost - withoutCod.cost).toBe(1500);
  });
});

describe('goods the catalogue never weighed', () => {
  it('still produces a quote instead of failing the checkout', () => {
    // The engine rejects a weight of 0 outright, so an unweighed basket would
    // otherwise throw and be swallowed as "unavailable" — free delivery again.
    const quote = quoteCart({ shippingAddress: KAMPALA, items: [line({ weightKg: null })] });
    expect(quote.cost).toBeGreaterThan(0);
  });

  it('says how many lines rest on the assumed weight', () => {
    const quote = quoteCart({
      shippingAddress: KAMPALA,
      items: [line({ weightKg: null }), line({ weightKg: 2 }), line({ weightKg: undefined })],
    });
    expect(quote.estimatedLines).toBe(2);
  });

  it('reports nothing estimated when every line is weighed', () => {
    const quote = quoteCart({ shippingAddress: KAMPALA, items: [line({ weightKg: 2 })] });
    expect(quote.estimatedLines).toBe(0);
  });

  it('charges a bulky light parcel by volume, as the rate card intends', () => {
    const flat  = quoteCart({
      shippingAddress: KAMPALA,
      items: [line({ weightKg: 1, lengthCm: 100, widthCm: 100, heightCm: 100 })],
    });
    const small = quoteCart({ shippingAddress: KAMPALA, items: [line({ weightKg: 1 })] });
    expect(flat.cost).toBeGreaterThan(small.cost);
  });

  it('ignores a partial set of dimensions rather than understating volume', () => {
    const partial = quoteCart({
      shippingAddress: KAMPALA,
      items: [line({ weightKg: 1, lengthCm: 100, widthCm: 100 })], // no height
    });
    const none = quoteCart({ shippingAddress: KAMPALA, items: [line({ weightKg: 1 })] });
    expect(partial.cost).toBe(none.cost);
  });
});

describe('what it refuses to quote', () => {
  it('refuses an empty basket', () => {
    expect(() => quoteCart({ shippingAddress: KAMPALA, items: [] }))
      .toThrow(TariffCalculationError);
  });

  it('refuses an address with neither city nor district', () => {
    expect(() => quoteCart({ shippingAddress: {}, items: [line()] }))
      .toThrow(TariffCalculationError);
  });

  it('refuses a fractional or zero quantity', () => {
    expect(() => quoteCart({ shippingAddress: KAMPALA, items: [line({ quantity: 0 })] }))
      .toThrow(TariffCalculationError);
    expect(() => quoteCart({ shippingAddress: KAMPALA, items: [line({ quantity: 1.5 })] }))
      .toThrow(TariffCalculationError);
  });

  it('attributes a line naming no seller rather than dropping it', () => {
    const quote = quoteCart({ shippingAddress: KAMPALA, items: [line({ sellerId: undefined })] });
    expect(Object.keys(quote.perSeller)).toEqual(['muni-store']);
    expect(quote.cost).toBeGreaterThan(0);
  });
});
