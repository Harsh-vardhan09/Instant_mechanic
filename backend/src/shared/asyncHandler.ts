import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async handler so a rejected promise reaches middleware/error.ts instead of
 * becoming an unhandled rejection. Express 5 forwards rejections natively, but wrapping
 * keeps the contract explicit and survives a downgrade.
 */
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
