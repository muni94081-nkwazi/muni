import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  createOrderVerificationClient,
  OrderVerificationError,
  type VerifiableOrder,
} from '../../../../shared/http/order-verification.client.js';

// ─── order-service Client ─────────────────────────────────────────────────────
//
// The verification semantics that used to live here — signed buyer assertion,
// 404/403 collapsed so the endpoint is not an existence oracle, fail closed on
// timeout or a malformed body — now live in
// `shared/http/order-verification.client.ts`.
//
// They moved because return-service had the identical hole (a customer could
// file a return against any order id they typed) and needed the identical
// check. Two copies of a rule like "fail closed when order-service is down" is
// how one of them ends up not doing that. This file is the binding to
// dispute-service's own config and logger; the module path is unchanged, so
// callers and test doubles are unaffected.

const { fetchOrderForBuyer } = createOrderVerificationClient({
  serviceName: 'dispute-service',
  baseUrl:     env.orderService.baseUrl,
  timeoutMs:   env.orderService.timeoutMs,
  logger,
});

export { fetchOrderForBuyer, OrderVerificationError };
export type { VerifiableOrder };
export const orderClient = { fetchOrderForBuyer };
