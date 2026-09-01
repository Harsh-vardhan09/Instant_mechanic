import type { BookingFilters, MechanicFilters } from './api';
import type { AnalyticsRange } from './types';

/**
 * Every query key in one place.
 *
 * List keys embed the FULL filter object, so two different filtered views are two different
 * cache entries. Without that, switching filters can serve the previous view's rows for a
 * frame, and a targeted invalidation can miss the page the operator is actually looking at.
 */
export const queryKeys = {
  dashboard: ['dashboard'] as const,
  bookings: {
    all: ['bookings'] as const,
    list: (filters: BookingFilters) => ['bookings', 'list', filters] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
  },
  mechanics: {
    all: ['mechanics'] as const,
    list: (filters: MechanicFilters) => ['mechanics', 'list', filters] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    bookingsOverTime: (range: AnalyticsRange) =>
      ['analytics', 'bookings-over-time', range] as const,
    revenueOverTime: (range: AnalyticsRange) => ['analytics', 'revenue-over-time', range] as const,
    statusBreakdown: ['analytics', 'status-breakdown'] as const,
    serviceBreakdown: ['analytics', 'service-breakdown'] as const,
  },
};
