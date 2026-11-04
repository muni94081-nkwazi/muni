import { Kafka, type Consumer } from 'kafkajs';
import { logger } from '../utils/logger.js';
import { checkoutService } from '../services/checkout.service.js';

// ─── payment-events consumer ──────────────────────────────────────────────────
//
// The missing half of the mobile money flow.
//
// When payment-service returns providerStatus PENDING_USER_PIN_PROMPT, the saga
// stops at PAYMENT_PENDING and creates no order (checkout.saga.ts:430-444) —
// correctly, because the customer has not approved anything yet. The telco then
// confirms the collection minutes later and payment-service publishes
// `payment.succeeded`. Nothing subscribed to it. The buyer was charged, the
// holds expired, and no order ever existed.
//
// Structure mirrors payment-service/src/consumers/order.consumer.ts: a
// module-level client, start/stop exports, and a handler exported separately so
// it can be exercised without standing up a broker — that file makes the same
// choice for the same reason (see its note at lines 43-51).
//
// The envelope comes from payment-service/src/services/payment-resolution.service.ts:116-138:
//
//   { eventId, eventType: 'payment.succeeded', service, occurredAt,
//     data: { paymentId, orderId, reference, amount, ... } }
//
// `data.orderId` is the CHECKOUT SESSION id, not an order id: the saga initiates
// payment with `orderId: session.id` (checkout.saga.ts:364), because at that
// point no order exists yet. That is what makes this lookup possible at all.

const kafka = new Kafka({
  clientId: 'checkout-service',
  brokers:  (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const consumer: Consumer = kafka.consumer({ groupId: 'checkout-service-payment-group' });

export async function startPaymentConsumer(): Promise<void> {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'payment-events', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString();
        if (!raw) return;
        await handlePaymentMessage(topic, raw);
      },
    });

    logger.info('[checkout-service] payment-events consumer started');
  } catch (err) {
    // Non-fatal, matching the mirrored consumer: a broker outage must not stop
    // the service serving checkouts. The reconciliation sweep is the backstop
    // for anything missed while this is down.
    logger.warn('Failed to start payment-events consumer (non-fatal)', {
      error: (err as Error).message,
    });
  }
}

/** Handle one payment-events message. Exported so it is testable without Kafka. */
export async function handlePaymentMessage(topic: string, raw: string): Promise<void> {
  try {
    const envelope = JSON.parse(raw);
    if (envelope?.eventType !== 'payment.succeeded') return;

    const sessionId = envelope.data?.orderId;
    if (!sessionId) {
      logger.warn('[checkout-service] payment.succeeded carried no orderId', {
        eventId: envelope.eventId,
      });
      return;
    }

    const session = await checkoutService.confirmPaymentFromSystem(sessionId, 'payment.succeeded');

    if (!session) {
      // Money was taken for a checkout that no longer exists. Nothing here can
      // recover it — the session held the cart, the address and the holds — so
      // it is logged at error with the payment reference, which is what a human
      // needs to refund or place the order by hand.
      logger.error('[checkout-service] payment succeeded but its checkout session has expired', {
        sessionId,
        reference: envelope.data?.reference,
        paymentId: envelope.data?.paymentId,
        amount:    envelope.data?.amount,
      });
      return;
    }

    logger.info('[checkout-service] session re-driven by payment.succeeded', {
      sessionId,
      status:  session.status,
      orderId: session.orderId ?? null,
    });
  } catch (err) {
    logger.error('Failed to process payment-events message', {
      topic,
      error: (err as Error).message,
    });
  }
}

export async function stopPaymentConsumer(): Promise<void> {
  await consumer.disconnect().catch(() => undefined);
}
