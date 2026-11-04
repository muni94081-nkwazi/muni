import { describe, expect, it, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('@/api/currencies.api', () => ({
  currenciesApi: { rates: vi.fn(), list: vi.fn() },
}));

import { currenciesApi } from '@/api/currencies.api';
import currencyReducer, { convertAmount, fetchRates, setMarket } from '../currencySlice';

const mocked = vi.mocked(currenciesApi);

function makeStore() {
  return configureStore({ reducer: { currency: currencyReducer } });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('convertAmount', () => {
  // Rates are "units per 1 USD", so a cross-rate goes through the base.
  const rates = { USD: 1, UGX: 3800, KES: 130 };

  it('returns the amount unchanged when the currencies match', () => {
    expect(convertAmount(1000, 'UGX', 'UGX', rates)).toBe(1000);
  });

  it('converts through the base currency', () => {
    // 3800 UGX = 1 USD = 130 KES
    expect(convertAmount(3800, 'UGX', 'KES', rates)).toBeCloseTo(130, 6);
  });

  it('returns null rather than guessing when the source rate is missing', () => {
    expect(convertAmount(1000, 'XXX', 'KES', rates)).toBeNull();
  });

  it('returns null rather than guessing when the target rate is missing', () => {
    expect(convertAmount(1000, 'UGX', 'XXX', rates)).toBeNull();
  });

  it('returns null on an empty rate table instead of passing the amount through', () => {
    // Silently showing an unconverted figure under a different currency symbol
    // would misstate a price.
    expect(convertAmount(1000, 'UGX', 'KES', {})).toBeNull();
  });
});

describe('setMarket', () => {
  it('updates the market and its display currency', () => {
    const store = makeStore();
    store.dispatch(setMarket('KE'));

    const state = store.getState().currency;
    expect(state.marketCode).toBe('KE');
    expect(state.displayCurrency).toBe('KES');
  });

  it('persists the choice so it survives a reload', () => {
    const store = makeStore();
    store.dispatch(setMarket('TZ'));
    expect(window.localStorage.getItem('muni_market')).toBe('TZ');
  });

  it('ignores a market that is not configured', () => {
    // localStorage is user-writable and this action is reachable from it, so an
    // unknown code must not put the app into a market that does not exist.
    const store = makeStore();
    const before = store.getState().currency.marketCode;

    store.dispatch(setMarket('ZZ'));

    expect(store.getState().currency.marketCode).toBe(before);
  });
});

describe('fetchRates', () => {
  it('stores rates and clears the stale flag on success', async () => {
    mocked.rates.mockResolvedValue({
      baseCurrency: 'USD',
      rates: { USD: 1, UGX: 3800 },
      source: 'live',
      fetchedAt: new Date().toISOString(),
      ageSeconds: 5,
      stale: false,
    });

    const store = makeStore();
    await store.dispatch(fetchRates());

    const state = store.getState().currency;
    expect(state.status).toBe('succeeded');
    expect(state.rates.UGX).toBe(3800);
    expect(state.stale).toBe(false);
  });

  it('records staleness when the service reports rates of unknown vintage', async () => {
    mocked.rates.mockResolvedValue({
      baseCurrency: 'USD',
      rates: { USD: 1, UGX: 3800 },
      source: 'fallback',
      fetchedAt: new Date(0).toISOString(),
      ageSeconds: 999_999,
      stale: true,
    });

    const store = makeStore();
    await store.dispatch(fetchRates());

    expect(store.getState().currency.stale).toBe(true);
  });

  it('fails without rates rather than inventing them', async () => {
    mocked.rates.mockRejectedValue(new Error('down'));

    const store = makeStore();
    await store.dispatch(fetchRates());

    const state = store.getState().currency;
    expect(state.status).toBe('failed');
    expect(state.rates).toEqual({});
  });
});
