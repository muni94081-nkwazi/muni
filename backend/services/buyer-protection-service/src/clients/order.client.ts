import { env } from '../config/env.js';
import {
  createOrderVerificationClient,
  OrderVerificationError,
  type VerifiableOrder,
} from '../../../../shared/http/order-verification.client.js';

// ─── order-service Client ─────────────────────────────────────────────────────
//
// A protection claim asks MUNI to reverse a payment, so the order it names has
// to belong to the person filing it. This service never asked: `fileClaim` took
// `orderId` and `productId` from the body and wrote a claim against them, with
// the claimant taken from an unverified header that fell back to a literal
// 'user-123'. Naming any order id was enough to open a claim on a stranger's
// purchase.
//
// Same verification dispute-service and return-service use, from the same
// place — see shared/http/order-verification.client.ts for why it is shared
// rather than copied. It fails closed: a 404, a timeout or a malformed body all
// refuse the filing rather than waving it through.
//
// This service logs with console, so the logger is adapted here rather than a
// utils/logger.ts being invented for one call site.

const { fetchOrderForBuyer } = createOrderVerificationClient({
  serviceName: 'buyer-protection-service',
  baseUrl:     env.orderService.baseUrl,
  timeoutMs:   env.orderService.timeoutMs,
  logger: {
    error: (msg: string, meta?: Record<string, unknown>) =>
      console.error(`[buyer-protection-service] ${msg}`, meta ?? ''),
  },
});

export { fetchOrderForBuyer, OrderVerificationError };
export type { VerifiableOrder };
export const orderClient = { fetchOrderForBuyer };
