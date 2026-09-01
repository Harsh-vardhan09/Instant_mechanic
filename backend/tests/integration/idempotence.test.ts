import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, getTokens, type Tokens } from '../helpers/app.js';
import { IDS, resetAndSeed } from '../helpers/fixture.js';
import { prisma } from '../../src/lib/prisma.js';

/**
 * DISPATCH IDEMPOTENCE.
 *
 * This is the test that matters most in the suite, so it lives in its own file.
 *
 * The failure it guards against is not abstract: an operator double-clicks "Assign", two
 * requests race, both read "unassigned", both write — and two mechanics drive to one job.
 * That is a callout fee and a wasted hour, per occurrence, caused by a UI event nobody
 * considers unusual.
 *
 * The protection is a UNIQUE index on (bookingId, mechanicId) plus a transaction, NOT an
 * application-level "check then write". A check-then-write cannot fix this: between the read
 * and the write there is a window, and concurrency is precisely the case where that window
 * gets hit. These tests therefore assert on the DATABASE state, not on the response body —
 * a handler could return the right JSON while having written two rows.
 */

let tokens: Tokens;

beforeAll(async () => {
  await resetAndSeed();
  tokens = await getTokens();
});

async function assignmentRows(bookingId: string): Promise<number> {
  return prisma.bookingAssignment.count({ where: { bookingId } });
}

async function assignedEventRows(bookingId: string): Promise<number> {
  return prisma.bookingEvent.count({ where: { bookingId, toStatus: 'ASSIGNED' } });
}

describe('assigning the same mechanic to the same booking twice', () => {
  it('writes exactly ONE assignment row and ONE audit row, and reports the repeat as idempotent', async () => {
    const bookingId = IDS.pendingForAssign;

    expect(await assignmentRows(bookingId)).toBe(0);
    expect(await assignedEventRows(bookingId)).toBe(0);

    // First dispatch — a real state change.
    const first = await api()
      .patch(`/api/bookings/${bookingId}/assign`)
      .set(auth(tokens.ops))
      .send({ mechanicId: IDS.mechanicA });

    expect(first.status).toBe(200);
    expect(first.body.idempotent).toBe(false);
    expect(first.body.data.status).toBe('ASSIGNED');
    expect(first.body.data.mechanic.id).toBe(IDS.mechanicA);

    // Second, identical dispatch — the double click.
    const second = await api()
      .patch(`/api/bookings/${bookingId}/assign`)
      .set(auth(tokens.ops))
      .send({ mechanicId: IDS.mechanicA });

    // 200, not an error: the requested state holds. `idempotent` says nothing was written.
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.data.status).toBe('ASSIGNED');
    expect(second.body.data.mechanic.id).toBe(IDS.mechanicA);

    // The assertions that actually matter — what is in the database.
    expect(await assignmentRows(bookingId)).toBe(1);
    expect(await assignedEventRows(bookingId)).toBe(1);
  });

  it('survives five CONCURRENT identical assigns with exactly one assignment and one audit row', async () => {
    // Sequential repeats can be defended by a check-then-write. Concurrent ones cannot —
    // this is the case the unique index exists for.
    const bookingId = 'test_bkg_race';
    await prisma.booking.create({
      data: {
        id: bookingId,
        code: 'BK-99001',
        customerId: IDS.customerA,
        vehicleId: IDS.vehicleA,
        serviceId: IDS.serviceMaintenance,
        status: 'PENDING',
        amount: '750.00',
        scheduledAt: new Date(),
      },
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        api()
          .patch(`/api/bookings/${bookingId}/assign`)
          .set(auth(tokens.ops))
          .send({ mechanicId: IDS.mechanicB }),
      ),
    );

    // Every caller gets a success — none of them did anything wrong.
    for (const res of responses) expect(res.status).toBe(200);

    // Exactly one of the five actually wrote.
    const wrote = responses.filter((r) => r.body.idempotent === false);
    expect(wrote).toHaveLength(1);

    expect(await assignmentRows(bookingId)).toBe(1);
    expect(await assignedEventRows(bookingId)).toBe(1);

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.mechanicId).toBe(IDS.mechanicB);
    expect(booking?.status).toBe('ASSIGNED');
  });

  it('refuses to silently reassign a booking to a DIFFERENT mechanic', async () => {
    // Quietly redirecting a dispatch is the other way to send the wrong person to a job.
    const res = await api()
      .patch(`/api/bookings/${IDS.pendingForAssign}/assign`)
      .set(auth(tokens.ops))
      .send({ mechanicId: IDS.mechanicB });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    // And the original assignment is untouched.
    const booking = await prisma.booking.findUnique({ where: { id: IDS.pendingForAssign } });
    expect(booking?.mechanicId).toBe(IDS.mechanicA);
    expect(await assignmentRows(IDS.pendingForAssign)).toBe(1);
  });

  it('rejects an unknown mechanic with 400 and writes nothing', async () => {
    const bookingId = IDS.pendingForTransition;
    const before = await assignmentRows(bookingId);

    const res = await api()
      .patch(`/api/bookings/${bookingId}/assign`)
      .set(auth(tokens.ops))
      .send({ mechanicId: 'no_such_mechanic' });

    expect(res.status).toBe(400);
    expect(await assignmentRows(bookingId)).toBe(before);
  });
});
