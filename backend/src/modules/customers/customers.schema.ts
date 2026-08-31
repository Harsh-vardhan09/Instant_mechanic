import { z } from 'zod';

export const CUSTOMER_SORTABLE = [
  'name',
  'createdAt',
  'bookingCount',
  'totalSpent',
  'city',
] as const;

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(CUSTOMER_SORTABLE).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const customerIdParamSchema = z.object({ id: z.string().min(1) });
