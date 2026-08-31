import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email().toLowerCase().trim(),
  password: z
    .string()
    .min(12, 'must be at least 12 characters')
    .max(200, 'must be at most 200 characters'),
  name: z.string().trim().min(1).max(120),
  role: z.enum(['ADMIN', 'OPS']).default('OPS'),
});

export const loginSchema = z.object({
  email: z.email().toLowerCase().trim(),
  // No shape rules on login: telling an attacker the password policy from the login form
  // is free reconnaissance, and a legacy password may not satisfy today's policy.
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
