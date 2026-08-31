import { NotFoundError } from '../../shared/errors.js';
import { paginate, type Paginated } from '../../shared/pagination.js';
import * as repo from './customers.repository.js';
import type { ListCustomersQuery } from './customers.schema.js';

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  createdAt: string;
  bookingCount: number;
  vehicleCount: number;
  /** COMPLETED bookings only — cancelled work is not money received. */
  totalSpent: string;
}

export async function list(query: ListCustomersQuery): Promise<Paginated<CustomerRow>> {
  const { rows, total } = await repo.findMany(query);
  const data = rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    city: c.city,
    createdAt: c.createdAt.toISOString(),
    bookingCount: c.bookingCount,
    vehicleCount: c.vehicleCount,
    totalSpent: c.totalSpent,
  }));
  return paginate(data, total, query.page, query.limit);
}

export async function getById(id: string) {
  const customer = await repo.findById(id);
  if (!customer) throw new NotFoundError(`Customer ${id} not found`);
  const totals = await repo.findTotals(id);

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    createdAt: customer.createdAt.toISOString(),
    bookingCount: totals.bookingCount,
    totalSpent: totals.totalSpent,
    vehicles: customer.vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      regNumber: v.regNumber,
    })),
    bookings: customer.bookings.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      amount: b.amount.toString(),
      scheduledAt: b.scheduledAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      service: b.service,
      vehicle: b.vehicle,
      mechanic: b.mechanic,
    })),
  };
}
