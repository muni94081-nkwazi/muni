import { apiClient } from './axios.config';

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  /** Units of this currency per 1 unit of the base currency (USD). */
  rate: number;
}

export interface RatesView {
  baseCurrency: string;
  rates: Record<string, number>;
  /** 'live' | 'cache' | 'fallback' — fallback means rates of unknown vintage. */
  source: string;
  fetchedAt: string;
  ageSeconds: number;
  /** True when older than a day, or when the built-in fallback table was used. */
  stale: boolean;
}

/**
 * currency-service, mounted public at the gateway (`pub('/currencies')`).
 *
 * Rates are quoted against USD — that is the base the service holds, not UGX —
 * so converting UGX→KES goes through USD. See convertAmount in currencySlice.
 *
 * Both endpoints return their payload bare (not enveloped): the gateway
 * forwards proxied bodies with res.send(), so its response-transform wrapper
 * never runs on them.
 */
export const currenciesApi = {
  async list(): Promise<CurrencyInfo[]> {
    const { data } = await apiClient.get<CurrencyInfo[]>('/currencies');
    return Array.isArray(data) ? data : [];
  },

  async rates(): Promise<RatesView> {
    const { data } = await apiClient.get<RatesView>('/currencies/rates');
    return data;
  },
};
