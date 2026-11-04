import type { NextFunction, Request, Response } from 'express';
import { readAccessToken } from '../../shared/utils/token.js';

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const identity = readAccessToken(token);
  if (identity) {
    req.headers['x-user-id'] = identity.userId;
    req.headers['x-user-roles'] = identity.roles.join(',');
  }
  next();
}
