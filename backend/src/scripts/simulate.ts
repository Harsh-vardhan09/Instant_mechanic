import { createServer } from 'node:http';
import type { BookingStatus } from '@prisma/client';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { initIo } from '../realtime/io.js';
import * as bookingsService from '../modules/bookings/bookings.service.js';

/**
 * Live-traffic simulator for demos: advances real bookings through their lifecycle every few
 * seconds and pushes each change to connected dashboards.
 *
 * It boots the SAME express app and socket.io server as `npm run dev` and runs the loop
 * in-process. That is deliberate: socket.io holds its connections in memory, so a separate
 * process has no way to push to clients attached to the API without a shared message bus.
 * Run this INSTEAD of `npm run dev` during a demo — REST and websockets both work here.
 *
 * Every transition goes through bookingsService, exactly like an operator clicking the button:
 * same state machine, same transaction, same audit row, same cache invalidation, same events.
 * A simulator with its own private copy of the rules eventually disagrees with the API, and
 * then it is demonstrating something the product does not do.
 *
 * ponytail: single process, no broker. If the simulator ever needs to run alongside a
 * separately deployed API, add @socket.io/redis-adapter and emit through Redis instead.
 */

const TICK_MS = 4_000;
const NEW_BOOKING_CHANCE = 0.05;

/** COMPLETED and CANCELLED are terminal — nothing advances out of them. */
const NON_TERMINAL: BookingStatus[] = ['PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'];

const ts = (): string => new Date().toLocaleTimeString('en-GB');
const rand = (n: number): number => Math.floor(Math.random() * n);

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
  });
  if (!booking) return false;

  // PENDING leaves the queue only by dispatching someone, which is the assign endpoint's job.
  if (booking.status === 'PENDING') {
    const free = await prisma.mechanic.count({ where: { status: 'AVAILABLE' } });
    const [mechanic] = free
      ? await prisma.mechanic.findMany({
          where: { status: 'AVAILABLE' },
          skip: rand(free),
          take: 1,
        })
      : await prisma.mechanic.findMany({ take: 1 });
    if (!mechanic) {
      console.log(`[${ts()}] no mechanics exist — run "npm run db:seed" first`);
      return false;
    }
    const result = await bookingsService.assignMechanic(
      booking.id,
      { mechanicId: mechanic.id, note: 'Auto-dispatched by simulator' },
      null,
    );
    console.log(
      `[${ts()}] ${booking.code}  PENDING -> ASSIGNED  (${mechanic.name})${result.idempotent ? ' [no-op]' : ''}`,
    );
    return !result.idempotent;
  }

  // Ask the state machine what comes next rather than keeping a second copy of the rules.
  const next = bookingsService.TRANSITIONS[booking.status].find((s) => s !== 'CANCELLED');
  if (!next) return false;

  await bookingsService.changeStatus(booking.id, { status: next, note: 'Simulated' }, null);
  console.log(`[${ts()}] ${booking.code}  ${booking.status} -> ${next}`);
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

  const booking = await bookingsService.create(
    {
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      serviceId: service.id,
      scheduledAt: new Date(Date.now() + (1 + rand(48)) * 3_600_000),
      amount: Number((Number(service.basePrice) * (0.85 + Math.random() * 0.5)).toFixed(2)),
      note: 'Created by simulator',
    },
    null,
  );

  console.log(`[${ts()}] ${booking.code}  NEW booking -> PENDING  (${service.name})`);
  return true;
}

async function tick(): Promise<void> {
  try {
    if (Math.random() < NEW_BOOKING_CHANCE) await createBooking();
    else await advanceOne();
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    console.log('\nsimulator stopped');
    httpServer.close(() => void prisma.$disconnect().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}
