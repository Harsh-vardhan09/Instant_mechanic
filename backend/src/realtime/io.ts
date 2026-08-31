import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import {
  SOCKET_EVENTS,
  SOCKET_ROOMS,
  type BookingUpdatePayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type StatsUpdatePayload,
} from './events.js';
import { env } from '../config/env.js';
import { verifyToken, type JwtPayload } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

type Io = SocketServer<ClientToServerEvents, ServerToClientEvents>;

/** The authenticated identity attached to a socket after the handshake gate. */
declare module 'socket.io' {
  interface Socket {
    user?: JwtPayload;
  }
}

let io: Io | null = null;

/** Attached to the http server in server.ts, so websockets and REST share one port. */
export function initIo(httpServer: HttpServer): Io {
  if (io) return io;

  io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    // Bounded so a wedged client cannot hold a connection forever.
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });

  /**
   * Handshake gate. An unauthenticated socket is rejected before it joins any room.
   *
   * REST auth does not cover this: socket.io connections bypass express middleware entirely,
   * so without this an attacker who never logs in still receives every booking update —
   * customer names, addresses and revenue — pushed to them live. An open socket is an open door.
   */
  io.use((socket, next) => {
    const raw =
      socket.handshake.auth?.['token'] ??
      socket.handshake.headers.authorization?.replace(/^Bearer /i, '');

    if (typeof raw !== 'string' || raw.length === 0) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      socket.user = verifyToken(raw);
      next();
    } catch {
      // Same generic message for expired, malformed and forged — no oracle here either.
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id, userId: socket.user?.sub }, 'socket connected');
    void socket.join(SOCKET_ROOMS.DASHBOARD);

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  return io;
}

/** Throws rather than silently no-oping, so a missed initIo() is loud. */
function requireIo(): Io {
  if (!io) throw new Error('socket.io not initialised — call initIo(httpServer) first');
  return io;
}

export function emitBookingUpdate(payload: BookingUpdatePayload): void {
  requireIo().to(SOCKET_ROOMS.DASHBOARD).emit(SOCKET_EVENTS.BOOKING_UPDATED, payload);
}

export function emitStatsUpdate(payload: StatsUpdatePayload): void {
  requireIo().to(SOCKET_ROOMS.DASHBOARD).emit(SOCKET_EVENTS.STATS_UPDATED, payload);
}

export async function closeIo(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
