'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AnalyticsRange } from '@/lib/types';

export function useBookingsOverTime(range: AnalyticsRange) {
  return useQuery({
    queryKey: queryKeys.analytics.bookingsOverTime(range),
    queryFn: () => api.bookingsOverTime(range),
  });
}

export function useRevenueOverTime(range: AnalyticsRange) {
  return useQuery({
    queryKey: queryKeys.analytics.revenueOverTime(range),
    queryFn: () => api.revenueOverTime(range),
  });
}

export function useStatusBreakdown() {
  return useQuery({
    queryKey: queryKeys.analytics.statusBreakdown,
    queryFn: api.statusBreakdown,
  });
}

export function useServiceBreakdown() {
  return useQuery({
    queryKey: queryKeys.analytics.serviceBreakdown,
    queryFn: api.serviceBreakdown,
  });
}
