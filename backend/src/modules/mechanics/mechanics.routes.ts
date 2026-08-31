import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import * as mechanicsController from './mechanics.controller.js';
import {
  listMechanicsQuerySchema,
  mechanicIdParamSchema,
  updateMechanicStatusSchema,
} from './mechanics.schema.js';

export const mechanicsRouter: Router = Router();

/** GET /api/mechanics — paginated; each row carries its current or most recent booking. */
mechanicsRouter.get(
  '/',
  validate(listMechanicsQuerySchema, 'query'),
  asyncHandler(mechanicsController.list),
);

/** GET /api/mechanics/:id — detail plus recent bookings. */
mechanicsRouter.get(
  '/:id',
  validate(mechanicIdParamSchema, 'params'),
  asyncHandler(mechanicsController.getById),
);

/** PATCH /api/mechanics/:id/status */
mechanicsRouter.patch(
  '/:id/status',
  validate(mechanicIdParamSchema, 'params'),
  validate(updateMechanicStatusSchema),
  asyncHandler(mechanicsController.updateStatus),
);
