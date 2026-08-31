import { createServer } from 'node:http';
import type { BookingStatus } from '@prisma/client';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { emitBookingUpdate, emitStatsUpdate, initIo } from '../realtime/io.js';

/**
 * Live-traffic simulator for demos: advances real bookings through their lifecycle every few
 * seconds, writes the audit row, and pushes the change to connected dashboards.
 *
 * It boots the SAME express app and socket.io server as `npm run dev` and then runs the loop
 * in-process. That is deliberate: socket.io holds its connections in memory, so a separate
 * process has no way to push to clients attached to the API without a shared message bus.
 * Run this INSTEAD of `npm run dev` during a demo — REST and websockets both work here.
 *
 * ponytail: single process, no broker. If the simulator ever needs to run alongside a
 * separately deployed API, add @socket.io/redis-adapter and emit through Redis instead.
 */

const TICK_MS = 4_000;
const NEW_BOOKING_CHANCE = 0.05;

/** The only legal forward transitions. A booking may not skip a step or move backwards. */
const NEXT: Partial<Record<BookingStatus, BookingStatus>> = {
  PENDING: 'ASSIGNED',
  ASSIGNED: 'ON_THE_WAY',
  ON_THE_WAY: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

/** COMPLETED and CANCELLED are terminal — nothing advances out of them. */
const NON_TERMINAL: BookingStatus[] = ['PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'];

const NOTES: Record<string, string> = {
  ASSIGNED: 'Mechanic assigned by ops',
  ON_THE_WAY: 'Mechanic en route',
  IN_PROGRESS: 'Work started',
  COMPLETED: 'Job completed, invoice raised',
};

const ts = (): string => new Date().toLocaleTimeString('en-GB');
const rand = (n: number): number => Math.floor(Math.random() * n);

/** Current dashboard headline figures, aggregated in SQL over the full set — never a page. */
async function currentStats(): Promise<{
  totalBookings: number;
  activeBookings: number;
  availableMechanics: number;
  revenueToday: string;
}> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalBookings, activeBookings, availableMechanics, revenue] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: { in: NON_TERMINAL } } }),
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
  };
}

async function broadcastStats(): Promise<void> {
  const stats = await currentStats();
  emitStatsUpdate({ ...stats, generatedAt: new Date().toISOString() });
}

/** Advances one random in-flight booking by exactly one legal step. */
async function advanceOne(): Promise<boolean> {
  const total = await prisma.booking.count({ where: { status: { in: NON_TERMINAL } } });
  if (total === 0) {
    console.log(`[${ts()}] nothing in flight — every booking is COMPLETED or CANCELLED`);
    return false;
  }

  const [booking] = await prisma.booking.findMany({
    where: { status: { in: NON_TERMINAL } },
    skip: rand(total),
    take: 1,
    include: { service: { select: { durationMins: true } } },
  });
  if (!booking) return false;

  const from = booking.status;
  const to = NEXT[from];
  if (!to) return false;

  // Moving out of PENDING means someone must actually be dispatched.
  let mechanicId = booking.mechanicId;
  if (to === 'ASSIGNED' && !mechanicId) {
    const free = await prisma.mechanic.count({ where: { status: 'AVAILABLE' } });
    const [mechanic] = free
      ? await prisma.mechanic.findMany({
          where: { status: 'AVAILABLE' },
          skip: rand(free),
          take: 1,
        })
      : await prisma.mechanic.findMany({ take: 1 });
    mechanicId = mechanic?.id ?? null;
    if (!mechanicId) {
      console.log(`[${ts()}] no mechanics exist — run "npm run db:seed" first`);
      return false;
    }
  }

  const completedAt = to === 'COMPLETED' ? new Date() : null;

  // One transaction: the booking row, its audit row, and the mechanic's counter move together
  // or not at all. A half-applied transition is exactly the inconsistency the audit trail exists
  // to rule out.
  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: booking.id },
      data: { status: to, mechanicId, ...(completedAt ? { completedAt } : {}) },
    });

    await tx.bookingEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: from,
        toStatus: to,
        actorId: null,
        note: NOTES[to] ?? null,
      },
    });

    // Keep the denormalised counter honest, the same way the seed does.
    if (to === 'COMPLETED' && mechanicId) {
      await tx.mechanic.update({
        where: { id: mechanicId },
        data: { jobsCompleted: { increment: 1 }, status: 'AVAILABLE' },
      });
    } else if (to === 'ON_THE_WAY' && mechanicId) {
      await tx.mechanic.update({ where: { id: mechanicId }, data: { status: 'ON_JOB' } });
    }
    return b;
  });

  emitBookingUpdate({
    bookingId: updated.id,
    code: updated.code,
    status: updated.status,
    mechanicId: updated.mechanicId,
    updatedAt: updated.updatedAt.toISOString(),
  });

  console.log(`[${ts()}] ${updated.code}  ${from} -> ${to}`);
  return true;
}

