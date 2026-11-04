import { Router } from 'express';
import prisma from '../config/prisma.js';
import { requireActor, requireRole } from '../middleware/identity.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import * as ticketController from '../controllers/ticket.controller.js';
import {
  createTicketSchema,
  replySchema,
  updateTicketSchema,
  assignSchema,
  rateSchema,
  listTicketsSchema,
} from '../validators/ticket.validators.js';

export const healthRoutes = Router();

healthRoutes.get('/health/live', (_req, res) => {
  res.json({ service: 'support-service', status: 'up', ts: new Date().toISOString() });
});

healthRoutes.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'support-service', ready: true, db: 'up', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'support-service', ready: false, db: 'down' });
  }
});

healthRoutes.get('/health', (_req, res) => res.json({ status: 'ok', service: 'support-service' }));

export const apiRoutes = Router();

// Every route requires an identified caller — there is no anonymous ticketing.
// Visibility (own tickets vs. the whole queue) is enforced in the service,
// which is the only place that knows whether the caller is an agent.
apiRoutes.post('/support/tickets', requireActor, validateBody(createTicketSchema), ticketController.create);
apiRoutes.get('/support/tickets', requireActor, validateQuery(listTicketsSchema), ticketController.list);
apiRoutes.get('/support/tickets/:id', requireActor, ticketController.getById);
apiRoutes.post(
  '/support/tickets/:id/messages',
  requireActor,
  validateBody(replySchema),
  ticketController.reply,
);
apiRoutes.post('/support/tickets/:id/rate', requireActor, validateBody(rateSchema), ticketController.rate);

// ── Agent / admin ───────────────────────────────────────────────────────────
apiRoutes.patch(
  '/support/tickets/:id',
  requireRole('ADMIN', 'AGENT', 'SUPPORT'),
  validateBody(updateTicketSchema),
  ticketController.update,
);
apiRoutes.post(
  '/support/tickets/:id/assign',
  requireRole('ADMIN', 'AGENT', 'SUPPORT'),
  validateBody(assignSchema),
  ticketController.assign,
);
apiRoutes.get('/admin/support/stats', requireRole('ADMIN', 'AGENT', 'SUPPORT'), ticketController.stats);

export default apiRoutes;
