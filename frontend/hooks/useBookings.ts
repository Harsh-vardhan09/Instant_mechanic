'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type BookingFilters } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useBookings(filters: BookingFilters) {
  return useQuery({
    queryKey: queryKeys.bookings.list(filters),
    queryFn: () => api.bookings(filters),
    // Keeps the previous page on screen while the next one loads, so the table does not
    // collapse to skeletons every time someone pages or types.
    placeholderData: (prev) => prev,
  });
}

export function useBooking(id: string | null) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id ?? ''),
    queryFn: () => api.booking(id as string),
    enabled: Boolean(id),
  });
}
