import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import * as cc from './controllers/container.controller.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// Health Checks
app.get('/health/live', (_req, res) => {
  res.json({ service: 'container-service', status: 'up', ts: new Date().toISOString() });
});

app.get('/health/ready', (_req, res) => {
  res.json({ service: 'container-service', ready: true, ts: new Date().toISOString() });
});

app.get('/health', (_req, res) => res.redirect('/health/live'));

// Public & Homepage Container Endpoints
app.get('/api/v1/containers', cc.getContainers);
app.get('/api/v1/containers/:slug', cc.getContainerBySlug);

// Admin Container Management Routes
app.post('/api/v1/containers', cc.createContainer);
app.put('/api/v1/containers/:id', cc.updateContainer);
app.post('/api/v1/containers/:id/products', cc.addProduct);
app.post('/api/v1/containers/:id/products/bulk', cc.bulkAddProducts);
app.delete('/api/v1/containers/:id/products/:productId', cc.removeProduct);
app.post('/api/v1/containers/:id/rules', cc.addRule);

// Seller Submission Routes
app.get('/api/v1/containers/submissions/all', cc.getSubmissions);
app.post('/api/v1/containers/submissions', cc.submitProduct);
app.patch('/api/v1/containers/submissions/:id/evaluate', cc.evaluateSubmission);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

const PORT = Number(process.env.PORT ?? 4031);

const server = app.listen(PORT, () =>
  console.log(`[container-service] 🚀 Listening on port ${PORT}`),
);

async function shutdown(signal: string) {
  console.log(`[container-service] ${signal} — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
