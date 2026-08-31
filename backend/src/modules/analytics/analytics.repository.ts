import { prisma } from '../../lib/prisma.js';

/**
 * The ONLY layer that touches Prisma for analytics.
 *
 * Every number here is computed by Postgres over the FULL filtered set — COUNT, SUM, FILTER
 * and window functions. Nothing selects rows into JS and reduces them. A revenue total summed
 * from one page of rows looks real and is wrong, and ops makes money decisions on it.
 *
 * REVENUE RULE, applied everywhere in this file: revenue counts COMPLETED bookings only.
 * CANCELLED bookings still count toward booking totals — they are real operational events —
 * but never contribute a rupee to revenue.
 */

/** Raw counters straight out of SQL; the service turns these into the API shape. */
export interface DashboardTotals {
  totalBookings: number;
  todayBookings: number;
  completedBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  totalRevenue: string;

  // Current vs previous window, for the % deltas.
  curBookings: number;
  prevBookings: number;
  yesterdayBookings: number;
  curCompleted: number;
  prevCompleted: number;
  curPending: number;
  prevPending: number;
  curCancelled: number;
  prevCancelled: number;
  curRevenue: string;
  prevRevenue: string;
}

interface TotalsRow {
  total_bookings: number;
  today_bookings: number;
  completed_bookings: number;
  pending_bookings: number;
  cancelled_bookings: number;
  total_revenue: string;
  cur_bookings: number;
  prev_bookings: number;
  yesterday_bookings: number;
  cur_completed: number;
  prev_completed: number;
  cur_pending: number;
  prev_pending: number;
  cur_cancelled: number;
  prev_cancelled: number;
  cur_revenue: string;
  prev_revenue: string;
}

/**
 * One pass over `bookings` producing every headline figure and its comparison window.
 * Aggregating with FILTER beats issuing a dozen COUNT queries: a single scan, a single
 * round trip over a pooled internet connection, and every number from the same snapshot —
 * so the card set cannot show figures that disagree with each other.
 */
export async function getDashboardTotals(windows: {
  todayStart: Date;
  yesterdayStart: Date;
  curStart: Date;
  prevStart: Date;
}): Promise<DashboardTotals> {
  const { todayStart, yesterdayStart, curStart, prevStart } = windows;

  const rows = await prisma.$queryRaw<TotalsRow[]>`
    SELECT
      COUNT(*)::int                                                          AS total_bookings,
      COUNT(*) FILTER (WHERE b."createdAt" >= ${todayStart})::int             AS today_bookings,
      COUNT(*) FILTER (WHERE b.status = 'COMPLETED')::int                     AS completed_bookings,
      COUNT(*) FILTER (WHERE b.status = 'PENDING')::int                       AS pending_bookings,
      COUNT(*) FILTER (WHERE b.status = 'CANCELLED')::int                     AS cancelled_bookings,
      -- revenue: COMPLETED only, never CANCELLED
      COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'COMPLETED'), 0)::text  AS total_revenue,

      COUNT(*) FILTER (WHERE b."createdAt" >= ${curStart})::int               AS cur_bookings,
      COUNT(*) FILTER (WHERE b."createdAt" >= ${prevStart}
                         AND b."createdAt" <  ${curStart})::int               AS prev_bookings,
      COUNT(*) FILTER (WHERE b."createdAt" >= ${yesterdayStart}
                         AND b."createdAt" <  ${todayStart})::int             AS yesterday_bookings,

      -- completed/revenue windows key off completedAt: that is when the work actually landed
      COUNT(*) FILTER (WHERE b.status = 'COMPLETED'
                         AND b."completedAt" >= ${curStart})::int             AS cur_completed,
      COUNT(*) FILTER (WHERE b.status = 'COMPLETED'
                         AND b."completedAt" >= ${prevStart}
                         AND b."completedAt" <  ${curStart})::int             AS prev_completed,

      COUNT(*) FILTER (WHERE b.status = 'PENDING'
                         AND b."createdAt" >= ${curStart})::int               AS cur_pending,
      COUNT(*) FILTER (WHERE b.status = 'PENDING'
                         AND b."createdAt" >= ${prevStart}
                         AND b."createdAt" <  ${curStart})::int               AS prev_pending,
      COUNT(*) FILTER (WHERE b.status = 'CANCELLED'
                         AND b."createdAt" >= ${curStart})::int               AS cur_cancelled,
      COUNT(*) FILTER (WHERE b.status = 'CANCELLED'
                         AND b."createdAt" >= ${prevStart}
                         AND b."createdAt" <  ${curStart})::int               AS prev_cancelled,

      COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'COMPLETED'
                         AND b."completedAt" >= ${curStart}), 0)::text        AS cur_revenue,
      COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'COMPLETED'
                         AND b."completedAt" >= ${prevStart}
                         AND b."completedAt" <  ${curStart}), 0)::text        AS prev_revenue
    FROM bookings b`;

  const r = rows[0];
  if (!r) throw new Error('dashboard totals query returned no row');

  return {
    totalBookings: r.total_bookings,
    todayBookings: r.today_bookings,
    completedBookings: r.completed_bookings,
    pendingBookings: r.pending_bookings,
    cancelledBookings: r.cancelled_bookings,
    totalRevenue: r.total_revenue,
    curBookings: r.cur_bookings,
    prevBookings: r.prev_bookings,
    yesterdayBookings: r.yesterday_bookings,
    curCompleted: r.cur_completed,
    prevCompleted: r.prev_completed,
    curPending: r.cur_pending,
    prevPending: r.prev_pending,
    curCancelled: r.cur_cancelled,
    prevCancelled: r.prev_cancelled,
    curRevenue: r.cur_revenue,
    prevRevenue: r.prev_revenue,
  };
}

