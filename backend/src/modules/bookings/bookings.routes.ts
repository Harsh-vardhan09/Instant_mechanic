import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import * as bookingsController from './bookings.controller.js';
import {
  assignMechanicSchema,
  bookingIdParamSchema,
  changeStatusSchema,
  createBookingSchema,
  listBookingsQuerySchema,
} from './bookings.schema.js';

export const bookingsRouter: Router = Router();

/** GET /api/bookings — paginated, filterable, searchable. */
bookingsRouter.get(
  '/',
  validate(listBookingsQuerySchema, 'query'),
  asyncHandler(bookingsController.list),
);

/** GET /api/bookings/:id — booking with relations and the full event timeline. */
bookingsRouter.get(
  '/:id',
  validate(bookingIdParamSchema, 'params'),
  asyncHandler(bookingsController.getById),
);

/** POST /api/bookings — creates in PENDING and allocates the BK-##### code. */
bookingsRouter.post('/', validate(createBookingSchema), asyncHandler(bookingsController.create));

/** PATCH /api/bookings/:id/status — state-machine guarded; illegal transitions are 409. */
bookingsRouter.patch(
  '/:id/status',
  validate(bookingIdParamSchema, 'params'),
  validate(changeStatusSchema),
  asyncHandler(bookingsController.changeStatus),
);

/** PATCH /api/bookings/:id/assign — idempotent dispatch, guarded by a unique constraint. */
bookingsRouter.patch(
  '/:id/assign',
  validate(bookingIdParamSchema, 'params'),
  validate(assignMechanicSchema),
  asyncHandler(bookingsController.assign),
);
