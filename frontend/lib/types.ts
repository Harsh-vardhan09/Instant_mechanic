/** Shapes returned by the instant-mechanic API. Mirrors backend/openapi.yaml. */

export type BookingStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'ON_THE_WAY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ServiceCategory =
  | 'MAINTENANCE'
  | 'REPAIR'
  | 'DIAGNOSTIC'
  | 'EMERGENCY'
  | 'INSPECTION';

export type MechanicStatus = 'AVAILABLE' | 'ON_JOB' | 'OFF_DUTY';

export interface PageMeta {
  page: number;
  limit: number;
  /** COUNT over the full filtered set — not the length of `data`. */
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPS';
  createdAt: string;
}

export interface Booking {
  id: string;
  code: string;
  status: BookingStatus;
  /** Decimal string, never a float. Parse only at the point of display. */
  amount: string;
  scheduledAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string; city: string } | null;
  vehicle: { id: string; make: string; model: string; regNumber: string } | null;
  service: { id: string; name: string; category: ServiceCategory } | null;
  mechanic: { id: string; name: string; status: MechanicStatus } | null;
}

export interface BookingEvent {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  note: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export interface BookingDetail extends Booking {
  timeline: BookingEvent[];
}

export interface Mechanic {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialisation: string;
  status: MechanicStatus;
  rating: string;
  jobsCompleted: number;
  createdAt: string;
  currentBooking: {
    id: string;
    code: string;
    status: BookingStatus;
    scheduledAt: string;
    amount: string;
    customerName: string | null;
    isActive: boolean;
  } | null;
}

export interface DashboardChanges {
  totalBookings: number | null;
  todayBookings: number | null;
  completedBookings: number | null;
  pendingBookings: number | null;
  cancelledBookings: number | null;
  totalRevenue: number | null;
  activeMechanics: null;
  newCustomers: number | null;
}

export interface Dashboard {
  totalBookings: number;
  todayBookings: number;
  completedBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  totalRevenue: string;
  activeMechanics: number;
  newCustomers: number;
  changes: DashboardChanges;
  generatedAt: string;
}

export interface TimePoint {
  date: string;
  count: number;
}
export interface RevenuePoint {
  date: string;
  revenue: string;
}
export interface StatusSlice {
  status: BookingStatus;
  count: number;
  percentage: number;
}
export interface ServiceSlice {
  category: ServiceCategory;
  count: number;
  revenue: string;
}

export type AnalyticsRange = '7d' | '30d' | '90d';

/** Socket payloads — names and shapes come from backend/src/realtime/events.ts. */
export interface StatsUpdate {
  totalBookings: number;
  activeBookings: number;
  availableMechanics: number;
  revenueToday: string;
  generatedAt: string;
}
