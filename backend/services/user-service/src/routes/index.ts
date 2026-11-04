import { Router } from 'express';
import prisma from '../config/prisma.js';
import { isProducerReady } from '../config/kafka.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import addressRoutes from './address.routes.js';
import sellerTrustRoutes from './sellerTrust.routes.js';
import internalRoutes from './internal.routes.js';

// ─── Health probes ──────────────────────────────────────────────────────────
// Mounted at the root, not under /api/v1: the Docker HEALTHCHECK and the
// Kubernetes probes address the container directly, without the gateway.
export const healthRoutes = Router();

// Liveness — the process is up. Never touches the DB, so a database blip
// can't get the container killed by an orchestrator restart loop.
healthRoutes.get('/health/live', (_req, res) => {
  res.status(200).json({ service: 'user-service', status: 'up', ts: new Date().toISOString() });
});

// Readiness — can this instance actually serve traffic? Kafka is reported but
// not required: events are fire-and-forget, so a broker outage degrades
// notifications rather than authentication.
healthRoutes.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      service: 'user-service',
      ready: true,
      db: 'up',
      kafka: isProducerReady() ? 'up' : 'degraded',
      ts: new Date().toISOString(),
    });
  } catch {
    res
      .status(503)
      .json({ service: 'user-service', ready: false, db: 'down', ts: new Date().toISOString() });
  }
});

healthRoutes.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'user-service' });
});

// ─── API ────────────────────────────────────────────────────────────────────
// Mounted under /api/v1 by app.ts. api-gateway proxies the *full* original
// path upstream (see api-gateway/src/utils/proxy.ts — `new URL(req.originalUrl,
// target)`), so the prefix a client calls is the prefix this service must
// serve. An earlier revision mounted these at the root on the assumption that
// the gateway stripped /api/v1; it does not, which is why nothing could reach
// this service.
export const apiRoutes = Router();

apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/users', userRoutes);
apiRoutes.use('/addresses', addressRoutes);
apiRoutes.use('/sellers', sellerTrustRoutes);
apiRoutes.use('/internal', internalRoutes);

export default apiRoutes;
