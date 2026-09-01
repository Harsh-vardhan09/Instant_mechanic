import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auth, getTokens, type Tokens } from '../helpers/app.js';
import { IDS, TOTAL_BOOKINGS, resetAndSeed } from '../helpers/fixture.js';
import { prisma } from '../../src/lib/prisma.js';

let tokens: Tokens;

beforeAll(async () => {
  await resetAndSeed();
  tokens = await getTokens();
});

describe('GET /api/bookings — pagination', () => {
  it('reports meta computed over the full filtered set, not the page', async () => {
    const res = await api().get('/api/bookings?page=1&limit=5').set(auth(tokens.ops));
    expect(res.status).toBe(200);

    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 5,
      // The whole point: `total` is a COUNT over everything matching, not data.length.
      total: TOTAL_BOOKINGS,
      totalPages: Math.ceil(TOTAL_BOOKINGS / 5),
    });
    expect(res.body.meta.total).not.toBe(res.body.data.length);
  });

  it('page 2 returns different rows from page 1', async () => {
    const [p1, p2] = await Promise.all([
      api().get('/api/bookings?page=1&limit=5&sort=amount&order=desc').set(auth(tokens.ops)),
      api().get('/api/bookings?page=2&limit=5&sort=amount&order=desc').set(auth(tokens.ops)),
    ]);

    const ids1 = p1.body.data.map((b: { id: string }) => b.id);
    const ids2 = p2.body.data.map((b: { id: string }) => b.id);

    expect(ids2).toHaveLength(5);
    expect(ids1).not.toEqual(ids2);
    // No overlap at all — an off-by-one in skip would show up as a shared row.
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
  });

  it('caps limit at 100', async () => {
    const res = await api().get('/api/bookings?limit=500').set(auth(tokens.ops));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/bookings — search', () => {
  it('matches on booking code', async () => {
    const res = await api().get('/api/bookings?search=BK-90001').set(auth(tokens.ops));
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].code).toBe('BK-90001');
  });

  it('matches on customer name, case-insensitively', async () => {
    const res = await api().get('/api/bookings?search=ravi').set(auth(tokens.ops));
    expect(res.body.meta.total).toBeGreaterThan(0);
    for (const b of res.body.data) expect(b.customer.name).toBe('Ravi Kumar');
  });

  it('matches on vehicle registration number', async () => {
    const res = await api().get('/api/bookings?search=MH12BB2222').set(auth(tokens.ops));
    expect(res.body.meta.total).toBeGreaterThan(0);
    for (const b of res.body.data) expect(b.vehicle.regNumber).toBe('MH12BB2222');
  });

  it('returns an empty page with total 0 for a search that matches nothing', async () => {
    const res = await api().get('/api/bookings?search=zzz-no-such-thing').set(auth(tokens.ops));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
});

describe('GET /api/bookings — filters', () => {
  it('filters by status', async () => {
    const res = await api().get('/api/bookings?status=CANCELLED').set(auth(tokens.ops));
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].status).toBe('CANCELLED');
  });

  /**
   * Filters must AND, not OR. Combining "status=COMPLETED" with a customer who has no
   * completed bookings has to return nothing — an OR would return everything matching either
   * side, which looks like a working filter until someone trusts the result.
   */
  it('ANDs multiple filters together rather than ORing them', async () => {
    // Customer B owns the cancelled booking, the terminal completed one, and a pending one.
    const completedForB = await api()
      .get(`/api/bookings?status=PENDING&search=Sunita`)
      .set(auth(tokens.ops));
    expect(completedForB.body.meta.total).toBe(1);

    // Now a combination that MUST be empty: Sunita has no ON_THE_WAY bookings.
    const impossible = await api()
      .get('/api/bookings?status=ON_THE_WAY&search=Sunita')
      .set(auth(tokens.ops));
    expect(impossible.body.meta.total).toBe(0);

    // Proof the emptiness comes from the AND, not from either side being empty on its own.
    const byStatusAlone = await api().get('/api/bookings?status=PENDING').set(auth(tokens.ops));
    const bySearchAlone = await api().get('/api/bookings?search=Sunita').set(auth(tokens.ops));
    expect(byStatusAlone.body.meta.total).toBeGreaterThan(1);
    expect(bySearchAlone.body.meta.total).toBeGreaterThan(1);
  });

  it('filters by mechanicId', async () => {
    const res = await api().get(`/api/bookings?mechanicId=${IDS.mechanicA}`).set(auth(tokens.ops));
    expect(res.body.meta.total).toBeGreaterThan(0);
    for (const b of res.body.data) expect(b.mechanic.id).toBe(IDS.mechanicA);
  });

  it('filters by service category', async () => {
    const res = await api().get('/api/bookings?serviceCategory=REPAIR').set(auth(tokens.ops));
    expect(res.body.meta.total).toBeGreaterThan(0);
    for (const b of res.body.data) expect(b.service.category).toBe('REPAIR');
  });

  it('filters by date range', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const res = await api()
      .get(`/api/bookings?dateFrom=${today.toISOString()}`)
      .set(auth(tokens.ops));
    // Only the two PENDING bookings were created today.
    expect(res.body.meta.total).toBe(2);
  });
});

