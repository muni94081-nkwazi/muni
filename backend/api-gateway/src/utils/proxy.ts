import type { Request, Response } from 'express';
import { getCircuitBreaker, CircuitOpenError } from '../resilience/circuit-breaker.js';
import { getBulkhead, BulkheadFullError, BulkheadTimeoutError } from '../resilience/bulkhead.js';
import { withRetry, UpstreamError } from '../resilience/retry.js';

// ─── Service Registry ─────────────────────────────────────────────────────────
// Maps target base-URLs → logical service names.
// Populated once at startup via registerTargets().

const serviceRegistry = new Map<string, string>();

export function registerTargets(targets: Record<string, string>): void {
  for (const [name, url] of Object.entries(targets)) {
    serviceRegistry.set(url.replace(/\/$/, ''), name);
  }
}

function resolveServiceName(target: string): string {
  return serviceRegistry.get(target.replace(/\/$/, '')) ?? new URL(target).hostname;
}

// ─── Timeout Helper ───────────────────────────────────────────────────────────

const UPSTREAM_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS ?? 8_000);

function makeTimeoutSignal(): [AbortSignal, () => void] {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  return [controller.signal, () => clearTimeout(timer)];
}

// ─── Upstream Response Shape ──────────────────────────────────────────────────

interface UpstreamResponse {
  status:  number;
  headers: Record<string, string>;
  /** Kept out of `headers` so repeated Set-Cookie values survive as separate headers. */
  setCookies: string[];
  body:    Buffer;
}

// ─── Retry Safety ─────────────────────────────────────────────────────────────
//
// Retrying is only safe when repeating the request cannot repeat its effect.
// GET/HEAD/OPTIONS qualify by definition. POST does not: an 8 s timeout on a
// slow-but-succeeding payment used to produce three collection requests, three
// PIN prompts and three debits against one order.
//
// A client-supplied Idempotency-Key restores that safety — the service dedupes
// on the key (see shared/http/idempotency.middleware.ts), so a replay returns
// the original response instead of re-executing.

const RETRY_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function retryAttemptsFor(req: Request): number {
  if (RETRY_SAFE_METHODS.has(req.method))  return 3;
  if (req.header('idempotency-key'))       return 3;
  return 1; // unsafe to repeat — fail fast and let the client decide
}

// ─── Core Resilient Proxy ─────────────────────────────────────────────────────
//
// Call stack per request (outermost → innermost):
//   Bulkhead        → cap concurrency per service
//   CircuitBreaker  → short-circuit when service is unhealthy
//   withRetry       → retry transient failures with exponential backoff
//   fetch()         → actual HTTP call with 8 s AbortController timeout

// ─── Raw Body Passthrough ─────────────────────────────────────────────────────
//
// The gateway parses JSON (`express.json()` in app.ts) and re-serialises it
// below, which is right for the APIs but destroys everything else. A file
// upload arrives as multipart/form-data, which express.json() does not touch:
// `req.body` stays `{}`, so the upstream received the two bytes `{}` under a
// content-type of application/json and multer found no file. Every image
// upload through the gateway failed that way — the browser's request was
// discarded and replaced with an empty JSON object.
//
// So a non-JSON body is read off the socket and forwarded byte-for-byte under
// its original content-type, boundary and all.
//
// Buffered rather than streamed for two reasons: `withRetry` may call
// callUpstream more than once and a consumed stream cannot be replayed, and
// undici requires `duplex: 'half'` for streaming bodies. The cap is above
// media-service's own 20 MB file limit, so the upstream's limit stays the one
// that rejects oversized uploads and reports it properly.

const MAX_PASSTHROUGH_BYTES = 25 * 1024 * 1024;

/**
 * True only when there is a body that express.json() will NOT have parsed.
 *
 * A missing content-type means no body at all — a bodyless browser POST/PATCH,
 * which must keep taking the JSON path below so it is still sent as `{}` with
 * a correct length. Requiring the header keeps that behaviour untouched and
 * limits passthrough to requests that genuinely carry something else.
 */
function needsRawPassthrough(req: Request): boolean {
  if (['GET', 'HEAD'].includes(req.method)) return false;

  const type = req.headers['content-type'];
  if (typeof type !== 'string' || type.length === 0) return false;

  return !type.toLowerCase().includes('application/json');
}

/**
 * Read the unparsed request body. Resolves to null when the stream was already
 * consumed or is empty, which keeps a bodyless POST behaving exactly as before.
 */
function readRawBody(req: Request): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    // body-parser sets this once it has read the stream; re-reading would hang.
    if ((req as Request & { readableEnded?: boolean }).readableEnded) {
      resolve(null);
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PASSTHROUGH_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : null));
    req.on('error', reject);
  });
}

