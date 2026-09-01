import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { closeIo, initIo } from './realtime/io.js';
import { connectPrisma, disconnectPrisma } from './lib/prisma.js';

const app = createApp();
const httpServer = createServer(app);

// REST and websockets share one port — one thing to deploy, one thing to expose on AWS.
initIo(httpServer);

async function startDB(): Promise<void> {
  try {
    await connectPrisma();
  } catch (error) {
    // Not fatal: the API still boots and /api/health reports db:"down", which is far more
    // useful to an operator than a container that exits before it can tell anyone why.
    logger.error({ err: error }, 'initial database connection failed');
  }
}

void startDB();

const server = httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'instant-mechanic api listening');
});

/** Once true, further signals are ignored — a second Ctrl+C should not re-enter shutdown. */
let shuttingDown = false;

/**
 * Graceful shutdown, in the order that actually works.
 *
 * ECS, `docker compose down` and systemd all send SIGTERM and then SIGKILL after a grace
 * period. Without this, that SIGKILL lands mid-request: an operator's dispatch is cut off
 * after the booking row was written but before the response was sent, and they have no way
 * to tell whether it took effect.
 *
 * Order matters. `server.close()` stops accepting NEW connections and then waits for
 * existing ones to end — and socket.io connections never end on their own, so closing the
 * http server first would hang until the forced timeout every single time. So: stop
 * listening, hang up the websockets, drop idle keep-alive sockets, then wait.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  // Backstop. If a request wedges, exit anyway rather than waiting for SIGKILL.
  const forced = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 15_000);
  forced.unref();

  try {
    // 1. Stop accepting new connections. Returns immediately; the callback fires once every
    //    existing connection has closed.
    const closed = new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // 2. Hang up every websocket, so those connections stop holding the server open.
    await closeIo();

    // 3. Release idle keep-alive sockets. In-flight requests are left alone to finish.
    server.closeIdleConnections();

    // 4. Now the server can actually finish closing.
    await closed;

    // 5. Only once nothing can issue another query.
    await disconnectPrisma();

    logger.info('shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal));
}

// A crash that leaves the process running is worse than one that restarts it: the container
// stays "up" while serving errors. Log, then let the orchestrator replace it.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception — exiting');
  void shutdown('uncaughtException');
});
