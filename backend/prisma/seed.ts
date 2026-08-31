import bcrypt from 'bcryptjs';
import type { BookingStatus, ServiceCategory } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';

/**
 * Seeds a realistic operational dataset for the dashboard.
 *
 * Idempotent by truncation: every run starts from an empty set of domain tables, so the
 * output is the same whether it is the first run or the fifth. Combined with a fixed PRNG
 * seed the data is byte-identical every time — a bug you see on your machine reproduces on
 * mine, and screenshots stay stable between demos.
 */
const BCRYPT_ROUNDS = 10;
const DEMO_PASSWORD = 'Password123!';

// ── deterministic randomness ────────────────────────────────────────────────
/** Mulberry32 — small, seeded, no dependency. Reproducibility over cryptographic quality. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260901);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const int = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
const pad = (n: number, w = 3): string => String(n).padStart(w, '0');

/** Fisher-Yates using the seeded PRNG, so shuffles are reproducible too. */
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
  }
  return xs;
}

// ── reference data ──────────────────────────────────────────────────────────
const FIRST_NAMES = [
  'Aarav',
  'Priya',
  'Rohan',
  'Ananya',
  'Vikram',
  'Meera',
  'Arjun',
  'Kavya',
  'Rahul',
  'Sneha',
  'Karan',
  'Divya',
  'Aditya',
  'Nisha',
  'Siddharth',
  'Pooja',
  'Manish',
  'Riya',
  'Vivek',
  'Tara',
  'Nikhil',
  'Ishita',
  'Rajesh',
  'Sunita',
  'Harsh',
  'Neha',
  'Amit',
  'Lakshmi',
  'Sanjay',
  'Anjali',
] as const;

const LAST_NAMES = [
  'Sharma',
  'Patel',
  'Iyer',
  'Reddy',
  'Nair',
  'Gupta',
  'Singh',
  'Menon',
  'Desai',
  'Joshi',
  'Kulkarni',
  'Bose',
  'Chauhan',
  'Malhotra',
  'Rao',
  'Verma',
  'Pillai',
  'Bhatt',
] as const;

/** City paired with the RTO code its registration plates actually use. */
const CITIES = [
  { city: 'Mumbai', rto: 'MH01' },
  { city: 'Pune', rto: 'MH12' },
  { city: 'Bengaluru', rto: 'KA01' },
  { city: 'Hyderabad', rto: 'TS09' },
  { city: 'Delhi', rto: 'DL03' },
  { city: 'Chennai', rto: 'TN10' },
  { city: 'Ahmedabad', rto: 'GJ01' },
  { city: 'Kolkata', rto: 'WB02' },
  { city: 'Jaipur', rto: 'RJ14' },
  { city: 'Kochi', rto: 'KL07' },
] as const;

const MAKES = [
  { make: 'Maruti Suzuki', models: ['Swift', 'Baleno', 'Dzire', 'Brezza', 'WagonR'] },
  { make: 'Hyundai', models: ['i20', 'Creta', 'Venue', 'Verna', 'Grand i10'] },
  { make: 'Tata', models: ['Nexon', 'Punch', 'Harrier', 'Altroz', 'Tiago'] },
  { make: 'Mahindra', models: ['XUV700', 'Thar', 'Scorpio', 'Bolero', 'XUV300'] },
  { make: 'Honda', models: ['City', 'Amaze', 'Elevate', 'Jazz'] },
  { make: 'Toyota', models: ['Innova Crysta', 'Fortuner', 'Glanza', 'Urban Cruiser'] },
  { make: 'Kia', models: ['Seltos', 'Sonet', 'Carens'] },
  { make: 'Volkswagen', models: ['Polo', 'Virtus', 'Taigun'] },
] as const;

const SPECIALISATIONS = [
  'Engine & Transmission',
  'Brakes & Suspension',
  'Electrical & Battery',
  'AC & Cooling',
  'Tyres & Wheel Alignment',
  'Denting & Painting',
  'Diagnostics',
  'General Service',
] as const;

/**
 * Ten services covering the eight requested areas. The `category` values are the five
 * members of the ServiceCategory enum in schema.prisma — the requested list (Battery,
 * Tyres, AC, Denting & Painting …) is finer-grained than that enum, so those areas live in
 * the service NAME and roll up to the nearest enum category.
 */
