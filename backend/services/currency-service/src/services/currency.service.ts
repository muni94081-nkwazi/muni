import { logger } from '../utils/logger.js';
import { CurrencyInfo } from '../models/currency.model.js';
import { getProducer } from '../../../../shared/kafka/producer.js';
import {
  ageSeconds,
  readRates,
  writeRates,
  type RateSnapshot,
  type RateSource,
} from '../cache/rates.cache.js';

// ─── Currency service ─────────────────────────────────────────────────────────
//
// Rates live in a shared Redis snapshot rather than a per-replica Map. They are
// not records this service owns — they belong to Open Exchange Rates and are
// refreshed on a timer — so Redis, not Postgres. See cache/rates.cache.ts.
//
// What that buys, beyond surviving a restart: every replica now quotes the same
// rate. payment-service converts settlement amounts through this endpoint, and
// two pods refreshing on their own schedules could answer the same conversion
// differently.

const INITIAL_SUPPORTED_CURRENCIES: Record<string, Omit<CurrencyInfo, 'rate'>> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£' },
  KES: { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  ZAR: { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  GHS: { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  TZS: { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
  UGX: { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
  RWF: { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw' },
  EGP: { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  MAD: { code: 'MAD', name: 'Moroccan Dirham', symbol: 'MAD' },
  XOF: { code: 'XOF', name: 'West African CFA franc', symbol: 'CFA' },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  AED: { code: 'AED', name: 'United Arab Emirates Dirham', symbol: 'د.إ' },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
};

/**
 * Last-resort rates, used only until the first successful fetch.
 *
 * These were accurate whenever they were written and are now of unknown age.
 * They exist so conversion answers at all rather than failing closed and taking
 * checkout with it — but anything served from them is marked `source:
 * 'fallback'` and logged at error level, because converting real money at
 * rates of unknown vintage should never be silent.
 */
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, KES: 130, NGN: 1100,
  ZAR: 19, GHS: 13.5, TZS: 2580, UGX: 3800, EGP: 47,
  MAD: 10, XOF: 605, CNY: 7.23, INR: 83.5, AED: 3.67, SAR: 3.75,
  RWF: 1300,
};

/** Beyond this, a snapshot is reported stale even though it is still served. */
const STALE_AFTER_SECONDS = 24 * 60 * 60;

export interface RatesView {
  baseCurrency: string;
  rates: Record<string, number>;
  source: RateSource;
  fetchedAt: string;
  ageSeconds: number;
  /** True when the rates are older than a day, or are the built-in fallback. */
  stale: boolean;
}

export class CurrencyService {
  private baseCurrency = process.env.BASE_CURRENCY || 'USD';
  private intervalId?: NodeJS.Timeout;

  private fallbackSnapshot(): RateSnapshot {
    return {
      baseCurrency: this.baseCurrency,
      rates: { ...FALLBACK_RATES },
      // Epoch, so ageSeconds reports it as ancient rather than as just-fetched.
      fetchedAt: new Date(0).toISOString(),
      source: 'fallback',
    };
  }

  /** The current snapshot: shared cache if there is one, fallback otherwise. */
  private async snapshot(): Promise<RateSnapshot> {
    const cached = await readRates();
    if (cached) return cached;

    logger.error(
      '[currency-service] No exchange rates available — serving built-in fallback rates of unknown age. ' +
      'Set OPEN_EXCHANGE_RATES_APP_ID and check REDIS_URL.',
    );
    return this.fallbackSnapshot();
  }

  async startRateRefresh() {
    await this.fetchRates();
    const intervalMs = parseInt(process.env.RATE_REFRESH_INTERVAL_MS || '21600000', 10);
    this.intervalId = setInterval(() => this.fetchRates(), intervalMs);
    this.intervalId.unref?.();
  }

  stopRateRefresh() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async fetchRates() {
    try {
      const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
      if (!appId) {
        // Error, not warn: without this the service converts money at rates
        // nobody has checked since the file was written.
        logger.error(
          '[currency-service] OPEN_EXCHANGE_RATES_APP_ID not set — exchange rates will never be ' +
          'refreshed and conversion will use built-in fallback rates.',
        );
        return;
      }

      const response = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=${this.baseCurrency}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch rates: ${response.statusText}`);
      }

      const data = (await response.json()) as { rates: Record<string, number> };

      // Only the currencies this service supports; the provider returns ~170.
      const rates: Record<string, number> = {};
      for (const code of Object.keys(INITIAL_SUPPORTED_CURRENCIES)) {
        const rate = data.rates[code];
        if (typeof rate === 'number') rates[code] = rate;
      }

      if (Object.keys(rates).length === 0) {
        logger.error('[currency-service] Provider returned no usable rates — keeping previous snapshot');
        return;
      }

      await writeRates({
        baseCurrency: this.baseCurrency,
        rates,
        fetchedAt: new Date().toISOString(),
        source: 'live',
      });

      logger.info('Exchange rates updated successfully');
      await this.publishRatesEvent(rates);
    } catch (error) {
      // The previous snapshot stays in Redis and keeps being served.
      logger.error('Error fetching exchange rates', { error });
    }
  }

  private async publishRatesEvent(rates: Record<string, number>) {
    try {
      const producer = getProducer();
      if (!producer) return;

      await producer.send({
        topic: 'currency-events',
        messages: [
          {
            value: JSON.stringify({
              event: 'rates.updated',
              baseCurrency: this.baseCurrency,
              rates,
              updatedAt: new Date().toISOString(),
            }),
          },
        ],
      });
    } catch (error) {
      logger.error('Failed to publish rates updated event', { error });
    }
  }

  async getAllCurrencies(): Promise<CurrencyInfo[]> {
    const { rates } = await this.snapshot();

    return Object.entries(INITIAL_SUPPORTED_CURRENCIES).map(([code, info]) => ({
      ...info,
      rate: rates[code] ?? FALLBACK_RATES[code] ?? 1,
    }));
  }

  /**
   * Rates plus their provenance.
   *
   * `source`, `ageSeconds` and `stale` are new. Callers previously had no way
   * to tell a rate fetched a minute ago from one hardcoded a year ago.
   */
  async getAllRates(): Promise<RatesView> {
    const snapshot = await this.snapshot();
    const age = ageSeconds(snapshot);

    return {
      baseCurrency: snapshot.baseCurrency,
      rates: snapshot.rates,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      ageSeconds: age,
      stale: snapshot.source === 'fallback' || age > STALE_AFTER_SECONDS,
    };
  }

  async getCurrency(code: string): Promise<CurrencyInfo | undefined> {
    const upper = code.toUpperCase();
    const info = INITIAL_SUPPORTED_CURRENCIES[upper];
    if (!info) return undefined;

    const { rates } = await this.snapshot();
    return { ...info, rate: rates[upper] ?? FALLBACK_RATES[upper] ?? 1 };
  }

  async convert(from: string, to: string, amount: number): Promise<number> {
    from = from.toUpperCase();
    to = to.toUpperCase();

    if (from === to) return amount;

    const snapshot = await this.snapshot();

    const fromRate = snapshot.rates[from];
    const toRate = snapshot.rates[to];

    if (fromRate === undefined) throw new Error(`Unsupported source currency: ${from}`);
    if (toRate === undefined) throw new Error(`Unsupported target currency: ${to}`);

    if (snapshot.source === 'fallback') {
      // Loud on every conversion, not just at startup: this is real money
      // moving at a rate nobody has verified.
      logger.error('[currency-service] Converting with built-in fallback rates', { from, to, amount });
    }

    const amountInBase = amount / fromRate;
    const finalAmount = amountInBase * toRate;

    return Number(finalAmount.toFixed(4));
  }
}

export const currencyService = new CurrencyService();
