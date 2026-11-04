import { logger } from '../utils/logger.js';
import {
  signServiceIdentity,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';
import type { Fulfillment } from '../models/fulfillment.model.js';

// ─── Projecting a delivery outcome onto the order ─────────────────────────────
//
// order-service owns the fulfillment lifecycle — see "Decision: who owns the
// fulfillment lifecycle" in docs/Architecture_Diagram.md. A Fulfillment here is
// the operational delivery job: which rider is carrying the parcel, the
// signature taken at the door, the cash collected. It is not a second opinion
// about the order's status.
//
// So when a rider advances a job, the outcome has to reach the authority. The
// customer and the seller read the sub-order; payment-service settles vendor
// shares against it; return-service reads its `deliveredAt` to decide the
// 14-day window. A parcel marked delivered here and nowhere else would leave
// all three wrong.
//
// This calls the EXISTING seller route, `PATCH /api/v1/seller/orders/:id/status`,
// rather than adding an internal one. That matters: the existing route runs the
// whole guard chain — ownership, the transition table, the timeline write — and
// a new internal endpoint would have had to either duplicate those or skip
// them. Skipping them is exactly the duplicate-authority problem this decision
// exists to remove.
//
// The assertion names the SELLER whose consignment it is, taken from the
// fulfillment record rather than from anything a caller supplied. A rider
// delivering a parcel is acting on that seller's consignment; asserting anyone
// else would either fail the ownership check or, worse, pass one it should not.
// The roles list is empty, so this grants no admin bypass.

const SERVICE_NAME = 'fulfillment-service';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003';
const TIMEOUT_MS = Number(process.env.ORDER_SERVICE_TIMEOUT_MS ?? 5000);

/**
 * How a delivery job's state reads on the order.
 *
 * Only the states that mean something to a customer are mapped. RETURNED and
 * FAILED deliberately are not: a parcel that comes back is return-service's
 * lifecycle, and a failed delivery attempt is an operational fact that does not
 * change what the customer bought. Mapping either onto a sub-order status would
 * be inventing a commercial meaning for an operational event.
 */
const PROJECTION: Partial<Record<Fulfillment['status'], string>> = {
  PICKED_UP:     'picked_up',
  IN_TRANSIT:    'in_transit',
  DELIVERED:     'delivered',
  DELIVERED_COD: 'delivered',
};

/** Whether this fulfillment state says anything the order needs to know. */
export function projectedStatusFor(status: Fulfillment['status']): string | undefined {
  return PROJECTION[status];
}

/**
 * Tell order-service what happened to the parcel.
 *
 * Never throws. The rider's action has already been recorded here and the cash,
 * if any, is already in their hands — failing their request because
 * order-service is briefly unreachable would be worse than a status that lands
 * late. A failure is logged loudly with every id needed to replay it, because
 * unlike a lapsed hold nothing retries this on its own.
 *
 * Returns whether the projection landed, so callers can surface it.
 */
export async function projectStatusToOrder(fulfillment: Fulfillment): Promise<boolean> {
  const status = projectedStatusFor(fulfillment.status);
  if (!status) return true; // nothing to say

  if (!fulfillment.subOrderId) {
    logger.error('[order-client] delivery job has no sub-order to project onto', {
      fulfillmentId: fulfillment.id,
      orderId:       fulfillment.orderId,
      status:        fulfillment.status,
    });
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-user-id': fulfillment.sellerId,
  };
  const assertion = signServiceIdentity(fulfillment.sellerId, [], SERVICE_NAME);
  if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;

  try {
    const response = await fetch(
      `${ORDER_SERVICE_URL}/api/v1/seller/orders/${encodeURIComponent(fulfillment.subOrderId)}/status`,
      {
        method: 'PATCH',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          status,
          ...(fulfillment.trackingNumber ? { trackingNumber: fulfillment.trackingNumber } : {}),
        }),
      },
    );

    if (!response.ok) {
      // A 400 here is usually order-service's transition table refusing a move
      // the sub-order has already made — a rider re-confirming a delivery, for
      // instance. Logged rather than retried, because replaying it would not
      // change the answer.
      logger.error('[order-client] order-service refused the delivery projection', {
        fulfillmentId: fulfillment.id,
        subOrderId:    fulfillment.subOrderId,
        sellerId:      fulfillment.sellerId,
        status,
        httpStatus:    response.status,
      });
      return false;
    }

    logger.info('[order-client] delivery projected onto the order', {
      fulfillmentId: fulfillment.id,
      subOrderId:    fulfillment.subOrderId,
      status,
    });
    return true;
  } catch (err) {
    const reason =
      (err as Error).name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : (err as Error).message;
    logger.error('[order-client] could not reach order-service to project the delivery', {
      fulfillmentId: fulfillment.id,
      subOrderId:    fulfillment.subOrderId,
      status,
      reason,
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const orderClient = { projectStatusToOrder, projectedStatusFor };