const SERVICES: readonly {
  name: string;
  category: ServiceCategory;
  basePrice: string;
  durationMins: number;
}[] = [
  { name: 'Periodic Service', category: 'MAINTENANCE', basePrice: '3499.00', durationMins: 120 },
  {
    name: 'Comprehensive Service',
    category: 'MAINTENANCE',
    basePrice: '6499.00',
    durationMins: 240,
  },
  {
    name: 'Tyre Replacement & Wheel Balancing',
    category: 'MAINTENANCE',
    basePrice: '5200.00',
    durationMins: 90,
  },
  { name: 'Engine & Clutch Repair', category: 'REPAIR', basePrice: '8750.00', durationMins: 360 },
  { name: 'Denting & Painting', category: 'REPAIR', basePrice: '7400.00', durationMins: 480 },
  { name: 'AC Service & Gas Refill', category: 'REPAIR', basePrice: '3200.00', durationMins: 75 },
  { name: 'Battery Replacement', category: 'EMERGENCY', basePrice: '5400.00', durationMins: 40 },
  { name: 'Roadside Assistance', category: 'EMERGENCY', basePrice: '1500.00', durationMins: 60 },
  { name: 'Full Diagnostic Scan', category: 'DIAGNOSTIC', basePrice: '1499.00', durationMins: 50 },
  {
    name: 'Pre-Purchase Inspection',
    category: 'INSPECTION',
    basePrice: '2199.00',
    durationMins: 90,
  },
];

// ── volumes ─────────────────────────────────────────────────────────────────
const N_CUSTOMERS = 60;
/** Acquisition cohorts, so "new customers (last 30d)" and its % delta are both non-zero. */
const N_CUSTOMERS_LAST_30D = 15;
const N_CUSTOMERS_PRIOR_30D = 10;
const N_VEHICLES = 90; // 30 customers own a second car
const N_MECHANICS = 25;
const N_BOOKINGS = 650;
const N_TODAY = 25; // so "Today's bookings" is never zero during a demo
const DAYS_BACK = 90;

/** Exact counts, not probabilities — 650 rows is small enough that sampling drifts visibly. */
const STATUS_MIX: readonly (readonly [BookingStatus, number])[] = [
  ['COMPLETED', 0.55],
  ['PENDING', 0.12],
  ['ASSIGNED', 0.1],
  ['ON_THE_WAY', 0.08],
  ['IN_PROGRESS', 0.08],
  ['CANCELLED', 0.07],
];

/** A booking still moving through the pipeline. Today's bookings are drawn from these. */
const IN_FLIGHT: readonly BookingStatus[] = ['PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'];

/** Transitions that precede a status, so the audit trail reads as a real history. */
const CHAIN: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: [],
  ASSIGNED: ['ASSIGNED'],
  ON_THE_WAY: ['ASSIGNED', 'ON_THE_WAY'],
  IN_PROGRESS: ['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'],
  COMPLETED: ['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'],
  CANCELLED: ['CANCELLED'],
};

const EVENT_NOTES: Partial<Record<BookingStatus, readonly string[]>> = {
  ASSIGNED: ['Mechanic assigned by ops', 'Auto-assigned to nearest available mechanic'],
  ON_THE_WAY: ['Mechanic en route', 'Left depot'],
  IN_PROGRESS: ['Work started on site', 'Vehicle received at workshop'],
  COMPLETED: ['Job completed, invoice raised', 'Work finished and vehicle handed over'],
  CANCELLED: [
    'Cancelled by customer',
    'Cancelled — vehicle unavailable',
    'Rescheduled by customer',
  ],
};

const day = 86_400_000;

/** Relative busyness of each weekday. 0 = Sunday. */
const DAY_WEIGHT = [0.3, 1, 1, 1, 1, 1, 0.55] as const;

/**
 * Cumulative weight table over the last DAYS_BACK days, built once.
 *
 * This exists so that picking a date consumes a FIXED number of PRNG draws. The obvious
 * implementation — sample a day, reject it with probability (1 - weight), repeat — burns a
 * variable number of draws depending on which weekday you happen to run the seed on. That
 * shifts every subsequent draw and silently changes every amount in the dataset, which is
 * exactly the reproducibility the fixed seed is supposed to buy.
 */
