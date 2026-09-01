import bcrypt from 'bcryptjs';
import { activeSchema, prisma } from '../../src/lib/prisma.js';
import { invalidateDashboardCache } from '../../src/modules/analytics/analytics.service.js';
import { ensureTestSchema, truncateAll } from './db.js';

/**
 * A small, hand-designed fixture — NOT the 650-booking demo seed.
 *
 * Every number here is chosen so an assertion can be exact rather than approximate. The demo
 * seed is random-but-seeded and tuned to look real; a test that asserts against it has to
 * either recompute the expected value (proving nothing) or hard-code a number that changes
 * the moment the seed does.
 */

export const TEST_PASSWORD = 'TestPassword123!';

/** 12 COMPLETED bookings: 100, 200, … 1200. Sum is exactly 7800. */
export const COMPLETED_AMOUNTS = Array.from({ length: 12 }, (_, i) => (i + 1) * 100);
export const COMPLETED_TOTAL = COMPLETED_AMOUNTS.reduce((a, b) => a + b, 0); // 7800

/** One CANCELLED booking. Counts toward totalBookings, must never reach revenue. */
export const CANCELLED_AMOUNT = 999.99;

export const IDS = {
  admin: 'test_usr_admin',
  ops: 'test_usr_ops',
  customerA: 'test_cus_a',
  customerB: 'test_cus_b',
  vehicleA: 'test_veh_a',
  vehicleB: 'test_veh_b',
  mechanicA: 'test_mec_a',
  mechanicB: 'test_mec_b',
  serviceMaintenance: 'test_svc_maint',
  serviceRepair: 'test_svc_repair',
  /** PENDING, used by the transition suite. */
  pendingForTransition: 'test_bkg_pending_transition',
  /** PENDING, used by the idempotence suite. */
  pendingForAssign: 'test_bkg_pending_assign',
  /** COMPLETED and therefore terminal. */
  terminalCompleted: 'test_bkg_terminal',
  cancelled: 'test_bkg_cancelled',
} as const;

/** Midday local, so a day bucket is unambiguous regardless of timezone. */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** All money-bearing bookings land on this one day, leaving the rest of the week at zero. */
export const REVENUE_DAY_OFFSET = 3;

export interface Fixture {
  adminId: string;
  opsId: string;
}

