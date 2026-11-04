/**
 * MUNI Platform — Elasticsearch Client
 * Singleton client with connection management and index helpers.
 */

import { Client } from '@elastic/elasticsearch';

// ─── Singleton Client ─────────────────────────────────────────────────────────

let esClient: Client | null = null;

export function getESClient(): Client {
  if (!esClient) {
    esClient = new Client({
      node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
      auth: process.env.ELASTICSEARCH_USERNAME
        ? {
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD ?? '',
          }
        : undefined,
      tls: process.env.ELASTICSEARCH_TLS === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
      maxRetries:      3,
      requestTimeout:  5000,
    });
  }
  return esClient;
}

export async function connectElasticsearch(): Promise<void> {
  const client = getESClient();
  const info = await client.info();
  console.log(`[elasticsearch] ✅ Connected — cluster: ${info.cluster_name}, version: ${info.version.number}`);
}

export async function disconnectElasticsearch(): Promise<void> {
  if (esClient) {
    await esClient.close();
    esClient = null;
    console.log('[elasticsearch] Disconnected');
  }
}

// ─── Index Setup Helpers ──────────────────────────────────────────────────────

export async function ensureIndex(
  index:   string,
  mapping: Record<string, unknown>,
): Promise<void> {
  const client = getESClient();
  const exists = await client.indices.exists({ index });
  if (!exists) {
    await client.indices.create({ index, body: mapping });
    console.log(`[elasticsearch] Created index: ${index}`);
  }
}

export async function deleteIndex(index: string): Promise<void> {
  const client = getESClient();
  await client.indices.delete({ index });
}