function buildDayTable(now: number): { cumulative: number[]; total: number } {
  const cumulative: number[] = [];
  let total = 0;
  for (let daysAgo = 0; daysAgo < DAYS_BACK; daysAgo++) {
    const dow = new Date(now - daysAgo * day).getDay();
    total += DAY_WEIGHT[dow] ?? 1;
    cumulative.push(total);
  }
  return { cumulative, total };
}

/**
 * Picks a createdAt within the window, weighted so weekdays are busier than weekends —
 * a flat distribution is the giveaway that a dataset is synthetic.
 * Consumes exactly four draws: one for the day, three for the time of day.
 */
function weekdayWeightedDate(now: number, table: { cumulative: number[]; total: number }): Date {
  const target = rand() * table.total;
  // Linear scan over at most 90 entries — a binary search would save nothing measurable.
  let daysAgo = table.cumulative.findIndex((c) => c >= target);
  if (daysAgo < 0) daysAgo = DAYS_BACK - 1;

  const d = new Date(now - daysAgo * day);
  // Cluster inside working hours rather than uniformly across midnight.
  d.setHours(int(8, 19), int(0, 59), int(0, 59), 0);
  return d;
}

async function truncateAll(): Promise<void> {
  // One statement, FK-safe: CASCADE resolves ordering, RESTART IDENTITY resets sequences.
  // Domain tables only — this is a demo dataset, not a production reset.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE booking_events, bookings, vehicles, customers, mechanics, services, users RESTART IDENTITY CASCADE',
  );
  console.log('truncated domain tables (FK-safe, CASCADE)');
}

