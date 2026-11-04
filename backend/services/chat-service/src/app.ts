import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { connectCache, disconnectCache, isCacheReady } from '../../../shared/cache/redis.js';
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';
import { connectMongo, disconnectMongo, isMongoReady } from './db/mongo.js';
import * as chat from './controllers/chat.controller.js';
import * as offer from './controllers/offer.controller.js';
import { registerChatGateway } from './sockets/chat.gateway.js';
import {
  requireAuth,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';

const app = express();
app.use(internalCors());
app.use(express.json());

// ─── Health Checks ─────────────────────────────────────────────────────────────

app.get('/health/live', (_req, res) => {
  res.json({ service: 'chat-service', status: 'up', ts: new Date().toISOString() });
});

app.get('/health/ready', (_req, res) => {
  res.json({
    service: 'chat-service',
    ready: true,
    redis: isCacheReady() ? 'up' : 'degraded',
    mongo: isMongoReady() ? 'up' : 'degraded',
    ts: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => res.redirect('/health/live'));

// ─── Chat REST Routes ─────────────────────────────────────────────────────────
//
// Every route below is authenticated. They were all open: the controllers
// resolved the caller from a client-supplied x-user-id/body field and fell back
// to the literal 'user-123', so an anonymous request was served as a real user.
// The gateway compounded it by mounting /chat with `pub()` (no JWT at all) —
// fixed alongside this in api-gateway/src/routes/customer.routes.ts.
//
// requireAuth verifies the gateway's signed identity assertion and puts the
// result on res.locals, which is the only thing the controllers now read.

app.get('/api/v1/chat/conversations',               requireAuth, chat.getConversations);
app.get('/api/v1/chat/conversations/:id/messages',  requireAuth, chat.getMessages);
app.post('/api/v1/chat/conversations',              requireAuth, chat.startConversation);
app.post('/api/v1/chat/conversations/:id/messages', requireAuth, chat.sendMessage);
app.put('/api/v1/chat/conversations/:id/read',      requireAuth, chat.markAsRead);
app.get('/api/v1/chat/online',                      requireAuth, chat.getOnlineParticipants);

// ─── Negotiation ("Make an Offer") REST Routes ────────────────────────────────

app.post('/api/v1/chat/offers',                              requireAuth, offer.createOffer);
app.get('/api/v1/chat/offers/:id',                           requireAuth, offer.getOffer);
app.post('/api/v1/chat/offers/:id/accept',                   requireAuth, offer.acceptOffer);
app.post('/api/v1/chat/offers/:id/decline',                  requireAuth, offer.declineOffer);
app.post('/api/v1/chat/offers/:id/counter',                  requireAuth, offer.counterOffer);
app.get('/api/v1/chat/conversations/:conversationId/offers', requireAuth, offer.getConversationOffers);
app.get('/api/v1/chat/products/:productId/offers/mine',      requireAuth, offer.getMyProductOffers);

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
  res.status(error.status ?? 400).json({ success: false, message: error.message }),
);

// ─── HTTP & Socket.io Server Setup ─────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4025);
const server = createServer(app);

// Socket.io CORS: an explicit allowlist, not `origin: '*'`.
//
// The websocket is the one surface a browser reaches directly (customer-web
// dials CHAT_SERVICE_URL; nginx also proxies /chat/ here), so it does need a
// real cross-origin policy — but the previous wildcard let any site on the
// internet open a socket against this service. Paired with `credentials`
// staying off, since the handshake authenticates with a bearer token rather
// than a cookie.
const socketOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new SocketIOServer(server, {
  path: '/ws/chat',
  cors: { origin: socketOrigins },
});

registerChatGateway(io);

async function start() {
  try {
    await connectCache('chat-service');
  } catch (err) {
    console.warn('[chat-service] Redis unavailable — running without cache:', err);
  }

  try {
    await connectMongo();
    console.log('[chat-service] 🍃 MongoDB connected');
  } catch (err) {
    console.warn('[chat-service] MongoDB unavailable — chat/offer persistence will fail:', err);
  }

  try {
    await connectProducer();
  } catch (err) {
    console.warn('[chat-service] Kafka producer failed (non-fatal):', err);
  }

  // Before binding a port: without a verifiable identity secret the REST
  // routes fall back to trusting plain x-user-id headers, which on this
  // service means reading anyone's conversations. Fatal in production, a
  // warning elsewhere — same guard the money-path services use.
  assertInternalIdentityConfigured('chat-service');

  server.listen(PORT, () =>
    console.log(`[chat-service] 🚀 Listening on port ${PORT} (Socket.io at ws://localhost:${PORT}/ws/chat)`),
  );

  async function shutdown(signal: string) {
    console.log(`[chat-service] ${signal} — shutting down`);
    io.close();
    await disconnectProducer();
    await disconnectCache();
    await disconnectMongo();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[chat-service] Fatal startup error:', err);
  process.exit(1);
});

export default app;
