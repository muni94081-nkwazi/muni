import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';
import ApiError from '../utils/ApiError.js';

interface WithParsed extends Request {
  /** Validated, coerced query params. Express 5 makes req.query read-only,
   *  so parsed values live here instead of overwriting it. */
  parsedQuery?: unknown;
}

function toDetails(issues: readonly { path: readonly (string | number)[]; message: string }[]) {
  return issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
}

export function validateBody(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(ApiError.badRequest('Validation failed', toDetails(result.error.issues)));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(ApiError.badRequest('Validation failed', toDetails(result.error.issues)));
    }
    (req as WithParsed).parsedQuery = result.data;
    next();
  };
}

/** Reads what validateQuery stored. Only call on a route that used it. */
export function parsedQuery<T>(req: Request): T {
  return (req as WithParsed).parsedQuery as T;
}
