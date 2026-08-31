import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { ListCustomersQuery } from './customers.schema.js';

/** The ONLY layer that touches Prisma for customers. */

export interface CustomerListRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  createdAt: Date;
  bookingCount: number;
  totalSpent: string;
  vehicleCount: number;
}

/** Sort keys mapped to SQL fragments. The map IS the allowlist — nothing else reaches ORDER BY. */
const ORDER_BY: Record<string, string> = {
  name: 'c.name',
  createdAt: 'c."createdAt"',
  bookingCount: '"bookingCount"',
  totalSpent: '"totalSpent"',
  city: 'c.city',
};

/**
 * One page of customers with their aggregates computed in SQL.
 *
 * bookingCount and totalSpent are COUNT/SUM over each customer's FULL booking history, not
 * over the page — and totalSpent counts COMPLETED bookings only, matching the revenue rule
 * used everywhere else. A cancelled booking is a real event but not money received.
 */
export async function findMany(
  q: ListCustomersQuery,
): Promise<{ rows: CustomerListRow[]; total: number }> {
  const search = q.search ? `%${q.search}%` : null;
  // Safe: the value comes from the allowlist above, never from the request.
  const orderColumn = Prisma.raw(ORDER_BY[q.sort] ?? 'c.name');
  const orderDir = Prisma.raw(q.order === 'asc' ? 'ASC' : 'DESC');
  const offset = (q.page - 1) * q.limit;

  const rows = await prisma.$queryRaw<CustomerListRow[]>`
    SELECT
      c.id, c.name, c.email, c.phone, c.city, c."createdAt",
      COUNT(DISTINCT b.id)::int                                              AS "bookingCount",
      COUNT(DISTINCT v.id)::int                                              AS "vehicleCount",
      COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'COMPLETED'), 0)::text AS "totalSpent"
    FROM customers c
    LEFT JOIN bookings b ON b."customerId" = c.id
    LEFT JOIN vehicles v ON v."customerId" = c.id
    WHERE ${search}::text IS NULL
       OR c.name  ILIKE ${search}
       OR c.email ILIKE ${search}
       OR c.phone ILIKE ${search}
    GROUP BY c.id
    ORDER BY ${orderColumn} ${orderDir}
    LIMIT ${q.limit} OFFSET ${offset}`;

  // COUNT over the full filtered set — deliberately not rows.length.
  const totals = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM customers c
    WHERE ${search}::text IS NULL
       OR c.name  ILIKE ${search}
       OR c.email ILIKE ${search}
       OR c.phone ILIKE ${search}`;

  return { rows, total: totals[0]?.n ?? 0 };
}

export async function findById(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      vehicles: { orderBy: { regNumber: 'asc' } },
      bookings: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          service: { select: { id: true, name: true, category: true } },
          vehicle: { select: { id: true, make: true, model: true, regNumber: true } },
          mechanic: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/** Lifetime aggregates for one customer, again in SQL rather than summed from the page above. */
export async function findTotals(
  customerId: string,
): Promise<{ bookingCount: number; totalSpent: string }> {
  const rows = await prisma.$queryRaw<{ bookingCount: number; totalSpent: string }[]>`
    SELECT
      COUNT(*)::int                                                          AS "bookingCount",
      COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'COMPLETED'), 0)::text AS "totalSpent"
    FROM bookings b WHERE b."customerId" = ${customerId}`;
  return rows[0] ?? { bookingCount: 0, totalSpent: '0' };
}
