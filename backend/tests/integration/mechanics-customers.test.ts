import { beforeAll, describe, expect, it, vi } from 'vitest';
import { api, auth, getTokens, type Tokens } from '../helpers/app.js';
import { COMPLETED_AMOUNTS, IDS, resetAndSeed } from '../helpers/fixture.js';
import { prisma } from '../../src/lib/prisma.js';

let tokens: Tokens;

beforeAll(async () => {
  await resetAndSeed();
  tokens = await getTokens();
});

describe('GET /api/mechanics', () => {
  it('returns the uniform list envelope', async () => {
    const res = await api().get('/api/mechanics').set(auth(tokens.ops));
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, total: 2, totalPages: 1 });
    expect(res.body.data).toHaveLength(2);
  });

  it('paginates', async () => {
    const [p1, p2] = await Promise.all([
      api().get('/api/mechanics?limit=1&page=1&sort=name&order=asc').set(auth(tokens.ops)),
      api().get('/api/mechanics?limit=1&page=2&sort=name&order=asc').set(auth(tokens.ops)),
    ]);
    expect(p1.body.data).toHaveLength(1);
    expect(p2.body.data).toHaveLength(1);
    expect(p1.body.data[0].id).not.toBe(p2.body.data[0].id);
    expect(p1.body.meta.total).toBe(2);
  });

  it('filters by status', async () => {
    await prisma.mechanic.update({ where: { id: IDS.mechanicB }, data: { status: 'OFF_DUTY' } });
    const res = await api().get('/api/mechanics?status=OFF_DUTY').set(auth(tokens.ops));
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].id).toBe(IDS.mechanicB);
    await prisma.mechanic.update({ where: { id: IDS.mechanicB }, data: { status: 'AVAILABLE' } });
  });

  it('searches by name', async () => {
    const res = await api().get('/api/mechanics?search=asha').set(auth(tokens.ops));
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('Asha Mechanic');
  });

  it('reports jobsCompleted and the current or most recent booking', async () => {
    const res = await api().get('/api/mechanics?search=asha').set(auth(tokens.ops));
    const m = res.body.data[0];
    expect(m.jobsCompleted).toBe(COMPLETED_AMOUNTS.length);
    expect(m.currentBooking).not.toBeNull();
    expect(m.currentBooking.code).toMatch(/^BK-90/);
    // Nothing live in the fixture for this mechanic — the row is their latest, not a current job.
    expect(m.currentBooking.isActive).toBe(false);
  });

  /**
   * N+1 absence, asserted rather than assumed.
   *
   * The obvious implementation of "each mechanic's current booking" is a loop issuing one
   * query per row. At 20 rows a page that is 20 extra round trips to a database on the far
   * side of the internet, and the page gets slower in exact proportion to how much of it you
   * show. The real implementation resolves the whole page with one DISTINCT ON query.
   *
   * Counting the calls the repository makes is the direct way to prove it: the number must
   * not grow with the page size.
   */
  it('resolves current bookings for the whole page WITHOUT an N+1 (query count is flat)', async () => {
    const rawSpy = vi.spyOn(prisma, '$queryRaw');
    const findManySpy = vi.spyOn(prisma.booking, 'findMany');

    rawSpy.mockClear();
    findManySpy.mockClear();
    await api().get('/api/mechanics?limit=1').set(auth(tokens.ops));
    const rawForOne = rawSpy.mock.calls.length;
    const findManyForOne = findManySpy.mock.calls.length;

    rawSpy.mockClear();
    findManySpy.mockClear();
    await api().get('/api/mechanics?limit=2').set(auth(tokens.ops));
    const rawForTwo = rawSpy.mock.calls.length;
    const findManyForTwo = findManySpy.mock.calls.length;

    // One DISTINCT ON for the page, whether the page holds one mechanic or all of them.
    expect(rawForOne).toBe(1);
    expect(rawForTwo).toBe(1);
    // And no per-mechanic booking lookup at all.
    expect(findManyForOne).toBe(0);
    expect(findManyForTwo).toBe(0);

    rawSpy.mockRestore();
    findManySpy.mockRestore();
  });

  it('requires authentication', async () => {
    expect((await api().get('/api/mechanics')).status).toBe(401);
  });
});

