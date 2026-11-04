/**
 * MUNI Platform — Local Schema Registry
 * 
 * A lightweight alternative to Confluent Schema Registry for dev/staging.
 * Stores JSON schemas for all Kafka event types, validates payloads before
 * publishing, and provides a REST API for schema discovery.
 * 
 * In production: swap this for Confluent Schema Registry by setting
 *   SCHEMA_REGISTRY_URL=http://schema-registry:8081
 */

import AjvModule, { type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';

// Both packages ship CommonJS. Under this repo's NodeNext resolution the
// default import is the module namespace rather than the callable, so the
// constructor and the function have to be reached through `.default` when it
// is present. Written as an interop shim rather than a cast so it keeps
// working whichever way the packages are published next.
// Only `compile` is ever called on the instance, so the shape is stated
// rather than derived — `InstanceType<typeof AjvModule>` cannot work here
// because the default import resolves to the module namespace, not the class.
interface AjvInstance {
  compile(schema: unknown): ValidateFunction;
}
type AjvConstructor = new (options?: Record<string, unknown>) => AjvInstance;
type AddFormats = (ajv: AjvInstance) => unknown;

/** The callable, whether the package hands it over directly or under `default`. */
function interop<T>(mod: unknown): T {
  const withDefault = mod as { default?: unknown };
  return (withDefault?.default ?? mod) as T;
}

const Ajv = interop<AjvConstructor>(AjvModule);
const addFormats = interop<AddFormats>(addFormatsModule);

// ─── AJV Setup ────────────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(ajv);

// ─── Schema Registry ──────────────────────────────────────────────────────────

interface SchemaEntry {
  id:         string;
  eventType:  string;
  version:    string;
  schema:     Record<string, unknown>;
  validate:   ValidateFunction;
  registeredAt: string;
}

const registry = new Map<string, SchemaEntry>();

export function registerSchema(
  eventType: string,
  schema:    Record<string, unknown>,
  version   = '1.0',
): void {
  const id = `${eventType}@${version}`;
  const validate = ajv.compile(schema);
  registry.set(id, {
    id, eventType, version, schema, validate,
    registeredAt: new Date().toISOString(),
  });
}

export function getSchema(eventType: string, version = '1.0'): SchemaEntry | undefined {
  return registry.get(`${eventType}@${version}`);
}

export function listSchemas(): Array<Omit<SchemaEntry, 'validate'>> {
  return Array.from(registry.values()).map(({ validate: _, ...rest }) => rest);
}

/**
 * Validate a payload against its registered schema.
 * Returns { valid: true } or { valid: false, errors: string[] }
 */
export function validatePayload(
  eventType: string,
  payload:   unknown,
  version   = '1.0',
): { valid: boolean; errors?: string[] } {
  const entry = getSchema(eventType, version);
  if (!entry) {
    // No schema registered — allow (open schema policy in dev)
    return { valid: true };
  }

  const valid = entry.validate(payload);
  if (valid) return { valid: true };

  const errors = (entry.validate.errors ?? []).map(
    e => `${e.instancePath} ${e.message}`,
  );
  return { valid: false, errors };
}

// ─── Built-in Schemas ─────────────────────────────────────────────────────────
// Register schemas for all core event types on module load.

// Shared sub-schemas
const addressSchema = {
  type: 'object',
  properties: {
    line1:      { type: 'string' },
    city:       { type: 'string' },
    country:    { type: 'string' },
    postalCode: { type: 'string' },
  },
  required: ['line1', 'city', 'country'],
};

// user.registered
registerSchema('user.registered', {
  type: 'object',
  properties: {
    userId:    { type: 'string', minLength: 1 },
    email:     { type: 'string', format: 'email' },
    firstName: { type: 'string' },
    lastName:  { type: 'string' },
    roles:     { type: 'array', items: { type: 'string' } },
  },
  required: ['userId', 'email', 'firstName', 'lastName'],
  additionalProperties: true,
});

// seller.approved
registerSchema('seller.approved', {
  type: 'object',
  properties: {
    sellerId:   { type: 'string' },
    userId:     { type: 'string' },
    storeName:  { type: 'string' },
    email:      { type: 'string', format: 'email' },
    adminId:    { type: 'string' },
    approvedAt: { type: 'string', format: 'date-time' },
  },
  required: ['sellerId', 'userId', 'email'],
  additionalProperties: true,
});

// order.created
registerSchema('order.created', {
  type: 'object',
  properties: {
    orderId:   { type: 'string' },
    userId:    { type: 'string' },
    total:     { type: 'number', minimum: 0 },
    currency:  { type: 'string', minLength: 3, maxLength: 3 },
    subOrders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subOrderId: { type: 'string' },
          sellerId:   { type: 'string' },
          subtotal:   { type: 'number' },
        },
        required: ['subOrderId', 'sellerId', 'subtotal'],
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['orderId', 'userId', 'total', 'currency'],
  additionalProperties: true,
});

// payment.succeeded
registerSchema('payment.succeeded', {
  type: 'object',
  properties: {
    paymentId:     { type: 'string' },
    orderId:       { type: 'string' },
    userId:        { type: 'string' },
    amount:        { type: 'number', minimum: 0 },
    currency:      { type: 'string', minLength: 3, maxLength: 3 },
    transactionId: { type: 'string' },
    sellerId:      { type: 'string' },
    platformFee:   { type: 'number', minimum: 0 },
    sellerPayout:  { type: 'number', minimum: 0 },
  },
  required: ['paymentId', 'orderId', 'userId', 'amount', 'currency'],
  additionalProperties: true,
});

// product.created
registerSchema('product.created', {
  type: 'object',
  properties: {
    productId:  { type: 'string' },
    sellerId:   { type: 'string' },
    name:       { type: 'string', minLength: 1 },
    price:      { type: 'number', minimum: 0 },
    currency:   { type: 'string' },
    categoryId: { type: 'string' },
    stock:      { type: 'integer', minimum: 0 },
  },
  required: ['productId', 'sellerId', 'name', 'price', 'currency'],
  additionalProperties: true,
});

// inventory.reserved
registerSchema('inventory.reserved', {
  type: 'object',
  properties: {
    reservationId: { type: 'string' },
    orderId:       { type: 'string' },
    userId:        { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity:  { type: 'integer', minimum: 1 },
        },
        required: ['productId', 'quantity'],
      },
    },
    expiresAt: { type: 'string', format: 'date-time' },
  },
  required: ['reservationId', 'orderId', 'userId', 'items'],
  additionalProperties: true,
});

// fraud.blocked
registerSchema('fraud.blocked', {
  type: 'object',
  properties: {
    orderId:        { type: 'string' },
    userId:         { type: 'string' },
    score:          { type: 'number', minimum: 0, maximum: 100 },
    decision:       { type: 'string', enum: ['ALLOW', 'REVIEW', 'BLOCK'] },
    triggeredRules: { type: 'array', items: { type: 'string' } },
  },
  required: ['orderId', 'userId', 'score', 'decision'],
  additionalProperties: true,
});

console.log(`[schema-registry] ✅ ${registry.size} schemas registered`);
