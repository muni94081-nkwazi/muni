import type { NextFunction, Request, RequestHandler, Response } from 'express';
import ApiError from '../utils/ApiError.js';

/**
 * Restricts a route to the given role(s). Must run after `authenticate`,
 * which populates `req.user.role`.
 */
export function requireRole(...roles: string[]): RequestHandler {
  return function checkRole(req: Request, _res: Response, next: NextFunction) {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }
    next();
  };
}

export default requireRole;
