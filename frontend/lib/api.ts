import { clearSession, getToken } from './auth';
import type {
  AnalyticsRange,
  Booking,
  BookingDetail,
  BookingStatus,
  Dashboard,
  Mechanic,
  Paginated,
  RevenuePoint,
  ServiceSlice,
  StatusSlice,
  TimePoint,
  User,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * A failed request, with the HTTP status and the API's own error code preserved.
 *
 * The UI has to tell these apart: 401 means sign in again, 409 is a rule the operator broke
 * and should read, 5xx is ours and worth retrying. Collapsing them into a bare Error throws
 * away the only information that decides what to show.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when retrying might plausibly succeed — decides whether a panel offers Retry. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;

  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    // fetch only rejects on network failure. Surfacing it as status 0 lets a panel say
    // "can't reach the API" instead of rendering blank.
    throw new ApiError(0, 'NETWORK_ERROR', err instanceof Error ? err.message : 'Network error');
  }

  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = body as ApiErrorBody | null;
    // An expired or revoked token must not leave a half-authenticated app running.
    if (res.status === 401 && typeof window !== 'undefined') {
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        // A full reload is deliberate here, not a shortcut: it discards the React Query cache
        // belonging to the signed-out user. router.push would keep that cache in memory.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login';
      }
    }
    throw new ApiError(
      res.status,
      parsed?.error?.code ?? 'UNKNOWN',
      parsed?.error?.message ?? `Request failed with status ${res.status}`,
      parsed?.error?.details,
    );
  }

  return body as T;
}

/** Drops empty values, so the URL only ever carries filters that are actually set. */
export function toQuery(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params) as [string, unknown][]) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface BookingFilters {
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
  search?: string;
  status?: string;
  mechanicId?: string;
  serviceCategory?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MechanicFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  order?: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ data: { user: User; token: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then((r) => r.data),

  me: () => request<{ data: User }>('/api/auth/me').then((r) => r.data),

  dashboard: () => request<{ data: Dashboard }>('/api/dashboard').then((r) => r.data),

  bookings: (f: BookingFilters) => request<Paginated<Booking>>(`/api/bookings${toQuery(f)}`),

  booking: (id: string) =>
    request<{ data: BookingDetail }>(`/api/bookings/${id}`).then((r) => r.data),

  changeStatus: (id: string, status: BookingStatus, note?: string) =>
    request<{ data: Booking }>(`/api/bookings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(note ? { note } : {}) }),
    }).then((r) => r.data),

  assignMechanic: (id: string, mechanicId: string) =>
    request<{ data: Booking; idempotent: boolean }>(`/api/bookings/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ mechanicId }),
    }),

  mechanics: (f: MechanicFilters) => request<Paginated<Mechanic>>(`/api/mechanics${toQuery(f)}`),

  bookingsOverTime: (range: AnalyticsRange) =>
    request<{ data: TimePoint[] }>(`/api/analytics/bookings-over-time?range=${range}`).then(
      (r) => r.data,
    ),

  revenueOverTime: (range: AnalyticsRange) =>
    request<{ data: RevenuePoint[] }>(`/api/analytics/revenue-over-time?range=${range}`).then(
      (r) => r.data,
    ),

  statusBreakdown: () =>
    request<{ data: StatusSlice[] }>('/api/analytics/status-breakdown').then((r) => r.data),

  serviceBreakdown: () =>
    request<{ data: ServiceSlice[] }>('/api/analytics/service-breakdown').then((r) => r.data),
};
