'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getSocket,
  getSocketConnected,
  getSocketServerSnapshot,
  subscribeSocket,
} from '@/lib/socket';
import { queryKeys } from '@/lib/query-keys';
import type { Booking } from '@/lib/types';

export interface ActivityItem {
  id: string;
  code: string;
  status: Booking['status'];
  customerName: string | null;
  mechanicName: string | null;
  at: string;
}

const MAX_ACTIVITY = 30;

/**
 * The single realtime subscription for the app.
 *
 * On every event this INVALIDATES the matching React Query keys rather than patching cached
 * data by hand. Hand-patching makes the socket payload and the REST response two independent
 * sources of truth, and they drift the moment either shape changes — the symptom being a row
 * that says one thing in the table and another in the detail sheet. Invalidating keeps the
 * server as the only source of truth.
 *
 * Connection status is READ from the socket via useSyncExternalStore rather than copied into
 * React state, so there is no effect-then-setState cascade and no window where the indicator
 * disagrees with the actual connection.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const connected = useSyncExternalStore(
    subscribeSocket,
    getSocketConnected,
    getSocketServerSnapshot,
  );
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const onBooking = (payload: Booking) => {
      // setState inside an event callback, not in the effect body — this is the "subscribe to
      // an external system and setState in the callback" pattern effects are actually for.
      setActivity((prev) =>
        [
          {
            id: `${payload.id}-${payload.status}-${payload.updatedAt}`,
            code: payload.code,
            status: payload.status,
            customerName: payload.customer?.name ?? null,
            mechanicName: payload.mechanic?.name ?? null,
            at: new Date().toISOString(),
          },
          ...prev,
          // Bounded: a shift left open must not grow this array without limit.
        ].slice(0, MAX_ACTIVITY),
      );

      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(payload.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mechanics.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    };

    const onStats = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    };

    socket.on('booking:updated', onBooking);
    socket.on('stats:updated', onStats);

    return () => {
      socket.off('booking:updated', onBooking);
      socket.off('stats:updated', onStats);
    };
  }, [queryClient]);

  return { connected, activity };
}
