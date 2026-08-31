import { z } from 'zod';

export const MECHANIC_SORTABLE = [
  'name',
  'rating',
  'jobsCompleted',
  'createdAt',
  'status',
] as const;

const mechanicStatus = z.enum(['AVAILABLE', 'ON_JOB', 'OFF_DUTY']);

export const listMechanicsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(MECHANIC_SORTABLE).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().trim().min(1).optional(),
  status: mechanicStatus.optional(),
  specialisation: z.string().trim().min(1).optional(),
});
export type ListMechanicsQuery = z.infer<typeof listMechanicsQuerySchema>;

export const mechanicIdParamSchema = z.object({ id: z.string().min(1) });

export const updateMechanicStatusSchema = z.object({ status: mechanicStatus });
export type UpdateMechanicStatusInput = z.infer<typeof updateMechanicStatusSchema>;
