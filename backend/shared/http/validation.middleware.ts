import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

// ─── Request Validation ───────────────────────────────────────────────────────
//
// One place where an invalid request body becomes a 400, so every service
// answers a malformed request the same way instead of each inventing a shape.
//
// Two things this deliberately does NOT do:
//
//   • Leak internals. A ZodError's `.message` is a multi-line JSON dump of
//     every issue including the parsed input; several services were returning
//     it verbatim as `message`. The response here carries a flat
//     field → messages map and nothing else. Non-Zod errors never reach the
//     client at all.
//
//   • Swallow real failures. Handlers that wrapped `schema.parse()` and the
//     service call in one try/catch answered 400 for both, so a database
//     outage was reported to the customer as "your request is invalid".
//     Validating in middleware means only validation can produce a 400 here.
//
// The parsed value replaces the raw one, so handlers read stripped, coerced,
// correctly-typed data — unknown keys are gone by the time a handler sees them.

export interface ValidationErrorBody {
  success: false;
  message: string;
  errors: Record<string, string[]>;
}

/** Flatten a ZodError into `{ field: [messages] }`, including form-level issues. */
export function formatZodError(error: ZodError): Record<string, string[]> {
  const flattened = error.flatten();
  const errors: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (messages && messages.length > 0) errors[field] = messages;
  }

  // `.refine()` on the object itself produces form-level issues with no field
  // to attach to — dropping them would report "invalid" with an empty errors
  // map, which tells the caller nothing.
  if (flattened.formErrors.length > 0) errors._ = flattened.formErrors;

  return errors;
}

/** Send the standard 400. Exported for handlers that parse inline. */
export function respondInvalid(res: Response, error: ZodError, message = 'Invalid request'): void {
  const body: ValidationErrorBody = {
    success: false,
    message,
    errors: formatZodError(error),
  };
  res.status(400).json(body);
}

type Source = 'body' | 'params' | 'query';

function validate(source: Source, schema: ZodSchema, message: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      respondInvalid(res, result.error, message);
      return;
    }

    // `req.query` and `req.params` are getter-only on newer Express versions,
    // so assigning to them throws. Mutating in place keeps this working on
    // both without the caller needing to care which it is.
    if (source === 'body') {
      req.body = result.data;
    } else {
      const target = req[source] as Record<string, unknown>;
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, result.data);
    }

    next();
  };
}

/** Validate and replace `req.body`. */
export const validateBody = (schema: ZodSchema) =>
  validate('body', schema, 'Invalid request body');

/** Validate and replace `req.params`. */
export const validateParams = (schema: ZodSchema) =>
  validate('params', schema, 'Invalid request parameters');

/** Validate and replace `req.query`. */
export const validateQuery = (schema: ZodSchema) =>
  validate('query', schema, 'Invalid query parameters');
