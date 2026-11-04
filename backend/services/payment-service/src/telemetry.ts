// ─── Telemetry bootstrap ──────────────────────────────────────────────────────
//
// Imported as the FIRST line of this service's entrypoint, and doing its work
// at module scope rather than exporting a function to call.
//
// That shape is deliberate. ES module imports are hoisted and evaluated before
// any statement in the importing file runs, so an `initTracer()` call written
// as a statement in app.ts would execute *after* express, amqplib and the
// database drivers had already loaded — too late for OpenTelemetry to patch
// them, and the auto-instrumentation would silently produce nothing. Importing
// a module that starts tracing on evaluation is what actually runs it first.
import { startTracing } from '../../../shared/tracing/tracer.js';

startTracing('payment-service');
