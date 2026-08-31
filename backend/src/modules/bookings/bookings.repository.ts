import { Prisma, type BookingStatus, type PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { BookingUpdatePayload } from '../../realtime/events.js';
import type { ListBookingsQuery } from './bookings.schema.js';

/** The ONLY layer that touches Prisma for bookings. */

/** Relations every booking row carries, so list, detail and socket payloads agree. */
const bookingInclude = {
  customer: { select: { id: true, name: true, phone: true, city: true } },
  vehicle: { select: { id: true, make: true, model: true, regNumber: true } },
  service: { select: { id: true, name: true, category: true } },
  mechanic: { select: { id: true, name: true, status: true } },
} satisfies Prisma.BookingInclude;

export type BookingRow = Prisma.BookingGetPayload<{
  typeof: never;
  include: typeof bookingInclude;
}>;

/** Decimal and Date are not JSON. One mapper, so every surface serialises identically. */
export function toPayload(b: BookingRow): BookingUpdatePayload {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    // Money as a decimal string, never a float — cents disappear at scale otherwise.
    amount: b.amount.toString(),
    scheduledAt: b.scheduledAt.toISOString(),
    completedAt: b.completedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    customer: b.customer,
    vehicle: b.vehicle,
    service: b.service,
    mechanic: b.mechanic,
  };
}

/** Translates list filters into one WHERE clause, reused by both the page query and COUNT. */
export function buildWhere(
  q: ListBookingsQuery,
  search: string | undefined,
): Prisma.BookingWhereInput {
  const and: Prisma.BookingWhereInput[] = [];

  if (q.status) and.push({ status: q.status });
  if (q.mechanicId) and.push({ mechanicId: q.mechanicId });
  if (q.serviceCategory) and.push({ service: { category: q.serviceCategory } });

  if (q.dateFrom || q.dateTo) {
    and.push({
      createdAt: {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      },
    });
  }

  if (search) {
    // Case-insensitive across the three things an operator actually has to hand: the booking
    // code from an email, the caller's name, or the plate they are reading off the car.
    and.push({
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { vehicle: { regNumber: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

/**
 * One page of bookings plus the TOTAL over the full filtered set.
 *
 * The count is a separate COUNT(*) with the same WHERE — never `data.length`, which would
 * report at most `limit` and make page 1 of 40 look like the entire business.
 */
export async function findMany(
  where: Prisma.BookingWhereInput,
  opts: { skip: number; take: number; orderBy: Record<string, 'asc' | 'desc'> },
): Promise<{ rows: BookingRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      skip: opts.skip,
      take: opts.take,
      orderBy: opts.orderBy,
    }),
    prisma.booking.count({ where }),
  ]);
  return { rows, total };
}

export async function findById(id: string): Promise<BookingRow | null> {
  return prisma.booking.findUnique({ where: { id }, include: bookingInclude });
}

/** Detail view: the booking plus its complete append-only timeline, oldest first. */
export async function findByIdWithTimeline(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      ...bookingInclude,
      events: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

export async function findCustomerVehicle(customerId: string, vehicleId: string) {
  return prisma.vehicle.findFirst({ where: { id: vehicleId, customerId } });
}

export async function findService(serviceId: string) {
  return prisma.service.findUnique({ where: { id: serviceId } });
}

export async function findMechanic(mechanicId: string) {
  return prisma.mechanic.findUnique({ where: { id: mechanicId } });
}

/** Highest BK-##### currently issued, so a new booking continues the sequence. */
export async function nextBookingCode(): Promise<string> {
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)) AS max
    FROM bookings WHERE code ~ '^BK-[0-9]+$'`;
  return `BK-${(rows[0]?.max ?? 9999) + 1}`;
}

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Runs `fn` inside a transaction — every write path in this module goes through here. */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}

export async function createBooking(
  tx: Tx,
  data: {
    code: string;
    customerId: string;
    vehicleId: string;
    serviceId: string;
    amount: string;
    scheduledAt: Date;
  },
) {
  return tx.booking.create({ data: { ...data, status: 'PENDING' } });
}

export async function updateBookingStatus(
  tx: Tx,
  id: string,
  data: { status: BookingStatus; mechanicId?: string | null; completedAt?: Date | null },
) {
  return tx.booking.update({ where: { id }, data });
}

/** Append-only: this table is only ever inserted into. */
export async function appendEvent(
  tx: Tx,
  data: {
    bookingId: string;
    fromStatus: BookingStatus | null;
    toStatus: BookingStatus;
    actorId: string | null;
    note: string | null;
  },
) {
  return tx.bookingEvent.create({ data });
}

/**
 * Inserts the dispatch record. The (bookingId, mechanicId) unique index makes a second
 * identical assign raise P2002 instead of writing a duplicate — that constraint, not an
 * app-level check, is what stops a double-clicked button dispatching two mechanics.
 */
export async function createAssignment(
  tx: Tx,
  data: { bookingId: string; mechanicId: string; assignedBy: string | null },
) {
  return tx.bookingAssignment.create({ data });
}

export async function setMechanicStatus(
  tx: Tx,
  mechanicId: string,
  data: { status?: 'AVAILABLE' | 'ON_JOB' | 'OFF_DUTY'; incrementJobs?: boolean },
) {
  return tx.mechanic.update({
    where: { id: mechanicId },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.incrementJobs ? { jobsCompleted: { increment: 1 } } : {}),
    },
  });
}

/** Reads a booking inside the open transaction, so decisions use rows this tx has locked. */
export async function findByIdTx(tx: Tx, id: string): Promise<BookingRow | null> {
  return tx.booking.findUnique({ where: { id }, include: bookingInclude });
}
