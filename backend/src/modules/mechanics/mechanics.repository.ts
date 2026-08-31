import { Prisma, type MechanicStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { ListMechanicsQuery } from './mechanics.schema.js';

/** The ONLY layer that touches Prisma for mechanics. */

export function buildWhere(q: ListMechanicsQuery): Prisma.MechanicWhereInput {
  const and: Prisma.MechanicWhereInput[] = [];
  if (q.status) and.push({ status: q.status });
  if (q.specialisation)
    and.push({ specialisation: { contains: q.specialisation, mode: 'insensitive' } });
  if (q.search) {
    and.push({
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search, mode: 'insensitive' } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export async function findMany(
  where: Prisma.MechanicWhereInput,
  opts: { skip: number; take: number; orderBy: Record<string, 'asc' | 'desc'> },
) {
  const [rows, total] = await Promise.all([
    prisma.mechanic.findMany({ where, skip: opts.skip, take: opts.take, orderBy: opts.orderBy }),
    prisma.mechanic.count({ where }),
  ]);
  return { rows, total };
}

export interface MechanicBookingRow {
  mechanicId: string;
  id: string;
  code: string;
  status: string;
  scheduledAt: Date;
  amount: string;
  customerName: string | null;
}

/**
 * The current — or failing that, most recent — booking for EVERY mechanic on the page, in
 * ONE query.
 *
 * The obvious implementation is a loop issuing one query per mechanic. At 20 rows a page that
 * is 20 extra round trips to a database on the far side of the public internet, and the page
 * gets slower in direct proportion to how much of it you show. DISTINCT ON collapses it to a
 * single scan: order each mechanic's bookings so that live jobs sort first and the newest wins
 * among equals, then take the first row per mechanic.
 */
export async function findCurrentBookings(mechanicIds: string[]): Promise<MechanicBookingRow[]> {
  if (mechanicIds.length === 0) return [];
  return prisma.$queryRaw<MechanicBookingRow[]>`
    SELECT DISTINCT ON (b."mechanicId")
      b."mechanicId"  AS "mechanicId",
      b.id            AS id,
      b.code          AS code,
      b.status::text  AS status,
      b."scheduledAt" AS "scheduledAt",
      b.amount::text  AS amount,
      c.name          AS "customerName"
    FROM bookings b
    LEFT JOIN customers c ON c.id = b."customerId"
    WHERE b."mechanicId" = ANY(${mechanicIds})
    ORDER BY
      b."mechanicId",
      -- live jobs first, then the most recent history
      (CASE WHEN b.status IN ('ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS') THEN 0 ELSE 1 END),
      b."createdAt" DESC`;
}

export async function findById(id: string) {
  return prisma.mechanic.findUnique({ where: { id } });
}

/** Recent work for the detail view — bounded, newest first. */
export async function findRecentBookings(mechanicId: string, take: number) {
  return prisma.booking.findMany({
    where: { mechanicId },
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, city: true } },
      service: { select: { id: true, name: true, category: true } },
      vehicle: { select: { id: true, make: true, model: true, regNumber: true } },
    },
  });
}

export async function updateStatus(id: string, status: MechanicStatus) {
  return prisma.mechanic.update({ where: { id }, data: { status } });
}

/** Live job count for one mechanic, used to refuse taking them off duty mid-job. */
export async function countActiveBookings(mechanicId: string): Promise<number> {
  return prisma.booking.count({
    where: { mechanicId, status: { in: ['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'] } },
  });
}