describe('GET /api/mechanics/:id', () => {
  it('returns detail with recent bookings', async () => {
    const res = await api().get(`/api/mechanics/${IDS.mechanicA}`).set(auth(tokens.ops));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Asha Mechanic');
    expect(Array.isArray(res.body.data.recentBookings)).toBe(true);
    expect(res.body.data.recentBookings.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await api().get('/api/mechanics/nope').set(auth(tokens.ops));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/mechanics/:id/status', () => {
  it('updates availability', async () => {
    const res = await api()
      .patch(`/api/mechanics/${IDS.mechanicB}/status`)
      .set(auth(tokens.ops))
      .send({ status: 'OFF_DUTY' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('OFF_DUTY');
    await prisma.mechanic.update({ where: { id: IDS.mechanicB }, data: { status: 'AVAILABLE' } });
  });

  it('refuses to take a mechanic off duty while they hold a live booking', async () => {
    // Leaving a dispatched job assigned to someone who has gone home, with no event recording
    // it, is a state the API should not let an operator create by accident.
    const bookingId = 'test_bkg_live_for_offduty';
    await prisma.booking.create({
      data: {
        id: bookingId,
        code: 'BK-97001',
        customerId: IDS.customerA,
        vehicleId: IDS.vehicleA,
        serviceId: IDS.serviceMaintenance,
        mechanicId: IDS.mechanicA,
        status: 'IN_PROGRESS',
        amount: '123.00',
        scheduledAt: new Date(),
      },
    });

    const res = await api()
      .patch(`/api/mechanics/${IDS.mechanicA}/status`)
      .set(auth(tokens.ops))
      .send({ status: 'OFF_DUTY' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/active booking/i);

    await prisma.booking.delete({ where: { id: bookingId } });
  });

  it('rejects an invalid status with 400', async () => {
    const res = await api()
      .patch(`/api/mechanics/${IDS.mechanicA}/status`)
      .set(auth(tokens.ops))
      .send({ status: 'ASLEEP' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/customers', () => {
  it('returns the uniform list envelope', async () => {
    const res = await api().get('/api/customers').set(auth(tokens.ops));
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, total: 2 });
    expect(res.body.data).toHaveLength(2);
  });

  it('paginates independently of the total', async () => {
    const res = await api().get('/api/customers?limit=1').set(auth(tokens.ops));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.totalPages).toBe(2);
  });

  it('searches by name, email and phone', async () => {
    for (const q of ['Ravi', 'ravi@test.local', '9111111111']) {
      const res = await api()
        .get(`/api/customers?search=${encodeURIComponent(q)}`)
        .set(auth(tokens.ops));
      expect(res.body.meta.total, `search "${q}" should match Ravi`).toBe(1);
      expect(res.body.data[0].name).toBe('Ravi Kumar');
    }
  });

  it('reports bookingCount and totalSpent aggregated over the full history', async () => {
    const res = await api().get('/api/customers?search=Ravi').set(auth(tokens.ops));
    const c = res.body.data[0];

    // Ravi owns all 12 completed bookings.
    expect(c.bookingCount).toBeGreaterThanOrEqual(COMPLETED_AMOUNTS.length);
    expect(Number(c.totalSpent)).toBe(COMPLETED_AMOUNTS.reduce((a, b) => a + b, 0));
    expect(c.vehicleCount).toBe(1);
  });

  it('excludes cancelled bookings from totalSpent', async () => {
    // Sunita's only non-pending bookings are one CANCELLED (999.99) and one COMPLETED (50).
    const res = await api().get('/api/customers?search=Sunita').set(auth(tokens.ops));
    const c = res.body.data[0];
    expect(Number(c.totalSpent)).toBe(50);
    expect(c.bookingCount).toBeGreaterThan(1);
  });

  it('rejects an unknown sort column', async () => {
    const res = await api().get('/api/customers?sort=email').set(auth(tokens.ops));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/customers/:id', () => {
  it('returns detail with vehicles and booking history', async () => {
    const res = await api().get(`/api/customers/${IDS.customerA}`).set(auth(tokens.ops));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Ravi Kumar');
    expect(res.body.data.vehicles).toHaveLength(1);
    expect(res.body.data.bookings.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown id', async () => {
    expect((await api().get('/api/customers/nope').set(auth(tokens.ops))).status).toBe(404);
  });
});
