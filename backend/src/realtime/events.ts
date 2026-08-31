/**
 * The realtime contract. Event names and payload shapes are defined ONCE here and imported
 * by both the socket server and the frontend client — a renamed string in one place only is
 * the classic way a live dashboard goes quietly stale.
 */
export const SOCKET_EVENTS = {
  BOOKING_UPDATED: 'booking:updated',
  STATS_UPDATED: 'stats:updated',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Rooms clients subscribe to, so a booking update is not broadcast to every connection. */
export const SOCKET_ROOMS = {
  DASHBOARD: 'dashboard',
} as const;

/**
 * The full booking row, matching what GET /api/bookings returns for a single item.
 * Sending the whole row rather than an id spares every connected dashboard a refetch —
 * one write would otherwise fan out into one HTTP request per open browser tab.
 */
export interface BookingUpdatePayload {
  id: string;
  code: string;
  status: string;
  amount: string;
  scheduledAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string; city: string } | null;
  vehicle: { id: string; make: string; model: string; regNumber: string } | null;
  service: { id: string; name: string; category: string } | null;
  mechanic: { id: string; name: string; status: string } | null;
}

export interface StatsUpdatePayload {
  totalBookings: number;
  activeBookings: number;
  availableMechanics: number;
  revenueToday: string;
  generatedAt: string;
}

/** Server → client events. Keys must match SOCKET_EVENTS values. */
export interface ServerToClientEvents {
  'booking:updated': (payload: BookingUpdatePayload) => void;
  'stats:updated': (payload: StatsUpdatePayload) => void;
}

export interface ClientToServerEvents {
  subscribe: (room: string) => void;
  unsubscribe: (room: string) => void;
}
