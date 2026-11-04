import { beforeEach, describe, it, expect } from '@jest/globals';
import { CurrencyService } from '../services/currency.service.js';
import { resetRatesCacheForTests, writeRates } from '../cache/rates.cache.js';

// Replaces a suite written against a `conversion.service.js` module that does
// not exist — it imported a non-existent path and mocked `node-fetch`, which
// this service does not use, so it had never run.
//
// Rates now come from a shared snapshot instead of a per-instance Map. REDIS_URL
// is unset in tests, so the cache falls back to its in-process memo: writeRates
// seeds it, and with nothing seeded the service serves its built-in fallback
// table. Both paths are exercised below.

const LIVE_RATES = {
  USD: 1, EUR: 0.92, GBP: 0.79, KES: 130, UGX: 3800,
};

beforeEach(() => {
  resetRatesCacheForTests();
});

async function seedLiveRates() {
  await writeRates({
    baseCurrency: 'USD',
    rates: LIVE_RATES,
    fetchedAt: new Date().toISOString(),
    source: 'live',
  });
}

describe('CurrencyService.convert', () => {
  const currency = new CurrencyService();

  beforeEach(seedLiveRates);

  it('returns the amount unchanged when converting to the same currency', async () => {
    // Short-circuits before any rate lookup, so it also holds for a currency
    // whose rate has not been refreshed.
    expect(await currency.convert('USD', 'USD', 250)).toBe(250);
  });

  it('converts from the base currency using the target rate', async () => {
    expect(await currency.convert('USD', 'UGX', 1)).toBe(3800);
  });

  it('converts back to the base currency', async () => {
    expect(await currency.convert('UGX', 'USD', 3800)).toBe(1);
  });

  it('converts between two non-base currencies via the base', async () => {
    // UGX → USD → KES: (3800 / 3800) * 130.
    expect(await currency.convert('UGX', 'KES', 3800)).toBe(130);
  });

  it('is case-insensitive about currency codes', async () => {
    expect(await currency.convert('usd', 'ugx', 1)).toBe(await currency.convert('USD', 'UGX', 1));
  });

  it('rounds to four decimal places', async () => {
    const result = await currency.convert('USD', 'EUR', 1);
    expect(result).toBe(0.92);
    expect(String(result).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it('names the offending side when the source currency is unsupported', async () => {
    await expect(currency.convert('XYZ', 'USD', 100)).rejects.toThrow('Unsupported source currency: XYZ');
  });

  it('names the offending side when the target currency is unsupported', async () => {
    await expect(currency.convert('USD', 'XYZ', 100)).rejects.toThrow('Unsupported target currency: XYZ');
  });
});

describe('CurrencyService lookups', () => {
  const currency = new CurrencyService();

  beforeEach(seedLiveRates);

  it('exposes the supported currency list', async () => {
    const all = await currency.getAllCurrencies();
    expect(all.length).toBeGreaterThan(0);
  });

  it('looks up a currency case-insensitively', async () => {
    expect(await currency.getCurrency('ugx')).toBeDefined();
    expect(await currency.getCurrency('UGX')).toBeDefined();
  });

  it('returns undefined for an unknown code rather than throwing', async () => {
    expect(await currency.getCurrency('XYZ')).toBeUndefined();
  });

  it('reports rates against the declared base currency', async () => {
    const { baseCurrency, rates } = await currency.getAllRates();
    expect(rates[baseCurrency]).toBe(1);
  });
});

describe('rate provenance', () => {
  const currency = new CurrencyService();

  it('marks a freshly written snapshot as live and not stale', async () => {
    await seedLiveRates();

    const view = await currency.getAllRates();
    // 'live' rather than 'cache' because REDIS_URL is unset here, so the read
    // comes back from this process's own memo. A snapshot fetched by another
    // replica and read out of Redis reports 'cache' instead — the distinction
    // is which process did the fetching, not how fresh it is.
    expect(view.source).toBe('live');
    expect(view.stale).toBe(false);
    expect(view.ageSeconds).toBeLessThan(5);
  });

  it('marks built-in rates as fallback and stale when nothing has been fetched', async () => {
    // The whole point of the change: callers previously could not tell a rate
    // fetched a minute ago from one hardcoded whenever the file was written.
    const view = await currency.getAllRates();

    expect(view.source).toBe('fallback');
    expect(view.stale).toBe(true);
  });

  it('still converts on the fallback table rather than failing closed', async () => {
    // Refusing to convert would take checkout down; the signal is the loud
    // log and the `fallback` marker, not an exception.
    expect(await currency.convert('USD', 'UGX', 1)).toBe(3800);
  });

  it('serves a written snapshot in preference to the fallback', async () => {
    await writeRates({
      baseCurrency: 'USD',
      rates: { ...LIVE_RATES, UGX: 4000 },
      fetchedAt: new Date().toISOString(),
      source: 'live',
    });

    expect(await currency.convert('USD', 'UGX', 1)).toBe(4000);
  });

  it('reports an old snapshot as stale while still serving it', async () => {
    await writeRates({
      baseCurrency: 'USD',
      rates: LIVE_RATES,
      fetchedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      source: 'live',
    });

    const view = await currency.getAllRates();
    expect(view.stale).toBe(true);
    expect(view.ageSeconds).toBeGreaterThan(86_400);
    expect(await currency.convert('USD', 'UGX', 1)).toBe(3800);
  });
});

describe('rate refresh lifecycle', () => {
  it('stops cleanly when no refresh timer was ever started', () => {
    const currency = new CurrencyService();
    expect(() => currency.stopRateRefresh()).not.toThrow();
  });

  it('does nothing when no provider key is configured', async () => {
    // Without OPEN_EXCHANGE_RATES_APP_ID there is nothing to fetch; the
    // service must not write a snapshot claiming otherwise.
    delete process.env.OPEN_EXCHANGE_RATES_APP_ID;
    const currency = new CurrencyService();

    await currency.fetchRates();

    expect((await currency.getAllRates()).source).toBe('fallback');
  });
});
