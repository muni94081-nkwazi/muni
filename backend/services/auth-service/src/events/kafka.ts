import { Kafka, type Producer } from 'kafkajs';

// ─── Kafka Producer for auth-service ─────────────────────────────────────────
//
// Used by seller.service.ts to publish seller lifecycle events:
//   seller-events topic:
//     seller.approved  — triggers welcome email in notification-service
//     seller.rejected  — triggers rejection email
//     seller.suspended — triggers suspension notice
//
// Connection is NON-FATAL: if Kafka is unreachable the service still boots and
// serves HTTP normally. The producer reference stays null and callers skip the
// publish (wrapped in .catch() in seller.service.ts).

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const CLIENT_ID     = process.env.KAFKA_CLIENT_ID ?? 'auth-service';

let producer: Producer | null = null;
let connected = false;

export function getProducer(): Producer | null {
  return connected ? producer : null;
}

export async function connectProducer(): Promise<void> {
  try {
    const kafka = new Kafka({
      clientId: CLIENT_ID,
      brokers:  KAFKA_BROKERS,
      retry:    { retries: 3 },
    });

    producer = kafka.producer();
    await producer.connect();
    connected = true;
    console.log('[auth-service] ✅ Kafka producer connected');
  } catch (err) {
    console.warn('[auth-service] Kafka unavailable — seller events will be skipped:', (err as Error).message);
    producer  = null;
    connected = false;
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer && connected) {
    try {
      await producer.disconnect();
    } catch {
      // ignore disconnect errors on shutdown
    }
    connected = false;
    producer  = null;
  }
}
