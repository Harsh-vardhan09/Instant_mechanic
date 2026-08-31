import pino from 'pino';
import { env, isProduction } from '../config/env.js';

/**
 * Structured logger. The redact list is the enforcement point for "no secrets, tokens or
 * customer PII in logs" — it is not advisory, pino removes these paths before serialising.
 * Add a path here the moment a new sensitive field enters a logged object.
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProduction ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      "res.headers['set-cookie']",
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.jwt',
      '*.email',
      '*.phone',
      '*.DATABASE_URL',
      '*.DIRECT_URL',
      '*.JWT_SECRET',
    ],
    censor: '[redacted]',
  },
  // JSON to stdout in every environment. pino-pretty is deliberately NOT a dependency —
  // pipe through it locally instead: npm run dev | npx pino-pretty
});
