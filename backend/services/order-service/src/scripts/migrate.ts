import 'dotenv/config';
import { connectDB, disconnectDB } from '../db/mongoose.js';
import { OrderModel, CounterModel } from '../models/order.schema.js';

// ─── Order Service Migration ───────────────────────────────────────────────────
// Idempotent setup script for a fresh MongoDB deployment:
//   1. Builds the indexes declared on the Order schema.
//   2. Ensures the atomic order-number counter document exists.
// Safe to re-run — every step is a no-op if already applied.
//
// Usage: npm run migrate   (reads MONGODB_URI from the environment / .env)

async function migrate(): Promise<void> {
  await connectDB();

  console.log('[order-service migrate] Syncing indexes on Order collection...');
  await OrderModel.syncIndexes();

  console.log('[order-service migrate] Ensuring order-number counter document exists...');
  await CounterModel.findByIdAndUpdate(
    'masterOrderNumber',
    { $setOnInsert: { seq: 999 } }, // first nextOrderSeq() call will return 1000
    { upsert: true },
  );

  console.log('[order-service migrate] ✅ Migration complete.');
  await disconnectDB();
}

migrate().catch((err) => {
  console.error('[order-service migrate] ❌ Migration failed:', err);
  process.exit(1);
});
