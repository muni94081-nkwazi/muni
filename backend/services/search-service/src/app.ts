import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { logger } from './utils/logger.js';
import { connectES, esClient } from './services/elasticsearch.service.js';
import searchRoutes from './routes/index.js';

// ─── This service no longer writes the product index ──────────────────────────
//
// product-service owns `muni-products`: it holds the catalogue, so it is the
// only thing that can keep an index of the catalogue correct. Two services
// writing one index with two different mappings is what broke search — see the
// note on the /search route in api-gateway/src/routes/customer.routes.ts.
//
// Removed here:
//
//   • consumers/product.consumer.ts — subscribed to the `product-events` Kafka
//     topic that NOTHING produces. The only would-be publisher is a
//     commented-out line in product-service/src/jobs/import.worker.ts:105. It
//     consumed nothing for as long as it existed.
//
//   • seedData() and its 12 hardcoded products — "Kampala Premium Coffee",
//     "Samsung Galaxy A14", "Masai Shuka" and friends were bulk-written into
//     the live index on every boot where it happened to be empty. None of them
//     exist in the products database, so a shopper could search, see a result,
//     click it, and land on a 404. Fabricated rows in a customer-facing index
//     are worse than an empty one: empty is obviously broken, this was not.
//
//   • ensureIndex() on boot — see connectES in services/elasticsearch.service.ts.
//     Creating the index from here is what raced product-service for the
//     mapping.
//
// What is left is the read path. The service still has the richer query
// builder (hybrid BM25 + kNN, autocomplete, synonyms, facets) and can serve as
// a query router over the index product-service maintains, which is why it is
// not deleted outright.

const app = express();
const port = process.env.PORT ?? 4010;

app.use(internalCors());
app.use(express.json());
app.use(searchRoutes);

app.get('/health/live', (req, res) => {
  res.json({ status: 'OK' });
});

app.get('/health/ready', async (req, res) => {
  try {
    const isReady = await esClient.ping();
    if (isReady) {
      res.json({ status: 'READY' });
    } else {
      res.status(503).json({ status: 'UNAVAILABLE', component: 'elasticsearch' });
    }
  } catch (error) {
    res.status(503).json({ status: 'UNAVAILABLE', component: 'elasticsearch' });
  }
});

let server: any;

async function bootstrap() {
  // Connects and reports, but no longer creates the index or seeds it. If
  // `muni-products` does not exist yet, product-service creates it on ITS boot
  // with the mapping it writes documents against.
  await connectES();

  server = app.listen(port, () => {
    logger.info(`✅ Search service running on port ${port}`);
  });
}

bootstrap().catch(err => {
  logger.error('Failed to start application', { error: err.message });
  process.exit(1);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }
  try {
    await esClient.close();
    logger.info('Elasticsearch client closed');
  } catch (e) {
    logger.error('Error closing Elasticsearch client', { error: (e as Error).message });
  }
  setTimeout(() => process.exit(0), 1000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
