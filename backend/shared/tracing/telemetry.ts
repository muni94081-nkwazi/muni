import { randomUUID } from 'node:crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export class TelemetryTracer {
  /** Create or propagate distributed trace context from HTTP headers */
  static extractOrCreateTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext {
    const parentTraceId = (headers['x-trace-id'] as string) || (headers['traceparent'] as string);
    const traceId = parentTraceId ? parentTraceId.split('-')[1] || parentTraceId : randomUUID();
    const spanId = randomUUID().replace(/-/g, '').substring(0, 16);

    return {
      traceId,
      spanId,
      parentSpanId: parentTraceId ? parentTraceId.substring(0, 16) : undefined,
    };
  }

  /** Format traceparent header for outbound HTTP requests */
  static formatTraceParent(traceContext: TraceContext): string {
    return `00-${traceContext.traceId}-${traceContext.spanId}-01`;
  }
}
