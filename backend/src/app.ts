import type { IncomingMessage } from 'node:http';
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { requireAuth } from './middleware/auth.js';

/**
 * Express app assembly. Order is the contract:
 *   security headers → cors → compression → body parse → logging → rate limit
 *   → routes → 404 → error handler (LAST).
 */
export function createApp(): Express {
  const app = express();

  // Behind AWS ALB/nginx: trust one proxy hop so req.ip is the real client and the rate
  // limiter keys on it rather than on the load balancer.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(
    pinoHttp({
      logger,
      // Health checks are high-frequency and low-information; keep them out of the log at info.
      autoLogging: { ignore: (req: IncomingMessage) => req.url === '/api/health' },
    }),
  );

  app.use('/api', apiLimiter);

  // ── public surface ─────────────────────────────────────────────────────────
  // Only these two are reachable without a token.
  app.use('/api/health', healthRouter);

  // The auth router guards itself per-route: /login is public, /me, /logout and /register
  // declare their own requireAuth (and /register additionally requireRole("ADMIN")).
  app.use('/api/auth', authRouter);

  // ── authentication gate ────────────────────────────────────────────────────
  // EVERYTHING mounted below this line requires a valid token. This dashboard sits in front
  // of customer PII and revenue, so the default is closed, not open.
  // Mount new feature routers BELOW this line. A router mounted above it is public.
  app.use('/api', requireAuth);

  // Feature routers mount here as each module lands.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
