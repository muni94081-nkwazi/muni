/**
 * MUNI Platform — RabbitMQ Connection Manager
 * Single pooled connection per process, with automatic reconnect on drop,
 * plus named channel pooling so publishers/consumers reuse one channel
 * each instead of opening a new one per call.
 */

import amqp, { type Channel, type ChannelModel, type ConfirmChannel } from 'amqplib';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS     = 30_000;

function getUrl(): string {
  return process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
}

let connection:  ChannelModel | null = null;
let connecting:  Promise<ChannelModel> | null = null;
let connected    = false;
let shuttingDown = false;
let reconnectAttempts = 0;

const channels = new Map<string, Channel | ConfirmChannel>();

export async function connectRabbitMQ(): Promise<ChannelModel> {
  if (connection && connected) return connection;
  if (connecting) return connecting;

  connecting = (async () => {
    const conn = await amqp.connect(getUrl());
    connected = true;
    reconnectAttempts = 0;
    console.log('[rabbitmq:connection] ✅ Connected');

    conn.on('error', (err: Error) => console.error('[rabbitmq:connection] Error:', err.message));
    conn.on('close', () => {
      connected = false;
      channels.clear();
      connection = null;
      if (!shuttingDown) {
        console.warn('[rabbitmq:connection] Connection closed unexpectedly — scheduling reconnect');
        scheduleReconnect();
      }
    });

    connection = conn;
    connecting = null;
    return conn;
  })();

  try {
    return await connecting;
  } catch (err) {
    connecting = null;
    connected = false;
    console.error('[rabbitmq:connection] Connect failed:', (err as Error).message);
    scheduleReconnect();
    throw err;
  }
}

function scheduleReconnect(): void {
  reconnectAttempts += 1;
  const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** (reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
  console.warn(`[rabbitmq:connection] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setTimeout(() => {
    connectRabbitMQ().catch(() => {
      // Error already logged in connectRabbitMQ(); scheduleReconnect() runs again from the catch above.
    });
  }, delay);
}

/**
 * Get (or lazily create) a named, pooled channel. Callers should use a
 * stable name per role (e.g. 'publisher', 'consumer:order-events') so the
 * same channel is reused across calls instead of exhausting the broker's
 * per-connection channel limit.
 */
export async function getChannel(name: string, confirm = false): Promise<Channel | ConfirmChannel> {
  const existing = channels.get(name);
  if (existing) return existing;

  const conn    = await connectRabbitMQ();
  const channel = confirm ? await conn.createConfirmChannel() : await conn.createChannel();

  channel.on('error', (err: Error) => console.error(`[rabbitmq:channel:${name}] Error:`, err.message));
  channel.on('close', () => {
    channels.delete(name);
    if (!shuttingDown) console.warn(`[rabbitmq:channel:${name}] Closed`);
  });

  channels.set(name, channel);
  return channel;
}

export function isRabbitMQReady(): boolean {
  return connected;
}

export async function disconnectRabbitMQ(): Promise<void> {
  shuttingDown = true;

  for (const channel of channels.values()) {
    await channel.close().catch(() => {});
  }
  channels.clear();

  if (connection) {
    await connection.close().catch(() => {});
    connection = null;
  }
  connected = false;

  console.log('[rabbitmq:connection] Disconnected');
}