/** Occasionally a brand-new job arrives, so the PENDING queue does not simply drain. */
async function createBooking(): Promise<boolean> {
  const [vehicleCount, serviceCount] = await Promise.all([
    prisma.vehicle.count(),
    prisma.service.count(),
  ]);
  if (!vehicleCount || !serviceCount) {
    console.log(`[${ts()}] no vehicles/services — run "npm run db:seed" first`);
    return false;
  }

  const [vehicle] = await prisma.vehicle.findMany({ skip: rand(vehicleCount), take: 1 });
  const [service] = await prisma.service.findMany({ skip: rand(serviceCount), take: 1 });
  if (!vehicle || !service) return false;

  // Continue the BK-##### sequence rather than colliding with the seeded range.
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)) AS max
    FROM bookings WHERE code ~ '^BK-[0-9]+$'`;
  const code = `BK-${(rows[0]?.max ?? 10000) + 1}`;

  const amount = (Number(service.basePrice) * (0.85 + Math.random() * 0.5)).toFixed(2);

  const created = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.create({
      data: {
        code,
        customerId: vehicle.customerId,
        vehicleId: vehicle.id,
        serviceId: service.id,
        mechanicId: null,
        status: 'PENDING',
        amount,
        scheduledAt: new Date(Date.now() + (1 + rand(48)) * 3_600_000),
      },
    });
    await tx.bookingEvent.create({
      data: { bookingId: b.id, fromStatus: null, toStatus: 'PENDING', note: 'Booking created' },
    });
    return b;
  });

  emitBookingUpdate({
    bookingId: created.id,
    code: created.code,
    status: created.status,
    mechanicId: null,
    updatedAt: created.updatedAt.toISOString(),
  });

  console.log(`[${ts()}] ${created.code}  NEW booking -> PENDING  (${service.name})`);
  return true;
}

async function tick(): Promise<void> {
  try {
    const changed = Math.random() < NEW_BOOKING_CHANCE ? await createBooking() : await advanceOne();
    if (changed) await broadcastStats();
  } catch (err) {
    // A simulator that dies on the first blip is useless during a demo — log and keep going.
    console.error(`[${ts()}] tick failed:`, err instanceof Error ? err.message : err);
  }
}

// ── boot ────────────────────────────────────────────────────────────────────
const httpServer = createServer(createApp());
initIo(httpServer);

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${env.PORT} is already in use — "npm run dev" is probably running.\n` +
        'Stop it and run "npm run simulate" instead: the simulator IS the API server.\n',
    );
    process.exit(1);
  }
  throw err;
});

httpServer.listen(env.PORT, () => {
  console.log(`simulator + api listening on :${env.PORT}`);
  console.log(
    `advancing one booking every ${TICK_MS / 1000}s, ${NEW_BOOKING_CHANCE * 100}% new bookings`,
  );
  console.log('press Ctrl+C to stop\n');
});

const timer = setInterval(() => void tick(), TICK_MS);
void broadcastStats();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    console.log('\nsimulator stopped');
    httpServer.close(() => void prisma.$disconnect().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}
