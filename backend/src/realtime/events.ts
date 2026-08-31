/**
 * The realtime contract. Event names and payload shapes are defined ONCE here and imported
 * by both the socket server and the frontend client — a renamed string in one place only is
 * the classic way a live dashboard goes quietly stale.
 */
export const SOCKET_EVENTS = {
  BOOKING_UPDATE: 'booking:update',
  STATS_UPDATE: 'stats:update',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Rooms clients subscribe to, so a booking update is not broadcast to every connection. */
export const SOCKET_ROOMS = {
  DASHBOARD: 'dashboard',
} as const;

export interface BookingUpdatePayload {
  bookingId: string;
  code: string;
  status: string;
  mechanicId: string | null;
  updatedAt: string;
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
  'booking:update': (payload: BookingUpdatePayload) => void;
  'stats:update': (payload: StatsUpdatePayload) => void;
}

export interface ClientToServerEvents {
  subscribe: (room: string) => void;
  unsubscribe: (room: string) => void;
}
