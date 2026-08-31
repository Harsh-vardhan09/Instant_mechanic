import bcrypt from 'bcryptjs';
import type { BookingStatus, MechanicStatus, ServiceCategory } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';

/**
 * Seeds the bootstrap ADMIN and a realistic slice of operational data.
 *
 * Idempotent by construction: every row has a deterministic `seed_*` id and is inserted with
 * createMany({ skipDuplicates: true }), so rerunning is a no-op rather than a duplicate load.
 * The P14 gate requires pipelines to be rerunnable — this is that, not a promise about it.
 *
 * Deterministic too: one fixed-seed PRNG drives every choice, so the same command produces
 * identical data on every machine. A dashboard bug that reproduces for you reproduces for me.
 */
const BCRYPT_ROUNDS = 10;

/** Mulberry32 — tiny, seeded, no dependency. Reproducibility over cryptographic quality. */
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

const FIRST = [
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
] as const;
const LAST = [
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
] as const;
const CITIES = [
  'Mumbai',
  'Pune',
  'Bengaluru',
  'Hyderabad',
  'Delhi',
  'Chennai',
  'Ahmedabad',
  'Kolkata',
] as const;
const MAKES = [
  ['Maruti Suzuki', ['Swift', 'Baleno', 'Dzire', 'Brezza']],
  ['Hyundai', ['i20', 'Creta', 'Venue', 'Verna']],
  ['Tata', ['Nexon', 'Punch', 'Harrier', 'Altroz']],
  ['Mahindra', ['XUV700', 'Thar', 'Scorpio', 'Bolero']],
  ['Honda', ['City', 'Amaze', 'Elevate']],
  ['Toyota', ['Innova', 'Fortuner', 'Glanza']],
] as const;
const SPECIALISATIONS = [
  'Engine & Transmission',
  'Brakes & Suspension',
  'Electrical & Battery',
  'AC & Cooling',
  'Tyres & Wheels',
  'Diagnostics',
  'Bodywork',
  'General Service',
] as const;

const SERVICES: readonly {
  name: string;
  category: ServiceCategory;
  basePrice: string;
  durationMins: number;
}[] = [
  { name: 'Periodic Service', category: 'MAINTENANCE', basePrice: '3499.00', durationMins: 120 },
  { name: 'Engine Oil Change', category: 'MAINTENANCE', basePrice: '1899.00', durationMins: 45 },
  { name: 'Brake Pad Replacement', category: 'REPAIR', basePrice: '4250.00', durationMins: 90 },
  { name: 'AC Service & Regas', category: 'REPAIR', basePrice: '3200.00', durationMins: 75 },
  { name: 'Battery Jumpstart', category: 'EMERGENCY', basePrice: '899.00', durationMins: 30 },
  { name: 'Roadside Breakdown', category: 'EMERGENCY', basePrice: '2500.00', durationMins: 60 },
  { name: 'Full Diagnostic Scan', category: 'DIAGNOSTIC', basePrice: '1499.00', durationMins: 50 },
  {
    name: 'Pre-Purchase Inspection',
    category: 'INSPECTION',
    basePrice: '2199.00',
    durationMins: 90,
  },
];

/** Weighted so the dashboard shows a believable mix, not an even split. */
const STATUS_WEIGHTS: readonly (readonly [BookingStatus, number])[] = [
  ['COMPLETED', 55],
  ['IN_PROGRESS', 12],
  ['PENDING', 10],
  ['ASSIGNED', 8],
  ['CANCELLED', 8],
  ['ON_THE_WAY', 7],
];

function pickStatus(): BookingStatus {
  const total = STATUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [status, w] of STATUS_WEIGHTS) {
    r -= w;
    if (r <= 0) return status;
  }
  return 'COMPLETED';
}

/** Transitions preceding a status, so BookingEvent reads as a real audit chain. */
const CHAIN: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: [],
  ASSIGNED: ['ASSIGNED'],
  ON_THE_WAY: ['ASSIGNED', 'ON_THE_WAY'],
  IN_PROGRESS: ['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'],
  COMPLETED: ['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'],
  CANCELLED: ['CANCELLED'],
};

const N_MECHANICS = 12;
const N_CUSTOMERS = 45;
const N_BOOKINGS = 260; // > 100 so the pagination limit cap is exercised by real data
const DAYS_BACK = 90;

async function seedAdmin(): Promise<string | null> {
  const email = process.env['SEED_ADMIN_EMAIL']?.toLowerCase().trim();
  const password = process.env['SEED_ADMIN_PASSWORD'];
  const name = process.env['SEED_ADMIN_NAME'] ?? 'Admin';

  if (email && password) {
    if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`admin already exists: ${email} — not modified`);
      return existing.id;
    }
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: 'ADMIN',
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      },
    });
    console.log(`seeded ADMIN ${user.email}`);
    return user.id;
  }

  const anyAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (anyAdmin) {
    console.log(`admin present (${anyAdmin.email}) — skipping admin seed`);
    return anyAdmin.id;
  }
  throw new Error(
    'No ADMIN exists and no credentials given. Bootstrap one:\n' +
      '  SEED_ADMIN_EMAIL=ops@example.com SEED_ADMIN_PASSWORD="<12+ chars>" npm run db:seed',
  );
}