async function main(): Promise<void> {
  const now = Date.now();
  await truncateAll();

  // ── users ─────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const users = [
    {
      id: 'seed_usr_admin',
      email: 'admin@instantmechanic.com',
      name: 'Admin User',
      role: 'ADMIN' as const,
      passwordHash,
    },
    {
      id: 'seed_usr_ops',
      email: 'ops@instantmechanic.com',
      name: 'Ops User',
      role: 'OPS' as const,
      passwordHash,
    },
  ];
  await prisma.user.createMany({ data: users });
  const adminId = 'seed_usr_admin';

  // ── services ──────────────────────────────────────────────────────────────
  const services = SERVICES.map((s, i) => ({ id: `seed_svc_${pad(i + 1)}`, ...s }));
  await prisma.service.createMany({ data: services });

  // ── mechanics (jobsCompleted filled in later, from real booking counts) ────
  const mechanics = Array.from({ length: N_MECHANICS }, (_, i) => ({
    id: `seed_mec_${pad(i + 1)}`,
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    email: `mechanic${pad(i + 1)}@instantmechanic.com`,
    phone: `+91${pick(['98', '97', '99', '88', '76'] as const)}${int(10000000, 99999999)}`,
    specialisation: pick(SPECIALISATIONS),
    status: pick(['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'ON_JOB', 'ON_JOB', 'OFF_DUTY'] as const),
    rating: (3.3 + rand() * 1.7).toFixed(2),
    jobsCompleted: 0,
  }));
  await prisma.mechanic.createMany({ data: mechanics });

  // ── customers ─────────────────────────────────────────────────────────────
  // The RTO code is kept beside the customers rather than on them: it is not a column, it
  // only decides what their number plate looks like.
  const rtoByCustomer = new Map<string, string>();
  const customers = Array.from({ length: N_CUSTOMERS }, (_, i) => {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const place = pick(CITIES);
    const id = `seed_cus_${pad(i + 1)}`;
    rtoByCustomer.set(id, place.rto);

    // Acquisition cohorts, assigned by index so the split is exact rather than sampled.
    // Previously every customer was 90-500 days old, which made the dashboard's
    // "new customers (last 30d)" card read 0 forever — a correct query over data that
    // could not produce a non-zero answer.
    const daysAgo =
      i < N_CUSTOMERS_LAST_30D
        ? int(0, 29) // signed up this month
        : i < N_CUSTOMERS_LAST_30D + N_CUSTOMERS_PRIOR_30D
          ? int(30, 59) // the month before, so the % delta has a baseline
          : int(60, 500); // the long tail of existing customers

    return {
      id,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${pad(i + 1)}@gmail.com`,
      phone: `+91${pick(['98', '97', '99', '81', '73'] as const)}${int(10000000, 99999999)}`,
      city: place.city,
      createdAt: new Date(now - daysAgo * day),
    };
  });
  await prisma.customer.createMany({ data: customers });

  // ── vehicles: 90 across 60 customers, so 30 own two ────────────────────────
  const secondCarOwners = new Set(
    shuffle(customers.map((c) => c.id)).slice(0, N_VEHICLES - N_CUSTOMERS),
  );
  const vehicles: {
    id: string;
    customerId: string;
    make: string;
    model: string;
    year: number;
    regNumber: string;
  }[] = [];
  for (const c of customers) {
    const count = secondCarOwners.has(c.id) ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const n = vehicles.length + 1;
      const brand = pick(MAKES);
      const letters = String.fromCharCode(65 + int(0, 25)) + String.fromCharCode(65 + int(0, 25));
      vehicles.push({
        id: `seed_veh_${pad(n)}`,
        customerId: c.id,
        make: brand.make,
        model: pick(brand.models),
        year: int(2013, 2026),
        regNumber: `${rtoByCustomer.get(c.id) ?? 'MH01'}${letters}${pad(1000 + n, 4)}`,
      });
    }
  }
  await prisma.vehicle.createMany({ data: vehicles });

  // ── status pool: exact counts, split into today vs history ────────────────
  const pool: BookingStatus[] = [];
  for (const [status, share] of STATUS_MIX) {
    for (let i = 0; i < Math.round(share * N_BOOKINGS); i++) pool.push(status);
  }
  while (pool.length < N_BOOKINGS) pool.push('COMPLETED');
  while (pool.length > N_BOOKINGS) pool.pop();
  shuffle(pool);

  // Today's bookings are drawn from in-flight statuses only: a job booked this morning and
  // already marked COMPLETED-90-days-of-history is not a thing ops would ever see.
  const todayStatuses: BookingStatus[] = [];
  for (let i = pool.length - 1; i >= 0 && todayStatuses.length < N_TODAY; i--) {
    if (IN_FLIGHT.includes(pool[i] as BookingStatus)) todayStatuses.push(...pool.splice(i, 1));
  }

  // ── bookings + audit events ───────────────────────────────────────────────
  const bookings: {
    id: string;
    code: string;
    customerId: string;
    vehicleId: string;
    serviceId: string;
    mechanicId: string | null;
    status: BookingStatus;
    amount: string;
    scheduledAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];

  const events: {
    id: string;
    bookingId: string;
    fromStatus: BookingStatus | null;
    toStatus: BookingStatus;
    actorId: string | null;
    note: string | null;
    createdAt: Date;
  }[] = [];

  const completedByMechanic = new Map<string, number>();
  let eventNo = 0;

  // Customer sign-up date, so a booking is never attributed to someone who had not yet
  // registered. Now that 15 customers are less than a month old, picking a vehicle blindly
  // would place 90-day-old bookings against week-old customers — another state that cannot exist.
  const customerCreatedAt = new Map(customers.map((c) => [c.id, c.createdAt.getTime()]));

  const makeBooking = (index: number, status: BookingStatus, createdAt: Date): void => {
    const eligible = vehicles.filter(
      (v) => (customerCreatedAt.get(v.customerId) ?? 0) <= createdAt.getTime(),
    );
    // One draw either way, so the PRNG stream stays fixed-length per booking.
    const vehicle = pick(eligible.length > 0 ? eligible : vehicles);
    const service = pick(services);

    // A PENDING booking has no mechanic yet — that IS the dispatch queue. Everything past
    // ASSIGNED must have one. CANCELLED may or may not, depending when it was called off.
    const needsMechanic = status !== 'PENDING' && !(status === 'CANCELLED' && rand() < 0.5);
    const mechanicId = needsMechanic ? pick(mechanics).id : null;

    const scheduledAt = new Date(createdAt.getTime() + int(2, 96) * 3_600_000);
    const completedAt =
      status === 'COMPLETED'
        ? new Date(scheduledAt.getTime() + service.durationMins * 60_000)
        : null;

    if (status === 'COMPLETED' && mechanicId) {
      completedByMechanic.set(mechanicId, (completedByMechanic.get(mechanicId) ?? 0) + 1);
    }

    // Parts, labour and the occasional discount move the final price off the list price.
    const amount = (Number(service.basePrice) * (0.85 + rand() * 0.5)).toFixed(2);
    const id = `seed_bkg_${pad(index + 1, 4)}`;

    bookings.push({
      id,
      code: `BK-${10000 + index}`,
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      serviceId: service.id,
      mechanicId,
      status,
      amount,
      scheduledAt,
      completedAt,
      createdAt,
      updatedAt: completedAt ?? scheduledAt,
    });

    // Every booking gets at least this row, so the audit trail is never empty.
    let at = createdAt.getTime();
    events.push({
      id: `seed_evt_${pad(++eventNo, 5)}`,
      bookingId: id,
      fromStatus: null,
      toStatus: 'PENDING',
      actorId: null,
      note: 'Booking created',
      createdAt: new Date(at),
    });

    let from: BookingStatus = 'PENDING';
    for (const to of CHAIN[status]) {
      at += int(10, 240) * 60_000;
      const notes = EVENT_NOTES[to];
      events.push({
        id: `seed_evt_${pad(++eventNo, 5)}`,
        bookingId: id,
        fromStatus: from,
        toStatus: to,
        actorId: adminId,
        note: notes ? pick(notes) : null,
        createdAt: new Date(at),
      });
      from = to;
    }
  };

  const dayTable = buildDayTable(now);
  pool.forEach((status, i) => makeBooking(i, status, weekdayWeightedDate(now, dayTable)));
  todayStatuses.forEach((status, i) => {
    const today = new Date(now);
    today.setHours(int(7, Math.max(8, new Date(now).getHours())), int(0, 59), int(0, 59), 0);
    makeBooking(pool.length + i, status, today);
  });

  await prisma.booking.createMany({ data: bookings });
  // Chunked: one multi-thousand-row INSERT over a pooled internet connection is a timeout
  // waiting to happen.
  for (let i = 0; i < events.length; i += 500) {
    await prisma.bookingEvent.createMany({ data: events.slice(i, i + 500) });
  }

  // ── make the denormalised counter tell the truth ──────────────────────────
  // jobsCompleted is derived from the bookings actually seeded, never invented. A
  // denormalised field that disagrees with its source is worse than no field at all.
  for (const [mechanicId, count] of completedByMechanic) {
    await prisma.mechanic.update({ where: { id: mechanicId }, data: { jobsCompleted: count } });
  }

  // ── report ────────────────────────────────────────────────────────────────
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [byStatus, todayCount, revenue, counts] = await Promise.all([
    prisma.booking.groupBy({ by: ['status'], _count: true }),
    prisma.booking.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
    Promise.all([
      prisma.user.count(),
      prisma.customer.count(),
      prisma.vehicle.count(),
      prisma.mechanic.count(),
      prisma.service.count(),
      prisma.booking.count(),
      prisma.bookingEvent.count(),
    ]),
  ]);

  const [nUsers, nCustomers, nVehicles, nMechanics, nServices, nBookings, nEvents] = counts;
  console.log(
    `\nseeded: users=${nUsers} customers=${nCustomers} vehicles=${nVehicles} ` +
      `mechanics=${nMechanics} services=${nServices} bookings=${nBookings} events=${nEvents}`,
  );
  console.log(`today's bookings: ${todayCount}`);
  console.log(`completed revenue: ${revenue._sum.amount?.toString() ?? '0'}`);
  console.log('status distribution:');
  for (const row of [...byStatus].sort((a, b) => b._count - a._count)) {
    const pct = ((row._count / nBookings) * 100).toFixed(1);
    console.log(`  ${row.status.padEnd(12)} ${String(row._count).padStart(3)}  ${pct}%`);
  }
  console.log(`\nlogin: admin@instantmechanic.com / ops@instantmechanic.com — ${DEMO_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
