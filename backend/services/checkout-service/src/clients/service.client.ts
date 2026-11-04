import { logger } from '../utils/logger.js';
import {
  signServiceIdentity,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';

const SERVICE_NAME = 'checkout-service';

// ─── Internal Service Client ──────────────────────────────────────────────────
//
// One place where cross-service HTTP happens, so timeouts, identity
// propagation and error shapes are consistent instead of re-invented per call
// site. Every call is bounded — an unbounded fetch inside a saga step holds an
// inventory reservation open until something else times out.

const DEFAULT_TIMEOUT_MS = Number(process.env.SERVICE_TIMEOUT_MS ?? 5_000);

export interface ServiceResponse<T> {
  ok:     boolean;
  status: number;
  data:   T;
}

export class ServiceUnavailableError extends Error {
  readonly status = 503;
  constructor(readonly service: string, cause: string) {
    super(`${service} is unreachable: ${cause}`);
    this.name = 'ServiceUnavailableError';
  }
}

export interface CallOptions {
  method?:  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?:    unknown;
  /** Forwarded so downstream services see the originating user. */
  actorId?: string;
  /** Carried into the signed assertion so the callee can authorize on role. */
  actorRoles?: string[];
  /** Forwarded so downstream idempotency keys derive from ours. */
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Label used in logs and errors. */
  service:  string;
}

export async function call<T = unknown>(url: string, opts: CallOptions): Promise<ServiceResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.actorId)        headers['x-user-id']       = opts.actorId;
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;

  // Signed assertion naming this service as the caller. Downstream routes that
  // are internal-only (order-service's POST /orders) require the `svc` claim,
  // which the gateway never sets — so a browser holding a perfectly valid
  // session still cannot reach them, only a peer service can.
  //
  // Null when INTERNAL_IDENTITY_SECRET is unset, in which case the call goes
  // out header-only and the callee falls back to header trust. That keeps the
  // secret rollout from being a flag day.
  if (opts.actorId) {
    const assertion = signServiceIdentity(opts.actorId, opts.actorRoles ?? [], SERVICE_NAME);
    if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;
  }

  try {
    const response = await fetch(url, {
      method:  opts.method ?? 'GET',
      headers,
      body:    opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal:  controller.signal,
    });

    // A non-JSON body (HTML error page, empty 204) must not throw here — the
    // caller decides what a given status means.
    let data: T;
    const text = await response.text();
    try { data = text ? (JSON.parse(text) as T) : ({} as T); }
    catch { data = { raw: text } as unknown as T; }

    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    const reason = (err as Error).name === 'AbortError'
      ? `timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`
      : (err as Error).message;

    logger.error('[service-client] call failed', { url, service: opts.service, reason });
    throw new ServiceUnavailableError(opts.service, reason);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Service URLs ─────────────────────────────────────────────────────────────

export const SERVICES = {
  cart:      process.env.CART_SERVICE_URL      ?? 'http://localhost:4017',
  product:   process.env.PRODUCT_SERVICE_URL   ?? 'http://localhost:4002',
  // 4004, not 4011. inventory-service binds `process.env.PORT ?? 4004`
  // (inventory-service/src/index.ts), and both the gateway's target map and
  // every INVENTORY_SERVICE_URL in docker-compose use 4004. Nothing has ever
  // listened on 4011.
  //
  // Compose sets the env var, so this default only bites when a developer runs
  // the services directly — and it bites in the worst place: the checkout saga's
  // reserve step, which would fail to connect and roll the whole order back.
  inventory: process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:4004',
  payment:   process.env.PAYMENT_SERVICE_URL   ?? 'http://localhost:4005',
  order:     process.env.ORDER_SERVICE_URL     ?? 'http://localhost:4003',
  tax:       process.env.TAX_SERVICE_URL       ?? 'http://localhost:4014',
  shipping:  process.env.SHIPPING_SERVICE_URL  ?? 'http://localhost:4006',
  discount:  process.env.DISCOUNT_SERVICE_URL  ?? 'http://localhost:4015',
} as const;
