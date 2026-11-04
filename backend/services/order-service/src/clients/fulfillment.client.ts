import { logger } from '../utils/logger.js';
import {
  signServiceIdentity,
  INTERNAL_IDENTITY_HEADER,
} from '../../../../shared/utils/internal-identity.js';
import type { Order, SubOrder } from '../models/order.model.js';

// ─── Booking a delivery job ───────────────────────────────────────────────────
//
// Nothing created delivery jobs. fulfillment-service had a complete rider and
// cash-on-delivery domain, a gateway surface as of Stage 8, and no way for a
// parcel to arrive in it — every job had to be booked by hand.
//
// The trigger is the seller accepting the sub-order: the move to `processing`.
// That is the first moment a parcel is real. Earlier would be premature — an
// order sitting at `pending` may still be cancelled, and a prepaid one may not
// have settled — and later would mean no rider could be dispatched until the
// seller had already handed it over.
//
// It follows from that choice, rather than needing separate handling, that:
//
//   • a cancelled order never books one — `cancelled` is terminal and cannot
//     reach `processing`;
//   • a multi-seller order books one job per seller, because each seller
//     accepts their own sub-order independently;
//   • COD and prepaid behave the same way, because both pass through the same
//     seller acceptance.
//
// order-service remains the commercial authority. The job it books is a
// delivery execution record — see "Decision: who owns the fulfillment
// lifecycle" in docs/Architecture_Diagram.md.

const FULFILLMENT_SERVICE_URL = process.env.FULFILLMENT_SERVICE_URL ?? 'http://localhost:4023';
const TIMEOUT_MS = Number(process.env.FULFILLMENT_SERVICE_TIMEOUT_MS ?? 5000);
const SERVICE_NAME = 'order-service';

/** The sub-order status at which a parcel becomes real enough to dispatch. */
export const BOOK_JOB_AT_STATUS = 'processing';

/**
 * Book the delivery job for one accepted sub-order.
 *
 * Never throws. A seller accepting their order must not fail because
 * fulfillment-service is redeploying — the acceptance is already recorded and
 * is the thing the customer sees. A failure is logged with every id needed to
 * rebook it.
 *
 * Safe to call repeatedly: fulfillment-service keys the job on `subOrderId` and
 * a unique index backs that, so a retry returns the existing job rather than
 * creating a second one.
 */
export async function bookDeliveryJob(order: Order, subOrder: SubOrder): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // A service assertion, not a user one: this is order-service booking on the
  // platform's behalf. fulfillment-service's requireInternalCaller demands the
  // `svc` claim, which is what distinguishes this from a browser.
  const assertion = signServiceIdentity(SERVICE_NAME, [], SERVICE_NAME);
  if (assertion) {
    headers[INTERNAL_IDENTITY_HEADER] = assertion;
    headers['x-user-id'] = SERVICE_NAME;
  }

  try {
    const response = await fetch(`${FULFILLMENT_SERVICE_URL}/api/v1/fulfillment`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        orderId:    subOrder.masterOrderId,
        subOrderId: subOrder.id,
        sellerId:   subOrder.sellerId,
        items: subOrder.items.map((item) => ({
          productId: item.productId,
          ...(item.variantId ? { variantId: item.variantId } : {}),
          quantity:  item.quantity,
          ...(item.weightKg ? { weight: item.weightKg } : {}),
        })),
        shippingAddress: order.shipping ?? {},
        // The courier needs to know whether to collect cash, and how much.
        // Taken from the order, never from a caller.
        ...(order.paymentMethod === 'cod'
          ? { paymentMethod: 'COD', codAmountDue: subOrder.totalAmount, codCurrency: order.currency ?? 'UGX' }
          : { paymentMethod: 'PREPAID' }),
      }),
    });

    if (!response.ok) {
      logger.error('[fulfillment-client] delivery job NOT booked — needs manual dispatch', { detail: {
        orderId:    subOrder.masterOrderId,
        subOrderId: subOrder.id,
        sellerId:   subOrder.sellerId,
        httpStatus: response.status,
      } });
      return false;
    }

    logger.info('[fulfillment-client] delivery job booked', { detail: {
      orderId: subOrder.masterOrderId, subOrderId: subOrder.id, sellerId: subOrder.sellerId,
    } });
    return true;
  } catch (err) {
    const reason =
      (err as Error).name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : (err as Error).message;
    logger.error('[fulfillment-client] could not reach fulfillment-service to book a delivery job', { detail: {
      orderId: subOrder.masterOrderId, subOrderId: subOrder.id, reason,
    } });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const fulfillmentClient = { bookDeliveryJob, BOOK_JOB_AT_STATUS };
