import { z } from 'zod';

/**
 * Columns a client may sort by. Anything else is rejected with 400 rather than reaching
 * Prisma's orderBy — user input never becomes part of a query's structure.
 */
export const BOOKING_SORTABLE = ['createdAt', 'scheduledAt', 'amount', 'status'] as const;
export type BookingSortable = (typeof BOOKING_SORTABLE)[number];

const bookingStatus = z.enum([
  'PENDING',
  'ASSIGNED',
  'ON_THE_WAY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

const serviceCategory = z.enum(['MAINTENANCE', 'REPAIR', 'DIAGNOSTIC', 'EMERGENCY', 'INSPECTION']);

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(BOOKING_SORTABLE).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).optional(),
  status: bookingStatus.optional(),
  mechanicId: z.string().min(1).optional(),
  serviceCategory: serviceCategory.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export const bookingIdParamSchema = z.object({ id: z.string().min(1) });

export const createBookingSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  serviceId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  /** Optional override; defaults to the service base price when omitted. */
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  note: z.string().trim().max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const changeStatusSchema = z.object({
  status: bookingStatus,
  note: z.string().trim().max(500).optional(),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const assignMechanicSchema = z.object({
  mechanicId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export type AssignMechanicInput = z.infer<typeof assignMechanicSchema>;
