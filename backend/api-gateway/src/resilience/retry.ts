// ─── Retry with Exponential Backoff ──────────────────────────────────────────
//
// Wraps an async function with up to `maxAttempts` total tries.
// Backoff schedule (with 10 % jitter):
//   attempt 1 → 1 s
//   attempt 2 → 2 s
//   attempt 3 → 4 s  (capped at maxDelayMs)
//
// Only retries on:
//   • Network / fetch errors (no HTTP response at all)
//   • HTTP 5xx responses (UpstreamError with status >= 500)
// Never retries on:
//   • CircuitOpenError  (circuit already open, no point retrying)
//   • HTTP 4xx          (client error, retrying won't help)

import { CircuitOpenError } from './circuit-breaker.js';

// Sentinel used to carry an HTTP status through the retry logic
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly body:   string,
    public readonly url:    string,
  ) {
    super(`Upstream ${status} from ${url}`);
    this.name = 'UpstreamError';
  }
}

export interface RetryOptions {
  /** Total number of attempts (not retries). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms. Doubles each attempt. Default: 1_000 */
  baseDelayMs?: number;
  /** Maximum delay in ms regardless of backoff. Default: 10_000 */
  maxDelayMs?:  number;
  /** Override the retry decision. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

function defaultShouldRetry(err: unknown): boolean {
  // Never retry on open circuits — the CB already handles the policy
  if (err instanceof CircuitOpenError) return false;
  // Retry server errors only
  if (err instanceof UpstreamError) return err.status >= 500;
  // Retry any network-level error (ECONNREFUSED, AbortError on timeout, etc.)
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay   = opts.baseDelayMs ?? 1_000;
  const maxDelay    = opts.maxDelayMs  ?? 10_000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const isLast = attempt === maxAttempts;
      if (isLast || !shouldRetry(err, attempt)) {
        throw err;
      }

      // Exponential backoff: base * 2^(attempt-1), with ±10 % jitter
      const exponential  = baseDelay * Math.pow(2, attempt - 1);
      const capped       = Math.min(exponential, maxDelay);
      const jitter       = capped * 0.1 * Math.random();
      const delay        = Math.round(capped + jitter);

      console.warn(
        `[retry] Attempt ${attempt}/${maxAttempts} failed — retrying in ${delay}ms`,
        err instanceof Error ? err.message : err,
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}
