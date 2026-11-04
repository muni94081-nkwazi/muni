import { logger } from '../utils/logger.js';
import {
  createOrderVerificationClient,
  OrderVerificationError,
  type VerifiableOrder,
} from '../../../../shared/http/order-verification.client.js';

// ─── order-service Client ─────────────────────────────────────────────────────
//
// return-service made no outbound calls at all. `createReturn` took `orderId`,
// `sellerId` and `items[]` from the request body and wrote a return against
// them, so a customer could file one for an order that does not exist, for
// somebody else's order, against a seller who never sold them anything, for
// items that were never in the basket, in quantities that were never bought.
//
// Same verification dispute-service uses, from the same place — see the note in
// shared/http/order-verification.client.ts for why it is shared rather than
// copied.

const { fetchOrderForBuyer } = createOrderVerificationClient({
  serviceName: 'return-service',
  baseUrl:     process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003',
  timeoutMs:   Number(process.env.ORDER_SERVICE_TIMEOUT_MS ?? 5000),
  logger,
});

export { fetchOrderForBuyer, OrderVerificationError };
export type { VerifiableOrder };
export const orderClient = { fetchOrderForBuyer };
