import { logger } from '../utils/logger.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_PROVIDER } from '../config/index.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const HUGGINGFACE_FEATURE_EXTRACTION_URL = `https://api-inference.huggingface.co/pipeline/feature-extraction/${EMBEDDING_MODEL}`;

const OPENAI_BATCH_SIZE = 96;

// Small query-embedding cache — the same handful of search terms get re-issued
// constantly (autocomplete keystrokes, repeat searches), so this avoids paying
// the embedding API cost/latency on every request.
const QUERY_EMBEDDING_CACHE = new Map<string, number[]>();
const QUERY_EMBEDDING_CACHE_MAX = 500;

function cacheKey(text: string): string {
  return `${EMBEDDING_PROVIDER}:${EMBEDDING_MODEL}:${text}`;
}

function cacheGet(text: string): number[] | undefined {
  return QUERY_EMBEDDING_CACHE.get(cacheKey(text));
}

function cacheSet(text: string, vector: number[]): void {
  if (QUERY_EMBEDDING_CACHE.size >= QUERY_EMBEDDING_CACHE_MAX) {
    const oldestKey = QUERY_EMBEDDING_CACHE.keys().next().value;
    if (oldestKey !== undefined) QUERY_EMBEDDING_CACHE.delete(oldestKey);
  }
  QUERY_EMBEDDING_CACHE.set(cacheKey(text), vector);
}

/** Deterministic offline fallback: a hashed bag-of-trigrams embedding, L2-normalized.
 *  Not a real semantic model — it only captures shared substrings between texts —
 *  but it lets hybrid search run end-to-end without any external API key configured,
 *  which matters for local dev and CI. Production should set EMBEDDING_PROVIDER=openai
 *  (or huggingface) with a real key.
 */
function localHashEmbedding(text: string, dims: number): number[] {
  const vector = new Array(dims).fill(0);
  const normalized = text.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const grams: string[] = [];
  for (const token of tokens) {
    grams.push(`w:${token}`);
    const padded = `  ${token}  `;
    for (let i = 0; i < padded.length - 2; i++) {
      grams.push(`t:${padded.slice(i, i + 3)}`);
    }
  }
  if (grams.length === 0) return vector;

  for (const gram of grams) {
    let hash = 2166136261; // FNV-1a offset basis
    for (let i = 0; i < gram.length; i++) {
      hash ^= gram.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % dims;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

async function embedViaOpenAI(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    logger.warn('EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set; falling back to local embeddings');
    return texts.map((t) => localHashEmbedding(t, EMBEDDING_DIMENSIONS));
  }

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPENAI_BATCH_SIZE);
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`OpenAI embeddings request failed (${response.status}): ${errBody}`);
    }

    const json = (await response.json()) as { data: { embedding: number[]; index: number }[] };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    results.push(...sorted.map((d) => d.embedding));
  }
  return results;
}

async function embedViaHuggingFace(texts: string[]): Promise<number[][]> {
  if (!HUGGINGFACE_API_KEY) {
    logger.warn('EMBEDDING_PROVIDER=huggingface but HUGGINGFACE_API_KEY is not set; falling back to local embeddings');
    return texts.map((t) => localHashEmbedding(t, EMBEDDING_DIMENSIONS));
  }

  const response = await fetch(HUGGINGFACE_FEATURE_EXTRACTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
    },
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`HuggingFace embeddings request failed (${response.status}): ${errBody}`);
  }

  const json = (await response.json()) as number[][];
  return json;
}

async function embedBatchRaw(texts: string[]): Promise<number[][]> {
  switch (EMBEDDING_PROVIDER) {
    case 'openai':
      return embedViaOpenAI(texts);
    case 'huggingface':
      return embedViaHuggingFace(texts);
    default:
      return texts.map((t) => localHashEmbedding(t, EMBEDDING_DIMENSIONS));
  }
}

/** Embed a batch of product documents' text (indexing path — not cached, always fresh). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    return await embedBatchRaw(texts);
  } catch (error) {
    logger.error('Batch embedding failed, falling back to local hashing embedding', {
      error: (error as Error).message,
    });
    return texts.map((t) => localHashEmbedding(t, EMBEDDING_DIMENSIONS));
  }
}

/** Embed a single search query (query path — cached). */
export async function embedQuery(text: string): Promise<number[]> {
  const cached = cacheGet(text);
  if (cached) return cached;

  let vector: number[];
  try {
    const [result] = await embedBatchRaw([text]);
    vector = result;
  } catch (error) {
    logger.error('Query embedding failed, falling back to local hashing embedding', {
      error: (error as Error).message,
    });
    vector = localHashEmbedding(text, EMBEDDING_DIMENSIONS);
  }

  cacheSet(text, vector);
  return vector;
}

export function productTextForEmbedding(doc: {
  name?: string;
  description?: string;
  brand?: string;
  category?: string;
  tags?: string[];
}): string {
  return [doc.name, doc.brand, doc.category, doc.description, ...(doc.tags ?? [])]
    .filter(Boolean)
    .join(' — ');
}
