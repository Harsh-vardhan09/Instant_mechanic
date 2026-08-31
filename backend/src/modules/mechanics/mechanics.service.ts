import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { paginate, type Paginated } from '../../shared/pagination.js';
import * as repo from './mechanics.repository.js';
import type { ListMechanicsQuery, UpdateMechanicStatusInput } from './mechanics.schema.js';

export interface MechanicRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialisation: string;
  status: string;
  rating: string;
  jobsCompleted: number;
  createdAt: string;
  currentBooking: {
    id: string;
    code: string;
    status: string;
    scheduledAt: string;
    amount: string;
    customerName: string | null;
    /** True when the job is live rather than simply the latest in their history. */
    isActive: boolean;
  } | null;
}

const ACTIVE = new Set(['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS']);

export async function list(query: ListMechanicsQuery): Promise<Paginated<MechanicRow>> {
  const where = repo.buildWhere(query);
  const { rows, total } = await repo.findMany(where, {
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    orderBy: { [query.sort]: query.order },
  });

  // ONE extra query for the whole page, not one per mechanic.
  const current = await repo.findCurrentBookings(rows.map((m) => m.id));
  const byMechanic = new Map(current.map((b) => [b.mechanicId, b]));

  const data = rows.map((m) => {
    const b = byMechanic.get(m.id);
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      specialisation: m.specialisation,
      status: m.status,
      rating: m.rating.toString(),
      jobsCompleted: m.jobsCompleted,
      createdAt: m.createdAt.toISOString(),
      currentBooking: b
        ? {
            id: b.id,
            code: b.code,
            status: b.status,
            scheduledAt: b.scheduledAt.toISOString(),
            amount: b.amount,
            customerName: b.customerName,
            isActive: ACTIVE.has(b.status),
          }
        : null,
    };
  });

  return paginate(data, total, query.page, query.limit);
}

export async function getById(id: string) {
  const mechanic = await repo.findById(id);
  if (!mechanic) throw new NotFoundError(`Mechanic ${id} not found`);

  const recent = await repo.findRecentBookings(id, 20);
  return {
    id: mechanic.id,
    name: mechanic.name,
    email: mechanic.email,
    phone: mechanic.phone,
    specialisation: mechanic.specialisation,
    status: mechanic.status,
    rating: mechanic.rating.toString(),
    jobsCompleted: mechanic.jobsCompleted,
    createdAt: mechanic.createdAt.toISOString(),
    recentBookings: recent.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      amount: b.amount.toString(),
      scheduledAt: b.scheduledAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
      customer: b.customer,
      service: b.service,
      vehicle: b.vehicle,
    })),
  };
}

export async function updateStatus(id: string, input: UpdateMechanicStatusInput) {
  const mechanic = await repo.findById(id);
  if (!mechanic) throw new NotFoundError(`Mechanic ${id} not found`);

  // Going off duty with live jobs would leave those bookings dispatched to nobody, with no
  // event explaining it. Force the jobs to be resolved first.
  if (input.status === 'OFF_DUTY') {
    const active = await repo.countActiveBookings(id);
    if (active > 0) {
      throw new ConflictError(
        `Mechanic has ${active} active booking(s). Complete or cancel them before going off duty.`,
      );
    }
  }

  const updated = await repo.updateStatus(id, input.status);
  return {
    id: updated.id,
    name: updated.name,
    status: updated.status,
    jobsCompleted: updated.jobsCompleted,
  };
}
