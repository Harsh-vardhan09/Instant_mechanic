import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

type Source = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodType, source: Source = 'body'): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // req.query is a getter in Express 5 — define instead of assign.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
