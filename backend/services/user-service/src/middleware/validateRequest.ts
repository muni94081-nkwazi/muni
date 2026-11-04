import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';
import ApiError from '../utils/ApiError.js';

/**
 * Validates req.body against a zod schema. On success, replaces req.body
 * with the parsed (and coerced/trimmed) data so downstream code can trust
 * its shape. On failure, forwards a 400 with field-level messages.
 */
export function validateBody(schema: ZodSchema): RequestHandler {
  return function validate(req: Request, _res: Response, next: NextFunction) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    req.body = result.data;
    next();
  };
}

export default validateBody;
