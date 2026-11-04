import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { shippingCalculationService } from './services/shipping.service.js';
import pickupStationRoutes from './routes/pickup-station.routes.js';
import tariffRoutes from './routes/tariff.routes.js';
import {
  CalculateRatesSchema,
  CreateShipmentSchema,
  UpdateShipmentSchema,
} from './models/validation.schemas.js';
import { validateBody, validateParams } from '../../../shared/http/validation.middleware.js';
import { shipmentService, ShipmentError } from './services/shipment.service.js';
import { connectDB, disconnectDB, isDBReady } from './db/prisma.js';
import { z } from 'zod';
import type { Response } from 'express';

/** Errors carry a status from the layer that knows what went wrong. */
function handleShipmentError(res: Response, err: unknown): Response {
  const status = err instanceof ShipmentError ? err.status : 500;
  return res.status(status).json({ message: (err as Error).message });
}

const app = express();
app.use(internalCors());
app.use(express.json());

app.get('/health/live', (_req, res) => res.json({ service: 'shipping-service', status: 'up', ts: new Date().toISOString() }));
// Readiness now reflects the database, because the service can no longer
// answer a shipment or station read without it. `/health/live` stays a pure
// liveness signal — it is what the compose healthcheck probes, so a Postgres
// blip must not restart the container.
app.get('/health/ready', (_req, res) => {
  const dbRequired = Boolean(process.env.DATABASE_URL);
  const dbOk = !dbRequired || isDBReady();
  res.status(dbOk ? 200 : 503).json({
    service: 'shipping-service',
    ready: dbOk,
    postgres: dbRequired ? (dbOk ? 'up' : 'down') : 'not-configured',
    ts: new Date().toISOString(),
  });
});
app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Multi-Vendor Shipping Rate Calculation ───────────────────────────────────

app.post('/api/v1/shipping/calculate', validateBody(CalculateRatesSchema), async (req, res) => {
  try {
    const { destination, itemsByVendor, preferredServiceLevel } = req.body;

    const result = await shippingCalculationService.calculateRates({
      destination,
      itemsByVendor,
      preferredServiceLevel,
    });

    return res.json({ data: result });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Legacy single-destination rates
app.get('/api/v1/shipping/rates', (req, res) => {
  const { to } = req.query;
  const isKampala = typeof to === 'string' && to.toLowerCase().includes('kampala');
  const multiplier = isKampala ? 1 : 2.5;

  res.json({
    data: [
      { provider: 'MUNI Express', price: 5000 * multiplier, currency: 'UGX', estimatedDays: 1, type: 'express' },
      { provider: 'MUNI Standard', price: 3000 * multiplier, currency: 'UGX', estimatedDays: 3, type: 'standard' },
      { provider: 'Pick Up', price: 0, currency: 'UGX', estimatedDays: 0, type: 'pickup' },
    ],
  });
});

app.post('/api/v1/shipping/shipments', validateBody(CreateShipmentSchema), async (req, res) => {
  try {
    const shipment = await shipmentService.createShipment(req.body);
    res.status(201).json({ data: shipment });
  } catch (err) {
    handleShipmentError(res, err);
  }
});

// PATCH a shipment — advance its status and append a tracking event.
//
// There was no way to update a shipment at all: one could be booked and
// tracked, but its status was frozen at 'in_transit' from creation, so the
// three seeded events were the entire life of every parcel on the platform.
app.patch(
  '/api/v1/shipping/shipments/:shipmentId',
  validateParams(z.object({ shipmentId: z.string().trim().min(1) })),
  validateBody(UpdateShipmentSchema),
  async (req, res) => {
    try {
      const shipment = await shipmentService.updateShipment(req.params.shipmentId, req.body);
      return res.json({ data: shipment });
    } catch (err) {
      return handleShipmentError(res, err);
    }
  },
);

app.get('/api/v1/shipping/track/:trackingNumber', async (req, res) => {
  try {
    const tracking = await shipmentService.getTracking(req.params.trackingNumber);
    return res.json({ data: tracking });
  } catch (err) {
    return handleShipmentError(res, err);
  }
});

app.get('/api/v1/shipping/labels/:shipmentId', async (req, res) => {
  try {
    const label = await shipmentService.getLabel(req.params.shipmentId);
    return res.json({ data: label });
  } catch (err) {
    return handleShipmentError(res, err);
  }
});

// ─── Local Fulfillment: Pickup Stations (PUDO) & Region Tariff Engine ─────────

app.use('/api/v1', pickupStationRoutes);
app.use('/api/v1', tariffRoutes);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ message: error.message }),
);

// ─── Startup ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4006);

async function start(): Promise<void> {
  if (process.env.DATABASE_URL) {
    try {
      await connectDB();
      console.log('[shipping-service] ✅ Postgres connected');
    } catch (err) {
      // Fatal in production: this service now owns durable state, and serving
      // reads that silently return nothing is worse than refusing to start.
      if (process.env.NODE_ENV === 'production') {
        console.error('[shipping-service] Failed to connect to Postgres — exiting:', err);
        process.exit(1);
      }
      console.warn(
        '[shipping-service] ⚠️  Postgres unavailable — continuing in degraded mode (dev only):',
        (err as Error).message,
      );
    }
  }

  const server = app.listen(PORT, () =>
    console.log(`[shipping-service] 🚀 Listening on port ${PORT}`),
  );

  async function shutdown(signal: string): Promise<void> {
    console.log(`[shipping-service] ${signal} — shutting down`);
    await disconnectDB().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void start();

export default app;
