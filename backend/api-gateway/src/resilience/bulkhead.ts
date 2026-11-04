// ─── Bulkhead (Semaphore-based Concurrency Limiter) ───────────────────────────
//
// Limits the number of *concurrent* in-flight requests to each downstream
// service so that a slow dependency cannot exhaust the gateway's thread pool.
//
// Behaviour:
//   • If active < maxConcurrent  → execute immediately
//   • If active >= maxConcurrent → wait in queue (up to maxQueue entries)
//   • If queue is full           → reject immediately with BulkheadFullError
//   • If waiting > queueTimeoutMs → reject with BulkheadTimeoutError
//
// Recommended limits:
//   payment-service   → 20  (financial calls; slow, must be rate-limited)
//   all other services → 50

export class BulkheadFullError extends Error {
  readonly status = 503;
  constructor(service: string) {
    super(`Bulkhead for "${service}" is full — too many concurrent requests`);
    this.name = 'BulkheadFullError';
  }
}

export class BulkheadTimeoutError extends Error {
  readonly status = 503;
  constructor(service: string) {
    super(`Bulkhead for "${service}" queue timed out`);
    this.name = 'BulkheadTimeoutError';
  }
}

export interface BulkheadOptions {
  /** Maximum simultaneous in-flight calls. Default: 50 */
  maxConcurrent?: number;
  /** Maximum pending queue size before rejecting. Default: 100 */
  maxQueue?:      number;
  /** Max ms a request can wait in queue before being rejected. Default: 5_000 */
  queueTimeoutMs?: number;
}

export class Bulkhead {
  private active = 0;
  private readonly queue: Array<{ resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];

  private readonly maxConcurrent:  number;
  private readonly maxQueue:       number;
  private readonly queueTimeoutMs: number;

  constructor(
    private readonly serviceName: string,
    opts: BulkheadOptions = {},
  ) {
    this.maxConcurrent  = opts.maxConcurrent  ?? 50;
    this.maxQueue       = opts.maxQueue       ?? 100;
    this.queueTimeoutMs = opts.queueTimeoutMs ?? 5_000;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  getMetrics() {
    return {
      service:       this.serviceName,
      active:        this.active,
      queued:        this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue:      this.maxQueue,
    };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }

    // Queue is full — reject immediately
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(new BulkheadFullError(this.serviceName));
    }

    // Enqueue and wait
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.queue.findIndex((e) => e.timer === timer);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new BulkheadTimeoutError(this.serviceName));
      }, this.queueTimeoutMs);

      this.queue.push({ resolve, reject, timer });
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
      // active stays the same — the waiting caller takes the slot
    } else {
      this.active--;
    }
  }
}

// ─── Global Registry ─────────────────────────────────────────────────────────

const registry = new Map<string, Bulkhead>();

/** Per-service concurrency caps */
const SERVICE_CAPS: Record<string, number> = {
  payment: 20,
};
const DEFAULT_CAP = 50;

export function getBulkhead(serviceName: string): Bulkhead {
  if (!registry.has(serviceName)) {
    const maxConcurrent = SERVICE_CAPS[serviceName] ?? DEFAULT_CAP;
    registry.set(serviceName, new Bulkhead(serviceName, { maxConcurrent }));
  }
  return registry.get(serviceName)!;
}

export function getAllBulkheadMetrics() {
  return [...registry.values()].map((b) => b.getMetrics());
}
