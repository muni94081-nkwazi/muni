import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ─── Currency Conversion Client (currency-service) ─────────────────────────────
//
// MTN and Airtel's Uganda APIs only accept UGX. Orders/payments placed in
// any other currency must be converted to UGX before we call a driver.
//
// Unlike most cross-service calls in this codebase, conversion failures are
// NOT swallowed — an incorrect exchange rate is a financial-correctness bug,
// not a degraded-but-safe-to-continue situation. Callers get a typed error
// and should fail the payment initiation rather than guess an amount.

export class CurrencyConversionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'CurrencyConversionError';
  }
}

export interface ConversionResult {
  amount: number; // converted amount, in `toCurrency`
  rate: number; // effective rate applied (toAmount / fromAmount)
  fromCurrency: string;
  toCurrency: string;
}

interface ConvertResponseBody {
  from: string;
  to: string;
  amount: number;
  result: number;
}

/**
 * Convert `amount` from `fromCurrency` into the platform's settlement
 * currency (UGX by default). Returns a 1:1 no-op result if already in the
 * settlement currency — no network call made.
 */
export async function convertToSettlementCurrency(
  amount: number,
  fromCurrency: string,
): Promise<ConversionResult> {
  const to = env.currency.settlementCurrency.toUpperCase();
  const from = fromCurrency.toUpperCase();

  if (from === to) {
    return { amount, rate: 1, fromCurrency: from, toCurrency: to };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.currency.timeoutMs);

  try {
    const url = `${env.currency.serviceUrl}/api/v1/currencies/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`;
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new CurrencyConversionError(
        `currency-service returned ${res.status} converting ${from}→${to}: ${body}`,
        res.status,
      );
    }

    const data = (await res.json()) as ConvertResponseBody;
    const rate = amount > 0 ? data.result / amount : 0;

    logger.debug('[currency-client] Converted amount', { from, to, amount, result: data.result, rate });

    return { amount: data.result, rate, fromCurrency: from, toCurrency: to };
  } catch (err) {
    if (err instanceof CurrencyConversionError) throw err;

    if (err instanceof Error && err.name === 'AbortError') {
      throw new CurrencyConversionError(
        `currency-service timed out after ${env.currency.timeoutMs}ms converting ${from}→${to}`,
        504,
      );
    }

    throw new CurrencyConversionError(
      `currency-service request failed converting ${from}→${to}: ${(err as Error).message}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
