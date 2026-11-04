import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { convertAmount, fetchRates, setMarket } from '@/store/slices/currencySlice';
import { MARKETS, SETTLEMENT_CURRENCY, findMarket } from '@/config/markets';
import { formatMoney } from '@/utils/formatters';

/**
 * Display-currency access for components that render prices.
 *
 * Catalogue amounts reach the client in the settlement currency (UGX). This
 * hook converts them for display only — it never changes what a shopper is
 * charged. Checkout and payment deliberately keep quoting UGX, because UGX is
 * what MTN MoMo and Airtel Money actually debit; showing a KES total on a
 * screen that charges shillings would be a misstatement, not a feature.
 *
 * `format()` degrades safely: if rates have not loaded, or the target currency
 * is missing from the table, it falls back to formatting the original UGX
 * amount rather than inventing a converted figure.
 */
export function useCurrency() {
  const dispatch = useAppDispatch();
  const { marketCode, displayCurrency, rates, status, stale } = useAppSelector(
    (state) => state.currency,
  );

  // One fetch per session. `status === 'idle'` is the guard, so a failed fetch
  // is not retried on every mount of every price.
  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchRates());
    }
  }, [dispatch, status]);

  const convert = useCallback(
    (amount: number, from: string = SETTLEMENT_CURRENCY): number | null =>
      convertAmount(amount, from, displayCurrency, rates),
    [displayCurrency, rates],
  );

  const format = useCallback(
    (amount: number, from: string = SETTLEMENT_CURRENCY): string => {
      if (displayCurrency === from) return formatMoney(amount, from);

      const converted = convert(amount, from);
      if (converted === null) {
        // No usable rate — show the real, settled amount rather than a guess.
        return formatMoney(amount, from);
      }
      return formatMoney(converted, displayCurrency);
    },
    [convert, displayCurrency],
  );

  const changeMarket = useCallback((code: string) => dispatch(setMarket(code)), [dispatch]);

  return {
    market: findMarket(marketCode) ?? MARKETS[0],
    markets: MARKETS,
    displayCurrency,
    settlementCurrency: SETTLEMENT_CURRENCY,
    /** True when displayed prices are converted rather than settled amounts. */
    isConverted: displayCurrency !== SETTLEMENT_CURRENCY,
    ratesReady: status === 'succeeded',
    ratesStale: stale,
    convert,
    format,
    changeMarket,
  };
}
