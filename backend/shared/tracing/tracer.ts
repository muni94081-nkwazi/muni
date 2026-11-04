// ─── OpenTelemetry Tracer ─────────────────────────────────────────────────────
//
// Initialises the OpenTelemetry SDK with:
//   • OTLP/HTTP exporter → Jaeger (http://localhost:4318/v1/traces)
//   • Auto-instrumentation for Express (HTTP spans) and node:http
//   • Manual span API exported for explicit instrumentation
//
// IMPORTANT: Call initTracer() as the VERY FIRST LINE of your service entrypoint,
// before any other imports, so instrumentation patches load before the libraries.
//
// Usage:
//   import { initTracer } from '../../../shared/tracing/tracer.js';
//   initTracer('order-service');
//   // ... rest of imports

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  trace,
  context,
  propagation,
  SpanStatusCode,
  type Context,
  type Span,
  type Tracer,
} from '@opentelemetry/api';

export { trace, context, propagation, SpanStatusCode };
export type { Span, Tracer };

/**
 * Resolve the OTLP traces endpoint.
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is by convention the collector's BASE url —
 * docker-compose sets `http://jaeger:4318` — while `OTLPTraceExporter({ url })`
 * takes the full signal path and uses it verbatim. Passing the base straight
 * through POSTs traces to `/` instead of `/v1/traces`, which Jaeger answers
 * with a 404 and the exporter reports only as a periodic export failure. The
 * services look instrumented and no spans ever arrive.
 *
 * Appending the signal path when it is absent makes both spellings work.
 */
function resolveTracesEndpoint(): string {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!raw) return 'http://localhost:4318/v1/traces';

  const base = raw.replace(/\/+$/, '');
  return base.endsWith('/v1/traces') ? base : `${base}/v1/traces`;
}

const JAEGER_ENDPOINT = resolveTracesEndpoint();

let sdk: NodeSDK | null = null;

export function initTracer(
  serviceName:   string,
  serviceVersion = '1.0.0',
): void {
  const exporter = new OTLPTraceExporter({ url: JAEGER_ENDPOINT });

  // Merge default resource (auto-detects host, process) with our custom attributes
  const resource = defaultResource().merge(
    resourceFromAttributes({
      'service.name':           serviceName,
      'service.version':        serviceVersion,
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
  );

  sdk = new NodeSDK({
    resource,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs':  { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          requestHook: (span, req) => {
            const headers = (req as { headers?: Record<string, string> }).headers;
            if (headers?.['x-request-id']) {
              span.setAttribute('http.request_id', headers['x-request-id']);
            }
          },
        },
      }),
    ],
  });

  sdk.start();
  console.log(`[tracer] ✅ OpenTelemetry started for "${serviceName}" → ${JAEGER_ENDPOINT}`);

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT',  () => shutdown());
}

async function shutdown() {
  if (sdk) {
    await sdk.shutdown().catch((e) => console.error('[tracer] Shutdown error:', e));
  }
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

/**
 * Start tracing without letting it take the service down.
 *
 * Telemetry is not worth an outage. A missing OTLP collector, an OTEL package
 * absent from a slimmed production image, or a bad endpoint must degrade to
 * "no traces" — never to a service that will not boot. `initTracer` throwing
 * inside a first-line import would do exactly that, before any error handler
 * exists to catch it.
 *
 * Returns whether tracing actually started, so a caller can log the fact.
 */
export function startTracing(serviceName: string, serviceVersion = '1.0.0'): boolean {
  if (process.env.OTEL_SDK_DISABLED === 'true') {
    console.log(`[tracer] disabled by OTEL_SDK_DISABLED for "${serviceName}"`);
    return false;
  }

  try {
    initTracer(serviceName, serviceVersion);
    return true;
  } catch (err) {
    console.warn(
      `[tracer] ⚠️  tracing unavailable for "${serviceName}" — continuing without it:`,
      (err as Error).message,
    );
    return false;
  }
}

export function getTracer(serviceName: string): Tracer {
  return trace.getTracer(serviceName);
}

export interface TraceContext {
  traceId?: string;
  spanId?:  string;
}

/**
 * The active span's ids, for correlating a log line with a trace.
 *
 * Returns an empty object when nothing is sampled or tracing never started, so
 * callers can spread it into a log payload unconditionally rather than
 * branching at every call site.
 */
export function currentTraceContext(): TraceContext {
  const span = trace.getActiveSpan();
  if (!span) return {};

  const ctx = span.spanContext();
  // An all-zero trace id is OTEL's "invalid span context" sentinel — emitting
  // it as a real id would litter the logs with unsearchable placeholders.
  if (!ctx.traceId || /^0+$/.test(ctx.traceId)) return {};

  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

/**
 * Wrap an async function in a named span.
 * Automatically records exceptions and marks span status on error.
 *
 * Example:
 *   const result = await withSpan('db.findProduct', tracer, () => db.find(id));
 */
export async function withSpan<T>(
  spanName:    string,
  tracer:      Tracer,
  fn:          (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

// ─── Context propagation across non-HTTP boundaries ───────────────────────────
//
// HTTP is handled for us: the auto-instrumentation injects `traceparent` on
// outgoing requests and extracts it on incoming ones. A message queue is not,
// in any way we can rely on — so the carrier is written and read explicitly
// here, which also makes propagation something a test can assert on rather
// than a side effect of a patched library.
//
// W3C Trace Context (`traceparent` / `tracestate`) is the wire format, so a
// consumer written in another language or another OTEL version still joins the
// same trace.

/**
 * Write the active trace context into a header carrier.
 *
 * Returns the carrier so it can be spread straight into a message's headers.
 * A no-op when nothing is sampled, which leaves the carrier untouched rather
 * than writing an invalid `traceparent` a consumer would then try to join.
 */
export function injectTraceHeaders(
  carrier: Record<string, unknown> = {},
): Record<string, unknown> {
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Rebuild the parent context a message was published under.
 *
 * Pass the result to `context.with(...)` so spans created while handling the
 * message become children of the publisher's span instead of starting a new,
 * disconnected trace.
 */
export function extractTraceContext(carrier: Record<string, unknown> = {}): Context {
  return propagation.extract(context.active(), carrier);
}

/**
 * Run `fn` as a continuation of the trace a message carries.
 *
 * Consumers use this so the work they do on a message shows up under the
 * request that caused it — a checkout's payment confirmation and the stock
 * deduction it triggers land in one trace rather than two.
 */
export function withExtractedContext<T>(carrier: Record<string, unknown>, fn: () => T): T {
  return context.with(extractTraceContext(carrier), fn);
}
