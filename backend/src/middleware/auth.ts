import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../shared/errors.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const JWT_EXPIRES_IN = '7d';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string') throw new UnauthorizedError('Invalid token');

  const claims = decoded as jwt.JwtPayload & Partial<JwtPayload>;
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string' ||
    typeof claims.role !== 'string'
  ) {
    throw new UnauthorizedError('Invalid token');
  }
  return { sub: claims.sub, email: claims.email, role: claims.role as Role };
}

function bearerFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Rejects any request without a valid, unexpired token. */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = bearerFrom(req);
  if (!token) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    // Expired vs malformed is not the caller's business — both are simply "not authenticated".
    next(
      err instanceof jwt.TokenExpiredError
        ? new UnauthorizedError('Token expired')
        : new UnauthorizedError('Invalid token'),
    );
  }
};

export const requireRole =
  (...roles: readonly Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Not permitted'));
      return;
    }
    next();
  };
