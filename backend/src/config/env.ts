import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  DIRECT_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),

  PORT: z.coerce.number().int().positive().max(65535).default(8000),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1, 'at least one origin required')),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => {
    const key = i.path.join('.') || '(root)';
    const missing = i.code === 'invalid_type' && !(key in process.env);
    return `  ${key}: ${missing ? 'missing' : i.message}`;
  });
  throw new Error(
    `Invalid environment configuration:\n${lines.join('\n')}\n` +
      `\nSet these in backend/.env — see backend/.env.example for the expected shape.`,
  );
}

export const env: Env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
