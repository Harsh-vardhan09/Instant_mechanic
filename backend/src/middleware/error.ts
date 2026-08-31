import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors.js';
import { isProduction } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; stack?: string };
}

interface Mapped {
  statusCode: number;
  code: string;
  /** Safe to send to a client verbatim. */
  message: string;
  details?: unknown;
}

/**
 * Translates a thrown value into a client-safe shape.
 *
 * Prisma messages are never forwarded: they embed table names, column names and sometimes
 * the offending value, which is internal structure at best and customer PII at worst.
 */
function mapError(err: unknown): Mapped {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.expose ? err.message : 'Internal server error',
      ...(err.details === undefined ? {} : { details: err.details }),
    };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = err.meta?.['target'];
        const fields = Array.isArray(target) ? target.join(', ') : undefined;
        return {
          statusCode: 409,
          code: 'CONFLICT',
          message: fields ? `A record with this ${fields} already exists` : 'Record already exists',
        };
      }
      case 'P2025':
        return { statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found' };
      case 'P2003':
        return {
          statusCode: 409,
          code: 'FOREIGN_KEY_CONSTRAINT',
          message: 'Referenced record does not exist, or is still in use',
        };
      default:
        return { statusCode: 500, code: 'DATABASE_ERROR', message: 'Internal server error' };
    }
  }

  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Service temporarily unavailable',
    };
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    // A malformed query is our bug, not the caller's — never echo the query back.
    return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }

  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

/**
 * Central error handler. Registered LAST — after every route and the 404 handler.
 * In production the response body carries a code and a safe message. Never a stack,
 * never a raw Prisma message.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const mapped = mapError(err);

  // Full detail goes to the log (redacted by lib/logger.ts), never to the client.
  const log = {
    err,
    statusCode: mapped.statusCode,
    code: mapped.code,
    path: req.path,
    method: req.method,
  };
  if (mapped.statusCode >= 500) logger.error(log, 'request failed');
  else logger.warn(log, 'request rejected');

  const body: ErrorBody = {
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details === undefined ? {} : { details: mapped.details }),
      ...(isProduction || !(err instanceof Error) ? {} : { stack: err.stack }),
    },
  };

  res.status(mapped.statusCode).json(body);
}

/** 404 for anything no router claimed. Registered just before errorHandler. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Cannot ${req.method} ${req.path}` },
  } satisfies ErrorBody);
}