async function seedDomain(actorId: string | null): Promise<void> {
  const now = Date.now();
  const day = 86_400_000;

  // ── services ──────────────────────────────────────────────────────────────
  const services = SERVICES.map((s, i) => ({ id: `seed_svc_${pad(i + 1)}`, ...s }));
  await prisma.service.createMany({ data: services, skipDuplicates: true });

  // ── mechanics ─────────────────────────────────────────────────────────────
  const mechanics = Array.from({ length: N_MECHANICS }, (_, i) => ({
    id: `seed_mec_${pad(i + 1)}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    email: `mechanic${pad(i + 1)}@instantmechanic.local`,
    phone: `+9198${int(10000000, 99999999)}`,
    specialisation: pick(SPECIALISATIONS),
    status: pick(['AVAILABLE', 'AVAILABLE', 'ON_JOB', 'OFF_DUTY'] as const) as MechanicStatus,
    rating: (3.4 + rand() * 1.6).toFixed(2),
    jobsCompleted: int(5, 320),
  }));
  await prisma.mechanic.createMany({ data: mechanics, skipDuplicates: true });

  // ── customers + vehicles ──────────────────────────────────────────────────
  const customers = Array.from({ length: N_CUSTOMERS }, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    return {
      id: `seed_cus_${pad(i + 1)}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${pad(i + 1)}@example.com`,
      phone: `+9197${int(10000000, 99999999)}`,
      city: pick(CITIES),
      createdAt: new Date(now - int(DAYS_BACK, 400) * day),
    };
  });
  await prisma.customer.createMany({ data: customers, skipDuplicates: true });

  const vehicles: {
    id: string;
    customerId: string;
    make: string;
    model: string;
    year: number;
    regNumber: string;
  }[] = [];
  let v = 0;
  for (const c of customers) {
    const count = int(1, 2);
    for (let k = 0; k < count; k++) {
      v += 1;
      const entry = pick(MAKES);
      const make = entry[0];
      const models = entry[1];
      const letterA = String.fromCharCode(65 + int(0, 25));
      const letterB = String.fromCharCode(65 + int(0, 25));
      vehicles.push({
        id: `seed_veh_${pad(v)}`,
        customerId: c.id,
        make,
        model: pick(models),
        year: int(2014, 2025),
        regNumber: `MH${int(10, 49)}${letterA}${letterB}${pad(v, 4)}`,
      });
    }
  }
  await prisma.vehicle.createMany({ data: vehicles, skipDuplicates: true });

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

  let e = 0;
  for (let i = 0; i < N_BOOKINGS; i++) {
    const vehicle = pick(vehicles);
    const service = pick(services);
    const status = pickStatus();
    // PENDING bookings have no mechanic yet — that is the whole point of the dispatch queue.
    const mechanicId = status === 'PENDING' ? null : pick(mechanics).id;

    const createdAt = new Date(now - rand() * DAYS_BACK * day);
    const scheduledAt = new Date(createdAt.getTime() + int(2, 96) * 3_600_000);
    const completedAt =
      status === 'COMPLETED'
        ? new Date(scheduledAt.getTime() + service.durationMins * 60_000)
        : null;

    // Final price varies around the base: parts, labour, the odd discount.
    const amount = (Number(service.basePrice) * (0.9 + rand() * 0.45)).toFixed(2);
    const id = `seed_bkg_${pad(i + 1, 4)}`;

    bookings.push({
      id,
      code: `BK-${10000 + i}`,
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

    let at = createdAt.getTime();
    // Every booking starts life as PENDING — record that as the first audit row.
    events.push({
      id: `seed_evt_${pad(++e, 5)}`,
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
      events.push({
        id: `seed_evt_${pad(++e, 5)}`,
        bookingId: id,
        fromStatus: from,
        toStatus: to,
        actorId,
        note: null,
        createdAt: new Date(at),
      });
      from = to;
    }
  }

  await prisma.booking.createMany({ data: bookings, skipDuplicates: true });
  // Chunked: one huge INSERT over a pooled internet connection is a timeout waiting to happen.
  for (let i = 0; i < events.length; i += 500) {
    await prisma.bookingEvent.createMany({ data: events.slice(i, i + 500), skipDuplicates: true });
  }

  console.log(
    `seeded: ${services.length} services, ${mechanics.length} mechanics, ${customers.length} customers, ` +
      `${vehicles.length} vehicles, ${bookings.length} bookings, ${events.length} events`,
  );
}

async function main(): Promise<void> {
  const actorId = await seedAdmin();
  await seedDomain(actorId);

  const [customers, vehicles, mechanics, servicesN, bookings, events] = await Promise.all([
    prisma.customer.count(),
    prisma.vehicle.count(),
    prisma.mechanic.count(),
    prisma.service.count(),
    prisma.booking.count(),
    prisma.bookingEvent.count(),
  ]);
  console.log(
    `totals -> customers=${customers} vehicles=${vehicles} mechanics=${mechanics} ` +
      `services=${servicesN} bookings=${bookings} events=${events}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
