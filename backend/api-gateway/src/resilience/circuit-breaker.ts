// ─── Circuit Breaker ──────────────────────────────────────────────────────────
//
// Implements the classic three-state finite state machine:
//   CLOSED   → requests pass through normally
//   OPEN     → requests fail immediately (no network call made)
//   HALF_OPEN → one test request is allowed; success closes, failure re-opens
//
// State transitions:
//   CLOSED  → OPEN      : consecutiveFailures >= failureThreshold
//   OPEN    → HALF_OPEN : resetTimeoutMs has elapsed since the last trip
//   HALF_OPEN → CLOSED  : successThreshold consecutive successes
//   HALF_OPEN → OPEN    : any single failure

export class CircuitOpenError extends Error {
  readonly service: string;
  readonly status = 503;
  constructor(service: string) {
    super(`Circuit breaker for "${service}" is OPEN — service unavailable`);
    this.service  = service;
    this.name     = 'CircuitOpenError';
  }
}

export enum CircuitState {
  CLOSED    = 'CLOSED',
  OPEN      = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before tripping. Default: 5 */
  failureThreshold?:  number;
  /** Number of consecutive successes in HALF_OPEN to fully close. Default: 1 */
  successThreshold?:  number;
  /** Ms to stay OPEN before moving to HALF_OPEN. Default: 30_000 */
  resetTimeoutMs?:    number;
  /** Optional callback fired on state transitions (useful for metrics). */
  onStateChange?:     (service: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state:            CircuitState = CircuitState.CLOSED;
  private consecutiveFails  = 0;
  private consecutiveOks    = 0;
  private openedAt          = 0;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeoutMs:   number;
  private readonly onStateChange?:   CircuitBreakerOptions['onStateChange'];

  constructor(
    private readonly serviceName: string,
    opts: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.successThreshold = opts.successThreshold ?? 1;
    this.resetTimeoutMs   = opts.resetTimeoutMs   ?? 30_000;
    this.onStateChange    = opts.onStateChange;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === CircuitState.OPEN) {
      throw new CircuitOpenError(this.serviceName);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  getState(): CircuitState { return this.state; }

  getMetrics() {
    return {
      service:          this.serviceName,
      state:            this.state,
      consecutiveFails: this.consecutiveFails,
      consecutiveOks:   this.consecutiveOks,
      openedAt:         this.openedAt || null,
      retryAt:          this.openedAt
        ? new Date(this.openedAt + this.resetTimeoutMs).toISOString()
        : null,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private maybeTransitionToHalfOpen() {
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.transition(CircuitState.HALF_OPEN);
    }
  }

  private recordSuccess() {
    this.consecutiveFails = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveOks++;
      if (this.consecutiveOks >= this.successThreshold) {
        this.transition(CircuitState.CLOSED);
      }
    }
  }

  private recordFailure() {
    this.consecutiveOks = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately re-opens
      this.trip();
    } else {
      this.consecutiveFails++;
      if (this.consecutiveFails >= this.failureThreshold) {
        this.trip();
      }
    }
  }

  private trip() {
    const prevState = this.state;
    this.openedAt   = Date.now();
    this.transition(CircuitState.OPEN);
    console.warn(
      `[circuit-breaker] "${this.serviceName}" TRIPPED from ${prevState} ` +
      `after ${this.consecutiveFails} failures. Retrying after ${this.resetTimeoutMs / 1000}s.`,
    );
  }

  private transition(next: CircuitState) {
    const prev  = this.state;
    this.state  = next;
    this.consecutiveOks  = 0;
    if (next === CircuitState.CLOSED) this.consecutiveFails = 0;
    this.onStateChange?.(this.serviceName, prev, next);
    console.info(`[circuit-breaker] "${this.serviceName}": ${prev} → ${next}`);
  }
}



// ─── Global Registry ─────────────────────────────────────────────────────────
// One CircuitBreaker per downstream service, lazily created.

const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  serviceName: string,
  opts?: CircuitBreakerOptions,
): CircuitBreaker {
  if (!registry.has(serviceName)) {
    registry.set(serviceName, new CircuitBreaker(serviceName, opts));
  }
  return registry.get(serviceName)!;
}

/** Expose all breaker states for a health/metrics endpoint. */
export function getAllCircuitMetrics() {
  return [...registry.values()].map((cb) => cb.getMetrics());
}
