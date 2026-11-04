import type { NextFunction, Request, Response } from 'express';
import ApiError from '../utils/ApiError.js';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export default notFound;
