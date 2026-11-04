import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { currenciesApi, type RatesView } from '@/api/currencies.api';
import { DEFAULT_CURRENCY, MARKET_KEY } from '@/utils/constants';
import { safeGetItem, safeSetItem } from '@/utils/helpers';
import { MARKETS, DEFAULT_MARKET, findMarket, type Market } from '@/config/markets';

interface CurrencyState {
  /** Market code the shopper has chosen, e.g. 'UG'. */
  marketCode: string;
  /** Currency the UI displays prices in — derived from the market. */
  displayCurrency: string;
  /** Units of each currency per 1 unit of `base`. */
  rates: Record<string, number>;
  base: string;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** True when the service served rates of unknown or stale vintage. */
  stale: boolean;
  error: string | null;
}

/**
 * The stored market is validated against the configured list before it is
 * trusted. localStorage is user-writable, so a hand-edited value must not be
 * able to put the app into a market that does not exist.
 */
function restoreMarket(): Market {
  const stored = safeGetItem(MARKET_KEY);
  return (stored && findMarket(stored)) || DEFAULT_MARKET;
}

const initial = restoreMarket();

const initialState: CurrencyState = {
  marketCode: initial.code,
  displayCurrency: initial.currency,
  rates: {},
  base: 'USD',
  status: 'idle',
  stale: false,
  error: null,
};

export const fetchRates = createAsyncThunk('currency/fetchRates', async (_, { rejectWithValue }) => {
  try {
    return await currenciesApi.rates();
  } catch {
    // The message is deliberately generic and unused by the UI — a rates
    // failure is handled by falling back to the settlement currency, not by
    // showing an error.
    return rejectWithValue('rates unavailable');
  }
});

const currencySlice = createSlice({
  name: 'currency',
  initialState,
  reducers: {
    /**
     * Switch market. Persists immediately so the choice survives a reload —
     * this is the whole point of the selector, and the previous footer's
     * version wrote nothing anywhere.
     */
    setMarket(state, action: PayloadAction<string>) {
      const market = findMarket(action.payload);
      if (!market) return;

      state.marketCode = market.code;
      state.displayCurrency = market.currency;
      safeSetItem(MARKET_KEY, market.code);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRates.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchRates.fulfilled, (state, action: PayloadAction<RatesView>) => {
        state.status = 'succeeded';
        state.rates = action.payload.rates ?? {};
        state.base = action.payload.baseCurrency ?? 'USD';
        state.stale = Boolean(action.payload.stale);
        state.error = null;
      })
      .addCase(fetchRates.rejected, (state) => {
        state.status = 'failed';
        state.error = 'rates unavailable';
      });
  },
});

/**
 * Convert between currencies through the base.
 *
 * Returns `null` — never a guessed number — when either leg is missing from
 * the rate table. Callers render the original settlement amount in that case.
 * Silently returning the unconverted figure under a different currency symbol
 * would misstate a price.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  if (from === to) return amount;

  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return null;

  // rates are "units per 1 base", so: amount → base → target.
  return (amount / fromRate) * toRate;
}

export const MARKET_OPTIONS = MARKETS;
export const { setMarket } = currencySlice.actions;
export default currencySlice.reducer;

export { DEFAULT_CURRENCY };
