import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import * as authController from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schema.js';

export const authRouter: Router = Router();

/**
 * Registration is ADMIN-only, enforced here on the route.
 *
 * Why guard rather than leave it open: this dashboard sits in front of customer PII and
 * revenue, so an open /register is a public door into that data. Why guard rather than drop
 * the endpoint entirely: ops teams change, and admins need to add a colleague without a
 * deploy. The bootstrap problem — no admin exists to create the first admin — is solved out
 * of band by `npm run db:seed`, which is the only way an ADMIN comes into existence.
 */
authRouter.post(
  '/register',
  requireAuth,
  requireRole('ADMIN'),
  validate(registerSchema),
  asyncHandler(authController.register),
);

// Public. authLimiter caps this at 5 attempts / 15 min / IP — the one route where an
// attacker otherwise gets unlimited free guesses.
authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));

authRouter.get('/me', requireAuth, asyncHandler(authController.me));

authRouter.post('/logout', requireAuth, authController.logout);
