import * as repo from './analytics.repository.js';
import { RANGE_DAYS, type RangeQuery } from './analytics.schema.js';

/**
 * Business rules for the analytics slice. No Prisma here — every figure arrives already
 * aggregated from the repository. This layer only shapes, labels and caches.
 */

const CACHE_TTL_MS = 30_000;

export interface DashboardChanges {
  /** Percent change vs the previous equivalent window. null when there is no baseline. */
  totalBookings: number | null;
  todayBookings: number | null;
  completedBookings: number | null;
  pendingBookings: number | null;
  cancelledBookings: number | null;
  totalRevenue: number | null;
  /** Point-in-time gauge with no history kept — a delta would be invented, so it is null. */
  activeMechanics: null;
  newCustomers: number | null;
}

export interface DashboardResponse {
  totalBookings: number;
  todayBookings: number;
  completedBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  /** Decimal string, not a float. COMPLETED bookings only. */
  totalRevenue: string;
  activeMechanics: number;
  newCustomers: number;
  changes: DashboardChanges;
  generatedAt: string;
}

/**
 * Percent change, rounded to one decimal.
 *
 * A zero baseline has no honest percentage — "up from nothing" is not 100% growth, it is
 * undefined. Returning null lets the UI print "—" instead of inventing a number.
 */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Local-time day boundaries, matching how the seed defines "today". */
function windows(now: Date) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const curStart = new Date(todayStart);
  curStart.setDate(curStart.getDate() - 30);

  const prevStart = new Date(todayStart);
  prevStart.setDate(prevStart.getDate() - 60);

  return { todayStart, yesterdayStart, curStart, prevStart };
}

// ── 30-second global cache ──────────────────────────────────────────────────
// Keyed by nothing: the dashboard is identical for every operator, so one slot is the whole
// cache. Every request otherwise costs a full-table aggregate, and with a dashboard polling
// on an interval across a room of operators that adds up fast.
let cached: { at: number; value: DashboardResponse } | null = null;

/**
 * Called by any write path that changes a booking, so an operator who dispatches a mechanic
 * sees the card set move immediately rather than up to 30 seconds later. Stale-by-a-tick is
 * fine for a passive viewer; stale right after your own action looks broken.
 */
export function invalidateDashboardCache(): void {
  cached = null;
}

export async function getDashboard(): Promise<DashboardResponse> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

  const w = windows(new Date(now));

  const [totals, activeMechanics, newCustomers, prevNewCustomers] = await Promise.all([
    repo.getDashboardTotals(w),
    repo.getActiveMechanics(),
    repo.getNewCustomers(w.curStart),
    repo.getNewCustomersBetween(w.prevStart, w.curStart),
  ]);

  const value: DashboardResponse = {
    totalBookings: totals.totalBookings,
    todayBookings: totals.todayBookings,
    completedBookings: totals.completedBookings,
    pendingBookings: totals.pendingBookings,
    cancelledBookings: totals.cancelledBookings,
    totalRevenue: totals.totalRevenue,
    activeMechanics,
    newCustomers,
    changes: {
      totalBookings: pctChange(totals.curBookings, totals.prevBookings),
      todayBookings: pctChange(totals.todayBookings, totals.yesterdayBookings),
      completedBookings: pctChange(totals.curCompleted, totals.prevCompleted),
      pendingBookings: pctChange(totals.curPending, totals.prevPending),
      cancelledBookings: pctChange(totals.curCancelled, totals.prevCancelled),
      totalRevenue: pctChange(Number(totals.curRevenue), Number(totals.prevRevenue)),
      activeMechanics: null,
      newCustomers: pctChange(newCustomers, prevNewCustomers),
    },
    generatedAt: new Date(now).toISOString(),
  };

  cached = { at: now, value };
  return value;
}

/** YYYY-MM-DD in local time, so labels line up with the day boundaries used above. */
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive window of `days` ending today, on local midnight boundaries. */
function seriesRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from, to };
}

export async function getBookingsOverTime(
  query: RangeQuery,
): Promise<{ date: string; count: number }[]> {
  const { from, to } = seriesRange(RANGE_DAYS[query.range]);
  const rows = await repo.getBookingsOverTime(from, to);
  // Rows are already zero-filled by generate_series; this only labels them.
  return rows.map((r) => ({ date: isoDay(r.bucket), count: r.count }));
}

export async function getRevenueOverTime(
  query: RangeQuery,
): Promise<{ date: string; revenue: string }[]> {
  const { from, to } = seriesRange(RANGE_DAYS[query.range]);
  const rows = await repo.getRevenueOverTime(from, to);
  return rows.map((r) => ({ date: isoDay(r.bucket), revenue: r.revenue }));
}

export async function getStatusBreakdown(): Promise<repo.StatusSlice[]> {
  return repo.getStatusBreakdown();
}

export async function getServiceBreakdown(): Promise<repo.ServiceSlice[]> {
  return repo.getServiceBreakdown();
}