export async function resetAndSeed(): Promise<Fixture> {
  const databaseUrl = process.env['DATABASE_URL'] as string;
  const schema = new URL(databaseUrl).searchParams.get('schema') as string;

  /**
   * The guard that matters, and the one whose absence already cost us once.
   *
   * Checking the URL is not enough: under Prisma 7 driver adapters `?schema=` on the
   * connection string is inert — the adapter needs it passed as an explicit option, and
   * without that Prisma reads and writes `public` while the URL claims otherwise. A suite
   * that truncates and reseeds on that assumption destroys the development data.
   *
   * So assert where the client ACTUALLY writes, not where we asked it to.
   */
  if (activeSchema !== schema) {
    throw new Error(
      `Prisma is writing to schema "${activeSchema}" but the tests expect "${schema}". ` +
        'Refusing to seed — this would mutate the wrong database.',
    );
  }
  if (activeSchema === 'public') {
    throw new Error('Refusing to run the fixture against the public schema.');
  }

  await ensureTestSchema(databaseUrl, schema);
  await truncateAll(databaseUrl, schema);
  // The dashboard is cached for 30s; a stale entry from the previous file would be served
  // against this file's fresh data.
  invalidateDashboardCache();

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  await prisma.user.createMany({
    data: [
      {
        id: IDS.admin,
        email: 'admin@test.local',
        name: 'Test Admin',
        role: 'ADMIN',
        passwordHash,
      },
      { id: IDS.ops, email: 'ops@test.local', name: 'Test Ops', role: 'OPS', passwordHash },
    ],
  });

  await prisma.service.createMany({
    data: [
      {
        id: IDS.serviceMaintenance,
        name: 'Periodic Service',
        category: 'MAINTENANCE',
        basePrice: '1000.00',
        durationMins: 60,
      },
      {
        id: IDS.serviceRepair,
        name: 'Engine Repair',
        category: 'REPAIR',
        basePrice: '2000.00',
        durationMins: 120,
      },
    ],
  });

  await prisma.mechanic.createMany({
    data: [
      {
        id: IDS.mechanicA,
        name: 'Asha Mechanic',
        email: 'mech.a@test.local',
        phone: '+919000000001',
        specialisation: 'Engine & Transmission',
        status: 'AVAILABLE',
        rating: '4.50',
        jobsCompleted: 0,
      },
      {
        id: IDS.mechanicB,
        name: 'Bala Mechanic',
        email: 'mech.b@test.local',
        phone: '+919000000002',
        specialisation: 'Brakes & Suspension',
        status: 'AVAILABLE',
        rating: '4.10',
        jobsCompleted: 0,
      },
    ],
  });

  await prisma.customer.createMany({
    data: [
      {
        id: IDS.customerA,
        name: 'Ravi Kumar',
        email: 'ravi@test.local',
        phone: '+919111111111',
        city: 'Mumbai',
        createdAt: daysAgo(10),
      },
      {
        id: IDS.customerB,
        name: 'Sunita Sharma',
        email: 'sunita@test.local',
        phone: '+919222222222',
        city: 'Pune',
        createdAt: daysAgo(2),
      },
    ],
  });

  await prisma.vehicle.createMany({
    data: [
      {
        id: IDS.vehicleA,
        customerId: IDS.customerA,
        make: 'Hyundai',
        model: 'Creta',
        year: 2022,
        regNumber: 'MH01AA1111',
      },
      {
        id: IDS.vehicleB,
        customerId: IDS.customerB,
        make: 'Tata',
        model: 'Nexon',
        year: 2023,
        regNumber: 'MH12BB2222',
      },
    ],
  });

  const revenueDay = daysAgo(REVENUE_DAY_OFFSET);
  const today = new Date();

  const bookings = [
    // 12 COMPLETED, all on one day, amounts 100…1200.
    ...COMPLETED_AMOUNTS.map((amount, i) => ({
      id: `test_bkg_done_${String(i + 1).padStart(2, '0')}`,
      code: `BK-90${String(i + 1).padStart(3, '0')}`,
      customerId: IDS.customerA,
      vehicleId: IDS.vehicleA,
      serviceId: i % 2 === 0 ? IDS.serviceMaintenance : IDS.serviceRepair,
      mechanicId: IDS.mechanicA,
      status: 'COMPLETED' as const,
      amount: amount.toFixed(2),
      scheduledAt: revenueDay,
      completedAt: revenueDay,
      createdAt: revenueDay,
      updatedAt: revenueDay,
    })),
    // Cancelled: a real booking that produced no money.
    {
      id: IDS.cancelled,
      code: 'BK-90900',
      customerId: IDS.customerB,
      vehicleId: IDS.vehicleB,
      serviceId: IDS.serviceRepair,
      mechanicId: null,
      status: 'CANCELLED' as const,
      amount: CANCELLED_AMOUNT.toFixed(2),
      scheduledAt: revenueDay,
      completedAt: null,
      createdAt: revenueDay,
      updatedAt: revenueDay,
    },
    // Terminal COMPLETED, for "no transition out of a terminal state".
    {
      id: IDS.terminalCompleted,
      code: 'BK-90901',
      customerId: IDS.customerB,
      vehicleId: IDS.vehicleB,
      serviceId: IDS.serviceMaintenance,
      mechanicId: IDS.mechanicB,
      status: 'COMPLETED' as const,
      amount: '50.00',
      scheduledAt: revenueDay,
      completedAt: revenueDay,
      createdAt: revenueDay,
      updatedAt: revenueDay,
    },
    // Two PENDING bookings created today: one per write-path suite, so neither can disturb
    // the other's starting state.
    {
      id: IDS.pendingForTransition,
      code: 'BK-90902',
      customerId: IDS.customerB,
      vehicleId: IDS.vehicleB,
      serviceId: IDS.serviceRepair,
      mechanicId: null,
      status: 'PENDING' as const,
      amount: '400.00',
      scheduledAt: today,
      completedAt: null,
      createdAt: today,
      updatedAt: today,
    },
    {
      id: IDS.pendingForAssign,
      code: 'BK-90903',
      customerId: IDS.customerA,
      vehicleId: IDS.vehicleA,
      serviceId: IDS.serviceMaintenance,
      mechanicId: null,
      status: 'PENDING' as const,
      amount: '500.00',
      scheduledAt: today,
      completedAt: null,
      createdAt: today,
      updatedAt: today,
    },
  ];

  await prisma.booking.createMany({ data: bookings });

  // Every booking gets its creation event, mirroring the real write paths.
  await prisma.bookingEvent.createMany({
    data: bookings.map((b, i) => ({
      id: `test_evt_${String(i + 1).padStart(3, '0')}`,
      bookingId: b.id,
      fromStatus: null,
      toStatus: 'PENDING' as const,
      actorId: null,
      note: 'Booking created',
      createdAt: b.createdAt,
    })),
  });

  // jobsCompleted must agree with reality, exactly as the app maintains it.
  await prisma.mechanic.update({
    where: { id: IDS.mechanicA },
    data: { jobsCompleted: COMPLETED_AMOUNTS.length },
  });
  await prisma.mechanic.update({ where: { id: IDS.mechanicB }, data: { jobsCompleted: 1 } });

  return { adminId: IDS.admin, opsId: IDS.ops };
}

/** Total bookings in the fixture: 12 completed + cancelled + terminal + 2 pending = 16. */
export const TOTAL_BOOKINGS = COMPLETED_AMOUNTS.length + 4;