/** Mechanics on shift right now: anything but OFF_DUTY. Point-in-time — there is no history. */
export async function getActiveMechanics(): Promise<number> {
  return prisma.mechanic.count({ where: { status: { not: 'OFF_DUTY' } } });
}

export async function getNewCustomers(since: Date): Promise<number> {
  return prisma.customer.count({ where: { createdAt: { gte: since } } });
}

export async function getNewCustomersBetween(from: Date, to: Date): Promise<number> {
  return prisma.customer.count({ where: { createdAt: { gte: from, lt: to } } });
}

export interface CountBucket {
  bucket: Date;
  count: number;
}
export interface RevenueBucket {
  bucket: Date;
  revenue: string;
}

/**
 * Bookings per day, ZERO-FILLED in SQL.
 *
 * generate_series produces every day in the window and the LEFT JOIN attaches counts to it,
 * so a day with no bookings comes back as 0 rather than as a missing row. Left to the chart
 * library, a missing row draws a straight line from the previous point to the next — which
 * renders a dead day as a gentle slope instead of a floor. Both read as "roughly business as
 * usual" to a human; only one of them is true.
 */
export async function getBookingsOverTime(from: Date, to: Date): Promise<CountBucket[]> {
  return prisma.$queryRaw<CountBucket[]>`
    SELECT d.bucket, COUNT(b.id)::int AS count
    FROM generate_series(${from}::timestamptz, ${to}::timestamptz, interval '1 day') AS d(bucket)
    LEFT JOIN bookings b
      ON b."createdAt" >= d.bucket
     AND b."createdAt" <  d.bucket + interval '1 day'
    GROUP BY d.bucket
    ORDER BY d.bucket`;
}

/** Revenue per day, zero-filled the same way. COMPLETED only, keyed on completedAt. */
export async function getRevenueOverTime(from: Date, to: Date): Promise<RevenueBucket[]> {
  return prisma.$queryRaw<RevenueBucket[]>`
    SELECT d.bucket, COALESCE(SUM(b.amount), 0)::text AS revenue
    FROM generate_series(${from}::timestamptz, ${to}::timestamptz, interval '1 day') AS d(bucket)
    LEFT JOIN bookings b
      ON b.status = 'COMPLETED'
     AND b."completedAt" >= d.bucket
     AND b."completedAt" <  d.bucket + interval '1 day'
    GROUP BY d.bucket
    ORDER BY d.bucket`;
}

export interface StatusSlice {
  status: string;
  count: number;
  percentage: number;
}

/** Percentage comes from a window function — the denominator is the full table, not a page. */
export async function getStatusBreakdown(): Promise<StatusSlice[]> {
  return prisma.$queryRaw<StatusSlice[]>`
    SELECT
      b.status::text AS status,
      COUNT(*)::int  AS count,
      ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::float8 AS percentage
    FROM bookings b
    GROUP BY b.status
    ORDER BY count DESC`;
}

export interface ServiceSlice {
  category: string;
  count: number;
  revenue: string;
}

/**
 * Per service category: how many bookings, and how much money actually landed.
 * `count` includes every booking in that category (cancelled ones too — they happened);
 * `revenue` counts COMPLETED only. The two columns deliberately disagree.
 */
export async function getServiceBreakdown(): Promise<ServiceSlice[]> {
  return prisma.$queryRaw<ServiceSlice[]>`
    SELECT
      s.category::text AS category,
      COUNT(b.id)::int AS count,
      COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'COMPLETED'), 0)::text AS revenue
    FROM services s
    LEFT JOIN bookings b ON b."serviceId" = s.id
    GROUP BY s.category
    ORDER BY count DESC`;
}
