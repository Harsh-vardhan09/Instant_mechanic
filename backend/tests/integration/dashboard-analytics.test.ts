import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, getTokens, type Tokens } from '../helpers/app.js';
import {
  CANCELLED_AMOUNT,
  COMPLETED_TOTAL,
  TOTAL_BOOKINGS,
  resetAndSeed,
} from '../helpers/fixture.js';
import { invalidateDashboardCache } from '../../src/modules/analytics/analytics.service.js';

let tokens: Tokens;

beforeAll(async () => {
  await resetAndSeed();
  tokens = await getTokens();
});

describe('GET /api/dashboard', () => {
  it('returns every documented field with the right types', async () => {
    invalidateDashboardCache();
    const res = await api().get('/api/dashboard').set(auth(tokens.ops));
    expect(res.status).toBe(200);

    const d = res.body.data;
    for (const k of [
      'totalBookings',
      'todayBookings',
      'completedBookings',
      'pendingBookings',
      'cancelledBookings',
      'activeMechanics',
      'newCustomers',
    ]) {
      expect(typeof d[k], `${k} should be a number`).toBe('number');
    }
    // Money is a decimal string, never a float — cents disappear at scale otherwise.
    expect(typeof d.totalRevenue).toBe('string');
    expect(typeof d.generatedAt).toBe('string');
    expect(d.changes).toBeTypeOf('object');
    // A point-in-time gauge with no history: any delta would be invented.
    expect(d.changes.activeMechanics).toBeNull();
  });

  /**
   * The revenue rule, made executable. The fixture's CANCELLED booking carries a deliberately
   * large amount (999.99) so that if it ever leaked into the total, the number would be
   * unmistakably wrong rather than plausibly wrong.
   */
  it('counts ONLY completed bookings in totalRevenue', async () => {
    invalidateDashboardCache();
    const res = await api().get('/api/dashboard').set(auth(tokens.ops));

    // 12 completed at 100…1200 = 7800, plus the terminal 50.00 = 7850.
    const expected = COMPLETED_TOTAL + 50;
    expect(Number(res.body.data.totalRevenue)).toBe(expected);
  });

  it('excludes cancelled bookings from revenue while still counting them in totalBookings', async () => {
    invalidateDashboardCache();
    const res = await api().get('/api/dashboard').set(auth(tokens.ops));
    const d = res.body.data;

    // The cancellation happened — it belongs in the booking count.
    expect(d.totalBookings).toBe(TOTAL_BOOKINGS);
    expect(d.cancelledBookings).toBe(1);

    // …but it produced no money.
    expect(Number(d.totalRevenue)).toBe(COMPLETED_TOTAL + 50);
    expect(Number(d.totalRevenue)).not.toBe(COMPLETED_TOTAL + 50 + CANCELLED_AMOUNT);
  });

  it('requires authentication', async () => {
    expect((await api().get('/api/dashboard')).status).toBe(401);
  });
});

describe('GET /api/analytics/status-breakdown', () => {
  it('percentages sum to 100', async () => {
    const res = await api().get('/api/analytics/status-breakdown').set(auth(tokens.ops));
    expect(res.status).toBe(200);

    const total = res.body.data.reduce(
      (s: number, r: { percentage: number }) => s + r.percentage,
      0,
    );
    // Each row is rounded to one decimal, so the sum can land a rounding step either side.
    expect(total).toBeGreaterThanOrEqual(99.9);
    expect(total).toBeLessThanOrEqual(100.1);
  });

  it('counts sum to the total number of bookings', async () => {
    const res = await api().get('/api/analytics/status-breakdown').set(auth(tokens.ops));
    const sum = res.body.data.reduce((s: number, r: { count: number }) => s + r.count, 0);
    expect(sum).toBe(TOTAL_BOOKINGS);
  });
});

describe('GET /api/analytics/service-breakdown', () => {
  it('revenue across categories sums to the dashboard total', async () => {
    // Two independent SQL paths agreeing is a much stronger check than either alone.
    invalidateDashboardCache();
    const [dash, svc] = await Promise.all([
      api().get('/api/dashboard').set(auth(tokens.ops)),
      api().get('/api/analytics/service-breakdown').set(auth(tokens.ops)),
    ]);

    const sum = svc.body.data.reduce(
      (s: number, r: { revenue: string }) => s + Number(r.revenue),
      0,
    );
    expect(sum).toBeCloseTo(Number(dash.body.data.totalRevenue), 2);
  });
});

describe('time series zero-filling', () => {
  /**
   * The fixture puts every completed booking on ONE day, three days ago. In a 7-day window
   * the other six days genuinely have nothing — and must come back as explicit zeros.
   *
   * A missing row is not equivalent: a chart library draws a straight line from the previous
   * point to the next, which renders a dead day as a gentle slope. Both read as "business as
   * usual" to a human; only one is true.
   */
  it('returns one point per day for the range, including days with no bookings', async () => {
    const res = await api().get('/api/analytics/bookings-over-time?range=7d').set(auth(tokens.ops));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(7);

    const zeroDays = res.body.data.filter((p: { count: number }) => p.count === 0);
    expect(zeroDays.length).toBeGreaterThan(0);

    // Dates are contiguous and ascending — no gaps hiding as ordering.
    const dates = res.body.data.map((p: { date: string }) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('zero-fills revenue the same way, as the string "0"', async () => {
    const res = await api().get('/api/analytics/revenue-over-time?range=7d').set(auth(tokens.ops));

    expect(res.body.data).toHaveLength(7);
    const zeros = res.body.data.filter((p: { revenue: string }) => Number(p.revenue) === 0);
    expect(zeros.length).toBeGreaterThan(0);
    // Still a decimal string, even at zero — the type does not change with the value.
    expect(typeof res.body.data[0].revenue).toBe('string');
  });

  it('returns 30 and 90 points for the other ranges', async () => {
    const [d30, d90] = await Promise.all([
      api().get('/api/analytics/bookings-over-time?range=30d').set(auth(tokens.ops)),
      api().get('/api/analytics/bookings-over-time?range=90d').set(auth(tokens.ops)),
    ]);
    expect(d30.body.data).toHaveLength(30);
    expect(d90.body.data).toHaveLength(90);
  });

  it('rejects an unsupported range with 400 rather than silently defaulting', async () => {
    const res = await api().get('/api/analytics/bookings-over-time?range=1y').set(auth(tokens.ops));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
