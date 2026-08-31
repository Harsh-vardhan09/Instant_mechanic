import bcrypt from 'bcryptjs';
import type { Role, User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { signToken } from '../../middleware/auth.js';
import { ConflictError, UnauthorizedError } from '../../shared/errors.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

const BCRYPT_ROUNDS = 10;

/**
 * A user as the outside world may see it. passwordHash is absent from the TYPE, not merely
 * deleted at runtime — a controller cannot leak what it was never handed. Every service
 * function returns this, never the Prisma row.
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

/** The single chokepoint where a User row becomes safe to serialise. Explicit pick, not delete. */
function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function register(input: RegisterInput): Promise<SafeUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('A user with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash, name: input.name, role: input.role },
  });
  return toSafeUser(user);
}

/**
 * Unknown email and wrong password return the SAME error. Distinguishing them turns the
 * login form into an account-enumeration oracle.
 *
 * The dummy compare on the unknown-email path matters too: without it, a missing user returns
 * in ~1ms while a real user costs a full bcrypt round, and that timing difference leaks
 * exactly the fact the generic message is hiding.
 */
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function login(input: LoginInput): Promise<{ user: SafeUser; token: string }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid credentials');

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { user: toSafeUser(user), token };
}

/** Resolves the token's subject against the DB, so a deleted user's valid token stops working. */
export async function getCurrentUser(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError('Invalid token');
  return toSafeUser(user);
}
