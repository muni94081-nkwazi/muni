/**
 * Markets the storefront can be browsed in.
 *
 * Every `currency` here must be one currency-service actually quotes — see the
 * supported list in backend/services/currency-service/src/services/currency.service.ts.
 * A market whose currency the service cannot price would display unconverted
 * amounts under the wrong symbol, so adding one here without adding it there
 * is a bug.
 *
 * `settlementCurrency` is what payments are actually taken in. It is UGX for
 * every market: the payment rails wired up are MTN MoMo and Airtel Money,
 * both Ugandan. Display currency and settlement currency are therefore
 * different concepts and are kept as separate fields on purpose — checkout
 * must never quote a total in a currency it cannot charge.
 */
export interface Market {
  code: string;
  name: string;
  flag: string;
  /** Currency prices are DISPLAYED in for this market. */
  currency: string;
}

export const MARKETS: Market[] = [
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', currency: 'UGX' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', currency: 'KES' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', currency: 'TZS' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼', currency: 'RWF' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', currency: 'GHS' },
];

export const DEFAULT_MARKET: Market = MARKETS[0];

/** The currency every order is actually charged in, regardless of display market. */
export const SETTLEMENT_CURRENCY = 'UGX';

export function findMarket(code: string): Market | undefined {
  return MARKETS.find((m) => m.code === code);
}
