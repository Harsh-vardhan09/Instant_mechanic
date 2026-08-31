import rateLimit from 'express-rate-limit';
import { isProduction } from '../config/env.js';

/** Blanket limiter for /api. Generous — it stops runaway clients and scripted abuse, not operators. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: isProduction ? 100 : 1_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests, try again shortly',
    },
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many attempts, try again later',
    },
  },
});
