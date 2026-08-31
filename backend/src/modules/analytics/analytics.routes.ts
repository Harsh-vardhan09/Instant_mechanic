import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import * as analyticsController from './analytics.controller.js';
import { rangeQuerySchema } from './analytics.schema.js';

/**
 * Read-only. Every route is a GET; nothing here writes.
 *
 * REVENUE, everywhere below: COMPLETED bookings only. CANCELLED bookings count toward
 * booking totals but never toward revenue.
 *
 * Mounted below the /api authentication gate — these figures are the business.
 */
export const analyticsRouter: Router = Router();

/** GET /api/analytics/bookings-over-time?range=7d|30d|90d → [{ date, count }], zero-filled */
analyticsRouter.get(
  '/bookings-over-time',
  validate(rangeQuerySchema, 'query'),
  asyncHandler(analyticsController.bookingsOverTime),
);

/** GET /api/analytics/revenue-over-time?range=7d|30d|90d → [{ date, revenue }], zero-filled */
analyticsRouter.get(
  '/revenue-over-time',
  validate(rangeQuerySchema, 'query'),
  asyncHandler(analyticsController.revenueOverTime),
);

/** GET /api/analytics/status-breakdown → [{ status, count, percentage }] */
analyticsRouter.get('/status-breakdown', asyncHandler(analyticsController.statusBreakdown));

/** GET /api/analytics/service-breakdown → [{ category, count, revenue }] */
analyticsRouter.get('/service-breakdown', asyncHandler(analyticsController.serviceBreakdown));

/** GET /api/dashboard → the overview card set in one response. Cached for 30s. */
export const dashboardRouter: Router = Router();
dashboardRouter.get('/', asyncHandler(analyticsController.dashboard));