describe('GET /api/bookings — sorting', () => {
  it('sorts by an allowlisted column', async () => {
    const res = await api()
      .get('/api/bookings?sort=amount&order=desc&limit=5')
      .set(auth(tokens.ops));
    const amounts = res.body.data.map((b: { amount: string }) => Number(b.amount));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  /**
   * `sort` is the one request value that would become part of the query's STRUCTURE rather
   * than its parameters. It is checked against an allowlist and rejected, never interpolated.
   */
  it('rejects an unknown sort column with 400 instead of interpolating it', async () => {
    const res = await api().get('/api/bookings?sort=passwordHash').set(auth(tokens.ops));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a SQL-shaped sort value', async () => {
    const res = await api()
      .get('/api/bookings?sort=' + encodeURIComponent('amount; DROP TABLE bookings'))
      .set(auth(tokens.ops));
    expect(res.status).toBe(400);

    // And the table is still there.
    expect(await prisma.booking.count()).toBeGreaterThan(0);
  });
});

describe('GET /api/bookings/:id', () => {
  it('returns the booking with its relations and full timeline', async () => {
    const res = await api().get(`/api/bookings/${IDS.cancelled}`).set(auth(tokens.ops));
    expect(res.status).toBe(200);

    const d = res.body.data;
    expect(d.code).toBe('BK-90900');
    expect(d.customer.name).toBe('Sunita Sharma');
    expect(d.vehicle.regNumber).toBe('MH12BB2222');
    expect(d.service.name).toBe('Engine Repair');
    expect(Array.isArray(d.timeline)).toBe(true);
    expect(d.timeline.length).toBeGreaterThan(0);
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await api().get('/api/bookings/no_such_booking_id').set(auth(tokens.ops));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/bookings/:id/status — the state machine', () => {
  // These mutate, so each test starts from a freshly created booking of its own.
  let bookingId: string;
  let counter = 0;

  beforeEach(async () => {
    counter += 1;
    bookingId = `test_bkg_sm_${counter}`;
    await prisma.booking.create({
      data: {
        id: bookingId,
        code: `BK-980${String(counter).padStart(2, '0')}`,
        customerId: IDS.customerA,
        vehicleId: IDS.vehicleA,
        serviceId: IDS.serviceMaintenance,
        status: 'PENDING',
        amount: '300.00',
        scheduledAt: new Date(),
      },
    });
    await prisma.bookingEvent.create({
      data: { bookingId, fromStatus: null, toStatus: 'PENDING', note: 'created' },
    });
  });

  it('allows PENDING → ASSIGNED via the assign endpoint', async () => {
    const res = await api()
      .patch(`/api/bookings/${bookingId}/assign`)
      .set(auth(tokens.ops))
      .send({ mechanicId: IDS.mechanicA });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ASSIGNED');
  });

  it('rejects PENDING → COMPLETED with 409, naming the legal transitions', async () => {
    const res = await api()
      .patch(`/api/bookings/${bookingId}/status`)
      .set(auth(tokens.ops))
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    // The message has to be actionable — it tells the operator what IS allowed.
    expect(res.body.error.message).toContain('PENDING');
    expect(res.body.error.message).toContain('ASSIGNED');
  });

  it('rejects any transition out of a terminal COMPLETED booking with 409', async () => {
    for (const status of ['PENDING', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'CANCELLED']) {
      const res = await api()
        .patch(`/api/bookings/${IDS.terminalCompleted}/status`)
        .set(auth(tokens.ops))
        .send({ status });

      expect(res.status, `COMPLETED → ${status} must be rejected`).toBe(409);
    }
  });

  it('rejects a status value that is not part of the enum with 400', async () => {
    const res = await api()
      .patch(`/api/bookings/${bookingId}/status`)
      .set(auth(tokens.ops))
      .send({ status: 'BANANA' });
    expect(res.status).toBe(400);
  });

  /**
   * The audit trail is the record of who did what. One transition must leave exactly one row
   * — a duplicate would double-count, a missing one would erase an operator's action.
   */
  it('writes exactly ONE BookingEvent per successful transition', async () => {
    await api()
      .patch(`/api/bookings/${bookingId}/assign`)
      .set(auth(tokens.ops))
      .send({ mechanicId: IDS.mechanicA });

    const walk = ['ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'] as const;
    for (const status of walk) {
      const before = await prisma.bookingEvent.count({ where: { bookingId } });
      const res = await api()
        .patch(`/api/bookings/${bookingId}/status`)
        .set(auth(tokens.ops))
        .send({ status });

      expect(res.status).toBe(200);
      const after = await prisma.bookingEvent.count({ where: { bookingId } });
      expect(after - before, `${status} should add exactly one audit row`).toBe(1);
    }

    // created + assigned + 3 transitions = 5
    expect(await prisma.bookingEvent.count({ where: { bookingId } })).toBe(5);
  });

  it('records the acting operator on the audit row', async () => {
    await api()
      .patch(`/api/bookings/${bookingId}/status`)
      .set(auth(tokens.ops))
      .send({ status: 'CANCELLED', note: 'customer called off' });

    const event = await prisma.bookingEvent.findFirst({
      where: { bookingId, toStatus: 'CANCELLED' },
    });
    expect(event?.actorId).toBe(IDS.ops);
    expect(event?.note).toBe('customer called off');
    expect(event?.fromStatus).toBe('PENDING');
  });

  it('writes no audit row when a transition is rejected', async () => {
    const before = await prisma.bookingEvent.count({ where: { bookingId } });
    await api()
      .patch(`/api/bookings/${bookingId}/status`)
      .set(auth(tokens.ops))
      .send({ status: 'COMPLETED' });
    expect(await prisma.bookingEvent.count({ where: { bookingId } })).toBe(before);
  });
});
