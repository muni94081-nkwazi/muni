import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { logger } from './utils/logger.js';
import { wishlistRouter, standaloneRouter } from './routes/index.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import { wishlistService } from './services/wishlist.service.js';
import { priceAlertService } from './services/price-alert.service.js';
import { Kafka } from 'kafkajs';
import { connectDB, disconnectDB, prisma } from './db/prisma.js';

const app = express();
const PORT = process.env.PORT || 4016;

app.use(internalCors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'wishlist-service', status: 'up' }));
app.get('/health/live', (_req, res) => res.json({ service: 'wishlist-service', status: 'up' }));
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'wishlist-service', ready: true, db: 'connected' });
  } catch {
    res.status(503).json({ service: 'wishlist-service', ready: false, db: 'disconnected' });
  }
});

// The wishlist resource lives under its gateway prefix. Mounting it at the
// root meant /api/v1/wishlists — the path the gateway forwards verbatim and the
// path both clients call — never matched a route and always 404'd.
app.use('/api/v1/wishlists', wishlistRouter);

// Price alerts and price history carry their own absolute paths.
app.use(standaloneRouter);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.name === 'ZodError') {
    res.status(422).json({ message: 'Validation failed', issues: error.issues });
    return;
  }
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(error.status ?? 500).json({ message: error.message ?? 'Internal server error' });
});

let server: any;
let consumer: any;

// ─── product-events → price-drop alerts ───────────────────────────────────────
//
// This consumer is no longer dead. It subscribes to `product-events` and acts
// on `price.updated`, and until product-service was wired up NOTHING published
// to that topic — so `handleProductPriceUpdate` and the `price.drop.alert` it
// emits were complete, correct and had never once run. The price-drop feature
// the storefront advertises had never fired.
//
// The producer is product-service's `updateProduct`, which publishes only when
// an ACTIVE listing's basePrice actually changes, keyed by product id so two
// rapid edits stay ordered on one partition.
//
// Message shape it expects:
//   { type: 'price.updated', payload: { productId, oldPrice, newPrice, currency } }
async function setupConsumer() {
  try {
    const kafka = new Kafka({
      clientId: 'wishlist-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
    });
    consumer = kafka.consumer({ groupId: 'wishlist-service-group' });
    await consumer.connect();
    await consumer.subscribe({ topic: 'product-events', fromBeginning: false });
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }: any) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value.toString());
          if (event.type === 'price.updated' && event.payload) {
            await wishlistService.handleProductPriceUpdate(event.payload.productId, event.payload.newPrice);
          }
        } catch (err) {
          logger.error('Error processing kafka message', err);
        }
      },
    });
    logger.info('Kafka consumer connected and subscribed to product-events');
  } catch (err) {
    logger.warn('Kafka consumer unavailable');
  }
}

async function start() {
  try {
    // Fatal, unlike Kafka below: a wishlist this service cannot durably record
    // is a list the customer built and will find empty on their next visit.
    await connectDB();

    try {
      await connectProducer();
    } catch (err) {
      logger.warn('Kafka producer unavailable');
    }
    
    await setupConsumer();

    // Start 6-hour price drop checker background job
    priceAlertService.startPriceDropCheckerJob();

    server = app.listen(PORT, () => {
      logger.info(`wishlist-service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  priceAlertService.stopPriceDropCheckerJob();
  await disconnectProducer();
  if (consumer) {
    try {
      await consumer.disconnect();
    } catch (err) {
      logger.error('Error disconnecting consumer', err);
    }
  }
  await disconnectDB().catch(() => { /* already closing */ });
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
