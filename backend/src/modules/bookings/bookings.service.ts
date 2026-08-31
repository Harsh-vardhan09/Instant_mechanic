import { Prisma, type BookingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { emitBookingUpdate, emitStatsUpdate } from '../../realtime/io.js';
import { invalidateDashboardCache } from '../analytics/analytics.service.js';
import { paginate, type Paginated } from '../../shared/pagination.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors.js';
import type { BookingUpdatePayload } from '../../realtime/events.js';
import * as repo from './bookings.repository.js';
import type {
  AssignMechanicInput,
  ChangeStatusInput,
  CreateBookingInput,
  ListBookingsQuery,
} from './bookings.schema.js';

/**
 * THE STATE MACHINE. A booking's status may only move along these edges.
 *
 * This is deliberately a lookup table rather than a chain of ifs: the legal transitions are
 * the domain rule, and having them in one readable object means a reviewer can check the rule
 * against the spec without tracing control flow. Arbitrary status writes are not accepted —
 * "set it to COMPLETED" from PENDING would skip dispatch entirely and silently book revenue
 * for work nobody did.
 */
export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ON_THE_WAY', 'CANCELLED'],
  ON_THE_WAY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function assertTransition(from: BookingStatus, to: BookingStatus): void {
  const allowed = TRANSITIONS[from];
  if (allowed.includes(to)) return;
  throw new ConflictError(
    allowed.length === 0
      ? `Booking is ${from}, which is terminal — no further status changes are possible`
      : `Cannot change status from ${from} to ${to}. Allowed from ${from}: ${allowed.join(', ')}`,
  );
}

/** Headline figures for the stats broadcast — SQL aggregates, never a summed page. */
async function currentStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const active: BookingStatus[] = ['PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'];

  const [totalBookings, activeBookings, availableMechanics, revenue] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: { in: active } } }),
    prisma.mechanic.count({ where: { status: 'AVAILABLE' } }),
    prisma.booking.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: startOfToday } },
      _sum: { amount: true },
    }),
  ]);

  return {
    totalBookings,
    activeBookings,
    availableMechanics,
    revenueToday: revenue._sum.amount?.toString() ?? '0',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Everything that must happen after a booking write, in one place so no path forgets a step:
 * drop the cached dashboard, push the booking to every open dashboard, push fresh totals.
 * Runs AFTER the transaction commits — broadcasting a change that later rolls back would put
 * a number on screen that never existed in the database.
 */
async function publish(payload: BookingUpdatePayload): Promise<void> {
  invalidateDashboardCache();
  emitBookingUpdate(payload);
  emitStatsUpdate(await currentStats());
}

export async function list(query: ListBookingsQuery): Promise<Paginated<BookingUpdatePayload>> {
  const where = repo.buildWhere(query, query.search);
  const { rows, total } = await repo.findMany(where, {
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    orderBy: { [query.sort]: query.order },
  });
  return paginate(rows.map(repo.toPayload), total, query.page, query.limit);
}

export async function getById(id: string) {
  const booking = await repo.findByIdWithTimeline(id);
  if (!booking) throw new NotFoundError(`Booking ${id} not found`);

  return {
    ...repo.toPayload(booking),
    // The append-only audit trail: who moved this booking, when, and why.
    timeline: booking.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
      actor: e.actor ? { id: e.actor.id, name: e.actor.name, email: e.actor.email } : null,
    })),
  };
}

export async function create(
  input: CreateBookingInput,
  actorId: string | null,
): Promise<BookingUpdatePayload> {
  const [vehicle, service] = await Promise.all([
    repo.findCustomerVehicle(input.customerId, input.vehicleId),
    repo.findService(input.serviceId),
  ]);
  if (!vehicle)
    throw new BadRequestError('Vehicle does not exist or does not belong to that customer');
  if (!service) throw new BadRequestError('Service does not exist');

  const amount = (input.amount ?? Number(service.basePrice)).toFixed(2);

  // Retry on code collision: two concurrent creates can compute the same MAX+1. The unique
  // index on `code` is the real guard; this loop just turns a lost race into a retry.
  // ponytail: MAX+1 with retries, not a sequence. Swap in a Postgres SEQUENCE if booking
  // creation ever becomes concurrent enough for this to show up in the logs.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await repo.nextBookingCode();
    try {
      const created = await repo.transaction(async (tx) => {
        const booking = await repo.createBooking(tx, {
          code,
          customerId: input.customerId,
          vehicleId: input.vehicleId,
          serviceId: input.serviceId,
          amount,
          scheduledAt: input.scheduledAt,
        });
        await repo.appendEvent(tx, {
          bookingId: booking.id,
          fromStatus: null,
          toStatus: 'PENDING',
          actorId,
          note: input.note ?? 'Booking created',
        });
        return repo.findByIdTx(tx, booking.id);
      });

      if (!created) throw new Error('booking vanished immediately after creation');
      const payload = repo.toPayload(created);
      await publish(payload);
      return payload;
    } catch (err) {
      const isCodeClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.['target'] ?? '').includes('code');
      if (!isCodeClash) throw err;
    }
  }
  throw new ConflictError('Could not allocate a unique booking code, please retry');
}

