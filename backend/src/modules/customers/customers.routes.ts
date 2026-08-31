import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import * as customersController from './customers.controller.js';
import { customerIdParamSchema, listCustomersQuerySchema } from './customers.schema.js';

export const customersRouter: Router = Router();

/** GET /api/customers — paginated, searchable, with lifetime bookingCount and totalSpent. */
customersRouter.get(
  '/',
  validate(listCustomersQuerySchema, 'query'),
  asyncHandler(customersController.list),
);

/** GET /api/customers/:id — detail with vehicles and booking history. */
customersRouter.get(
  '/:id',
  validate(customerIdParamSchema, 'params'),
  asyncHandler(customersController.getById),
);
