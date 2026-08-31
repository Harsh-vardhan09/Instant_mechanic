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
import { analyticsRouter, dashboardRouter } from './modules/analytics/analytics.routes.js';
import { bookingsRouter } from './modules/bookings/bookings.routes.js';
import { mechanicsRouter } from './modules/mechanics/mechanics.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { docsRouter } from './docs.js';
import { requireAuth } from './middleware/auth.js';

export function createApp(): Express {
  const app = express();

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
      autoLogging: { ignore: (req: IncomingMessage) => req.url === '/api/health' },
    }),
  );

  app.use('/api', apiLimiter);

  app.use('/api/health', healthRouter);

  app.use('/api/auth', authRouter);

  // Public by design: the assignment calls for a shareable API documentation link, and docs
  // describe the contract rather than expose data. No customer row is reachable from here.
  app.use('/api/docs', docsRouter);

  // ── authentication gate ────────────────────────────────────────────────────
  // Everything below this line requires a valid token. Mount new feature routers BELOW it;
  // a router mounted above it is public.
  app.use('/api', requireAuth);

  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/mechanics', mechanicsRouter);
  app.use('/api/customers', customersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
