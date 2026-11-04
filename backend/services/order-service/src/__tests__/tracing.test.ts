import { describe, it, expect, beforeAll } from '@jest/globals';
import { trace, context, propagation, ROOT_CONTEXT } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

import {
  injectTraceHeaders,
  extractTraceContext,
  withExtractedContext,
  currentTraceContext,
} from '../../../../shared/tracing/tracer.js';

// ─── Trace context propagation ────────────────────────────────────────────────
//
// The money path crosses two boundaries the auto-instrumentation cannot be
// trusted to bridge on its own: an outgoing HTTP call carrying explicit
// headers, and a RabbitMQ message. Both are propagated explicitly in
// shared/tracing, and these assert that a span created on the far side really
// is a child of the one that sent it — not a new, orphaned trace.
//
// Runs against a real in-memory tracer provider rather than the OTLP exporter,
// so no collector is needed and the assertions are about span relationships
// rather than about what Jaeger happened to receive.

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  // A context manager is what makes `context.active()` follow async work;
  // without it every span would look like a root and these tests would pass
  // for the wrong reason.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);
});

const tracer = () => trace.getTracer('tracing-test');

describe('injectTraceHeaders', () => {
  it('writes a W3C traceparent carrying the active span', () => {
    const span = tracer().startSpan('outgoing-http-call');

    const carrier = context.with(trace.setSpan(context.active(), span), () =>
      injectTraceHeaders({ 'content-type': 'application/json' }),
    );
    span.end();

    expect(carrier.traceparent).toBeDefined();
    // 00-<32 hex trace id>-<16 hex span id>-<2 hex flags>
    expect(String(carrier.traceparent)).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    // Existing headers survive — this is spread into real request headers.
    expect(carrier['content-type']).toBe('application/json');
  });

  it('carries the id of the span that is actually active', () => {
    const span = tracer().startSpan('parent');
    const { traceId } = span.spanContext();

    const carrier = context.with(trace.setSpan(context.active(), span), () => injectTraceHeaders());
    span.end();

    expect(String(carrier.traceparent)).toContain(traceId);
  });

  it('leaves the carrier alone when there is nothing to propagate', () => {
    const carrier = context.with(ROOT_CONTEXT, () => injectTraceHeaders({ existing: 'kept' }));

    expect(carrier.traceparent).toBeUndefined();
    expect(carrier.existing).toBe('kept');
  });
});

describe('extractTraceContext — the HTTP hop', () => {
  it('a span created from extracted headers is a child of the sender', () => {
    // Sender: gateway → checkout-service.
    const clientSpan = tracer().startSpan('client-request');
    const carrier = context.with(trace.setSpan(context.active(), clientSpan), () =>
      injectTraceHeaders(),
    );
    clientSpan.end();

    // Receiver: rebuilds the parent from the request headers.
    const serverSpan = context.with(extractTraceContext(carrier), () =>
      tracer().startSpan('server-handler'),
    );
    serverSpan.end();

    expect(serverSpan.spanContext().traceId).toBe(clientSpan.spanContext().traceId);
    expect(serverSpan.spanContext().spanId).not.toBe(clientSpan.spanContext().spanId);
  });

  it('starts a fresh trace when the caller sent no traceparent', () => {
    const orphan = context.with(extractTraceContext({}), () => tracer().startSpan('unparented'));
    orphan.end();

    // Valid, just not joined to anything — an uninstrumented caller must not
    // break the receiving service.
    expect(orphan.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('withExtractedContext — the RabbitMQ hop', () => {
  it('handler spans join the trace the message was published under', () => {
    // Publisher: order.created / payment.completed carry these headers.
    const publishSpan = tracer().startSpan('publish payment.completed');
    const headers = context.with(trace.setSpan(context.active(), publishSpan), () =>
      injectTraceHeaders({ 'x-retry-count': 0, service: 'payment-service' }),
    );
    publishSpan.end();

    // Consumer: order-service settling the paid order's stock.
    let consumerTraceId = '';
    withExtractedContext(headers, () => {
      const span = tracer().startSpan('settle inventory');
      consumerTraceId = span.spanContext().traceId;
      span.end();
    });

    expect(consumerTraceId).toBe(publishSpan.spanContext().traceId);
  });

  it('keeps the queue metadata the consumer relies on', () => {
    const span = tracer().startSpan('publish');
    const headers = context.with(trace.setSpan(context.active(), span), () =>
      injectTraceHeaders({ 'x-retry-count': 2, service: 'payment-service' }),
    );
    span.end();

    // The retry counter drives the DLQ path — propagation must not clobber it.
    expect(headers['x-retry-count']).toBe(2);
    expect(headers.service).toBe('payment-service');
    expect(headers.traceparent).toBeDefined();
  });

  it('returns the handler result and propagates its errors', () => {
    expect(withExtractedContext({}, () => 'handled')).toBe('handled');
    expect(() => withExtractedContext({}, () => { throw new Error('boom'); })).toThrow('boom');
  });
});

describe('currentTraceContext — log correlation', () => {
  it('reports the active span so a log line can be pivoted to its trace', () => {
    const span = tracer().startSpan('work');

    const ctx = context.with(trace.setSpan(context.active(), span), () => currentTraceContext());
    span.end();

    expect(ctx.traceId).toBe(span.spanContext().traceId);
    expect(ctx.spanId).toBe(span.spanContext().spanId);
  });

  it('returns an empty object outside a span, so log keys are simply absent', () => {
    // Spread into a log payload unconditionally — `{...{}}` adds nothing,
    // whereas a null traceId would look like a dropped trace in the index.
    expect(context.with(ROOT_CONTEXT, () => currentTraceContext())).toEqual({});
  });
});
