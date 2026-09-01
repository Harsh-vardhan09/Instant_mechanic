import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, getTokens, type Tokens } from '../helpers/app.js';
import { COMPLETED_TOTAL, resetAndSeed } from '../helpers/fixture.js';
import { invalidateDashboardCache } from '../../src/modules/analytics/analytics.service.js';

/**
 * AGGREGATES ARE COMPUTED IN SQL OVER THE FULL FILTERED SET.
 *
 * The rule exists because the wrong implementation is easy, plausible, and silently produces
 * a number that looks right. Fetch a page of bookings, sum `amount` in JavaScript, render it
 * as "Total revenue" — page 1 of 4 gives a quarter of the real figure with no error, no
 * warning, and no visual difference from the truth. Ops then makes a money decision on it.
 *
 * This file makes the rule executable: with a dataset larger than one page, the reported
 * total must NOT equal the sum of a single page. If someone ever "simplifies" the aggregate
 * into a JS reduce over the current page, these fail immediately.
 */

let tokens: Tokens;

beforeAll(async () => {
  await resetAndSeed();
  tokens = await getTokens();
});

describe('revenue is aggregated over the whole set, not one page', () => {
  it('dashboard total does NOT equal the sum of page 1', async () => {
    const PAGE = 5;

    const page1 = await api()
      .get(`/api/bookings?status=COMPLETED&limit=${PAGE}&sort=amount&order=desc`)
      .set(auth(tokens.ops));

    expect(page1.status).toBe(200);
    // The filter must genuinely span more than one page, or this proves nothing.
    expect(page1.body.meta.totalPages).toBeGreaterThan(1);
    expect(page1.body.data).toHaveLength(PAGE);

    const pageSum = page1.body.data.reduce(
      (s: number, b: { amount: string }) => s + Number(b.amount),
      0,
    );

    invalidateDashboardCache();
    const dash = await api().get('/api/dashboard').set(auth(tokens.ops));
    const reported = Number(dash.body.data.totalRevenue);

    // Sorted desc, page 1 holds the five largest: 1200+1100+1000+900+800 = 5000.
    expect(pageSum).toBe(5000);
    // The truth is every completed booking: 7800 + the terminal 50.
    expect(reported).toBe(COMPLETED_TOTAL + 50);

    // The assertion that catches the bug.
    expect(reported).not.toBe(pageSum);
    expect(reported).toBeGreaterThan(pageSum);
  });

  it('the same total holds regardless of the page size requested', async () => {
    // A total derived from the current page would move with `limit`. This one cannot.
    const totals: number[] = [];
    for (const limit of [1, 5, 100]) {
      await api().get(`/api/bookings?limit=${limit}`).set(auth(tokens.ops));
      invalidateDashboardCache();
      const dash = await api().get('/api/dashboard').set(auth(tokens.ops));
      totals.push(Number(dash.body.data.totalRevenue));
    }
    expect(new Set(totals).size).toBe(1);
  });

  it('service-breakdown revenue is unaffected by pagination of the bookings list', async () => {
    const first = await api().get('/api/analytics/service-breakdown').set(auth(tokens.ops));
    await api().get('/api/bookings?page=2&limit=3').set(auth(tokens.ops));
    const second = await api().get('/api/analytics/service-breakdown').set(auth(tokens.ops));
    expect(second.body.data).toEqual(first.body.data);
  });

  it('booking counts in status-breakdown match the list meta for the same filter', async () => {
    const [breakdown, completed] = await Promise.all([
      api().get('/api/analytics/status-breakdown').set(auth(tokens.ops)),
      api().get('/api/bookings?status=COMPLETED&limit=1').set(auth(tokens.ops)),
    ]);

    const fromBreakdown = breakdown.body.data.find(
      (r: { status: string }) => r.status === 'COMPLETED',
    ).count;

    // One number, two code paths — a groupBy and a COUNT with a WHERE. They must agree.
    expect(fromBreakdown).toBe(completed.body.meta.total);
    // And neither is the length of the page.
    expect(completed.body.data).toHaveLength(1);
    expect(completed.body.meta.total).toBeGreaterThan(1);
  });
});
