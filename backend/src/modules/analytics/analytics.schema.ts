import { z } from 'zod';

/** Windows the time-series endpoints accept. Anything else is a 400, not a silent default. */
export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

export const rangeQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
});

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
