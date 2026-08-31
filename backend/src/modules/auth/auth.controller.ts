import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';
import * as authService from './auth.service.js';

/** HTTP in, HTTP out. No Prisma, no hashing, no token logic — all of that is the service's job. */

export async function register(req: Request, res: Response): Promise<void> {
  const user = await authService.register(req.body as RegisterInput);
  res.status(201).json({ data: user });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json({ data: result });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  const user = await authService.getCurrentUser(req.user.sub);
  res.status(200).json({ data: user });
}

export function logout(_req: Request, res: Response): void {
  // JWTs are stateless: nothing server-side to invalidate. The client discards the token.
  // ponytail: no revocation list — a stolen token stays valid until its 7d expiry. Add a
  // Redis denylist keyed on jti if forced logout or breach response becomes a requirement.
  res.status(200).json({ data: { message: 'Logged out. Discard the token client-side.' } });
}