export async function proxy(
  req:    Request,
  res:    Response,
  target: string,
): Promise<void> {
  const serviceName = resolveServiceName(target);

  // Read before the retry/breaker stack: the socket can only be drained once,
  // and every attempt below needs the same bytes.
  let rawBody: Buffer | null = null;
  if (needsRawPassthrough(req)) {
    try {
      rawBody = await readRawBody(req);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({
        success: false,
        message: status === 413 ? 'Request body too large' : 'Could not read request body',
      });
      return;
    }
  }

  const breaker     = getCircuitBreaker(serviceName, {
    failureThreshold: 5,
    successThreshold: 1,
    resetTimeoutMs:   30_000,
    onStateChange: (svc, from, to) =>
      console.warn(`[gateway] Circuit "${svc}": ${from} → ${to}`),
  });
  const bulkhead = getBulkhead(serviceName);

  let upstream: UpstreamResponse;
  try {
    upstream = await bulkhead.call(() =>
      breaker.call(() =>
        withRetry(
          () => callUpstream(req, target, rawBody),
          { maxAttempts: retryAttemptsFor(req), baseDelayMs: 1_000, maxDelayMs: 4_000 },
        ),
      ),
    );
  } catch (err) {
    return handleProxyError(err, serviceName, res);
  }

  // Forward the upstream response to the client
  res.status(upstream.status);
  for (const [key, value] of Object.entries(upstream.headers)) {
    // set-cookie is carried separately — see setCookies below. Copying the
    // flattened value here would emit a corrupted single header.
    if (key !== 'transfer-encoding' && key !== 'set-cookie') res.setHeader(key, value);
  }
  // Set-Cookie is the one header that legitimately repeats, and it must stay
  // split. Collapsing it into a comma-joined string breaks any cookie whose
  // attributes contain a comma — `Expires=Wed, 01 Jan 2025 …` being the common
  // case — so auth-service's refreshToken cookie would arrive unparseable and
  // the shared session across the three frontends would never establish.
  if (upstream.setCookies.length > 0) {
    res.setHeader('set-cookie', upstream.setCookies);
  }
  res.send(upstream.body);
}

// ─── Upstream HTTP Call ───────────────────────────────────────────────────────

async function callUpstream(
  req: Request,
  target: string,
  rawBody: Buffer | null = null,
): Promise<UpstreamResponse> {
  const url = new URL(req.originalUrl, target);

  const reqHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    // content-length describes the bytes the *client* sent. The body below is
    // re-serialised from req.body, so the inbound length can be wrong — and a
    // request that announces a length it does not send leaves the upstream
    // waiting on a body that never arrives, until the 8 s timeout turns it into
    // a 502/504.
    //
    // A browser makes this happen on every bodyless write: fetch and XHR send
    // `content-length: 0` on a POST/PATCH/PUT with no body, express.json()
    // leaves req.body as {}, and JSON.stringify makes that two bytes against a
    // declared zero. Verified against the returns cancel route: identical
    // PATCHes differ only by this header, and the one carrying it times out.
    // fetch() sets the correct length itself.
    if (typeof value === 'string' && key !== 'host' && key !== 'connection' && key !== 'content-length') {
      reqHeaders.set(key, value);
    }
  }
  // Only the re-serialised JSON path may claim application/json. A passthrough
  // body keeps the content-type the client sent — for multipart that carries
  // the boundary, without which the upstream cannot split the parts at all.
  // Overwriting it unconditionally is what silently broke every file upload.
  if (rawBody === null) {
    reqHeaders.set('content-type', 'application/json');
  } else {
    const original = req.headers['content-type'];
    if (typeof original === 'string') reqHeaders.set('content-type', original);
  }

  reqHeaders.set('x-forwarded-for', req.ip ?? '');
  reqHeaders.set(
    'x-request-id',
    (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
  );

  const body = ['GET', 'HEAD'].includes(req.method)
    ? undefined
    : rawBody !== null
      ? new Uint8Array(rawBody)
      : JSON.stringify(req.body);

  const [signal, clearTimer] = makeTimeoutSignal();
  let raw: globalThis.Response;
  try {
    raw = await fetch(url.toString(), { method: req.method, headers: reqHeaders, body, signal });
  } finally {
    clearTimer();
  }

  const responseHeaders: Record<string, string> = {};
  raw.headers.forEach((value, key) => {
    // forEach flattens repeated headers into one comma-joined string. That is
    // lossy for set-cookie, so it is pulled out via getSetCookie() instead.
    if (key !== 'set-cookie') responseHeaders[key] = value;
  });
  const setCookies = raw.headers.getSetCookie();
  const buffer = Buffer.from(await raw.arrayBuffer());

  // Treat 5xx as retryable errors so the retry wrapper can kick in
  if (raw.status >= 500) {
    throw new UpstreamError(raw.status, buffer.toString(), url.toString());
  }

  return { status: raw.status, headers: responseHeaders, setCookies, body: buffer };
}

// ─── Error Handler ────────────────────────────────────────────────────────────

function handleProxyError(err: unknown, serviceName: string, res: Response): void {
  if (res.headersSent) return;

  if (err instanceof CircuitOpenError) {
    console.warn(`[gateway] Circuit OPEN for "${serviceName}" — fast-fail`);
    res.status(503).json({
      message: `Service "${serviceName}" is temporarily unavailable. Please try again shortly.`,
      code:    'CIRCUIT_OPEN',
      service: serviceName,
    });
    return;
  }

  if (err instanceof BulkheadFullError || err instanceof BulkheadTimeoutError) {
    console.warn(`[gateway] Bulkhead rejected for "${serviceName}": ${(err as Error).message}`);
    res.status(503).json({
      message: 'Too many concurrent requests — please try again in a moment.',
      code:    'BULKHEAD_FULL',
      service: serviceName,
    });
    return;
  }

  if (err instanceof UpstreamError) {
    res.status(err.status).json({
      message: `Upstream error from "${serviceName}"`,
      code:    'UPSTREAM_ERROR',
    });
    return;
  }

  // AbortError from our timeout controller
  if (err instanceof Error && err.name === 'AbortError') {
    console.warn(`[gateway] Timeout (${UPSTREAM_TIMEOUT_MS}ms) on "${serviceName}"`);
    res.status(504).json({
      message: `Service "${serviceName}" timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s.`,
      code:    'GATEWAY_TIMEOUT',
      service: serviceName,
    });
    return;
  }

  console.error(`[gateway] Unexpected proxy error for "${serviceName}":`, err);
  res.status(502).json({ message: 'Bad gateway', code: 'BAD_GATEWAY' });
}