export async function changeStatus(
  id: string,
  input: ChangeStatusInput,
  actorId: string | null,
): Promise<BookingUpdatePayload> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError(`Booking ${id} not found`);

  assertTransition(existing.status, input.status);

  const to = input.status;
  const completedAt = to === 'COMPLETED' ? new Date() : null;

  const updated = await repo.transaction(async (tx) => {
    // Re-read inside the transaction and re-check: between the read above and this write,
    // another operator may have already moved the booking on.
    const current = await repo.findByIdTx(tx, id);
    if (!current) throw new NotFoundError(`Booking ${id} not found`);
    assertTransition(current.status, to);

    await repo.updateBookingStatus(tx, id, {
      status: to,
      ...(completedAt ? { completedAt } : {}),
    });

    await repo.appendEvent(tx, {
      bookingId: id,
      fromStatus: current.status,
      toStatus: to,
      actorId,
      note: input.note ?? null,
    });

    // Keep the mechanic's own state and their denormalised counter honest.
    if (current.mechanicId) {
      if (to === 'COMPLETED') {
        await repo.setMechanicStatus(tx, current.mechanicId, {
          status: 'AVAILABLE',
          incrementJobs: true,
        });
      } else if (to === 'ON_THE_WAY' || to === 'IN_PROGRESS') {
        await repo.setMechanicStatus(tx, current.mechanicId, { status: 'ON_JOB' });
      } else if (to === 'CANCELLED') {
        await repo.setMechanicStatus(tx, current.mechanicId, { status: 'AVAILABLE' });
      }
    }

    return repo.findByIdTx(tx, id);
  });

  if (!updated) throw new NotFoundError(`Booking ${id} not found`);
  const payload = repo.toPayload(updated);
  await publish(payload);
  return payload;
}

export interface AssignResult {
  booking: BookingUpdatePayload;
  /** True when this exact assignment already existed — nothing was written a second time. */
  idempotent: boolean;
}

/**
 * Dispatches a mechanic.
 *
 * Idempotence is enforced by the (bookingId, mechanicId) unique index, NOT by reading first
 * and deciding. A check-then-write races: two clicks 20ms apart both read "not assigned",
 * both write, and two mechanics drive to one job. Here the second insert violates the
 * constraint, the whole transaction rolls back, and we report the existing state instead.
 */
export async function assignMechanic(
  id: string,
  input: AssignMechanicInput,
  actorId: string | null,
): Promise<AssignResult> {
  const [existing, mechanic] = await Promise.all([
    repo.findById(id),
    repo.findMechanic(input.mechanicId),
  ]);
  if (!existing) throw new NotFoundError(`Booking ${id} not found`);
  if (!mechanic) throw new BadRequestError(`Mechanic ${input.mechanicId} does not exist`);

  // Reassigning to a DIFFERENT mechanic is a separate decision from dispatching an unassigned
  // job, and the state machine has no edge for it. Refuse rather than silently swapping.
  if (existing.mechanicId && existing.mechanicId !== input.mechanicId) {
    throw new ConflictError(
      `Booking is already assigned to mechanic ${existing.mechanicId}. Cancel or complete it before reassigning.`,
    );
  }

  try {
    const updated = await repo.transaction(async (tx) => {
      // The unique index does the work. If this row already exists the transaction aborts.
      await repo.createAssignment(tx, {
        bookingId: id,
        mechanicId: input.mechanicId,
        assignedBy: actorId,
      });

      const current = await repo.findByIdTx(tx, id);
      if (!current) throw new NotFoundError(`Booking ${id} not found`);
      assertTransition(current.status, 'ASSIGNED');

      await repo.updateBookingStatus(tx, id, {
        status: 'ASSIGNED',
        mechanicId: input.mechanicId,
      });
      await repo.appendEvent(tx, {
        bookingId: id,
        fromStatus: current.status,
        toStatus: 'ASSIGNED',
        actorId,
        note: input.note ?? 'Mechanic assigned',
      });
      await repo.setMechanicStatus(tx, input.mechanicId, { status: 'ON_JOB' });

      return repo.findByIdTx(tx, id);
    });

    if (!updated) throw new NotFoundError(`Booking ${id} not found`);
    const payload = repo.toPayload(updated);
    await publish(payload);
    return { booking: payload, idempotent: false };
  } catch (err) {
    const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
    if (!duplicate) throw err;

    // Same mechanic, same booking, already dispatched. Nothing was written — report the
    // state that exists. No second audit row, no second mechanic.
    const current = await repo.findById(id);
    if (!current) throw new NotFoundError(`Booking ${id} not found`);
    return { booking: repo.toPayload(current), idempotent: true };
  }
}
