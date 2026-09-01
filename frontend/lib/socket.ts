'use client';

import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * One socket for the whole app.
 *
 * React StrictMode mounts effects twice in development, and every dashboard page wants live
 * updates. Without a singleton each of those opens its own connection, and the server would
 * see a handful of sockets per operator.
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(BASE_URL, {
    // The server rejects the handshake without a valid JWT — an open socket would stream
    // customer PII and revenue to anyone who never logged in.
    auth: { token: getToken() ?? '' },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    reconnectionAttempts: Infinity,
  });

  return socket;
}

/** Called on logout: a socket authenticated as the previous user must not survive. */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/**
 * Connection status is external state. Components subscribe to it through
 * useSyncExternalStore instead of mirroring it into React state from an effect.
 */
export function subscribeSocket(onChange: () => void): () => void {
  const s = getSocket();
  s.on("connect", onChange);
  s.on("disconnect", onChange);
  s.on("connect_error", onChange);
  return () => {
    s.off("connect", onChange);
    s.off("disconnect", onChange);
    s.off("connect_error", onChange);
  };
}

export function getSocketConnected(): boolean {
  return getSocket().connected;
}

export const getSocketServerSnapshot = (): boolean => false;
